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

function resourceMatches(pattern: string, resource: string): boolean {
  const decision = evaluate(
    [rule("r-res", "allow", "*", "read", pattern)],
    request("u1", [], "read", resource),
  );
  return decision.effect === "allow" && decision.ruleId === "r-res";
}

function actionMatches(pattern: string, action: string): boolean {
  const decision = evaluate(
    [rule("r-act", "allow", "*", pattern, "tasks/42")],
    request("u1", [], action, "tasks/42"),
  );
  return decision.effect === "allow" && decision.ruleId === "r-act";
}

test("[happy-1] an exact rule allows the matching request, by that rule", () => {
  const rules = [rule("r1", "allow", "u1", "read", "tasks/42")];
  assert.deepEqual(evaluate(rules, request("u1", [], "read", "tasks/42")), {
    effect: "allow",
    ruleId: "r1",
  });
});

test("[happy-1] an exact rule does not allow another subject", () => {
  const rules = [rule("r1", "allow", "u1", "read", "tasks/42")];
  assert.deepEqual(evaluate(rules, request("u2", [], "read", "tasks/42")), {
    effect: "deny",
    ruleId: null,
  });
});

test("[happy-2] a role pattern matches a subject that lists the role", () => {
  const rules = [rule("r-rev", "allow", "role:reviewer", "read", "tasks/**")];
  assert.deepEqual(
    evaluate(rules, request("u9", ["reviewer"], "read", "tasks/42/submissions/7")),
    { effect: "allow", ruleId: "r-rev" },
  );
});

test("[happy-2] the same request without the role is denied with no rule", () => {
  const rules = [rule("r-rev", "allow", "role:reviewer", "read", "tasks/**")];
  assert.deepEqual(
    evaluate(rules, request("u9", [], "read", "tasks/42/submissions/7")),
    { effect: "deny", ruleId: null },
  );
});

test("[boundary-1] a single '*' segment matches exactly one segment", () => {
  assert.equal(resourceMatches("tasks/*/submissions", "tasks/42/submissions"), true);
});

test("[boundary-1] a single '*' segment does not match zero, two, or trailing extra segments", () => {
  assert.equal(resourceMatches("tasks/*/submissions", "tasks/42/43/submissions"), false);
  assert.equal(resourceMatches("tasks/*/submissions", "tasks/submissions"), false);
  assert.equal(resourceMatches("tasks/*/submissions", "tasks/42/submissions/7"), false);
});

test("[boundary-1] a trailing '**' matches zero or more segments", () => {
  assert.equal(resourceMatches("tasks/**", "tasks"), true);
  assert.equal(resourceMatches("tasks/**", "tasks/42"), true);
  assert.equal(resourceMatches("tasks/**", "tasks/42/submissions/7"), true);
});

test("[boundary-1] a leading '**' matches zero or more segments", () => {
  assert.equal(resourceMatches("**/submissions", "submissions"), true);
  assert.equal(resourceMatches("**/submissions", "tasks/42/submissions"), true);
});

test("[boundary-2] an action prefix matches actions starting with it, including the bare prefix", () => {
  assert.equal(actionMatches("task:*", "task:read"), true);
  assert.equal(actionMatches("task:*", "task:"), true);
});

test("[boundary-2] an action prefix does not match a shorter or different action", () => {
  assert.equal(actionMatches("task:*", "task"), false);
  assert.equal(actionMatches("task:*", "tasks:read"), false);
});

test("[boundary-2] an exact action matches only itself, and '*' matches any action", () => {
  assert.equal(actionMatches("read", "read"), true);
  assert.equal(actionMatches("read", "reads"), false);
  assert.equal(actionMatches("read", "rea"), false);
  assert.equal(actionMatches("*", "read"), true);
  assert.equal(actionMatches("*", "task:write"), true);
});

test("[boundary-3] matching on role, action and resource is case-sensitive", () => {
  const rules = [rule("r-case", "allow", "role:Admin", "Read", "Tasks/**")];
  assert.deepEqual(evaluate(rules, request("u1", ["admin"], "read", "tasks/42")), {
    effect: "deny",
    ruleId: null,
  });
});

test("[boundary-3] the same rule allows a request with the exact casing", () => {
  const rules = [rule("r-case", "allow", "role:Admin", "Read", "Tasks/**")];
  assert.deepEqual(evaluate(rules, request("u1", ["Admin"], "Read", "Tasks/42")), {
    effect: "allow",
    ruleId: "r-case",
  });
});

test("[boundary-3] a resource with a trailing slash is not the resource without it", () => {
  assert.equal(resourceMatches("tasks/42", "tasks/42"), true);
  assert.equal(resourceMatches("tasks/42", "tasks/42/"), false);
});
