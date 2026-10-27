import { test } from "node:test";
import assert from "node:assert/strict";
import { sweep } from "../../src/index.js";
import type {
  RetentionPolicy,
  RetentionRecord,
  RegionMinimum,
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

function policy(
  periodDays: number,
  graceDays: number,
  fromLastAccess = false,
  regions: RegionMinimum[] = [],
): RetentionPolicy {
  return {
    categories: { logs: { periodDays, fromLastAccess } },
    regions,
    graceDays,
  };
}

/** The date `days` calendar days before `date`, both "YYYY-MM-DD". */
function daysBefore(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

// happy-1: A record past its period is flagged, then deleted

// extends: "[happy-1] a record one day short of its period is kept within period"
test("[happy-1] with another period, a record one day short of it is kept and on the day is flagged", () => {
  const r = record({ created: "2026-03-15" });
  assert.deepEqual(sweep([r], policy(10, 5), "2026-03-24"), [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
  assert.deepEqual(sweep([r], policy(10, 5), "2026-03-25"), [
    { id: "r1", decision: "flag", reason: "expired" },
  ]);
});

// extends: "[happy-1] a record whose age reaches its period is flagged as expired"
test("[happy-1] a period of one day flags a record the day after it was created", () => {
  const r = record({ created: "2026-06-30" });
  assert.deepEqual(sweep([r], policy(1, 3), "2026-06-30"), [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
  assert.deepEqual(sweep([r], policy(1, 3), "2026-07-01"), [
    { id: "r1", decision: "flag", reason: "expired" },
  ]);
});

// extends: "[happy-1] a record stays flagged until the grace period has passed, then is deleted"
test("[happy-1] a long grace period keeps flagging across months until it has passed", () => {
  // period 30, grace 45: flagged from age 30 through age 74, deleted at 75
  const p = policy(30, 45);
  assert.deepEqual(sweep([record()], p, "2026-01-31"), [
    { id: "r1", decision: "flag", reason: "expired" },
  ]);
  assert.deepEqual(sweep([record()], p, "2026-03-16"), [
    { id: "r1", decision: "flag", reason: "expired" },
  ]);
  assert.deepEqual(sweep([record()], p, "2026-03-17"), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
  assert.deepEqual(sweep([record()], p, "2030-01-01"), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
});

// extends: "[happy-1] a record stays flagged until the grace period has passed, then is deleted"
test("[happy-1] a grace period of one day flags on the day of expiry and deletes the next", () => {
  const r = record({ created: "2026-05-01" });
  assert.deepEqual(sweep([r], policy(20, 1), "2026-05-21"), [
    { id: "r1", decision: "flag", reason: "expired" },
  ]);
  assert.deepEqual(sweep([r], policy(20, 1), "2026-05-22"), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
});

// extends: "[happy-1] decisions come back one per record in input order"
test("[happy-1] many records of many ages come back one each in input order", () => {
  const run = "2026-04-15";
  const ages = [12, 0, 4, 5, 7, 8, 100, 3, 6, 9, 1, 2, 11, 10];
  const records = ages.map((age) =>
    record({ id: `age-${age}`, created: daysBefore(run, age) }),
  );
  // period 5, grace 3: kept below 5, flagged at 5..7, deleted from 8
  const expected = ages.map((age) => ({
    id: `age-${age}`,
    decision: age < 5 ? "keep" : age < 8 ? "flag" : "delete",
    reason: age < 5 ? "within period" : "expired",
  }));
  assert.deepEqual(sweep(records, policy(5, 3), run), expected);
});

// extends: "[happy-1] decisions come back one per record in input order"
test("[happy-1] each record is measured against its own category's period", () => {
  const p: RetentionPolicy = {
    categories: {
      logs: { periodDays: 30, fromLastAccess: false },
      audit: { periodDays: 365, fromLastAccess: false },
      temp: { periodDays: 1, fromLastAccess: false },
    },
    regions: [],
    graceDays: 7,
  };
  const records = [
    record({ id: "t", category: "temp", created: "2026-02-27" }),
    record({ id: "a", category: "audit", created: "2025-06-01" }),
    record({ id: "l", category: "logs", created: "2026-01-29" }),
    record({ id: "a2", category: "audit", created: "2025-03-01" }),
  ];
  assert.deepEqual(sweep(records, p, "2026-03-01"), [
    { id: "t", decision: "flag", reason: "expired" },
    { id: "a", decision: "keep", reason: "within period" },
    { id: "l", decision: "flag", reason: "expired" },
    { id: "a2", decision: "flag", reason: "expired" },
  ]);
});

test("[happy-1] no records give no decisions", () => {
  assert.deepEqual(sweep([], policy(30, 7), "2026-01-31"), []);
});

// boundary-1: A grace period of zero deletes at once

// extends: "[boundary-1] with a grace period of zero a record is deleted the day its age reaches its period"
test("[boundary-1] with a grace period of zero nothing is ever flagged", () => {
  const run = "2026-09-10";
  const ages = [0, 44, 45, 46, 400];
  const records = ages.map((age) =>
    record({ id: `age-${age}`, created: daysBefore(run, age) }),
  );
  assert.deepEqual(sweep(records, policy(45, 0), run), [
    { id: "age-0", decision: "keep", reason: "within period" },
    { id: "age-44", decision: "keep", reason: "within period" },
    { id: "age-45", decision: "delete", reason: "expired" },
    { id: "age-46", decision: "delete", reason: "expired" },
    { id: "age-400", decision: "delete", reason: "expired" },
  ]);
});

// extends: "[boundary-1] with a grace period of zero a record one day short of its period is still kept"
test("[boundary-1] with a grace period of zero and a one-day period, a record is kept on its created date and deleted the next day", () => {
  const r = record({ created: "2026-12-31" });
  assert.deepEqual(sweep([r], policy(1, 0), "2026-12-31"), [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
  assert.deepEqual(sweep([r], policy(1, 0), "2027-01-01"), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
});

test("[boundary-1] with a grace period of zero an access-based record is deleted the day its age from last access reaches its period", () => {
  const r = record({ created: "2025-06-01", lastAccessed: "2026-02-01" });
  assert.deepEqual(sweep([r], policy(14, 0, true), "2026-02-15"), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
});

// happy-2: Access-based categories count from the last access

// extends: "[happy-2] an access-based category counts from the last access"
test("[happy-2] an access-based record is flagged then deleted counting from its last access", () => {
  const r = record({ created: "2020-01-01", lastAccessed: "2026-01-01" });
  const p = policy(90, 7, true);
  assert.deepEqual(sweep([r], p, "2026-03-31"), [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
  assert.deepEqual(sweep([r], p, "2026-04-01"), [
    { id: "r1", decision: "flag", reason: "expired" },
  ]);
  assert.deepEqual(sweep([r], p, "2026-04-07"), [
    { id: "r1", decision: "flag", reason: "expired" },
  ]);
  assert.deepEqual(sweep([r], p, "2026-04-08"), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
});

// extends: "[happy-2] an access-based category counts from the last access"
test("[happy-2] a category not counted from last access counts from creation even when the record was accessed", () => {
  const r = record({ created: "2025-01-01", lastAccessed: "2026-02-28" });
  assert.deepEqual(sweep([r], policy(90, 7, false), "2026-03-01"), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
});

// extends: "[happy-2] an access-based category counts from the last access"
test("[happy-2] the same record is counted from access in one category and from creation in another", () => {
  const p: RetentionPolicy = {
    categories: {
      logs: { periodDays: 60, fromLastAccess: false },
      docs: { periodDays: 60, fromLastAccess: true },
    },
    regions: [],
    graceDays: 10,
  };
  const shape = { created: "2025-11-01", lastAccessed: "2026-02-20" };
  const records = [
    record({ id: "by-creation", category: "logs", ...shape }),
    record({ id: "by-access", category: "docs", ...shape }),
  ];
  assert.deepEqual(sweep(records, p, "2026-03-01"), [
    { id: "by-creation", decision: "delete", reason: "expired" },
    { id: "by-access", decision: "keep", reason: "within period" },
  ]);
});

// extends: "[happy-2] a never-accessed record in an access-based category counts from its created date"
test("[happy-2] a never-accessed record created recently in an access-based category is kept", () => {
  const absent = record({ id: "absent", created: "2026-02-15" });
  const nulled = record({
    id: "nulled",
    created: "2026-02-15",
    lastAccessed: null,
  });
  assert.deepEqual(sweep([absent, nulled], policy(90, 7, true), "2026-03-01"), [
    { id: "absent", decision: "keep", reason: "within period" },
    { id: "nulled", decision: "keep", reason: "within period" },
  ]);
});

// extends: "[happy-2] a never-accessed record in an access-based category counts from its created date"
test("[happy-2] a never-accessed access-based record is flagged then deleted on its created-date schedule", () => {
  const r = record({ created: "2026-01-01", lastAccessed: null });
  const p = policy(30, 7, true);
  assert.deepEqual(sweep([r], p, "2026-01-30"), [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
  assert.deepEqual(sweep([r], p, "2026-01-31"), [
    { id: "r1", decision: "flag", reason: "expired" },
  ]);
  assert.deepEqual(sweep([r], p, "2026-02-07"), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
});

// extends: "[happy-2] an access-based record expires the day its age from last access reaches the period"
test("[happy-2] a record last accessed on its created date counts from that date", () => {
  const r = record({ created: "2026-02-01", lastAccessed: "2026-02-01" });
  assert.deepEqual(sweep([r], policy(28, 0, true), "2026-02-28"), [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
  assert.deepEqual(sweep([r], policy(28, 0, true), "2026-03-01"), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
});

// boundary-2: A region's minimum lengthens the period

// extends: "[boundary-2] a region minimum longer than the category period keeps the record"
test("[boundary-2] each record takes the minimum of its own region from a list of several", () => {
  const regions = [
    { region: "us", minimumDays: 10 },
    { region: "apac", minimumDays: 20 },
    { region: "eu", minimumDays: 60 },
  ];
  const records = [
    record({ id: "in-us", region: "us" }),
    record({ id: "in-apac", region: "apac" }),
    record({ id: "in-eu", region: "eu" }),
    record({ id: "in-jp", region: "jp" }),
  ];
  // age 45 on the run date against a 30-day period
  assert.deepEqual(sweep(records, policy(30, 0, false, regions), "2026-02-15"), [
    { id: "in-us", decision: "delete", reason: "expired" },
    { id: "in-apac", decision: "delete", reason: "expired" },
    { id: "in-eu", decision: "keep", reason: "within period" },
    { id: "in-jp", decision: "delete", reason: "expired" },
  ]);
});

// extends: "[boundary-2] under a region minimum the record expires when its age reaches the minimum"
test("[boundary-2] under a region minimum the grace period runs from the minimum", () => {
  const r = record({ region: "eu" });
  const p = policy(30, 7, false, [{ region: "eu", minimumDays: 60 }]);
  assert.deepEqual(sweep([r], p, "2026-03-01"), [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
  assert.deepEqual(sweep([r], p, "2026-03-02"), [
    { id: "r1", decision: "flag", reason: "expired" },
  ]);
  assert.deepEqual(sweep([r], p, "2026-03-08"), [
    { id: "r1", decision: "flag", reason: "expired" },
  ]);
  assert.deepEqual(sweep([r], p, "2026-03-09"), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
});

// extends: "[boundary-2] under a region minimum the record expires when its age reaches the minimum"
test("[boundary-2] a region minimum lengthens an access-based period counted from the last access", () => {
  const r = record({
    region: "eu",
    created: "2025-01-01",
    lastAccessed: "2026-01-01",
  });
  const p = policy(30, 0, true, [{ region: "eu", minimumDays: 60 }]);
  assert.deepEqual(sweep([r], p, "2026-02-15"), [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
  assert.deepEqual(sweep([r], p, "2026-03-01"), [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
  assert.deepEqual(sweep([r], p, "2026-03-02"), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
});

// extends: "[boundary-2] a region not in the list changes nothing"
test("[boundary-2] a region whose name only starts with a listed region is not in the list", () => {
  const records = [
    record({ id: "eu-west", region: "eu-west" }),
    record({ id: "e", region: "e" }),
    record({ id: "eu", region: "eu" }),
  ];
  const p = policy(30, 7, false, [{ region: "eu", minimumDays: 60 }]);
  assert.deepEqual(sweep(records, p, "2026-02-15"), [
    { id: "eu-west", decision: "delete", reason: "expired" },
    { id: "e", decision: "delete", reason: "expired" },
    { id: "eu", decision: "keep", reason: "within period" },
  ]);
});

// extends: "[boundary-2] a region minimum shorter than the category period changes nothing"
test("[boundary-2] a region minimum shorter than one category's period and longer than another's lengthens only the shorter", () => {
  const p: RetentionPolicy = {
    categories: {
      logs: { periodDays: 30, fromLastAccess: false },
      archive: { periodDays: 365, fromLastAccess: false },
    },
    regions: [{ region: "eu", minimumDays: 100 }],
    graceDays: 0,
  };
  const records = [
    record({ id: "archive-eu", category: "archive", region: "eu", created: "2025-06-01" }),
    record({ id: "logs-eu", category: "logs", region: "eu", created: "2025-12-01" }),
    record({ id: "logs-us", category: "logs", region: "us", created: "2025-12-01" }),
  ];
  // ages on 2026-03-01: archive-eu 273, logs-eu and logs-us 90
  assert.deepEqual(sweep(records, p, "2026-03-01"), [
    { id: "archive-eu", decision: "keep", reason: "within period" },
    { id: "logs-eu", decision: "keep", reason: "within period" },
    { id: "logs-us", decision: "delete", reason: "expired" },
  ]);
});

test("[boundary-2] a region minimum equal to the category period changes nothing", () => {
  const r = record({ region: "eu" });
  const p = policy(30, 7, false, [{ region: "eu", minimumDays: 30 }]);
  assert.deepEqual(sweep([r], p, "2026-01-30"), [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
  assert.deepEqual(sweep([r], p, "2026-01-31"), [
    { id: "r1", decision: "flag", reason: "expired" },
  ]);
});

// boundary-3: Ages are calendar days

// extends: "[boundary-3] a span across a leap day counts 366 calendar days"
test("[boundary-3] a year that holds no leap day is 365 calendar days", () => {
  const r = record({ created: "2023-02-28" });
  assert.deepEqual(sweep([r], policy(366, 0), "2024-02-28"), [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
  assert.deepEqual(sweep([r], policy(366, 0), "2024-02-29"), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
  assert.deepEqual(sweep([r], policy(365, 0), "2024-02-28"), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
});

// extends: "[boundary-3] one calendar day short of 366 is kept"
test("[boundary-3] months of different lengths count their real days", () => {
  // 2026-01-31 to 2026-03-01 is 29 days
  const r = record({ created: "2026-01-31" });
  assert.deepEqual(sweep([r], policy(30, 0), "2026-03-01"), [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
  assert.deepEqual(sweep([r], policy(29, 0), "2026-03-01"), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
  // 2026-04-30 to 2026-05-31 is 31 days
  const s = record({ created: "2026-04-30" });
  assert.deepEqual(sweep([s], policy(32, 0), "2026-05-31"), [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
  assert.deepEqual(sweep([s], policy(31, 0), "2026-05-31"), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
});

test("[boundary-3] century years are leap years only when divisible by 400", () => {
  // 2000-02-28 to 2000-03-01 is 2 days; 2100-02-28 to 2100-03-01 is 1 day
  const leap = record({ id: "y2000", created: "2000-02-28" });
  assert.deepEqual(sweep([leap], policy(2, 0), "2000-03-01"), [
    { id: "y2000", decision: "delete", reason: "expired" },
  ]);
  const common = record({ id: "y2100", created: "2100-02-28" });
  assert.deepEqual(sweep([common], policy(2, 0), "2100-03-01"), [
    { id: "y2100", decision: "keep", reason: "within period" },
  ]);
  assert.deepEqual(sweep([common], policy(1, 0), "2100-03-01"), [
    { id: "y2100", decision: "delete", reason: "expired" },
  ]);
});

test("[boundary-3] a span of ten years counts every leap day in it", () => {
  // 2016-01-01 to 2026-01-01 is 3653 days (leap days in 2016, 2020, 2024)
  const r = record({ created: "2016-01-01" });
  assert.deepEqual(sweep([r], policy(3654, 0), "2026-01-01"), [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
  assert.deepEqual(sweep([r], policy(3653, 0), "2026-01-01"), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
});

test("[boundary-3] a span across a year end counts calendar days", () => {
  const r = record({ created: "2025-12-31" });
  assert.deepEqual(sweep([r], policy(2, 0), "2026-01-01"), [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
  assert.deepEqual(sweep([r], policy(1, 0), "2026-01-01"), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
});

test("[boundary-3] spans across daylight-saving changes count whole calendar days", () => {
  // each span is 2 calendar days and crosses a clock change somewhere
  const spans = [
    ["2026-03-07", "2026-03-09"],
    ["2026-03-28", "2026-03-30"],
    ["2026-10-24", "2026-10-26"],
    ["2026-10-31", "2026-11-02"],
  ];
  for (const [created, run] of spans) {
    const r = record({ created });
    assert.deepEqual(sweep([r], policy(3, 0), run), [
      { id: "r1", decision: "keep", reason: "within period" },
    ]);
    assert.deepEqual(sweep([r], policy(2, 0), run), [
      { id: "r1", decision: "delete", reason: "expired" },
    ]);
  }
});

test("[boundary-3] an access-based age across a leap day counts 366 calendar days", () => {
  const r = record({ created: "2023-01-01", lastAccessed: "2024-02-28" });
  assert.deepEqual(sweep([r], policy(366, 0, true), "2025-02-27"), [
    { id: "r1", decision: "keep", reason: "within period" },
  ]);
  assert.deepEqual(sweep([r], policy(366, 0, true), "2025-02-28"), [
    { id: "r1", decision: "delete", reason: "expired" },
  ]);
});
