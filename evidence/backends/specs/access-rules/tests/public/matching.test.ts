import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, type AccessRequest, type AccessRule } from "../../src/index.js";

function rule(overrides: Partial<AccessRule> = {}): AccessRule {
  return {
    id: "matching-rule",
    effect: "allow",
    subject: "u1",
    action: "read",
    resource: "tasks/42",
    conditions: [],
    ...overrides,
  };
}

function request(overrides: Partial<AccessRequest> = {}): AccessRequest {
  return {
    subject: "u1",
    roles: [],
    action: "read",
    resource: "tasks/42",
    attributes: {},
    ...overrides,
  };
}

test("[happy-1] an exact subject, action and resource allow the request", () => {
  const exact = rule();
  assert.deepEqual(evaluate([exact], request()), {
    effect: "allow",
    ruleId: exact.id,
  });
});

test("[happy-1] changing any exact part prevents the rule from matching", () => {
  for (const change of [
    { subject: "u10" },
    { action: "read-more" },
    { resource: "tasks/420" },
  ]) {
    assert.deepEqual(evaluate([rule()], request(change)), {
      effect: "deny",
      ruleId: null,
    });
  }
});

test("[happy-2] a listed role matches regardless of the subject id or role position", () => {
  const reviewer = rule({ subject: "role:reviewer", resource: "tasks/**" });
  assert.deepEqual(
    evaluate([reviewer], request({
      subject: "another-user",
      roles: ["author", "reviewer"],
      resource: "tasks/42/submissions/7",
    })),
    { effect: "allow", ruleId: reviewer.id },
  );
});

test("[happy-2] absent and merely similar roles do not match a role pattern", () => {
  const reviewer = rule({ subject: "role:reviewer", resource: "tasks/**" });
  for (const roles of [[], ["author"], ["reviewers"]]) {
    assert.deepEqual(
      evaluate([reviewer], request({
        subject: "reviewer",
        roles,
        resource: "tasks/42/submissions/7",
      })),
      { effect: "deny", ruleId: null },
    );
  }
});

test("[boundary-1] a resource star matches one segment for any subject", () => {
  const wildcard = rule({ subject: "*", resource: "tasks/*/submissions" });
  assert.deepEqual(
    evaluate([wildcard], request({ subject: "visitor", resource: "tasks/42/submissions" })),
    { effect: "allow", ruleId: wildcard.id },
  );
});

test("[boundary-1] a resource star cannot skip or consume extra segments", () => {
  const wildcard = rule({ subject: "*", resource: "tasks/*/submissions" });
  for (const resource of [
    "tasks/42/43/submissions",
    "tasks/submissions",
    "tasks/42/submissions/7",
  ]) {
    assert.deepEqual(evaluate([wildcard], request({ resource })), {
      effect: "deny",
      ruleId: null,
    });
  }
});

test("[boundary-1] a trailing double star matches zero, one and many segments", () => {
  const wildcard = rule({ resource: "tasks/**" });
  for (const resource of ["tasks", "tasks/42", "tasks/42/submissions/7"]) {
    assert.deepEqual(evaluate([wildcard], request({ resource })), {
      effect: "allow",
      ruleId: wildcard.id,
    });
  }
  assert.deepEqual(evaluate([wildcard], request({ resource: "tasksmith/42" })), {
    effect: "deny",
    ruleId: null,
  });
});

test("[boundary-1] a leading double star matches zero or many segments before its suffix", () => {
  const wildcard = rule({ resource: "**/submissions" });
  for (const resource of ["submissions", "tasks/42/submissions"]) {
    assert.deepEqual(evaluate([wildcard], request({ resource })), {
      effect: "allow",
      ruleId: wildcard.id,
    });
  }
  assert.deepEqual(evaluate([wildcard], request({ resource: "tasks/42/submissions/7" })), {
    effect: "deny",
    ruleId: null,
  });
});

test("[boundary-1] an interior double star preserves the literal segments on both sides", () => {
  const wildcard = rule({ resource: "tasks/**/submissions" });
  for (const resource of ["tasks/submissions", "tasks/42/versions/7/submissions"]) {
    assert.deepEqual(evaluate([wildcard], request({ resource })), {
      effect: "allow",
      ruleId: wildcard.id,
    });
  }
  for (const resource of ["other/42/submissions", "tasks/42/other"]) {
    assert.deepEqual(evaluate([wildcard], request({ resource })), {
      effect: "deny",
      ruleId: null,
    });
  }
});

test("[boundary-2] an action prefix matches an action with a nonempty suffix", () => {
  const prefix = rule({ action: "task:*" });
  assert.deepEqual(evaluate([prefix], request({ action: "task:read" })), {
    effect: "allow",
    ruleId: prefix.id,
  });
});

test("[boundary-2] an action prefix also matches an empty suffix", () => {
  const prefix = rule({ action: "task:*" });
  assert.deepEqual(evaluate([prefix], request({ action: "task:" })), {
    effect: "allow",
    ruleId: prefix.id,
  });
});

test("[boundary-2] similar actions that lack the complete prefix do not match", () => {
  for (const action of ["task", "tasks:read"]) {
    assert.deepEqual(evaluate([rule({ action: "task:*" })], request({ action })), {
      effect: "deny",
      ruleId: null,
    });
  }
});

test("[boundary-2] an exact action matches only itself", () => {
  assert.deepEqual(evaluate([rule()], request({ action: "read" })), {
    effect: "allow",
    ruleId: "matching-rule",
  });
  for (const action of ["read:all", "bread", "rea"]) {
    assert.deepEqual(evaluate([rule()], request({ action })), {
      effect: "deny",
      ruleId: null,
    });
  }
});

test("[boundary-2] a lone action star matches unrelated actions", () => {
  const wildcard = rule({ action: "*" });
  for (const action of ["read", "task:write", "archive"]) {
    assert.deepEqual(evaluate([wildcard], request({ action })), {
      effect: "allow",
      ruleId: wildcard.id,
    });
  }
});

test("[boundary-3] matching case in roles, actions and resources allows", () => {
  const caseSensitive = rule({ subject: "role:Admin", action: "Read", resource: "Tasks/**" });
  assert.deepEqual(
    evaluate([caseSensitive], request({ roles: ["Admin"], action: "Read", resource: "Tasks/42" })),
    { effect: "allow", ruleId: caseSensitive.id },
  );
});

test("[boundary-3] each role, action and resource comparison is case-sensitive", () => {
  const caseSensitive = rule({ subject: "role:Admin", action: "Read", resource: "Tasks/**" });
  const matching = request({ roles: ["Admin"], action: "Read", resource: "Tasks/42" });
  for (const change of [
    { roles: ["admin"] },
    { action: "read" },
    { resource: "tasks/42" },
    { roles: ["admin"], action: "read", resource: "tasks/42" },
  ]) {
    assert.deepEqual(evaluate([caseSensitive], { ...matching, ...change }), {
      effect: "deny",
      ruleId: null,
    });
  }
  assert.deepEqual(evaluate([rule()], request({ subject: "U1" })), {
    effect: "deny",
    ruleId: null,
  });
});

test("[boundary-3] a trailing resource slash is distinct from no trailing slash", () => {
  assert.deepEqual(evaluate([rule()], request({ resource: "tasks/42/" })), {
    effect: "deny",
    ruleId: null,
  });
  assert.deepEqual(evaluate([rule({ resource: "tasks/42/" })], request()), {
    effect: "deny",
    ruleId: null,
  });
});
