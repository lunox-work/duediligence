import { test } from "node:test";
import assert from "node:assert/strict";
import { sweep, type RetentionPolicy, type RetentionRecord, type RecordDecision } from "../../src/index.js";

function record(id: string, overrides: Partial<RetentionRecord> = {}): RetentionRecord {
  return { id, category: "files", created: "2020-01-01", holds: [], region: "east", ...overrides };
}

function policy(): RetentionPolicy {
  return {
    categories: { files: { periodDays: 10, fromLastAccess: false } },
    regions: [], graceDays: 4,
  };
}

function names(id: string): (error: unknown) => boolean {
  return (error: unknown): boolean => error instanceof Error && error.message.includes(id);
}

// Extends public "an expired child is kept by its held parent".
test("[happy-4] one held parent protects several children appearing before and after it", () => {
  assert.deepEqual(sweep([
    record("child-z", { parentId: "root-long-id" }),
    record("unrelated"),
    record("child-a", { parentId: "root-long-id" }),
    record("root-long-id", { holds: ["investigation", "audit"] }),
    record("child-m", { parentId: "root-long-id" }),
  ], policy(), "2030-06-15"), [
    { id: "child-z", decision: "keep", reason: "parent:root-long-id" },
    { id: "unrelated", decision: "delete", reason: "expired" },
    { id: "child-a", decision: "keep", reason: "parent:root-long-id" },
    { id: "root-long-id", decision: "keep", reason: "hold:audit" },
    { id: "child-m", decision: "keep", reason: "parent:root-long-id" },
  ]);
});

test("[happy-4] parents kept within their own period also protect expired children", () => {
  assert.deepEqual(sweep([
    record("child-before", { parentId: "young-parent" }),
    record("young-parent", { created: "2030-06-06" }),
    record("child-after", { parentId: "young-parent" }),
  ], policy(), "2030-06-15"), [
    { id: "child-before", decision: "keep", reason: "parent:young-parent" },
    { id: "young-parent", decision: "keep", reason: "within period" },
    { id: "child-after", decision: "keep", reason: "parent:young-parent" },
  ]);
});

test("[happy-4] a parent with no category policy protects a configured expired child", () => {
  assert.deepEqual(sweep([
    record("configured-child", { parentId: "unconfigured-parent" }),
    record("unconfigured-parent", { category: "no-policy-here" }),
  ], policy(), "2030-06-15"), [
    { id: "configured-child", decision: "keep", reason: "parent:unconfigured-parent" },
    { id: "unconfigured-parent", decision: "keep", reason: "no policy" },
  ]);
});

test("[happy-4] access and regional rules that keep parents also protect children", () => {
  const p = policy();
  p.categories.access = { periodDays: 10, fromLastAccess: true };
  p.regions = [{ region: "protected", minimumDays: 50 }];
  assert.deepEqual(sweep([
    record("access-child", { parentId: "access-parent" }),
    record("region-parent", { created: "2030-05-01", region: "protected" }),
    record("region-child", { parentId: "region-parent" }),
    record("access-parent", { category: "access", lastAccessed: "2030-06-14" }),
  ], p, "2030-06-15"), [
    { id: "access-child", decision: "keep", reason: "parent:access-parent" },
    { id: "region-parent", decision: "keep", reason: "within period" },
    { id: "region-child", decision: "keep", reason: "parent:region-parent" },
    { id: "access-parent", decision: "keep", reason: "within period" },
  ]);
});

