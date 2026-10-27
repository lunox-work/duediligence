import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRoster } from "../../src/index.js";
import type { Policy, Shift, Violation, ViolationCode } from "../../src/index.js";

// A policy no roster in these tests breaches unless a test tightens it.
const lenient: Policy = {
  maxShiftHours: 48,
  maxWeekHours: 168,
  minRestMinutes: 0,
  breakDueAboveHours: 48,
  minBreakMinutes: 0,
  maxConsecutiveDays: 365,
};

function shift(start: string, end: string, breakMinutes = 0): Shift {
  return { start, end, breakMinutes };
}

function withCode(violations: Violation[], code: ViolationCode): Violation[] {
  return violations.filter((v) => v.code === code);
}

// A 09:00 to 17:00 shift on each of the given dates, in UTC.
function dayShifts(dates: string[]): Shift[] {
  return dates.map((d) => shift(`${d}T09:00:00+00:00`, `${d}T17:00:00+00:00`));
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

test("[happy-3] too little rest between shifts is a rest violation in hours", () => {
  const policy: Policy = { ...lenient, minRestMinutes: 660 };
  const shifts = [
    shift("2026-03-02T15:00:00+00:00", "2026-03-02T23:00:00+00:00"),
    shift("2026-03-03T08:00:00+00:00", "2026-03-03T16:00:00+00:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "rest"), [
    { code: "rest", shiftIndexes: [0, 1], measured: 9, limit: 11 },
  ]);
});

test("[happy-3] exactly the minimum rest is not a violation", () => {
  const policy: Policy = { ...lenient, minRestMinutes: 660 };
  const shifts = [
    shift("2026-03-02T15:00:00+00:00", "2026-03-02T23:00:00+00:00"),
    shift("2026-03-03T10:00:00+00:00", "2026-03-03T18:00:00+00:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "rest"), []);
});

test("[happy-3] rest is measured between consecutive shifts sorted by start, whatever the input order", () => {
  const policy: Policy = { ...lenient, minRestMinutes: 660 };
  const shifts = [
    shift("2026-03-04T09:00:00+00:00", "2026-03-04T17:00:00+00:00"),
    shift("2026-03-02T15:00:00+00:00", "2026-03-02T23:00:00+00:00"),
    shift("2026-03-03T08:00:00+00:00", "2026-03-03T16:00:00+00:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "rest"), [
    { code: "rest", shiftIndexes: [1, 2], measured: 9, limit: 11 },
  ]);
});

test("[unhappy-1] overlapping shifts are an overlap violation measured in hours with no limit", () => {
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00"),
    shift("2026-03-02T16:00:00+00:00", "2026-03-02T20:00:00+00:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, lenient), "overlap"), [
    { code: "overlap", shiftIndexes: [0, 1], measured: 1, limit: null },
  ]);
});

test("[unhappy-1] overlapping shifts still count toward the other rules", () => {
  const policy: Policy = { ...lenient, maxShiftHours: 3 };
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00"),
    shift("2026-03-02T16:00:00+00:00", "2026-03-02T20:00:00+00:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "shift-hours"), [
    { code: "shift-hours", shiftIndexes: [0], measured: 8, limit: 3 },
    { code: "shift-hours", shiftIndexes: [1], measured: 4, limit: 3 },
  ]);
});

test("[unhappy-1] a shift ending exactly when the next starts does not overlap, and their rest is 0", () => {
  const policy: Policy = { ...lenient, minRestMinutes: 60 };
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00"),
    shift("2026-03-02T17:00:00+00:00", "2026-03-02T21:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, policy);
  assert.deepEqual(withCode(violations, "overlap"), []);
  assert.deepEqual(withCode(violations, "rest"), [
    { code: "rest", shiftIndexes: [0, 1], measured: 0, limit: 1 },
  ]);
});

test("[happy-4] too many hours in a week is a week-hours violation with every shift of the week", () => {
  const policy: Policy = { ...lenient, maxWeekHours: 44 };
  const shifts = dayShifts([
    "2026-03-02",
    "2026-03-03",
    "2026-03-04",
    "2026-03-05",
    "2026-03-06",
    "2026-03-07",
  ]);
  assert.deepEqual(withCode(checkRoster(shifts, policy), "week-hours"), [
    { code: "week-hours", shiftIndexes: range(6), measured: 48, limit: 44 },
  ]);
});

test("[happy-4] a Sunday shift belongs to the week before it and the Monday after to the next", () => {
  const policy: Policy = { ...lenient, maxWeekHours: 44 };
  const shifts = dayShifts([
    "2026-03-02",
    "2026-03-03",
    "2026-03-04",
    "2026-03-05",
    "2026-03-06",
    "2026-03-08",
    "2026-03-09",
  ]);
  assert.deepEqual(withCode(checkRoster(shifts, policy), "week-hours"), [
    { code: "week-hours", shiftIndexes: range(6), measured: 48, limit: 44 },
  ]);
});

test("[boundary-2] a night shift into Monday is split between the weeks, its break in proportion", () => {
  const policy: Policy = { ...lenient, maxWeekHours: 3.5 };
  const shifts = [
    shift("2026-03-08T20:00:00+00:00", "2026-03-09T04:00:00+00:00", 30),
    shift("2026-03-09T10:00:00+00:00", "2026-03-09T12:00:00+00:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "week-hours"), [
    { code: "week-hours", shiftIndexes: [0], measured: 3.75, limit: 3.5 },
    { code: "week-hours", shiftIndexes: [0, 1], measured: 5.75, limit: 3.5 },
  ]);
});

test("[boundary-2] a shift ending exactly at 00:00 on Monday has no hours in the week that starts then", () => {
  const policy: Policy = { ...lenient, maxWeekHours: 1 };
  const shifts = [shift("2026-03-08T20:00:00+00:00", "2026-03-09T00:00:00+00:00")];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "week-hours"), [
    { code: "week-hours", shiftIndexes: [0], measured: 4, limit: 1 },
  ]);
});

