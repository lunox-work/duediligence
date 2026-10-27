import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRoster } from "../../src/index.js";
import type { Policy, Shift } from "../../src/index.js";

function shift(start: string, end: string, breakMinutes = 0): Shift {
  return { start, end, breakMinutes };
}

const policy: Policy = {
  maxShiftHours: 10,
  maxWeekHours: 40,
  minRestMinutes: 660,
  breakDueAboveHours: 6,
  minBreakMinutes: 30,
  maxConsecutiveDays: 3,
};

const roster = [
  // Monday: 12 hours, no break.
  shift("2026-03-02T08:00:00+00:00", "2026-03-02T20:00:00+00:00"),
  // Tuesday: 4 hours, 10 hours after Monday's shift.
  shift("2026-03-03T06:00:00+00:00", "2026-03-03T10:00:00+00:00"),
  // Wednesday: 8 hours with a 45-minute break, 7.25 net.
  shift("2026-03-04T09:00:00+00:00", "2026-03-04T17:00:00+00:00", 45),
  // Thursday: 11 hours with a 30-minute break, 10.5 net.
  shift("2026-03-05T09:00:00+00:00", "2026-03-05T20:00:00+00:00", 30),
  // Saturday: 8 hours with a 30-minute break, 7.5 net.
  shift("2026-03-07T09:00:00+00:00", "2026-03-07T17:00:00+00:00", 30),
];

// Extends: [happy-1] a shift of 11 hours with a 30-minute break breaches a 10-hour maximum, measured 10.5
test("[happy-1] a roster breaching every rule but overlap lists all its violations by first index, then code", () => {
  assert.deepEqual(checkRoster(roster, policy), [
    { code: "break", shiftIndexes: [0], measured: 0, limit: 30 },
    {
      code: "consecutive-days",
      shiftIndexes: [0, 1, 2, 3],
      measured: 4,
      limit: 3,
    },
    { code: "rest", shiftIndexes: [0, 1], measured: 10, limit: 11 },
    { code: "shift-hours", shiftIndexes: [0], measured: 12, limit: 10 },
    {
      code: "week-hours",
      shiftIndexes: [0, 1, 2, 3, 4],
      measured: 41.25,
      limit: 40,
    },
    { code: "shift-hours", shiftIndexes: [3], measured: 10.5, limit: 10 },
  ]);
});
