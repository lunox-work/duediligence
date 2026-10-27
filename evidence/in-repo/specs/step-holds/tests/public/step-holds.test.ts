import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bountyStatus,
  scopeApproved,
  stageDrift,
  stepHeldBy,
  stepHeldReason,
} from "../src/stages.js";

function assertRangeError(fn: () => unknown, message: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof RangeError, "expected a RangeError");
    assert.equal(error.message, message);
    return true;
  });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

// Rule: the price waits on the scope.

test("[happy-1] a price over an approved scope is not held", () => {
  assert.equal(
    stepHeldBy("price", { version: 2, approval: { version: 2 } }, null),
    null,
  );
});

test("[happy-1] a price over a scope approved at a large version is not held", () => {
  const version = Number.MAX_SAFE_INTEGER;
  assert.equal(
    stepHeldBy("price", { version, approval: { version } }, null),
    null,
  );
});

test("[unhappy-1] a price over a scope not approved at its version is held by the scope", () => {
  // Never approved.
  assert.equal(stepHeldBy("price", { version: 2, approval: null }, null), "scope");
  // A version made since the approval.
  assert.equal(
    stepHeldBy("price", { version: 3, approval: { version: 2 } }, null),
    "scope",
  );
  // The approval names a version that is not current.
  assert.equal(
    stepHeldBy("price", { version: 1, approval: { version: 2 } }, null),
    "scope",
  );
});

test("[unhappy-1] an approval at version 0 does not approve a scope at version 1", () => {
  assert.equal(
    stepHeldBy("price", { version: 1, approval: { version: 0 } }, null),
    "scope",
  );
});

test("[boundary-1] the price's hold does not read the proposal", () => {
  assert.equal(
    stepHeldBy("price", { version: 2, approval: null }, { status: "approved" }),
    "scope",
  );
  assert.equal(
    stepHeldBy(
      "price",
      { version: 2, approval: { version: 2 } },
      { status: "rejected" },
    ),
    null,
  );
});

test("[boundary-1] the price's hold never touches the proposal's status", () => {
  const proposal = {
    get status(): string {
      throw new Error("the proposal was read");
    },
  };
  assert.equal(
    stepHeldBy("price", { version: 2, approval: { version: 2 } }, proposal),
    null,
  );
  assert.equal(stepHeldBy("price", { version: 2, approval: null }, proposal), "scope");
});

test("[boundary-2] version 0 approved at version 0 is approved", () => {
  assert.equal(
    stepHeldBy("price", { version: 0, approval: { version: 0 } }, null),
    null,
  );
});

test("[boundary-2] version 0 approved at version 0 lets the sandbox wait only on the price", () => {
  assert.equal(
    stepHeldBy("sandbox", { version: 0, approval: { version: 0 } }, null),
    "price",
  );
  assert.equal(
    stepHeldBy(
      "sandbox",
      { version: 0, approval: { version: 0 } },
      { status: "approved" },
    ),
    null,
  );
  // Version 0 with no approval is still not approved.
  assert.equal(stepHeldBy("price", { version: 0, approval: null }, null), "scope");
});

// Rule: the sandbox waits on the scope first, then on the price.

test("[happy-2] a sandbox over an approved scope and an approved price is not held", () => {
  assert.equal(
    stepHeldBy(
      "sandbox",
      { version: 4, approval: { version: 4 } },
      { status: "approved" },
    ),
    null,
  );
});

test("[happy-2] a sandbox over a scope approved at version 1 and an approved price is not held", () => {
  assert.equal(
    stepHeldBy(
      "sandbox",
      { version: 1, approval: { version: 1 } },
      { status: "approved" },
    ),
    null,
  );
});

test("[unhappy-2] the earliest step not approved holds the sandbox", () => {
  const rows: [
    { version: number } | null,
    { status: string } | null,
    "scope" | "price",
  ][] = [
    [null, null, "scope"],
    [null, { status: "approved" }, "scope"],
    [{ version: 3 }, { status: "approved" }, "scope"],
    [{ version: 3 }, null, "scope"],
    [{ version: 4 }, null, "price"],
    [{ version: 4 }, { status: "proposed" }, "price"],
    [{ version: 4 }, { status: "rejected" }, "price"],
    [{ version: 4 }, { status: "superseded" }, "price"],
  ];
  for (const [approval, proposal, heldBy] of rows) {
    assert.equal(
      stepHeldBy("sandbox", { version: 4, approval }, proposal),
      heldBy,
      `approval ${JSON.stringify(approval)}, proposal ${JSON.stringify(proposal)}`,
    );
  }
});

