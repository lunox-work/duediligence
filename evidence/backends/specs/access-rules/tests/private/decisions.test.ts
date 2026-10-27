import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, type AccessRequest, type AccessRule } from "../../src/index.js";

function rule(id: string, overrides: Partial<AccessRule> = {}): AccessRule {
  return {
    id,
    effect: "allow",
    subject: "member-73",
    action: "export",
    resource: "org/acme/reports/annual",
    conditions: [],
    ...overrides,
  };
}

function request(overrides: Partial<AccessRequest> = {}): AccessRequest {
  return {
    subject: "member-73",
    roles: ["reporter", "staff"],
    action: "export",
    resource: "org/acme/reports/annual",
    attributes: { region: "eu", status: "active" },
    ...overrides,
  };
}

// Extends public "[happy-3] a later matching deny overrides an earlier matching allow".
test("[happy-3] a broad conditional deny overrides many earlier exact allows", () => {
  const allows = Array.from({ length: 95 }, (_, i) => rule(`exact-allow-${i}`));
  const deny = rule("broad-deny-at-end", {
    effect: "deny", subject: "*", action: "ex*", resource: "**/reports/**",
    conditions: [
      { attribute: "region", operator: "in", value: ["us", "eu", "apac"] },
      { attribute: "revoked", operator: "absent" },
    ],
  });
  assert.deepEqual(evaluate([...allows, deny], request()), { effect: "deny", ruleId: deny.id });
});

// Extends public "[happy-3] a matching deny still wins when placed before the allow".
test("[happy-3] a broad deny wins over many later, more specific allows", () => {
  const deny = rule("role-deny-at-start", {
    effect: "deny", subject: "role:staff", action: "*", resource: "org/**",
    conditions: [{ attribute: "status", operator: "neq", value: "exempt" }],
  });
  const allows = Array.from({ length: 70 }, (_, i) => rule(`specific-allow-${i}`));
  assert.deepEqual(evaluate([deny, ...allows], request()), { effect: "deny", ruleId: deny.id });
});

// Extends public "[happy-3] a deny whose resource or condition fails cannot override an allow".
test("[happy-3] nonmatching deny subjects, actions and later conditions never override", () => {
  const allow = rule("matching-allow", { subject: "role:reporter" });
  const denies = [
    rule("wrong-direct-subject", { effect: "deny", subject: "other" }),
    rule("wrong-role", { effect: "deny", subject: "role:manager" }),
    rule("wrong-prefix", { effect: "deny", action: "import*" }),
    rule("wrong-deep-resource", { effect: "deny", resource: "org/**/private/*" }),
    rule("failed-late-condition", {
      effect: "deny",
      conditions: [
        { attribute: "region", operator: "eq", value: "eu" },
        { attribute: "status", operator: "neq", value: "active" },
      ],
    }),
    rule("failed-absence", { effect: "deny", conditions: [{ attribute: "region", operator: "absent" }] }),
  ];
  for (const rules of [[...denies, allow], [allow, ...denies], [...denies.slice(0, 3), allow, ...denies.slice(3)]]) {
    assert.deepEqual(evaluate(rules, request()), { effect: "allow", ruleId: allow.id });
  }
});

test("[happy-3] conditions determine which deny is eligible without using allow conditions", () => {
  const allow = rule("open-allow");
  const deny = rule("suspended-deny", {
    effect: "deny", subject: "*", action: "*", resource: "**",
    conditions: [
      { attribute: "status", operator: "eq", value: "suspended" },
      { attribute: "exception", operator: "absent" },
    ],
  });
  for (const rules of [[allow, deny], [deny, allow]]) {
    assert.deepEqual(evaluate(rules, request({ attributes: { status: "suspended" } })), { effect: "deny", ruleId: deny.id });
    assert.deepEqual(evaluate(rules, request({ attributes: { status: "suspended", exception: "" } })), { effect: "allow", ruleId: allow.id });
    assert.deepEqual(evaluate(rules, request({ attributes: {} })), { effect: "allow", ruleId: allow.id });
  }
});

// Extends public "[boundary-4] the first matching deny decides even with an earlier allow and unmatched deny".
test("[boundary-4] the earliest eligible deny wins independent of specificity or id sorting", () => {
  const ignored = Array.from({ length: 40 }, (_, i) => rule(`ignored-deny-${i}`, {
    effect: "deny", conditions: [{ attribute: "region", operator: "eq", value: "apac" }],
  }));
  const allow = rule("allow-before-denies");
  const broad = rule("zzz-broad-deny", { effect: "deny", subject: "*", action: "*", resource: "**" });
  const exact = rule("aaa-exact-deny", { effect: "deny" });
  const middle = rule("mmm-role-deny", { effect: "deny", subject: "role:staff", resource: "org/**" });
  for (const ordered of [[broad, exact, middle], [middle, broad, exact], [exact, middle, broad]]) {
    const rules = [allow, ...ignored, ordered[0], rule("another-allow"), ordered[1], ordered[2]];
    assert.deepEqual(evaluate(rules, request()), { effect: "deny", ruleId: ordered[0].id });
  }
});

