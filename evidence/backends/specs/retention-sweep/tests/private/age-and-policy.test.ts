import { test } from "node:test";
import assert from "node:assert/strict";
import { sweep, type RetentionPolicy, type RetentionRecord } from "../../src/index.js";

function record(id: string, overrides: Partial<RetentionRecord> = {}): RetentionRecord {
  return { id, category: "archive", created: "2030-06-01", holds: [], region: "north", ...overrides };
}

function policy(periodDays = 11, graceDays = 3, fromLastAccess = false): RetentionPolicy {
  return { categories: { archive: { periodDays, fromLastAccess } }, regions: [], graceDays };
}

// Fixed UTC arithmetic is only used to construct dates; expected decisions below
// are explicit so the test does not reproduce the sweep algorithm.
function beforeRun(age: number): string {
  return new Date(Date.UTC(2032, 8, 19) - age * 86_400_000).toISOString().slice(0, 10);
}

// Extends public "keeps before the period and flags exactly when it expires".
test("[happy-1] multiple category periods distinguish adjacent expiry days in input order", () => {
  const p: RetentionPolicy = {
    categories: {
      short: { periodDays: 1, fromLastAccess: false },
      medium: { periodDays: 17, fromLastAccess: false },
      long: { periodDays: 801, fromLastAccess: false },
    },
    regions: [], graceDays: 6,
  };
  assert.deepEqual(sweep([
    record("z-long-edge", { category: "long", created: beforeRun(801) }),
    record("a-medium-before", { category: "medium", created: beforeRun(16) }),
    record("x-short-edge", { category: "short", created: beforeRun(1) }),
    record("b-long-before", { category: "long", created: beforeRun(800) }),
    record("w-medium-edge", { category: "medium", created: beforeRun(17) }),
    record("c-short-before", { category: "short", created: beforeRun(0) }),
  ], p, "2032-09-19"), [
    { id: "z-long-edge", decision: "flag", reason: "expired" },
    { id: "a-medium-before", decision: "keep", reason: "within period" },
    { id: "x-short-edge", decision: "flag", reason: "expired" },
    { id: "b-long-before", decision: "keep", reason: "within period" },
    { id: "w-medium-edge", decision: "flag", reason: "expired" },
    { id: "c-short-before", decision: "keep", reason: "within period" },
  ]);
});

// Extends public "flags through the last grace day and deletes at its endpoint".
test("[happy-1] short and very long grace periods start at expiration", () => {
  for (const grace of [1, 4, 43, 410]) {
    const p = policy(19, grace);
    assert.deepEqual(sweep([
      record("last-grace", { created: beforeRun(19 + grace - 1) }),
      record("at-end", { created: beforeRun(19 + grace) }),
      record("long-after", { created: beforeRun(19 + grace + 500) }),
    ], p, "2032-09-19"), [
      { id: "last-grace", decision: "flag", reason: "expired" },
      { id: "at-end", decision: "delete", reason: "expired" },
      { id: "long-after", decision: "delete", reason: "expired" },
    ]);
  }
});

// Extends public "creation-based retention ignores a recent last access".
test("[happy-1] creation based records can delete even when accessed on the run date", () => {
  assert.deepEqual(sweep([
    record("delete", { created: beforeRun(25), lastAccessed: "2032-09-19" }),
    record("flag", { created: beforeRun(22), lastAccessed: "2032-09-19" }),
    record("keep", { created: beforeRun(18), lastAccessed: "2032-09-19" }),
  ], policy(19, 6), "2032-09-19"), [
    { id: "delete", decision: "delete", reason: "expired" },
    { id: "flag", decision: "flag", reason: "expired" },
    { id: "keep", decision: "keep", reason: "within period" },
  ]);
});

test("[happy-1] no records yield no decisions", () => {
  assert.deepEqual(sweep([], policy(), "2030-06-15"), []);
});

// Extends public "zero grace deletes exactly at expiration".
test("[boundary-1] zero grace skips flagging for several category lengths", () => {
  for (const days of [1, 9, 65, 900]) {
    assert.deepEqual(sweep([
      record("endpoint", { created: beforeRun(days) }),
      record("overdue", { created: beforeRun(days + 1) }),
    ], policy(days, 0), "2032-09-19"), [
      { id: "endpoint", decision: "delete", reason: "expired" },
      { id: "overdue", decision: "delete", reason: "expired" },
    ]);
  }
});

