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

test("[happy-1] a shift of 11 hours with a 30-minute break breaches a 10-hour maximum, measured 10.5", () => {
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00"),
    shift("2026-03-03T09:00:00+00:00", "2026-03-03T20:00:00+00:00", 30),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxShiftHours: 10 });
  assert.deepEqual(violations, [
    { code: "shift-hours", shiftIndexes: [1], measured: 10.5, limit: 10 },
  ]);
});

test("[happy-1] a shift measuring exactly the 10-hour maximum is not a violation", () => {
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T19:30:00+00:00", 30),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxShiftHours: 10 });
  assert.deepEqual(violations, []);
});

test("[happy-2] an 8-hour shift with a 20-minute break breaches a 30-minute break due above 6 hours", () => {
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00", 20),
  ];
  const violations = checkRoster(shifts, {
    ...lenient,
    breakDueAboveHours: 6,
    minBreakMinutes: 30,
  });
  assert.deepEqual(violations, [
    { code: "break", shiftIndexes: [0], measured: 20, limit: 30 },
  ]);
});

test("[happy-2] a shift of exactly 6 hours needs no break", () => {
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T15:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, {
    ...lenient,
    breakDueAboveHours: 6,
    minBreakMinutes: 30,
  });
  assert.deepEqual(violations, []);
});

test("[happy-2] the break rule uses end minus start before the break is taken off", () => {
  // 6h20m from start to end, 6 hours once the 20-minute break is taken off.
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T15:20:00+00:00", 20),
  ];
  const violations = checkRoster(shifts, {
    ...lenient,
    breakDueAboveHours: 6,
    minBreakMinutes: 30,
  });
  assert.deepEqual(violations, [
    { code: "break", shiftIndexes: [0], measured: 20, limit: 30 },
  ]);
});

test("[boundary-1] a Sunday night shift running into Monday counts toward the week of its start", () => {
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T13:00:00+00:00"),
    shift("2026-03-08T22:00:00+00:00", "2026-03-09T06:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxWeekHours: 10 });
  assert.deepEqual(violations, [
    { code: "week-hours", shiftIndexes: [0, 1], measured: 12, limit: 10 },
  ]);
});

test("[boundary-1] a shift across midnight counts only the day it starts toward days in a row", () => {
  // Monday, Tuesday 22:00 to Wednesday 06:00: two days in a row, not three.
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00"),
    shift("2026-03-03T22:00:00+00:00", "2026-03-04T06:00:00+00:00"),
  ];
  const violations = checkRoster(shifts, { ...lenient, maxConsecutiveDays: 2 });
  assert.deepEqual(violations, []);
});
