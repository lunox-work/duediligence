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

function policy(overrides: Partial<RetentionPolicy> = {}): RetentionPolicy {
  return {
    categories: {
      logs: { periodDays: 30, fromLastAccess: false },
      docs: { periodDays: 90, fromLastAccess: true },
    },
    regions: [],
    graceDays: 7,
    ...overrides,
  };
}

const RUN_DATE = "2026-06-01";

function throwsNaming(id: string): (err: unknown) => boolean {
  return (err: unknown) => err instanceof Error && err.message.includes(id);
}

// Extends "[happy-4] a held record long past its period is kept for the first hold when sorted":
// more holds, the first when sorted neither first nor last in the list.
test("[happy-4] the first of four holds when sorted names the reason", () => {
  const rec = record({ holds: ["retention", "legal", "audit", "tax"] });
  assert.deepEqual(sweep([rec], policy(), RUN_DATE), [
    { id: "r1", decision: "keep", reason: "hold:audit" },
  ]);
});

test("[happy-4] a hold name that is a prefix of another sorts first", () => {
  const rec = record({ holds: ["audit-2026", "audit"] });
  assert.deepEqual(sweep([rec], policy(), RUN_DATE), [
    { id: "r1", decision: "keep", reason: "hold:audit" },
  ]);
});

test("[happy-4] holds already in sorted order keep the first", () => {
  const rec = record({ holds: ["alpha", "bravo", "charlie"] });
  assert.deepEqual(sweep([rec], policy(), RUN_DATE), [
    { id: "r1", decision: "keep", reason: "hold:alpha" },
  ]);
});

test("[happy-4] a repeated hold name still gives the first when sorted", () => {
  const rec = record({ holds: ["subpoena", "export", "subpoena", "export"] });
  assert.deepEqual(sweep([rec], policy(), RUN_DATE), [
    { id: "r1", decision: "keep", reason: "hold:export" },
  ]);
});

// Extends "[happy-4] a single hold keeps the record under that hold's name":
// a hold on a record that would otherwise be flagged.
test("[happy-4] a hold keeps a record that would otherwise be flagged", () => {
  // expires 2026-05-31, in grace on the run date
  const rec = record({ created: "2026-05-01", holds: ["case-881"] });
  assert.deepEqual(sweep([rec], policy(), RUN_DATE), [
    { id: "r1", decision: "keep", reason: "hold:case-881" },
  ]);
});

test("[happy-4] a hold comes before the age of a record still within its period", () => {
  const rec = record({ created: "2026-05-30", holds: ["case-881"] });
  assert.deepEqual(sweep([rec], policy(), RUN_DATE), [
    { id: "r1", decision: "keep", reason: "hold:case-881" },
  ]);
});

test("[happy-4] a hold keeps an expired access-based record in a region with a minimum", () => {
  const pol = policy({ regions: [{ region: "eu", minimumDays: 365 }], graceDays: 0 });
  const rec = record({
    category: "docs",
    region: "eu",
    created: "2020-01-01",
    lastAccessed: "2021-01-01",
    holds: ["gdpr-request-12"],
  });
  assert.deepEqual(sweep([rec], pol, RUN_DATE), [
    { id: "r1", decision: "keep", reason: "hold:gdpr-request-12" },
  ]);
});

// Extends "[happy-4] an empty list of holds is no hold": among held records in one sweep.
test("[happy-4] held and unheld records in one sweep are decided each by its own holds", () => {
  const recs = [
    record({ id: "a", holds: ["tax", "legal"] }),
    record({ id: "b", holds: [] }),
    record({ id: "c", holds: ["export"] }),
    record({ id: "d", holds: [], created: "2026-05-20" }),
  ];
  assert.deepEqual(sweep(recs, policy(), RUN_DATE), [
    { id: "a", decision: "keep", reason: "hold:legal" },
    { id: "b", decision: "delete", reason: "expired" },
    { id: "c", decision: "keep", reason: "hold:export" },
    { id: "d", decision: "keep", reason: "within period" },
  ]);
});

test("[happy-4] an empty list of holds on a record in grace is flagged", () => {
  const rec = record({ created: "2026-05-01", holds: [] });
  assert.deepEqual(sweep([rec], policy(), RUN_DATE), [
    { id: "r1", decision: "flag", reason: "expired" },
  ]);
});

// Extends "[unhappy-1] a category named like an object property is not in the policy":
// other inherited property names.
test("[unhappy-1] categories named like other object properties are not in the policy", () => {
  const recs = [
    record({ id: "a", category: "toString" }),
    record({ id: "b", category: "__proto__" }),
    record({ id: "c", category: "hasOwnProperty" }),
    record({ id: "d", category: "valueOf" }),
  ];
  assert.deepEqual(sweep(recs, policy(), RUN_DATE), [
    { id: "a", decision: "keep", reason: "no policy" },
    { id: "b", decision: "keep", reason: "no policy" },
    { id: "c", decision: "keep", reason: "no policy" },
    { id: "d", decision: "keep", reason: "no policy" },
  ]);
});

