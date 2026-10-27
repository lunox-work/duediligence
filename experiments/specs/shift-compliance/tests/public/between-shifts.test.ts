import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRoster } from "../../src/index.js";
import type { Policy, Shift } from "../../src/index.js";

// A policy under which none of the rules fires for the short, spaced-out
// shifts these tests use; each test tightens only the rule it is about.
const lenient: Policy = {
  maxShiftHours: 24,
  maxWeekHours: 168,
  minRestMinutes: 0,
  breakDueAboveHours: 24,
  minBreakMinutes: 0,
  maxConsecutiveDays: 100,
};

function shift(start: string, end: string, breakMinutes = 0): Shift {
  return { start, end, breakMinutes };
}

/** One 09:00 to 17:00 UTC shift on each of the given dates. */
function dayShifts(dates: string[], from = "09:00", to = "17:00"): Shift[] {
  return dates.map((date) =>
    shift(`${date}T${from}:00+00:00`, `${date}T${to}:00+00:00`),
  );
}

function indexes(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i);
}

test("[happy-3] 9 hours between a shift ending at 23:00 and one starting at 08:00 breaches 11 hours of rest", () => {
  const shifts = [
    shift("2026-03-02T15:00:00+00:00", "2026-03-02T23:00:00+00:00"),
    shift("2026-03-03T08:00:00+00:00", "2026-03-03T16:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, minRestMinutes: 660 });
  assert.deepEqual(violations, [
    { code: "rest", shiftIndexes: [0, 1], measured: 9, limit: 11 },
  ]);
});

test("[happy-3] exactly 11 hours of rest is not a violation", () => {
  const shifts = [
    shift("2026-03-02T15:00:00+00:00", "2026-03-02T23:00:00+00:00"),
    shift("2026-03-03T10:00:00+00:00", "2026-03-03T18:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, minRestMinutes: 660 });
  assert.deepEqual(violations, []);
});

test("[happy-3] rest is measured between shifts consecutive by start, whatever the input order", () => {
  // Sorted by start: index 2, then 0, then 1. Rest 2->0 is 9 hours, 0->1 is 24 hours.
  const shifts = [
    shift("2026-03-03T08:00:00+00:00", "2026-03-03T16:00:00+00:00"),
    shift("2026-03-04T16:00:00+00:00", "2026-03-04T20:00:00+00:00"),
    shift("2026-03-02T15:00:00+00:00", "2026-03-02T23:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, minRestMinutes: 660 });
  assert.equal(violations.length, 1);
  const [rest] = violations;
  assert.equal(rest.code, "rest");
  assert.deepEqual([...rest.shiftIndexes].sort((a, b) => a - b), [0, 2]);
  assert.equal(rest.measured, 9);
  assert.equal(rest.limit, 11);
});

test("[unhappy-1] a shift starting an hour before the previous one ends is an overlap of 1 hour with no limit", () => {
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00"),
    shift("2026-03-02T16:00:00+00:00", "2026-03-02T20:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, lenient);
  const overlaps = violations.filter((v) => v.code === "overlap");
  assert.deepEqual(overlaps, [
    { code: "overlap", shiftIndexes: [0, 1], measured: 1, limit: null },
  ]);
});

test("[unhappy-1] overlapping shifts still count toward the weekly hours", () => {
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00"),
    shift("2026-03-02T16:00:00+00:00", "2026-03-02T20:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxWeekHours: 10 });
  const relevant = violations.filter(
    (v) => v.code === "overlap" || v.code === "week-hours",
  );
  assert.deepEqual(relevant, [
    { code: "overlap", shiftIndexes: [0, 1], measured: 1, limit: null },
    { code: "week-hours", shiftIndexes: [0, 1], measured: 12, limit: 10 },
  ]);
});

test("[unhappy-1] a shift starting exactly when the other ends does not overlap, and their rest is 0", () => {
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T13:00:00+00:00"),
    shift("2026-03-02T13:00:00+00:00", "2026-03-02T17:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, minRestMinutes: 60 });
  assert.deepEqual(violations, [
    { code: "rest", shiftIndexes: [0, 1], measured: 0, limit: 1 },
  ]);
});

test("[happy-4] six 8-hour shifts from Monday to Saturday breach 44 hours a week, measured 48", () => {
  const shifts = dayShifts([
    "2026-03-02",
    "2026-03-03",
    "2026-03-04",
    "2026-03-05",
    "2026-03-06",
    "2026-03-07",
  ]);
  const violations = checkRoster(shifts, { ...lenient, maxWeekHours: 44 });
  assert.deepEqual(violations, [
    { code: "week-hours", shiftIndexes: indexes(6), measured: 48, limit: 44 },
  ]);
});

test("[happy-4] a Sunday shift belongs to the week that started on Monday, and the next Monday to the next week", () => {
  const shifts = dayShifts([
    "2026-03-02",
    "2026-03-03",
    "2026-03-04",
    "2026-03-05",
    "2026-03-06",
    "2026-03-08",
    "2026-03-09",
  ]);
  const violations = checkRoster(shifts, { ...lenient, maxWeekHours: 44 });
  assert.deepEqual(violations, [
    { code: "week-hours", shiftIndexes: indexes(6), measured: 48, limit: 44 },
  ]);
});

test("[boundary-2] each shift's week is taken from the date in its own offset", () => {
  const shifts = [
    // Monday 2026-03-02 in -05:00.
    shift("2026-03-02T09:00:00-05:00", "2026-03-02T13:00:00-05:00"),
    // Sunday 2026-03-08 in -05:00, though already Monday in UTC.
    shift("2026-03-08T23:30:00-05:00", "2026-03-09T03:30:00-05:00"),
    // Monday 2026-03-09 in +08:00, though still Sunday in UTC.
    shift("2026-03-09T00:30:00+08:00", "2026-03-09T04:30:00+08:00"),
    // Tuesday 2026-03-10 in +08:00.
    shift("2026-03-10T09:00:00+08:00", "2026-03-10T13:00:00+08:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxWeekHours: 6 });
  assert.deepEqual(violations, [
    { code: "week-hours", shiftIndexes: [0, 1], measured: 8, limit: 6 },
    { code: "week-hours", shiftIndexes: [2, 3], measured: 8, limit: 6 },
  ]);
});

test("[boundary-2] a Sunday-evening shift in -05:00 is not in the week of a Monday shift the same UTC day", () => {
  const shifts = [
    shift("2026-03-08T23:30:00-05:00", "2026-03-09T03:30:00-05:00"),
    shift("2026-03-09T09:00:00-05:00", "2026-03-09T13:00:00-05:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxWeekHours: 6 });
  assert.deepEqual(violations, []);
});

test("[happy-5] shifts on seven consecutive days breach 6 days in a row, measured 7", () => {
  const shifts = dayShifts(
    [
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
    ],
    "09:00",
    "13:00",
  );
  const violations = checkRoster(shifts, { ...lenient, maxConsecutiveDays: 6 });
  assert.deepEqual(violations, [
    {
      code: "consecutive-days",
      shiftIndexes: indexes(7),
      measured: 7,
      limit: 6,
    },
  ]);
});

test("[happy-5] two shifts on the same day count as one day", () => {
  const shifts = [
    ...dayShifts(["2026-03-02", "2026-03-03"], "09:00", "13:00"),
    shift("2026-03-04T09:00:00+00:00", "2026-03-04T12:00:00+00:00"),
    shift("2026-03-04T14:00:00+00:00", "2026-03-04T17:00:00+00:00"),
    ...dayShifts(["2026-03-05", "2026-03-06", "2026-03-07"], "09:00", "13:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxConsecutiveDays: 6 });
  assert.deepEqual(violations, []);
});

test("[happy-5] a day without a shift ends the run and the count starts again", () => {
  const shifts = dayShifts(
    [
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
      // no shift on 2026-03-06
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
      "2026-03-10",
    ],
    "09:00",
    "13:00",
  );
  const violations = checkRoster(shifts, { ...lenient, maxConsecutiveDays: 6 });
  assert.deepEqual(violations, []);
});

test("[boundary-3] nine consecutive days are one violation with all nine indexes, measured 9", () => {
  const shifts = dayShifts(
    [
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
      "2026-03-10",
    ],
    "09:00",
    "13:00",
  );
  const violations = checkRoster(shifts, { ...lenient, maxConsecutiveDays: 6 });
  assert.deepEqual(violations, [
    {
      code: "consecutive-days",
      shiftIndexes: indexes(9),
      measured: 9,
      limit: 6,
    },
  ]);
});

test("[boundary-3] a run from Friday to the next Thursday is one run across the week boundary", () => {
  const shifts = dayShifts(
    [
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
      "2026-03-10",
      "2026-03-11",
      "2026-03-12",
    ],
    "09:00",
    "13:00",
  );
  const violations = checkRoster(shifts, { ...lenient, maxConsecutiveDays: 6 });
  assert.deepEqual(violations, [
    {
      code: "consecutive-days",
      shiftIndexes: indexes(7),
      measured: 7,
      limit: 6,
    },
  ]);
});
