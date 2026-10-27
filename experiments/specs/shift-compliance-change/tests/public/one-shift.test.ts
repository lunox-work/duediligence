import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRoster } from "../../src/index.js";
import type { Policy, Shift, Violation, ViolationCode } from "../../src/index.js";

// A policy no roster in these tests breaches unless a test tightens it.
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

function withCode(violations: Violation[], code: ViolationCode): Violation[] {
  return violations.filter((v) => v.code === code);
}

test("[happy-1] a shift longer than the maximum is a shift-hours violation measured net of its break", () => {
  const policy: Policy = { ...lenient, maxShiftHours: 10 };
  const shifts = [shift("2026-03-02T09:00:00+00:00", "2026-03-02T20:00:00+00:00", 30)];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "shift-hours"), [
    { code: "shift-hours", shiftIndexes: [0], measured: 10.5, limit: 10 },
  ]);
});

test("[happy-1] a shift measuring exactly the maximum hours is not a violation", () => {
  const policy: Policy = { ...lenient, maxShiftHours: 10 };
  const shifts = [shift("2026-03-02T09:00:00+00:00", "2026-03-02T19:30:00+00:00", 30)];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "shift-hours"), []);
});

test("[happy-2] a long shift with too short a break is a break violation in minutes", () => {
  const policy: Policy = { ...lenient, breakDueAboveHours: 6, minBreakMinutes: 30 };
  const shifts = [shift("2026-03-02T09:00:00+00:00", "2026-03-02T17:00:00+00:00", 20)];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "break"), [
    { code: "break", shiftIndexes: [0], measured: 20, limit: 30 },
  ]);
});

test("[happy-2] a shift of exactly the break threshold needs no break", () => {
  const policy: Policy = { ...lenient, breakDueAboveHours: 6, minBreakMinutes: 30 };
  const shifts = [shift("2026-03-02T09:00:00+00:00", "2026-03-02T15:00:00+00:00", 0)];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "break"), []);
});

test("[happy-2] the break rule measures the shift length before the break is taken off", () => {
  const policy: Policy = { ...lenient, breakDueAboveHours: 6, minBreakMinutes: 30 };
  // 6.25 hours from start to end, 5.9 hours once the break is taken off.
  const shifts = [shift("2026-03-02T09:00:00+00:00", "2026-03-02T15:15:00+00:00", 21)];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "break"), [
    { code: "break", shiftIndexes: [0], measured: 21, limit: 30 },
  ]);
});

test("[boundary-1] a shift from 22:00 to 06:00 works on the day it starts and the next", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 1 };
  const shifts = [shift("2026-03-02T22:00:00+00:00", "2026-03-03T06:00:00+00:00")];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), [
    { code: "consecutive-days", shiftIndexes: [0], measured: 2, limit: 1 },
  ]);
});

test("[boundary-1] a shift from 20:00 to 04:00 two days later works on three days and is measured whole", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 1, maxShiftHours: 24 };
  const shifts = [shift("2026-03-02T20:00:00+00:00", "2026-03-04T04:00:00+00:00")];
  const violations = checkRoster(shifts, policy);
  assert.deepEqual(withCode(violations, "consecutive-days"), [
    { code: "consecutive-days", shiftIndexes: [0], measured: 3, limit: 1 },
  ]);
  assert.deepEqual(withCode(violations, "shift-hours"), [
    { code: "shift-hours", shiftIndexes: [0], measured: 32, limit: 24 },
  ]);
});

test("[boundary-1] a shift ending exactly at 00:00 does not work on the day that begins then", () => {
  const policy: Policy = { ...lenient, maxConsecutiveDays: 1 };
  const shifts = [shift("2026-03-02T16:00:00+00:00", "2026-03-03T00:00:00+00:00")];
  assert.deepEqual(withCode(checkRoster(shifts, policy), "consecutive-days"), []);
});
