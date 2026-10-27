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

/** One shift per date, at the given UTC times. */
function dayShifts(dates: string[], from: string, to: string): Shift[] {
  return dates.map((date) =>
    shift(`${date}T${from}:00+00:00`, `${date}T${to}:00+00:00`),
  );
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

// Extends: [happy-1] a shift of 11 hours with a 30-minute break breaches a 10-hour maximum, measured 10.5
test("[happy-1] each shift over an 8-hour maximum is reported with its own hours net of its break", () => {
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00"),
    shift("2026-03-03T09:00:00+00:00", "2026-03-03T18:00:00+00:00", 15),
    // 9 hours from start to end, 8 once the hour's break is taken off.
    shift("2026-03-04T08:00:00+00:00", "2026-03-04T17:00:00+00:00", 60),
    // Across midnight: 10 hours, 9.5 net.
    shift("2026-03-05T22:00:00+00:00", "2026-03-06T08:00:00+00:00", 30),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxShiftHours: 8 });
  assert.deepEqual(violations, [
    { code: "shift-hours", shiftIndexes: [1], measured: 8.75, limit: 8 },
    { code: "shift-hours", shiftIndexes: [3], measured: 9.5, limit: 8 },
  ]);
});

// Extends: [happy-1] a shift of 11 hours with a 30-minute break breaches a 10-hour maximum, measured 10.5
test("[happy-1] shift hours are measured between instants when start and end carry different offsets", () => {
  const shifts = [
    // 04:00Z to 08:00Z: 4 hours, though the wall clock reads 09:00 to 08:00.
    shift("2026-03-02T09:00:00+05:00", "2026-03-02T08:00:00+00:00"),
    // 12:00Z to 19:00Z: 7 hours, though the wall clock reads 09:00 to 19:00.
    shift("2026-03-03T09:00:00-03:00", "2026-03-03T19:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxShiftHours: 5 });
  assert.deepEqual(violations, [
    { code: "shift-hours", shiftIndexes: [1], measured: 7, limit: 5 },
  ]);
});

// Extends: [happy-1] a shift measuring exactly the 10-hour maximum is not a violation
test("[happy-1] a night shift of exactly the maximum once its break is off is not a violation", () => {
  const shifts = [
    // 11 hours across midnight with a 60-minute break: exactly 10.
    shift("2026-03-02T20:00:00+00:00", "2026-03-03T07:00:00+00:00", 60),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxShiftHours: 10 });
  assert.deepEqual(violations, []);
});

// Extends: [happy-1] a shift measuring exactly the 10-hour maximum is not a violation
test("[happy-1] a fractional maximum of 7.5 hours allows exactly 7.5 and refuses 7.75", () => {
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00", 30),
    shift("2026-03-03T09:00:00+00:00", "2026-03-03T17:15:00+00:00", 30),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxShiftHours: 7.5 });
  assert.deepEqual(violations, [
    { code: "shift-hours", shiftIndexes: [1], measured: 7.75, limit: 7.5 },
  ]);
});

// Extends: [happy-1] a shift of 11 hours with a 30-minute break breaches a 10-hour maximum, measured 10.5
test("[happy-1] violations are ordered by first shift index before code, whatever the shifts' dates", () => {
  const shifts = [
    // Latest in time, first in the input: 8.5 hours net.
    shift("2026-03-06T09:00:00+00:00", "2026-03-06T18:00:00+00:00", 30),
    // Earliest in time: 7 hours with no break.
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T16:00:00+00:00"),
    // 10 hours with a 15-minute break: 9.75 net.
    shift("2026-03-04T09:00:00+00:00", "2026-03-04T19:00:00+00:00", 15),
  ];
  const violations = checkRoster(shifts, {
    ...lenient,
    maxShiftHours: 8,
    breakDueAboveHours: 6,
    minBreakMinutes: 30,
  });
  assert.deepEqual(violations, [
    { code: "shift-hours", shiftIndexes: [0], measured: 8.5, limit: 8 },
    { code: "break", shiftIndexes: [1], measured: 0, limit: 30 },
    { code: "break", shiftIndexes: [2], measured: 15, limit: 30 },
    { code: "shift-hours", shiftIndexes: [2], measured: 9.75, limit: 8 },
  ]);
});

// Extends: [happy-2] an 8-hour shift with a 20-minute break breaches a 30-minute break due above 6 hours
test("[happy-2] a break due above 9 hours of at least 45 minutes is checked on every shift", () => {
  const shifts = [
    // Exactly 9 hours: no break due.
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T18:00:00+00:00"),
    // 10 hours with 30 minutes.
    shift("2026-03-03T08:00:00+00:00", "2026-03-03T18:00:00+00:00", 30),
    // 9.25 hours with none.
    shift("2026-03-04T08:00:00+00:00", "2026-03-04T17:15:00+00:00"),
    // 10 hours with exactly the 45 minutes due.
    shift("2026-03-05T08:00:00+00:00", "2026-03-05T18:00:00+00:00", 45),
    // 11 hours with more than is due.
    shift("2026-03-06T08:00:00+00:00", "2026-03-06T19:00:00+00:00", 60),
  ];
  const violations = checkRoster(shifts, {
    ...lenient,
    breakDueAboveHours: 9,
    minBreakMinutes: 45,
  });
  assert.deepEqual(violations, [
    { code: "break", shiftIndexes: [1], measured: 30, limit: 45 },
    { code: "break", shiftIndexes: [2], measured: 0, limit: 45 },
  ]);
});

