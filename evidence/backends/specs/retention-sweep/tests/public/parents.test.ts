import { test } from "node:test";
import assert from "node:assert/strict";
import { sweep, type RetentionPolicy, type RetentionRecord } from "../../src/index.js";

function record(id: string, overrides: Partial<RetentionRecord> = {}): RetentionRecord {
  return { id, category: "logs", created: "2025-01-01", holds: [], region: "us", ...overrides };
}

function policy(): RetentionPolicy {
  return {
    categories: { logs: { periodDays: 30, fromLastAccess: false } },
    regions: [],
    graceDays: 7,
  };
}

test("[happy-4] an expired child is kept by its held parent", () => {
  assert.deepEqual(sweep([
    record("p", { holds: ["audit"] }),
    record("c", { parentId: "p" }),
  ], policy(), "2026-03-01"), [
    { id: "p", decision: "keep", reason: "hold:audit" },
    { id: "c", decision: "keep", reason: "parent:p" },
  ]);
});

test("[happy-4] children of flagged and deleted parents follow their own ages", () => {
  assert.deepEqual(sweep([
    record("flagged-parent", { created: "2026-01-01" }),
    record("old-child", { parentId: "flagged-parent" }),
    record("deleted-parent"),
    record("young-child", { parentId: "deleted-parent", created: "2026-01-30" }),
    record("flagged-child", { parentId: "deleted-parent", created: "2026-01-01" }),
  ], policy(), "2026-01-31"), [
    { id: "flagged-parent", decision: "flag", reason: "expired" },
    { id: "old-child", decision: "delete", reason: "expired" },
    { id: "deleted-parent", decision: "delete", reason: "expired" },
    { id: "young-child", decision: "keep", reason: "within period" },
    { id: "flagged-child", decision: "flag", reason: "expired" },
  ]);
});

test("[boundary-4] keeping passes through three generations with immediate-parent reasons", () => {
  assert.deepEqual(sweep([
    record("a", { holds: ["audit"] }),
    record("b", { parentId: "a" }),
    record("c", { parentId: "b" }),
  ], policy(), "2026-03-01"), [
    { id: "a", decision: "keep", reason: "hold:audit" },
    { id: "b", decision: "keep", reason: "parent:a" },
    { id: "c", decision: "keep", reason: "parent:b" },
  ]);
});

test("[boundary-4] every chain ordering preserves decisions and returns input order", () => {
  const a = record("a", { holds: ["audit"] });
  const b = record("b", { parentId: "a" });
  const c = record("c", { parentId: "b" });
  const expected = {
    a: { id: "a", decision: "keep", reason: "hold:audit" },
    b: { id: "b", decision: "keep", reason: "parent:a" },
    c: { id: "c", decision: "keep", reason: "parent:b" },
  };
  const permutations = [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]];
  for (const records of permutations) {
    assert.deepEqual(sweep(records, policy(), "2026-03-01"), records.map((r: RetentionRecord) =>
      expected[r.id as keyof typeof expected],
    ));
  }
});

test("[unhappy-3] a missing parent throws an error naming its child", () => {
  assert.throws(() => sweep([
    record("unrelated"),
    record("orphan-child", { parentId: "missing-parent" }),
  ], policy(), "2026-03-01"), (error: unknown): boolean =>
    error instanceof Error && error.message.includes("orphan-child"),
  );
});

test("[unhappy-3] a hold does not make a missing parent reference valid", () => {
  assert.throws(() => sweep([
    record("held-orphan", { parentId: "missing-parent", holds: ["audit"] }),
  ], policy(), "2026-03-01"), (error: unknown): boolean =>
    error instanceof Error && error.message.includes("held-orphan"),
  );
});

test("[unhappy-3] absent and null parent ids both mean there is no parent", () => {
  assert.deepEqual(sweep([
    record("absent"),
    record("null", { parentId: null }),
  ], policy(), "2026-03-01"), [
    { id: "absent", decision: "delete", reason: "expired" },
    { id: "null", decision: "delete", reason: "expired" },
  ]);
});
