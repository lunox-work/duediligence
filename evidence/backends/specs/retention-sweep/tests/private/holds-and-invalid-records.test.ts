import { test } from "node:test";
import assert from "node:assert/strict";
import { sweep, type RetentionPolicy, type RetentionRecord } from "../../src/index.js";

function record(id: string, overrides: Partial<RetentionRecord> = {}): RetentionRecord {
  return { id, category: "documents", created: "2029-01-01", holds: [], region: "island", ...overrides };
}

function policy(): RetentionPolicy {
  return {
    categories: { documents: { periodDays: 12, fromLastAccess: false } },
    regions: [], graceDays: 5,
  };
}

function names(id: string): (error: unknown) => boolean {
  return (error: unknown): boolean => error instanceof Error && error.message.includes(id);
}

// Extends public "an expired held record names the first sorted hold".
test("[happy-3] the minimum of many hold names is chosen at any list position", () => {
  const orders = [
    ["zeta", "gamma", "beta", "alpha", "epsilon"],
    ["alpha", "epsilon", "gamma", "zeta", "beta"],
    ["beta", "zeta", "epsilon", "gamma", "alpha"],
  ];
  assert.deepEqual(sweep(orders.map((holds, i) => record(`held-${i}`, { holds })), policy(), "2030-06-15"),
    orders.map((_, i) => ({ id: `held-${i}`, decision: "keep", reason: "hold:alpha" })));
});

test("[happy-3] holds take effect before age even for fresh and grace period records", () => {
  assert.deepEqual(sweep([
    record("fresh-held", { created: "2030-06-15", holds: ["review"] }),
    record("grace-held", { created: "2030-06-02", holds: ["review", "audit"] }),
    record("old-held", { holds: ["review"] }),
  ], policy(), "2030-06-15"), [
    { id: "fresh-held", decision: "keep", reason: "hold:review" },
    { id: "grace-held", decision: "keep", reason: "hold:audit" },
    { id: "old-held", decision: "keep", reason: "hold:review" },
  ]);
});

// Extends public "an empty hold list permits flagging and deletion at their boundaries".
test("[happy-3] holds apply per record without leaking between records in a mixed batch", () => {
  const p = policy();
  p.categories.access = { periodDays: 12, fromLastAccess: true };
  assert.deepEqual(sweep([
    record("held-start", { holds: ["z-review"] }),
    record("empty-young", { created: "2030-06-04" }),
    record("empty-edge", { category: "access", lastAccessed: "2030-06-03" }),
    record("held-middle", { holds: ["b-review", "a-review"] }),
    record("empty-end", { category: "access", lastAccessed: "2030-05-29" }),
    record("empty-old"),
  ], p, "2030-06-15"), [
    { id: "held-start", decision: "keep", reason: "hold:z-review" },
    { id: "empty-young", decision: "keep", reason: "within period" },
    { id: "empty-edge", decision: "flag", reason: "expired" },
    { id: "held-middle", decision: "keep", reason: "hold:a-review" },
    { id: "empty-end", decision: "delete", reason: "expired" },
    { id: "empty-old", decision: "delete", reason: "expired" },
  ]);
});

// Extends public "a category missing from an otherwise populated policy is kept".
test("[unhappy-1] category lookup is exact across multiple configured and missing categories", () => {
  const p = policy();
  p.categories.document = { periodDays: 900, fromLastAccess: false };
  assert.deepEqual(sweep([
    record("plural-configured"),
    record("different-case", { category: "Documents" }),
    record("singular-configured", { category: "document", created: "2030-01-01" }),
    record("prefix-only", { category: "doc" }),
    record("unrelated", { category: "receipts" }),
  ], p, "2030-06-15"), [
    { id: "plural-configured", decision: "delete", reason: "expired" },
    { id: "different-case", decision: "keep", reason: "no policy" },
    { id: "singular-configured", decision: "keep", reason: "within period" },
    { id: "prefix-only", decision: "keep", reason: "no policy" },
    { id: "unrelated", decision: "keep", reason: "no policy" },
  ]);
});

// Extends public "regional rules and zero grace cannot supply a missing category policy".
test("[unhappy-1] an empty category map protects many ages and regions regardless of minimums", () => {
  const p: RetentionPolicy = {
    categories: {}, graceDays: 0,
    regions: [
      { region: "tiny", minimumDays: 1 },
      { region: "huge", minimumDays: 10000 },
    ],
  };
  assert.deepEqual(sweep([
    record("old-tiny", { created: "1990-01-01", region: "tiny" }),
    record("old-huge", { created: "1990-01-01", region: "huge" }),
    record("new-unlisted", { created: "2030-06-15", category: "images", region: "unlisted" }),
  ], p, "2030-06-15"), [
    { id: "old-tiny", decision: "keep", reason: "no policy" },
    { id: "old-huge", decision: "keep", reason: "no policy" },
    { id: "new-unlisted", decision: "keep", reason: "no policy" },
  ]);
});

