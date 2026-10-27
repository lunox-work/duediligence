import { test } from "node:test";
import assert from "node:assert/strict";
import { sweep } from "../../src/index.js";
import type {
  Decision,
  RecordDecision,
  RetentionPolicy,
  RetentionRecord,
} from "../../src/index.js";

function record(overrides: Partial<RetentionRecord> = {}): RetentionRecord {
  return {
    id: "r1",
    category: "logs",
    created: "2026-01-01",
    holds: [],
    region: "us",
    ...overrides,
  };
}

function policy(overrides: Partial<RetentionPolicy> = {}): RetentionPolicy {
  return {
    categories: { logs: { periodDays: 30, fromLastAccess: false } },
    regions: [],
    graceDays: 7,
    ...overrides,
  };
}

function decide(
  rec: RetentionRecord,
  pol: RetentionPolicy,
  runDate: string,
): RecordDecision {
  const result = sweep([rec], pol, runDate);
  assert.equal(result.length, 1);
  return result[0];
}

const KEEP = { decision: "keep", reason: "within period" } as const;
const FLAG = { decision: "flag", reason: "expired" } as const;
const DELETE = { decision: "delete", reason: "expired" } as const;

function expectOn(
  rec: RetentionRecord,
  pol: RetentionPolicy,
  cases: [string, { decision: Decision; reason: string }][],
): void {
  for (const [runDate, expected] of cases) {
    assert.deepEqual(
      decide(rec, pol, runDate),
      { id: rec.id, ...expected },
      `run date ${runDate}`,
    );
  }
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);
}

// Extends "[happy-1] a record past its period is flagged, then deleted after grace":
// other period and grace, crossing the end of February.
test("[happy-1] a 45-day period with 10 days of grace crosses February's end", () => {
  const pol = policy({
    categories: { logs: { periodDays: 45, fromLastAccess: false } },
    graceDays: 10,
  });
  const rec = record({ id: "inv-2026-0001", created: "2026-01-15" });
  expectOn(rec, pol, [
    ["2026-02-28", KEEP],
    ["2026-03-01", FLAG],
    ["2026-03-10", FLAG],
    ["2026-03-11", DELETE],
    ["2026-09-30", DELETE],
  ]);
});

// Extends "[happy-1] a record before its period ends is kept, within period": across a year end.
test("[happy-1] a period that crosses a year end expires on the right day", () => {
  const rec = record({ id: "ye", created: "2025-12-20" });
  expectOn(rec, policy(), [
    ["2025-12-20", KEEP],
    ["2026-01-18", KEEP],
    ["2026-01-19", FLAG],
    ["2026-01-25", FLAG],
    ["2026-01-26", DELETE],
  ]);
});

// Extends "[happy-1] the last day of grace is still flagged": a grace of one day.
test("[happy-1] a grace period of one day flags for exactly one day", () => {
  const pol = policy({ graceDays: 1 });
  expectOn(record(), pol, [
    ["2026-01-30", KEEP],
    ["2026-01-31", FLAG],
    ["2026-02-01", DELETE],
  ]);
});

// Extends "[happy-1] the last day of grace is still flagged": a long grace period.
test("[happy-1] a long grace period keeps flagging until it ends", () => {
  const pol = policy({ graceDays: 365 });
  expectOn(record(), pol, [
    ["2026-01-31", FLAG],
    ["2026-07-15", FLAG],
    ["2027-01-30", FLAG],
    ["2027-01-31", DELETE],
  ]);
});

// Extends "[happy-1] a record past its period is flagged, then deleted after grace":
// every day from creation to well past grace.
test("[happy-1] each day around the period and grace gets the right decision", () => {
  const pol = policy({
    categories: { logs: { periodDays: 20, fromLastAccess: false } },
    graceDays: 5,
  });
  const created = "2026-05-20";
  for (let age = 0; age <= 40; age++) {
    const runDate = addDays(created, age);
    const expected = age < 20 ? KEEP : age < 25 ? FLAG : DELETE;
    assert.deepEqual(
      decide(record({ created }), pol, runDate),
      { id: "r1", ...expected },
      `age ${age}`,
    );
  }
});