test("[unhappy-2] a scope approved at a version ahead of its own holds the sandbox before an approved price", () => {
  assert.equal(
    stepHeldBy(
      "sandbox",
      { version: 4, approval: { version: 5 } },
      { status: "approved" },
    ),
    "scope",
  );
});

test("[boundary-3] only the exact status \"approved\" approves the price", () => {
  const rows: [string, "price" | null][] = [
    ["approved", null],
    ["Approved", "price"],
    [" approved", "price"],
    ["approved ", "price"],
    ["", "price"],
  ];
  for (const [status, heldBy] of rows) {
    assert.equal(
      stepHeldBy("sandbox", { version: 1, approval: { version: 1 } }, { status }),
      heldBy,
      `status ${JSON.stringify(status)}`,
    );
  }
});

test("[boundary-3] near spellings of \"approved\" leave the price unapproved", () => {
  for (const status of ["APPROVED", "approve", "approved\n", "approved."]) {
    assert.equal(
      stepHeldBy("sandbox", { version: 1, approval: { version: 1 } }, { status }),
      "price",
      `status ${JSON.stringify(status)}`,
    );
  }
});

// Rule: only approval holds a step.

test("[boundary-4] a price behind the scope does not hold the sandbox once both are approved", () => {
  // The price was sized from scope version 2 of 3: stageDrift reports it behind.
  assert.deepEqual(
    stageDrift({
      scope: { version: 3 },
      price: { version: 1, scopeVersion: 2 },
      sandbox: null,
    }).price,
    { uses: 2, current: 3 },
  );
  assert.equal(
    stepHeldBy(
      "sandbox",
      { version: 3, approval: { version: 3 } },
      { status: "approved" },
    ),
    null,
  );
});

test("[boundary-4] a price behind the scope is itself not held once the scope is approved", () => {
  assert.equal(
    stepHeldBy(
      "price",
      { version: 3, approval: { version: 3 } },
      { status: "approved" },
    ),
    null,
  );
});

test("[boundary-5] a whole bounty with extra fields is read for its version and approval only", () => {
  assert.equal(
    stepHeldBy(
      "sandbox",
      {
        version: 2,
        approval: { version: 2, by: "usr_1" },
        title: "Fix login",
        proposal: null,
        sandbox: { status: "published", expiresAt: null },
      } as { version: number; approval: { version: number } },
      { status: "approved", revision: 5 } as { status: string },
    ),
    null,
  );
});

test("[boundary-5] a bounty's own proposal and sandbox fields do not stand in for the proposal passed", () => {
  const bounty = {
    version: 2,
    approval: { version: 2 },
    proposal: { status: "approved" },
    sandbox: { status: "published", expiresAt: null },
  };
  assert.equal(stepHeldBy("sandbox", bounty, null), "price");
  assert.equal(stepHeldBy("sandbox", bounty, { status: "proposed" }), "price");
  assert.equal(
    stepHeldBy("sandbox", { ...bounty, approval: { version: 1 } }, {
      status: "approved",
    }),
    "scope",
  );
});

test("[happy-3] the functions do not change their arguments", () => {
  const bounty = deepFreeze({ version: 2, approval: { version: 1 } });
  const proposal = deepFreeze({ status: "proposed" });
  let heldBy: "scope" | "price" | null = null;
  assert.doesNotThrow(() => {
    heldBy = stepHeldBy("sandbox", bounty, proposal);
  });
  assert.equal(heldBy, "scope");
  assert.deepEqual(bounty, { version: 2, approval: { version: 1 } });
  assert.deepEqual(proposal, { status: "proposed" });
});

test("[happy-3] frozen arguments are left as they were on every path, call after call", () => {
  const bounty = deepFreeze({ version: 4, approval: { version: 4 } });
  const approved = deepFreeze({ status: "approved" });
  const proposed = deepFreeze({ status: "proposed" });
  for (let i = 0; i < 2; i++) {
    assert.equal(stepHeldBy("price", bounty, proposed), null);
    assert.equal(stepHeldBy("sandbox", bounty, approved), null);
    assert.equal(stepHeldBy("sandbox", bounty, proposed), "price");
  }
  assert.deepEqual(bounty, { version: 4, approval: { version: 4 } });
  assert.deepEqual(approved, { status: "approved" });
  assert.deepEqual(proposed, { status: "proposed" });
});

