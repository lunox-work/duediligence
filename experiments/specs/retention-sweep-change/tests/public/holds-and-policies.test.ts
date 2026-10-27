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

function policy(): RetentionPolicy {
  return {
    categories: {
      logs: { periodDays: 30, fromLastAccess: false },
      docs: { periodDays: 90, fromLastAccess: true },
    },
    regions: [],
    graceDays: 7,
  };
}

const RUN_DATE = "2026-06-01";

function throwsNaming(id: string): (err: unknown) => boolean {
  return (err: unknown) => err instanceof Error && err.message.includes(id);
}

test("[happy-4] a held record long past its period is kept for the first hold when sorted", () => {
  const rec = record({ holds: ["litigation-7", "audit-2026"] });
  assert.deepEqual(sweep([rec], policy(), RUN_DATE), [
    { id: "r1", decision: "keep", reason: "hold:audit-2026" },
  ]);
});

test("[happy-4] a single hold keeps the record under that hold's name", () => {
  const rec = record({ holds: ["litigation-7"] });
  assert.deepEqual(sweep([rec], policy(), RUN_DATE), [
    { id: "r1", decision: "keep", reason: "hold:litigation-7" },
  ]);
});

test("[happy-4] an empty list of holds is no hold", () => {
  const rec = record({ holds: [] });
  assert.deepEqual(sweep([rec], policy(), RUN_DATE), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
});

test("[unhappy-1] a record whose category is not in the policy is kept with no policy", () => {
  const rec = record({ category: "invoices" });
  assert.deepEqual(sweep([rec], policy(), RUN_DATE), [
    { id: "r1", decision: "keep", reason: "no policy" },
  ]);
});

test("[unhappy-1] a category named like an object property is not in the policy", () => {
  const rec = record({ category: "constructor" });
  assert.deepEqual(sweep([rec], policy(), RUN_DATE), [
    { id: "r1", decision: "keep", reason: "no policy" },
  ]);
});

test("[unhappy-1] a policy with no categories keeps every record with no policy", () => {
  const pol: RetentionPolicy = { categories: {}, regions: [], graceDays: 0 };
  const recs = [record({ id: "a" }), record({ id: "b", category: "docs" })];
  assert.deepEqual(sweep(recs, pol, RUN_DATE), [
    { id: "a", decision: "keep", reason: "no policy" },
    { id: "b", decision: "keep", reason: "no policy" },
  ]);
});

test("[unhappy-2] a record created after the run date is refused, naming its id", () => {
  const rec = record({ id: "rec-future-42", created: "2026-06-02" });
  assert.throws(() => sweep([rec], policy(), RUN_DATE), throwsNaming("rec-future-42"));
});

test("[unhappy-2] a record last accessed before it was created is refused, naming its id", () => {
  const rec = record({
    id: "rec-early-access-7",
    category: "docs",
    created: "2026-03-10",
    lastAccessed: "2026-03-09",
  });
  assert.throws(() => sweep([rec], policy(), RUN_DATE), throwsNaming("rec-early-access-7"));
});

test("[unhappy-2] a record last accessed after the run date is refused, naming its id", () => {
  const rec = record({
    id: "rec-late-access-9",
    category: "docs",
    created: "2026-03-10",
    lastAccessed: "2026-06-02",
  });
  assert.throws(() => sweep([rec], policy(), RUN_DATE), throwsNaming("rec-late-access-9"));
});

test("[unhappy-2] an impossible record is refused even among valid records", () => {
  const recs = [
    record({ id: "fine-1" }),
    record({ id: "rec-bad-3", created: "2027-01-01" }),
    record({ id: "fine-2" }),
  ];
  assert.throws(() => sweep(recs, policy(), RUN_DATE), throwsNaming("rec-bad-3"));
});

test("[unhappy-2] dates equal to each other and to the run date are not refused", () => {
  const rec = record({
    category: "docs",
    created: RUN_DATE,
    lastAccessed: RUN_DATE,
  });
  assert.deepEqual(sweep([rec], policy(), RUN_DATE), [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
});