// Extends public "zero grace still keeps a record one day before expiration".
test("[boundary-1] zero grace retains fresh and just unexpired access based records", () => {
  assert.deepEqual(sweep([
    record("fresh", { created: "2028-01-01", lastAccessed: beforeRun(0) }),
    record("before", { created: "2028-01-01", lastAccessed: beforeRun(12) }),
    record("edge", { created: "2028-01-01", lastAccessed: beforeRun(13) }),
  ], policy(13, 0, true), "2032-09-19"), [
    { id: "fresh", decision: "keep", reason: "within period" },
    { id: "before", decision: "keep", reason: "within period" },
    { id: "edge", decision: "delete", reason: "expired" },
  ]);
});

// Extends public "recent access keeps an otherwise old record".
test("[happy-2] mixed creation and access policies independently select their clocks", () => {
  const p = policy(11, 3, true);
  p.categories.creation = { periodDays: 11, fromLastAccess: false };
  assert.deepEqual(sweep([
    record("access", { created: "2020-01-01", lastAccessed: "2030-06-09" }),
    record("creation", { category: "creation", created: "2020-01-01", lastAccessed: "2030-06-09" }),
    record("access-old", { created: "2020-01-01", lastAccessed: "2030-06-01" }),
  ], p, "2030-06-15"), [
    { id: "access", decision: "keep", reason: "within period" },
    { id: "creation", decision: "delete", reason: "expired" },
    { id: "access-old", decision: "delete", reason: "expired" },
  ]);
});

// Extends public "absent and null last access both fall back to creation".
test("[happy-2] both missing access representations fall back at every age boundary", () => {
  for (const lastAccessed of [undefined, null]) {
    assert.deepEqual(sweep([
      record("before", { created: beforeRun(16), lastAccessed }),
      record("edge", { created: beforeRun(17), lastAccessed }),
      record("grace", { created: beforeRun(21), lastAccessed }),
      record("delete", { created: beforeRun(22), lastAccessed }),
    ], policy(17, 5, true), "2032-09-19"), [
      { id: "before", decision: "keep", reason: "within period" },
      { id: "edge", decision: "flag", reason: "expired" },
      { id: "grace", decision: "flag", reason: "expired" },
      { id: "delete", decision: "delete", reason: "expired" },
    ]);
  }
});

// Extends public "expiration and grace both count from last access".
test("[happy-2] access expiration and long grace cross leap February and a year boundary", () => {
  const r = record("access-year", { created: "2020-01-01", lastAccessed: "2023-12-31" });
  const p = policy(61, 10, true);
  for (const [run, decision, reason] of [
    ["2024-02-29", "keep", "within period"],
    ["2024-03-01", "flag", "expired"],
    ["2024-03-10", "flag", "expired"],
    ["2024-03-11", "delete", "expired"],
  ]) {
    assert.deepEqual(sweep([r], p, run), [{ id: r.id, decision, reason }]);
  }
});

// Extends public "a longer regional minimum keeps a record past its category period".
test("[boundary-2] regional matching uses each record region in a longer unordered list", () => {
  const p = policy(11, 3);
  p.regions = [
    { region: "unrelated", minimumDays: 1000 },
    { region: "south", minimumDays: 15 },
    { region: "north", minimumDays: 20 },
    { region: "west", minimumDays: 40 },
  ];
  assert.deepEqual(sweep([
    record("south", { region: "south" }),
    record("unlisted", { region: "not-listed" }),
    record("north"),
    record("west", { region: "west" }),
  ], p, "2030-06-16"), [
    { id: "south", decision: "flag", reason: "expired" },
    { id: "unlisted", decision: "delete", reason: "expired" },
    { id: "north", decision: "keep", reason: "within period" },
    { id: "west", decision: "keep", reason: "within period" },
  ]);
});

