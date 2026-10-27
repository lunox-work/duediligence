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

// The consecutive dates from the given one, in UTC.
function datesFrom(first: string, count: number): string[] {
  const at = Date.parse(`${first}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) =>
    new Date(at + i * 86_400_000).toISOString().slice(0, 10),
  );
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

// --- rest ---

// Extends "rest is measured between consecutive shifts sorted by start, whatever the input order":
// more shifts, two short rests, a fractional limit, and a first input shift that is the latest.
test("[happy-3] every short rest between consecutive shifts is reported against a fractional limit", () => {
  const policy: Policy = { ...lenient, minRestMinutes: 690 };
  const shifts = [
    shift("2026-03-05T09:00:00+00:00", "2026-03-05T17:00:00+00:00"),
    shift("2026-03-02T12:00:00+00:00", "2026-03-02T20:00:00+00:00"),
    shift("2026-03-03T07:15:00+00:00", "2026-03-03T15:00:00+00:00"),
    shift("2026-03-04T01:00:00+00:00", "2026-03-04T09:00:00+00:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "rest"), [
    { code: "rest", shiftIndexes: [1, 2], measured: 11.25, limit: 11.5 },
    { code: "rest", shiftIndexes: [2, 3], measured: 10, limit: 11.5 },
  ]);
});

// Extends "too little rest between shifts is a rest violation in hours": rest is only measured
// between consecutive shifts, not between a shift and one two places after it.
test("[happy-3] rest is not measured between shifts that are not consecutive", () => {
  const policy: Policy = { ...lenient, minRestMinutes: 660 };
  const shifts = [
    shift("2026-03-02T15:00:00+00:00", "2026-03-02T23:00:00+00:00"),
    shift("2026-03-03T07:00:00+00:00", "2026-03-03T08:00:00+00:00"),
    shift("2026-03-03T09:00:00+00:00", "2026-03-03T10:00:00+00:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "rest"), [
    { code: "rest", shiftIndexes: [0, 1], measured: 8, limit: 11 },
    { code: "rest", shiftIndexes: [1, 2], measured: 1, limit: 11 },
  ]);
});

// Extends "too little rest between shifts ...": the shifts are written in different offsets.
test("[happy-3] rest is measured between instants when the shifts are written in different offsets", () => {
  const policy: Policy = { ...lenient, minRestMinutes: 660 };
  const shifts = [
    shift("2026-03-02T15:00:00+00:00", "2026-03-02T23:00:00+00:00"),
    shift("2026-03-03T16:00:00+08:00", "2026-03-03T20:00:00+08:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "rest"), [
    { code: "rest", shiftIndexes: [0, 1], measured: 9, limit: 11 },
  ]);
});

// Extends "rest is measured between consecutive shifts sorted by start ...": sorted by the
// instant of the start, which differs here from the order of the written strings.
test("[happy-3] shifts are sorted by the instant they start, not by how the start is written", () => {
  const policy: Policy = { ...lenient, minRestMinutes: 60 };
  const shifts = [
    shift("2026-03-03T02:00:00+00:00", "2026-03-03T02:30:00+00:00"),
    shift("2026-03-02T22:00:00-05:00", "2026-03-03T01:00:00-05:00"),
  ];
  const violations = checkRoster(shifts, policy);
  assert.deepEqual(withCode(violations, "overlap"), []);
  assert.deepEqual(withCode(violations, "rest"), [
    { code: "rest", shiftIndexes: [0, 1], measured: 0.5, limit: 1 },
  ]);
});

// --- overlap ---

// Extends "overlapping shifts are an overlap violation measured in hours with no limit":
// one shift lies wholly inside the other.
test("[unhappy-1] a shift inside another overlaps it by its own length", () => {
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00"),
    shift("2026-03-02T10:00:00+00:00", "2026-03-02T12:00:00+00:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, lenient), "overlap"), [
    { code: "overlap", shiftIndexes: [0, 1], measured: 2, limit: null },
  ]);
});

// Extends "overlapping shifts are an overlap violation ...": a long shift overlaps two shorter
// ones that do not overlap each other, the second of which is not next to it by start.
test("[unhappy-1] a shift overlapping two others is an overlap with each of them", () => {
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00"),
    shift("2026-03-02T10:00:00+00:00", "2026-03-02T11:00:00+00:00"),
    shift("2026-03-02T12:00:00+00:00", "2026-03-02T15:00:00+00:00"),
  ];
  const overlaps = withCode(checkRoster(shifts, lenient), "overlap");
  const sorted = [...overlaps].sort(
    (a: Violation, b: Violation) => a.shiftIndexes[1]! - b.shiftIndexes[1]!,
  );
  assert.deepEqual(sorted, [
    { code: "overlap", shiftIndexes: [0, 1], measured: 1, limit: null },
    { code: "overlap", shiftIndexes: [0, 2], measured: 3, limit: null },
  ]);
});

// Extends "overlapping shifts are an overlap violation ...": the later-starting shift comes first
// in the input.
test("[unhappy-1] overlapping shifts given latest first are still an overlap of both", () => {
  const shifts = [
    shift("2026-03-02T15:00:00+00:00", "2026-03-02T20:00:00+00:00"),
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00"),
  ];
  const overlaps = withCode(checkRoster(shifts, lenient), "overlap");
  assert.equal(overlaps.length, 1);
  assert.deepEqual([...overlaps[0]!.shiftIndexes].sort(), [0, 1]);
  assert.equal(overlaps[0]!.measured, 2);
  assert.equal(overlaps[0]!.limit, null);
});

// Extends "overlapping shifts are an overlap violation ...": the shifts are written in
// different offsets.
test("[unhappy-1] overlap is measured between instants when written in different offsets", () => {
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00"),
    shift("2026-03-02T11:00:00-05:00", "2026-03-02T15:00:00-05:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, lenient), "overlap"), [
    { code: "overlap", shiftIndexes: [0, 1], measured: 1, limit: null },
  ]);
});

// Extends "overlapping shifts still count toward the other rules": the week-hours rule counts
// both shifts' hours in full.
test("[unhappy-1] overlapping shifts both count in full toward the week's hours", () => {
  const policy: Policy = { ...lenient, maxWeekHours: 11 };
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00"),
    shift("2026-03-02T16:00:00+00:00", "2026-03-02T20:00:00+00:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "week-hours"), [
    { code: "week-hours", shiftIndexes: [0, 1], measured: 12, limit: 11 },
  ]);
});

// Extends "overlapping shifts still count toward the other rules": days in a row and the break rule.
test("[unhappy-1] overlapping shifts both count toward days in a row and the break rule", () => {
  const policy: Policy = {
    ...lenient,
    maxConsecutiveDays: 1,
    breakDueAboveHours: 3,
    minBreakMinutes: 15,
  };
  const shifts = [
    shift("2026-03-02T20:00:00+00:00", "2026-03-03T02:00:00+00:00"),
    shift("2026-03-03T01:00:00+00:00", "2026-03-03T05:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, policy);
  assert.deepEqual(withCode(violations, "consecutive-days"), [
    { code: "consecutive-days", shiftIndexes: [0, 1], measured: 2, limit: 1 },
  ]);
  assert.deepEqual(withCode(violations, "break"), [
    { code: "break", shiftIndexes: [0], measured: 0, limit: 15 },
    { code: "break", shiftIndexes: [1], measured: 0, limit: 15 },
  ]);
});

// Extends "a shift ending exactly when the next starts does not overlap, and their rest is 0":
// the end and the start are the same instant written in different offsets.
test("[unhappy-1] an end and a start at the same instant in different offsets do not overlap", () => {
  const policy: Policy = { ...lenient, minRestMinutes: 60 };
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00"),
    shift("2026-03-03T01:00:00+08:00", "2026-03-03T05:00:00+08:00"),
  ];
  const violations = checkRoster(shifts, policy);
  assert.deepEqual(withCode(violations, "overlap"), []);
  assert.deepEqual(withCode(violations, "rest"), [
    { code: "rest", shiftIndexes: [0, 1], measured: 0, limit: 1 },
  ]);
});

// --- week hours ---

// Extends "too many hours in a week is a week-hours violation with every shift of the week".
test("[happy-4] a week of exactly the maximum hours is not a violation", () => {
  const policy: Policy = { ...lenient, maxWeekHours: 40 };
  const shifts = dayShifts(["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-08"]);
  assert.deepEqual(withCode(checkRoster(shifts, policy), "week-hours"), []);
});

// Extends "too many hours in a week ...": the week's hours are net of each shift's break.
test("[happy-4] a week's hours are the shifts' hours net of their breaks", () => {
  const policy: Policy = { ...lenient, maxWeekHours: 33.5 };
  const shifts = ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05"].map((d) =>
    shift(`${d}T09:00:00+00:00`, `${d}T18:00:00+00:00`, 30),
  );
  assert.deepEqual(withCode(checkRoster(shifts, policy), "week-hours"), [
    { code: "week-hours", shiftIndexes: [0, 1, 2, 3], measured: 34, limit: 33.5 },
  ]);
});

// Extends "too many hours in a week ..." and "a Sunday shift belongs to the week before it ...":
// three weeks, shuffled, two over the maximum; each is reported with its own shifts, ordered
// by first index rather than by week.
test("[happy-4] each week over the maximum is reported with its own shifts, by first index", () => {
  const policy: Policy = { ...lenient, maxWeekHours: 30 };
  const shifts = dayShifts([
    "2026-03-17",
    "2026-03-10",
    "2026-03-03",
    "2026-03-16",
    "2026-03-11",
    "2026-03-02",
    "2026-03-18",
    "2026-03-12",
    "2026-03-04",
    "2026-03-19",
    "2026-03-15",
    "2026-03-20",
  ]);
  assert.deepEqual(withCode(checkRoster(shifts, policy), "week-hours"), [
    { code: "week-hours", shiftIndexes: [0, 3, 6, 9, 11], measured: 40, limit: 30 },
    { code: "week-hours", shiftIndexes: [1, 4, 7, 10], measured: 32, limit: 30 },
  ]);
});

// --- a night shift into Monday ---

// Extends "a night shift into Monday is split between the weeks, its break in proportion":
// an uneven split, so the break is not shared equally.
test("[boundary-2] a night shift into Monday shares its break in proportion to an uneven split", () => {
  const policy: Policy = { ...lenient, maxWeekHours: 1 };
  const shifts = [shift("2026-03-08T22:00:00+00:00", "2026-03-09T06:00:00+00:00", 60)];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "week-hours"), [
    { code: "week-hours", shiftIndexes: [0], measured: 1.75, limit: 1 },
    { code: "week-hours", shiftIndexes: [0], measured: 5.25, limit: 1 },
  ]);
});

// Extends "a night shift into Monday is split ...": the earlier week has more shifts and more
// hours, and still comes first.
test("[boundary-2] the earlier week comes first even with more hours and more shifts", () => {
  const policy: Policy = { ...lenient, maxWeekHours: 3.5 };
  const shifts = [
    shift("2026-03-08T20:00:00+00:00", "2026-03-09T04:00:00+00:00", 30),
    shift("2026-03-06T09:00:00+00:00", "2026-03-06T17:00:00+00:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "week-hours"), [
    { code: "week-hours", shiftIndexes: [0, 1], measured: 11.75, limit: 3.5 },
    { code: "week-hours", shiftIndexes: [0], measured: 3.75, limit: 3.5 },
  ]);
});

// Extends "a night shift into Monday is split ...": the night shift is not the first input, so
// the later week, whose first index is lower, comes first.
test("[boundary-2] a split shift's weeks are ordered by first index before week", () => {
  const policy: Policy = { ...lenient, maxWeekHours: 3.5 };
  const shifts = [
    shift("2026-03-10T09:00:00+00:00", "2026-03-10T17:00:00+00:00"),
    shift("2026-03-08T20:00:00+00:00", "2026-03-09T04:00:00+00:00", 30),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "week-hours"), [
    { code: "week-hours", shiftIndexes: [0, 1], measured: 11.75, limit: 3.5 },
    { code: "week-hours", shiftIndexes: [1], measured: 3.75, limit: 3.5 },
  ]);
});

// --- weeks follow the offset of the start ---

// Extends "weeks are read in the offset of each shift's start": a half-hour offset, where the
// whole shift is on a Sunday in UTC but crosses into Monday where it is written.
test("[boundary-3] a shift's weeks follow a half-hour offset, not UTC", () => {
  const policy: Policy = { ...lenient, maxWeekHours: 0.5 };
  const shifts = [shift("2026-03-15T23:00:00+05:30", "2026-03-16T05:00:00+05:30")];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "week-hours"), [
    { code: "week-hours", shiftIndexes: [0], measured: 1, limit: 0.5 },
    { code: "week-hours", shiftIndexes: [0], measured: 5, limit: 0.5 },
  ]);
});

// Extends "an end written in another offset is read in the offset of the start": a third offset,
// in which the whole shift would be on the Monday.
test("[boundary-3] an end written in a third offset is read in the offset of the start", () => {
  const policy: Policy = { ...lenient, maxWeekHours: 0.5 };
  const shifts = [shift("2026-03-15T23:00:00+05:30", "2026-03-16T08:30:00+09:00")];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "week-hours"), [
    { code: "week-hours", shiftIndexes: [0], measured: 1, limit: 0.5 },
    { code: "week-hours", shiftIndexes: [0], measured: 5, limit: 0.5 },
  ]);
});

// Extends "weeks are read in the offset of each shift's start": a Sunday evening in a negative
// offset, Monday in UTC, belongs to the week it is written in.
test("[boundary-3] a Sunday evening shift in a negative offset belongs to that Sunday's week", () => {
  const policy: Policy = { ...lenient, maxWeekHours: 41 };
  const days = ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06"];
  const shifts = [
    ...days.map((d) => shift(`${d}T09:00:00-05:00`, `${d}T17:00:00-05:00`)),
    shift("2026-03-08T21:00:00-05:00", "2026-03-08T23:00:00-05:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "week-hours"), [
    { code: "week-hours", shiftIndexes: range(6), measured: 42, limit: 41 },
  ]);
});

// --- days in a row ---

// Extends "shifts on seven consecutive days are a consecutive-days violation".
test("[happy-5] exactly the maximum days in a row is not a violation", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 6 };
  const shifts = dayShifts(datesFrom("2026-03-02", 6));
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), []);
});

// Extends "a day no shift works on ends the run and the count starts again": two runs over the
// maximum and one under, shuffled; each run has its own shifts, ordered by first index.
test("[happy-5] each run over the maximum is reported with its own shifts, by first index", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 2 };
  const shifts = dayShifts([
    "2026-03-07",
    "2026-03-03",
    "2026-03-11",
    "2026-03-09",
    "2026-03-02",
    "2026-03-06",
    "2026-03-04",
    "2026-03-08",
  ]);
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), [
    { code: "consecutive-days", shiftIndexes: [0, 3, 5, 7], measured: 4, limit: 2 },
    { code: "consecutive-days", shiftIndexes: [1, 4, 6], measured: 3, limit: 2 },
  ]);
});

// Extends "shifts on seven consecutive days ...": the days run from February into March.
test("[happy-5] days in a row run across the end of a month", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 6 };
  const shifts = dayShifts([
    "2026-02-26",
    "2026-02-27",
    "2026-02-28",
    "2026-03-01",
    "2026-03-02",
    "2026-03-03",
    "2026-03-04",
  ]);
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), [
    { code: "consecutive-days", shiftIndexes: range(7), measured: 7, limit: 6 },
  ]);
});

// Extends "a day no shift works on ends the run ...": in a leap year 29 February is a day, so
// skipping it ends the run.
test("[happy-5] a missing 29 February in a leap year ends the run", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 2 };
  const shifts = dayShifts(["2028-02-27", "2028-02-28", "2028-03-01"]);
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), []);
  const withLeapDay = dayShifts(["2028-02-27", "2028-02-28", "2028-02-29", "2028-03-01"]);
  assert.deepEqual(withCode(checkRoster(withLeapDay, policy), "consecutive-days"), [
    { code: "consecutive-days", shiftIndexes: range(4), measured: 4, limit: 2 },
  ]);
});

// Extends "shifts on seven consecutive days ...": the days run from one year into the next.
test("[happy-5] days in a row run across the end of a year", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 6 };
  const shifts = dayShifts(datesFrom("2026-12-29", 7));
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), [
    { code: "consecutive-days", shiftIndexes: range(7), measured: 7, limit: 6 },
  ]);
});

// --- night shifts make a run ---

// Extends "six night shifts from Monday to Saturday work on seven days in a row": night shifts
// every other night, given latest first, still cover every day between them.
test("[happy-6] night shifts every other night make an unbroken run of days", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 5 };
  const shifts = [
    shift("2026-03-06T22:00:00+00:00", "2026-03-07T06:00:00+00:00"),
    shift("2026-03-04T22:00:00+00:00", "2026-03-05T06:00:00+00:00"),
    shift("2026-03-02T22:00:00+00:00", "2026-03-03T06:00:00+00:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), [
    { code: "consecutive-days", shiftIndexes: [0, 1, 2], measured: 6, limit: 5 },
  ]);
});

// Extends "six night shifts ..." and "a night shift and a day shift working on the same date
// count as one day": shuffled night shifts plus a day shift on the date the last one ends.
test("[happy-6] a day shift on the date the last night shift ends adds no day but joins the run", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 6 };
  const nights = ["2026-03-05", "2026-03-02", "2026-03-07", "2026-03-03", "2026-03-06", "2026-03-04"];
  const tomorrow: Record<string, string> = {
    "2026-03-02": "2026-03-03",
    "2026-03-03": "2026-03-04",
    "2026-03-04": "2026-03-05",
    "2026-03-05": "2026-03-06",
    "2026-03-06": "2026-03-07",
    "2026-03-07": "2026-03-08",
  };
  const shifts = [
    ...nights.map((d) => shift(`${d}T22:00:00+00:00`, `${tomorrow[d]}T06:00:00+00:00`)),
    shift("2026-03-08T14:00:00+00:00", "2026-03-08T20:00:00+00:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), [
    { code: "consecutive-days", shiftIndexes: range(7), measured: 7, limit: 6 },
  ]);
});

// Extends "a night shift and a day shift working on the same date count as one day":
// the day shift is on the date the night shift starts.
test("[happy-6] a day shift and a night shift starting on the same date count as one day", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 1 };
  const shifts = [
    shift("2026-03-02T22:00:00+00:00", "2026-03-03T06:00:00+00:00"),
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), [
    { code: "consecutive-days", shiftIndexes: [0, 1], measured: 2, limit: 1 },
  ]);
});

// --- a run is reported once ---

// Extends "a run of nine days is reported once with all nine indexes": twelve days, shuffled.
test("[boundary-4] a shuffled run of twelve days is reported once with every index", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 6 };
  const dates = datesFrom("2026-03-02", 12);
  const order = [7, 2, 11, 0, 5, 9, 3, 10, 1, 6, 8, 4];
  const shifts = dayShifts(order.map((i) => dates[i]!));
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), [
    { code: "consecutive-days", shiftIndexes: range(12), measured: 12, limit: 6 },
  ]);
});

// Extends "a run of nine days is reported once ...": two long runs split by a day off are
// reported once each.
test("[boundary-4] two long runs split by a day off are each reported once", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 6 };
  const shifts = dayShifts([...datesFrom("2026-03-02", 8), ...datesFrom("2026-03-11", 7)]);
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), [
    { code: "consecutive-days", shiftIndexes: range(8), measured: 8, limit: 6 },
    { code: "consecutive-days", shiftIndexes: range(15).slice(8), measured: 7, limit: 6 },
  ]);
});

// Extends "a run across a week boundary is one run": night shifts across two week boundaries.
test("[boundary-4] a run of night shifts across two week boundaries is one run", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 6 };
  const dates = datesFrom("2026-03-05", 15);
  const shifts = dates.map((d, i) => {
    const next = datesFrom(d, 2)[1]!;
    return i === dates.length - 1
      ? shift(`${d}T09:00:00+00:00`, `${d}T17:00:00+00:00`)
      : shift(`${d}T22:00:00+00:00`, `${next}T06:00:00+00:00`);
  });
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), [
    { code: "consecutive-days", shiftIndexes: range(15), measured: 15, limit: 6 },
  ]);
});
