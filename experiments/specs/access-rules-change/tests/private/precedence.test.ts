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

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) out.push([item, ...p]);
  });
  return out;
}

const DENIED = { effect: "deny", ruleId: null };

// Extends "[happy-3] a more specific allow overrides a broader deny" and
// "[happy-3] the decisions do not depend on the order of the two rules":
// four nested levels of alternating effect, in every order.
test("[happy-3] nested rules of alternating effect decide by specificity in every order", () => {
  const rules = [
    rule("deny-all", "deny", "*", "read", "**"),
    rule("allow-tasks", "allow", "*", "read", "tasks/**"),
    rule("deny-42", "deny", "*", "read", "tasks/42/**"),
    rule("allow-sub-7", "allow", "u1", "read", "tasks/42/submissions/7"),
  ];
  const expected: [string, { effect: string; ruleId: string }][] = [
    ["projects/1", { effect: "deny", ruleId: "deny-all" }],
    ["tasks/43", { effect: "allow", ruleId: "allow-tasks" }],
    ["tasks", { effect: "allow", ruleId: "allow-tasks" }],
    ["tasks/42", { effect: "deny", ruleId: "deny-42" }],
    ["tasks/42/submissions/8", { effect: "deny", ruleId: "deny-42" }],
    ["tasks/42/submissions/7", { effect: "allow", ruleId: "allow-sub-7" }],
  ];
  for (const order of permutations(rules)) {
    for (const [resource, decision] of expected) {
      assert.deepEqual(evaluate(order, req("u1", "read", resource)), decision);
    }
  }
});

// Extends "[happy-3]": the specific allow only decides for the subject it
// names; others fall back to the broader deny.
test("[happy-3] a specific allow for one subject leaves other subjects under the broader deny", () => {
  const broadDeny = rule("broad-deny", "deny", "*", "*", "projects/**");
  const narrowAllow = rule("narrow-allow", "allow", "u9", "write", "projects/5/files/a");
  for (const rules of [[broadDeny, narrowAllow], [narrowAllow, broadDeny]]) {
    assert.deepEqual(evaluate(rules, req("u9", "write", "projects/5/files/a")), {
      effect: "allow",
      ruleId: "narrow-allow",
    });
    assert.deepEqual(evaluate(rules, req("u8", "write", "projects/5/files/a")), {
      effect: "deny",
      ruleId: "broad-deny",
    });
    assert.deepEqual(evaluate(rules, req("u9", "read", "projects/5/files/a")), {
      effect: "deny",
      ruleId: "broad-deny",
    });
  }
});

// Extends "[happy-4] a more specific deny overrides a broader allow": a deny
// two levels more specific, among several broad allows, in every order.
test("[happy-4] a specific deny overrides several broader allows in every order", () => {
  const rules = [
    rule("allow-any", "allow", "*", "*", "**"),
    rule("allow-reviewer", "allow", "role:reviewer", "read", "tasks/**"),
    rule("allow-u1", "allow", "u1", "*", "tasks/*/submissions/*"),
    rule("deny-u1", "deny", "u1", "read", "tasks/42/submissions/7"),
  ];
  const request = req("u1", "read", "tasks/42/submissions/7", ["reviewer"]);
  for (const order of permutations(rules)) {
    assert.deepEqual(evaluate(order, request), { effect: "deny", ruleId: "deny-u1" });
  }
  // Where the deny does not match, the most specific allow decides.
  for (const order of permutations(rules)) {
    assert.deepEqual(
      evaluate(order, req("u1", "read", "tasks/42/submissions/8", ["reviewer"])),
      { effect: "allow", ruleId: "allow-u1" },
    );
  }
});

// Extends "[boundary-4] more literal resource segments beat fewer": literal
// segments count, not the total number of segments.
test("[boundary-4] literal segments count, not total segments", () => {
  const rules = [
    rule("deny-many-wild", "deny", "*", "read", "tasks/*/*/*"),
    rule("allow-two-literal", "allow", "*", "read", "tasks/42/**"),
  ];
  for (const order of [rules, [...rules].reverse()]) {
    assert.deepEqual(evaluate(order, req("u1", "read", "tasks/42/a/b")), {
      effect: "allow",
      ruleId: "allow-two-literal",
    });
  }
});

