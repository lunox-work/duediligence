import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bountyStatus,
  scopeApproved,
  stageDrift,
  stepHeldBy,
} from "../../src/stages.js";

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

/** A proxy over `target` that fails the test on any write to it. */
function writeGuard<T extends object>(target: T, name: string): T {
  const fail = (): never => {
    throw new Error(`${name} was changed`);
  };
  return new Proxy(target, {
    set: fail,
    defineProperty: fail,
    deleteProperty: fail,
    setPrototypeOf: fail,
    preventExtensions: fail,
  });
}

const ANY_PROPOSALS: ({ status: string } | null)[] = [
  null,
  { status: "approved" },
  { status: "proposed" },
  { status: "rejected" },
  { status: "superseded" },
  { status: "Approved" },
  { status: "" },
];

// Rule: the price waits on the scope.

// Extends "[happy-1] a price over an approved scope is not held": other
// versions, and every kind of proposal beside it.
test("[happy-1] a price over a scope approved at other versions is not held, whatever the proposal", () => {
  for (const version of [1, 3, 7, 42, 1000, 2 ** 31, 2 ** 32 + 1]) {
    for (const proposal of ANY_PROPOSALS) {
      assert.equal(
        stepHeldBy("price", { version, approval: { version } }, proposal),
        null,
        `version ${version}, proposal ${JSON.stringify(proposal)}`,
      );
    }
  }
});

// Extends "[unhappy-1] a price over a scope not approved at its version is
// held by the scope": other versions, approvals one either side, and
// versions a truncating comparison would confuse.
test("[unhappy-1] a price over a scope approved at any other version is held by the scope", () => {
  const rows: [number, { version: number } | null][] = [
    [5, null],
    [0, { version: 1 }],
    [10, { version: 9 }],
    [10, { version: 11 }],
    [2, { version: 20 }],
    [Number.MAX_SAFE_INTEGER, { version: Number.MAX_SAFE_INTEGER - 1 }],
    [2 ** 32, { version: 0 }],
    [2 ** 32 + 3, { version: 3 }],
  ];
  for (const [version, approval] of rows) {
    assert.equal(
      stepHeldBy("price", { version, approval }, null),
      "scope",
      `version ${version}, approval ${JSON.stringify(approval)}`,
    );
  }
});

// Extends "[unhappy-1] ...": an approved proposal does not lift the price's
// hold on an unapproved scope.
test("[unhappy-1] a price over an unapproved scope is held by the scope even beside an approved proposal", () => {
  for (const approval of [null, { version: 6 }, { version: 8 }]) {
    assert.equal(
      stepHeldBy("price", { version: 7, approval }, { status: "approved" }),
      "scope",
      `approval ${JSON.stringify(approval)}`,
    );
  }
});

// The scope is approved exactly when approval.version === version, which
// NaN never is.
test("[unhappy-1] a scope at version NaN is never approved", () => {
  assert.equal(
    stepHeldBy("price", { version: NaN, approval: { version: NaN } }, null),
    "scope",
  );
});

// Extends "[boundary-1] the price's hold does not read the proposal": a
// proposal that fails on any reach into it, and a grid of scopes and
// proposals where the price's hold follows the scope alone.
test("[boundary-1] the price's hold reaches into no part of the proposal", () => {
  const fail = (): never => {
    throw new Error("the proposal was read");
  };
  const proposal = new Proxy({} as { status: string }, {
    get: fail,
    has: fail,
    ownKeys: fail,
    getOwnPropertyDescriptor: fail,
    getPrototypeOf: fail,
  });
  assert.equal(
    stepHeldBy("price", { version: 9, approval: { version: 9 } }, proposal),
    null,
  );
  assert.equal(
    stepHeldBy("price", { version: 9, approval: { version: 8 } }, proposal),
    "scope",
  );
  assert.equal(stepHeldBy("price", { version: 0, approval: null }, proposal), "scope");
});

test("[boundary-1] the price is never held by the price, whatever the proposal", () => {
  for (const version of [0, 1, 4]) {
    for (const approval of [null, { version }, { version: version + 1 }]) {
      const scope = approval !== null && approval.version === version;
      for (const proposal of ANY_PROPOSALS) {
        assert.equal(
          stepHeldBy("price", { version, approval }, proposal),
          scope ? null : "scope",
          `version ${version}, approval ${JSON.stringify(approval)}, proposal ${JSON.stringify(proposal)}`,
        );
      }
    }
  }
});

