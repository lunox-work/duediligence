import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../../src/index.js";
import type { AccessRequest, AccessRule, Condition } from "../../src/index.js";

function rule(id: string, conditions: readonly Condition[], effect = "allow"): AccessRule {
  return { id, effect, subject: "*", action: "read", resource: "tasks/**", conditions };
}

function request(attributes: Record<string, string>): AccessRequest {
  return { subject: "u1", roles: [], action: "read", resource: "tasks/42", attributes };
}

function matches(r: AccessRule, attributes: Record<string, string>): boolean {
  const decision = evaluate([r], request(attributes));
  return decision.effect === r.effect && decision.ruleId === r.id;
}

function assertThrowsNaming(fn: () => unknown, id: string): void {
  assert.throws(fn, (err: unknown) => {
    if (!(err instanceof Error)) return false;
    assert.ok(err.message.includes(id), `expected message to name ${id}: ${err.message}`);
    return true;
  });
}

const regionAndTier = rule("r-cond", [
  { attribute: "region", operator: "eq", value: "sg" },
  { attribute: "tier", operator: "in", value: ["gold", "platinum"] },
]);

// Extends public "[happy-4] a rule matches when every condition holds":
// three conditions, extra attributes on the request, and a deny rule.
test("[happy-4] a rule with three conditions matches when all hold, ignoring extra attributes", () => {
  const r = rule("r-three", [
    { attribute: "region", operator: "eq", value: "sg" },
    { attribute: "tier", operator: "in", value: ["gold", "platinum", "diamond"] },
    { attribute: "team", operator: "neq", value: "blocked" },
  ]);
  assert.deepEqual(
    evaluate([r], request({ region: "sg", tier: "diamond", team: "core", extra: "x", other: "y" })),
    { effect: "allow", ruleId: "r-three" },
  );
});

test("[happy-4] conditions on a deny rule must all hold for the deny to decide", () => {
  const allow = rule("allow-all", []);
  const deny = rule(
    "deny-cond",
    [
      { attribute: "region", operator: "eq", value: "sg" },
      { attribute: "tier", operator: "in", value: ["free"] },
    ],
    "deny",
  );
  assert.deepEqual(evaluate([allow, deny], request({ region: "sg", tier: "free" })), {
    effect: "deny",
    ruleId: "deny-cond",
  });
  assert.deepEqual(evaluate([allow, deny], request({ region: "sg", tier: "gold" })), {
    effect: "allow",
    ruleId: "allow-all",
  });
  assert.deepEqual(evaluate([allow, deny], request({ region: "us", tier: "free" })), {
    effect: "allow",
    ruleId: "allow-all",
  });
});

// Extends public "[happy-4] a rule does not match when one condition fails":
// the failing condition is the first one, or the last of several.
test("[happy-4] a rule does not match when its first condition fails and the rest hold", () => {
  assert.deepEqual(evaluate([regionAndTier], request({ region: "us", tier: "gold" })), {
    effect: "deny",
    ruleId: null,
  });
});

// Shortcut: checking only the first condition, or matching when any condition holds.
test("[happy-4] a rule does not match when only its last condition fails", () => {
  const r = rule("r-last", [
    { attribute: "a", operator: "eq", value: "1" },
    { attribute: "b", operator: "eq", value: "2" },
    { attribute: "c", operator: "neq", value: "3" },
    { attribute: "d", operator: "in", value: ["4", "5"] },
  ]);
  assert.equal(matches(r, { a: "1", b: "2", c: "x", d: "4" }), true);
  assert.equal(matches(r, { a: "1", b: "2", c: "x", d: "6" }), false);
  assert.equal(matches(r, { a: "1", b: "2", c: "3", d: "5" }), false);
});

test("[happy-4] two conditions on the same attribute must both hold", () => {
  const r = rule("r-same", [
    { attribute: "tier", operator: "in", value: ["gold", "platinum"] },
    { attribute: "tier", operator: "neq", value: "gold" },
  ]);
  assert.equal(matches(r, { tier: "platinum" }), true);
  assert.equal(matches(r, { tier: "gold" }), false);
});

// Shortcut: "in" checked as substring of the joined list, or "eq" as a substring.
test("[happy-4] 'in' and 'eq' compare whole values, not parts of them", () => {
  assert.equal(matches(regionAndTier, { region: "sg", tier: "old" }), false);
  assert.equal(matches(regionAndTier, { region: "sg", tier: "gold,platinum" }), false);
  assert.equal(matches(regionAndTier, { region: "sg", tier: "gold " }), false);
  assert.equal(matches(regionAndTier, { region: "s", tier: "gold" }), false);
  assert.equal(matches(regionAndTier, { region: "sgx", tier: "gold" }), false);
});