// Extends "[boundary-4] more literal resource segments beat fewer": literal
// segments count, not the length of the pattern text.
test("[boundary-4] literal segments count, not the length of the pattern", () => {
  const rules = [
    rule("deny-long", "deny", "*", "read", "organisations/**"),
    rule("allow-short", "allow", "*", "read", "*/a/b"),
  ];
  for (const order of [rules, [...rules].reverse()]) {
    assert.deepEqual(evaluate(order, req("u1", "read", "organisations/a/b")), {
      effect: "allow",
      ruleId: "allow-short",
    });
  }
});

// Extends "[boundary-4] wildcards count for nothing, so equal literal counts
// tie and deny wins": a "**" in the middle counts for nothing, and the
// higher-count rule wins regardless of effect or order.
test("[boundary-4] a middle multi-segment wildcard counts for nothing", () => {
  const tie = [
    rule("allow-3", "allow", "*", "read", "a/*/b/c"),
    rule("deny-3", "deny", "*", "read", "a/**/b/c"),
  ];
  for (const order of [tie, [...tie].reverse()]) {
    assert.deepEqual(evaluate(order, req("u1", "read", "a/x/b/c")), {
      effect: "deny",
      ruleId: "deny-3",
    });
  }

  const allowWins = [
    rule("deny-2", "deny", "*", "read", "a/**/c"),
    rule("allow-3", "allow", "*", "read", "a/x/*/c"),
  ];
  for (const order of [allowWins, [...allowWins].reverse()]) {
    assert.deepEqual(evaluate(order, req("u1", "read", "a/x/y/c")), {
      effect: "allow",
      ruleId: "allow-3",
    });
  }
});

// Extends "[boundary-4]": a fully literal pattern beats every wildcard one.
test("[boundary-4] the rule with the most literal segments wins among many", () => {
  const rules = [
    rule("deny-0", "deny", "*", "read", "**"),
    rule("deny-1", "deny", "*", "read", "p/**"),
    rule("deny-2", "deny", "*", "read", "p/*/r/*/*"),
    rule("deny-3", "deny", "*", "read", "p/q/r/**"),
    rule("deny-4", "deny", "*", "read", "p/q/r/s/*"),
    rule("allow-5", "allow", "*", "read", "p/q/r/s/t"),
  ];
  for (const order of [rules, [...rules].reverse()]) {
    assert.deepEqual(evaluate(order, req("u1", "read", "p/q/r/s/t")), {
      effect: "allow",
      ruleId: "allow-5",
    });
    assert.deepEqual(evaluate(order, req("u1", "read", "p/q/r/s/u")), {
      effect: "deny",
      ruleId: "deny-4",
    });
  }
});

// Extends "[boundary-5] a broad subject, action and no conditions do not lose
// to narrower ones on a less specific resource": many conditions on the less
// specific rule do not lift it.
test("[boundary-5] many conditions do not make a less specific rule win", () => {
  const rules = [
    rule("deny-cond", "deny", "u1", "read", "tasks/*", [
      { attribute: "region", operator: "eq", value: "sg" },
      { attribute: "tier", operator: "in", value: ["gold"] },
      { attribute: "flag", operator: "absent" },
      { attribute: "team", operator: "neq", value: "ops" },
    ]),
    rule("allow-plain", "allow", "*", "*", "tasks/42"),
  ];
  const request = req("u1", "read", "tasks/42", ["reviewer"], {
    region: "sg",
    tier: "gold",
    team: "dev",
  });
  for (const order of [rules, [...rules].reverse()]) {
    assert.deepEqual(evaluate(order, request), { effect: "allow", ruleId: "allow-plain" });
  }
});

// Extends "[boundary-5] a narrower subject, action and conditions do not
// break a resource tie": the allow is narrower on every part but resource.
test("[boundary-5] an allow narrower on subject, action and conditions still ties with a broad deny", () => {
  const rules = [
    rule("allow-narrow", "allow", "u1", "task:read", "tasks/*", [
      { attribute: "region", operator: "eq", value: "sg" },
      { attribute: "tier", operator: "eq", value: "gold" },
    ]),
    rule("deny-broad", "deny", "role:reviewer", "task:*", "*/42"),
  ];
  const request = req("u1", "task:read", "tasks/42", ["reviewer"], {
    region: "sg",
    tier: "gold",
  });
  for (const order of [rules, [...rules].reverse()]) {
    assert.deepEqual(evaluate(order, request), { effect: "deny", ruleId: "deny-broad" });
  }
});

