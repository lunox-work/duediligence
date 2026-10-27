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
  conditions: readonly Condition[] = [],
): AccessRule {
  return { id, effect, subject, action, resource, conditions };
}

function request(
  subject: string,
  roles: readonly string[],
  action: string,
  resource: string,
  attributes: Record<string, string> = {},
): AccessRequest {
  return { subject, roles, action, resource, attributes };
}

const DENY_NONE = { effect: "deny", ruleId: null };

// Extends public "[happy-3] a matching deny overrides an earlier matching allow":
// many matching allows ahead of a single matching deny at the end.
test("[happy-3] a single matching deny at the end overrides many earlier matching allows", () => {
  const rules: AccessRule[] = [];
  for (let i = 0; i < 50; i++) rules.push(rule("allow-" + i, "allow", "*", "*", "**"));
  rules.push(rule("deny-last", "deny", "u1", "write", "projects/7"));
  assert.deepEqual(evaluate(rules, request("u1", [], "write", "projects/7")), {
    effect: "deny",
    ruleId: "deny-last",
  });
});

// Extends public "[happy-3] a matching deny overrides a later matching allow":
// the deny matches by role and wildcards, the allow exactly by subject id.
test("[happy-3] a deny matched by role and wildcards overrides an exact allow, in either order", () => {
  const allowExact = rule("allow-exact", "allow", "u1", "task:read", "tasks/42");
  const denyRole = rule("deny-suspended", "deny", "role:suspended", "task:*", "tasks/*");
  const req = request("u1", ["reviewer", "suspended"], "task:read", "tasks/42");
  assert.deepEqual(evaluate([allowExact, denyRole], req), { effect: "deny", ruleId: "deny-suspended" });
  assert.deepEqual(evaluate([denyRole, allowExact], req), { effect: "deny", ruleId: "deny-suspended" });
});

test("[happy-3] a deny that matches decides even when it is the only matching rule", () => {
  const rules = [
    rule("allow-other", "allow", "u2", "read", "tasks/42"),
    rule("deny-u1", "deny", "u1", "read", "tasks/42"),
  ];
  assert.deepEqual(evaluate(rules, request("u1", [], "read", "tasks/42")), {
    effect: "deny",
    ruleId: "deny-u1",
  });
});

// Shortcut: a deny overriding allows only when it comes first, or only when it is last.
test("[happy-3] a matching deny in the middle overrides allows before and after it", () => {
  const rules = [
    rule("allow-a", "allow", "role:reviewer", "read", "tasks/**"),
    rule("deny-mid", "deny", "*", "read", "tasks/42"),
    rule("allow-b", "allow", "u1", "*", "**"),
  ];
  assert.deepEqual(evaluate(rules, request("u1", ["reviewer"], "read", "tasks/42")), {
    effect: "deny",
    ruleId: "deny-mid",
  });
});

// Extends public "[boundary-4] among several matching deny rules, the first in the list decides":
// the matching denies are separated by allows and preceded by a deny that does not match.
test("[boundary-4] the first matching deny decides, skipping earlier denies that do not match", () => {
  const rules = [
    rule("allow-1", "allow", "*", "*", "**"),
    rule("deny-miss", "deny", "u2", "read", "tasks/42"),
    rule("allow-2", "allow", "u1", "read", "tasks/42"),
    rule("deny-first", "deny", "role:reviewer", "read", "tasks/**"),
    rule("allow-3", "allow", "u1", "read", "**"),
    rule("deny-second", "deny", "u1", "read", "tasks/42"),
    rule("deny-third", "deny", "*", "*", "**"),
  ];
  assert.deepEqual(evaluate(rules, request("u1", ["reviewer"], "read", "tasks/42")), {
    effect: "deny",
    ruleId: "deny-first",
  });
});

// Shortcut: reporting the last matching deny, or the most specific one.
test("[boundary-4] the first matching deny decides even when a later deny is more specific", () => {
  const rules = [
    rule("deny-broad", "deny", "*", "*", "**"),
    rule("deny-exact", "deny", "u1", "read", "tasks/42"),
  ];
  assert.deepEqual(evaluate(rules, request("u1", [], "read", "tasks/42")), {
    effect: "deny",
    ruleId: "deny-broad",
  });
  assert.deepEqual(evaluate([...rules].reverse(), request("u1", [], "read", "tasks/42")), {
    effect: "deny",
    ruleId: "deny-exact",
  });
});

