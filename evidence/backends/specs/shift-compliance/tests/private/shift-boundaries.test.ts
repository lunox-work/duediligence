import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRoster, type Policy, type Shift } from "../../src/index.js";

function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    maxShiftHours: 1000, maxWeekHours: 10000, minRestMinutes: 0,
    breakDueAboveHours: 1000, minBreakMinutes: 0, maxConsecutiveDays: 1000,
    ...overrides,
  };
}

function shift(date: string, end: string, breakMinutes = 0): Shift {
  return { start: `${date}T09:00:00+00:00`, end: `${date}T${end}+00:00`, breakMinutes };
}

// Extends public: "an eleven-hour shift with a half-hour break measures 10.5 hours".
test("[happy-1] fractional shift limits apply to every original index and elapsed time uses both offsets", () => {
  const shifts: Shift[] = [
    shift("2026-04-28", "10:00:00"),
    { start: "2026-05-01T22:00:00+05:45", end: "2026-05-02T07:45:00+05:45", breakMinutes: 45 },
    { start: "2026-05-04T08:00:00+05:45", end: "2026-05-04T12:30:00+01:00", breakMinutes: 30 },
  ];
  assert.deepEqual(checkRoster(shifts, policy({ maxShiftHours: 7.25 })), [
    { code: "shift-hours", shiftIndexes: [1], measured: 9, limit: 7.25 },
    { code: "shift-hours", shiftIndexes: [2], measured: 8.75, limit: 7.25 },
  ]);
});

// Extends public: "exactly ten working hours after subtracting the break is permitted".
test("[happy-1] fractional maximum permits equality with different breaks and shorter shifts", () => {
  assert.deepEqual(checkRoster([
    shift("2026-04-01", "17:00:00", 45),
    shift("2026-04-02", "16:15:00"),
    shift("2026-04-03", "17:00:00", 60),
  ], policy({ maxShiftHours: 7.25 })), []);
});

test("[happy-1] a single second above the working-hours maximum is reported without rounding", () => {
  assert.deepEqual(checkRoster([shift("2026-04-01", "12:00:01", 30)], policy({ maxShiftHours: 2.5 })), [
    { code: "shift-hours", shiftIndexes: [0], measured: 9001 / 3600, limit: 2.5 },
  ]);
});

// Extends public: "an eight-hour shift with a twenty-minute break breaches the break minimum".
test("[happy-2] a changed break policy reports both missing and just-insufficient breaks at their indexes", () => {
  assert.deepEqual(checkRoster([
    shift("2026-04-01", "13:00:00"),
    shift("2026-04-02", "14:00:00"),
    shift("2026-04-03", "14:00:00", 44),
  ], policy({ breakDueAboveHours: 4.25, minBreakMinutes: 45 })), [
    { code: "break", shiftIndexes: [1], measured: 0, limit: 45 },
    { code: "break", shiftIndexes: [2], measured: 44, limit: 45 },
  ]);
});

// Extends public: "exactly six elapsed hours needs no break".
test("[happy-2] no break is required at or below a fractional elapsed-hours threshold", () => {
  assert.deepEqual(checkRoster([
    shift("2026-04-01", "13:15:00"),
    shift("2026-04-02", "13:14:59"),
  ], policy({ breakDueAboveHours: 4.25, minBreakMinutes: 45 })), []);
});

// Extends public: "break eligibility uses elapsed hours even when net hours equal six".
test("[happy-2] a break remains due when the existing break puts net hours below the threshold", () => {
  assert.deepEqual(checkRoster([
    shift("2026-04-01", "13:30:00", 30),
  ], policy({ breakDueAboveHours: 4.25, minBreakMinutes: 45 })), [
    { code: "break", shiftIndexes: [0], measured: 30, limit: 45 },
  ]);
});

// Extends public: "a break exactly meeting the minimum is permitted on a long shift".
test("[happy-2] both an exact changed break minimum and a larger break satisfy long shifts", () => {
  assert.deepEqual(checkRoster([
    shift("2026-04-01", "16:00:00", 45),
    shift("2026-04-02", "16:00:00", 60),
  ], policy({ breakDueAboveHours: 4.25, minBreakMinutes: 45 })), []);
});

test("[happy-2] one second above break eligibility requires the entire minimum break", () => {
  assert.deepEqual(checkRoster([
    shift("2026-04-01", "13:15:01"),
  ], policy({ breakDueAboveHours: 4.25, minBreakMinutes: 45 })), [
    { code: "break", shiftIndexes: [0], measured: 0, limit: 45 },
  ]);
});

test("[happy-1] all per-shift breaches are returned with alphabetic code ordering", () => {
  assert.deepEqual(checkRoster([shift("2026-04-01", "16:15:00", 15)], policy({
    maxShiftHours: 6.75, breakDueAboveHours: 6, minBreakMinutes: 30,
  })), [
    { code: "break", shiftIndexes: [0], measured: 15, limit: 30 },
    { code: "shift-hours", shiftIndexes: [0], measured: 7, limit: 6.75 },
  ]);
});

test("[happy-1] an empty roster has no working-time violations", () => {
  assert.deepEqual(checkRoster([], policy({
    maxShiftHours: 1, maxWeekHours: 1, minRestMinutes: 660,
    breakDueAboveHours: 1, minBreakMinutes: 60, maxConsecutiveDays: 1,
  })), []);
});