// Extends "[boundary-7] the first of the most specific allows decides ...":
// among equally specific allows, a narrower subject, action or condition
// (scenario boundary-5) does not take precedence over the list order.
test("[boundary-7] a narrower subject or action does not outrank list order among equal allows", () => {
  const broad = rule("allow-broad", "allow", "*", "*", "tasks/42");
  const narrow = rule("allow-narrow", "allow", "u1", "read", "tasks/42", [
    { attribute: "region", operator: "eq", value: "sg" },
  ]);
  const request = req("u1", "read", "tasks/42", [], { region: "sg" });
  assert.deepEqual(evaluate([broad, narrow], request), {
    effect: "allow",
    ruleId: "allow-broad",
  });
  assert.deepEqual(evaluate([narrow, broad], request), {
    effect: "allow",
    ruleId: "allow-narrow",
  });
});

// Extends "[boundary-6] among equally specific matching rules, deny beats
// allow in either order": one deny among several equal allows, at any
// position.
test("[boundary-6] one equally specific deny beats several allows wherever it stands", () => {
  const allows = [
    rule("allow-a", "allow", "*", "read", "tasks/*"),
    rule("allow-b", "allow", "u1", "*", "*/42"),
    rule("allow-c", "allow", "role:reviewer", "read", "tasks/**"),
  ];
  const deny = rule("deny-d", "deny", "*", "*", "**/42");
  const request = req("u1", "read", "tasks/42", ["reviewer"]);
  for (let i = 0; i <= allows.length; i++) {
    const rules = [...allows.slice(0, i), deny, ...allows.slice(i)];
    assert.deepEqual(evaluate(rules, request), { effect: "deny", ruleId: "deny-d" });
  }
});

// Extends "[boundary-6]": the tie is at zero literal segments.
test("[boundary-6] deny beats allow at zero literal segments in either order", () => {
  const allow = rule("allow-0", "allow", "*", "*", "*/*");
  const deny = rule("deny-0", "deny", "*", "*", "**");
  for (const rules of [[allow, deny], [deny, allow]]) {
    assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/42")), {
      effect: "deny",
      ruleId: "deny-0",
    });
  }
});

// Extends "[boundary-6] an equally specific deny that does not match does not
// beat the allow": a tied deny loses to a more specific allow.
test("[boundary-6] a tie between deny and allow is decided only at the highest specificity", () => {
  const rules = [
    rule("deny-1", "deny", "*", "read", "tasks/*"),
    rule("allow-1", "allow", "*", "read", "*/42"),
    rule("allow-2", "allow", "u1", "read", "tasks/42"),
  ];
  for (const order of permutations(rules)) {
    assert.deepEqual(evaluate(order, req("u1", "read", "tasks/42")), {
      effect: "allow",
      ruleId: "allow-2",
    });
    assert.deepEqual(evaluate(order, req("u2", "read", "tasks/42")), {
      effect: "deny",
      ruleId: "deny-1",
    });
  }
});

// Extends "[boundary-7] among equally specific denies, the first in the list
// decides": many denies, the first of them wherever it stands.
test("[boundary-7] the first of several equally specific denies decides, in any order", () => {
  const rules = [
    rule("deny-p", "deny", "*", "read", "tasks/*"),
    rule("deny-q", "deny", "u1", "*", "*/42"),
    rule("allow-r", "allow", "*", "*", "tasks/*"),
    rule("deny-s", "deny", "role:reviewer", "read", "**/42"),
  ];
  const request = req("u1", "read", "tasks/42", ["reviewer"]);
  for (const order of permutations(rules)) {
    const firstDeny = order.find((r) => r.effect === "deny");
    assert.deepEqual(evaluate(order, request), {
      effect: "deny",
      ruleId: firstDeny?.id,
    });
  }
});

