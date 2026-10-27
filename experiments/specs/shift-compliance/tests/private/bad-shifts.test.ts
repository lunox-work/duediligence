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

const strict: Policy = {
  maxShiftHours: 2,
  maxWeekHours: 4,
  minRestMinutes: 1440,
  breakDueAboveHours: 1,
  minBreakMinutes: 60,
  maxConsecutiveDays: 1,
};

function shift(start: string, end: string, breakMinutes = 0): Shift {
  return { start, end, breakMinutes };
}

/** Accepts an error whose message names the given index. */
function namingIndex(index: number) {
  return (err: unknown): boolean =>
    err instanceof Error && new RegExp(`\\b${index}\\b`).test(err.message);
}

/** Good 4-hour shifts, one a day from 2 March 2026. */
function goodShifts(count: number): Shift[] {
  return Array.from({ length: count }, (_, i) => {
    const day = String(2 + i).padStart(2, "0");
    return shift(`2026-03-${day}T09:00:00+00:00`, `2026-03-${day}T13:00:00+00:00`);
  });
}

// Extends: [unhappy-2] a shift ending before it starts is refused with an error naming its index
test("[unhappy-2] a shift ending before it starts at index 0 of four is refused naming index 0", () => {
  const shifts = [
    shift("2026-03-20T17:00:00+00:00", "2026-03-20T09:00:00+00:00"),
    ...goodShifts(3),
  ];
  assert.throws(() => checkRoster(shifts, lenient), namingIndex(0));
});

// Extends: [unhappy-2] a shift ending before it starts is refused with an error naming its index
test("[unhappy-2] a shift ending before it starts at index 12 of fourteen is refused naming index 12", () => {
  const shifts = [
    ...goodShifts(12),
    shift("2026-03-25T17:00:00+00:00", "2026-03-25T09:00:00+00:00"),
    shift("2026-03-27T09:00:00+00:00", "2026-03-27T13:00:00+00:00"),
  ];
  assert.throws(() => checkRoster(shifts, lenient), namingIndex(12));
});

// Extends: [unhappy-2] a shift ending before it starts is refused with an error naming its index
test("[unhappy-2] the index named is the shift's input position, not its position by start", () => {
  // Earliest by start, fourth in the input.
  const shifts = [
    ...goodShifts(3),
    shift("2026-03-01T17:00:00+00:00", "2026-03-01T09:00:00+00:00"),
  ];
  assert.throws(() => checkRoster(shifts, lenient), namingIndex(3));
});

// Extends: [unhappy-2] a shift ending before it starts is refused with an error naming its index
test("[unhappy-2] a shift whose end is before its start as instants is refused, though its wall clock reads later", () => {
  const shifts = [
    ...goodShifts(2),
    // 12:00 in +05:00 is 07:00 UTC, two hours before the start.
    shift("2026-03-10T09:00:00+00:00", "2026-03-10T12:00:00+05:00"),
  ];
  assert.throws(() => checkRoster(shifts, lenient), namingIndex(2));
});

// Extends: [unhappy-2] a shift ending exactly when it starts is refused with an error naming its index
test("[unhappy-2] a shift ending at the same instant it starts, written in another offset, is refused", () => {
  const shifts = [
    ...goodShifts(4),
    // 14:00 in +05:00 is 09:00 UTC.
    shift("2026-03-10T09:00:00+00:00", "2026-03-10T14:00:00+05:00"),
  ];
  assert.throws(() => checkRoster(shifts, lenient), namingIndex(4));
});

// Extends: [unhappy-2] a shift ending before it starts is refused with an error naming its index
test("[unhappy-2] a roster that also breaches the policy is still refused rather than checked", () => {
  const shifts = [
    shift("2026-03-02T08:00:00+00:00", "2026-03-02T20:00:00+00:00"),
    shift("2026-03-03T17:00:00+00:00", "2026-03-03T09:00:00+00:00"),
    shift("2026-03-03T21:00:00+00:00", "2026-03-04T09:00:00+00:00"),
  ];
  assert.throws(() => checkRoster(shifts, strict), namingIndex(1));
});

// Extends: [unhappy-3] a 4-hour shift with a 300-minute break is refused with an error naming its index
test("[unhappy-3] a break one minute longer than its 4-hour shift is refused naming the shift's index", () => {
  const shifts = [
    ...goodShifts(4),
    shift("2026-03-10T09:00:00+00:00", "2026-03-10T13:00:00+00:00", 241),
    shift("2026-03-12T09:00:00+00:00", "2026-03-12T13:00:00+00:00"),
  ];
  assert.throws(() => checkRoster(shifts, lenient), namingIndex(4));
});

// Extends: [unhappy-3] a 4-hour shift with a 300-minute break is refused with an error naming its index
test("[unhappy-3] a break longer than the shift between instants is refused, though the wall clock shows a longer shift", () => {
  const shifts = [
    ...goodShifts(2),
    // 09:00 UTC to 15:00 in +05:00, which is 10:00 UTC: one hour.
    shift("2026-03-10T09:00:00+00:00", "2026-03-10T15:00:00+05:00", 90),
  ];
  assert.throws(() => checkRoster(shifts, lenient), namingIndex(2));
});

// Extends: [unhappy-3] a 4-hour shift with a 300-minute break is refused with an error naming its index
test("[unhappy-3] a break longer than a 4-hour shift across midnight is refused naming its index", () => {
  const shifts = [
    shift("2026-03-02T09:00:00+00:00", "2026-03-02T13:00:00+00:00"),
    shift("2026-03-03T22:00:00+00:00", "2026-03-04T02:00:00+00:00", 300),
    shift("2026-03-05T09:00:00+00:00", "2026-03-05T13:00:00+00:00"),
  ];
  assert.throws(() => checkRoster(shifts, lenient), namingIndex(1));
});

// Extends: [unhappy-3] a negative break is refused with an error naming its index
test("[unhappy-3] a negative break at index 0 is refused naming index 0", () => {
  const shifts = [
    shift("2026-03-20T09:00:00+00:00", "2026-03-20T13:00:00+00:00", -30),
    ...goodShifts(3),
  ];
  assert.throws(() => checkRoster(shifts, lenient), namingIndex(0));
});

// Extends: [unhappy-3] a negative break is refused with an error naming its index
test("[unhappy-3] a negative break at index 11 is refused naming index 11, even under a strict policy", () => {
  const shifts = [
    ...goodShifts(11),
    shift("2026-03-25T09:00:00+00:00", "2026-03-25T17:00:00+00:00", -60),
  ];
  assert.throws(() => checkRoster(shifts, strict), namingIndex(11));
});

// Extends: [unhappy-3] a 4-hour shift with a 300-minute break is refused with an error naming its index
test("[unhappy-3] a break exactly as long as the shift is not longer than it and is not refused", () => {
  const shifts = [
    ...goodShifts(2),
    shift("2026-03-10T09:00:00+00:00", "2026-03-10T13:00:00+00:00", 240),
  ];
  assert.deepEqual(checkRoster(shifts, lenient), []);
});
