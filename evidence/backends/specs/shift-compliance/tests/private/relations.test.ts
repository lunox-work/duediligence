import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRoster, type Policy, type Shift, type Violation } from "../../src/index.js";

function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    maxShiftHours: 1000, maxWeekHours: 10000, minRestMinutes: 0,
    breakDueAboveHours: 1000, minBreakMinutes: 0, maxConsecutiveDays: 1000,
    ...overrides,
  };
}

function shift(start: string, end: string, breakMinutes = 0): Shift {
  return { start: `2026-04-01T${start}+00:00`, end: `2026-04-01T${end}+00:00`, breakMinutes };
}

// Whether an overlap also emits rest is unspecified; retain every other result.
function withoutRest(violations: Violation[]): Violation[] {
  return violations.filter((violation: Violation) => violation.code !== "rest");
}

// Extends public: "nine hours of rest breaches eleven hours even when the later shift is input first".
test("[happy-3] several unordered shifts retain fractional rest values and a changed minutes limit", () => {
  assert.deepEqual(checkRoster([
    shift("04:45:00", "05:45:00"),
    { start: "2026-04-01T07:45:00+05:30", end: "2026-04-01T08:45:00+05:30", breakMinutes: 30 },
    shift("08:45:00", "09:45:00"),
    { start: "2026-03-31T20:00:00-04:00", end: "2026-03-31T22:00:00-04:00", breakMinutes: 60 },
  ], policy({ minRestMinutes: 450 })), [
    { code: "rest", shiftIndexes: [0, 2], measured: 3, limit: 7.5 },
    { code: "rest", shiftIndexes: [1, 0], measured: 1.5, limit: 7.5 },
    { code: "rest", shiftIndexes: [3, 1], measured: 0.25, limit: 7.5 },
  ]);
});

// Extends public: "exactly eleven hours of rest measured across different offsets is permitted".
test("[happy-3] exactly seven and a half hours of rest is allowed across nonintegral offsets", () => {
  assert.deepEqual(checkRoster([
    { start: "2026-03-02T23:30:00+05:45", end: "2026-03-03T01:30:00+05:45", breakMinutes: 0 },
    { start: "2026-03-02T23:45:00-03:30", end: "2026-03-03T00:45:00-03:30", breakMinutes: 0 },
  ], policy({ minRestMinutes: 450 })), []);
});

// Extends public: "rest uses only neighboring starts and reports violations by first input index".
test("[happy-3] five scrambled shifts report only consecutive starts even when distant pairs would fail", () => {
  assert.deepEqual(checkRoster([
    shift("04:00:00", "05:00:00"),
    shift("08:00:00", "09:00:00"),
    shift("00:00:00", "01:00:00"),
    shift("06:00:00", "07:00:00"),
    shift("02:00:00", "03:00:00"),
  ], policy({ minRestMinutes: 600 })), [
    { code: "rest", shiftIndexes: [0, 3], measured: 1, limit: 10 },
    { code: "rest", shiftIndexes: [2, 4], measured: 1, limit: 10 },
    { code: "rest", shiftIndexes: [3, 1], measured: 1, limit: 10 },
    { code: "rest", shiftIndexes: [4, 0], measured: 1, limit: 10 },
  ]);
});

test("[happy-3] a rest gap one second short is not rounded up to the policy", () => {
  assert.deepEqual(checkRoster([
    shift("00:00:00", "01:00:00"),
    shift("08:29:59", "09:29:59"),
  ], policy({ minRestMinutes: 450 })), [
    { code: "rest", shiftIndexes: [0, 1], measured: 26999 / 3600, limit: 7.5 },
  ]);
});

// Extends public: "overlapping shifts retain their other breaches and violations sort by index then code".
test("[unhappy-1] a fractional overlap coexists with every other rule and output ordering", () => {
  const result = checkRoster([
    { start: "2026-03-03T22:00:00+00:00", end: "2026-03-04T05:00:00+00:00", breakMinutes: 15 },
    { start: "2026-03-04T04:30:00+00:00", end: "2026-03-04T10:30:00+00:00", breakMinutes: 0 },
  ], policy({
    maxShiftHours: 5.5, maxWeekHours: 12, minRestMinutes: 90,
    breakDueAboveHours: 5, minBreakMinutes: 30, maxConsecutiveDays: 1,
  }));
  assert.deepEqual(withoutRest(result), [
    { code: "break", shiftIndexes: [0], measured: 15, limit: 30 },
    { code: "consecutive-days", shiftIndexes: [0, 1], measured: 2, limit: 1 },
    { code: "overlap", shiftIndexes: [0, 1], measured: 0.5, limit: null },
    { code: "shift-hours", shiftIndexes: [0], measured: 6.75, limit: 5.5 },
    { code: "week-hours", shiftIndexes: [0, 1], measured: 12.75, limit: 12 },
    { code: "break", shiftIndexes: [1], measured: 0, limit: 30 },
    { code: "shift-hours", shiftIndexes: [1], measured: 6, limit: 5.5 },
  ]);
});