// Extends "[boundary-7] the first of the most specific allows decides, and
// an earlier less specific rule never does": many allows at several levels.
test("[boundary-7] the first of the most specific allows decides among allows at several levels", () => {
  const rules = [
    rule("allow-0", "allow", "*", "*", "**"),
    rule("allow-1a", "allow", "*", "read", "tasks/**"),
    rule("allow-2a", "allow", "*", "*", "tasks/*/submissions"),
    rule("allow-1b", "allow", "u1", "read", "**/submissions"),
    rule("allow-2b", "allow", "u1", "read", "*/42/submissions"),
    rule("allow-2c", "allow", "role:reviewer", "*", "tasks/42/*"),
  ];
  const request = req("u1", "read", "tasks/42/submissions", ["reviewer"]);
  assert.deepEqual(evaluate(rules, request), { effect: "allow", ruleId: "allow-2a" });
  assert.deepEqual(evaluate([...rules].reverse(), request), {
    effect: "allow",
    ruleId: "allow-2c",
  });
  const withoutFirst = rules.filter((r) => r.id !== "allow-2a");
  assert.deepEqual(evaluate(withoutFirst, request), {
    effect: "allow",
    ruleId: "allow-2b",
  });
});

// Extends "[boundary-7]": the first-listed matching rule never decides over a
// more specific later one, for denies as well as allows.
test("[boundary-7] an earlier less specific deny never decides over later more specific denies", () => {
  const rules = [
    rule("deny-1", "deny", "*", "*", "tasks/**"),
    rule("deny-0", "deny", "*", "*", "**"),
    rule("deny-3a", "deny", "*", "read", "tasks/42/submissions/*"),
    rule("deny-3b", "deny", "u1", "read", "tasks/42/*/7"),
    rule("allow-2", "allow", "u1", "read", "tasks/42/**"),
  ];
  assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/42/submissions/7")), {
    effect: "deny",
    ruleId: "deny-3a",
  });
});

// Extends "[boundary-7]": the first matching rule in the list is reported,
// not the first rule of the most specific level that would match on
// resource alone.
test("[boundary-7] an earlier equally specific rule that does not match is skipped", () => {
  const rules = [
    rule("deny-other-subject", "deny", "u2", "read", "tasks/42"),
    rule("deny-failing-cond", "deny", "*", "read", "tasks/42", [
      { attribute: "region", operator: "eq", value: "us" },
    ]),
    rule("deny-match", "deny", "*", "read", "tasks/42"),
    rule("deny-later", "deny", "u1", "*", "tasks/42"),
  ];
  const request = req("u1", "read", "tasks/42", [], { region: "sg" });
  assert.deepEqual(evaluate(rules, request), { effect: "deny", ruleId: "deny-match" });
});

// Extends "[unhappy-1] a request no rule matches is denied with no rule id":
// non-matching deny rules are not reported, and each rule misses on exactly
// one part.
test("[unhappy-1] rules that each miss on one part, including denies, leave no rule id", () => {
  const rules = [
    rule("deny-subject", "deny", "u2", "read", "tasks/42"),
    rule("deny-action", "deny", "u1", "write", "tasks/42"),
    rule("deny-resource", "deny", "u1", "read", "tasks/43"),
    rule("deny-role", "deny", "role:admin", "read", "tasks/42"),
    rule("deny-cond", "deny", "u1", "read", "tasks/42", [
      { attribute: "region", operator: "eq", value: "us" },
    ]),
    rule("allow-cond", "allow", "*", "*", "**", [
      { attribute: "region", operator: "absent" },
    ]),
    rule("allow-prefix", "allow", "*", "write*", "**"),
    rule("allow-segments", "allow", "*", "*", "tasks/*/*"),
  ];
  assert.deepEqual(
    evaluate(rules, req("u1", "read", "tasks/42", ["reviewer"], { region: "sg" })),
    DENIED,
  );
});

// Extends "[unhappy-1] an empty list of rules denies every request": many
// varied requests.
test("[unhappy-1] an empty list of rules denies many varied requests", () => {
  const subjects = ["u1", "admin", "*", "role:admin"];
  const actions = ["*", "read", "task:*", ""];
  const resources = ["**", "*", "tasks/42", "a/b/c/d/e"];
  for (const subject of subjects) {
    for (const action of actions) {
      for (const resource of resources) {
        const request = req(subject, action, resource, ["admin", "*"], { region: "sg" });
        assert.deepEqual(evaluate([], request), DENIED);
      }
    }
  }
});