// Extends "[unhappy-1] a record whose category is not in the policy is kept with no policy":
// a record that would be within its period under any policy.
test("[unhappy-1] a recent record with no policy is kept with no policy, not within period", () => {
  const rec = record({ category: "invoices", created: RUN_DATE });
  assert.deepEqual(sweep([rec], policy(), RUN_DATE), [
    { id: "r1", decision: "keep", reason: "no policy" },
  ]);
});

test("[unhappy-1] a region's minimum does not give a policy to a category without one", () => {
  const pol = policy({ regions: [{ region: "eu", minimumDays: 30 }], graceDays: 0 });
  const rec = record({ category: "invoices", region: "eu" });
  assert.deepEqual(sweep([rec], pol, RUN_DATE), [
    { id: "r1", decision: "keep", reason: "no policy" },
  ]);
});

test("[unhappy-1] records with no policy among records with one keep their place in the output", () => {
  const recs = [
    record({ id: "logs-old" }),
    record({ id: "mail-old", category: "mail" }),
    record({ id: "docs-new", category: "docs", created: "2026-05-01" }),
    record({ id: "chat-old", category: "chat", lastAccessed: "2021-01-01" }),
  ];
  assert.deepEqual(sweep(recs, policy(), RUN_DATE), [
    { id: "logs-old", decision: "delete", reason: "expired" },
    { id: "mail-old", decision: "keep", reason: "no policy" },
    { id: "docs-new", decision: "keep", reason: "within period" },
    { id: "chat-old", decision: "keep", reason: "no policy" },
  ]);
});

// Extends "[unhappy-2] a record created after the run date is refused, naming its id":
// one day later across a year end.
test("[unhappy-2] a record created the day after a year-end run date is refused, naming its id", () => {
  const rec = record({ id: "rec-new-year-1", created: "2027-01-01" });
  assert.throws(() => sweep([rec], policy(), "2026-12-31"), throwsNaming("rec-new-year-1"));
});

// Extends "[unhappy-2] a record last accessed before it was created is refused, naming its id":
// a category not counted from last access.
test("[unhappy-2] a record last accessed before it was created is refused even when its category ignores access", () => {
  const rec = record({
    id: "rec-logs-early-4",
    category: "logs",
    created: "2026-03-01",
    lastAccessed: "2026-02-28",
  });
  assert.throws(() => sweep([rec], policy(), RUN_DATE), throwsNaming("rec-logs-early-4"));
});

// Extends "[unhappy-2] a record last accessed after the run date is refused, naming its id":
// a category not counted from last access.
test("[unhappy-2] a record last accessed after the run date is refused even when its category ignores access", () => {
  const rec = record({
    id: "rec-logs-late-8",
    category: "logs",
    created: "2026-01-01",
    lastAccessed: "2026-07-01",
  });
  assert.throws(() => sweep([rec], policy(), RUN_DATE), throwsNaming("rec-logs-late-8"));
});

test("[unhappy-2] a held record created after the run date is refused, naming its id", () => {
  const rec = record({ id: "rec-held-future-2", created: "2026-06-02", holds: ["legal"] });
  assert.throws(() => sweep([rec], policy(), RUN_DATE), throwsNaming("rec-held-future-2"));
});

test("[unhappy-2] a record with no policy last accessed before it was created is refused, naming its id", () => {
  const rec = record({
    id: "rec-nopolicy-6",
    category: "invoices",
    created: "2026-04-10",
    lastAccessed: "2026-04-01",
  });
  assert.throws(() => sweep([rec], policy(), RUN_DATE), throwsNaming("rec-nopolicy-6"));
});

test("[unhappy-2] a held record last accessed after the run date is refused, naming its id", () => {
  const rec = record({
    id: "rec-held-late-11",
    category: "docs",
    created: "2026-01-01",
    lastAccessed: "2026-06-02",
    holds: ["audit"],
  });
  assert.throws(() => sweep([rec], policy(), RUN_DATE), throwsNaming("rec-held-late-11"));
});

// Extends "[unhappy-2] an impossible record is refused even among valid records":
// the impossible record last among many.
test("[unhappy-2] an impossible record after many valid ones is refused, naming its id", () => {
  const recs: RetentionRecord[] = [];
  for (let i = 0; i < 50; i++) recs.push(record({ id: `ok-${i}` }));
  recs.push(record({ id: "zz-bad-last", created: "2026-06-05" }));
  assert.throws(() => sweep(recs, policy(), RUN_DATE), throwsNaming("zz-bad-last"));
});

test("[unhappy-2] an impossible record first among valid ones is refused, naming its id", () => {
  const recs = [
    record({ id: "first-bad-9", category: "docs", created: "2026-05-01", lastAccessed: "2026-04-30" }),
    record({ id: "ok-a" }),
    record({ id: "ok-b" }),
  ];
  assert.throws(() => sweep(recs, policy(), RUN_DATE), throwsNaming("first-bad-9"));
});

test("[unhappy-2] a record last accessed on its created date in the past is not refused", () => {
  const rec = record({ category: "docs", created: "2026-05-01", lastAccessed: "2026-05-01" });
  assert.deepEqual(sweep([rec], policy(), RUN_DATE), [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
});
