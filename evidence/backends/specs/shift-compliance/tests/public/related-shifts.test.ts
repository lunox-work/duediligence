import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRoster, type Policy, type Shift } from "../../src/index.js";

function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    maxShiftHours: 24,
    maxWeekHours: 168,
    minRestMinutes: 0,
    breakDueAboveHours: 24,
    minBreakMinutes: 0,
    maxConsecutiveDays: 31,
    ...overrides,
  };
}

test("[happy-3] nine hours of rest breaches eleven hours even when the later shift is input first", () => {
  const shifts: Shift[] = [
    { start: "2026-03-03T08:00:00+08:00", end: "2026-03-03T16:00:00+08:00", breakMinutes: 0 },
    { start: "2026-03-02T15:00:00+08:00", end: "2026-03-02T23:00:00+08:00", breakMinutes: 60 },
  ];
  assert.deepEqual(checkRoster(shifts, policy({ minRestMinutes: 660 })), [
    { code: "rest", shiftIndexes: [1, 0], measured: 9, limit: 11 },
  ]);
});

test("[happy-3] exactly eleven hours of rest measured across different offsets is permitted", () => {
  const shifts: Shift[] = [
    { start: "2026-03-02T15:00:00+08:00", end: "2026-03-02T23:00:00+08:00", breakMinutes: 0 },
    { start: "2026-03-03T03:00:00+01:00", end: "2026-03-03T04:00:00+01:00", breakMinutes: 0 },
  ];
  assert.deepEqual(checkRoster(shifts, policy({ minRestMinutes: 660 })), []);
});

test("[happy-3] rest uses only neighboring starts and reports violations by first input index", () => {
  const shifts: Shift[] = [
    { start: "2026-03-02T12:00:00+08:00", end: "2026-03-02T13:00:00+08:00", breakMinutes: 0 },
    { start: "2026-03-02T15:00:00+08:00", end: "2026-03-02T16:00:00+08:00", breakMinutes: 0 },
    { start: "2026-03-02T09:00:00+08:00", end: "2026-03-02T10:00:00+08:00", breakMinutes: 0 },
  ];
  assert.deepEqual(checkRoster(shifts, policy({ minRestMinutes: 360 })), [
    { code: "rest", shiftIndexes: [0, 1], measured: 2, limit: 6 },
    { code: "rest", shiftIndexes: [2, 0], measured: 2, limit: 6 },
  ]);
});

test("[unhappy-1] overlapping shifts retain their other breaches and violations sort by index then code", () => {
  const shifts: Shift[] = [
    { start: "2026-03-02T20:00:00+08:00", end: "2026-03-03T06:00:00+08:00", breakMinutes: 30 },
    { start: "2026-03-03T04:00:00+08:00", end: "2026-03-03T12:00:00+08:00", breakMinutes: 30 },
  ];
  const violations = checkRoster(shifts, policy({
    maxShiftHours: 7,
    maxWeekHours: 16,
    minRestMinutes: 660,
    breakDueAboveHours: 6,
    minBreakMinutes: 60,
    maxConsecutiveDays: 1,
  }));
  // The specification does not prescribe whether an overlap also emits rest.
  assert.deepEqual(violations.filter((violation) => violation.code !== "rest"), [
    { code: "break", shiftIndexes: [0], measured: 30, limit: 60 },
    { code: "consecutive-days", shiftIndexes: [0, 1], measured: 2, limit: 1 },
    { code: "overlap", shiftIndexes: [0, 1], measured: 2, limit: null },
    { code: "shift-hours", shiftIndexes: [0], measured: 9.5, limit: 7 },
    { code: "week-hours", shiftIndexes: [0, 1], measured: 17, limit: 16 },
    { code: "break", shiftIndexes: [1], measured: 30, limit: 60 },
    { code: "shift-hours", shiftIndexes: [1], measured: 7.5, limit: 7 },
  ]);
});

test("[unhappy-1] touching shifts do not overlap and have zero hours of rest", () => {
  const shifts: Shift[] = [
    { start: "2026-03-02T09:00:00+08:00", end: "2026-03-02T13:00:00+08:00", breakMinutes: 0 },
    { start: "2026-03-02T13:00:00+08:00", end: "2026-03-02T17:00:00+08:00", breakMinutes: 0 },
  ];
  assert.deepEqual(checkRoster(shifts, policy({ minRestMinutes: 660 })), [
    { code: "rest", shiftIndexes: [0, 1], measured: 0, limit: 11 },
  ]);
});
