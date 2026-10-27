import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../../src/index.js";
import type { AccessRequest, AccessRule, Condition } from "../../src/index.js";

function rule(
  id: string,
  effect: string,
  subject: string,
  action: string,
  resource: string,
  conditions: Condition[] = [],
): AccessRule {
  return { id, effect, subject, action, resource, conditions };
}

function req(
  subject: string,
  action: string,
  resource: string,
  roles: string[] = [],
  attributes: Record<string, string> = {},
): AccessRequest {
  return { subject, roles, action, resource, attributes };
}

const DENIED = { effect: "deny", ruleId: null };

function allowedBy(id: string) {
  return { effect: "allow", ruleId: id };
}

function assertRefusesNaming(rules: AccessRule[], request: AccessRequest, id: string) {
  assert.throws(
    () => evaluate(rules, request),
    (err: unknown) => err instanceof Error && err.message.includes(id),
  );
}

// Extends "[happy-5] a rule matches when every condition holds": more
// conditions, over every operator, with extra attributes present.
test("[happy-5] a rule with four conditions over all operators matches when all hold", () => {
  const rules = [
    rule("four", "allow", "*", "read", "tasks/42", [
      { attribute: "region", operator: "eq", value: "sg" },
      { attribute: "tier", operator: "in", value: ["silver", "gold", "platinum"] },
      { attribute: "team", operator: "neq", value: "ops" },
      { attribute: "suspended", operator: "absent" },
    ]),
  ];
  for (const tier of ["silver", "gold", "platinum"]) {
    const request = req("u1", "read", "tasks/42", [], {
      region: "sg",
      tier,
      team: "dev",
      extra: "x",
    });
    assert.deepEqual(evaluate(rules, request), allowedBy("four"));
  }
});

// Extends "[happy-5] a rule does not match when any one condition fails":
// each of four conditions failing alone.
test("[happy-5] a rule with four conditions fails when any single one fails", () => {
  const rules = [
    rule("four", "allow", "*", "read", "tasks/42", [
      { attribute: "region", operator: "eq", value: "sg" },
      { attribute: "tier", operator: "in", value: ["gold", "platinum"] },
      { attribute: "team", operator: "neq", value: "ops" },
      { attribute: "suspended", operator: "absent" },
    ]),
  ];
  const good = { region: "sg", tier: "gold", team: "dev" };
  const failures: Record<string, string>[] = [
    { ...good, region: "my" },
    { ...good, tier: "bronze" },
    { ...good, team: "ops" },
    { ...good, suspended: "yes" },
  ];
  for (const attributes of failures) {
    assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/42", [], attributes)), DENIED);
  }
});

// Extends "[happy-5] a rule does not match when any one condition fails":
// "eq" and "in" compare whole values exactly, not substrings or case-folded.
test("[happy-5] eq and in compare whole values exactly", () => {
  const rules = [
    rule("gated", "allow", "*", "read", "tasks/42", [
      { attribute: "region", operator: "eq", value: "sg" },
      { attribute: "tier", operator: "in", value: ["gold", "platinum"] },
    ]),
  ];
  const failing: Record<string, string>[] = [
    { region: "SG", tier: "gold" },
    { region: "sgp", tier: "gold" },
    { region: "s", tier: "gold" },
    { region: " sg", tier: "gold" },
    { region: "sg", tier: "Gold" },
    { region: "sg", tier: "old" },
    { region: "sg", tier: "gold,platinum" },
    { region: "sg", tier: "goldplatinum" },
    { region: "sg", tier: "plat" },
  ];
  for (const attributes of failing) {
    assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/42", [], attributes)), DENIED);
  }
  assert.deepEqual(
    evaluate(rules, req("u1", "read", "tasks/42", [], { region: "sg", tier: "platinum" })),
    allowedBy("gated"),
  );
});

// Extends "[happy-5]": "neq" compares whole values exactly, and an "in" with
// an empty list never holds.
test("[happy-5] neq holds for values differing only in case, and in an empty list never holds", () => {
  const neq = [
    rule("neq", "allow", "*", "read", "tasks/42", [
      { attribute: "region", operator: "neq", value: "sg" },
    ]),
  ];
  for (const region of ["SG", "sgp", ""]) {
    assert.deepEqual(
      evaluate(neq, req("u1", "read", "tasks/42", [], { region })),
      allowedBy("neq"),
    );
  }
  const emptyIn = [
    rule("empty-in", "allow", "*", "read", "tasks/42", [
      { attribute: "region", operator: "in", value: [] },
    ]),
  ];
  for (const region of ["sg", ""]) {
    assert.deepEqual(evaluate(emptyIn, req("u1", "read", "tasks/42", [], { region })), DENIED);
  }
});