// Extends public: "touching shifts do not overlap and have zero hours of rest".
test("[unhappy-1] touching instants across offsets give zero rest with chronological reversed indexes", () => {
  assert.deepEqual(checkRoster([
    { start: "2026-03-03T00:00:00+05:45", end: "2026-03-03T01:00:00+05:45", breakMinutes: 0 },
    { start: "2026-03-02T18:45:00+01:00", end: "2026-03-02T19:15:00+01:00", breakMinutes: 0 },
  ], policy({ minRestMinutes: 45 })), [
    { code: "rest", shiftIndexes: [1, 0], measured: 0, limit: 0.75 },
  ]);
});

test("[unhappy-1] touching shifts also satisfy a zero minimum rest policy", () => {
  assert.deepEqual(checkRoster([
    shift("10:00:00", "11:00:00"),
    shift("09:00:00", "10:00:00"),
  ], policy()), []);
});

test("[unhappy-1] fractional overlap measures elapsed intersection without subtracting either break", () => {
  assert.deepEqual(withoutRest(checkRoster([
    shift("09:00:00", "10:15:00", 60),
    shift("09:43:30", "11:00:00", 60),
  ], policy())), [
    { code: "overlap", shiftIndexes: [0, 1], measured: 1890 / 3600, limit: null },
  ]);
});

test("[unhappy-1] two separated overlap pairs both report using input indexes rather than sorted positions", () => {
  assert.deepEqual(withoutRest(checkRoster([
    shift("15:00:00", "17:00:00"),
    shift("09:00:00", "11:00:00"),
    shift("16:00:00", "18:00:00"),
    shift("10:00:00", "12:00:00"),
  ], policy())), [
    { code: "overlap", shiftIndexes: [0, 2], measured: 1, limit: null },
    { code: "overlap", shiftIndexes: [1, 3], measured: 1, limit: null },
  ]);
});

test("[happy-3] even a break filling a shift does not add to the rest after its end", () => {
  assert.deepEqual(checkRoster([
    shift("09:00:00", "11:00:00", 120),
    shift("11:30:00", "12:30:00"),
  ], policy({ minRestMinutes: 60 })), [
    { code: "rest", shiftIndexes: [0, 1], measured: 0.5, limit: 1 },
  ]);
});

test("[unhappy-1] a contained shift overlaps only for its own duration while both shifts add weekly hours", () => {
  assert.deepEqual(withoutRest(checkRoster([
    shift("09:00:00", "17:00:00"),
    shift("11:00:00", "12:00:00"),
  ], policy({ maxWeekHours: 8.5 }))), [
    { code: "overlap", shiftIndexes: [0, 1], measured: 1, limit: null },
    { code: "week-hours", shiftIndexes: [0, 1], measured: 9, limit: 8.5 },
  ]);
});

test("[unhappy-1] overlap is based on absolute instants even when written clock times have the opposite order", () => {
  assert.deepEqual(withoutRest(checkRoster([
    { start: "2026-04-01T10:00:00+05:45", end: "2026-04-01T12:00:00+05:45", breakMinutes: 0 },
    { start: "2026-04-01T00:15:00-05:00", end: "2026-04-01T01:45:00-05:00", breakMinutes: 0 },
  ], policy())), [
    { code: "overlap", shiftIndexes: [0, 1], measured: 1, limit: null },
  ]);
});

test("[happy-3] rest sorts alphabetically with per-shift breaches after earlier-index weekly results", () => {
  assert.deepEqual(checkRoster([
    shift("14:30:00", "20:30:00"),
    shift("09:00:00", "14:00:00", 15),
  ], policy({
    maxShiftHours: 4, maxWeekHours: 10, minRestMinutes: 120,
    breakDueAboveHours: 4, minBreakMinutes: 30,
  })), [
    { code: "break", shiftIndexes: [0], measured: 0, limit: 30 },
    { code: "shift-hours", shiftIndexes: [0], measured: 6, limit: 4 },
    { code: "week-hours", shiftIndexes: [0, 1], measured: 10.75, limit: 10 },
    { code: "break", shiftIndexes: [1], measured: 15, limit: 30 },
    { code: "rest", shiftIndexes: [1, 0], measured: 0.5, limit: 2 },
    { code: "shift-hours", shiftIndexes: [1], measured: 4.75, limit: 4 },
  ]);
});
