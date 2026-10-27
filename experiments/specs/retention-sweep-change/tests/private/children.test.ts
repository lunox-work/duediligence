import { test } from "node:test";
import assert from "node:assert/strict";
import { sweep } from "../../src/index.js";
import type {
  RecordDecision,
  RetentionPolicy,
  RetentionRecord,
} from "../../src/index.js";

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
    categories: {
      logs: { periodDays: 30, fromLastAccess: false },
      docs: { periodDays: 90, fromLastAccess: true },
    },
    regions: [],
    graceDays: 7,
  };
}

// logs records expire 30 days after creation and are deleted 7 days later.
const RUN_DATE = "2026-06-01";

function throwsNaming(id: string): (err: unknown) => boolean {
  return (err: unknown) => err instanceof Error && err.message.includes(id);
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  items.forEach((item: T, i: number) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) out.push([item, ...p]);
  });
  return out;
}

// Extends "[happy-5] a child of a held record is kept because of its parent":
// several children, of different ages, listed around the parent.
test("[happy-5] every expired child of a held record is kept because of its parent", () => {
  const recs = [
    record({ id: "c1", parentId: "p" }),
    record({ id: "p", holds: ["legal"] }),
    record({ id: "c2", parentId: "p", created: "2026-05-01" }),
    record({ id: "c3", parentId: "p", category: "docs", lastAccessed: "2021-01-01" }),
  ];
  assert.deepEqual(sweep(recs, policy(), RUN_DATE), [
    { id: "c1", decision: "keep", reason: "parent:p" },
    { id: "p", decision: "keep", reason: "hold:legal" },
    { id: "c2", decision: "keep", reason: "parent:p" },
    { id: "c3", decision: "keep", reason: "parent:p" },
  ]);
});

test("[happy-5] the reason names the parent's id, whatever it is", () => {
  const recs = [
    record({ id: "contract-2019-044", holds: ["litigation-7", "audit-2026"] }),
    record({ id: "attachment-9", parentId: "contract-2019-044" }),
  ];
  assert.deepEqual(sweep(recs, policy(), RUN_DATE), [
    { id: "contract-2019-044", decision: "keep", reason: "hold:audit-2026" },
    { id: "attachment-9", decision: "keep", reason: "parent:contract-2019-044" },
  ]);
});

test("[happy-5] an expired child of a parent kept within its period is kept because of its parent", () => {
  const recs = [
    record({ id: "p", created: "2026-05-20" }),
    record({ id: "c", parentId: "p" }),
  ];
  assert.deepEqual(sweep(recs, policy(), RUN_DATE), [
    { id: "p", decision: "keep", reason: "within period" },
    { id: "c", decision: "keep", reason: "parent:p" },
  ]);
});

test("[happy-5] an expired child of a parent kept with no policy is kept because of its parent", () => {
  const recs = [
    record({ id: "p", category: "invoices" }),
    record({ id: "c", parentId: "p" }),
  ];
  assert.deepEqual(sweep(recs, policy(), RUN_DATE), [
    { id: "p", decision: "keep", reason: "no policy" },
    { id: "c", decision: "keep", reason: "parent:p" },
  ]);
});

// Extends "[happy-5] a child of a flagged record follows its own age": a child within its period.
test("[happy-5] a child of a flagged record within its own period is kept within period", () => {
  const recs = [
    record({ id: "p", created: "2026-05-01" }),
    record({ id: "c", parentId: "p", created: "2026-05-25" }),
  ];
  assert.deepEqual(sweep(recs, policy(), RUN_DATE), [
    { id: "p", decision: "flag", reason: "expired" },
    { id: "c", decision: "keep", reason: "within period" },
  ]);
});

test("[happy-5] a child of a flagged record in its own grace is flagged", () => {
  const recs = [
    record({ id: "c", parentId: "p", created: "2026-04-30" }),
    record({ id: "p", created: "2026-05-01" }),
  ];
  assert.deepEqual(sweep(recs, policy(), RUN_DATE), [
    { id: "c", decision: "flag", reason: "expired" },
    { id: "p", decision: "flag", reason: "expired" },
  ]);
});

