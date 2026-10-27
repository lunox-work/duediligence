import assert from "node:assert/strict";
import { test } from "node:test";

import { stepHeldBy, stepHeldReason } from "../../src/stages.js";

function assertRangeError(fn: () => unknown, message: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof RangeError, "expected a RangeError");
    assert.equal(error.message, message);
    return true;
  });
}

/** The hold the spec defines, written out from its rules. */
function expectedHold(
  step: "price" | "sandbox",
  bounty: { version: number; approval: { version: number } | null },
  proposal: { status: string } | null,
): "scope" | "price" | null {
  const scope =
    bounty.approval !== null && bounty.approval.version === bounty.version;
  if (!scope) return "scope";
  if (step === "price") return null;
  return proposal !== null && proposal.status === "approved" ? null : "price";
}

const REASONS: ["price" | "sandbox", "scope" | "price", string][] = [
  ["price", "scope", "The price waits on the scope: approve the scope first."],
  ["sandbox", "scope", "The sandbox waits on the scope: approve the scope first."],
  ["sandbox", "price", "The sandbox waits on the price: approve the price first."],
];

// Rule: the reason names the held step and the step holding it.

// Extends "[happy-4] each hold has its own words": called in another order
// and again, each pair keeps exactly its own words.
test("[happy-4] each hold keeps its own words in any order of calls", () => {
  for (let round = 0; round < 3; round++) {
    for (const [step, heldBy, reason] of [...REASONS].reverse()) {
      assert.equal(stepHeldReason(step, heldBy), reason, `${step} by ${heldBy}`);
    }
  }
  assert.equal(
    stepHeldReason("sandbox", "price"),
    "The sandbox waits on the price: approve the price first.",
  );
  assert.equal(
    stepHeldReason("price", "scope"),
    "The price waits on the scope: approve the scope first.",
  );
});

// Extends "[happy-4] every reason is one line with no surrounding
// whitespace": each reason is a single sentence ending in its one full stop.
test("[happy-4] each reason is a single sentence ending in one full stop", () => {
  for (const [step, heldBy] of REASONS) {
    const reason = stepHeldReason(step, heldBy);
    assert.equal(typeof reason, "string");
    assert.equal(reason.startsWith("The "), true);
    assert.equal(reason.endsWith(" first."), true);
    assert.equal(reason.split(".").length, 2);
    assert.match(reason, /^[^\s].*[^\s]$/);
    assert.equal(/[\r\n\t]/.test(reason), false);
  }
});

// Extends "[happy-5] every hold stepHeldBy returns has a reason": a wider
// grid of versions, approvals and statuses, checking both the hold and its
// words against the spec's rules.
test("[happy-5] every hold over a wide grid is the one the rules give, and has its reason", () => {
  const approvalsFor = (version: number) => [
    null,
    { version },
    { version: version + 1 },
    { version: version - 1 },
  ];
  const proposals = [
    null,
    { status: "approved" },
    { status: "proposed" },
    { status: "rejected" },
    { status: "superseded" },
    { status: "Approved" },
    { status: "" },
  ];
  const seen = new Set<string>();
  for (const step of ["price", "sandbox"] as const) {
    for (const version of [0, 1, 2, 5, 100]) {
      for (const approval of approvalsFor(version)) {
        for (const proposal of proposals) {
          const bounty = { version, approval };
          const heldBy = stepHeldBy(step, bounty, proposal);
          const label = `${step}, version ${version}, approval ${JSON.stringify(approval)}, proposal ${JSON.stringify(proposal)}`;
          assert.equal(heldBy, expectedHold(step, bounty, proposal), label);
          if (heldBy === null) continue;
          seen.add(`${step}/${heldBy}`);
          assert.equal(
            stepHeldReason(step, heldBy),
            `The ${step} waits on the ${heldBy}: approve the ${heldBy} first.`,
            label,
          );
        }
      }
    }
  }
  assert.deepEqual([...seen].sort(), ["price/scope", "sandbox/price", "sandbox/scope"]);
});

test("[happy-5] the price's hold by the scope has its reason", () => {
  const heldBy = stepHeldBy("price", { version: 3, approval: { version: 2 } }, {
    status: "approved",
  });
  assert.equal(heldBy, "scope");
  assert.equal(
    stepHeldReason("price", heldBy),
    "The price waits on the scope: approve the scope first.",
  );
});

// Extends "[unhappy-4] a hold that cannot happen is refused": the valid
// pairs reversed, and names every object inherits, which a lookup table of
// reasons would mistake for known steps.
test("[unhappy-4] the valid pairs reversed are refused", () => {
  const pairs: [string, string][] = [
    ["scope", "price"],
    ["scope", "sandbox"],
    ["price", "sandbox"],
  ];
  for (const [step, heldBy] of pairs) {
    assertRangeError(
      () => stepHeldReason(step as never, heldBy as never),
      `No hold of "${step}" by "${heldBy}"`,
    );
  }
});

test("[unhappy-4] pairs naming what objects inherit are refused", () => {
  const pairs: [string, string][] = [
    ["toString", "scope"],
    ["price", "toString"],
    ["sandbox", "constructor"],
    ["constructor", "constructor"],
    ["__proto__", "scope"],
    ["sandbox", "__proto__"],
    ["hasOwnProperty", "price"],
    ["price", "valueOf"],
    ["sandbox", "length"],
  ];
  for (const [step, heldBy] of pairs) {
    assertRangeError(
      () => stepHeldReason(step as never, heldBy as never),
      `No hold of "${step}" by "${heldBy}"`,
    );
  }
});

test("[unhappy-4] near spellings of valid pairs are refused", () => {
  const pairs: [string, string][] = [
    ["sandbox ", "scope"],
    [" price", "scope"],
    ["sandbox", "price "],
    ["sandbox", "Price"],
    ["SANDBOX", "SCOPE"],
    ["Price", "Scope"],
    ["sandboxes", "scope"],
    ["price", "scopes"],
    ["sandbox", ""],
    ["", "scope"],
  ];
  for (const [step, heldBy] of pairs) {
    assertRangeError(
      () => stepHeldReason(step as never, heldBy as never),
      `No hold of "${step}" by "${heldBy}"`,
    );
  }
});