// Extends "[boundary-2] version 0 approved at version 0 is approved": with
// every proposal for the price, and -0, which === takes as 0.
test("[boundary-2] version 0 approved at version 0 frees the price whatever the proposal", () => {
  for (const proposal of ANY_PROPOSALS) {
    assert.equal(
      stepHeldBy("price", { version: 0, approval: { version: 0 } }, proposal),
      null,
      `proposal ${JSON.stringify(proposal)}`,
    );
  }
  assert.equal(
    stepHeldBy("price", { version: 0, approval: { version: -0 } }, null),
    null,
  );
  assert.equal(
    stepHeldBy("sandbox", { version: -0, approval: { version: 0 } }, {
      status: "approved",
    }),
    null,
  );
});

test("[boundary-2] version 0 approved at version 0 holds the sandbox on a price not approved", () => {
  for (const status of ["proposed", "rejected", "superseded", "", "Approved"]) {
    assert.equal(
      stepHeldBy("sandbox", { version: 0, approval: { version: 0 } }, { status }),
      "price",
      `status ${JSON.stringify(status)}`,
    );
  }
  // An approval at version 0 does not approve a later version for the sandbox either.
  assert.equal(
    stepHeldBy("sandbox", { version: 1, approval: { version: 0 } }, {
      status: "approved",
    }),
    "scope",
  );
});

// Rule: the sandbox waits on the scope first, then on the price.

// Extends "[happy-2] a sandbox over an approved scope and an approved price
// is not held": more versions.
test("[happy-2] a sandbox over an approved scope and an approved price is not held at other versions", () => {
  for (const version of [2, 3, 9, 100, 2 ** 32, Number.MAX_SAFE_INTEGER]) {
    assert.equal(
      stepHeldBy("sandbox", { version, approval: { version } }, {
        status: "approved",
      }),
      null,
      `version ${version}`,
    );
  }
});

// Extends "[unhappy-2] the earliest step not approved holds the sandbox":
// a version other than 4, approvals either side, and more statuses.
test("[unhappy-2] the earliest step not approved holds the sandbox at another version", () => {
  const approvals: ({ version: number } | null)[] = [
    null,
    { version: 6 },
    { version: 8 },
    { version: 0 },
  ];
  for (const approval of approvals) {
    for (const proposal of ANY_PROPOSALS) {
      assert.equal(
        stepHeldBy("sandbox", { version: 7, approval }, proposal),
        "scope",
        `approval ${JSON.stringify(approval)}, proposal ${JSON.stringify(proposal)}`,
      );
    }
  }
  for (const proposal of ANY_PROPOSALS) {
    assert.equal(
      stepHeldBy("sandbox", { version: 7, approval: { version: 7 } }, proposal),
      proposal !== null && proposal.status === "approved" ? null : "price",
      `proposal ${JSON.stringify(proposal)}`,
    );
  }
});

// A price shortcut that answers "price" for a missing price before looking
// at the scope gets this wrong.
test("[unhappy-2] a sandbox with neither step approved is held by the scope, not the price", () => {
  for (const version of [0, 1, 12]) {
    assert.equal(stepHeldBy("sandbox", { version, approval: null }, null), "scope");
    assert.equal(
      stepHeldBy("sandbox", { version, approval: { version: version + 1 } }, {
        status: "rejected",
      }),
      "scope",
    );
  }
});

// Extends "[boundary-3] only the exact status \"approved\" approves the
// price": casings, whitespace, prefixes, suffixes, look-alikes, and
// statuses that merely contain the word.
test("[boundary-3] statuses that only resemble \"approved\" leave the price unapproved", () => {
  const statuses = [
    "aPPROVED",
    "ApProVeD",
    "\tapproved",
    "approved\t",
    " approved ",
    "approved\r\n",
    "approvedd",
    "approve",
    "approve d",
    "unapproved",
    "not approved",
    "pre-approved",
    "approved_by_owner",
    "approved:true",
    "аpproved",
    "approved​",
    "ａｐｐｒｏｖｅｄ",
    "approved\u0000",
    "true",
    "null",
  ];
  for (const status of statuses) {
    assert.equal(
      stepHeldBy("sandbox", { version: 3, approval: { version: 3 } }, { status }),
      "price",
      `status ${JSON.stringify(status)}`,
    );
  }
});

test("[boundary-3] the exact status \"approved\" approves the price however the string was made", () => {
  const status = ["appr", "oved"].join("");
  assert.equal(
    stepHeldBy("sandbox", { version: 5, approval: { version: 5 } }, { status }),
    null,
  );
  assert.equal(
    stepHeldBy("sandbox", { version: 5, approval: { version: 5 } }, {
      status: "APPROVED".toLowerCase(),
    }),
    null,
  );
});

// Rule: only approval holds a step.

