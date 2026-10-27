import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../../src/index.js";
import type { AccessRequest, AccessRule } from "../../src/index.js";

function rule(
  id: string,
  effect: string,
  subject: string,
  action: string,
  resource: string,
): AccessRule {
  return { id, effect, subject, action, resource, conditions: [] };
}

function request(
  subject: string,
  roles: readonly string[],
  action: string,
  resource: string,
): AccessRequest {
  return { subject, roles, action, resource, attributes: {} };
}

const allowReviewers = rule("allow-rev", "allow", "role:reviewer", "read", "tasks/**");
const denyU1 = rule("deny-u1", "deny", "u1", "read", "tasks/42");

test("[happy-3] a matching deny overrides an earlier matching allow", () => {
  assert.deepEqual(
    evaluate([allowReviewers, denyU1], request("u1", ["reviewer"], "read", "tasks/42")),
    { effect: "deny", ruleId: "deny-u1" },
  );
});

test("[happy-3] a matching deny overrides a later matching allow", () => {
  assert.deepEqual(
    evaluate([denyU1, allowReviewers], request("u1", ["reviewer"], "read", "tasks/42")),
    { effect: "deny", ruleId: "deny-u1" },
  );
});

test("[boundary-4] among several matching deny rules, the first in the list decides", () => {
  const rules = [
    rule("allow-any", "allow", "*", "*", "**"),
    rule("deny-a", "deny", "u1", "read", "tasks/*"),
    rule("deny-b", "deny", "*", "read", "tasks/42"),
  ];
  assert.deepEqual(evaluate(rules, request("u1", [], "read", "tasks/42")), {
    effect: "deny",
    ruleId: "deny-a",
  });
});

test("[boundary-4] when only allow rules match, the first matching allow is reported", () => {
  const rules = [
    rule("deny-other", "deny", "u2", "read", "tasks/42"),
    rule("allow-skip", "allow", "*", "write", "tasks/42"),
    rule("allow-a", "allow", "u1", "read", "tasks/**"),
    rule("allow-b", "allow", "*", "*", "**"),
  ];
  assert.deepEqual(evaluate(rules, request("u1", [], "read", "tasks/42")), {
    effect: "allow",
    ruleId: "allow-a",
  });
});

test("[unhappy-1] rules none of which match deny with no rule id", () => {
  const rules = [
    rule("allow-u2", "allow", "u2", "read", "tasks/42"),
    rule("allow-write", "allow", "u1", "write", "tasks/42"),
    rule("deny-other", "deny", "u1", "read", "tasks/43"),
  ];
  assert.deepEqual(evaluate(rules, request("u1", [], "read", "tasks/42")), {
    effect: "deny",
    ruleId: null,
  });
});

test("[unhappy-1] an empty list of rules denies every request", () => {
  assert.deepEqual(evaluate([], request("u1", [], "read", "tasks/42")), {
    effect: "deny",
    ruleId: null,
  });
  assert.deepEqual(evaluate([], request("admin", ["admin"], "*", "**")), {
    effect: "deny",
    ruleId: null,
  });
});