// Extends public "children of flagged and deleted parents follow their own ages".
test("[happy-4] reversed families use each child category region access and holds", () => {
  const p = policy();
  p.categories.access = { periodDays: 10, fromLastAccess: true };
  p.regions = [{ region: "minimum", minimumDays: 20 }];
  assert.deepEqual(sweep([
    record("held-child", { parentId: "deleted-parent", holds: ["review"] }),
    record("region-child", { parentId: "flagged-parent", created: "2030-06-01", region: "minimum" }),
    record("access-child", { parentId: "flagged-parent", category: "access", lastAccessed: "2030-06-05" }),
    record("young-child", { parentId: "flagged-parent", created: "2030-06-15" }),
    record("expired-child", { parentId: "flagged-parent" }),
    record("unknown-child", { parentId: "deleted-parent", category: "unknown" }),
    record("deleted-parent"),
    record("flagged-parent", { created: "2030-06-03" }),
  ], p, "2030-06-15"), [
    { id: "held-child", decision: "keep", reason: "hold:review" },
    { id: "region-child", decision: "keep", reason: "within period" },
    { id: "access-child", decision: "flag", reason: "expired" },
    { id: "young-child", decision: "keep", reason: "within period" },
    { id: "expired-child", decision: "delete", reason: "expired" },
    { id: "unknown-child", decision: "keep", reason: "no policy" },
    { id: "deleted-parent", decision: "delete", reason: "expired" },
    { id: "flagged-parent", decision: "flag", reason: "expired" },
  ]);
});

test("[happy-4] a kept child protects descendants without keeping its parent or siblings", () => {
  assert.deepEqual(sweep([
    record("grandchild", { parentId: "held-child" }),
    record("plain-sibling", { parentId: "deleted-root" }),
    record("held-child", { parentId: "deleted-root", holds: ["review"] }),
    record("deleted-root"),
  ], policy(), "2030-06-15"), [
    { id: "grandchild", decision: "keep", reason: "parent:held-child" },
    { id: "plain-sibling", decision: "delete", reason: "expired" },
    { id: "held-child", decision: "keep", reason: "hold:review" },
    { id: "deleted-root", decision: "delete", reason: "expired" },
  ]);
});

// Extends public "keeping passes through three generations with immediate-parent reasons".
test("[boundary-4] an eighty generation reverse chain keeps each immediate parent reason", () => {
  const records = Array.from({ length: 80 }, (_, i) => i === 0
    ? record("node-0", { holds: ["review"] })
    : record(`node-${i}`, { parentId: `node-${i - 1}` }));
  records.reverse();
  assert.deepEqual(sweep(records, policy(), "2030-06-15"), records.map((r) => ({
    id: r.id, decision: "keep", reason: r.parentId ? `parent:${r.parentId}` : "hold:review",
  })));
});

// Extends public "every chain ordering preserves decisions and returns input order".
test("[boundary-4] shuffled branching trees and an independent family preserve input order", () => {
  const tree = Array.from({ length: 31 }, (_, i) => i === 0
    ? record("tree-0", { holds: ["review"] })
    : record(`tree-${i}`, { parentId: `tree-${Math.floor((i - 1) / 2)}` }));
  const extra = [record("independent-delete"), record("independent-flag", { created: "2030-06-04" })];
  const all = [...tree, ...extra];
  const expected = new Map<string, RecordDecision>(tree.map((r) => [r.id, {
    id: r.id, decision: "keep", reason: r.parentId ? `parent:${r.parentId}` : "hold:review",
  }]));
  expected.set("independent-delete", { id: "independent-delete", decision: "delete", reason: "expired" });
  expected.set("independent-flag", { id: "independent-flag", decision: "flag", reason: "expired" });
  const orders = [
    all,
    [...all].reverse(),
    Array.from({ length: all.length }, (_, i) => all[(i * 7) % all.length]),
    [...all.slice(14), ...all.slice(0, 14)],
  ];
  for (const records of orders) {
    assert.deepEqual(sweep(records, policy(), "2030-06-15"), records.map((r) => expected.get(r.id)));
  }
});

test("[boundary-4] keeping propagates through a chain rooted in missing policy", () => {
  assert.deepEqual(sweep([
    record("leaf", { parentId: "middle-two" }),
    record("middle-one", { parentId: "root" }),
    record("middle-two", { parentId: "middle-one" }),
    record("root", { category: "unconfigured" }),
  ], policy(), "2030-06-15"), [
    { id: "leaf", decision: "keep", reason: "parent:middle-two" },
    { id: "middle-one", decision: "keep", reason: "parent:root" },
    { id: "middle-two", decision: "keep", reason: "parent:middle-one" },
    { id: "root", decision: "keep", reason: "no policy" },
  ]);
});

