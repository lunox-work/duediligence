import { test } from "node:test";
import assert from "node:assert/strict";
import { sweep } from "../../src/index.js";
import type { RetentionPolicy, RetentionRecord } from "../../src/index.js";

function record(overrides: Partial<RetentionRecord> & { id: string }): RetentionRecord {
  return {
    category: "logs",
    created: "2020-01-01",
    holds: [],
    region: "us",
    ...overrides,
  };
}

function policy(): RetentionPolicy {
  return {
    categories: { logs: { periodDays: 30, fromLastAccess: false } },
    regions: [],
    graceDays: 7,
  };
}

// logs records expire 30 days after creation and are deleted 7 days later.
const RUN_DATE = "2026-06-01";

function throwsNaming(id: string): (err: unknown) => boolean {
  return (err: unknown) => err instanceof Error && err.message.includes(id);
}

test("[happy-5] a child of a held record is kept because of its parent", () => {
  const recs = [
    record({ id: "p", holds: ["legal"] }),
    record({ id: "c", parentId: "p" }),
  ];
  assert.deepEqual(sweep(recs, policy(), RUN_DATE), [
    { id: "p", decision: "keep", reason: "hold:legal" },
    { id: "c", decision: "keep", reason: "parent:p" },
  ]);
});

test("[happy-5] a child of a flagged record follows its own age", () => {
  const recs = [
    // expires 2026-05-31, flagged on the run date
    record({ id: "p", created: "2026-05-01" }),
    record({ id: "c", parentId: "p" }),
  ];
  assert.deepEqual(sweep(recs, policy(), RUN_DATE), [
    { id: "p", decision: "flag", reason: "expired" },
    { id: "c", decision: "delete", reason: "expired" },
  ]);
});

test("[happy-5] a child of a deleted record follows its own age", () => {
  const recs = [
    record({ id: "p" }),
    record({ id: "c", parentId: "p", created: "2026-05-20" }),
  ];
  assert.deepEqual(sweep(recs, policy(), RUN_DATE), [
    { id: "p", decision: "delete", reason: "expired" },
    { id: "c", decision: "keep", reason: "within period" },
  ]);
});

test("[boundary-5] keeping passes down every level of descendants", () => {
  const recs = [
    record({ id: "a", holds: ["legal"] }),
    record({ id: "b", parentId: "a" }),
    record({ id: "c", parentId: "b" }),
  ];
  assert.deepEqual(sweep(recs, policy(), RUN_DATE), [
    { id: "a", decision: "keep", reason: "hold:legal" },
    { id: "b", decision: "keep", reason: "parent:a" },
    { id: "c", decision: "keep", reason: "parent:b" },
  ]);
});

test("[boundary-5] children listed before their parents get the same decisions, in input order", () => {
  const recs = [
    record({ id: "c", parentId: "b" }),
    record({ id: "b", parentId: "a" }),
    record({ id: "a", holds: ["legal"] }),
  ];
  assert.deepEqual(sweep(recs, policy(), RUN_DATE), [
    { id: "c", decision: "keep", reason: "parent:b" },
    { id: "b", decision: "keep", reason: "parent:a" },
    { id: "a", decision: "keep", reason: "hold:legal" },
  ]);
});

test("[unhappy-3] a record whose parent is not in the input is refused, naming its id", () => {
  const recs = [
    record({ id: "present" }),
    record({ id: "orphan-17", parentId: "ghost" }),
  ];
  assert.throws(() => sweep(recs, policy(), RUN_DATE), throwsNaming("orphan-17"));
});

test("[unhappy-3] a held record whose parent is not in the input is still refused", () => {
  const recs = [record({ id: "held-orphan-5", holds: ["legal"], parentId: "ghost" })];
  assert.throws(() => sweep(recs, policy(), RUN_DATE), throwsNaming("held-orphan-5"));
});

test("[unhappy-3] a null or absent parent id is no parent", () => {
  const recs = [
    record({ id: "x", parentId: null }),
    record({ id: "y" }),
  ];
  assert.deepEqual(sweep(recs, policy(), RUN_DATE), [
    { id: "x", decision: "delete", reason: "expired" },
    { id: "y", decision: "delete", reason: "expired" },
  ]);
});
