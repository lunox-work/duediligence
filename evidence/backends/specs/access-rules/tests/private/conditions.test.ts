import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, type AccessRequest, type AccessRule, type Condition } from "../../src/index.js";

function rule(conditions: readonly Condition[], overrides: Partial<AccessRule> = {}): AccessRule {
  return {
    id: "private-conditions",
    effect: "allow",
    subject: "member-73",
    action: "export",
    resource: "reports/annual",
    conditions,
    ...overrides,
  };
}

function request(attributes: Readonly<Record<string, string>> = {}): AccessRequest {
  return { subject: "member-73", roles: [], action: "export", resource: "reports/annual", attributes };
}

function expectMatch(candidate: AccessRule, attributes: Readonly<Record<string, string>>, matches: boolean): void {
  assert.deepEqual(evaluate([candidate], request(attributes)), {
    effect: matches ? "allow" : "deny",
    ruleId: matches ? candidate.id : null,
  });
}

// Extends public "[happy-4] every condition holds for either listed tier".
test("[happy-4] all four operators can constrain the same rule with a long membership list", () => {
  const departments = Array.from({ length: 80 }, (_, i) => `department-${i}`);
  const candidate = rule([
    { attribute: "tenant", operator: "eq", value: "acme" },
    { attribute: "status", operator: "neq", value: "suspended" },
    { attribute: "department", operator: "in", value: departments },
    { attribute: "revoked", operator: "absent" },
    { attribute: "format", operator: "eq", value: "pdf" },
  ]);
  for (const department of [departments[0], departments[39], departments[79]]) {
    expectMatch(candidate, { tenant: "acme", status: "active", department, format: "pdf", unused: "ignored" }, true);
  }
});

// Extends public "[happy-4] failure of either condition prevents a match".
test("[happy-4] a failed condition at any position blocks a five-condition rule in either order", () => {
  const conditions: Condition[] = [
    { attribute: "tenant", operator: "eq", value: "acme" },
    { attribute: "status", operator: "neq", value: "suspended" },
    { attribute: "department", operator: "in", value: ["finance", "legal", "engineering"] },
    { attribute: "revoked", operator: "absent" },
    { attribute: "format", operator: "eq", value: "pdf" },
  ];
  const base = { tenant: "acme", status: "active", department: "legal", format: "pdf" };
  const failures: Readonly<Record<string, string>>[] = [
    { tenant: "other" }, { status: "suspended" }, { department: "sales" },
    { revoked: "yes" }, { format: "csv" },
  ];
  for (const changes of failures) {
    for (const ordered of [conditions, [...conditions].reverse()]) {
      expectMatch(rule(ordered), { ...base, ...changes }, false);
    }
  }
});

// Extends public "[happy-4] a missing required attribute fails even if the other condition holds".
test("[happy-4] any missing required attribute blocks a long conjunction including neq", () => {
  const conditions: Condition[] = Array.from({ length: 35 }, (_, i) => ({
    attribute: `field-${i}`, operator: i % 3 === 0 ? "neq" : i % 3 === 1 ? "eq" : "in",
    value: i % 3 === 0 ? "forbidden" : i % 3 === 1 ? "ok" : ["ok", "alternative"],
  }));
  const base: Record<string, string> = Object.fromEntries(conditions.map((c) => [c.attribute, "ok"]));
  expectMatch(rule(conditions), base, true);
  for (const condition of conditions) {
    const attributes = { ...base };
    delete attributes[condition.attribute];
    expectMatch(rule(conditions), attributes, false);
  }
});

test("[happy-4] repeated attribute conditions remain a conjunction rather than replacing each other", () => {
  const candidate = rule([
    { attribute: "tier", operator: "in", value: ["bronze", "silver", "gold", "platinum"] },
    { attribute: "tier", operator: "neq", value: "bronze" },
    { attribute: "tier", operator: "neq", value: "silver" },
    { attribute: "tier", operator: "eq", value: "gold" },
  ]);
  expectMatch(candidate, { tier: "gold" }, true);
  for (const tier of ["bronze", "silver", "platinum", "other"]) {
    expectMatch(candidate, { tier }, false);
  }
  const contradictory = rule([
    { attribute: "tier", operator: "eq", value: "gold" },
    { attribute: "tier", operator: "eq", value: "silver" },
  ]);
  for (const tier of ["gold", "silver"]) expectMatch(contradictory, { tier }, false);
});