// Extends "[happy-5] a child of a deleted record follows its own age": children past period and grace.
test("[happy-5] a child of a deleted record follows its own age to flag or delete", () => {
  const recs = [
    record({ id: "p" }),
    record({ id: "c-old", parentId: "p" }),
    record({ id: "c-grace", parentId: "p", created: "2026-04-28" }),
  ];
  assert.deepEqual(sweep(recs, policy(), RUN_DATE), [
    { id: "p", decision: "delete", reason: "expired" },
    { id: "c-old", decision: "delete", reason: "expired" },
    { id: "c-grace", decision: "flag", reason: "expired" },
  ]);
});

test("[happy-5] a held child of a deleted record is kept for its own hold", () => {
  const recs = [
    record({ id: "p" }),
    record({ id: "c", parentId: "p", holds: ["export"] }),
  ];
  assert.deepEqual(sweep(recs, policy(), RUN_DATE), [
    { id: "p", decision: "delete", reason: "expired" },
    { id: "c", decision: "keep", reason: "hold:export" },
  ]);
});

// Extends "[boundary-5] keeping passes down every level of descendants": five levels, reversed.
test("[boundary-5] keeping passes down five levels listed deepest first", () => {
  const ids = ["l1", "l2", "l3", "l4", "l5"];
  const recs = ids
    .map((id: string, i: number) =>
      i === 0 ? record({ id, holds: ["legal"] }) : record({ id, parentId: ids[i - 1] }),
    )
    .reverse();
  assert.deepEqual(sweep(recs, policy(), RUN_DATE), [
    { id: "l5", decision: "keep", reason: "parent:l4" },
    { id: "l4", decision: "keep", reason: "parent:l3" },
    { id: "l3", decision: "keep", reason: "parent:l2" },
    { id: "l2", decision: "keep", reason: "parent:l1" },
    { id: "l1", decision: "keep", reason: "hold:legal" },
  ]);
});

// Extends "[boundary-5] children listed before their parents get the same decisions, in input order":
// every order of a held chain and a deleted chain.
test("[boundary-5] every order of the input gives the same decisions for a kept and an unkept family", () => {
  const recs = [
    record({ id: "a", holds: ["legal"] }),
    record({ id: "b", parentId: "a" }),
    record({ id: "c", parentId: "b" }),
    record({ id: "x" }),
    record({ id: "y", parentId: "x", created: "2026-05-01" }),
  ];
  const expected: Record<string, RecordDecision> = {
    a: { id: "a", decision: "keep", reason: "hold:legal" },
    b: { id: "b", decision: "keep", reason: "parent:a" },
    c: { id: "c", decision: "keep", reason: "parent:b" },
    x: { id: "x", decision: "delete", reason: "expired" },
    y: { id: "y", decision: "flag", reason: "expired" },
  };
  for (const order of permutations(recs)) {
    assert.deepEqual(
      sweep(order, policy(), RUN_DATE),
      order.map((r: RetentionRecord) => expected[r.id]),
      order.map((r: RetentionRecord) => r.id).join(","),
    );
  }
});

test("[boundary-5] keeping passes down every branch of a tree", () => {
  const recs = [
    record({ id: "leaf-2", parentId: "mid-b" }),
    record({ id: "mid-a", parentId: "root" }),
    record({ id: "leaf-1", parentId: "mid-a" }),
    record({ id: "root", holds: ["legal"] }),
    record({ id: "mid-b", parentId: "root", created: "2026-04-01" }),
    record({ id: "leaf-3", parentId: "mid-a", category: "docs" }),
  ];
  assert.deepEqual(sweep(recs, policy(), RUN_DATE), [
    { id: "leaf-2", decision: "keep", reason: "parent:mid-b" },
    { id: "mid-a", decision: "keep", reason: "parent:root" },
    { id: "leaf-1", decision: "keep", reason: "parent:mid-a" },
    { id: "root", decision: "keep", reason: "hold:legal" },
    { id: "mid-b", decision: "keep", reason: "parent:root" },
    { id: "leaf-3", decision: "keep", reason: "parent:mid-a" },
  ]);
});