test("[boundary-3] weeks are read in the offset of each shift's start", () => {
  const policy: Policy = { ...lenient, maxWeekHours: 0.25 };
  const west = [shift("2026-03-08T23:30:00-05:00", "2026-03-09T07:30:00-05:00")];
  assert.deepEqual(withCode(checkRoster(west, policy), "week-hours"), [
    { code: "week-hours", shiftIndexes: [0], measured: 0.5, limit: 0.25 },
    { code: "week-hours", shiftIndexes: [0], measured: 7.5, limit: 0.25 },
  ]);
  const east = [shift("2026-03-09T00:30:00+08:00", "2026-03-09T08:30:00+08:00")];
  assert.deepEqual(withCode(checkRoster(east, policy), "week-hours"), [
    { code: "week-hours", shiftIndexes: [0], measured: 8, limit: 0.25 },
  ]);
});

test("[boundary-3] an end written in another offset is read in the offset of the start", () => {
  const policy: Policy = { ...lenient, maxWeekHours: 0.25 };
  const shifts = [shift("2026-03-08T23:30:00-05:00", "2026-03-09T12:30:00Z")];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "week-hours"), [
    { code: "week-hours", shiftIndexes: [0], measured: 0.5, limit: 0.25 },
    { code: "week-hours", shiftIndexes: [0], measured: 7.5, limit: 0.25 },
  ]);
});

test("[happy-5] shifts on seven consecutive days are a consecutive-days violation", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 6 };
  const shifts = dayShifts([
    "2026-03-02",
    "2026-03-03",
    "2026-03-04",
    "2026-03-05",
    "2026-03-06",
    "2026-03-07",
    "2026-03-08",
  ]);
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), [
    { code: "consecutive-days", shiftIndexes: range(7), measured: 7, limit: 6 },
  ]);
});

test("[happy-5] a day no shift works on ends the run and the count starts again", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 6 };
  const shifts = dayShifts([
    "2026-03-02",
    "2026-03-03",
    "2026-03-04",
    "2026-03-06",
    "2026-03-07",
    "2026-03-08",
    "2026-03-09",
    "2026-03-10",
    "2026-03-11",
  ]);
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), []);
});

test("[happy-5] two shifts on the same day count as one day, and both are among the indexes", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 6 };
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00"),
    shift("2026-03-03T09:00:00+00:00", "2026-03-03T17:00:00+00:00"),
    shift("2026-03-04T06:00:00+00:00", "2026-03-04T10:00:00+00:00"),
    shift("2026-03-04T14:00:00+00:00", "2026-03-04T18:00:00+00:00"),
    shift("2026-03-05T09:00:00+00:00", "2026-03-05T17:00:00+00:00"),
    shift("2026-03-06T09:00:00+00:00", "2026-03-06T17:00:00+00:00"),
    shift("2026-03-07T09:00:00+00:00", "2026-03-07T17:00:00+00:00"),
    shift("2026-03-08T09:00:00+00:00", "2026-03-08T17:00:00+00:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), [
    { code: "consecutive-days", shiftIndexes: range(8), measured: 7, limit: 6 },
  ]);
});

test("[happy-6] six night shifts from Monday to Saturday work on seven days in a row", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 6 };
  const shifts = [
    shift("2026-03-02T22:00:00+00:00", "2026-03-03T06:00:00+00:00"),
    shift("2026-03-03T22:00:00+00:00", "2026-03-04T06:00:00+00:00"),
    shift("2026-03-04T22:00:00+00:00", "2026-03-05T06:00:00+00:00"),
    shift("2026-03-05T22:00:00+00:00", "2026-03-06T06:00:00+00:00"),
    shift("2026-03-06T22:00:00+00:00", "2026-03-07T06:00:00+00:00"),
    shift("2026-03-07T22:00:00+00:00", "2026-03-08T06:00:00+00:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), [
    { code: "consecutive-days", shiftIndexes: range(6), measured: 7, limit: 6 },
  ]);
});

test("[happy-6] a night shift and a day shift working on the same date count as one day", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 1 };
  const shifts = [
    shift("2026-03-02T22:00:00+00:00", "2026-03-03T06:00:00+00:00"),
    shift("2026-03-03T14:00:00+00:00", "2026-03-03T20:00:00+00:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), [
    { code: "consecutive-days", shiftIndexes: [0, 1], measured: 2, limit: 1 },
  ]);
});

test("[boundary-4] a run of nine days is reported once with all nine indexes", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 6 };
  const shifts = dayShifts([
    "2026-03-02",
    "2026-03-03",
    "2026-03-04",
    "2026-03-05",
    "2026-03-06",
    "2026-03-07",
    "2026-03-08",
    "2026-03-09",
    "2026-03-10",
  ]);
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), [
    { code: "consecutive-days", shiftIndexes: range(9), measured: 9, limit: 6 },
  ]);
});

test("[boundary-4] a run across a week boundary is one run", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 6 };
  const shifts = dayShifts([
    "2026-03-05",
    "2026-03-06",
    "2026-03-07",
    "2026-03-08",
    "2026-03-09",
    "2026-03-10",
    "2026-03-11",
  ]);
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), [
    { code: "consecutive-days", shiftIndexes: range(7), measured: 7, limit: 6 },
  ]);
});