// Extends "[happy-1] a record past its period is flagged, then deleted after grace":
// several records decided in one sweep, returned in input order.
test("[happy-1] several records in one sweep are each decided on their own age, in input order", () => {
  const recs = [
    record({ id: "deleted-1", created: "2026-01-01" }),
    record({ id: "kept-1", created: "2026-02-01" }),
    record({ id: "flagged-1", created: "2026-01-05" }),
    record({ id: "kept-2", created: "2026-02-10" }),
    record({ id: "deleted-2", created: "2025-06-01" }),
  ];
  assert.deepEqual(sweep(recs, policy(), "2026-02-10"), [
    { id: "deleted-1", ...DELETE },
    { id: "kept-1", ...KEEP },
    { id: "flagged-1", ...FLAG },
    { id: "kept-2", ...KEEP },
    { id: "deleted-2", ...DELETE },
  ]);
});

// Extends "[happy-1] a record created on the run date is kept": many records, larger input.
test("[happy-1] a thousand records come back one per record, in input order", () => {
  const recs: RetentionRecord[] = [];
  const expected: RecordDecision[] = [];
  for (let i = 0; i < 1000; i++) {
    const age = (i * 7) % 50;
    recs.push(record({ id: `rec-${i}`, created: addDays("2026-03-01", -age) }));
    const outcome = age < 30 ? KEEP : age < 37 ? FLAG : DELETE;
    expected.push({ id: `rec-${i}`, ...outcome });
  }
  assert.deepEqual(sweep(recs, policy(), "2026-03-01"), expected);
});

test("[happy-1] an empty input gives no decisions", () => {
  assert.deepEqual(sweep([], policy(), "2026-03-01"), []);
});

// Extends "[boundary-1] a grace period of zero deletes on the day the period is reached":
// another period, crossing February's end.
test("[boundary-1] a grace period of zero deletes on the day a 10-day period is reached", () => {
  const pol = policy({
    categories: { logs: { periodDays: 10, fromLastAccess: false } },
    graceDays: 0,
  });
  expectOn(record({ created: "2026-02-20" }), pol, [
    ["2026-03-01", KEEP],
    ["2026-03-02", DELETE],
    ["2026-03-03", DELETE],
  ]);
});

// Extends "[boundary-1] a grace period of zero still keeps the day before the period is reached":
// no day is ever flagged.
test("[boundary-1] a grace period of zero never flags on any day", () => {
  const pol = policy({ graceDays: 0 });
  for (let age = 0; age <= 60; age++) {
    const runDate = addDays("2026-01-01", age);
    assert.deepEqual(
      decide(record(), pol, runDate),
      { id: "r1", ...(age < 30 ? KEEP : DELETE) },
      `age ${age}`,
    );
  }
});

test("[boundary-1] a grace period of zero deletes an access-based record when its period from access is reached", () => {
  const pol = policy({
    categories: { docs: { periodDays: 90, fromLastAccess: true } },
    graceDays: 0,
  });
  const rec = record({ category: "docs", created: "2025-01-01", lastAccessed: "2026-01-01" });
  expectOn(rec, pol, [
    ["2026-03-31", KEEP],
    ["2026-04-01", DELETE],
  ]);
});

test("[boundary-1] a grace period of zero deletes when a region's longer minimum is reached", () => {
  const pol = policy({ regions: [{ region: "eu", minimumDays: 60 }], graceDays: 0 });
  const rec = record({ region: "eu", created: "2026-01-01" });
  expectOn(rec, pol, [
    ["2026-01-31", KEEP],
    ["2026-03-01", KEEP],
    ["2026-03-02", DELETE],
  ]);
});

// Extends "[happy-2] an access-based record expires exactly its period after the last access":
// another period and dates, through the grace period.
test("[happy-2] a 14-day access-based period runs from the last access through its grace", () => {
  const pol = policy({
    categories: { docs: { periodDays: 14, fromLastAccess: true } },
  });
  const rec = record({ category: "docs", created: "2025-06-01", lastAccessed: "2026-02-20" });
  expectOn(rec, pol, [
    ["2026-02-20", KEEP],
    ["2026-03-05", KEEP],
    ["2026-03-06", FLAG],
    ["2026-03-12", FLAG],
    ["2026-03-13", DELETE],
  ]);
});

// Extends "[happy-2] an access-based record never accessed counts from its created date":
// through the grace period to deletion.
test("[happy-2] a never-accessed access-based record is deleted after grace from its created date", () => {
  const pol = policy({
    categories: { docs: { periodDays: 90, fromLastAccess: true } },
  });
  for (const rec of [
    record({ category: "docs", created: "2026-01-01" }),
    record({ category: "docs", created: "2026-01-01", lastAccessed: null }),
  ]) {
    expectOn(rec, pol, [
      ["2026-04-07", FLAG],
      ["2026-04-08", DELETE],
    ]);
  }
});

