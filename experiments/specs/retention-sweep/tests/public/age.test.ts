import { test } from "node:test";
import assert from "node:assert/strict";
import { sweep } from "../../src/index.js";
import type {
  RetentionPolicy,
  RetentionRecord,
  RegionMinimum,
} from "../../src/index.js";

function record(overrides: Partial<RetentionRecord> = {}): RetentionRecord {
  return {
    id: "r1",
    category: "logs",
    created: "2026-01-01",
    holds: [],
    region: "us",
    ...overrides,
  };
}

function policy(
  periodDays: number,
  graceDays: number,
  fromLastAccess = false,
  regions: RegionMinimum[] = [],
): RetentionPolicy {
  return {
    categories: { logs: { periodDays, fromLastAccess } },
    regions,
    graceDays,
  };
}

// happy-1: A record past its period is flagged, then deleted

test("[happy-1] a record one day short of its period is kept within period", () => {
  const result = sweep([record()], policy(30, 7), "2026-01-30");
  assert.deepEqual(result, [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
});

test("[happy-1] a record whose age reaches its period is flagged as expired", () => {
  const result = sweep([record()], policy(30, 7), "2026-01-31");
  assert.deepEqual(result, [{ id: "r1", decision: "flag", reason: "expired" }]);
});

test("[happy-1] a record stays flagged until the grace period has passed, then is deleted", () => {
  assert.deepEqual(sweep([record()], policy(30, 7), "2026-02-06"), [
    { id: "r1", decision: "flag", reason: "expired" },
  ]);
  assert.deepEqual(sweep([record()], policy(30, 7), "2026-02-07"), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
});

test("[happy-1] decisions come back one per record in input order", () => {
  const records = [
    record({ id: "old", created: "2025-01-01" }),
    record({ id: "new", created: "2026-01-20" }),
    record({ id: "mid", created: "2026-01-01" }),
  ];
  const result = sweep(records, policy(30, 7), "2026-01-31");
  assert.deepEqual(result, [
    { id: "old", decision: "delete", reason: "expired" },
    { id: "new", decision: "keep", reason: "within period" },
    { id: "mid", decision: "flag", reason: "expired" },
  ]);
});

// boundary-1: A grace period of zero deletes at once

test("[boundary-1] with a grace period of zero a record is deleted the day its age reaches its period", () => {
  const result = sweep([record()], policy(30, 0), "2026-01-31");
  assert.deepEqual(result, [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
});

test("[boundary-1] with a grace period of zero a record one day short of its period is still kept", () => {
  const result = sweep([record()], policy(30, 0), "2026-01-30");
  assert.deepEqual(result, [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
});

// happy-2: Access-based categories count from the last access

test("[happy-2] an access-based category counts from the last access", () => {
  const r = record({ created: "2025-01-01", lastAccessed: "2026-01-01" });
  const result = sweep([r], policy(90, 7, true), "2026-03-01");
  assert.deepEqual(result, [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
});

test("[happy-2] a never-accessed record in an access-based category counts from its created date", () => {
  const absent = record({ id: "absent", created: "2025-01-01" });
  const nulled = record({
    id: "nulled",
    created: "2025-01-01",
    lastAccessed: null,
  });
  const result = sweep([absent, nulled], policy(90, 7, true), "2026-03-01");
  assert.deepEqual(result, [
    { id: "absent", decision: "delete", reason: "expired" },
    { id: "nulled", decision: "delete", reason: "expired" },
  ]);
});

test("[happy-2] an access-based record expires the day its age from last access reaches the period", () => {
  const r = record({ created: "2025-01-01", lastAccessed: "2026-01-01" });
  assert.deepEqual(sweep([r], policy(90, 0, true), "2026-03-31"), [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
  assert.deepEqual(sweep([r], policy(90, 0, true), "2026-04-01"), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
});

// boundary-2: A region's minimum lengthens the period

test("[boundary-2] a region minimum longer than the category period keeps the record", () => {
  const r = record({ region: "eu" });
  const p = policy(30, 7, false, [{ region: "eu", minimumDays: 60 }]);
  assert.deepEqual(sweep([r], p, "2026-02-15"), [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
});

test("[boundary-2] under a region minimum the record expires when its age reaches the minimum", () => {
  const r = record({ region: "eu" });
  const p = policy(30, 0, false, [{ region: "eu", minimumDays: 60 }]);
  assert.deepEqual(sweep([r], p, "2026-03-01"), [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
  assert.deepEqual(sweep([r], p, "2026-03-02"), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
});

test("[boundary-2] a region not in the list changes nothing", () => {
  const r = record({ region: "apac" });
  const p = policy(30, 7, false, [{ region: "eu", minimumDays: 60 }]);
  assert.deepEqual(sweep([r], p, "2026-02-15"), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
});

test("[boundary-2] a region minimum shorter than the category period changes nothing", () => {
  const r = record({ region: "eu" });
  const p = policy(30, 7, false, [{ region: "eu", minimumDays: 10 }]);
  assert.deepEqual(sweep([r], p, "2026-01-30"), [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
  assert.deepEqual(sweep([r], p, "2026-01-31"), [
    { id: "r1", decision: "flag", reason: "expired" },
  ]);
});

// boundary-3: Ages are calendar days

test("[boundary-3] a span across a leap day counts 366 calendar days", () => {
  const r = record({ created: "2024-02-28" });
  assert.deepEqual(sweep([r], policy(366, 0), "2025-02-28"), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
});

test("[boundary-3] one calendar day short of 366 is kept", () => {
  const r = record({ created: "2024-02-28" });
  assert.deepEqual(sweep([r], policy(366, 0), "2025-02-27"), [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
});