// Extends: [happy-2] a shift of exactly 6 hours needs no break
test("[happy-2] the break rule measures night shifts across midnight", () => {
  const shifts = [
    // 21:00 to 03:00: exactly 6 hours, no break due.
    shift("2026-03-02T21:00:00+00:00", "2026-03-03T03:00:00+00:00"),
    // 20:00 to 04:00: 8 hours with a 15-minute break.
    shift("2026-03-04T20:00:00+00:00", "2026-03-05T04:00:00+00:00", 15),
  ];
  const violations = checkRoster(shifts, {
    ...lenient,
    breakDueAboveHours: 6,
    minBreakMinutes: 30,
  });
  assert.deepEqual(violations, [
    { code: "break", shiftIndexes: [1], measured: 15, limit: 30 },
  ]);
});

// Extends: [happy-2] the break rule uses end minus start before the break is taken off
test("[happy-2] the break rule measures the shift between instants when its offsets differ", () => {
  const shifts = [
    // 06:00Z to 14:00Z: 8 hours, though the wall clock reads 09:00 to 14:00.
    shift("2026-03-02T09:00:00+03:00", "2026-03-02T14:00:00+00:00", 10),
    // 12:00Z to 17:00Z: 5 hours, though the wall clock reads 09:00 to 17:00.
    shift("2026-03-03T09:00:00-03:00", "2026-03-03T17:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, {
    ...lenient,
    breakDueAboveHours: 6,
    minBreakMinutes: 30,
  });
  assert.deepEqual(violations, [
    { code: "break", shiftIndexes: [0], measured: 10, limit: 30 },
  ]);
});

// Extends: [happy-2] an 8-hour shift with a 20-minute break breaches a 30-minute break due above 6 hours
test("[happy-2] a shift both too long and short of its break lists break before shift-hours", () => {
  const shifts = [
    shift("2026-03-02T08:00:00+00:00", "2026-03-02T19:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, {
    ...lenient,
    maxShiftHours: 10,
    breakDueAboveHours: 6,
    minBreakMinutes: 30,
  });
  assert.deepEqual(violations, [
    { code: "break", shiftIndexes: [0], measured: 0, limit: 30 },
    { code: "shift-hours", shiftIndexes: [0], measured: 11, limit: 10 },
  ]);
});

// Extends: [boundary-1] a Sunday night shift running into Monday counts toward the week of its start
test("[boundary-1] all hours of a Sunday night shift count toward the week it starts in, none toward the next", () => {
  const shifts = [
    // Monday to Friday, 2 to 6 March: 40 hours.
    ...dayShifts(
      ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06"],
      "09:00",
      "17:00",
    ),
    // Sunday 8 March 22:00 to Monday 06:00: 8 hours, 2 of them on Sunday.
    shift("2026-03-08T22:00:00+00:00", "2026-03-09T06:00:00+00:00"),
    // Monday to Thursday, 9 to 12 March: 32 hours.
    ...dayShifts(
      ["2026-03-09", "2026-03-10", "2026-03-11", "2026-03-12"],
      "09:00",
      "17:00",
    ),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxWeekHours: 44 });
  assert.deepEqual(violations, [
    { code: "week-hours", shiftIndexes: range(0, 5), measured: 48, limit: 44 },
  ]);
});

// Extends: [boundary-1] a Sunday night shift running into Monday counts toward the week of its start
test("[boundary-1] a night shift starting Sunday in -05:00 counts toward that week, though it starts Monday in UTC", () => {
  const shifts = [
    shift("2026-03-02T09:00:00-05:00", "2026-03-02T13:00:00-05:00"),
    // Sunday 22:00 in -05:00 is Monday 03:00 UTC.
    shift("2026-03-08T22:00:00-05:00", "2026-03-09T06:00:00-05:00"),
    shift("2026-03-09T09:00:00-05:00", "2026-03-09T13:00:00-05:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxWeekHours: 10 });
  assert.deepEqual(violations, [
    { code: "week-hours", shiftIndexes: [0, 1], measured: 12, limit: 10 },
  ]);
});

// Extends: [boundary-1] a shift across midnight counts only the day it starts toward days in a row
test("[boundary-1] night shifts do not fill the days they end on, so a run is broken where no shift starts", () => {
  // Days started on: Monday, Tuesday, Thursday, Saturday. Runs of 2, 1, 1.
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00"),
    shift("2026-03-03T22:00:00+00:00", "2026-03-04T06:00:00+00:00"),
    shift("2026-03-05T22:00:00+00:00", "2026-03-06T06:00:00+00:00"),
    shift("2026-03-07T09:00:00+00:00", "2026-03-07T17:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxConsecutiveDays: 2 });
  assert.deepEqual(violations, []);
});

// Extends: [boundary-1] a shift across midnight counts only the day it starts toward days in a row
test("[boundary-1] a run ending with a Sunday night shift counts Sunday, not the Monday it ends on", () => {
  const shifts = [
    ...dayShifts(
      [
        "2026-03-02",
        "2026-03-03",
        "2026-03-04",
        "2026-03-05",
        "2026-03-06",
        "2026-03-07",
      ],
      "09:00",
      "13:00",
    ),
    shift("2026-03-08T22:00:00+00:00", "2026-03-09T06:00:00+00:00"),
    // Tuesday: the Monday between has no shift starting on it.
    shift("2026-03-10T09:00:00+00:00", "2026-03-10T13:00:00+00:00"),
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
