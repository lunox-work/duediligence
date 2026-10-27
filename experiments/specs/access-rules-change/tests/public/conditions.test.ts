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

const regionAndTier = rule("gated", "allow", "*", "read", "tasks/42", [
  { attribute: "region", operator: "eq", value: "sg" },
  { attribute: "tier", operator: "in", value: ["gold", "platinum"] },
]);

test("[happy-5] a rule matches when every condition holds", () => {
  for (const tier of ["gold", "platinum"]) {
    const request = req("u1", "read", "tasks/42", [], { region: "sg", tier });
    assert.deepEqual(evaluate([regionAndTier], request), {
      effect: "allow",
      ruleId: "gated",
    });
  }
});

test("[happy-5] a rule does not match when any one condition fails", () => {
  assert.deepEqual(
    evaluate(
      [regionAndTier],
      req("u1", "read", "tasks/42", [], { region: "sg", tier: "silver" }),
    ),
    DENIED,
  );
  assert.deepEqual(
    evaluate(
      [regionAndTier],
      req("u1", "read", "tasks/42", [], { region: "us", tier: "gold" }),
    ),
    DENIED,
  );
  assert.deepEqual(
    evaluate([regionAndTier], req("u1", "read", "tasks/42", [], { region: "sg" })),
    DENIED,
  );
});

const eqRule = rule("eq", "allow", "*", "read", "tasks/42", [
  { attribute: "region", operator: "eq", value: "sg" },
]);
const neqRule = rule("neq", "allow", "*", "read", "tasks/42", [
  { attribute: "region", operator: "neq", value: "sg" },
]);
const inRule = rule("in", "allow", "*", "read", "tasks/42", [
  { attribute: "region", operator: "in", value: ["sg"] },
]);
const absentRule = rule("absent", "allow", "*", "read", "tasks/42", [
  { attribute: "region", operator: "absent" },
]);

test("[boundary-8] with the attribute missing, only the absent condition holds", () => {
  const request = req("u1", "read", "tasks/42", [], { tier: "gold" });
  assert.deepEqual(evaluate([eqRule], request), DENIED);
  assert.deepEqual(evaluate([neqRule], request), DENIED);
  assert.deepEqual(evaluate([inRule], request), DENIED);
  assert.deepEqual(evaluate([absentRule], request), {
    effect: "allow",
    ruleId: "absent",
  });
});

test("[boundary-8] with the attribute present and different, neq holds and absent does not", () => {
  const request = req("u1", "read", "tasks/42", [], { region: "us" });
  assert.deepEqual(evaluate([neqRule], request), { effect: "allow", ruleId: "neq" });
  assert.deepEqual(evaluate([absentRule], request), DENIED);
  assert.deepEqual(evaluate([eqRule], request), DENIED);
  assert.deepEqual(evaluate([inRule], request), DENIED);
});

function assertRefusesNaming(rules: AccessRule[], request: AccessRequest, id: string) {
  assert.throws(
    () => evaluate(rules, request),
    (err: unknown) => err instanceof Error && err.message.includes(id),
  );
}

test("[unhappy-2] a rule with an unknown operator or effect is refused, naming its id", () => {
  const request = req("u1", "read", "tasks/42", [], { region: "sg" });
  assertRefusesNaming(
    [
      rule("bad-operator-rule", "allow", "u1", "read", "tasks/42", [
        { attribute: "region", operator: "contains", value: "sg" },
      ]),
    ],
    request,
    "bad-operator-rule",
  );
  assertRefusesNaming(
    [rule("bad-effect-rule", "permit", "u1", "read", "tasks/42")],
    request,
    "bad-effect-rule",
  );
});

test("[unhappy-2] an invalid rule is refused even when it does not match and a valid rule does", () => {
  const valid = rule("valid", "allow", "u1", "read", "tasks/42");
  const badOperator = rule("bad-operator-rule", "deny", "u9", "write", "projects/1", [
    { attribute: "region", operator: "EQ", value: "sg" },
  ]);
  const badEffect = rule("bad-effect-rule", "Allow", "u9", "write", "projects/1");
  const request = req("u1", "read", "tasks/42", [], { region: "sg" });
  assertRefusesNaming([valid, badOperator], request, "bad-operator-rule");
  assertRefusesNaming([badEffect, valid], request, "bad-effect-rule");
});
