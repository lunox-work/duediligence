import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRoster } from "../../src/index.js";
import type { Policy, Shift, Violation } from "../../src/index.js";

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

/** One shift per date, at the given UTC times. */
function dayShifts(
  dates: string[],
  from = "09:00",
  to = "13:00",
  breakMinutes = 0,
): Shift[] {
  return dates.map((date) =>
    shift(`${date}T${from}:00+00:00`, `${date}T${to}:00+00:00`, breakMinutes),
  );
}

/** The dates from the first, for the given number of days. */
function dates(first: string, count: number): string[] {
  const at = Date.parse(`${first}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) =>
    new Date(at + i * 86_400_000).toISOString().slice(0, 10),
  );
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/** The violations with each one's indexes in ascending order. */
function sortedIndexes(violations: Violation[]): Violation[] {
  return violations.map((v) => ({
    ...v,
    shiftIndexes: [...v.shiftIndexes].sort((a, b) => a - b),
  }));
}

function only(violations: Violation[], codes: string[]): Violation[] {
  return violations.filter((v) => codes.includes(v.code));
}

// Extends: [happy-3] 9 hours between a shift ending at 23:00 and one starting at 08:00 breaches 11 hours of rest
// and [happy-3] exactly 11 hours of rest is not a violation
test("[happy-3] every short rest is reported against an 11.5-hour minimum, and exactly 11.5 is not", () => {
  const shifts = [
    shift("2026-03-02T14:00:00+00:00", "2026-03-02T22:00:00+00:00"),
    // 10 hours after the last.
    shift("2026-03-03T08:00:00+00:00", "2026-03-03T16:00:00+00:00"),
    // 11.5 hours after the last.
    shift("2026-03-04T03:30:00+00:00", "2026-03-04T08:00:00+00:00"),
    // 9.5 hours after the last.
    shift("2026-03-04T17:30:00+00:00", "2026-03-04T22:00:00+00:00"),
    // 11.5 hours after the last.
    shift("2026-03-05T09:30:00+00:00", "2026-03-05T12:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, minRestMinutes: 690 });
  assert.deepEqual(violations, [
    { code: "rest", shiftIndexes: [0, 1], measured: 10, limit: 11.5 },
    { code: "rest", shiftIndexes: [2, 3], measured: 9.5, limit: 11.5 },
  ]);
});

// Extends: [happy-3] 9 hours between a shift ending at 23:00 and one starting at 08:00 breaches 11 hours of rest
test("[happy-3] rest is measured only between consecutive shifts, not from earlier ones", () => {
  const shifts = [
    shift("2026-03-02T15:00:00+00:00", "2026-03-02T23:00:00+00:00"),
    // 9 hours after the first.
    shift("2026-03-03T08:00:00+00:00", "2026-03-03T09:00:00+00:00"),
    // 1 hour after the second, 11 after the first.
    shift("2026-03-03T10:00:00+00:00", "2026-03-03T12:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, minRestMinutes: 660 });
  assert.deepEqual(violations, [
    { code: "rest", shiftIndexes: [0, 1], measured: 9, limit: 11 },
    { code: "rest", shiftIndexes: [1, 2], measured: 1, limit: 11 },
  ]);
});

// Extends: [happy-3] 9 hours between a shift ending at 23:00 and one starting at 08:00 breaches 11 hours of rest
test("[happy-3] two shifts on the same day are consecutive shifts too", () => {
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T12:00:00+00:00"),
    shift("2026-03-02T14:00:00+00:00", "2026-03-02T17:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, minRestMinutes: 660 });
  assert.deepEqual(violations, [
    { code: "rest", shiftIndexes: [0, 1], measured: 2, limit: 11 },
  ]);
});

// Extends: [happy-3] rest is measured between shifts consecutive by start, whatever the input order
test("[happy-3] rest follows start order when the latest shift comes first in the input", () => {
  // Sorted by start: index 1, then 2, then 0.
  const shifts = [
    shift("2026-03-05T09:00:00+00:00", "2026-03-05T17:00:00+00:00"),
    shift("2026-03-02T15:00:00+00:00", "2026-03-02T23:00:00+00:00"),
    shift("2026-03-03T08:00:00+00:00", "2026-03-03T16:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, minRestMinutes: 660 });
  assert.deepEqual(violations, [
    { code: "rest", shiftIndexes: [1, 2], measured: 9, limit: 11 },
  ]);
});

// Extends: [happy-3] rest is measured between shifts consecutive by start, whatever the input order
test("[happy-3] start order is by instant, not by the text of the date-times", () => {
  const shifts = [
    // 04:00Z to 08:00Z on 3 March, though its text reads 2 March.
    shift("2026-03-02T23:00:00-05:00", "2026-03-03T03:00:00-05:00"),
    // 01:00Z to 03:00Z on 3 March: this one is first.
    shift("2026-03-03T01:00:00+00:00", "2026-03-03T03:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, minRestMinutes: 120 });
  assert.deepEqual(sortedIndexes(violations), [
    { code: "rest", shiftIndexes: [0, 1], measured: 1, limit: 2 },
  ]);
});

// Extends: [happy-3] 9 hours between a shift ending at 23:00 and one starting at 08:00 breaches 11 hours of rest
test("[happy-3] rest between shifts written in different offsets is measured between instants", () => {
  const shifts = [
    shift("2026-03-02T15:00:00+00:00", "2026-03-02T23:00:00+00:00"),
    // 16:00 in +08:00 is 08:00 UTC: 9 hours of rest.
    shift("2026-03-03T16:00:00+08:00", "2026-03-03T20:00:00+08:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, minRestMinutes: 660 });
  assert.deepEqual(violations, [
    { code: "rest", shiftIndexes: [0, 1], measured: 9, limit: 11 },
  ]);
});

// Extends: [unhappy-1] a shift starting an hour before the previous one ends is an overlap of 1 hour with no limit
test("[unhappy-1] a shift inside another overlaps by its own length", () => {
  const shifts = [
    shift("2026-03-02T08:00:00+00:00", "2026-03-02T18:00:00+00:00"),
    shift("2026-03-02T10:00:00+00:00", "2026-03-02T12:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, lenient);
  assert.deepEqual(only(violations, ["overlap"]), [
    { code: "overlap", shiftIndexes: [0, 1], measured: 2, limit: null },
  ]);
});

// Extends: [unhappy-1] a shift starting an hour before the previous one ends is an overlap of 1 hour with no limit
test("[unhappy-1] a long shift overlapping two later shifts is an overlap with each, though only one is next by start", () => {
  const shifts = [
    shift("2026-03-02T08:00:00+00:00", "2026-03-02T20:00:00+00:00"),
    shift("2026-03-02T10:00:00+00:00", "2026-03-02T12:00:00+00:00"),
    shift("2026-03-02T14:00:00+00:00", "2026-03-02T17:00:00+00:00"),
  ];
  const overlaps = only(checkRoster(shifts, lenient), ["overlap"]);
  // Both start at index 0, so their order between themselves is not fixed.
  const bySecondIndex = sortedIndexes(overlaps).sort(
    (a, b) => a.shiftIndexes[1] - b.shiftIndexes[1],
  );
  assert.deepEqual(bySecondIndex, [
    { code: "overlap", shiftIndexes: [0, 1], measured: 2, limit: null },
    { code: "overlap", shiftIndexes: [0, 2], measured: 3, limit: null },
  ]);
});

// Extends: [unhappy-1] a shift starting an hour before the previous one ends is an overlap of 1 hour with no limit
test("[unhappy-1] an overlap is found when the later shift comes first in the input", () => {
  const shifts = [
    shift("2026-03-02T16:00:00+00:00", "2026-03-02T20:00:00+00:00"),
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00"),
  ];
  const overlaps = only(checkRoster(shifts, lenient), ["overlap"]);
  assert.deepEqual(sortedIndexes(overlaps), [
    { code: "overlap", shiftIndexes: [0, 1], measured: 1, limit: null },
  ]);
});

// Extends: [unhappy-1] a shift starting an hour before the previous one ends is an overlap of 1 hour with no limit
test("[unhappy-1] shifts written in different offsets overlap by instant, not by wall clock", () => {
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T13:00:00+00:00"),
    // 14:00 in +02:00 is 12:00 UTC: an hour before the first ends.
    shift("2026-03-02T14:00:00+02:00", "2026-03-02T18:00:00+02:00"),
  ];
  const overlaps = only(checkRoster(shifts, lenient), ["overlap"]);
  assert.deepEqual(overlaps, [
    { code: "overlap", shiftIndexes: [0, 1], measured: 1, limit: null },
  ]);
});

// Extends: [unhappy-1] overlapping shifts still count toward the weekly hours
test("[unhappy-1] overlapping shifts still count toward shift hours and weekly hours", () => {
  const shifts = [
    shift("2026-03-02T06:00:00+00:00", "2026-03-02T18:00:00+00:00"),
    shift("2026-03-02T16:00:00+00:00", "2026-03-02T20:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, {
    ...lenient,
    maxShiftHours: 10,
    maxWeekHours: 15,
  });
  assert.deepEqual(only(violations, ["shift-hours", "week-hours"]), [
    { code: "shift-hours", shiftIndexes: [0], measured: 12, limit: 10 },
    { code: "week-hours", shiftIndexes: [0, 1], measured: 16, limit: 15 },
  ]);
});

// Extends: [unhappy-1] overlapping shifts still count toward the weekly hours
test("[unhappy-1] overlapping shifts on the same day both belong to the run of days", () => {
  const shifts = [
    ...dayShifts(dates("2026-03-02", 6)),
    shift("2026-03-08T09:00:00+00:00", "2026-03-08T13:00:00+00:00"),
    shift("2026-03-08T12:00:00+00:00", "2026-03-08T15:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxConsecutiveDays: 6 });
  assert.deepEqual(only(violations, ["consecutive-days"]), [
    {
      code: "consecutive-days",
      shiftIndexes: range(0, 7),
      measured: 7,
      limit: 6,
    },
  ]);
});

// Extends: [unhappy-1] overlapping shifts still count toward the weekly hours
test("[unhappy-1] an overlap is ordered among other violations by its first index, then its code", () => {
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00"),
    shift("2026-03-03T06:00:00+00:00", "2026-03-03T18:00:00+00:00"),
    shift("2026-03-03T16:00:00+00:00", "2026-03-03T20:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, {
    ...lenient,
    maxShiftHours: 10,
    maxWeekHours: 20,
  });
  assert.deepEqual(only(violations, ["overlap", "shift-hours", "week-hours"]), [
    { code: "week-hours", shiftIndexes: [0, 1, 2], measured: 24, limit: 20 },
    { code: "overlap", shiftIndexes: [1, 2], measured: 2, limit: null },
    { code: "shift-hours", shiftIndexes: [1], measured: 12, limit: 10 },
  ]);
});

// Extends: [unhappy-1] a shift starting exactly when the other ends does not overlap, and their rest is 0
test("[unhappy-1] touching shifts given latest first do not overlap, and their rest is 0", () => {
  const shifts = [
    shift("2026-03-02T13:00:00+00:00", "2026-03-02T17:00:00+00:00"),
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T13:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, minRestMinutes: 60 });
  assert.deepEqual(sortedIndexes(violations), [
    { code: "rest", shiftIndexes: [0, 1], measured: 0, limit: 1 },
  ]);
});

// Extends: [unhappy-1] a shift starting exactly when the other ends does not overlap, and their rest is 0
test("[unhappy-1] shifts touching at the same instant in different offsets do not overlap, and their rest is 0", () => {
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T13:00:00+00:00"),
    // 15:00 in +02:00 is 13:00 UTC.
    shift("2026-03-02T15:00:00+02:00", "2026-03-02T19:00:00+02:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, minRestMinutes: 60 });
  assert.deepEqual(violations, [
    { code: "rest", shiftIndexes: [0, 1], measured: 0, limit: 1 },
  ]);
});

// Extends: [happy-4] six 8-hour shifts from Monday to Saturday breach 44 hours a week, measured 48
test("[happy-4] weekly hours add each shift's hours net of its break, and exactly the maximum is not a violation", () => {
  const shifts = [
    // Week of 2 March: five shifts of 9.5 hours with a 60-minute break, 42.5 hours.
    ...dayShifts(dates("2026-03-02", 5), "08:00", "17:30", 60),
    // Week of 9 March: four shifts of 11 hours with a 30-minute break, 42 hours.
    ...dayShifts(dates("2026-03-09", 4), "08:00", "19:00", 30),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxWeekHours: 42 });
  assert.deepEqual(violations, [
    { code: "week-hours", shiftIndexes: range(0, 4), measured: 42.5, limit: 42 },
  ]);
});

// Extends: [happy-4] six 8-hour shifts from Monday to Saturday breach 44 hours a week, measured 48
test("[happy-4] each week over the maximum is its own violation, ordered by first index, not by date", () => {
  const shifts = [
    // Week of 9 March first: four 9-hour shifts, 36 hours.
    ...dayShifts(dates("2026-03-09", 4), "08:00", "17:00"),
    // Week of 2 March: four 10-hour shifts, 40 hours.
    ...dayShifts(dates("2026-03-02", 4), "08:00", "18:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxWeekHours: 35 });
  assert.deepEqual(violations, [
    { code: "week-hours", shiftIndexes: range(0, 3), measured: 36, limit: 35 },
    { code: "week-hours", shiftIndexes: range(4, 7), measured: 40, limit: 35 },
  ]);
});

// Extends: [happy-4] a Sunday shift belongs to the week that started on Monday, and the next Monday to the next week
test("[happy-4] weeks run Monday to Sunday, not seven days from the first shift", () => {
  // Wednesday 4 March to Tuesday 10 March, 8 hours a day.
  const shifts = dayShifts(dates("2026-03-04", 7), "09:00", "17:00");
  const violations = checkRoster(shifts, { ...lenient, maxWeekHours: 39 });
  assert.deepEqual(violations, [
    { code: "week-hours", shiftIndexes: range(0, 4), measured: 40, limit: 39 },
  ]);
});

// Extends: [happy-4] a Sunday shift belongs to the week that started on Monday, and the next Monday to the next week
test("[happy-4] a week that spans the new year is one week from Monday to Sunday", () => {
  // Thursday 31 December 2026 to Monday 4 January 2027, 10 hours a day.
  const shifts = dayShifts(dates("2026-12-31", 5), "08:00", "18:00");
  const violations = checkRoster(shifts, { ...lenient, maxWeekHours: 35 });
  assert.deepEqual(violations, [
    { code: "week-hours", shiftIndexes: range(0, 3), measured: 40, limit: 35 },
  ]);
});

// Extends: [boundary-2] each shift's week is taken from the date in its own offset
test("[boundary-2] a Monday shift in +08:00 that is Sunday in UTC does not add to the week before", () => {
  const shifts = [
    // Monday to Friday, 2 to 6 March: exactly 40 hours.
    ...dayShifts(dates("2026-03-02", 5), "09:00", "17:00"),
    // Monday 9 March 00:30 in +08:00 is Sunday 8 March 16:30 UTC.
    shift("2026-03-09T00:30:00+08:00", "2026-03-09T04:30:00+08:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxWeekHours: 40 });
  assert.deepEqual(violations, []);
});

// Extends: [boundary-2] a Sunday-evening shift in -05:00 is not in the week of a Monday shift the same UTC day
test("[boundary-2] shifts that fall in three UTC weeks belong to one week in their own offsets", () => {
  const shifts = [
    // Monday 9 March in +08:00, Sunday 8 March in UTC: 4 hours.
    shift("2026-03-09T00:30:00+08:00", "2026-03-09T04:30:00+08:00"),
    // Sunday 15 March in -05:00, Monday 16 March in UTC: 8 hours.
    shift("2026-03-15T21:00:00-05:00", "2026-03-16T05:00:00-05:00"),
    // Monday 9 March in +05:30, Sunday 8 March 23:45 in UTC: 2 hours.
    shift("2026-03-09T05:15:00+05:30", "2026-03-09T07:15:00+05:30"),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxWeekHours: 10 });
  assert.deepEqual(violations, [
    { code: "week-hours", shiftIndexes: [0, 1, 2], measured: 14, limit: 10 },
  ]);
});

// Extends: [happy-5] two shifts on the same day count as one day
test("[happy-5] a run of seven days with two shifts on one of them lists all eight shifts, measured 7", () => {
  const shifts = [
    ...dayShifts(dates("2026-03-02", 4)),
    shift("2026-03-05T15:00:00+00:00", "2026-03-05T18:00:00+00:00"),
    ...dayShifts(dates("2026-03-06", 3)),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxConsecutiveDays: 6 });
  assert.deepEqual(violations, [
    {
      code: "consecutive-days",
      shiftIndexes: range(0, 7),
      measured: 7,
      limit: 6,
    },
  ]);
});

// Extends: [happy-5] a day without a shift ends the run and the count starts again
test("[happy-5] each run over a 3-day maximum is reported with only its own shifts", () => {
  const shifts = [
    // 2 to 5 March: 4 days.
    ...dayShifts(dates("2026-03-02", 4)),
    // 7 and 8 March: 2 days.
    ...dayShifts(dates("2026-03-07", 2)),
    // 10 to 14 March: 5 days.
    ...dayShifts(dates("2026-03-10", 5)),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxConsecutiveDays: 3 });
  assert.deepEqual(violations, [
    {
      code: "consecutive-days",
      shiftIndexes: range(0, 3),
      measured: 4,
      limit: 3,
    },
    {
      code: "consecutive-days",
      shiftIndexes: range(6, 10),
      measured: 5,
      limit: 3,
    },
  ]);
});

// Extends: [happy-5] shifts on seven consecutive days breach 6 days in a row, measured 7
test("[happy-5] runs are ordered by first index when the later run comes first in the input", () => {
  const shifts = [
    // 16 to 22 March.
    ...dayShifts(dates("2026-03-16", 7)),
    // 2 to 8 March; 9 to 15 March has no shift.
    ...dayShifts(dates("2026-03-02", 7)),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxConsecutiveDays: 6 });
  assert.deepEqual(violations, [
    {
      code: "consecutive-days",
      shiftIndexes: range(0, 6),
      measured: 7,
      limit: 6,
    },
    {
      code: "consecutive-days",
      shiftIndexes: range(7, 13),
      measured: 7,
      limit: 6,
    },
  ]);
});

// Extends: [happy-5] shifts on seven consecutive days breach 6 days in a row, measured 7
test("[happy-5] a run is found when its days come in shuffled order", () => {
  const days = dates("2026-03-02", 7);
  const order = [4, 0, 6, 2, 5, 1, 3];
  const shifts = dayShifts(order.map((i) => days[i]));
  const violations = checkRoster(shifts, { ...lenient, maxConsecutiveDays: 6 });
  assert.deepEqual(sortedIndexes(violations), [
    {
      code: "consecutive-days",
      shiftIndexes: range(0, 6),
      measured: 7,
      limit: 6,
    },
  ]);
});

// Extends: [happy-5] a day without a shift ends the run and the count starts again
test("[happy-5] a shift on Monday in +08:00 that is Sunday in UTC leaves Sunday empty", () => {
  const shifts = [
    ...dayShifts(dates("2026-03-02", 6)),
    // Monday 9 March 01:00 in +08:00 is Sunday 8 March 17:00 UTC.
    shift("2026-03-09T01:00:00+08:00", "2026-03-09T05:00:00+08:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxConsecutiveDays: 6 });
  assert.deepEqual(violations, []);
});

// Extends: [happy-5] shifts on seven consecutive days breach 6 days in a row, measured 7
test("[happy-5] a shift on Sunday in -05:00 that is Monday in UTC fills Sunday", () => {
  const shifts = [
    ...dayShifts(dates("2026-03-02", 6)),
    // Sunday 8 March 22:00 in -05:00 is Monday 9 March 03:00 UTC.
    shift("2026-03-08T22:00:00-05:00", "2026-03-09T01:00:00-05:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxConsecutiveDays: 6 });
  assert.deepEqual(violations, [
    {
      code: "consecutive-days",
      shiftIndexes: range(0, 6),
      measured: 7,
      limit: 6,
    },
  ]);
});

// Extends: [boundary-3] nine consecutive days are one violation with all nine indexes, measured 9
// and [boundary-3] a run from Friday to the next Thursday is one run across the week boundary
test("[boundary-3] a run of fourteen days across two week boundaries is reported once", () => {
  const shifts = dayShifts(dates("2026-03-04", 14));
  const violations = checkRoster(shifts, { ...lenient, maxConsecutiveDays: 6 });
  assert.deepEqual(violations, [
    {
      code: "consecutive-days",
      shiftIndexes: range(0, 13),
      measured: 14,
      limit: 6,
    },
  ]);
});

// Extends: [boundary-3] nine consecutive days are one violation with all nine indexes, measured 9
test("[boundary-3] two long runs split by a free day are reported once each", () => {
  const shifts = [
    // 2 to 9 March: 8 days.
    ...dayShifts(dates("2026-03-02", 8)),
    // 11 to 19 March: 9 days.
    ...dayShifts(dates("2026-03-11", 9)),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxConsecutiveDays: 6 });
  assert.deepEqual(violations, [
    {
      code: "consecutive-days",
      shiftIndexes: range(0, 7),
      measured: 8,
      limit: 6,
    },
    {
      code: "consecutive-days",
      shiftIndexes: range(8, 16),
      measured: 9,
      limit: 6,
    },
  ]);
});

// Extends: [boundary-3] nine consecutive days are one violation with all nine indexes, measured 9
test("[boundary-3] a ten-day run with three doubled days is one violation with all thirteen shifts, measured 10", () => {
  const days = dates("2026-03-02", 10);
  const shifts: Shift[] = [];
  for (const [i, day] of days.entries()) {
    shifts.push(...dayShifts([day]));
    if (i % 3 === 0 && i > 0) shifts.push(...dayShifts([day], "15:00", "18:00"));
  }
  assert.equal(shifts.length, 13);
  const violations = checkRoster(shifts, { ...lenient, maxConsecutiveDays: 6 });
  assert.deepEqual(violations, [
    {
      code: "consecutive-days",
      shiftIndexes: range(0, 12),
      measured: 10,
      limit: 6,
    },
  ]);
});
