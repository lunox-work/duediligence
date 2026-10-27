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

// Extends "a shift longer than the maximum is a shift-hours violation measured net of its break":
// several shifts given out of order, a fractional maximum, only the long ones reported.
test("[happy-1] only the shifts over a fractional maximum are reported, by input index", () => {
  const policy: Policy = { ...lenient, maxShiftHours: 7.5 };
  const shifts = [
    shift("2026-03-04T09:00:00+00:00", "2026-03-04T17:00:00+00:00", 15),
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00", 30),
    shift("2026-03-03T08:00:00+00:00", "2026-03-03T18:00:00+00:00", 60),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "shift-hours"), [
    { code: "shift-hours", shiftIndexes: [0], measured: 7.75, limit: 7.5 },
    { code: "shift-hours", shiftIndexes: [2], measured: 9, limit: 7.5 },
  ]);
});

// Extends "a shift measuring exactly the maximum hours is not a violation":
// longer than the maximum from start to end, but under it once the break is taken off.
test("[happy-1] a shift over the maximum only before its break is taken off is not a violation", () => {
  const policy: Policy = { ...lenient, maxShiftHours: 10 };
  const shifts = [shift("2026-03-02T08:00:00+00:00", "2026-03-02T18:15:00+00:00", 30)];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "shift-hours"), []);
});

// Extends "a shift longer than the maximum ...": the end is written in another offset.
test("[happy-1] a shift's hours are measured between instants, whatever offsets its ends are written in", () => {
  const policy: Policy = { ...lenient, maxShiftHours: 3 };
  const shifts = [shift("2026-03-02T09:00:00+08:00", "2026-03-02T05:00:00Z")];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "shift-hours"), [
    { code: "shift-hours", shiftIndexes: [0], measured: 4, limit: 3 },
  ]);
});

// Extends "a shift longer than the maximum ...": a break violation on the same shift comes first,
// as violations with the same first index are ordered by code.
test("[happy-1] a shift-hours violation follows a break violation on the same shift", () => {
  const policy: Policy = {
    ...lenient,
    maxShiftHours: 10,
    breakDueAboveHours: 6,
    minBreakMinutes: 30,
  };
  const shifts = [shift("2026-03-02T08:00:00+00:00", "2026-03-02T20:00:00+00:00")];
  assert.deepEqual(checkRoster(shifts, policy), [
    { code: "break", shiftIndexes: [0], measured: 0, limit: 30 },
    { code: "shift-hours", shiftIndexes: [0], measured: 12, limit: 10 },
  ]);
});

// Extends "a long shift with too short a break is a break violation in minutes".
test("[happy-2] a break of exactly the minimum is not a violation", () => {
  const policy: Policy = { ...lenient, breakDueAboveHours: 6, minBreakMinutes: 30 };
  const shifts = [shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00", 30)];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "break"), []);
});

// Extends "a shift of exactly the break threshold needs no break": just above it, no break at all.
test("[happy-2] a shift just above the threshold with no break is a break violation measured 0", () => {
  const policy: Policy = { ...lenient, breakDueAboveHours: 6, minBreakMinutes: 30 };
  const shifts = [shift("2026-03-02T09:00:00+00:00", "2026-03-02T15:15:00+00:00", 0)];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "break"), [
    { code: "break", shiftIndexes: [0], measured: 0, limit: 30 },
  ]);
});

// Extends "a long shift with too short a break ...": other policy values and several shifts.
test("[happy-2] the break rule follows the policy's threshold and minimum across several shifts", () => {
  const policy: Policy = { ...lenient, breakDueAboveHours: 4.5, minBreakMinutes: 45 };
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T13:30:00+00:00", 0),
    shift("2026-03-03T09:00:00+00:00", "2026-03-03T14:00:00+00:00", 40),
    shift("2026-03-04T09:00:00+00:00", "2026-03-04T18:00:00+00:00", 45),
    shift("2026-03-05T09:00:00+00:00", "2026-03-05T16:00:00+00:00", 30),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "break"), [
    { code: "break", shiftIndexes: [1], measured: 40, limit: 45 },
    { code: "break", shiftIndexes: [3], measured: 30, limit: 45 },
  ]);
});

// Extends "a shift of exactly the break threshold needs no break": a short break on a shift
// at or under the threshold is not a violation either.
test("[happy-2] a short break on a shift not above the threshold is not a violation", () => {
  const policy: Policy = { ...lenient, breakDueAboveHours: 6, minBreakMinutes: 30 };
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T14:00:00+00:00", 10),
    shift("2026-03-03T09:00:00+00:00", "2026-03-03T15:00:00+00:00", 15),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "break"), []);
});