// Extends public "[boundary-4] when only allow rules match, the first matching allow is reported":
// the first allow is the broad one, and denies that fail a condition come before it.
test("[boundary-4] the first matching allow is reported when denies fail on their conditions", () => {
  const rules = [
    rule("deny-cond", "deny", "*", "*", "**", [{ attribute: "region", operator: "eq", value: "us" }]),
    rule("allow-broad", "allow", "*", "*", "**"),
    rule("allow-exact", "allow", "u1", "read", "tasks/42"),
    rule("deny-absent", "deny", "*", "*", "**", [{ attribute: "region", operator: "absent" }]),
  ];
  assert.deepEqual(evaluate(rules, request("u1", [], "read", "tasks/42", { region: "sg" })), {
    effect: "allow",
    ruleId: "allow-broad",
  });
});

test("[boundary-4] the first matching allow is reported among many rules", () => {
  const rules: AccessRule[] = [];
  for (let i = 0; i < 100; i++) rules.push(rule("deny-miss-" + i, "deny", "u" + (i + 2), "read", "tasks/42"));
  for (let i = 0; i < 100; i++) rules.push(rule("allow-miss-" + i, "allow", "u1", "read", "tasks/" + (i + 100)));
  rules.push(rule("allow-hit-1", "allow", "u1", "read", "tasks/*"));
  rules.push(rule("allow-hit-2", "allow", "u1", "read", "tasks/42"));
  assert.deepEqual(evaluate(rules, request("u1", [], "read", "tasks/42")), {
    effect: "allow",
    ruleId: "allow-hit-1",
  });
});

test("[boundary-4] the first matching deny is reported among many rules", () => {
  const rules: AccessRule[] = [];
  for (let i = 0; i < 100; i++) rules.push(rule("allow-" + i, "allow", "*", "read", "**"));
  for (let i = 0; i < 100; i++) rules.push(rule("deny-miss-" + i, "deny", "*", "read", "tasks/" + (i + 100)));
  rules.push(rule("deny-hit-1", "deny", "*", "read", "tasks/42"));
  for (let i = 0; i < 100; i++) rules.push(rule("deny-hit-later-" + i, "deny", "*", "read", "**"));
  assert.deepEqual(evaluate(rules, request("u1", [], "read", "tasks/42")), {
    effect: "deny",
    ruleId: "deny-hit-1",
  });
});

// Extends public "[unhappy-1] rules none of which match deny with no rule id":
// rules that miss on only one part each, including conditions and roles.
test("[unhappy-1] rules that each miss on a single part deny with no rule id", () => {
  const rules = [
    rule("miss-subject", "allow", "u2", "read", "tasks/42"),
    rule("miss-role", "allow", "role:admin", "read", "tasks/42"),
    rule("miss-action", "allow", "u1", "task:*", "tasks/42"),
    rule("miss-resource", "allow", "u1", "read", "tasks/*/submissions"),
    rule("miss-condition", "allow", "u1", "read", "tasks/42", [
      { attribute: "region", operator: "eq", value: "sg" },
    ]),
    rule("miss-deny", "deny", "*", "read", "projects/**"),
  ];
  assert.deepEqual(
    evaluate(rules, request("u1", ["reviewer"], "read", "tasks/42", { region: "us" })),
    DENY_NONE,
  );
});

// Extends public "[unhappy-1] an empty list of rules denies every request":
// more requests with roles, attributes and odd values.
test("[unhappy-1] an empty list of rules denies requests of every shape", () => {
  const requests = [
    request("u1", ["admin", "reviewer"], "task:delete", "tasks/42/submissions/7", { region: "sg" }),
    request("*", [], "read", "*"),
    request("role:admin", ["admin"], "write", "tasks"),
    request("u2", [], "", ""),
  ];
  for (const req of requests) assert.deepEqual(evaluate([], req), DENY_NONE);
});

test("[unhappy-1] only non-matching deny rules still deny with no rule id", () => {
  const rules = [
    rule("deny-a", "deny", "u2", "*", "**"),
    rule("deny-b", "deny", "*", "write", "**"),
  ];
  assert.deepEqual(evaluate(rules, request("u1", [], "read", "tasks/42")), DENY_NONE);
});
