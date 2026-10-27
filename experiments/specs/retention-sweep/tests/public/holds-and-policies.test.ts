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

test("[happy-3] a held record long past its period is kept for the first hold when sorted", () => {
  const r = record({ holds: ["litigation-7", "audit-2026"] });
  assert.deepEqual(sweep([r], POLICY, RUN), [
    { id: "r1", decision: "keep", reason: "hold:audit-2026" },
  ]);
});

test("[happy-3] an empty list of holds is no hold", () => {
  const r = record({ holds: [] });
  assert.deepEqual(sweep([r], POLICY, RUN), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
});

// unhappy-1: A record with no policy is kept

test("[unhappy-1] a record whose category is not in the policy is kept with no policy", () => {
  const r = record({ category: "invoices" });
  assert.deepEqual(sweep([r], POLICY, RUN), [
    { id: "r1", decision: "keep", reason: "no policy" },
  ]);
});

test("[unhappy-1] with no categories and no grace, a very old record is still kept with no policy", () => {
  const empty: RetentionPolicy = { categories: {}, regions: [], graceDays: 0 };
  const r = record({ created: "2000-01-01" });
  assert.deepEqual(sweep([r], empty, RUN), [
    { id: "r1", decision: "keep", reason: "no policy" },
  ]);
});

// unhappy-2: Impossible dates are refused

test("[unhappy-2] a record created after the run date is refused naming its id", () => {
  const records = [
    record({ id: "fine-1" }),
    record({ id: "future-rec-42", created: "2026-03-02" }),
  ];
  assert.throws(() => sweep(records, POLICY, RUN), namesId("future-rec-42"));
});

test("[unhappy-2] a record last accessed before it was created is refused naming its id", () => {
  const r = record({
    id: "backwards-rec-17",
    category: "docs",
    created: "2026-01-10",
    lastAccessed: "2026-01-09",
  });
  assert.throws(() => sweep([r], POLICY, RUN), namesId("backwards-rec-17"));
});

test("[unhappy-2] a record last accessed after the run date is refused naming its id", () => {
  const r = record({
    id: "peeked-rec-23",
    category: "docs",
    created: "2026-01-10",
    lastAccessed: "2026-03-02",
  });
  assert.throws(() => sweep([r], POLICY, RUN), namesId("peeked-rec-23"));
});

test("[unhappy-2] a record created and last accessed on the run date is not refused", () => {
  const records = [
    record({ id: "same-day", created: RUN }),
    record({
      id: "touched",
      category: "docs",
      created: RUN,
      lastAccessed: RUN,
    }),
  ];
  assert.deepEqual(sweep(records, POLICY, RUN), [
    { id: "same-day", decision: "keep", reason: "within period" },
    { id: "touched", decision: "keep", reason: "within period" },
  ]);
});
