import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, type AccessRequest, type AccessRule } from "../../src/index.js";

function rule(id: string, overrides: Partial<AccessRule> = {}): AccessRule {
  return {
    id,
    effect: "allow",
    subject: "u1",
    action: "read",
    resource: "tasks/42",
    conditions: [],
    ...overrides,
  };
}

function request(): AccessRequest {
  return {
    subject: "u1",
    roles: ["reviewer"],
    action: "read",
    resource: "tasks/42",
    attributes: {},
  };
}

test("[happy-3] a later matching deny overrides an earlier matching allow", () => {
  const allow = rule("reviewer-allow", { subject: "role:reviewer", resource: "tasks/**" });
  const deny = rule("specific-deny", { effect: "deny" });
  assert.deepEqual(evaluate([allow, deny], request()), {
    effect: "deny",
    ruleId: deny.id,
  });
});

test("[happy-3] a matching deny still wins when placed before the allow", () => {
  const allow = rule("reviewer-allow", { subject: "role:reviewer", resource: "tasks/**" });
  const deny = rule("specific-deny", { effect: "deny" });
  assert.deepEqual(evaluate([deny, allow], request()), {
    effect: "deny",
    ruleId: deny.id,
  });
});

test("[happy-3] a deny whose resource or condition fails cannot override an allow", () => {
  const allow = rule("reviewer-allow", { subject: "role:reviewer", resource: "tasks/**" });
  for (const deny of [
    rule("different-resource-deny", { effect: "deny", resource: "tasks/43" }),
    rule("failed-condition-deny", {
      effect: "deny",
      conditions: [{ attribute: "region", operator: "eq", value: "sg" }],
    }),
  ]) {
    for (const rules of [[deny, allow], [allow, deny]]) {
      assert.deepEqual(evaluate(rules, request()), { effect: "allow", ruleId: allow.id });
    }
  }
});

test("[boundary-4] the first matching deny decides even with an earlier allow and unmatched deny", () => {
  const unmatched = rule("unmatched-deny", { effect: "deny", subject: "someone-else" });
  const allow = rule("allow");
  const first = rule("deny-one", { effect: "deny", resource: "tasks/**" });
  const second = rule("deny-two", { effect: "deny" });
  assert.deepEqual(evaluate([unmatched, allow, first, second], request()), {
    effect: "deny",
    ruleId: first.id,
  });
  assert.deepEqual(evaluate([unmatched, allow, second, first], request()), {
    effect: "deny",
    ruleId: second.id,
  });
});

test("[boundary-4] when only allows match the first matching allow decides", () => {
  const unmatched = rule("unmatched-allow", { action: "write" });
  const unmatchedDeny = rule("unmatched-deny", { effect: "deny", subject: "someone-else" });
  const broad = rule("broad-allow", { resource: "tasks/**" });
  const exact = rule("exact-allow");
  assert.deepEqual(evaluate([unmatched, unmatchedDeny, broad, exact], request()), {
    effect: "allow",
    ruleId: broad.id,
  });
  assert.deepEqual(evaluate([unmatched, unmatchedDeny, exact, broad], request()), {
    effect: "allow",
    ruleId: exact.id,
  });
});

test("[unhappy-1] rules that each fail a different part deny with no deciding id", () => {
  const rules = [
    rule("wrong-subject", { subject: "u2" }),
    rule("wrong-action", { action: "write" }),
    rule("wrong-resource", { effect: "deny", resource: "tasks/43" }),
    rule("wrong-condition", {
      conditions: [{ attribute: "region", operator: "eq", value: "sg" }],
    }),
  ];
  assert.deepEqual(evaluate(rules, request()), { effect: "deny", ruleId: null });
});

test("[unhappy-1] an empty rule list denies requests with no deciding id", () => {
  for (const input of [
    request(),
    { ...request(), subject: "visitor", roles: [], action: "write", resource: "other/7" },
  ]) {
    assert.deepEqual(evaluate([], input), { effect: "deny", ruleId: null });
  }
});