test("[unhappy-1] object prototype member names are not configured category policies", () => {
  const records = ["constructor", "toString", "__proto__"].map((category) =>
    record(`missing-category-${category}`, { category }));
  assert.deepEqual(sweep(records, policy(), "2030-06-15"), records.map((r) => ({
    id: r.id, decision: "keep", reason: "no policy",
  })));
});

// Extends public "creation one day after the run date throws an error naming the record".
test("[unhappy-2] future creation is rejected at every position of a larger batch", () => {
  for (const position of [0, 4, 8]) {
    const records = Array.from({ length: 9 }, (_, i) => record(`valid-${i}`));
    const id = `future-creation-position-${position}`;
    records[position] = record(id, { created: "2040-01-01" });
    assert.throws(() => sweep(records, policy(), "2030-06-15"), names(id));
  }
});

// Extends public "last access one day before creation throws an error naming the record".
test("[unhappy-2] much earlier last access is rejected in both category clock modes", () => {
  for (const fromLastAccess of [false, true]) {
    const p = policy();
    p.categories.documents.fromLastAccess = fromLastAccess;
    assert.throws(() => sweep([
      record("valid-before"),
      record("access-years-before-creation", { lastAccessed: "2000-02-29" }),
      record("valid-after"),
    ], p, "2030-06-15"), names("access-years-before-creation"));
  }
});

// Extends public "last access one day after the run date throws an error naming the record".
test("[unhappy-2] future last access is rejected at the end of a mixed category batch", () => {
  for (const fromLastAccess of [false, true]) {
    const p = policy();
    p.categories.documents.fromLastAccess = fromLastAccess;
    assert.throws(() => sweep([
      record("known-valid"),
      record("no-policy-valid", { category: "unconfigured" }),
      record("held-valid", { holds: ["review"] }),
      record("future-access-years-later", { lastAccessed: "2040-12-31" }),
    ], p, "2030-06-15"), names("future-access-years-later"));
  }
});

test("[unhappy-2] a hold does not bypass any date validity rule", () => {
  const invalid: Partial<RetentionRecord>[] = [
    { created: "2030-06-16" },
    { lastAccessed: "2028-12-31" },
    { lastAccessed: "2030-06-16" },
  ];
  for (let i = 0; i < invalid.length; i++) {
    const id = `held-invalid-date-${i}`;
    assert.throws(() => sweep([record(id, { holds: ["review"], ...invalid[i] })], policy(), "2030-06-15"), names(id));
  }
});

test("[unhappy-2] absence of category policy does not bypass any date validity rule", () => {
  const invalid: Partial<RetentionRecord>[] = [
    { created: "2030-06-16" },
    { lastAccessed: "2028-12-31" },
    { lastAccessed: "2030-06-16" },
  ];
  for (let i = 0; i < invalid.length; i++) {
    const id = `unconfigured-invalid-date-${i}`;
    const p = policy();
    p.categories = {};
    assert.throws(() => sweep([record(id, invalid[i])], p, "2030-06-15"), names(id));
  }
});

test("[unhappy-2] a kept parent cannot mask invalid dates in its child", () => {
  const invalid: Partial<RetentionRecord>[] = [
    { created: "2030-06-16" },
    { lastAccessed: "2028-12-31" },
    { lastAccessed: "2030-06-16" },
  ];
  for (let i = 0; i < invalid.length; i++) {
    const id = `parent-protected-invalid-date-${i}`;
    assert.throws(() => sweep([
      record(id, { parentId: "keeper", ...invalid[i] }),
      record("keeper", { holds: ["review"] }),
    ], policy(), "2030-06-15"), names(id));
  }
});

// Extends public "creation and access may equal each other and the run date".
test("[unhappy-2] equal date endpoints remain valid in each category clock mode", () => {
  for (const fromLastAccess of [false, true]) {
    const p = policy();
    p.categories.documents.fromLastAccess = fromLastAccess;
    assert.deepEqual(sweep([
      record("all-equal", { created: "2030-06-15", lastAccessed: "2030-06-15" }),
      record("access-equals-created", { created: "2030-06-03", lastAccessed: "2030-06-03" }),
      record("access-equals-run", { lastAccessed: "2030-06-15" }),
      record("never-accessed-null", { created: "2030-06-15", lastAccessed: null }),
      record("never-accessed-absent", { created: "2030-06-15" }),
    ], p, "2030-06-15"), [
      { id: "all-equal", decision: "keep", reason: "within period" },
      { id: "access-equals-created", decision: "flag", reason: "expired" },
      { id: "access-equals-run", decision: fromLastAccess ? "keep" : "delete", reason: fromLastAccess ? "within period" : "expired" },
      { id: "never-accessed-null", decision: "keep", reason: "within period" },
      { id: "never-accessed-absent", decision: "keep", reason: "within period" },
    ]);
  }
});