test("[happy-4] membership compares complete strings and not substrings or patterns", () => {
  const candidate = rule([{ attribute: "code", operator: "in", value: ["alpha", "a.b+", "*", "constructor"] }]);
  for (const code of ["alpha", "a.b+", "*", "constructor"]) expectMatch(candidate, { code }, true);
  for (const code of ["alp", "prefix-alpha", "alpha-tail", "aXbb", "anything", "toString"]) {
    expectMatch(candidate, { code }, false);
  }
});

test("[happy-4] equality and inequality preserve whitespace, unicode and case", () => {
  const eq = rule([{ attribute: "label", operator: "eq", value: " Café " }]);
  const neq = rule([{ attribute: "label", operator: "neq", value: " Café " }]);
  expectMatch(eq, { label: " Café " }, true);
  expectMatch(neq, { label: " Café " }, false);
  for (const label of ["Café", " café ", " Cafe\u0301 ", " Café  "]) {
    expectMatch(eq, { label }, false);
    expectMatch(neq, { label }, true);
  }
});

test("[happy-4] attribute names are literal string keys with case preserved", () => {
  const candidate = rule([
    { attribute: "Tenant.Region", operator: "eq", value: "eu" },
    { attribute: "plan code", operator: "in", value: ["enterprise"] },
  ]);
  expectMatch(candidate, { "Tenant.Region": "eu", "plan code": "enterprise" }, true);
  const inputs: Readonly<Record<string, string>>[] = [
    { "tenant.region": "eu", "plan code": "enterprise" },
    { "Tenant.Region": "eu", "Plan Code": "enterprise" },
  ];
  for (const attributes of inputs) {
    expectMatch(candidate, attributes, false);
  }
});

// Extends public "[boundary-5] only absent matches when the named attribute is missing".
test("[boundary-5] missing named keys cannot borrow other attributes or match empty comparison values", () => {
  for (const condition of [
    { attribute: "zone", operator: "eq", value: "" },
    { attribute: "zone", operator: "neq", value: "" },
    { attribute: "zone", operator: "in", value: ["", "eu", "west"] },
  ]) {
    expectMatch(rule([condition]), { another: "", zoneBackup: "eu" }, false);
  }
  expectMatch(rule([{ attribute: "zone", operator: "absent" }]), { Zone: "eu", zoneBackup: "eu" }, true);
});

// Extends public "[boundary-5] a present unequal value matches neq and fails absent".
test("[boundary-5] neq and absent distinguish absence from every present string", () => {
  const unequal = rule([{ attribute: "flag", operator: "neq", value: "blocked" }]);
  const absent = rule([{ attribute: "flag", operator: "absent" }]);
  for (const flag of ["0", "false", "null", "undefined", "BLOCKED", " blocked", " "]) {
    expectMatch(unequal, { flag }, true);
    expectMatch(absent, { flag }, false);
  }
  expectMatch(unequal, { flag: "blocked" }, false);
  expectMatch(unequal, {}, false);
  expectMatch(absent, {}, true);
});

// Extends public "[boundary-5] an empty string is present for eq, neq, in and absent".
test("[boundary-5] empty strings participate in combinations without being treated as missing", () => {
  const candidate = rule([
    { attribute: "alias", operator: "eq", value: "" },
    { attribute: "alias", operator: "neq", value: "nonempty" },
    { attribute: "alias", operator: "in", value: ["one", "two", ""] },
    { attribute: "disabled", operator: "absent" },
  ]);
  expectMatch(candidate, { alias: "" }, true);
  expectMatch(candidate, {}, false);
  expectMatch(candidate, { alias: "", disabled: "" }, false);
  expectMatch(rule([{ attribute: "alias", operator: "neq", value: "" }]), { alias: "" }, false);
  expectMatch(rule([{ attribute: "alias", operator: "eq", value: "nonempty" }]), { alias: "" }, false);
  expectMatch(rule([{ attribute: "alias", operator: "in", value: ["nonempty"] }]), { alias: "" }, false);
});

// Extends public "[boundary-5] membership in an empty list fails for present and missing attributes".
test("[boundary-5] an empty membership list cannot activate a deny or be skipped in a conjunction", () => {
  const empty: Condition = { attribute: "zone", operator: "in", value: [] };
  const allow = rule([], { id: "unconditional-allow" });
  const deny = rule([empty], { id: "empty-membership-deny", effect: "deny" });
  const inputs: Readonly<Record<string, string>>[] = [{}, { zone: "" }, { zone: "eu" }];
  for (const attributes of inputs) {
    for (const rules of [[deny, allow], [allow, deny]]) {
      assert.deepEqual(evaluate(rules, request(attributes)), { effect: "allow", ruleId: allow.id });
    }
    for (const conditions of [
      [empty, { attribute: "unused", operator: "absent" }],
      [{ attribute: "unused", operator: "absent" }, empty],
    ]) {
      expectMatch(rule(conditions), attributes, false);
    }
  }
});

