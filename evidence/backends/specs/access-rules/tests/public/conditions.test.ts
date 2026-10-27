import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, type AccessRequest, type AccessRule, type Condition } from "../../src/index.js";

function rule(overrides: Partial<AccessRule> = {}): AccessRule {
  return {
    id: "condition-rule",
    effect: "allow",
    subject: "u1",
    action: "read",
    resource: "tasks/42",
    conditions: [],
    ...overrides,
  };
}

function request(attributes: Readonly<Record<string, string>> = {}): AccessRequest {
  return { subject: "u1", roles: [], action: "read", resource: "tasks/42", attributes };
}

function regionalRule(): AccessRule {
  return rule({
    conditions: [
      { attribute: "region", operator: "eq", value: "sg" },
      { attribute: "tier", operator: "in", value: ["gold", "platinum"] },
    ],
  });
}

test("[happy-4] every condition holds for either listed tier", () => {
  const regional = regionalRule();
  for (const tier of ["gold", "platinum"]) {
    assert.deepEqual(evaluate([regional], request({ region: "sg", tier })), {
      effect: "allow",
      ruleId: regional.id,
    });
  }
});

test("[happy-4] failure of either condition prevents a match", () => {
  for (const attributes of [
    { region: "sg", tier: "silver" },
    { region: "us", tier: "gold" },
    { region: "SG", tier: "gold" },
    { region: "sg", tier: "Gold" },
  ]) {
    assert.deepEqual(evaluate([regionalRule()], request(attributes)), {
      effect: "deny",
      ruleId: null,
    });
  }
});

test("[happy-4] a missing required attribute fails even if the other condition holds", () => {
  const attributes: Readonly<Record<string, string>>[] = [{ region: "sg" }, { tier: "gold" }];
  for (const values of attributes) {
    assert.deepEqual(evaluate([regionalRule()], request(values)), {
      effect: "deny",
      ruleId: null,
    });
  }
});

test("[boundary-5] only absent matches when the named attribute is missing", () => {
  const conditions: Condition[] = [
    { attribute: "region", operator: "eq", value: "sg" },
    { attribute: "region", operator: "neq", value: "sg" },
    { attribute: "region", operator: "in", value: ["sg"] },
    { attribute: "region", operator: "absent" },
  ];
  const rules = conditions.map((condition) => rule({
    id: `region-${condition.operator}`,
    conditions: [condition],
  }));
  assert.deepEqual(evaluate(rules, request({ unrelated: "sg" })), {
    effect: "allow",
    ruleId: "region-absent",
  });
  for (const candidate of rules) {
    assert.deepEqual(evaluate([candidate], request()), candidate.id === "region-absent"
      ? { effect: "allow", ruleId: candidate.id }
      : { effect: "deny", ruleId: null });
  }
});

test("[boundary-5] a present unequal value matches neq and fails absent", () => {
  const unequal = rule({ conditions: [{ attribute: "region", operator: "neq", value: "sg" }] });
  const absent = rule({ conditions: [{ attribute: "region", operator: "absent" }] });
  assert.deepEqual(evaluate([unequal], request({ region: "us" })), {
    effect: "allow",
    ruleId: unequal.id,
  });
  assert.deepEqual(evaluate([absent], request({ region: "us" })), {
    effect: "deny",
    ruleId: null,
  });
  assert.deepEqual(evaluate([unequal], request({ region: "sg" })), {
    effect: "deny",
    ruleId: null,
  });
});

test("[boundary-5] an empty string is present for eq, neq, in and absent", () => {
  for (const condition of [
    { attribute: "region", operator: "eq", value: "" },
    { attribute: "region", operator: "neq", value: "sg" },
    { attribute: "region", operator: "in", value: [""] },
  ]) {
    const candidate = rule({ conditions: [condition] });
    assert.deepEqual(evaluate([candidate], request({ region: "" })), {
      effect: "allow",
      ruleId: candidate.id,
    });
  }
  const absent = rule({ conditions: [{ attribute: "region", operator: "absent" }] });
  assert.deepEqual(evaluate([absent], request({ region: "" })), {
    effect: "deny",
    ruleId: null,
  });
});

test("[boundary-5] membership in an empty list fails for present and missing attributes", () => {
  const empty = rule({ conditions: [{ attribute: "region", operator: "in", value: [] }] });
  const inputs: Readonly<Record<string, string>>[] = [{ region: "sg" }, {}];
  for (const attributes of inputs) {
    assert.deepEqual(evaluate([empty], request(attributes)), { effect: "deny", ruleId: null });
  }
});

test("[unhappy-2] an unknown condition operator throws an Error naming its rule", () => {
  const invalid = rule({
    id: "invalid-operator-rule",
    conditions: [{ attribute: "region", operator: "contains", value: "sg" }],
  });
  assert.throws(
    () => evaluate([invalid], request({ region: "sg" })),
    (error: unknown) => error instanceof Error && error.message.includes(invalid.id),
  );
});

test("[unhappy-2] an unknown effect throws an Error naming its rule", () => {
  const invalid = rule({ id: "invalid-effect-rule", effect: "permit" });
  assert.throws(
    () => evaluate([invalid], request()),
    (error: unknown) => error instanceof Error && error.message.includes(invalid.id),
  );
});

test("[unhappy-2] an invalid operator is refused in an unmatched rule after a matching deny", () => {
  const deny = rule({ id: "matching-deny", effect: "deny" });
  const invalid = rule({
    id: "unmatched-invalid-operator",
    subject: "another-user",
    conditions: [{ attribute: "region", operator: "contains", value: "sg" }],
  });
  assert.throws(
    () => evaluate([deny, invalid], request()),
    (error: unknown) => error instanceof Error && error.message.includes(invalid.id),
  );
});

test("[unhappy-2] an invalid effect is refused in an unmatched rule after a matching deny", () => {
  const deny = rule({ id: "matching-deny", effect: "deny" });
  const invalid = rule({ id: "unmatched-invalid-effect", effect: "permit", resource: "other/7" });
  assert.throws(
    () => evaluate([deny, invalid], request()),
    (error: unknown) => error instanceof Error && error.message.includes(invalid.id),
  );
});

test("[unhappy-2] an invalid operator is refused even after a condition that fails", () => {
  const invalid = rule({
    id: "invalid-later-condition",
    conditions: [
      { attribute: "region", operator: "eq", value: "sg" },
      { attribute: "tier", operator: "contains", value: "gold" },
    ],
  });
  assert.throws(
    () => evaluate([invalid], request({ region: "us", tier: "gold" })),
    (error: unknown) => error instanceof Error && error.message.includes(invalid.id),
  );
});
