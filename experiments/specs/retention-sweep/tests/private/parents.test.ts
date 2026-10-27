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

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [
      item,
      ...rest,
    ]),
  );
}

function byId(decisions: RecordDecision[]): Record<string, RecordDecision> {
  return Object.fromEntries(decisions.map((d) => [d.id, d]));
}

// happy-4: A child of a kept record is kept

// extends: "[happy-4] an expired child of a held parent is kept for its parent"
test("[happy-4] every child of a held parent is kept for it, whether listed before or after it and whether flagged or deleted by age", () => {
  const records = [
    record({ id: "c-before", parentId: "p" }),
    record({ id: "c-grace", created: "2026-01-29", parentId: "p" }),
    record({ id: "p", holds: ["zeta", "beta"] }),
    record({ id: "c-after", parentId: "p" }),
  ];
  assert.deepEqual(sweep(records, POLICY, RUN), [
    { id: "c-before", decision: "keep", reason: "parent:p" },
    { id: "c-grace", decision: "keep", reason: "parent:p" },
    { id: "p", decision: "keep", reason: "hold:beta" },
    { id: "c-after", decision: "keep", reason: "parent:p" },
  ]);
});

// extends: "[happy-4] an expired child of a held parent is kept for its parent"
test("[happy-4] a child of a parent kept within its period is kept for its parent", () => {
  const records = [
    record({ id: "young-parent", created: "2026-02-20" }),
    record({ id: "old-child", created: "2020-01-01", parentId: "young-parent" }),
  ];
  assert.deepEqual(sweep(records, POLICY, RUN), [
    { id: "young-parent", decision: "keep", reason: "within period" },
    { id: "old-child", decision: "keep", reason: "parent:young-parent" },
  ]);
});

// extends: "[happy-4] an expired child of a held parent is kept for its parent"
test("[happy-4] a child of a parent kept for having no policy is kept for its parent", () => {
  const records = [
    record({ id: "old-child", parentId: "unruled" }),
    record({ id: "unruled", category: "invoices" }),
  ];
  assert.deepEqual(sweep(records, POLICY, RUN), [
    { id: "old-child", decision: "keep", reason: "parent:unruled" },
    { id: "unruled", decision: "keep", reason: "no policy" },
  ]);
});

// extends: "[happy-4] a child of a flagged or deleted parent follows its own age"
test("[happy-4] a long-expired child of a flagged parent is deleted, and children of a deleted parent follow their own ages", () => {
  const records = [
    record({ id: "fc", created: "2020-01-01", parentId: "fp" }),
    record({ id: "fp", created: "2026-01-29" }),
    record({ id: "dc-young", created: "2026-02-25", parentId: "dp" }),
    record({ id: "dc-grace", created: "2026-01-25", parentId: "dp" }),
    record({ id: "dc-old", created: "2024-01-01", parentId: "dp" }),
    record({ id: "dp", created: "2020-01-01" }),
  ];
  assert.deepEqual(sweep(records, POLICY, RUN), [
    { id: "fc", decision: "delete", reason: "expired" },
    { id: "fp", decision: "flag", reason: "expired" },
    { id: "dc-young", decision: "keep", reason: "within period" },
    { id: "dc-grace", decision: "flag", reason: "expired" },
    { id: "dc-old", decision: "delete", reason: "expired" },
    { id: "dp", decision: "delete", reason: "expired" },
  ]);
});

test("[happy-3] a held child of a deleted parent is kept for its own hold", () => {
  const records = [
    record({ id: "dp" }),
    record({ id: "held-child", parentId: "dp", holds: ["review", "case-1"] }),
  ];
  assert.deepEqual(sweep(records, POLICY, RUN), [
    { id: "dp", decision: "delete", reason: "expired" },
    { id: "held-child", decision: "keep", reason: "hold:case-1" },
  ]);
});

// boundary-4: Keeping passes down every level

// extends: "[boundary-4] keeping passes from a held record through every level of descendants"
test("[boundary-4] keeping passes down a chain of six levels, each naming its own parent", () => {
  const ids = ["l0", "l1", "l2", "l3", "l4", "l5"];
  const records = ids.map((id, i) =>
    record({ id, parentId: i === 0 ? null : ids[i - 1], holds: i === 0 ? ["legal"] : [] }),
  );
  assert.deepEqual(sweep(records, POLICY, RUN), [
    { id: "l0", decision: "keep", reason: "hold:legal" },
    { id: "l1", decision: "keep", reason: "parent:l0" },
    { id: "l2", decision: "keep", reason: "parent:l1" },
    { id: "l3", decision: "keep", reason: "parent:l2" },
    { id: "l4", decision: "keep", reason: "parent:l3" },
    { id: "l5", decision: "keep", reason: "parent:l4" },
  ]);
});

// extends: "[boundary-4] keeping passes from a held record through every level of descendants"
test("[boundary-4] keeping starts at a held record in the middle of a chain and passes down from there", () => {
  const records = [
    record({ id: "d", parentId: "c" }),
    record({ id: "a" }),
    record({ id: "c", parentId: "b" }),
    record({ id: "b", parentId: "a", holds: ["legal"] }),
  ];
  assert.deepEqual(sweep(records, POLICY, RUN), [
    { id: "d", decision: "keep", reason: "parent:c" },
    { id: "a", decision: "delete", reason: "expired" },
    { id: "c", decision: "keep", reason: "parent:b" },
    { id: "b", decision: "keep", reason: "hold:legal" },
  ]);
});

