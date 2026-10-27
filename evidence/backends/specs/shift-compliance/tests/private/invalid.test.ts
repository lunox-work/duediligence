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

function rejectAt(index: number, invalid: Shift, overrides: Partial<Policy> = {}): void {
  const shifts: Shift[] = Array.from({ length: 14 }, (_, position) => ({
    start: `2026-08-${String(position + 1).padStart(2, "0")}T09:00:00+00:00`,
    end: `2026-08-${String(position + 1).padStart(2, "0")}T10:00:00+00:00`,
    breakMinutes: 0,
  }));
  shifts[index] = invalid;
  assert.throws(
    () => checkRoster(shifts, policy(overrides)),
    (error: unknown) => error instanceof Error && new RegExp(`\\b${index}\\b`).test(error.message),
  );
}

// Extends public: "an end before its start is rejected with the original shift index".
test("[unhappy-2] absolute end before start is rejected at a two-digit original index despite later wall time", () => {
  rejectAt(10, {
    start: "2026-07-04T08:00:00+00:00", end: "2026-07-04T09:00:00+02:00", breakMinutes: 0,
  });
});

// Extends public: "equal start and end instants in different offsets are rejected".
test("[unhappy-2] identical date-times are rejected at a nonchronological original index", () => {
  rejectAt(7, {
    start: "2026-07-01T09:00:00+05:45", end: "2026-07-01T09:00:00+05:45", breakMinutes: 0,
  });
});

test("[unhappy-2] offset changes can reverse apparently increasing times by more than two hours", () => {
  rejectAt(0, {
    start: "2026-03-03T00:15:00-12:00", end: "2026-03-03T23:45:00+14:00", breakMinutes: 0,
  });
});

// Extends public: "a three-hundred-minute break in a four-hour shift is rejected with its index".
test("[unhappy-3] a break one second longer than its short shift names a two-digit original index", () => {
  rejectAt(12, {
    start: "2026-07-01T09:00:00+00:00", end: "2026-07-01T09:00:59+00:00", breakMinutes: 1,
  });
});

// Extends public: "a break just below zero is rejected with its index".
test("[unhappy-3] a fractional negative break is invalid at an index other than two", () => {
  rejectAt(5, {
    start: "2026-07-01T09:00:00+00:00", end: "2026-07-01T10:00:00+00:00", breakMinutes: -0.25,
  });
});

// Extends public: "a break equal to the whole shift duration is valid and leaves zero working hours".
test("[unhappy-3] whole-duration breaks across different offsets leave both shift and weekly hours at zero", () => {
  assert.deepEqual(checkRoster([
    { start: "2026-08-01T22:00:00+05:45", end: "2026-08-01T20:15:00+03:30", breakMinutes: 30 },
    { start: "2026-08-02T09:00:00+00:00", end: "2026-08-02T10:00:00+00:00", breakMinutes: 60 },
  ], policy({ maxShiftHours: 0.1, maxWeekHours: 0.1 })), []);
});

test("[unhappy-3] break validation compares with absolute elapsed time rather than written clock duration", () => {
  rejectAt(4, {
    start: "2026-07-01T09:00:00+00:00", end: "2026-07-01T11:00:00+01:00", breakMinutes: 90,
  });
});

test("[unhappy-2] a positive one-second shift is valid at matching fractional hour limits", () => {
  assert.deepEqual(checkRoster([
    { start: "2026-08-01T09:00:00+00:00", end: "2026-08-01T09:00:01+00:00", breakMinutes: 0 },
  ], policy({ maxShiftHours: 1 / 3600, maxWeekHours: 1 / 3600 })), []);
});

test("[unhappy-3] a large negative break is rejected at index zero", () => {
  rejectAt(0, {
    start: "2026-07-01T09:00:00+00:00", end: "2026-07-01T13:00:00+00:00", breakMinutes: -300,
  });
});

test("[unhappy-2] a final invalid duration throws even when earlier shifts already breach the policy", () => {
  rejectAt(13, {
    start: "2026-08-14T11:00:00+00:00", end: "2026-08-14T10:59:59+00:00", breakMinutes: 0,
  }, { maxShiftHours: 0.5, maxWeekHours: 2 });
});

test("[unhappy-3] a final excessive break throws even when earlier shifts already breach the policy", () => {
  rejectAt(13, {
    start: "2026-08-14T11:00:00+00:00", end: "2026-08-14T12:00:00+00:00", breakMinutes: 61,
  }, { maxShiftHours: 0.5, maxWeekHours: 2 });
});
