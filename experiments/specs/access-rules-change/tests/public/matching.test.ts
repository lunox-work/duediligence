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

test("[happy-1] an exact rule allows the request it names", () => {
  const rules = [rule("r1", "allow", "u1", "read", "tasks/42")];
  assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/42")), {
    effect: "allow",
    ruleId: "r1",
  });
});

test("[happy-1] an exact rule does not match a different subject, action or resource", () => {
  const rules = [rule("r1", "allow", "u1", "read", "tasks/42")];
  assert.deepEqual(evaluate(rules, req("u2", "read", "tasks/42")), DENIED);
  assert.deepEqual(evaluate(rules, req("u1", "write", "tasks/42")), DENIED);
  assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/43")), DENIED);
  assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/42/x")), DENIED);
  assert.deepEqual(evaluate(rules, req("u1", "read", "tasks")), DENIED);
});

test("[happy-2] a role rule allows a subject whose request lists the role", () => {
  const rules = [rule("r1", "allow", "role:reviewer", "read", "tasks/**")];
  assert.deepEqual(
    evaluate(rules, req("u7", "read", "tasks/42/submissions/7", ["reviewer"])),
    { effect: "allow", ruleId: "r1" },
  );
  assert.deepEqual(
    evaluate(rules, req("u7", "read", "tasks/42/submissions/7", [])),
    DENIED,
  );
});

test("[happy-2] a role rule matches the role among others but not a similar role name", () => {
  const rules = [rule("r1", "allow", "role:reviewer", "read", "tasks/**")];
  assert.deepEqual(
    evaluate(
      rules,
      req("u7", "read", "tasks/42/submissions/7", ["editor", "reviewer"]),
    ),
    { effect: "allow", ruleId: "r1" },
  );
  assert.deepEqual(
    evaluate(rules, req("u7", "read", "tasks/42/submissions/7", ["reviewers"])),
    DENIED,
  );
  assert.deepEqual(
    evaluate(rules, req("reviewer", "read", "tasks/42/submissions/7", [])),
    DENIED,
  );
});

test("[boundary-1] a single-segment wildcard matches exactly one segment", () => {
  const rules = [rule("r1", "allow", "*", "read", "tasks/*/submissions")];
  assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/42/submissions")), {
    effect: "allow",
    ruleId: "r1",
  });
  assert.deepEqual(
    evaluate(rules, req("u1", "read", "tasks/42/43/submissions")),
    DENIED,
  );
  assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/submissions")), DENIED);
  assert.deepEqual(
    evaluate(rules, req("u1", "read", "tasks/42/submissions/7")),
    DENIED,
  );
});

test("[boundary-1] a multi-segment wildcard matches any number of segments, including none", () => {
  const trailing = [rule("t", "allow", "*", "read", "tasks/**")];
  for (const resource of ["tasks", "tasks/42", "tasks/42/submissions/7"]) {
    assert.deepEqual(evaluate(trailing, req("u1", "read", resource)), {
      effect: "allow",
      ruleId: "t",
    });
  }
  assert.deepEqual(evaluate(trailing, req("u1", "read", "projects/42")), DENIED);

  const leading = [rule("l", "allow", "*", "read", "**/submissions")];
  for (const resource of ["submissions", "tasks/42/submissions"]) {
    assert.deepEqual(evaluate(leading, req("u1", "read", resource)), {
      effect: "allow",
      ruleId: "l",
    });
  }
  assert.deepEqual(
    evaluate(leading, req("u1", "read", "tasks/42/submissions/7")),
    DENIED,
  );
});

test("[boundary-2] an action prefix matches actions starting with it, including the bare prefix", () => {
  const rules = [rule("r1", "allow", "*", "task:*", "tasks/42")];
  for (const action of ["task:read", "task:"]) {
    assert.deepEqual(evaluate(rules, req("u1", action, "tasks/42")), {
      effect: "allow",
      ruleId: "r1",
    });
  }
});

test("[boundary-2] an action prefix does not match shorter or differently prefixed actions, and an exact action matches only itself", () => {
  const prefixed = [rule("p", "allow", "*", "task:*", "tasks/42")];
  assert.deepEqual(evaluate(prefixed, req("u1", "task", "tasks/42")), DENIED);
  assert.deepEqual(evaluate(prefixed, req("u1", "tasks:read", "tasks/42")), DENIED);

  const exact = [rule("e", "allow", "*", "read", "tasks/42")];
  assert.deepEqual(evaluate(exact, req("u1", "read", "tasks/42")), {
    effect: "allow",
    ruleId: "e",
  });
  assert.deepEqual(evaluate(exact, req("u1", "reader", "tasks/42")), DENIED);
  assert.deepEqual(evaluate(exact, req("u1", "rea", "tasks/42")), DENIED);

  const any = [rule("a", "allow", "*", "*", "tasks/42")];
  for (const action of ["read", "task:read", "delete"]) {
    assert.deepEqual(evaluate(any, req("u1", action, "tasks/42")), {
      effect: "allow",
      ruleId: "a",
    });
  }
});

test("[boundary-3] matching on role, action and resource is case-sensitive", () => {
  const rules = [rule("r1", "allow", "role:Admin", "Read", "Tasks/**")];
  assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/42", ["admin"])), DENIED);
  assert.deepEqual(evaluate(rules, req("u1", "Read", "Tasks/42", ["Admin"])), {
    effect: "allow",
    ruleId: "r1",
  });
  assert.deepEqual(evaluate(rules, req("u1", "Read", "Tasks/42", ["admin"])), DENIED);
  assert.deepEqual(evaluate(rules, req("u1", "read", "Tasks/42", ["Admin"])), DENIED);
  assert.deepEqual(evaluate(rules, req("u1", "Read", "tasks/42", ["Admin"])), DENIED);
});

test("[boundary-3] a resource with a trailing slash is not the same resource", () => {
  const rules = [rule("r1", "allow", "u1", "read", "tasks/42")];
  assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/42/")), DENIED);
  assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/42")), {
    effect: "allow",
    ruleId: "r1",
  });
});