test("[boundary-5] keeping passes down from a record held in the middle of a chain, not up", () => {
  const recs = [
    record({ id: "d", parentId: "c" }),
    record({ id: "c", parentId: "b" }),
    record({ id: "b", parentId: "a", holds: ["legal"] }),
    record({ id: "a" }),
  ];
  assert.deepEqual(sweep(recs, policy(), RUN_DATE), [
    { id: "d", decision: "keep", reason: "parent:c" },
    { id: "c", decision: "keep", reason: "parent:b" },
    { id: "b", decision: "keep", reason: "hold:legal" },
    { id: "a", decision: "delete", reason: "expired" },
  ]);
});

test("[boundary-5] keeping passes down from a parent kept within its period, in any order", () => {
  const recs = [
    record({ id: "g", parentId: "c" }),
    record({ id: "c", parentId: "p" }),
    record({ id: "p", created: "2026-05-30" }),
  ];
  assert.deepEqual(sweep(recs, policy(), RUN_DATE), [
    { id: "g", decision: "keep", reason: "parent:c" },
    { id: "c", decision: "keep", reason: "parent:p" },
    { id: "p", decision: "keep", reason: "within period" },
  ]);
});

test("[boundary-5] a long chain listed deepest first is kept all the way down", () => {
  const n = 300;
  const recs: RetentionRecord[] = [];
  for (let i = n - 1; i >= 0; i--) {
    recs.push(
      i === 0
        ? record({ id: "n0", holds: ["legal"] })
        : record({ id: `n${i}`, parentId: `n${i - 1}` }),
    );
  }
  const result = sweep(recs, policy(), RUN_DATE);
  assert.equal(result.length, n);
  for (let k = 0; k < n; k++) {
    const i = n - 1 - k;
    assert.deepEqual(
      result[k],
      i === 0
        ? { id: "n0", decision: "keep", reason: "hold:legal" }
        : { id: `n${i}`, decision: "keep", reason: `parent:n${i - 1}` },
    );
  }
});

// Extends "[unhappy-3] a record whose parent is not in the input is refused, naming its id":
// the orphan is in the middle of a family whose other parents are present.
test("[unhappy-3] a record in a chain whose parent is missing is refused, naming its id", () => {
  const recs = [
    record({ id: "kid-3", parentId: "mid-orphan-2" }),
    record({ id: "mid-orphan-2", parentId: "gone-root" }),
    record({ id: "other-1" }),
  ];
  assert.throws(() => sweep(recs, policy(), RUN_DATE), throwsNaming("mid-orphan-2"));
});

test("[unhappy-3] an orphan listed first among valid records is refused, naming its id", () => {
  const recs = [
    record({ id: "orphan-first-8", parentId: "nobody" }),
    record({ id: "p", holds: ["legal"] }),
    record({ id: "c", parentId: "p" }),
  ];
  assert.throws(() => sweep(recs, policy(), RUN_DATE), throwsNaming("orphan-first-8"));
});

test("[unhappy-3] an orphan with no policy is refused, naming its id", () => {
  const recs = [record({ id: "orphan-nopolicy-4", category: "invoices", parentId: "ghost" })];
  assert.throws(() => sweep(recs, policy(), RUN_DATE), throwsNaming("orphan-nopolicy-4"));
});

test("[unhappy-3] an orphan within its period is refused, naming its id", () => {
  const recs = [record({ id: "orphan-new-12", created: RUN_DATE, parentId: "ghost" })];
  assert.throws(() => sweep(recs, policy(), RUN_DATE), throwsNaming("orphan-new-12"));
});

test("[unhappy-3] a parent id matching only a category or region is not a parent", () => {
  const recs = [
    record({ id: "r-a" }),
    record({ id: "orphan-logs-3", parentId: "logs" }),
  ];
  assert.throws(() => sweep(recs, policy(), RUN_DATE), throwsNaming("orphan-logs-3"));
});

test("[unhappy-2] an impossible child of a held parent is refused, naming its id", () => {
  const recs = [
    record({ id: "p", holds: ["legal"] }),
    record({ id: "child-future-5", parentId: "p", created: "2026-06-10" }),
  ];
  assert.throws(() => sweep(recs, policy(), RUN_DATE), throwsNaming("child-future-5"));
});
