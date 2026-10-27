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

function shift(end: string, breakMinutes: number): Shift {
  return { start: "2026-03-02T09:00:00+08:00", end, breakMinutes };
}

test("[happy-1] an eleven-hour shift with a half-hour break measures 10.5 hours", () => {
  assert.deepEqual(
    checkRoster([shift("2026-03-02T20:00:00+08:00", 30)], policy({ maxShiftHours: 10 })),
    [{ code: "shift-hours", shiftIndexes: [0], measured: 10.5, limit: 10 }],
  );
});

test("[happy-1] exactly ten working hours after subtracting the break is permitted", () => {
  assert.deepEqual(
    checkRoster([shift("2026-03-02T20:00:00+08:00", 60)], policy({ maxShiftHours: 10 })),
    [],
  );
});

test("[happy-2] an eight-hour shift with a twenty-minute break breaches the break minimum", () => {
  assert.deepEqual(
    checkRoster(
      [shift("2026-03-02T17:00:00+08:00", 20)],
      policy({ breakDueAboveHours: 6, minBreakMinutes: 30 }),
    ),
    [{ code: "break", shiftIndexes: [0], measured: 20, limit: 30 }],
  );
});

test("[happy-2] exactly six elapsed hours needs no break", () => {
  assert.deepEqual(
    checkRoster(
      [shift("2026-03-02T15:00:00+08:00", 0)],
      policy({ breakDueAboveHours: 6, minBreakMinutes: 30 }),
    ),
    [],
  );
});

test("[happy-2] break eligibility uses elapsed hours even when net hours equal six", () => {
  assert.deepEqual(
    checkRoster(
      [shift("2026-03-02T15:20:00+08:00", 20)],
      policy({ breakDueAboveHours: 6, minBreakMinutes: 30 }),
    ),
    [{ code: "break", shiftIndexes: [0], measured: 20, limit: 30 }],
  );
});

test("[happy-2] a break exactly meeting the minimum is permitted on a long shift", () => {
  assert.deepEqual(
    checkRoster(
      [shift("2026-03-02T17:00:00+08:00", 30)],
      policy({ breakDueAboveHours: 6, minBreakMinutes: 30 }),
    ),
    [],
  );
});