// Extends "[happy-2] a category not counted from last access ignores the last access":
// a very recent access does not save it from deletion.
test("[happy-2] a category not counted from last access deletes despite a recent access", () => {
  const rec = record({ created: "2026-01-01", lastAccessed: "2026-02-05" });
  expectOn(rec, policy(), [
    ["2026-02-06", FLAG],
    ["2026-02-07", DELETE],
  ]);
});

test("[happy-2] a region's minimum counts from creation, not from the last access", () => {
  const pol = policy({
    categories: { docs: { periodDays: 30, fromLastAccess: true } },
    regions: [{ region: "eu", minimumDays: 120 }],
  });
  // period from access ends 2026-02-09; minimum from creation ends 2026-05-01;
  // a minimum counted from access would end 2026-05-10.
  const rec = record({
    category: "docs",
    region: "eu",
    created: "2026-01-01",
    lastAccessed: "2026-01-10",
  });
  expectOn(rec, pol, [
    ["2026-02-09", KEEP],
    ["2026-04-30", KEEP],
    ["2026-05-01", FLAG],
    ["2026-05-07", FLAG],
    ["2026-05-08", DELETE],
  ]);
});

test("[happy-2] access-based and creation-based categories are counted differently in one sweep", () => {
  const pol = policy({
    categories: {
      logs: { periodDays: 30, fromLastAccess: false },
      docs: { periodDays: 30, fromLastAccess: true },
    },
  });
  const recs = [
    record({ id: "logs-1", category: "logs", created: "2026-01-01", lastAccessed: "2026-02-01" }),
    record({ id: "docs-1", category: "docs", created: "2026-01-01", lastAccessed: "2026-02-01" }),
  ];
  assert.deepEqual(sweep(recs, pol, "2026-02-15"), [
    { id: "logs-1", ...DELETE },
    { id: "docs-1", ...KEEP },
  ]);
});

// Extends "[boundary-2] a region's longer minimum keeps a record past the category's period":
// the record's region is not the first in the list.
test("[boundary-2] the record's own region's minimum applies, wherever it is in the list", () => {
  const pol = policy({
    regions: [
      { region: "us", minimumDays: 10 },
      { region: "apac", minimumDays: 200 },
      { region: "eu", minimumDays: 60 },
    ],
  });
  const rec = record({ region: "eu", created: "2026-01-01" });
  expectOn(rec, pol, [
    ["2026-02-15", KEEP],
    ["2026-03-01", KEEP],
    ["2026-03-02", FLAG],
    ["2026-03-09", DELETE],
  ]);
});

test("[boundary-2] records in different regions get their own minimums in one sweep", () => {
  const pol = policy({
    regions: [
      { region: "eu", minimumDays: 60 },
      { region: "br", minimumDays: 45 },
    ],
  });
  const recs = [
    record({ id: "us-1", region: "us" }),
    record({ id: "eu-1", region: "eu" }),
    record({ id: "br-1", region: "br" }),
  ];
  // us expires 2026-01-31, br 2026-02-15, eu 2026-03-02
  assert.deepEqual(sweep(recs, pol, "2026-02-16"), [
    { id: "us-1", ...DELETE },
    { id: "eu-1", ...KEEP },
    { id: "br-1", ...FLAG },
  ]);
});

test("[boundary-2] a region minimum equal to the category's period changes nothing", () => {
  const pol = policy({ regions: [{ region: "eu", minimumDays: 30 }] });
  expectOn(record({ region: "eu" }), pol, [
    ["2026-01-30", KEEP],
    ["2026-01-31", FLAG],
    ["2026-02-07", DELETE],
  ]);
});

// Extends "[boundary-2] a region minimum shorter than the category's period changes nothing":
// for an access-based category.
test("[boundary-2] a shorter region minimum leaves an access-based period counted from access", () => {
  const pol = policy({
    categories: { docs: { periodDays: 30, fromLastAccess: true } },
    regions: [{ region: "eu", minimumDays: 10 }],
  });
  const rec = record({
    category: "docs",
    region: "eu",
    created: "2026-01-01",
    lastAccessed: "2026-01-20",
  });
  expectOn(rec, pol, [
    ["2026-02-18", KEEP],
    ["2026-02-19", FLAG],
  ]);
});

