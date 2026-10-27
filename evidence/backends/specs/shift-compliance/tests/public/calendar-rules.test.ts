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

function dayShift(day: number, hours = 8, breakMinutes = 0): Shift {
  const date = `2026-03-${String(day).padStart(2, "0")}`;
  return {
    start: `${date}T09:00:00+08:00`,
    end: `${date}T${String(9 + hours).padStart(2, "0")}:00:00+08:00`,
    breakMinutes,
  };
}

test("[boundary-1] all hours of a Sunday overnight shift belong to its starting week and day", () => {
  const shifts: Shift[] = [
    { start: "2026-03-08T22:00:00+08:00", end: "2026-03-09T06:00:00+08:00", breakMinutes: 0 },
    dayShift(8, 1),
  ];
  assert.deepEqual(
    checkRoster(shifts, policy({ maxWeekHours: 8, maxConsecutiveDays: 1 })),
    [{ code: "week-hours", shiftIndexes: [0, 1], measured: 9, limit: 8 }],
  );
});

test("[boundary-1] overnight shifts starting Sunday and Monday count as two days in separate weeks", () => {
  const shifts: Shift[] = [
    { start: "2026-03-08T22:00:00+08:00", end: "2026-03-09T06:00:00+08:00", breakMinutes: 0 },
    { start: "2026-03-09T22:00:00+08:00", end: "2026-03-10T06:00:00+08:00", breakMinutes: 0 },
  ];
  assert.deepEqual(
    checkRoster(shifts, policy({ maxWeekHours: 8, maxConsecutiveDays: 1 })),
    [{ code: "consecutive-days", shiftIndexes: [0, 1], measured: 2, limit: 1 }],
  );
});

test("[happy-4] six eight-hour shifts from Monday to Saturday exceed a forty-four-hour week", () => {
  assert.deepEqual(
    checkRoster([2, 3, 4, 5, 6, 7].map((day) => dayShift(day)), policy({ maxWeekHours: 44 })),
    [{ code: "week-hours", shiftIndexes: [0, 1, 2, 3, 4, 5], measured: 48, limit: 44 }],
  );
});

test("[happy-4] Sunday joins the preceding six shifts while the following Monday starts a new week", () => {
  assert.deepEqual(
    checkRoster([2, 3, 4, 5, 6, 7, 8, 9].map((day) => dayShift(day)), policy({ maxWeekHours: 44 })),
    [{ code: "week-hours", shiftIndexes: [0, 1, 2, 3, 4, 5, 6], measured: 56, limit: 44 }],
  );
});

test("[happy-4] exactly forty-four weekly hours is permitted", () => {
  const shifts = [2, 3, 4, 5, 6].map((day) => dayShift(day));
  shifts.push(dayShift(7, 4));
  assert.deepEqual(checkRoster(shifts, policy({ maxWeekHours: 44 })), []);
});

test("[happy-4] weekly hours subtract every shift's break", () => {
  assert.deepEqual(
    checkRoster([2, 3, 4, 5, 6, 7].map((day) => dayShift(day, 8, 30)), policy({ maxWeekHours: 44 })),
    [{ code: "week-hours", shiftIndexes: [0, 1, 2, 3, 4, 5], measured: 45, limit: 44 }],
  );
});

test("[boundary-2] Sunday at minus five and Monday at plus eight belong to separate weeks", () => {
  const shifts: Shift[] = [
    { start: "2026-03-08T23:30:00-05:00", end: "2026-03-09T07:30:00-05:00", breakMinutes: 0 },
    { start: "2026-03-09T00:30:00+08:00", end: "2026-03-09T08:30:00+08:00", breakMinutes: 0 },
  ];
  assert.deepEqual(checkRoster(shifts, policy({ maxWeekHours: 8 })), []);
});

test("[boundary-2] each offset-defined week gathers its own shifts using original input indexes", () => {
  const shifts: Shift[] = [
    { start: "2026-03-08T23:30:00-05:00", end: "2026-03-09T07:30:00-05:00", breakMinutes: 0 },
    { start: "2026-03-09T00:30:00+08:00", end: "2026-03-09T08:30:00+08:00", breakMinutes: 0 },
    { start: "2026-03-02T09:00:00-05:00", end: "2026-03-02T10:00:00-05:00", breakMinutes: 0 },
    dayShift(9, 1),
  ];
  assert.deepEqual(checkRoster(shifts, policy({ maxWeekHours: 8 })), [
    { code: "week-hours", shiftIndexes: [0, 2], measured: 9, limit: 8 },
    { code: "week-hours", shiftIndexes: [1, 3], measured: 9, limit: 8 },
  ]);
});

test("[happy-5] seven consecutive dates breach a six-day maximum even with unordered input", () => {
  const shifts = [5, 2, 8, 3, 7, 4, 6].map((day) => dayShift(day, 1));
  assert.deepEqual(checkRoster(shifts, policy({ maxConsecutiveDays: 6 })), [
    { code: "consecutive-days", shiftIndexes: [0, 1, 2, 3, 4, 5, 6], measured: 7, limit: 6 },
  ]);
});

test("[happy-5] six dates with a second shift on one date stay within the six-day limit", () => {
  const shifts = [2, 3, 4, 5, 6, 7].map((day) => dayShift(day, 1));
  shifts.push({ start: "2026-03-04T12:00:00+08:00", end: "2026-03-04T13:00:00+08:00", breakMinutes: 0 });
  assert.deepEqual(checkRoster(shifts, policy({ maxConsecutiveDays: 6 })), []);
});

test("[happy-5] an overlong run includes every shift while counting repeated dates only once", () => {
  const shifts = [2, 3, 4, 5, 6, 7, 8].map((day) => dayShift(day, 1));
  shifts.push({ start: "2026-03-04T12:00:00+08:00", end: "2026-03-04T13:00:00+08:00", breakMinutes: 0 });
  assert.deepEqual(checkRoster(shifts, policy({ maxConsecutiveDays: 6 })), [
    { code: "consecutive-days", shiftIndexes: [0, 1, 2, 3, 4, 5, 6, 7], measured: 7, limit: 6 },
  ]);
});

test("[happy-5] an empty day resets the consecutive-day count", () => {
  const shifts = [2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14].map((day) => dayShift(day, 1));
  assert.deepEqual(checkRoster(shifts, policy({ maxConsecutiveDays: 6 })), []);
});

test("[boundary-3] a nine-day run crossing a Monday boundary is reported once with every shift", () => {
  const shifts = [6, 7, 8, 9, 10, 11, 12, 13, 14].map((day) => dayShift(day, 1));
  assert.deepEqual(checkRoster(shifts, policy({ maxConsecutiveDays: 6 })), [
    { code: "consecutive-days", shiftIndexes: [0, 1, 2, 3, 4, 5, 6, 7, 8], measured: 9, limit: 6 },
  ]);
});

test("[boundary-3] one empty day separates two overlong runs into two reports", () => {
  const shifts = [2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16].map((day) => dayShift(day, 1));
  assert.deepEqual(checkRoster(shifts, policy({ maxConsecutiveDays: 6 })), [
    { code: "consecutive-days", shiftIndexes: [0, 1, 2, 3, 4, 5, 6], measured: 7, limit: 6 },
    { code: "consecutive-days", shiftIndexes: [7, 8, 9, 10, 11, 12, 13], measured: 7, limit: 6 },
  ]);
});
