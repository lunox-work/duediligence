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

function errorNames(id: string): (error: unknown) => boolean {
  return (error: unknown): boolean => error instanceof Error && error.message.includes(id);
}

test("[happy-3] an expired held record names the first sorted hold", () => {
  assert.deepEqual(sweep([
    record("r", { created: "2025-01-01", holds: ["litigation-7", "audit-2026"] }),
  ], policy(), "2026-03-01"), [
    { id: "r", decision: "keep", reason: "hold:audit-2026" },
  ]);
});

test("[happy-3] an empty hold list permits flagging and deletion at their boundaries", () => {
  assert.deepEqual(sweep([
    record("flag", { created: "2026-01-08", holds: [] }),
    record("delete", { holds: [] }),
    record("held", { holds: ["only-hold"] }),
  ], policy(), "2026-02-07"), [
    { id: "flag", decision: "flag", reason: "expired" },
    { id: "delete", decision: "delete", reason: "expired" },
    { id: "held", decision: "keep", reason: "hold:only-hold" },
  ]);
});

test("[unhappy-1] a category missing from an otherwise populated policy is kept", () => {
  assert.deepEqual(sweep([
    record("unknown", { category: "unconfigured", created: "2020-01-01" }),
    record("configured", { created: "2020-01-01" }),
  ], policy(), "2026-03-01"), [
    { id: "unknown", decision: "keep", reason: "no policy" },
    { id: "configured", decision: "delete", reason: "expired" },
  ]);
});

test("[unhappy-1] regional rules and zero grace cannot supply a missing category policy", () => {
  assert.deepEqual(sweep([record("r", { created: "2020-01-01" })], policy({
    categories: {},
    regions: [{ region: "us", minimumDays: 1 }],
    graceDays: 0,
  }), "2026-03-01"), [
    { id: "r", decision: "keep", reason: "no policy" },
  ]);
});

test("[unhappy-2] creation one day after the run date throws an error naming the record", () => {
  assert.throws(() => sweep([
    record("valid"),
    record("future-created-record", { created: "2026-03-02" }),
  ], policy(), "2026-03-01"), errorNames("future-created-record"));
});

test("[unhappy-2] last access one day before creation throws an error naming the record", () => {
  assert.throws(() => sweep([
    record("access-before-creation", { lastAccessed: "2025-12-31" }),
  ], policy(), "2026-03-01"), errorNames("access-before-creation"));
});

test("[unhappy-2] last access one day after the run date throws an error naming the record", () => {
  assert.throws(() => sweep([
    record("future-access-record", { lastAccessed: "2026-03-02" }),
  ], policy(), "2026-03-01"), errorNames("future-access-record"));
});

test("[unhappy-2] creation and access may equal each other and the run date", () => {
  assert.deepEqual(sweep([
    record("same-day", { created: "2026-03-01", lastAccessed: "2026-03-01" }),
    record("access-at-creation", { lastAccessed: "2026-01-01" }),
    record("access-at-run", { lastAccessed: "2026-03-01" }),
  ], policy({ categories: { logs: { periodDays: 30, fromLastAccess: true } } }), "2026-03-01"), [
    { id: "same-day", decision: "keep", reason: "within period" },
    { id: "access-at-creation", decision: "delete", reason: "expired" },
    { id: "access-at-run", decision: "keep", reason: "within period" },
  ]);
});