test("[boundary-2] the later expiry wins when the period from access ends after the minimum from creation", () => {
  const pol = policy({
    categories: { docs: { periodDays: 90, fromLastAccess: true } },
    regions: [{ region: "eu", minimumDays: 100 }],
  });
  // period from access ends 2026-05-30; minimum from creation ends 2026-04-11
  const rec = record({
    category: "docs",
    region: "eu",
    created: "2026-01-01",
    lastAccessed: "2026-03-01",
  });
  expectOn(rec, pol, [
    ["2026-04-11", KEEP],
    ["2026-05-29", KEEP],
    ["2026-05-30", FLAG],
  ]);
});

test("[boundary-2] a never-accessed access-based record in a region takes the later of both from creation", () => {
  const pol = policy({
    categories: { docs: { periodDays: 30, fromLastAccess: true } },
    regions: [{ region: "eu", minimumDays: 60 }],
  });
  expectOn(record({ category: "docs", region: "eu" }), pol, [
    ["2026-03-01", KEEP],
    ["2026-03-02", FLAG],
  ]);
});

// Extends "[happy-3] a recent access does not restart the region's minimum": other dates.
test("[happy-3] a later access period outlasts a region minimum that has run out", () => {
  const pol = policy({
    categories: { docs: { periodDays: 60, fromLastAccess: true } },
    regions: [{ region: "eu", minimumDays: 365 }],
  });
  // minimum from creation ends 2026-03-15; period from access ends 2026-04-02
  const rec = record({
    category: "docs",
    region: "eu",
    created: "2025-03-15",
    lastAccessed: "2026-02-01",
  });
  expectOn(rec, pol, [
    ["2026-03-15", KEEP],
    ["2026-04-01", KEEP],
    ["2026-04-02", FLAG],
    ["2026-04-08", FLAG],
    ["2026-04-09", DELETE],
  ]);
});

// Extends "[happy-3] the grace period ends on the seventh day after expiry":
// a minimum restarted from access would keep this record for most of a year.
test("[happy-3] a record accessed a month before its minimum ends is deleted after grace, not kept a year", () => {
  const pol = policy({
    categories: { docs: { periodDays: 30, fromLastAccess: true } },
    regions: [{ region: "eu", minimumDays: 365 }],
  });
  // period from access ends 2025-12-31; minimum from creation ends 2026-01-01
  const rec = record({
    category: "docs",
    region: "eu",
    created: "2025-01-01",
    lastAccessed: "2025-12-01",
  });
  expectOn(rec, pol, [
    ["2025-12-31", KEEP],
    ["2026-01-01", FLAG],
    ["2026-01-07", FLAG],
    ["2026-01-08", DELETE],
    ["2026-06-01", DELETE],
  ]);
});

// Extends "[boundary-3] the grace period runs from the region's later expiry": other grace.
test("[boundary-3] a 14-day grace runs from the region's later expiry, not the period from access", () => {
  const pol = policy({
    categories: { docs: { periodDays: 10, fromLastAccess: true } },
    regions: [{ region: "eu", minimumDays: 60 }],
    graceDays: 14,
  });
  // period from access ends 2026-01-15; minimum from creation ends 2026-03-02
  const rec = record({
    category: "docs",
    region: "eu",
    created: "2026-01-01",
    lastAccessed: "2026-01-05",
  });
  expectOn(rec, pol, [
    ["2026-01-29", KEEP],
    ["2026-03-01", KEEP],
    ["2026-03-02", FLAG],
    ["2026-03-15", FLAG],
    ["2026-03-16", DELETE],
  ]);
});

test("[boundary-3] the grace period runs from the access expiry when that is the later one", () => {
  const pol = policy({
    categories: { docs: { periodDays: 30, fromLastAccess: true } },
    regions: [{ region: "eu", minimumDays: 365 }],
    graceDays: 10,
  });
  // minimum from creation ends 2026-01-01; period from access ends 2026-01-19
  const rec = record({
    category: "docs",
    region: "eu",
    created: "2025-01-01",
    lastAccessed: "2025-12-20",
  });
  expectOn(rec, pol, [
    ["2026-01-11", KEEP],
    ["2026-01-18", KEEP],
    ["2026-01-19", FLAG],
    ["2026-01-28", FLAG],
    ["2026-01-29", DELETE],
  ]);
});

test("[boundary-3] the grace period runs from a region's minimum for a creation-based category", () => {
  const pol = policy({ regions: [{ region: "eu", minimumDays: 60 }] });
  // period ends 2026-01-31; minimum ends 2026-03-02
  expectOn(record({ region: "eu" }), pol, [
    ["2026-02-07", KEEP],
    ["2026-03-02", FLAG],
    ["2026-03-08", FLAG],
    ["2026-03-09", DELETE],
  ]);
});

