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

test("[happy-3] a more specific allow overrides a broader deny", () => {
  const broadDeny = rule("broad-deny", "deny", "*", "read", "tasks/**");
  const narrowAllow = rule("narrow-allow", "allow", "u1", "read", "tasks/42");
  const rules = [broadDeny, narrowAllow];
  assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/42")), {
    effect: "allow",
    ruleId: "narrow-allow",
  });
  assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/43")), {
    effect: "deny",
    ruleId: "broad-deny",
  });
});

test("[happy-3] the decisions do not depend on the order of the two rules", () => {
  const broadDeny = rule("broad-deny", "deny", "*", "read", "tasks/**");
  const narrowAllow = rule("narrow-allow", "allow", "u1", "read", "tasks/42");
  const rules = [narrowAllow, broadDeny];
  assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/42")), {
    effect: "allow",
    ruleId: "narrow-allow",
  });
  assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/43")), {
    effect: "deny",
    ruleId: "broad-deny",
  });
});

test("[happy-4] a more specific deny overrides a broader allow", () => {
  const broadAllow = rule("broad-allow", "allow", "role:reviewer", "read", "tasks/**");
  const narrowDeny = rule("narrow-deny", "deny", "u1", "read", "tasks/42");
  const request = req("u1", "read", "tasks/42", ["reviewer"]);
  assert.deepEqual(evaluate([broadAllow, narrowDeny], request), {
    effect: "deny",
    ruleId: "narrow-deny",
  });
  assert.deepEqual(evaluate([narrowDeny, broadAllow], request), {
    effect: "deny",
    ruleId: "narrow-deny",
  });
});

test("[happy-4] the broader allow still decides where the narrower deny does not match", () => {
  const broadAllow = rule("broad-allow", "allow", "role:reviewer", "read", "tasks/**");
  const narrowDeny = rule("narrow-deny", "deny", "u1", "read", "tasks/42");
  const rules = [broadAllow, narrowDeny];
  assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/43", ["reviewer"])), {
    effect: "allow",
    ruleId: "broad-allow",
  });
  assert.deepEqual(evaluate(rules, req("u2", "read", "tasks/42", ["reviewer"])), {
    effect: "allow",
    ruleId: "broad-allow",
  });
});

test("[boundary-4] more literal resource segments beat fewer", () => {
  const rules = [
    rule("deny-1", "deny", "*", "read", "tasks/**"),
    rule("allow-2", "allow", "*", "read", "tasks/*/submissions"),
  ];
  assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/42/submissions")), {
    effect: "allow",
    ruleId: "allow-2",
  });
});

test("[boundary-4] wildcards count for nothing, so equal literal counts tie and deny wins", () => {
  const twoEach = [
    rule("deny-2", "deny", "*", "read", "tasks/42/**"),
    rule("allow-2", "allow", "*", "read", "tasks/*/submissions"),
  ];
  assert.deepEqual(evaluate(twoEach, req("u1", "read", "tasks/42/submissions")), {
    effect: "deny",
    ruleId: "deny-2",
  });

  const zeroEach = [
    rule("allow-0", "allow", "*", "read", "*"),
    rule("deny-0", "deny", "*", "read", "**"),
  ];
  assert.deepEqual(evaluate(zeroEach, req("u1", "read", "tasks")), {
    effect: "deny",
    ruleId: "deny-0",
  });
});

test("[boundary-5] a broad subject, action and no conditions do not lose to narrower ones on a less specific resource", () => {
  const rules = [
    rule("deny", "deny", "u1", "read", "tasks/**", [
      { attribute: "region", operator: "eq", value: "sg" },
    ]),
    rule("allow", "allow", "*", "*", "tasks/42"),
  ];
  const request = req("u1", "read", "tasks/42", [], { region: "sg" });
  assert.deepEqual(evaluate(rules, request), { effect: "allow", ruleId: "allow" });
});