test("[happy-4] 'eq', 'neq' and 'in' compare values case-sensitively", () => {
  assert.equal(matches(regionAndTier, { region: "SG", tier: "gold" }), false);
  assert.equal(matches(regionAndTier, { region: "sg", tier: "Gold" }), false);
  const neq = rule("r-neq", [{ attribute: "region", operator: "neq", value: "sg" }]);
  assert.equal(matches(neq, { region: "SG" }), true);
});

test("[happy-4] conditions name attributes case-sensitively", () => {
  assert.equal(matches(regionAndTier, { Region: "sg", Tier: "gold" }), false);
});

test("[happy-4] 'in' matches any member of a longer list, and nothing for an empty list", () => {
  const values: string[] = [];
  for (let i = 0; i < 50; i++) values.push("v" + i);
  const r = rule("r-in-many", [{ attribute: "k", operator: "in", value: values }]);
  assert.equal(matches(r, { k: "v0" }), true);
  assert.equal(matches(r, { k: "v49" }), true);
  assert.equal(matches(r, { k: "v50" }), false);
  const empty = rule("r-in-empty", [{ attribute: "k", operator: "in", value: [] }]);
  assert.equal(matches(empty, { k: "" }), false);
  assert.equal(matches(empty, { k: "v0" }), false);
});

// Extends public "[boundary-5] a missing attribute fails eq, neq and in, and satisfies absent":
// a missing attribute fails "neq" against any value, including the empty string.
test("[boundary-5] a missing attribute fails 'neq' and 'eq' against the empty string", () => {
  const neqEmpty = rule("r-neq-empty", [{ attribute: "region", operator: "neq", value: "" }]);
  const eqEmpty = rule("r-eq-empty", [{ attribute: "region", operator: "eq", value: "" }]);
  const inEmpty = rule("r-in-empty", [{ attribute: "region", operator: "in", value: [""] }]);
  assert.equal(matches(neqEmpty, { tier: "gold" }), false);
  assert.equal(matches(eqEmpty, { tier: "gold" }), false);
  assert.equal(matches(inEmpty, { tier: "gold" }), false);
});

// Shortcut: treating an empty-string value as missing.
test("[boundary-5] an attribute present with the empty string is not absent", () => {
  const absent = rule("r-absent", [{ attribute: "region", operator: "absent" }]);
  const neq = rule("r-neq", [{ attribute: "region", operator: "neq", value: "sg" }]);
  const eqEmpty = rule("r-eq-empty", [{ attribute: "region", operator: "eq", value: "" }]);
  const inEmpty = rule("r-in-empty", [{ attribute: "region", operator: "in", value: ["", "sg"] }]);
  assert.equal(matches(absent, { region: "" }), false);
  assert.equal(matches(neq, { region: "" }), true);
  assert.equal(matches(eqEmpty, { region: "" }), true);
  assert.equal(matches(inEmpty, { region: "" }), true);
});

// Shortcut: looking attributes up on a plain object so inherited names look present.
test("[boundary-5] attribute names shared with object built-ins are missing unless given", () => {
  const absentToString = rule("r-absent-ts", [{ attribute: "toString", operator: "absent" }]);
  const neqCtor = rule("r-neq-ctor", [{ attribute: "constructor", operator: "neq", value: "x" }]);
  const absentProto = rule("r-absent-proto", [{ attribute: "__proto__", operator: "absent" }]);
  assert.equal(matches(absentToString, { region: "sg" }), true);
  assert.equal(matches(neqCtor, { region: "sg" }), false);
  assert.equal(matches(absentProto, {}), true);
  assert.equal(matches(absentToString, { toString: "yes" }), false);
});

// Extends public "[boundary-5] among the four rules, only the absent rule decides a request without the attribute":
// the four rules as deny rules behind a catch-all allow, in another order.
test("[boundary-5] among four deny rules, only the absent one decides a request without the attribute", () => {
  const allow = rule("allow-all", []);
  const absentDeny = rule("d-absent", [{ attribute: "region", operator: "absent" }], "deny");
  const inDeny = rule("d-in", [{ attribute: "region", operator: "in", value: ["sg", "us"] }], "deny");
  const neqDeny = rule("d-neq", [{ attribute: "region", operator: "neq", value: "sg" }], "deny");
  const eqDeny = rule("d-eq", [{ attribute: "region", operator: "eq", value: "sg" }], "deny");
  const rules = [allow, inDeny, neqDeny, eqDeny, absentDeny];
  assert.deepEqual(evaluate(rules, request({ tier: "gold" })), { effect: "deny", ruleId: "d-absent" });
});

