import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bountyStatus,
  scopeApproved,
  stageDrift,
  stepHeldBy,
  stepHeldReason,
} from "../src/stages.js";

const PRICE_REASON = "Approve the scope before changing the price.";
const SANDBOX_SCOPE_REASON =
  "Approve the scope and the price before changing the sandbox.";
const SANDBOX_PRICE_REASON = "Approve the price before changing the sandbox.";

/** A proposal whose status may not be read. */
function unreadProposal(): { readonly status: string } {
  return {
    get status(): string {
      throw new Error("proposal read");
    },
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

test("[happy-1] a price over an approved scope is not held", () => {
  assert.equal(
    stepHeldBy("price", { version: 2, approval: { version: 2 } }, null),
    null,
  );
});

test("[happy-1] a price over a scope approved at a high version is not held", () => {
  assert.equal(
    stepHeldBy(
      "price",
      { version: 1_000_000, approval: { version: 1_000_000 } },
      null,
    ),
    null,
  );
});

test("[unhappy-1] a price over a scope not approved at its version is held by the scope", () => {
  assert.equal(stepHeldBy("price", { version: 2, approval: null }, null), "scope");
  assert.equal(
    stepHeldBy("price", { version: 3, approval: { version: 2 } }, null),
    "scope",
  );
  assert.equal(
    stepHeldBy("price", { version: 1, approval: { version: 2 } }, null),
    "scope",
  );
});

test("[unhappy-1] an approval one version off either way holds the price", () => {
  assert.equal(
    stepHeldBy("price", { version: 5, approval: { version: 4 } }, null),
    "scope",
  );
  assert.equal(
    stepHeldBy("price", { version: 5, approval: { version: 6 } }, null),
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
  assert.equal(
    stepHeldBy("price", { version: 2, approval: null }, unreadProposal()),
    "scope",
  );
  assert.equal(
    stepHeldBy("price", { version: 2, approval: { version: 2 } }, unreadProposal()),
    null,
  );
});

test("[boundary-2] version 0 approved at version 0 is approved", () => {
  assert.equal(
    stepHeldBy("price", { version: 0, approval: { version: 0 } }, null),
    null,
  );
});

test("[boundary-2] version 0 with no approval, or another version's, is not approved", () => {
  assert.equal(stepHeldBy("price", { version: 0, approval: null }, null), "scope");
  assert.equal(
    stepHeldBy("price", { version: 0, approval: { version: 1 } }, null),
    "scope",
  );
  assert.equal(
    stepHeldBy(
      "sandbox",
      { version: 0, approval: { version: 0 } },
      { status: "approved" },
    ),
    null,
  );
});

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

test("[happy-2] a sandbox over both approved at a high version is not held", () => {
  assert.equal(
    stepHeldBy(
      "sandbox",
      { version: 1_000_000, approval: { version: 1_000_000 } },
      { status: "approved" },
    ),
    null,
  );
});

test("[unhappy-2] the earliest step not approved holds the sandbox", () => {
  const rows: [
    { readonly version: number } | null,
    { readonly status: string } | null,
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
      JSON.stringify({ approval, proposal }),
    );
  }
});

test("[unhappy-2] an approval ahead of the scope holds the sandbox by the scope, whatever the price", () => {
  assert.equal(
    stepHeldBy(
      "sandbox",
      { version: 4, approval: { version: 5 } },
      { status: "approved" },
    ),
    "scope",
  );
  assert.equal(
    stepHeldBy(
      "sandbox",
      { version: 4, approval: { version: 5 } },
      { status: "proposed" },
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
      JSON.stringify(status),
    );
  }
});

test("[boundary-3] near misses of \"approved\" leave the sandbox held by the price", () => {
  for (const status of ["APPROVED", "approved\n", "approve", "approved."]) {
    assert.equal(
      stepHeldBy("sandbox", { version: 1, approval: { version: 1 } }, { status }),
      "price",
      JSON.stringify(status),
    );
  }
});

test("[boundary-4] a price behind the scope does not hold the sandbox once both are approved", () => {
  // stageDrift reports this price as behind: sized from scope version 2 of 3.
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

test("[boundary-4] drifted steps hold neither the price nor the sandbox once approved", () => {
  // Both steps behind: the price on the scope, the sandbox on the price.
  const drift = stageDrift({
    scope: { version: 3 },
    price: { version: 2, scopeVersion: null },
    sandbox: { version: 1, priceVersion: 1 },
  });
  assert.notEqual(drift.price, null);
  assert.notEqual(drift.sandbox, null);
  const bounty = { version: 3, approval: { version: 3 } };
  assert.equal(stepHeldBy("price", bounty, { status: "approved" }), null);
  assert.equal(stepHeldBy("sandbox", bounty, { status: "approved" }), null);
});

test("[boundary-5] a whole bounty with extra fields is read for its version and approval only", () => {
  const bounty = {
    version: 2,
    approval: { version: 2, by: "usr_1" },
    title: "Fix login",
    proposal: null,
    sandbox: { status: "published", expiresAt: null },
  };
  const proposal = { status: "approved", revision: 5 };
  assert.equal(stepHeldBy("sandbox", bounty, proposal), null);
});

test("[boundary-5] fields beside the version, approval and status do not approve a step", () => {
  // The bounty's own proposal field is not the proposal argument.
  const bounty = {
    version: 2,
    approval: { version: 2, status: "rejected" },
    proposal: { status: "approved" },
    sandbox: { status: "draft", expiresAt: null },
  };
  assert.equal(stepHeldBy("sandbox", bounty, null), "price");
  const proposal = { status: "proposed", approved: true };
  assert.equal(stepHeldBy("sandbox", bounty, proposal), "price");
  const unapproved = {
    version: 2,
    approval: null,
    status: "live",
    scopeApproved: true,
  };
  assert.equal(
    stepHeldBy("sandbox", unapproved, { status: "approved" }),
    "scope",
  );
});

test("[happy-3] the functions do not change their arguments", () => {
  const bounty = deepFreeze({ version: 2, approval: { version: 1 } });
  const proposal = deepFreeze({ status: "proposed" });
  assert.equal(stepHeldBy("sandbox", bounty, proposal), "scope");
  assert.deepEqual(bounty, { version: 2, approval: { version: 1 } });
  assert.deepEqual(proposal, { status: "proposed" });
});

test("[happy-3] frozen arguments come back unchanged when nothing is held", () => {
  const bounty = deepFreeze({ version: 3, approval: { version: 3 } });
  const proposal = deepFreeze({ status: "approved" });
  assert.equal(stepHeldBy("price", bounty, proposal), null);
  assert.equal(stepHeldBy("sandbox", bounty, proposal), null);
  // Called again on the same arguments, the same answer.
  assert.equal(stepHeldBy("sandbox", bounty, proposal), null);
  assert.deepEqual(bounty, { version: 3, approval: { version: 3 } });
  assert.deepEqual(proposal, { status: "approved" });
});

test("[unhappy-3] a step outside \"price\" and \"sandbox\" waits on the scope only", () => {
  const rows: [string, { readonly version: number } | null, "scope" | null][] = [
    ["scope", { version: 1 }, null],
    ["Price", { version: 1 }, null],
    ["", { version: 1 }, null],
    ["scope", null, "scope"],
    ["Price", { version: 0 }, "scope"],
  ];
  for (const [step, approval, heldBy] of rows) {
    assert.equal(
      stepHeldBy(step as never, { version: 1, approval }, null),
      heldBy,
      JSON.stringify({ step, approval }),
    );
  }
});

test("[unhappy-3] a step outside \"price\" and \"sandbox\" never reads the proposal", () => {
  for (const step of ["scope", "sandbox ", "Sandbox"]) {
    assert.equal(
      stepHeldBy(step as never, { version: 1, approval: { version: 1 } }, null),
      null,
      JSON.stringify(step),
    );
    assert.equal(
      stepHeldBy(
        step as never,
        { version: 1, approval: { version: 1 } },
        unreadProposal(),
      ),
      null,
      JSON.stringify(step),
    );
    assert.equal(
      stepHeldBy(
        step as never,
        { version: 1, approval: null },
        { status: "approved" },
      ),
      "scope",
      JSON.stringify(step),
    );
  }
});

test("[happy-4] each hold has its own words", () => {
  assert.equal(stepHeldReason("price", "scope"), PRICE_REASON);
  assert.equal(stepHeldReason("sandbox", "scope"), SANDBOX_SCOPE_REASON);
  assert.equal(stepHeldReason("sandbox", "price"), SANDBOX_PRICE_REASON);
});

test("[happy-4] each reason is one line with no surrounding whitespace, and each differs", () => {
  const reasons = [
    stepHeldReason("price", "scope"),
    stepHeldReason("sandbox", "scope"),
    stepHeldReason("sandbox", "price"),
  ];
  for (const reason of reasons) {
    assert.equal(reason, reason.trim());
    assert.ok(!reason.includes("\n"), reason);
    assert.ok(reason.length > 0);
  }
  assert.equal(new Set(reasons).size, 3);
});

test("[happy-5] every hold stepHeldBy returns has a reason", () => {
  const heldBy = stepHeldBy(
    "sandbox",
    { version: 4, approval: { version: 4 } },
    { status: "proposed" },
  );
  assert.equal(heldBy, "price");
  assert.equal(stepHeldReason("sandbox", "price"), SANDBOX_PRICE_REASON);
});

test("[happy-5] each hold stepHeldBy can return maps to its own reason", () => {
  const priceHeld = stepHeldBy("price", { version: 2, approval: null }, null);
  assert.equal(priceHeld, "scope");
  assert.equal(stepHeldReason("price", priceHeld), PRICE_REASON);

  const sandboxByScope = stepHeldBy(
    "sandbox",
    { version: 2, approval: { version: 1 } },
    { status: "approved" },
  );
  assert.equal(sandboxByScope, "scope");
  assert.equal(stepHeldReason("sandbox", sandboxByScope), SANDBOX_SCOPE_REASON);

  const sandboxByPrice = stepHeldBy(
    "sandbox",
    { version: 0, approval: { version: 0 } },
    null,
  );
  assert.equal(sandboxByPrice, "price");
  assert.equal(stepHeldReason("sandbox", sandboxByPrice), SANDBOX_PRICE_REASON);
});

test("[unhappy-4] a hold that cannot happen is not refused", () => {
  const rows: [string, string, string][] = [
    ["price", "price", PRICE_REASON],
    ["price", "sandbox", PRICE_REASON],
    ["scope", "scope", SANDBOX_SCOPE_REASON],
    ["sandbox", "sandbox", SANDBOX_PRICE_REASON],
  ];
  for (const [step, heldBy, reason] of rows) {
    assert.equal(
      stepHeldReason(step as never, heldBy as never),
      reason,
      JSON.stringify({ step, heldBy }),
    );
  }
});

test("[unhappy-4] unknown steps and holders still get one of the three sentences", () => {
  const rows: [string, string, string][] = [
    ["price", "", PRICE_REASON],
    ["price", "Scope", PRICE_REASON],
    ["", "scope", SANDBOX_SCOPE_REASON],
    ["Price", "scope", SANDBOX_SCOPE_REASON],
    ["", "", SANDBOX_PRICE_REASON],
    ["sandbox", "Scope", SANDBOX_PRICE_REASON],
    ["scope", "price", SANDBOX_PRICE_REASON],
  ];
  for (const [step, heldBy, reason] of rows) {
    assert.equal(
      stepHeldReason(step as never, heldBy as never),
      reason,
      JSON.stringify({ step, heldBy }),
    );
  }
});

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

test("[happy-6] scopeApproved holds at version 0 and bountyStatus reads only the exact status", () => {
  assert.equal(scopeApproved({ version: 0, approval: { version: 0 } }), true);
  assert.equal(scopeApproved({ version: 0, approval: null }), false);
  const now = new Date("2026-10-10T00:00:00Z");
  assert.equal(
    bountyStatus(
      {
        version: 2,
        approval: null,
        proposal: { status: "Approved" },
        sandbox: null,
      },
      now,
    ),
    "new",
  );
  assert.equal(
    bountyStatus(
      {
        version: 2,
        approval: { version: 2 },
        proposal: { status: "proposed" },
        sandbox: null,
      },
      now,
    ),
    "scoped",
  );
});