test("[boundary-5] a narrower subject, action and conditions do not break a resource tie", () => {
  const rules = [
    rule("allow", "allow", "u1", "read", "tasks/**", [
      { attribute: "region", operator: "eq", value: "sg" },
    ]),
    rule("deny", "deny", "*", "*", "tasks/**"),
  ];
  const request = req("u1", "read", "tasks/42", [], { region: "sg" });
  assert.deepEqual(evaluate(rules, request), { effect: "deny", ruleId: "deny" });
});

test("[boundary-6] among equally specific matching rules, deny beats allow in either order", () => {
  const allow = rule("allow", "allow", "u1", "read", "tasks/*");
  const deny = rule("deny", "deny", "role:reviewer", "read", "*/42");
  const request = req("u1", "read", "tasks/42", ["reviewer"]);
  assert.deepEqual(evaluate([allow, deny], request), { effect: "deny", ruleId: "deny" });
  assert.deepEqual(evaluate([deny, allow], request), { effect: "deny", ruleId: "deny" });
});

test("[boundary-6] an equally specific deny that does not match does not beat the allow", () => {
  const allow = rule("allow", "allow", "u1", "read", "tasks/*");
  const deny = rule("deny", "deny", "role:reviewer", "read", "*/42");
  const request = req("u1", "read", "tasks/42", []);
  assert.deepEqual(evaluate([allow, deny], request), { effect: "allow", ruleId: "allow" });
  assert.deepEqual(evaluate([deny, allow], request), { effect: "allow", ruleId: "allow" });
});

test("[boundary-7] among equally specific denies, the first in the list decides", () => {
  const allow = rule("allow-a", "allow", "*", "read", "tasks/*");
  const denyX = rule("deny-x", "deny", "u1", "read", "*/42");
  const denyY = rule("deny-y", "deny", "*", "*", "tasks/*");
  const request = req("u1", "read", "tasks/42");
  assert.deepEqual(evaluate([allow, denyX, denyY], request), {
    effect: "deny",
    ruleId: "deny-x",
  });
  assert.deepEqual(evaluate([denyY, allow, denyX], request), {
    effect: "deny",
    ruleId: "deny-y",
  });
});

test("[boundary-7] the first of the most specific allows decides, and an earlier less specific rule never does", () => {
  const request = req("u1", "read", "tasks/42");
  const allowsOnly = [
    rule("allow-1", "allow", "*", "read", "tasks/**"),
    rule("allow-2a", "allow", "*", "read", "tasks/42"),
    rule("allow-2b", "allow", "u1", "*", "tasks/42"),
  ];
  assert.deepEqual(evaluate(allowsOnly, request), {
    effect: "allow",
    ruleId: "allow-2a",
  });

  const earlierBroadDeny = [
    rule("deny-1", "deny", "*", "*", "tasks/**"),
    rule("allow-2", "allow", "u1", "read", "tasks/42"),
  ];
  assert.deepEqual(evaluate(earlierBroadDeny, request), {
    effect: "allow",
    ruleId: "allow-2",
  });

  const earlierBroadAllow = [
    rule("allow-0", "allow", "*", "*", "**"),
    rule("deny-2", "deny", "u1", "read", "tasks/42"),
  ];
  assert.deepEqual(evaluate(earlierBroadAllow, request), {
    effect: "deny",
    ruleId: "deny-2",
  });
});

test("[unhappy-1] a request no rule matches is denied with no rule id", () => {
  const rules = [
    rule("r1", "allow", "u2", "read", "tasks/42"),
    rule("r2", "allow", "u1", "write", "tasks/42"),
    rule("r3", "deny", "u1", "read", "projects/**"),
    rule("r4", "allow", "role:admin", "*", "**"),
  ];
  assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/42", ["reviewer"])), {
    effect: "deny",
    ruleId: null,
  });
});

test("[unhappy-1] an empty list of rules denies every request", () => {
  const requests = [
    req("u1", "read", "tasks/42"),
    req("admin", "delete", "projects/1/tasks/2", ["admin"], { region: "sg" }),
    req("u2", "task:write", "x"),
  ];
  for (const request of requests) {
    assert.deepEqual(evaluate([], request), { effect: "deny", ruleId: null });
  }
});