// Extends public "[boundary-5] a present, different value satisfies neq and fails absent":
// with the four rules together, the present value decides which ones match.
test("[boundary-5] with region present, the four rules match according to its value", () => {
  const eqRule = rule("r-eq", [{ attribute: "region", operator: "eq", value: "sg" }]);
  const neqRule = rule("r-neq", [{ attribute: "region", operator: "neq", value: "sg" }]);
  const inRule = rule("r-in", [{ attribute: "region", operator: "in", value: ["sg"] }]);
  const absentRule = rule("r-absent", [{ attribute: "region", operator: "absent" }]);
  const four = [absentRule, eqRule, inRule, neqRule];
  assert.deepEqual(evaluate(four, request({ region: "us" })), { effect: "allow", ruleId: "r-neq" });
  assert.deepEqual(evaluate(four, request({ region: "sg" })), { effect: "allow", ruleId: "r-eq" });
  assert.equal(matches(neqRule, { region: "sg" }), false);
  assert.equal(matches(inRule, { region: "sg" }), true);
  assert.equal(matches(absentRule, { region: "sg" }), false);
});

test("[boundary-5] 'absent' only concerns its own attribute", () => {
  const absent = rule("r-absent", [{ attribute: "region", operator: "absent" }]);
  assert.equal(matches(absent, { tier: "gold", team: "core" }), true);
  assert.equal(matches(absent, { region: "sg", tier: "gold" }), false);
});

// Extends public "[unhappy-2] a rule with an unknown condition operator is refused, naming its id":
// other unknown operators, including case variants of the four.
test("[unhappy-2] operators that differ from the four, even only in case, are refused", () => {
  const ops = ["EQ", "Eq", "not-in", "ne", "", "present", "in ", "contains"];
  ops.forEach((op: string, i: number) => {
    const id = "bad-op-" + i;
    const bad = rule(id, [{ attribute: "region", operator: op, value: "sg" }]);
    assertThrowsNaming(() => evaluate([bad], request({ region: "sg" })), id);
  });
});

// Extends public "[unhappy-2] a rule with an unknown effect is refused, naming its id":
// other effects, including case variants, and the rule not first in the list.
test("[unhappy-2] effects other than 'allow' and 'deny', even only in case, are refused", () => {
  const effects = ["Allow", "DENY", "", "allow ", "block"];
  effects.forEach((effect: string, i: number) => {
    const id = "bad-effect-" + i;
    const good = rule("good-" + i, []);
    const bad = rule(id, [], effect);
    assertThrowsNaming(() => evaluate([good, bad], request({})), id);
  });
});

// Shortcut: stopping at the first matching deny before validating the rest of the list.
test("[unhappy-2] an invalid rule after a matching deny is still refused", () => {
  const deny = rule("deny-first", [], "deny");
  const bad = rule("bad-after-deny", [{ attribute: "region", operator: "matches", value: "s.*" }]);
  assertThrowsNaming(() => evaluate([deny, bad], request({})), "bad-after-deny");
  const badEffect = rule("bad-effect-after-deny", [], "maybe");
  assertThrowsNaming(() => evaluate([deny, badEffect], request({})), "bad-effect-after-deny");
});

// Shortcut: validating operators only while evaluating conditions, which stop at the first failure.
test("[unhappy-2] an unknown operator after a failing condition in the same rule is refused", () => {
  const bad = rule("bad-second-condition", [
    { attribute: "region", operator: "eq", value: "us" },
    { attribute: "tier", operator: "gte", value: "gold" },
  ]);
  assertThrowsNaming(() => evaluate([bad], request({ region: "sg", tier: "gold" })), "bad-second-condition");
});

// Extends public "[unhappy-2] an invalid rule is refused even when it does not match and another rule does":
// the invalid rule has a bad effect and comes first, and the list is long.
test("[unhappy-2] an invalid rule anywhere in a long list is refused for any request", () => {
  const rules: AccessRule[] = [];
  for (let i = 0; i < 30; i++) rules.push(rule("ok-" + i, []));
  rules.splice(17, 0, {
    id: "bad-in-middle",
    effect: "grant",
    subject: "nobody",
    action: "write",
    resource: "elsewhere",
    conditions: [],
  });
  assertThrowsNaming(() => evaluate(rules, request({ region: "sg" })), "bad-in-middle");
  assertThrowsNaming(
    () =>
      evaluate(rules, {
        subject: "u2",
        roles: ["admin"],
        action: "delete",
        resource: "projects/1",
        attributes: {},
      }),
    "bad-in-middle",
  );
});

test("[unhappy-2] an invalid rule placed first and never matching is still refused", () => {
  const bad: AccessRule = {
    id: "bad-first-unmatched",
    effect: "deny",
    subject: "role:nobody",
    action: "none",
    resource: "none",
    conditions: [{ attribute: "x", operator: "like", value: "y" }],
  };
  const good = rule("good", []);
  assertThrowsNaming(() => evaluate([bad, good], request({})), "bad-first-unmatched");
});