// Extends "[boundary-4] a price behind the scope does not hold the sandbox
// once both are approved": a price sized from text no version said, and a
// sandbox behind the price too.
test("[boundary-4] drift on the price and on the sandbox leaves approved steps unheld", () => {
  const drift = stageDrift({
    scope: { version: 5 },
    price: { version: 3, scopeVersion: null },
    sandbox: { version: 2, priceVersion: 1 },
  });
  assert.deepEqual(drift, {
    price: { uses: null, current: 5 },
    sandbox: { uses: 1, current: 3 },
  });
  const bounty = { version: 5, approval: { version: 5 } };
  assert.equal(stepHeldBy("price", bounty, { status: "approved" }), null);
  assert.equal(stepHeldBy("sandbox", bounty, { status: "approved" }), null);
});

test("[boundary-4] no drift does not stand in for an approval", () => {
  // Every step stands on the latest before it, yet nothing is approved.
  assert.deepEqual(
    stageDrift({
      scope: { version: 2 },
      price: { version: 1, scopeVersion: 2 },
      sandbox: { version: 1, priceVersion: 1 },
    }),
    { price: null, sandbox: null },
  );
  assert.equal(stepHeldBy("price", { version: 2, approval: null }, null), "scope");
  assert.equal(
    stepHeldBy("sandbox", { version: 2, approval: { version: 2 } }, {
      status: "proposed",
    }),
    "price",
  );
});

// Extends "[boundary-5] a whole bounty with extra fields is read for its
// version and approval only": extra fields that claim the opposite of what
// the version and approval say.
test("[boundary-5] extra fields claiming approval do not lift a hold", () => {
  const bounty = {
    version: 3,
    approval: null,
    approved: true,
    scopeApproved: true,
    status: "priced",
    heldBy: null,
    scope: { version: 3, approval: { version: 3 } },
  };
  assert.equal(stepHeldBy("price", bounty, null), "scope");
  assert.equal(stepHeldBy("sandbox", bounty, { status: "approved" }), "scope");
  const scoped = {
    version: 3,
    approval: { version: 3 },
    price: { status: "approved" },
  };
  const proposal = { status: "proposed", approved: true, version: 3 };
  assert.equal(stepHeldBy("sandbox", scoped, proposal), "price");
});

test("[boundary-5] extra fields denying approval do not add a hold", () => {
  const bounty = {
    version: 3,
    approval: { version: 3, approved: false, status: "rejected" },
    approved: false,
    scopeApproved: false,
    status: "new",
    heldBy: "scope",
    proposal: { status: "rejected" },
  };
  const proposal = { status: "approved", approved: false, revision: 0 };
  assert.equal(stepHeldBy("price", bounty, null), null);
  assert.equal(stepHeldBy("sandbox", bounty, proposal), null);
});

test("[boundary-5] the sandbox's own status and lapse do not change the hold", () => {
  const now = new Date("2026-10-10T00:00:00Z");
  const sandboxes = [
    null,
    { status: "draft" as const },
    { status: "published" as const, expiresAt: null },
    { status: "published" as const, expiresAt: "2026-10-01T00:00:00Z" },
    { status: "published" as const, expiresAt: "2026-12-01T00:00:00Z" },
  ];
  for (const sandbox of sandboxes) {
    // A live bounty whose scope has been edited since its approval.
    const edited = {
      version: 3,
      approval: { version: 2 },
      proposal: { status: "approved" },
      sandbox,
    };
    assert.equal(stepHeldBy("sandbox", edited, edited.proposal), "scope");
    const scoped = {
      version: 3,
      approval: { version: 3 },
      proposal: { status: "proposed" },
      sandbox,
    };
    assert.equal(stepHeldBy("sandbox", scoped, scoped.proposal), "price");
    const priced = { ...scoped, proposal: { status: "approved" } };
    assert.equal(stepHeldBy("sandbox", priced, priced.proposal), null);
  }
  // bountyStatus calls the edited bounty live, yet its sandbox waits on the scope.
  const live = {
    version: 3,
    approval: { version: 2 },
    proposal: { status: "approved" },
    sandbox: { status: "published" as const, expiresAt: null },
  };
  assert.equal(bountyStatus(live, now), "live");
  assert.equal(stepHeldBy("sandbox", live, live.proposal), "scope");
});

// Extends "[happy-3] the functions do not change their arguments": the
// price's path too, unfrozen arguments watched for any write, and the
// nested approval left the same object.
test("[happy-3] no path writes to the bounty, its approval or the proposal", () => {
  const approval = writeGuard({ version: 6 }, "approval");
  const bounty = writeGuard({ version: 6, approval }, "bounty");
  const stale = writeGuard(
    { version: 7, approval: writeGuard({ version: 6 }, "approval") },
    "bounty",
  );
  const approved = writeGuard({ status: "approved" }, "proposal");
  const proposed = writeGuard({ status: "proposed" }, "proposal");
  assert.equal(stepHeldBy("price", bounty, approved), null);
  assert.equal(stepHeldBy("price", stale, proposed), "scope");
  assert.equal(stepHeldBy("sandbox", bounty, approved), null);
  assert.equal(stepHeldBy("sandbox", bounty, proposed), "price");
  assert.equal(stepHeldBy("sandbox", bounty, null), "price");
  assert.equal(stepHeldBy("sandbox", stale, approved), "scope");
  assert.equal(bounty.approval, approval);
  assert.deepEqual(bounty, { version: 6, approval: { version: 6 } });
  assert.deepEqual(stale, { version: 7, approval: { version: 6 } });
  assert.deepEqual(approved, { status: "approved" });
  assert.deepEqual(proposed, { status: "proposed" });
});

