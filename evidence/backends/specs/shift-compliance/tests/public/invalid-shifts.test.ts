import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRoster, type Policy, type Shift } from "../../src/index.js";

function policy(): Policy {
  return {
    maxShiftHours: 24,
    maxWeekHours: 168,
    minRestMinutes: 0,
    breakDueAboveHours: 24,
    minBreakMinutes: 0,
    maxConsecutiveDays: 31,
  };
}

function withInvalidThirdShift(invalid: Shift): Shift[] {
  return [
    { start: "2026-03-02T09:00:00+08:00", end: "2026-03-02T10:00:00+08:00", breakMinutes: 0 },
    { start: "2026-03-03T09:00:00+08:00", end: "2026-03-03T10:00:00+08:00", breakMinutes: 0 },
    invalid,
  ];
}

function assertThirdShiftRejected(invalid: Shift): void {
  assert.throws(
    () => checkRoster(withInvalidThirdShift(invalid), policy()),
    (error: unknown) => error instanceof Error && /\b2\b/.test(error.message),
  );
}

test("[unhappy-2] an end before its start is rejected with the original shift index", () => {
  assertThirdShiftRejected({
    start: "2026-03-01T09:00:00+08:00",
    end: "2026-03-01T08:00:00+08:00",
    breakMinutes: 0,
  });
});

test("[unhappy-2] equal start and end instants in different offsets are rejected", () => {
  assertThirdShiftRejected({
    start: "2026-03-01T09:00:00+08:00",
    end: "2026-03-01T02:00:00+01:00",
    breakMinutes: 0,
  });
});

test("[unhappy-3] a three-hundred-minute break in a four-hour shift is rejected with its index", () => {
  assertThirdShiftRejected({
    start: "2026-03-01T09:00:00+08:00",
    end: "2026-03-01T13:00:00+08:00",
    breakMinutes: 300,
  });
});

test("[unhappy-3] a break just below zero is rejected with its index", () => {
  assertThirdShiftRejected({
    start: "2026-03-01T09:00:00+08:00",
    end: "2026-03-01T13:00:00+08:00",
    breakMinutes: -1,
  });
});

test("[unhappy-3] a break equal to the whole shift duration is valid and leaves zero working hours", () => {
  assert.deepEqual(checkRoster([
    { start: "2026-03-01T09:00:00+08:00", end: "2026-03-01T13:00:00+08:00", breakMinutes: 240 },
  ], { ...policy(), maxShiftHours: 1, maxWeekHours: 1 }), []);
});
