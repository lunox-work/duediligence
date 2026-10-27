import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRoster } from "../../src/index.js";
import type { Policy, Shift } from "../../src/index.js";

function shift(start: string, end: string, breakMinutes = 0): Shift {
  return { start, end, breakMinutes };
}

// Extends "too little rest between shifts is a rest violation in hours", which only looks at
// rest: the whole list, with the shifts given out of start order, is ordered by first input
// index, then by code.
test("[happy-3] a rest violation takes its place among every violation by first index, then code", () => {
  const policy: Policy = {
    maxShiftHours: 10,
    maxWeekHours: 26,
    minRestMinutes: 660,
    breakDueAboveHours: 6,
    minBreakMinutes: 30,
    maxConsecutiveDays: 2,
  };
  const shifts = [
    shift("2026-03-04T09:00:00+00:00", "2026-03-04T17:00:00+00:00", 30),
    shift("2026-03-02T08:00:00+00:00", "2026-03-02T20:00:00+00:00", 0),
    shift("2026-03-03T06:00:00+00:00", "2026-03-03T14:00:00+00:00", 30),
  ];
  assert.deepEqual(checkRoster(shifts, policy), [
    { code: "consecutive-days", shiftIndexes: [0, 1, 2], measured: 3, limit: 2 },
    { code: "week-hours", shiftIndexes: [0, 1, 2], measured: 27, limit: 26 },
    { code: "break", shiftIndexes: [1], measured: 0, limit: 30 },
    { code: "rest", shiftIndexes: [1, 2], measured: 10, limit: 11 },
    { code: "shift-hours", shiftIndexes: [1], measured: 12, limit: 10 },
  ]);
});

// Extends "too little rest between shifts ...": a roster breaching nothing has no violations.
test("[happy-3] a roster within every limit has no violations", () => {
  const policy: Policy = {
    maxShiftHours: 10,
    maxWeekHours: 40,
    minRestMinutes: 660,
    breakDueAboveHours: 6,
    minBreakMinutes: 30,
    maxConsecutiveDays: 5,
  };
  const shifts = ["2026-03-06", "2026-03-02", "2026-03-04", "2026-03-03", "2026-03-05"].map((d) =>
    shift(`${d}T09:00:00+00:00`, `${d}T17:30:00+00:00`, 30),
  );
  assert.deepEqual(checkRoster(shifts, policy), []);
});