// Extends public "[unhappy-2] an unknown condition operator throws an Error naming its rule".
test("[unhappy-2] operator names are exact and never accepted through object prototype lookup", () => {
  for (const operator of ["EQ", "Neq", "IN", "Absent", " eq", "eq ", "", "__proto__", "constructor", "toString"]) {
    const invalid = rule([{ attribute: "zone", operator, value: "eu" }], { id: `bad-operator-[${operator}]` });
    assert.throws(() => evaluate([invalid], request({ zone: "eu" })),
      (error: unknown) => error instanceof Error && error.message.includes(invalid.id));
  }
});

// Extends public "[unhappy-2] an unknown effect throws an Error naming its rule".
test("[unhappy-2] effect names are exact even when they are empty or inherited property names", () => {
  for (const effect of ["ALLOW", "Deny", " allow", "deny ", "", "block", "__proto__", "constructor", "toString"]) {
    const invalid = rule([], { id: `bad-effect-[${effect}]`, effect });
    assert.throws(() => evaluate([invalid], request()),
      (error: unknown) => error instanceof Error && error.message.includes(invalid.id));
  }
});

// Extends public "[unhappy-2] an invalid operator is refused in an unmatched rule after a matching deny".
test("[unhappy-2] invalid operators are validated throughout long lists for allow and deny rules", () => {
  for (const effect of ["allow", "deny"]) {
    for (const position of [0, 37, 80]) {
      const rules = Array.from({ length: 80 }, (_, i) => rule([], { id: `valid-${i}`, effect: "deny" }));
      const invalid = rule([{ attribute: "zone", operator: "matches", value: "eu" }], {
        id: `hidden-invalid-${effect}-${position}`, effect,
        subject: "different", action: "different", resource: "different/path",
      });
      rules.splice(position, 0, invalid);
      assert.throws(() => evaluate(rules, request()),
        (error: unknown) => error instanceof Error && error.message.includes(invalid.id));
    }
  }
});

// Extends public "[unhappy-2] an invalid effect is refused in an unmatched rule after a matching deny".
test("[unhappy-2] invalid effects are rejected before, between and after otherwise decisive rules", () => {
  const allow = rule([], { id: "valid-allow" });
  const deny = rule([], { id: "valid-deny", effect: "deny" });
  const invalid = rule([{ attribute: "missing", operator: "eq", value: "never" }], {
    id: "invalid-effect-among-valid-rules", effect: "reject", subject: "different",
  });
  for (const rules of [[invalid, allow, deny], [allow, invalid, deny], [allow, deny, invalid], [deny, invalid, allow], [allow, invalid]]) {
    assert.throws(() => evaluate(rules, request()),
      (error: unknown) => error instanceof Error && error.message.includes(invalid.id));
  }
});

// Extends public "[unhappy-2] an invalid operator is refused even after a condition that fails".
test("[unhappy-2] a late invalid operator cannot hide behind failed membership, neq or absent", () => {
  for (const failure of [
    { attribute: "zone", operator: "in", value: [] },
    { attribute: "missing", operator: "neq", value: "eu" },
    { attribute: "zone", operator: "absent" },
  ]) {
    const conditions: Condition[] = [
      failure,
      ...Array.from({ length: 30 }, (_, i) => ({ attribute: `missing-${i}`, operator: "absent" })),
      { attribute: "zone", operator: "not-in", value: ["eu"] },
    ];
    for (const effect of ["allow", "deny"]) {
      const invalid = rule(conditions, { id: `invalid-tail-${failure.operator}-${effect}`, effect });
      assert.throws(() => evaluate([invalid], request({ zone: "eu" })),
        (error: unknown) => error instanceof Error && error.message.includes(invalid.id));
    }
  }
});

test("[unhappy-2] an invalid operator is refused when a valid allow would otherwise decide", () => {
  const allow = rule([], { id: "early-allow" });
  const invalid = rule([{ attribute: "zone", operator: "equals", value: "eu" }], {
    id: "invalid-after-allow", action: "not-the-request-action",
  });
  assert.throws(() => evaluate([allow, invalid], request()),
    (error: unknown) => error instanceof Error && error.message.includes(invalid.id));
});
