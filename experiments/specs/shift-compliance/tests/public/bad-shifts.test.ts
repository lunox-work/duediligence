import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRoster } from "../../src/index.js";
import type { Policy, Shift } from "../../src/index.js";

const lenient: Policy = {
  maxShiftHours: 24,
  maxWeekHours: 168,
  minRestMinutes: 0,
  breakDueAboveHours: 24,
  minBreakMinutes: 0,
  maxConsecutiveDays: 100,
};

function shift(start: string, end: string, breakMinutes = 0): Shift {
  return { start, end, breakMinutes };
}

/** Accepts an error whose message names the given index. */
function namingIndex(index: number) {
  return (err: unknown): boolean =>
    err instanceof Error && new RegExp(`\\b${index}\\b`).test(err.message);
}

const good = [
  shift("2026-03-02T09:00:00+00:00", "2026-03-02T13:00:00+00:00"),
  shift("2026-03-03T09:00:00+00:00", "2026-03-03T13:00:00+00:00"),
];

test("[unhappy-2] a shift ending before it starts is refused with an error naming its index", () => {
  const shifts = [
    ...good,
    shift("2026-03-04T17:00:00+00:00", "2026-03-04T09:00:00+00:00"),
  ];
  assert.throws(() => checkRoster(shifts, lenient), namingIndex(2));
});

test("[unhappy-2] a shift ending exactly when it starts is refused with an error naming its index", () => {
  const shifts = [
    ...good,
    shift("2026-03-04T09:00:00+00:00", "2026-03-04T09:00:00+00:00"),
  ];
  assert.throws(() => checkRoster(shifts, lenient), namingIndex(2));
});

test("[unhappy-3] a 4-hour shift with a 300-minute break is refused with an error naming its index", () => {
  const shifts = [
    ...good,
    shift("2026-03-04T09:00:00+00:00", "2026-03-04T13:00:00+00:00", 300),
  ];
  assert.throws(() => checkRoster(shifts, lenient), namingIndex(2));
});

test("[unhappy-3] a negative break is refused with an error naming its index", () => {
  const shifts = [
    ...good,
    shift("2026-03-04T09:00:00+00:00", "2026-03-04T13:00:00+00:00", -1),
  ];
  assert.throws(() => checkRoster(shifts, lenient), namingIndex(2));
});