// Rule: only the price and the sandbox can be held.

test("[unhappy-3] a step outside \"price\" and \"sandbox\" is refused", () => {
  for (const step of ["scope", "Price", ""]) {
    assertRangeError(
      () =>
        stepHeldBy(
          step as never,
          { version: 1, approval: { version: 1 } },
          { status: "approved" },
        ),
      `Unknown held step: "${step}"`,
    );
  }
});

test("[unhappy-3] an unknown step is refused rather than reported held, whatever the approvals", () => {
  for (const step of ["scope", "sandbox ", " price"]) {
    assertRangeError(
      () => stepHeldBy(step as never, { version: 2, approval: null }, null),
      `Unknown held step: "${step}"`,
    );
  }
});

// Rule: the reason names the held step and the step holding it.

test("[happy-4] each hold has its own words", () => {
  assert.equal(
    stepHeldReason("price", "scope"),
    "The price waits on the scope: approve the scope first.",
  );
  assert.equal(
    stepHeldReason("sandbox", "scope"),
    "The sandbox waits on the scope: approve the scope first.",
  );
  assert.equal(
    stepHeldReason("sandbox", "price"),
    "The sandbox waits on the price: approve the price first.",
  );
});

test("[happy-4] every reason is one line with no surrounding whitespace", () => {
  const pairs: ["price" | "sandbox", "scope" | "price"][] = [
    ["price", "scope"],
    ["sandbox", "scope"],
    ["sandbox", "price"],
  ];
  const reasons = new Set<string>();
  for (const [step, heldBy] of pairs) {
    const reason = stepHeldReason(step, heldBy);
    assert.equal(reason, reason.trim());
    assert.equal(reason.includes("\n"), false);
    reasons.add(reason);
  }
  assert.equal(reasons.size, 3);
});

test("[happy-5] every hold stepHeldBy returns has a reason", () => {
  const heldBy = stepHeldBy(
    "sandbox",
    { version: 4, approval: { version: 4 } },
    { status: "proposed" },
  );
  assert.equal(heldBy, "price");
  assert.equal(
    stepHeldReason("sandbox", heldBy),
    "The sandbox waits on the price: approve the price first.",
  );
});

test("[happy-5] every hold stepHeldBy can return, for either step, has its reason", () => {
  const approvals = [null, { version: 3 }, { version: 4 }];
  const proposals = [null, { status: "proposed" }, { status: "approved" }];
  for (const step of ["price", "sandbox"] as const) {
    for (const approval of approvals) {
      for (const proposal of proposals) {
        const heldBy = stepHeldBy(step, { version: 4, approval }, proposal);
        if (heldBy === null) continue;
        assert.equal(
          stepHeldReason(step, heldBy),
          `The ${step} waits on the ${heldBy}: approve the ${heldBy} first.`,
        );
      }
    }
  }
});

test("[unhappy-4] a hold that cannot happen is refused", () => {
  const pairs: [string, string][] = [
    ["price", "price"],
    ["scope", "scope"],
    ["price", "sandbox"],
    ["sandbox", "sandbox"],
  ];
  for (const [step, heldBy] of pairs) {
    assertRangeError(
      () => stepHeldReason(step as never, heldBy as never),
      `No hold of "${step}" by "${heldBy}"`,
    );
  }
});

test("[unhappy-4] values outside the declared unions are refused", () => {
  const pairs: [string, string][] = [
    ["scope", "price"],
    ["Sandbox", "scope"],
    ["price", "Scope"],
    ["", ""],
  ];
  for (const [step, heldBy] of pairs) {
    assertRangeError(
      () => stepHeldReason(step as never, heldBy as never),
      `No hold of "${step}" by "${heldBy}"`,
    );
  }
});

// Rule: existing stage exports keep their behaviour.

test("[happy-6] scopeApproved and bountyStatus are unchanged", () => {
  assert.equal(scopeApproved({ version: 3, approval: { version: 2 } }), false);
  assert.equal(
    bountyStatus(
      {
        version: 2,
        approval: null,
        proposal: { status: "approved" },
        sandbox: null,
      },
      new Date("2026-10-10T00:00:00Z"),
    ),
    "priced",
  );
});

test("[happy-6] scopeApproved still counts version 0 approved at version 0", () => {
  assert.equal(scopeApproved({ version: 0, approval: { version: 0 } }), true);
  assert.equal(scopeApproved({ version: 0, approval: null }), false);
});
