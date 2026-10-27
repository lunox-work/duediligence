import { test } from "node:test";
import assert from "node:assert/strict";
import { sweep, type RetentionPolicy, type RetentionRecord } from "../../src/index.js";

function record(id: string, overrides: Partial<RetentionRecord> = {}): RetentionRecord {
  return { id, category: "logs", created: "2026-01-01", holds: [], region: "us", ...overrides };
}

function policy(overrides: Partial<RetentionPolicy> = {}): RetentionPolicy {
  return {
    categories: { logs: { periodDays: 30, fromLastAccess: false } },
    regions: [],
    graceDays: 7,
    ...overrides,
  };
}

test("[happy-1] keeps before the period and flags exactly when it expires", () => {
  assert.deepEqual(sweep([record("r")], policy(), "2026-01-30"), [
    { id: "r", decision: "keep", reason: "within period" },
  ]);
  assert.deepEqual(sweep([record("r")], policy(), "2026-01-31"), [
    { id: "r", decision: "flag", reason: "expired" },
  ]);
});

test("[happy-1] flags through the last grace day and deletes at its endpoint", () => {
  assert.deepEqual(sweep([record("r")], policy(), "2026-02-06"), [
    { id: "r", decision: "flag", reason: "expired" },
  ]);
  assert.deepEqual(sweep([record("r")], policy(), "2026-02-07"), [
    { id: "r", decision: "delete", reason: "expired" },
  ]);
});

test("[happy-1] creation-based retention ignores a recent last access", () => {
  assert.deepEqual(sweep([record("r", { lastAccessed: "2026-01-30" })], policy(), "2026-01-31"), [
    { id: "r", decision: "flag", reason: "expired" },
  ]);
});

test("[boundary-1] zero grace deletes exactly at expiration", () => {
  assert.deepEqual(sweep([record("r")], policy({ graceDays: 0 }), "2026-01-31"), [
    { id: "r", decision: "delete", reason: "expired" },
  ]);
});

test("[boundary-1] zero grace still keeps a record one day before expiration", () => {
  assert.deepEqual(sweep([record("r")], policy({ graceDays: 0 }), "2026-01-30"), [
    { id: "r", decision: "keep", reason: "within period" },
  ]);
});

test("[happy-2] recent access keeps an otherwise old record", () => {
  const accessPolicy = policy({ categories: { logs: { periodDays: 90, fromLastAccess: true } } });
  assert.deepEqual(sweep([
    record("r", { created: "2025-01-01", lastAccessed: "2026-01-01" }),
  ], accessPolicy, "2026-03-01"), [
    { id: "r", decision: "keep", reason: "within period" },
  ]);
});

test("[happy-2] absent and null last access both fall back to creation", () => {
  const accessPolicy = policy({ categories: { logs: { periodDays: 90, fromLastAccess: true } } });
  assert.deepEqual(sweep([
    record("absent", { created: "2025-01-01" }),
    record("null", { created: "2025-01-01", lastAccessed: null }),
  ], accessPolicy, "2026-03-01"), [
    { id: "absent", decision: "delete", reason: "expired" },
    { id: "null", decision: "delete", reason: "expired" },
  ]);
});

test("[happy-2] expiration and grace both count from last access", () => {
  const accessPolicy = policy({ categories: { logs: { periodDays: 90, fromLastAccess: true } } });
  const cases = [
    { date: "2026-03-31", decision: "keep", reason: "within period" },
    { date: "2026-04-01", decision: "flag", reason: "expired" },
    { date: "2026-04-07", decision: "flag", reason: "expired" },
    { date: "2026-04-08", decision: "delete", reason: "expired" },
  ];
  for (const expected of cases) {
    assert.deepEqual(sweep([
      record("r", { created: "2025-01-01", lastAccessed: "2026-01-01" }),
    ], accessPolicy, expected.date), [
      { id: "r", decision: expected.decision, reason: expected.reason },
    ]);
  }
});

test("[boundary-2] a longer regional minimum keeps a record past its category period", () => {
  assert.deepEqual(sweep([record("r", { region: "eu" })], policy({
    regions: [{ region: "eu", minimumDays: 60 }],
  }), "2026-02-15"), [
    { id: "r", decision: "keep", reason: "within period" },
  ]);
});

test("[boundary-2] the regional minimum sets the expiration and grace endpoints", () => {
  const cases = [
    { date: "2026-03-01", decision: "keep", reason: "within period" },
    { date: "2026-03-02", decision: "flag", reason: "expired" },
    { date: "2026-03-08", decision: "flag", reason: "expired" },
    { date: "2026-03-09", decision: "delete", reason: "expired" },
  ];
  for (const expected of cases) {
    assert.deepEqual(sweep([record("r", { region: "eu" })], policy({
      regions: [{ region: "eu", minimumDays: 60 }],
    }), expected.date), [
      { id: "r", decision: expected.decision, reason: expected.reason },
    ]);
  }
});

test("[boundary-2] unlisted shorter and equal regional minimums leave the period unchanged", () => {
  assert.deepEqual(sweep([
    record("unlisted"),
    record("shorter", { region: "short" }),
    record("equal", { region: "equal" }),
  ], policy({
    regions: [
      { region: "eu", minimumDays: 60 },
      { region: "short", minimumDays: 10 },
      { region: "equal", minimumDays: 30 },
    ],
  }), "2026-01-31"), [
    { id: "unlisted", decision: "flag", reason: "expired" },
    { id: "shorter", decision: "flag", reason: "expired" },
    { id: "equal", decision: "flag", reason: "expired" },
  ]);
});

test("[boundary-3] the leap-year span reaches 366 days on February 28", () => {
  const leapPolicy = policy({
    categories: { logs: { periodDays: 366, fromLastAccess: false } },
    graceDays: 0,
  });
  assert.deepEqual(sweep([record("r", { created: "2024-02-28" })], leapPolicy, "2025-02-27"), [
    { id: "r", decision: "keep", reason: "within period" },
  ]);
  assert.deepEqual(sweep([record("r", { created: "2024-02-28" })], leapPolicy, "2025-02-28"), [
    { id: "r", decision: "delete", reason: "expired" },
  ]);
});

test("[boundary-3] February 29 counts as a calendar day", () => {
  const leapPolicy = policy({
    categories: { logs: { periodDays: 2, fromLastAccess: false } },
    graceDays: 0,
  });
  assert.deepEqual(sweep([record("r", { created: "2024-02-28" })], leapPolicy, "2024-02-29"), [
    { id: "r", decision: "keep", reason: "within period" },
  ]);
  assert.deepEqual(sweep([record("r", { created: "2024-02-28" })], leapPolicy, "2024-03-01"), [
    { id: "r", decision: "delete", reason: "expired" },
  ]);
});
