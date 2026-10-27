import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRoster } from "../../src/index.js";
import type { Policy, Shift } from "../../src/index.js";

const lenient: Policy = {
  maxShiftHours: 48,
  maxWeekHours: 168,
  minRestMinutes: 0,
  breakDueAboveHours: 48,
  minBreakMinutes: 0,
  maxConsecutiveDays: 365,
};

function shift(start: string, end: string, breakMinutes = 0): Shift {
  return { start, end, breakMinutes };
}

// Three valid shifts, so the bad one appended after them is at index 3.
const valid: Shift[] = [
  shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00"),
  shift("2026-03-03T09:00:00+00:00", "2026-03-03T17:00:00+00:00"),
  shift("2026-03-04T09:00:00+00:00", "2026-03-04T17:00:00+00:00"),
];

function assertRefusesIndex3(bad: Shift): void {
  assert.throws(
    () => checkRoster([...valid, bad], lenient),
    (err: unknown) => {
      if (!(err instanceof Error)) return false;
      assert.match(err.message, /(?<!\d)3(?!\d)/);
      return true;
    },
  );
}

test("[unhappy-2] a shift ending before it starts is refused, naming its index", () => {
  assertRefusesIndex3(shift("2026-03-05T17:00:00+00:00", "2026-03-05T09:00:00+00:00"));
});

test("[unhappy-2] a shift ending exactly when it starts is refused, naming its index", () => {
  assertRefusesIndex3(shift("2026-03-05T09:00:00+00:00", "2026-03-05T09:00:00+00:00"));
});

test("[unhappy-3] a break longer than the shift is refused, naming the shift's index", () => {
  assertRefusesIndex3(shift("2026-03-05T09:00:00+00:00", "2026-03-05T13:00:00+00:00", 300));
});

test("[unhappy-3] a negative break is refused, naming the shift's index", () => {
  assertRefusesIndex3(shift("2026-03-05T09:00:00+00:00", "2026-03-05T13:00:00+00:00", -1));
});