// extends: "[boundary-4] keeping passes from a held record through every level of descendants"
test("[boundary-4] keeping passes down every branch of a tree", () => {
  const records = [
    record({ id: "x3", parentId: "x2" }),
    record({ id: "y2", parentId: "y1" }),
    record({ id: "x1", parentId: "root" }),
    record({ id: "y3", parentId: "y2" }),
    record({ id: "root", holds: ["legal"] }),
    record({ id: "x2", parentId: "x1" }),
    record({ id: "y1", parentId: "root" }),
    record({ id: "loner" }),
  ];
  assert.deepEqual(sweep(records, POLICY, RUN), [
    { id: "x3", decision: "keep", reason: "parent:x2" },
    { id: "y2", decision: "keep", reason: "parent:y1" },
    { id: "x1", decision: "keep", reason: "parent:root" },
    { id: "y3", decision: "keep", reason: "parent:y2" },
    { id: "root", decision: "keep", reason: "hold:legal" },
    { id: "x2", decision: "keep", reason: "parent:x1" },
    { id: "y1", decision: "keep", reason: "parent:root" },
    { id: "loner", decision: "delete", reason: "expired" },
  ]);
});

// extends: "[boundary-4] the order of the records in the input does not change the decisions"
test("[boundary-4] a chain of forty levels listed deepest first is kept all the way down", () => {
  const n = 40;
  const records: RetentionRecord[] = [];
  for (let i = n - 1; i >= 0; i--) {
    records.push(
      record({
        id: `n${i}`,
        parentId: i === 0 ? null : `n${i - 1}`,
        holds: i === 0 ? ["legal"] : [],
      }),
    );
  }
  const expected = records.map((r) => ({
    id: r.id,
    decision: "keep",
    reason: r.parentId ? `parent:${r.parentId}` : "hold:legal",
  }));
  assert.deepEqual(sweep(records, POLICY, RUN), expected);
});

// extends: "[boundary-4] the order of the records in the input does not change the decisions"
test("[boundary-4] every order of a four-level chain and its neighbours gives the same decisions, in input order", () => {
  const base = [
    record({ id: "a", holds: ["legal"] }),
    record({ id: "b", parentId: "a" }),
    record({ id: "c", parentId: "b" }),
    record({ id: "d", parentId: "c" }),
    record({ id: "e", created: "2026-01-29", parentId: "f" }),
    record({ id: "f" }),
  ];
  const expected: Record<string, RecordDecision> = {
    a: { id: "a", decision: "keep", reason: "hold:legal" },
    b: { id: "b", decision: "keep", reason: "parent:a" },
    c: { id: "c", decision: "keep", reason: "parent:b" },
    d: { id: "d", decision: "keep", reason: "parent:c" },
    e: { id: "e", decision: "flag", reason: "expired" },
    f: { id: "f", decision: "delete", reason: "expired" },
  };
  for (const order of permutations(base)) {
    const result = sweep(order, POLICY, RUN);
    assert.deepEqual(
      result.map((d) => d.id),
      order.map((r) => r.id),
    );
    assert.deepEqual(byId(result), expected);
  }
});

// unhappy-3: A parent that is not in the input

// extends: "[unhappy-3] a record whose parent is not among the records is refused naming its id"
test("[unhappy-3] an orphan listed first is refused naming its id", () => {
  const records = [
    record({ id: "first-orphan-71", parentId: "nobody-here" }),
    record({ id: "present-2" }),
    record({ id: "present-3", parentId: "present-2" }),
  ];
  assert.throws(() => sweep(records, POLICY, RUN), namesId("first-orphan-71"));
});

// extends: "[unhappy-3] a record whose parent is not among the records is refused naming its id"
test("[unhappy-3] an orphan at the bottom of a held chain is refused naming its id", () => {
  const records = [
    record({ id: "top", holds: ["legal"] }),
    record({ id: "mid", parentId: "top" }),
    record({ id: "deep-orphan-46", parentId: "missing-mid-2" }),
  ];
  assert.throws(() => sweep(records, POLICY, RUN), namesId("deep-orphan-46"));
});

// extends: "[unhappy-3] a record whose parent is not among the records is refused naming its id"
test("[unhappy-3] an orphan that is held, or has no policy, or is within its period is still refused", () => {
  const cases = [
    record({ id: "held-orphan-18", holds: ["legal"], parentId: "gone-1" }),
    record({ id: "unruled-orphan-29", category: "invoices", parentId: "gone-2" }),
    record({ id: "young-orphan-35", created: "2026-02-28", parentId: "gone-3" }),
  ];
  for (const orphan of cases) {
    const records = [record({ id: "present-4" }), orphan];
    assert.throws(() => sweep(records, POLICY, RUN), namesId(orphan.id));
  }
});

// extends: "[unhappy-3] a parent listed after its child is among the records"
test("[unhappy-3] a parent id differing from a record's id only in case is not among the records", () => {
  const records = [
    record({ id: "parent" }),
    record({ id: "case-orphan-53", parentId: "Parent" }),
  ];
  assert.throws(() => sweep(records, POLICY, RUN), namesId("case-orphan-53"));
});

// extends: "[unhappy-3] a parent listed after its child is among the records"
test("[unhappy-3] parents listed far after their children, across several families, are among the records", () => {
  const records = [
    record({ id: "k1", parentId: "m1" }),
    record({ id: "k2", parentId: "m2", created: "2026-02-25" }),
    record({ id: "k3", parentId: "m1", created: "2026-01-29" }),
    record({ id: "filler" }),
    record({ id: "m2" }),
    record({ id: "m1", parentId: null }),
  ];
  assert.deepEqual(sweep(records, POLICY, RUN), [
    { id: "k1", decision: "delete", reason: "expired" },
    { id: "k2", decision: "keep", reason: "within period" },
    { id: "k3", decision: "flag", reason: "expired" },
    { id: "filler", decision: "delete", reason: "expired" },
    { id: "m2", decision: "delete", reason: "expired" },
    { id: "m1", decision: "delete", reason: "expired" },
  ]);
});