// Extends public "the regional minimum sets the expiration and grace endpoints".
test("[boundary-2] region minimum and grace use the last access clock together", () => {
  const p = policy(8, 4, true);
  p.regions = [{ region: "north", minimumDays: 23 }];
  assert.deepEqual(sweep([
    record("before", { created: "2020-01-01", lastAccessed: beforeRun(22) }),
    record("edge", { created: "2020-01-01", lastAccessed: beforeRun(23) }),
    record("last", { created: "2020-01-01", lastAccessed: beforeRun(26) }),
    record("end", { created: "2020-01-01", lastAccessed: beforeRun(27) }),
  ], p, "2032-09-19"), [
    { id: "before", decision: "keep", reason: "within period" },
    { id: "edge", decision: "flag", reason: "expired" },
    { id: "last", decision: "flag", reason: "expired" },
    { id: "end", decision: "delete", reason: "expired" },
  ]);
});

// Extends public "unlisted shorter and equal regional minimums leave the period unchanged".
test("[boundary-2] shorter and equal minimums do not add days at the deletion endpoint", () => {
  const p = policy(47, 9);
  p.regions = [
    { region: "small", minimumDays: 2 },
    { region: "same", minimumDays: 47 },
    { region: "unused", minimumDays: 999 },
  ];
  for (const age of [46, 47, 55, 56]) {
    const ids = ["not-listed", "small", "same"];
    assert.deepEqual(sweep(ids.map((region) => record(region, { region, created: beforeRun(age) })), p, "2032-09-19"),
      ids.map((id) => ({
        id,
        decision: age === 46 ? "keep" : age === 56 ? "delete" : "flag",
        reason: age === 46 ? "within period" : "expired",
      })));
  }
});

test("[boundary-2] the same region extends short categories while leaving longer ones alone", () => {
  const p = policy(11, 0);
  p.categories.long = { periodDays: 35, fromLastAccess: false };
  p.regions = [{ region: "north", minimumDays: 20 }];
  assert.deepEqual(sweep([
    record("short-edge", { created: beforeRun(20) }),
    record("long-before", { category: "long", created: beforeRun(34) }),
    record("long-edge", { category: "long", created: beforeRun(35) }),
  ], p, "2032-09-19"), [
    { id: "short-edge", decision: "delete", reason: "expired" },
    { id: "long-before", decision: "keep", reason: "within period" },
    { id: "long-edge", decision: "delete", reason: "expired" },
  ]);
});

// Extends public "the leap-year span reaches 366 days on February 28".
test("[boundary-3] several years and a nonleap century count exact calendar days", () => {
  for (const [created, before, endpoint, days] of [
    ["2023-03-01", "2024-02-29", "2024-03-01", 366],
    ["2024-02-29", "2028-02-28", "2028-02-29", 1461],
    ["2099-03-01", "2100-02-28", "2100-03-01", 365],
  ] as const) {
    assert.deepEqual(sweep([record("calendar", { created })], policy(days, 0), before), [
      { id: "calendar", decision: "keep", reason: "within period" },
    ]);
    assert.deepEqual(sweep([record("calendar", { created })], policy(days, 0), endpoint), [
      { id: "calendar", decision: "delete", reason: "expired" },
    ]);
  }
});

// Extends public "February 29 counts as a calendar day".
test("[boundary-3] ordinary month and year boundaries include every calendar day", () => {
  for (const [created, next, after] of [
    ["2027-02-28", "2027-03-01", "2027-03-02"],
    ["2028-02-29", "2028-03-01", "2028-03-02"],
    ["2030-04-30", "2030-05-01", "2030-05-02"],
    ["2030-12-31", "2031-01-01", "2031-01-02"],
  ]) {
    assert.deepEqual(sweep([record("crossing", { created })], policy(2, 0), next), [
      { id: "crossing", decision: "keep", reason: "within period" },
    ]);
    assert.deepEqual(sweep([record("crossing", { created })], policy(2, 0), after), [
      { id: "crossing", decision: "delete", reason: "expired" },
    ]);
  }
});

test("[boundary-3] grace days count across leap February as well as retention days", () => {
  assert.deepEqual(sweep([
    record("last", { created: "2024-02-27" }),
    record("end", { created: "2024-02-26" }),
  ], policy(1, 2), "2024-02-29"), [
    { id: "last", decision: "flag", reason: "expired" },
    { id: "end", decision: "delete", reason: "expired" },
  ]);
});