// Extends "a shift from 22:00 to 06:00 works on the day it starts and the next":
// the next day joins a day shift on the day after, which a start-date-only count misses.
test("[boundary-1] a night shift's second day joins a run with a shift on the day after", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 2 };
  const shifts = [
    shift("2026-03-02T22:00:00+00:00", "2026-03-03T06:00:00+00:00"),
    shift("2026-03-04T09:00:00+00:00", "2026-03-04T17:00:00+00:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), [
    { code: "consecutive-days", shiftIndexes: [0, 1], measured: 3, limit: 2 },
  ]);
});

// Extends "a shift from 20:00 to 04:00 two days later works on three days ...".
test("[boundary-1] a shift over three days and a shift on the fourth make a run of four", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 3 };
  const shifts = [
    shift("2026-03-05T09:00:00+00:00", "2026-03-05T17:00:00+00:00"),
    shift("2026-03-02T20:00:00+00:00", "2026-03-04T04:00:00+00:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), [
    { code: "consecutive-days", shiftIndexes: [0, 1], measured: 4, limit: 3 },
  ]);
});

// Extends "a shift ending exactly at 00:00 does not work on the day that begins then":
// that day does not bridge the gap to a shift the day after.
test("[boundary-1] a shift ending at 00:00 does not join a run with a shift the day after that", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 1 };
  const shifts = [
    shift("2026-03-02T16:00:00+00:00", "2026-03-03T00:00:00+00:00"),
    shift("2026-03-04T09:00:00+00:00", "2026-03-04T17:00:00+00:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), []);
});

// Extends "a shift ending exactly at 00:00 ...": the end is written in another offset.
test("[boundary-1] an end at 00:00 in the start's offset, written in another, adds no day", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 1 };
  const shifts = [shift("2026-03-02T19:00:00-05:00", "2026-03-03T05:00:00Z")];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), []);
});

// Extends "a shift from 22:00 to 06:00 ...": days are read in the offset of the start, not UTC.
test("[boundary-1] a shift's days are dates in the offset its start is written with", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 1 };
  const shifts = [
    shift("2026-03-02T20:00:00-05:00", "2026-03-02T23:00:00-05:00"),
    shift("2026-03-03T09:00:00-05:00", "2026-03-03T17:00:00-05:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), [
    { code: "consecutive-days", shiftIndexes: [0, 1], measured: 2, limit: 1 },
  ]);
});

// Extends "a shift from 20:00 to 04:00 two days later ... is measured whole":
// a shift across a week boundary is one shift for the shift-hours rule.
test("[boundary-1] a shift across a week boundary is measured whole for shift hours", () => {
  const policy: Policy = { ...lenient, maxShiftHours: 10 };
  const shifts = [shift("2026-03-08T20:00:00+00:00", "2026-03-09T08:00:00+00:00", 0)];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "shift-hours"), [
    { code: "shift-hours", shiftIndexes: [0], measured: 12, limit: 10 },
  ]);
});

// Extends "a shift from 20:00 to 04:00 two days later ... is measured whole": the break rule.
test("[boundary-1] a shift across midnight is measured whole for the break rule", () => {
  const policy: Policy = { ...lenient, breakDueAboveHours: 6, minBreakMinutes: 30 };
  const shifts = [shift("2026-03-02T20:00:00+00:00", "2026-03-03T03:00:00+00:00", 0)];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "break"), [
    { code: "break", shiftIndexes: [0], measured: 0, limit: 30 },
  ]);
});

// Extends "a shift from 20:00 to 04:00 two days later ... is measured whole": rest.
test("[boundary-1] rest after a shift across midnight is measured from its end", () => {
  const policy: Policy = { ...lenient, minRestMinutes: 660 };
  const shifts = [
    shift("2026-03-02T22:00:00+00:00", "2026-03-03T06:00:00+00:00"),
    shift("2026-03-03T14:00:00+00:00", "2026-03-03T22:00:00+00:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "rest"), [
    { code: "rest", shiftIndexes: [0, 1], measured: 8, limit: 11 },
  ]);
});

// Extends "a shift from 20:00 to 04:00 two days later ... is measured whole": overlap.
test("[boundary-1] overlap with a shift across midnight is measured on the whole shift", () => {
  const shifts = [
    shift("2026-03-02T22:00:00+00:00", "2026-03-03T06:00:00+00:00"),
    shift("2026-03-03T05:00:00+00:00", "2026-03-03T13:00:00+00:00"),
  ];
  assert.deepEqual(withCode(checkRoster(shifts, lenient), "overlap"), [
    { code: "overlap", shiftIndexes: [0, 1], measured: 1, limit: null },
  ]);
});
