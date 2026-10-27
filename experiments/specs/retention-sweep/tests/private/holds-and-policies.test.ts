import { test } from "node:test";
import assert from "node:assert/strict";
import { sweep } from "../../src/index.js";
import type { RetentionPolicy, RetentionRecord } from "../../src/index.js";

function record(overrides: Partial<RetentionRecord> = {}): RetentionRecord {
  return {
    id: "r1",
    category: "logs",
    created: "2020-01-01",
    holds: [],
    region: "us",
    ...overrides,
  };
}

const POLICY: RetentionPolicy = {
  categories: {
    logs: { periodDays: 30, fromLastAccess: false },
    docs: { periodDays: 90, fromLastAccess: true },
  },
  regions: [],
  graceDays: 7,
};

const RUN = "2026-03-01";

function namesId(id: string) {
  return (err: unknown) => {
    if (!(err instanceof Error)) return false;
    assert.ok(
      err.message.includes(id),
      `expected error message to name "${id}", got: ${err.message}`,
    );
    return true;
  };
}

// happy-3: A held record is kept

// extends: "[happy-3] a held record long past its period is kept for the first hold when sorted"
test("[happy-3] the reason names the first hold when sorted, wherever it sits in the list", () => {
  const records = [
    record({ id: "middle", holds: ["zulu-1", "alpha-9", "mike-3"] }),
    record({ id: "first", holds: ["bravo", "delta", "charlie"] }),
    record({ id: "last", holds: ["yankee", "xray", "kilo", "echo"] }),
  ];
  assert.deepEqual(sweep(records, POLICY, RUN), [
    { id: "middle", decision: "keep", reason: "hold:alpha-9" },
    { id: "first", decision: "keep", reason: "hold:bravo" },
    { id: "last", decision: "keep", reason: "hold:echo" },
  ]);
});

// extends: "[happy-3] a held record long past its period is kept for the first hold when sorted"
test("[happy-3] a single hold keeps the record for that hold, and a hold that prefixes another sorts first", () => {
  const records = [
    record({ id: "single", holds: ["legal-42"] }),
    record({ id: "prefix", holds: ["audit-2026", "audit"] }),
  ];
  assert.deepEqual(sweep(records, POLICY, RUN), [
    { id: "single", decision: "keep", reason: "hold:legal-42" },
    { id: "prefix", decision: "keep", reason: "hold:audit" },
  ]);
});

// extends: "[happy-3] a held record long past its period is kept for the first hold when sorted"
test("[happy-3] a held record past its period but inside the grace period is kept, not flagged", () => {
  // age 31 against a 30-day period and 7 days of grace
  const r = record({ created: "2026-01-29", holds: ["legal"] });
  assert.deepEqual(sweep([r], POLICY, RUN), [
    { id: "r1", decision: "keep", reason: "hold:legal" },
  ]);
});

test("[happy-3] a held record is kept even with a grace period of zero, and a held access-based record too", () => {
  const p: RetentionPolicy = { ...POLICY, graceDays: 0 };
  const records = [
    record({ id: "logs-held", holds: ["s2", "s1"] }),
    record({
      id: "docs-held",
      category: "docs",
      created: "2020-01-01",
      lastAccessed: "2021-01-01",
      holds: ["export"],
    }),
  ];
  assert.deepEqual(sweep(records, p, RUN), [
    { id: "logs-held", decision: "keep", reason: "hold:s1" },
    { id: "docs-held", decision: "keep", reason: "hold:export" },
  ]);
});

// extends: "[happy-3] an empty list of holds is no hold"
test("[happy-3] a hold keeps only the record it is on", () => {
  const records = [
    record({ id: "free-1" }),
    record({ id: "held", holds: ["legal"] }),
    record({ id: "free-2", holds: [] }),
    record({ id: "free-3", created: "2026-01-29" }),
  ];
  assert.deepEqual(sweep(records, POLICY, RUN), [
    { id: "free-1", decision: "delete", reason: "expired" },
    { id: "held", decision: "keep", reason: "hold:legal" },
    { id: "free-2", decision: "delete", reason: "expired" },
    { id: "free-3", decision: "flag", reason: "expired" },
  ]);
});

// extends: "[happy-3] an empty list of holds is no hold"
test("[happy-3] with an empty list of holds a record in the grace period is flagged and a recent one kept within period", () => {
  const records = [
    record({ id: "grace", created: "2026-01-29", holds: [] }),
    record({ id: "recent", created: "2026-02-20", holds: [] }),
  ];
  assert.deepEqual(sweep(records, POLICY, RUN), [
    { id: "grace", decision: "flag", reason: "expired" },
    { id: "recent", decision: "keep", reason: "within period" },
  ]);
});

// unhappy-1: A record with no policy is kept

// extends: "[unhappy-1] a record whose category is not in the policy is kept with no policy"
test("[unhappy-1] category names that are built-in object properties are not in the policy", () => {
  const names = ["constructor", "toString", "hasOwnProperty", "valueOf", "__proto__"];
  const records = names.map((category) => record({ id: `cat-${category}`, category }));
  assert.deepEqual(
    sweep(records, POLICY, RUN),
    names.map((category) => ({
      id: `cat-${category}`,
      decision: "keep",
      reason: "no policy",
    })),
  );
});