// Extends public "[boundary-4] when only allows match the first matching allow decides".
test("[boundary-4] the earliest eligible allow wins among many broad, role and exact rules", () => {
  const ignored = Array.from({ length: 45 }, (_, i) => rule(`ignored-${i}`, {
    effect: i % 2 === 0 ? "allow" : "deny", action: "import",
  }));
  const broad = rule("zzz-broad", { subject: "*", action: "*", resource: "**" });
  const role = rule("mmm-role", { subject: "role:staff", resource: "org/**" });
  const exact = rule("aaa-exact");
  for (const ordered of [[broad, role, exact], [role, exact, broad], [exact, broad, role]]) {
    assert.deepEqual(evaluate([...ignored, ...ordered], request()), { effect: "allow", ruleId: ordered[0].id });
  }
});

test("[boundary-4] failed conditions exclude an earlier rule from both deciding effects", () => {
  for (const effect of ["allow", "deny"] as const) {
    const missing = rule(`missing-${effect}`, {
      effect, conditions: [{ attribute: "approval", operator: "neq", value: "no" }],
    });
    const unequal = rule(`unequal-${effect}`, {
      effect, conditions: [{ attribute: "region", operator: "in", value: ["apac", "us"] }],
    });
    const winner = rule(`eligible-${effect}`, {
      effect, conditions: [{ attribute: "approval", operator: "absent" }],
    });
    const later = rule(`later-${effect}`, { effect });
    assert.deepEqual(evaluate([missing, unequal, winner, later], request()), { effect, ruleId: winner.id });
  }
});

// Extends public "[unhappy-1] rules that each fail a different part deny with no deciding id".
test("[unhappy-1] matching parts cannot be assembled across many unrelated rules", () => {
  const rules: AccessRule[] = [];
  for (let i = 0; i < 20; i++) {
    const effect = i % 2 === 0 ? "allow" : "deny";
    rules.push(
      rule(`subject-${i}`, { effect, subject: `different-${i}` }),
      rule(`role-${i}`, { effect, subject: `role:absent-${i}` }),
      rule(`action-${i}`, { effect, action: `export-${i}` }),
      rule(`resource-${i}`, { effect, resource: `org/**/reports/${i}` }),
      rule(`condition-${i}`, { effect, conditions: [{ attribute: `missing-${i}`, operator: "neq", value: "x" }] }),
    );
  }
  assert.deepEqual(evaluate(rules, request()), { effect: "deny", ruleId: null });
  assert.deepEqual(evaluate([...rules].reverse(), request()), { effect: "deny", ruleId: null });
});

// Extends public "[unhappy-1] an empty rule list denies requests with no deciding id".
test("[unhappy-1] no roles, wildcard-like request strings or attributes grant access without rules", () => {
  for (const input of [
    request({ subject: "*", roles: ["Admin", "*"], action: "*", resource: "**" }),
    request({ subject: "root", roles: ["admin", "owner", "superuser"], attributes: { allow: "true", effect: "allow" } }),
    request({ roles: Array.from({ length: 100 }, (_, i) => `role-${i}`), resource: Array.from({ length: 100 }, (_, i) => `part-${i}`).join("/") }),
  ]) {
    assert.deepEqual(evaluate([], input), { effect: "deny", ruleId: null });
  }
});

test("[unhappy-1] only nonmatching denies still yield no rule id", () => {
  const rules = [
    rule("wrong-role-deny", { effect: "deny", subject: "role:owner" }),
    rule("wrong-attribute-deny", { effect: "deny", conditions: [{ attribute: "status", operator: "eq", value: "disabled" }] }),
    rule("wrong-action-deny", { effect: "deny", action: "import*" }),
  ];
  assert.deepEqual(evaluate(rules, request()), { effect: "deny", ruleId: null });
});

test("[happy-3] repeated evaluations recompute conditions and roles for the same subject and resource", () => {
  const allow = rule("staff-allow", { subject: "role:staff" });
  const deny = rule("blocked-deny", {
    effect: "deny", conditions: [{ attribute: "status", operator: "eq", value: "blocked" }],
  });
  const rules = [allow, deny];
  for (let pass = 0; pass < 2; pass++) {
    assert.deepEqual(evaluate(rules, request()), { effect: "allow", ruleId: allow.id });
    assert.deepEqual(evaluate(rules, request({ attributes: { status: "blocked" } })), { effect: "deny", ruleId: deny.id });
    assert.deepEqual(evaluate(rules, request({ roles: [], attributes: {} })), { effect: "deny", ruleId: null });
    assert.deepEqual(evaluate(rules, request({ roles: [], attributes: { status: "blocked" } })), { effect: "deny", ruleId: deny.id });
  }
});

test("[boundary-4] rule identifiers are returned literally without coercion or trimming", () => {
  for (const id of ["0", " deny / allow ", "规则[73].+?"]) {
    for (const effect of ["allow", "deny"] as const) {
      const first = rule(id, { effect });
      const later = rule("later-matching", { effect });
      assert.deepEqual(evaluate([first, later], request()), { effect, ruleId: id });
    }
  }
});