test("[boundary-4] multiple chains resolve the kept parent by its full id", () => {
  assert.deepEqual(sweep([
    record("leaf", { parentId: "constructor" }),
    record("other-leaf", { parentId: "root-longer" }),
    record("constructor", { parentId: "__proto__" }),
    record("root-longer"),
    record("__proto__", { holds: ["review"] }),
  ], policy(), "2030-06-15"), [
    { id: "leaf", decision: "keep", reason: "parent:constructor" },
    { id: "other-leaf", decision: "delete", reason: "expired" },
    { id: "constructor", decision: "keep", reason: "parent:__proto__" },
    { id: "root-longer", decision: "delete", reason: "expired" },
    { id: "__proto__", decision: "keep", reason: "hold:review" },
  ]);
});

// Extends public "a missing parent throws an error naming its child".
test("[unhappy-3] orphans are rejected at any position of a larger otherwise valid family", () => {
  for (const position of [0, 5, 10]) {
    const records = Array.from({ length: 10 }, (_, i) => i === 0
      ? record("valid-root", { holds: ["review"] })
      : record(`valid-child-${i}`, { parentId: "valid-root" }));
    const id = `orphan-at-position-${position}`;
    records.splice(position, 0, record(id, { parentId: "absent-parent-identifier" }));
    assert.throws(() => sweep(records, policy(), "2030-06-15"), names(id));
  }
});

// Extends public "a hold does not make a missing parent reference valid".
test("[unhappy-3] several holds cannot hide an orphan among protected records", () => {
  assert.throws(() => sweep([
    record("root", { holds: ["review"] }),
    record("valid-child", { parentId: "root" }),
    record("held-orphan-with-many-holds", { parentId: "root-missing", holds: ["z-review", "audit", "legal"] }),
  ], policy(), "2030-06-15"), names("held-orphan-with-many-holds"));
});

test("[unhappy-3] missing policy and youth do not make missing parents valid", () => {
  for (const overrides of [
    { category: "unconfigured" },
    { created: "2030-06-15" },
  ]) {
    const id = "otherwise-kept-orphan-identifier";
    assert.throws(() => sweep([
      record(id, { parentId: "absent", ...overrides }),
    ], policy(), "2030-06-15"), names(id));
  }
});

test("[unhappy-3] an existing category or hold name cannot stand in for a parent id", () => {
  for (const parentId of ["files", "review", "valid-root-prefix"]) {
    const id = `missing-parent-${parentId}-child`;
    assert.throws(() => sweep([
      record("valid-root-prefix-suffix", { holds: ["review"] }),
      record(id, { parentId }),
    ], policy(), "2030-06-15"), names(id));
  }
});

// Extends public "absent and null parent ids both mean there is no parent".
test("[unhappy-3] rootless records retain their own decisions among unrelated held families", () => {
  assert.deepEqual(sweep([
    record("null-flag", { parentId: null, created: "2030-06-05" }),
    record("held-root", { holds: ["review"], parentId: null }),
    record("absent-young", { created: "2030-06-15" }),
    record("null-old", { parentId: null }),
    record("absent-old"),
    record("actual-child", { parentId: "held-root" }),
  ], policy(), "2030-06-15"), [
    { id: "null-flag", decision: "flag", reason: "expired" },
    { id: "held-root", decision: "keep", reason: "hold:review" },
    { id: "absent-young", decision: "keep", reason: "within period" },
    { id: "null-old", decision: "delete", reason: "expired" },
    { id: "absent-old", decision: "delete", reason: "expired" },
    { id: "actual-child", decision: "keep", reason: "parent:held-root" },
  ]);
});