// Extends "[happy-5]": several conditions on the same attribute must all
// hold.
test("[happy-5] several conditions on one attribute must all hold", () => {
  const rules = [
    rule("not-sg-or-us", "allow", "*", "read", "tasks/42", [
      { attribute: "region", operator: "neq", value: "sg" },
      { attribute: "region", operator: "neq", value: "us" },
    ]),
  ];
  assert.deepEqual(
    evaluate(rules, req("u1", "read", "tasks/42", [], { region: "jp" })),
    allowedBy("not-sg-or-us"),
  );
  for (const region of ["sg", "us"]) {
    assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/42", [], { region })), DENIED);
  }
});

// Extends "[happy-5]": a condition on a deny rule narrows it, so a broader
// allow decides where the condition fails.
test("[happy-5] a failing condition takes a more specific deny out of the decision", () => {
  const rules = [
    rule("allow-tasks", "allow", "*", "read", "tasks/**"),
    rule("deny-us", "deny", "*", "read", "tasks/42", [
      { attribute: "region", operator: "in", value: ["us", "ca"] },
    ]),
  ];
  assert.deepEqual(
    evaluate(rules, req("u1", "read", "tasks/42", [], { region: "sg" })),
    allowedBy("allow-tasks"),
  );
  assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/42", [], { region: "ca" })), {
    effect: "deny",
    ruleId: "deny-us",
  });
});

// Extends "[boundary-8] with the attribute missing, only the absent condition
// holds": a missing attribute does not count as an empty value.
test("[boundary-8] a missing attribute does not equal or belong to the empty string", () => {
  const request = req("u1", "read", "tasks/42", [], { other: "" });
  const eqEmpty = rule("eq-empty", "allow", "*", "read", "tasks/42", [
    { attribute: "region", operator: "eq", value: "" },
  ]);
  const inEmpty = rule("in-empty", "allow", "*", "read", "tasks/42", [
    { attribute: "region", operator: "in", value: ["", "sg"] },
  ]);
  const neqEmpty = rule("neq-empty", "allow", "*", "read", "tasks/42", [
    { attribute: "region", operator: "neq", value: "" },
  ]);
  assert.deepEqual(evaluate([eqEmpty], request), DENIED);
  assert.deepEqual(evaluate([inEmpty], request), DENIED);
  assert.deepEqual(evaluate([neqEmpty], request), DENIED);
});

// Extends "[boundary-8] with the attribute present and different, neq holds
// and absent does not": an attribute present with an empty value is present.
test("[boundary-8] an attribute present with an empty value is not absent", () => {
  const request = req("u1", "read", "tasks/42", [], { region: "" });
  const absent = rule("absent", "allow", "*", "read", "tasks/42", [
    { attribute: "region", operator: "absent" },
  ]);
  const eqEmpty = rule("eq-empty", "allow", "*", "read", "tasks/42", [
    { attribute: "region", operator: "eq", value: "" },
  ]);
  const inEmpty = rule("in-empty", "allow", "*", "read", "tasks/42", [
    { attribute: "region", operator: "in", value: ["sg", ""] },
  ]);
  const neq = rule("neq", "allow", "*", "read", "tasks/42", [
    { attribute: "region", operator: "neq", value: "sg" },
  ]);
  assert.deepEqual(evaluate([absent], request), DENIED);
  assert.deepEqual(evaluate([eqEmpty], request), allowedBy("eq-empty"));
  assert.deepEqual(evaluate([inEmpty], request), allowedBy("in-empty"));
  assert.deepEqual(evaluate([neq], request), allowedBy("neq"));
});

// Extends "[boundary-8] with the attribute missing, only the absent condition
// holds": attribute names are matched exactly, so a name differing in case
// is missing.
test("[boundary-8] an attribute differing only in name case is missing", () => {
  const request = req("u1", "read", "tasks/42", [], { Region: "sg" });
  const eq = rule("eq", "allow", "*", "read", "tasks/42", [
    { attribute: "region", operator: "eq", value: "sg" },
  ]);
  const absent = rule("absent", "allow", "*", "read", "tasks/42", [
    { attribute: "region", operator: "absent" },
  ]);
  assert.deepEqual(evaluate([eq], request), DENIED);
  assert.deepEqual(evaluate([absent], request), allowedBy("absent"));
});

// Extends "[boundary-8] with the attribute missing, only the absent condition
// holds": names an object inherits are not attributes of the request.
test("[boundary-8] attribute names inherited by plain objects are missing", () => {
  const request = req("u1", "read", "tasks/42", [], { region: "sg" });
  for (const name of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
    const absent = rule("absent-" + name, "allow", "*", "read", "tasks/42", [
      { attribute: name, operator: "absent" },
    ]);
    const neq = rule("neq-" + name, "allow", "*", "read", "tasks/42", [
      { attribute: name, operator: "neq", value: "x" },
    ]);
    assert.deepEqual(evaluate([absent], request), allowedBy("absent-" + name));
    assert.deepEqual(evaluate([neq], request), DENIED);
  }
});