test("[happy-3] deeply frozen arguments with extra fields pass through every outcome", () => {
  const bounty = deepFreeze({
    version: 2,
    approval: { version: 1, by: "usr_1" },
    sandbox: { status: "published", expiresAt: null },
  });
  const proposal = deepFreeze({ status: "proposed", revision: 2 });
  assert.equal(stepHeldBy("price", bounty, proposal), "scope");
  assert.equal(stepHeldBy("sandbox", bounty, proposal), "scope");
  const scoped = deepFreeze({ version: 1, approval: { version: 1 } });
  assert.equal(stepHeldBy("price", scoped, null), null);
  assert.equal(stepHeldBy("sandbox", scoped, proposal), "price");
  assert.deepEqual(bounty, {
    version: 2,
    approval: { version: 1, by: "usr_1" },
    sandbox: { status: "published", expiresAt: null },
  });
  assert.deepEqual(proposal, { status: "proposed", revision: 2 });
  assert.deepEqual(scoped, { version: 1, approval: { version: 1 } });
});

// Rule: only the price and the sandbox can be held.

// Extends "[unhappy-3] a step outside \"price\" and \"sandbox\" is refused":
// more values, including names every object inherits, which a lookup table
// keyed by step would mistake for known steps.
test("[unhappy-3] steps that are names objects inherit are refused", () => {
  for (const step of [
    "toString",
    "constructor",
    "__proto__",
    "hasOwnProperty",
    "valueOf",
    "length",
  ]) {
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

test("[unhappy-3] other unknown steps are refused, whatever the bounty and proposal", () => {
  const steps = ["SANDBOX", "PRICE", "prices", "scopes", "price sandbox", "null", "0"];
  const cases: [
    { version: number; approval: { version: number } | null },
    { status: string } | null,
  ][] = [
    [{ version: 0, approval: { version: 0 } }, { status: "approved" }],
    [{ version: 0, approval: null }, null],
    [{ version: 5, approval: { version: 5 } }, { status: "proposed" }],
    [{ version: 5, approval: { version: 4 } }, { status: "approved" }],
  ];
  for (const step of steps) {
    for (const [bounty, proposal] of cases) {
      assertRangeError(
        () => stepHeldBy(step as never, bounty, proposal),
        `Unknown held step: "${step}"`,
      );
    }
  }
});

// Rule: existing stage exports keep their behaviour.

// Extends "[happy-6] scopeApproved and bountyStatus are unchanged": the
// price's hold names the scope exactly when scopeApproved says it is not
// approved.
test("[happy-6] scopeApproved is unchanged and agrees with the price's hold", () => {
  assert.equal(scopeApproved({ version: 3, approval: { version: 3 } }), true);
  assert.equal(scopeApproved({ version: 3, approval: { version: 4 } }), false);
  assert.equal(scopeApproved({ version: 3, approval: null }), false);
  for (const version of [0, 1, 2, 9]) {
    for (const approval of [null, { version }, { version: version + 1 }, { version: version - 1 }]) {
      const bounty = { version, approval };
      assert.equal(
        stepHeldBy("price", bounty, null),
        scopeApproved(bounty) ? null : "scope",
        `version ${version}, approval ${JSON.stringify(approval)}`,
      );
    }
  }
});

test("[happy-6] bountyStatus is unchanged and its furthest step does not lift a hold", () => {
  const now = new Date("2026-10-10T00:00:00Z");
  const base = { version: 2, approval: null, proposal: null, sandbox: null };
  assert.equal(bountyStatus(base, now), "new");
  const scoped = { ...base, approval: { version: 2 }, proposal: { status: "proposed" } };
  assert.equal(bountyStatus(scoped, now), "scoped");
  assert.equal(stepHeldBy("sandbox", scoped, scoped.proposal), "price");
  // Priced with its scope never approved: the sandbox still waits on the scope.
  const priced = { ...base, proposal: { status: "approved" } };
  assert.equal(bountyStatus(priced, now), "priced");
  assert.equal(stepHeldBy("sandbox", priced, priced.proposal), "scope");
  assert.equal(stepHeldBy("price", priced, priced.proposal), "scope");
});
