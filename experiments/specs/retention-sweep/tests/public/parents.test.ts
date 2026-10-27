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
  categories: { logs: { periodDays: 30, fromLastAccess: false } },
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

// happy-4: A child of a kept record is kept

test("[happy-4] an expired child of a held parent is kept for its parent", () => {
  const records = [
    record({ id: "p", holds: ["legal"] }),
    record({ id: "c", parentId: "p" }),
  ];
  assert.deepEqual(sweep(records, POLICY, RUN), [
    { id: "p", decision: "keep", reason: "hold:legal" },
    { id: "c", decision: "keep", reason: "parent:p" },
  ]);
});

test("[happy-4] a child of a flagged or deleted parent follows its own age", () => {
  const records = [
    // flagged: age 30 on the run date
    record({ id: "fp", created: "2026-01-30" }),
    record({ id: "fc", created: "2026-02-20", parentId: "fp" }),
    // deleted: long expired
    record({ id: "dp", created: "2020-01-01" }),
    record({ id: "dc", created: "2026-01-30", parentId: "dp" }),
  ];
  assert.deepEqual(sweep(records, POLICY, RUN), [
    { id: "fp", decision: "flag", reason: "expired" },
    { id: "fc", decision: "keep", reason: "within period" },
    { id: "dp", decision: "delete", reason: "expired" },
    { id: "dc", decision: "flag", reason: "expired" },
  ]);
});

// boundary-4: Keeping passes down every level

test("[boundary-4] keeping passes from a held record through every level of descendants", () => {
  const records = [
    record({ id: "a", holds: ["legal"] }),
    record({ id: "b", parentId: "a" }),
    record({ id: "c", parentId: "b" }),
  ];
  assert.deepEqual(sweep(records, POLICY, RUN), [
    { id: "a", decision: "keep", reason: "hold:legal" },
    { id: "b", decision: "keep", reason: "parent:a" },
    { id: "c", decision: "keep", reason: "parent:b" },
  ]);
});

test("[boundary-4] the order of the records in the input does not change the decisions", () => {
  const records = [
    record({ id: "c", parentId: "b" }),
    record({ id: "b", parentId: "a" }),
    record({ id: "a", holds: ["legal"] }),
  ];
  assert.deepEqual(sweep(records, POLICY, RUN), [
    { id: "c", decision: "keep", reason: "parent:b" },
    { id: "b", decision: "keep", reason: "parent:a" },
    { id: "a", decision: "keep", reason: "hold:legal" },
  ]);
});

// unhappy-3: A parent that is not in the input

test("[unhappy-3] a record whose parent is not among the records is refused naming its id", () => {
  const records = [
    record({ id: "present-1" }),
    record({ id: "orphan-rec-9", parentId: "ghost-parent-3" }),
  ];
  assert.throws(() => sweep(records, POLICY, RUN), namesId("orphan-rec-9"));
});

test("[unhappy-3] a parent listed after its child is among the records", () => {
  const records = [
    record({ id: "kid", parentId: "mom" }),
    record({ id: "mom" }),
    record({ id: "solo", parentId: null }),
  ];
  assert.deepEqual(sweep(records, POLICY, RUN), [
    { id: "kid", decision: "delete", reason: "expired" },
    { id: "mom", decision: "delete", reason: "expired" },
    { id: "solo", decision: "delete", reason: "expired" },
  ]);
});