// Extends "[boundary-8]": with all four rules in one list, only the absent
// rule matches when the attribute is missing, and only neq when it differs.
test("[boundary-8] in one list, the absent rule decides when the attribute is missing and neq when it differs", () => {
  const conds: [string, Condition][] = [
    ["eq", { attribute: "region", operator: "eq", value: "sg" }],
    ["neq", { attribute: "region", operator: "neq", value: "sg" }],
    ["in", { attribute: "region", operator: "in", value: ["sg"] }],
    ["absent", { attribute: "region", operator: "absent" }],
  ];
  const rules = conds.map(([id, c]) => rule(id, "allow", "*", "read", "tasks/42", [c]));
  for (const order of [rules, [...rules].reverse()]) {
    assert.deepEqual(
      evaluate(order, req("u1", "read", "tasks/42", [], { tier: "gold" })),
      allowedBy("absent"),
    );
    assert.deepEqual(
      evaluate(order, req("u1", "read", "tasks/42", [], { region: "us" })),
      allowedBy("neq"),
    );
  }
});

// Extends "[unhappy-2] a rule with an unknown operator or effect is refused,
// naming its id": operators that resemble the four, or are names every
// object has.
test("[unhappy-2] operators resembling the four or inherited by objects are refused", () => {
  const request = req("u1", "read", "tasks/42", [], { region: "sg" });
  const operators = [
    "",
    "Eq",
    "eq ",
    "ne",
    "not_in",
    "IN",
    "Absent",
    "present",
    "toString",
    "constructor",
    "hasOwnProperty",
    "__proto__",
  ];
  operators.forEach((operator, i) => {
    const id = `bad-operator-#${i}`;
    assertRefusesNaming(
      [
        rule(id, "allow", "u1", "read", "tasks/42", [
          { attribute: "region", operator, value: "sg" },
        ]),
      ],
      request,
      id,
    );
  });
});

// Extends "[unhappy-2] a rule with an unknown operator or effect is refused,
// naming its id": effects resembling allow or deny.
test("[unhappy-2] effects resembling allow or deny are refused", () => {
  const request = req("u1", "read", "tasks/42");
  const effects = ["", "DENY", "Deny", "allow ", "permit", "block", "toString", "constructor"];
  effects.forEach((effect, i) => {
    const id = `bad-effect-#${i}`;
    assertRefusesNaming([rule(id, effect, "u1", "read", "tasks/42")], request, id);
  });
});

// Extends "[unhappy-2] an invalid rule is refused even when it does not match
// and a valid rule does": the unknown operator is in a later condition, and
// the bad rule sits deep in a long list after a deciding rule.
test("[unhappy-2] an unknown operator in a later condition of a rule deep in the list is refused", () => {
  const valid: AccessRule[] = [];
  for (let i = 0; i < 20; i++) {
    valid.push(rule(`valid-${i}`, i % 2 ? "allow" : "deny", "*", "read", `tasks/${i}`));
  }
  const bad = rule("rule-with-bad-second-condition", "allow", "u9", "write", "projects/1", [
    { attribute: "region", operator: "eq", value: "sg" },
    { attribute: "tier", operator: "between", value: ["a", "z"] },
  ]);
  const request = req("u1", "read", "tasks/3", [], { region: "sg" });
  assertRefusesNaming([...valid, bad], request, "rule-with-bad-second-condition");
  assertRefusesNaming(
    [...valid.slice(0, 10), bad, ...valid.slice(10)],
    request,
    "rule-with-bad-second-condition",
  );
});

// Extends "[unhappy-2]": refusal holds for requests no rule matches, for a
// bad rule that would match, and for a deny rule's bad condition.
test("[unhappy-2] an invalid rule is refused whether or not anything matches", () => {
  const badDeny = rule("deny-with-unknown-op", "deny", "*", "*", "**", [
    { attribute: "region", operator: "matches", value: "s.*" },
  ]);
  const badMatching = rule("matching-bad-effect", "grant", "u1", "read", "tasks/42");
  const other = rule("unrelated", "allow", "u2", "write", "projects/9");
  assertRefusesNaming(
    [other, badDeny],
    req("u3", "delete", "x/y", [], {}),
    "deny-with-unknown-op",
  );
  assertRefusesNaming(
    [badMatching, other],
    req("u1", "read", "tasks/42"),
    "matching-bad-effect",
  );
  assertRefusesNaming([badMatching], req("u5", "write", "elsewhere"), "matching-bad-effect");
});

// Extends "[unhappy-2]": an unknown operator is refused even on an attribute
// the request does not carry.
test("[unhappy-2] an unknown operator on a missing attribute is refused", () => {
  const rules = [
    rule("allow-all", "allow", "*", "*", "**"),
    rule("bad-on-missing", "allow", "*", "*", "**", [
      { attribute: "nowhere", operator: "exists" },
    ]),
  ];
  assertRefusesNaming(rules, req("u1", "read", "tasks/42"), "bad-on-missing");
});
