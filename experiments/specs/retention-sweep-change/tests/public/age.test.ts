import { test } from "node:test";
import assert from "node:assert/strict";
import { sweep } from "../../src/index.js";
import type {
  RecordDecision,
  RetentionPolicy,
  RetentionRecord,
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

function policy(overrides: Partial<RetentionPolicy> = {}): RetentionPolicy {
  return {
    categories: { logs: { periodDays: 30, fromLastAccess: false } },
    regions: [],
    graceDays: 7,
    ...overrides,
  };
}

function decide(
  rec: RetentionRecord,
  pol: RetentionPolicy,
  runDate: string,
): RecordDecision {
  const result = sweep([rec], pol, runDate);
  assert.equal(result.length, 1);
  return result[0];
}

// Category counted from last access, 90 days, with region "eu" minimum 365 days.
function accessPolicyWithEu(): RetentionPolicy {
  return policy({
    categories: { docs: { periodDays: 90, fromLastAccess: true } },
    regions: [{ region: "eu", minimumDays: 365 }],
    graceDays: 7,
  });
}

test("[happy-1] a record before its period ends is kept, within period", () => {
  assert.deepEqual(decide(record(), policy(), "2026-01-30"), {
    id: "r1",
    decision: "keep",
    reason: "within period",
  });
});

test("[happy-1] a record past its period is flagged, then deleted after grace", () => {
  assert.deepEqual(decide(record(), policy(), "2026-01-31"), {
    id: "r1",
    decision: "flag",
    reason: "expired",
  });
  assert.deepEqual(decide(record(), policy(), "2026-02-07"), {
    id: "r1",
    decision: "delete",
    reason: "expired",
  });
});

test("[happy-1] the last day of grace is still flagged", () => {
  assert.deepEqual(decide(record(), policy(), "2026-02-06"), {
    id: "r1",
    decision: "flag",
    reason: "expired",
  });
});

test("[happy-1] a record created on the run date is kept", () => {
  assert.deepEqual(decide(record({ created: "2026-03-10" }), policy(), "2026-03-10"), {
    id: "r1",
    decision: "keep",
    reason: "within period",
  });
});

test("[boundary-1] a grace period of zero deletes on the day the period is reached", () => {
  assert.deepEqual(decide(record(), policy({ graceDays: 0 }), "2026-01-31"), {
    id: "r1",
    decision: "delete",
    reason: "expired",
  });
});

test("[boundary-1] a grace period of zero still keeps the day before the period is reached", () => {
  assert.deepEqual(decide(record(), policy({ graceDays: 0 }), "2026-01-30"), {
    id: "r1",
    decision: "keep",
    reason: "within period",
  });
});

test("[happy-2] an access-based record counts its period from the last access", () => {
  const pol = policy({
    categories: { docs: { periodDays: 90, fromLastAccess: true } },
  });
  const rec = record({
    category: "docs",
    created: "2025-01-01",
    lastAccessed: "2026-01-01",
  });
  assert.deepEqual(decide(rec, pol, "2026-03-01"), {
    id: "r1",
    decision: "keep",
    reason: "within period",
  });
});

test("[happy-2] an access-based record expires exactly its period after the last access", () => {
  const pol = policy({
    categories: { docs: { periodDays: 90, fromLastAccess: true } },
  });
  const rec = record({
    category: "docs",
    created: "2025-01-01",
    lastAccessed: "2026-01-01",
  });
  assert.deepEqual(decide(rec, pol, "2026-03-31"), {
    id: "r1",
    decision: "keep",
    reason: "within period",
  });
  assert.deepEqual(decide(rec, pol, "2026-04-01"), {
    id: "r1",
    decision: "flag",
    reason: "expired",
  });
});

test("[happy-2] an access-based record never accessed counts from its created date", () => {
  const pol = policy({
    categories: { docs: { periodDays: 90, fromLastAccess: true } },
  });
  for (const rec of [
    record({ category: "docs", created: "2026-01-01" }),
    record({ category: "docs", created: "2026-01-01", lastAccessed: null }),
  ]) {
    assert.deepEqual(decide(rec, pol, "2026-03-31"), {
      id: "r1",
      decision: "keep",
      reason: "within period",
    });
    assert.deepEqual(decide(rec, pol, "2026-04-01"), {
      id: "r1",
      decision: "flag",
      reason: "expired",
    });
  }
});

test("[happy-2] a category not counted from last access ignores the last access", () => {
  const rec = record({ created: "2026-01-01", lastAccessed: "2026-01-25" });
  assert.deepEqual(decide(rec, policy(), "2026-01-31"), {
    id: "r1",
    decision: "flag",
    reason: "expired",
  });
});

test("[boundary-2] a region's longer minimum keeps a record past the category's period", () => {
  const pol = policy({ regions: [{ region: "eu", minimumDays: 60 }] });
  const rec = record({ region: "eu", created: "2026-01-01" });
  assert.deepEqual(decide(rec, pol, "2026-02-15"), {
    id: "r1",
    decision: "keep",
    reason: "within period",
  });
});

test("[boundary-2] a region's minimum expires exactly its days after creation", () => {
  const pol = policy({ regions: [{ region: "eu", minimumDays: 60 }] });
  const rec = record({ region: "eu", created: "2026-01-01" });
  assert.deepEqual(decide(rec, pol, "2026-03-01"), {
    id: "r1",
    decision: "keep",
    reason: "within period",
  });
  assert.deepEqual(decide(rec, pol, "2026-03-02"), {
    id: "r1",
    decision: "flag",
    reason: "expired",
  });
});

test("[boundary-2] a region not in the list changes nothing", () => {
  const pol = policy({ regions: [{ region: "eu", minimumDays: 60 }] });
  const rec = record({ region: "apac", created: "2026-01-01" });
  assert.deepEqual(decide(rec, pol, "2026-01-31"), {
    id: "r1",
    decision: "flag",
    reason: "expired",
  });
  assert.deepEqual(decide(rec, pol, "2026-02-07"), {
    id: "r1",
    decision: "delete",
    reason: "expired",
  });
});

test("[boundary-2] a region minimum shorter than the category's period changes nothing", () => {
  const pol = policy({ regions: [{ region: "eu", minimumDays: 10 }] });
  const rec = record({ region: "eu", created: "2026-01-01" });
  assert.deepEqual(decide(rec, pol, "2026-01-30"), {
    id: "r1",
    decision: "keep",
    reason: "within period",
  });
  assert.deepEqual(decide(rec, pol, "2026-01-31"), {
    id: "r1",
    decision: "flag",
    reason: "expired",
  });
});

test("[happy-3] a recent access does not restart the region's minimum", () => {
  const rec = record({
    category: "docs",
    region: "eu",
    created: "2025-01-01",
    lastAccessed: "2026-01-01",
  });
  assert.deepEqual(decide(rec, accessPolicyWithEu(), "2026-03-31"), {
    id: "r1",
    decision: "keep",
    reason: "within period",
  });
  assert.deepEqual(decide(rec, accessPolicyWithEu(), "2026-04-01"), {
    id: "r1",
    decision: "flag",
    reason: "expired",
  });
});

test("[happy-3] the grace period ends on the seventh day after expiry", () => {
  const rec = record({
    category: "docs",
    region: "eu",
    created: "2025-01-01",
    lastAccessed: "2026-01-01",
  });
  assert.deepEqual(decide(rec, accessPolicyWithEu(), "2026-04-07"), {
    id: "r1",
    decision: "flag",
    reason: "expired",
  });
  assert.deepEqual(decide(rec, accessPolicyWithEu(), "2026-04-08"), {
    id: "r1",
    decision: "delete",
    reason: "expired",
  });
});

test("[boundary-3] a passed access period does not expire a record still within the region's minimum", () => {
  const rec = record({
    category: "docs",
    region: "eu",
    created: "2025-12-01",
    lastAccessed: "2026-01-01",
  });
  assert.deepEqual(decide(rec, accessPolicyWithEu(), "2026-04-01"), {
    id: "r1",
    decision: "keep",
    reason: "within period",
  });
  assert.deepEqual(decide(rec, accessPolicyWithEu(), "2026-11-30"), {
    id: "r1",
    decision: "keep",
    reason: "within period",
  });
});

test("[boundary-3] the grace period runs from the region's later expiry", () => {
  const rec = record({
    category: "docs",
    region: "eu",
    created: "2025-12-01",
    lastAccessed: "2026-01-01",
  });
  assert.deepEqual(decide(rec, accessPolicyWithEu(), "2026-12-01"), {
    id: "r1",
    decision: "flag",
    reason: "expired",
  });
  assert.deepEqual(decide(rec, accessPolicyWithEu(), "2026-12-07"), {
    id: "r1",
    decision: "flag",
    reason: "expired",
  });
  assert.deepEqual(decide(rec, accessPolicyWithEu(), "2026-12-08"), {
    id: "r1",
    decision: "delete",
    reason: "expired",
  });
});

test("[boundary-4] ages count the leap day as a calendar day", () => {
  const pol = policy({
    categories: { logs: { periodDays: 366, fromLastAccess: false } },
    graceDays: 0,
  });
  const rec = record({ created: "2024-02-28" });
  assert.deepEqual(decide(rec, pol, "2025-02-28"), {
    id: "r1",
    decision: "delete",
    reason: "expired",
  });
});

test("[boundary-4] one calendar day short of the period across a leap day is kept", () => {
  const pol = policy({
    categories: { logs: { periodDays: 366, fromLastAccess: false } },
    graceDays: 0,
  });
  const rec = record({ created: "2024-02-28" });
  assert.deepEqual(decide(rec, pol, "2025-02-27"), {
    id: "r1",
    decision: "keep",
    reason: "within period",
  });
});