// Extends "[boundary-4] ages count the leap day as a calendar day": a year without a leap day.
test("[boundary-4] the day after February 28 in a common year is March 1", () => {
  const pol = policy({
    categories: { logs: { periodDays: 1, fromLastAccess: false } },
    graceDays: 0,
  });
  expectOn(record({ created: "2025-02-28" }), pol, [
    ["2025-02-28", KEEP],
    ["2025-03-01", DELETE],
  ]);
});

test("[boundary-4] February 29 is a day in a leap year", () => {
  const pol = policy({
    categories: { logs: { periodDays: 2, fromLastAccess: false } },
    graceDays: 0,
  });
  expectOn(record({ created: "2024-02-28" }), pol, [
    ["2024-02-29", KEEP],
    ["2024-03-01", DELETE],
  ]);
});

test("[boundary-4] 2100 is not a leap year", () => {
  const pol = policy({
    categories: { logs: { periodDays: 1, fromLastAccess: false } },
    graceDays: 0,
  });
  expectOn(record({ created: "2100-02-28" }), pol, [
    ["2100-02-28", KEEP],
    ["2100-03-01", DELETE],
  ]);
});

test("[boundary-4] 2000 is a leap year", () => {
  const pol = policy({
    categories: { logs: { periodDays: 2, fromLastAccess: false } },
    graceDays: 0,
  });
  expectOn(record({ created: "2000-02-28" }), pol, [
    ["2000-02-29", KEEP],
    ["2000-03-01", DELETE],
  ]);
});

// Extends "[boundary-4] one calendar day short of the period across a leap day is kept":
// a 365-day period across a leap day.
test("[boundary-4] a 365-day period across a leap day ends one calendar day short of a year", () => {
  const pol = policy({
    categories: { logs: { periodDays: 365, fromLastAccess: false } },
    graceDays: 0,
  });
  expectOn(record({ created: "2024-02-28" }), pol, [
    ["2025-02-26", KEEP],
    ["2025-02-27", DELETE],
  ]);
});

test("[boundary-4] a 365-day period from March 1 of a leap year ends a year later", () => {
  const pol = policy({
    categories: { logs: { periodDays: 365, fromLastAccess: false } },
    graceDays: 0,
  });
  expectOn(record({ created: "2024-03-01" }), pol, [
    ["2025-02-28", KEEP],
    ["2025-03-01", DELETE],
  ]);
});

test("[boundary-4] a ten-year period counts every leap day", () => {
  const pol = policy({
    categories: { logs: { periodDays: 3653, fromLastAccess: false } },
    graceDays: 0,
  });
  expectOn(record({ created: "2016-01-01" }), pol, [
    ["2025-12-31", KEEP],
    ["2026-01-01", DELETE],
  ]);
});

test("[boundary-4] a 31-day period from April 30 ends on May 31", () => {
  const pol = policy({
    categories: { logs: { periodDays: 31, fromLastAccess: false } },
    graceDays: 0,
  });
  expectOn(record({ created: "2026-04-30" }), pol, [
    ["2026-05-30", KEEP],
    ["2026-05-31", DELETE],
  ]);
});

test("[boundary-4] a period counted from last access counts the leap day", () => {
  const pol = policy({
    categories: { docs: { periodDays: 2, fromLastAccess: true } },
    graceDays: 0,
  });
  const rec = record({ category: "docs", created: "2023-01-01", lastAccessed: "2024-02-28" });
  expectOn(rec, pol, [
    ["2024-02-29", KEEP],
    ["2024-03-01", DELETE],
  ]);
});

test("[boundary-4] a region minimum counts the leap day", () => {
  const pol = policy({
    categories: { logs: { periodDays: 1, fromLastAccess: false } },
    regions: [{ region: "eu", minimumDays: 366 }],
    graceDays: 0,
  });
  expectOn(record({ region: "eu", created: "2024-02-28" }), pol, [
    ["2025-02-27", KEEP],
    ["2025-02-28", DELETE],
  ]);
});

test("[boundary-4] the grace period counts the leap day", () => {
  const pol = policy({
    categories: { logs: { periodDays: 1, fromLastAccess: false } },
    graceDays: 2,
  });
  // expires 2024-02-28, grace ends 2024-03-01
  expectOn(record({ created: "2024-02-27" }), pol, [
    ["2024-02-28", FLAG],
    ["2024-02-29", FLAG],
    ["2024-03-01", DELETE],
  ]);
});
