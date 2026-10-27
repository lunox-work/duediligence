import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../../src/index.js";
import type { AccessRequest, AccessRule, Condition } from "../../src/index.js";

function rule(id: string, conditions: readonly Condition[], effect = "allow"): AccessRule {
  return { id, effect, subject: "*", action: "read", resource: "tasks/**", conditions };
}

function request(attributes: Record<string, string>): AccessRequest {
  return { subject: "u1", roles: [], action: "read", resource: "tasks/42", attributes };
}

const regionAndTier = rule("r-cond", [
  { attribute: "region", operator: "eq", value: "sg" },
  { attribute: "tier", operator: "in", value: ["gold", "platinum"] },
]);

const eqRule = rule("r-eq", [{ attribute: "region", operator: "eq", value: "sg" }]);
const neqRule = rule("r-neq", [{ attribute: "region", operator: "neq", value: "sg" }]);
const inRule = rule("r-in", [{ attribute: "region", operator: "in", value: ["sg"] }]);
const absentRule = rule("r-absent", [{ attribute: "region", operator: "absent" }]);

function matches(r: AccessRule, attributes: Record<string, string>): boolean {
  const decision = evaluate([r], request(attributes));
  return decision.effect === "allow" && decision.ruleId === r.id;
}

test("[happy-4] a rule matches when every condition holds", () => {
  assert.deepEqual(evaluate([regionAndTier], request({ region: "sg", tier: "gold" })), {
    effect: "allow",
    ruleId: "r-cond",
  });
  assert.deepEqual(evaluate([regionAndTier], request({ region: "sg", tier: "platinum" })), {
    effect: "allow",
    ruleId: "r-cond",
  });
});

test("[happy-4] a rule does not match when one condition fails", () => {
  assert.deepEqual(evaluate([regionAndTier], request({ region: "sg", tier: "silver" })), {
    effect: "deny",
    ruleId: null,
  });
});

test("[boundary-5] a missing attribute fails eq, neq and in, and satisfies absent", () => {
  assert.equal(matches(eqRule, {}), false);
  assert.equal(matches(neqRule, {}), false);
  assert.equal(matches(inRule, {}), false);
  assert.equal(matches(absentRule, {}), true);
});

test("[boundary-5] among the four rules, only the absent rule decides a request without the attribute", () => {
  assert.deepEqual(evaluate([eqRule, neqRule, inRule, absentRule], request({ tier: "gold" })), {
    effect: "allow",
    ruleId: "r-absent",
  });
});

test("[boundary-5] a present, different value satisfies neq and fails absent", () => {
  assert.equal(matches(neqRule, { region: "us" }), true);
  assert.equal(matches(absentRule, { region: "us" }), false);
  assert.equal(matches(eqRule, { region: "us" }), false);
  assert.equal(matches(inRule, { region: "us" }), false);
});

function assertThrowsNaming(fn: () => unknown, id: string): void {
  assert.throws(fn, (err: unknown) => {
    if (!(err instanceof Error)) return false;
    assert.ok(err.message.includes(id), `expected message to name ${id}: ${err.message}`);
    return true;
  });
}

test("[unhappy-2] a rule with an unknown condition operator is refused, naming its id", () => {
  const bad = rule("rule-bad-operator", [
    { attribute: "region", operator: "contains", value: "sg" },
  ]);
  assertThrowsNaming(() => evaluate([bad], request({ region: "sg" })), "rule-bad-operator");
});

test("[unhappy-2] a rule with an unknown effect is refused, naming its id", () => {
  const bad = rule("rule-bad-effect", [], "permit");
  assertThrowsNaming(() => evaluate([bad], request({})), "rule-bad-effect");
});

test("[unhappy-2] an invalid rule is refused even when it does not match and another rule does", () => {
  const good = rule("rule-good", []);
  const bad: AccessRule = {
    id: "rule-bad-unmatched",
    effect: "allow",
    subject: "nobody",
    action: "write",
    resource: "other",
    conditions: [{ attribute: "region", operator: "gt", value: "a" }],
  };
  assertThrowsNaming(() => evaluate([good, bad], request({})), "rule-bad-unmatched");
});