// extends: "[unhappy-1] a record whose category is not in the policy is kept with no policy"
test("[unhappy-1] a category differing from a policy category only in case is not in the policy", () => {
  const records = [
    record({ id: "upper", category: "Logs" }),
    record({ id: "spaced", category: "logs " }),
    record({ id: "exact", category: "logs" }),
  ];
  assert.deepEqual(sweep(records, POLICY, RUN), [
    { id: "upper", decision: "keep", reason: "no policy" },
    { id: "spaced", decision: "keep", reason: "no policy" },
    { id: "exact", decision: "delete", reason: "expired" },
  ]);
});

// extends: "[unhappy-1] with no categories and no grace, a very old record is still kept with no policy"
test("[unhappy-1] records with no policy are kept among records that are flagged and deleted", () => {
  const p: RetentionPolicy = {
    ...POLICY,
    regions: [{ region: "us", minimumDays: 5 }],
    graceDays: 0,
  };
  const records = [
    record({ id: "orphan-cat-1", category: "invoices", created: "1999-12-31" }),
    record({ id: "known", category: "logs" }),
    record({
      id: "orphan-cat-2",
      category: "tickets",
      created: "2001-05-05",
      lastAccessed: "2002-01-01",
    }),
  ];
  assert.deepEqual(sweep(records, p, RUN), [
    { id: "orphan-cat-1", decision: "keep", reason: "no policy" },
    { id: "known", decision: "delete", reason: "expired" },
    { id: "orphan-cat-2", decision: "keep", reason: "no policy" },
  ]);
});

// unhappy-2: Impossible dates are refused

// extends: "[unhappy-2] a record created after the run date is refused naming its id"
test("[unhappy-2] a record created the day after the run date is refused from the middle of the input", () => {
  const records = [
    record({ id: "ok-a" }),
    record({ id: "ok-b", created: "2026-02-28" }),
    record({ id: "tomorrow-rec-88", created: "2026-03-02" }),
    record({ id: "ok-c", created: RUN }),
  ];
  assert.throws(() => sweep(records, POLICY, RUN), namesId("tomorrow-rec-88"));
});

// extends: "[unhappy-2] a record created after the run date is refused naming its id"
test("[unhappy-2] a record created in the next year on an earlier month and day is refused", () => {
  const r = record({ id: "next-year-rec-5", created: "2027-01-01" });
  assert.throws(() => sweep([r], POLICY, "2026-12-31"), namesId("next-year-rec-5"));
});

// extends: "[unhappy-2] a record created after the run date is refused naming its id"
test("[unhappy-2] a held record created after the run date is still refused", () => {
  const r = record({ id: "held-future-31", created: "2026-04-01", holds: ["legal"] });
  assert.throws(() => sweep([r], POLICY, RUN), namesId("held-future-31"));
});

// extends: "[unhappy-2] a record created after the run date is refused naming its id"
test("[unhappy-2] a record with no policy created after the run date is still refused", () => {
  const r = record({ id: "nopolicy-future-64", category: "invoices", created: "2026-03-05" });
  assert.throws(() => sweep([r], POLICY, RUN), namesId("nopolicy-future-64"));
});

// extends: "[unhappy-2] a record last accessed before it was created is refused naming its id"
test("[unhappy-2] a record last accessed before it was created is refused in a category counted from creation", () => {
  const records = [
    record({ id: "ok-x", created: "2026-01-01", lastAccessed: "2026-01-05" }),
    record({
      id: "creation-backwards-12",
      category: "logs",
      created: "2026-01-10",
      lastAccessed: "2025-12-31",
    }),
  ];
  assert.throws(() => sweep(records, POLICY, RUN), namesId("creation-backwards-12"));
});

// extends: "[unhappy-2] a record last accessed after the run date is refused naming its id"
test("[unhappy-2] a record last accessed after the run date is refused in a category counted from creation", () => {
  const records = [
    record({ id: "ok-y" }),
    record({
      id: "creation-peek-77",
      category: "logs",
      created: "2026-01-10",
      lastAccessed: "2027-01-01",
    }),
  ];
  assert.throws(() => sweep(records, POLICY, RUN), namesId("creation-peek-77"));
});

// extends: "[unhappy-2] a record created and last accessed on the run date is not refused"
test("[unhappy-2] a record last accessed on its created date, or in between it and the run date, is not refused", () => {
  const records = [
    record({
      id: "same-day-access",
      category: "docs",
      created: "2026-02-01",
      lastAccessed: "2026-02-01",
    }),
    record({
      id: "between",
      category: "docs",
      created: "2025-01-01",
      lastAccessed: "2026-02-28",
    }),
    record({ id: "on-run", category: "docs", created: "2026-02-27", lastAccessed: RUN }),
  ];
  assert.deepEqual(sweep(records, POLICY, RUN), [
    { id: "same-day-access", decision: "keep", reason: "within period" },
    { id: "between", decision: "keep", reason: "within period" },
    { id: "on-run", decision: "keep", reason: "within period" },
  ]);
});
