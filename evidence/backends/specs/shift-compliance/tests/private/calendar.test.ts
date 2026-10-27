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

function on(date: string, hours = 1, breakMinutes = 0, startHour = 9): Shift {
  const start = `${date}T${String(startHour).padStart(2, "0")}:00:00+00:00`;
  return {
    start,
    end: new Date(Date.parse(start) + hours * 3600000).toISOString().replace("Z", "+00:00"),
    breakMinutes,
  };
}

// Extends public: "all hours of a Sunday overnight shift belong to its starting week and day".
test("[boundary-1] a month-ending Sunday overnight shift keeps net hours in its start week and creates no Monday", () => {
  assert.deepEqual(checkRoster([
    { start: "2026-05-31T23:30:00-04:00", end: "2026-06-01T04:30:00-04:00", breakMinutes: 30 },
    { start: "2026-05-31T08:00:00-04:00", end: "2026-05-31T09:00:00-04:00", breakMinutes: 0 },
    on("2026-06-02"),
  ], policy({ maxWeekHours: 5, maxConsecutiveDays: 1 })), [
    { code: "week-hours", shiftIndexes: [0, 1], measured: 5.5, limit: 5 },
  ]);
});

// Extends public: "overnight shifts starting Sunday and Monday count as two days in separate weeks".
test("[boundary-1] overnight shifts across the first Monday of a year occupy two start days and weeks", () => {
  assert.deepEqual(checkRoster([
    { start: "2027-01-03T23:30:00+05:45", end: "2027-01-04T03:30:00+05:45", breakMinutes: 0 },
    { start: "2027-01-04T23:30:00+05:45", end: "2027-01-05T03:30:00+05:45", breakMinutes: 0 },
  ], policy({ maxWeekHours: 4, maxConsecutiveDays: 1 })), [
    { code: "consecutive-days", shiftIndexes: [0, 1], measured: 2, limit: 1 },
  ]);
});

test("[boundary-1] a shift spanning several midnights contributes only its single start day and week", () => {
  assert.deepEqual(checkRoster([
    { start: "2026-12-31T23:00:00+00:00", end: "2027-01-03T01:00:00+00:00", breakMinutes: 120 },
    on("2027-01-04"),
  ], policy({ maxWeekHours: 48, maxConsecutiveDays: 1 })), []);
});

// Extends public: "six eight-hour shifts from Monday to Saturday exceed a forty-four-hour week".
test("[happy-4] eight shifts on four dates aggregate at a fractional weekly maximum", () => {
  assert.deepEqual(checkRoster([
    on("2026-04-09", 2.5, 0, 8),
    on("2026-04-06", 3.5, 0, 13),
    on("2026-04-07", 2.5, 0, 8),
    on("2026-04-08", 3.5, 0, 13),
    on("2026-04-06", 2.5, 0, 8),
    on("2026-04-09", 3.5, 0, 13),
    on("2026-04-08", 2.5, 0, 8),
    on("2026-04-07", 3.5, 0, 13),
  ], policy({ maxWeekHours: 23.5 })), [
    { code: "week-hours", shiftIndexes: [0, 1, 2, 3, 4, 5, 6, 7], measured: 24, limit: 23.5 },
  ]);
});

// Extends public: "Sunday joins the preceding six shifts while the following Monday starts a new week".
test("[happy-4] an unordered Sunday in January joins its December Monday but the following Monday does not", () => {
  assert.deepEqual(checkRoster([
    on("2027-01-03", 3),
    on("2027-01-04", 4),
    on("2026-12-29", 5),
    on("2026-12-28", 6),
    on("2027-01-02", 7),
  ], policy({ maxWeekHours: 20 })), [
    { code: "week-hours", shiftIndexes: [0, 2, 3, 4], measured: 21, limit: 20 },
  ]);
});

// Extends public: "exactly forty-four weekly hours is permitted".
test("[happy-4] fractional weekly equality is allowed separately in two weeks", () => {
  assert.deepEqual(checkRoster([
    on("2026-04-06", 6.25),
    on("2026-04-07", 5.5),
    on("2026-04-08", 3.75),
    on("2026-04-12", 2.5),
    on("2026-04-13", 18),
  ], policy({ maxWeekHours: 18 })), []);
});

// Extends public: "weekly hours subtract every shift's break".
test("[happy-4] unequal breaks and a wholly break-filled shift all participate in weekly aggregation", () => {
  assert.deepEqual(checkRoster([
    on("2026-04-06", 9, 45),
    on("2026-04-07", 8, 90),
    on("2026-04-08", 10, 15),
    on("2026-04-09", 8, 480),
  ], policy({ maxWeekHours: 24.25 })), [
    { code: "week-hours", shiftIndexes: [0, 1, 2, 3], measured: 24.5, limit: 24.25 },
  ]);
});

test("[happy-4] separate overfull weeks sort by their first input index and an exact-limit week is omitted", () => {
  assert.deepEqual(checkRoster([
    on("2026-03-23", 2),
    on("2026-03-03", 3),
    on("2026-03-17", 4),
    on("2026-03-02", 5),
    on("2026-03-16", 6),
    on("2026-03-24", 7),
  ], policy({ maxWeekHours: 8 })), [
    { code: "week-hours", shiftIndexes: [0, 5], measured: 9, limit: 8 },
    { code: "week-hours", shiftIndexes: [2, 4], measured: 10, limit: 8 },
  ]);
});

// Extends public: "Sunday at minus five and Monday at plus eight belong to separate weeks".
test("[boundary-2] Sunday and Monday at extreme opposite offsets stay in separate weeks across a year", () => {
  assert.deepEqual(checkRoster([
    { start: "2026-01-04T23:30:00-11:00", end: "2026-01-05T00:30:00-11:00", breakMinutes: 0 },
    { start: "2026-01-05T00:30:00+14:00", end: "2026-01-05T01:30:00+14:00", breakMinutes: 0 },
  ], policy({ maxWeekHours: 1 })), []);
});

// Extends public: "each offset-defined week gathers its own shifts using original input indexes".
test("[boundary-2] weeks crossing a year gather mixed-offset dates without changing input indexes", () => {
  assert.deepEqual(checkRoster([
    { start: "2026-01-04T23:30:00-11:00", end: "2026-01-05T01:30:00-11:00", breakMinutes: 0 },
    { start: "2026-01-05T00:30:00+14:00", end: "2026-01-05T03:30:00+14:00", breakMinutes: 0 },
    { start: "2025-12-30T09:00:00+05:45", end: "2025-12-30T11:00:00+05:45", breakMinutes: 0 },
    { start: "2026-01-07T09:00:00-03:30", end: "2026-01-07T12:00:00-03:30", breakMinutes: 0 },
  ], policy({ maxWeekHours: 3 })), [
    { code: "week-hours", shiftIndexes: [0, 2], measured: 4, limit: 3 },
    { code: "week-hours", shiftIndexes: [1, 3], measured: 6, limit: 3 },
  ]);
});

test("[boundary-2] different offsets do not split shifts whose written start dates belong to the same week", () => {
  assert.deepEqual(checkRoster([
    { start: "2026-03-08T09:00:00+14:00", end: "2026-03-08T10:00:00+14:00", breakMinutes: 0 },
    { start: "2026-03-02T09:00:00-12:00", end: "2026-03-02T10:00:00-12:00", breakMinutes: 0 },
  ], policy({ maxWeekHours: 1.5 })), [
    { code: "week-hours", shiftIndexes: [0, 1], measured: 2, limit: 1.5 },
  ]);
});

// Extends public: "seven consecutive dates breach a six-day maximum even with unordered input".
test("[happy-5] five unordered dates across a month exceed a changed three-day maximum", () => {
  const shifts = ["2026-03-02", "2026-02-27", "2026-03-03", "2026-02-28", "2026-03-01"].map((date) => on(date));
  assert.deepEqual(checkRoster(shifts, policy({ maxConsecutiveDays: 3 })), [
    { code: "consecutive-days", shiftIndexes: [0, 1, 2, 3, 4], measured: 5, limit: 3 },
  ]);
});

// Extends public: "six dates with a second shift on one date stay within the six-day limit".
test("[happy-5] several repeated dates across a month remain at the changed day limit", () => {
  assert.deepEqual(checkRoster([
    on("2026-06-01", 1, 0, 13),
    on("2026-05-31", 1, 0, 9),
    on("2026-06-02", 1, 0, 9),
    on("2026-06-01", 1, 0, 9),
    on("2026-05-31", 1, 0, 13),
  ], policy({ maxConsecutiveDays: 3 })), []);
});

// Extends public: "an overlong run includes every shift while counting repeated dates only once".
test("[happy-5] a run with multiple duplicate dates reports all indexes and only distinct start days", () => {
  assert.deepEqual(checkRoster([
    on("2026-05-01", 1, 0, 13),
    on("2026-04-29", 1, 0, 9),
    on("2026-05-02", 1, 0, 9),
    on("2026-04-30", 1, 0, 13),
    on("2026-05-01", 1, 0, 9),
    on("2026-04-30", 1, 0, 9),
    on("2026-04-29", 1, 0, 13),
  ], policy({ maxConsecutiveDays: 2 })), [
    { code: "consecutive-days", shiftIndexes: [0, 1, 2, 3, 4, 5, 6], measured: 4, limit: 2 },
  ]);
});

// Extends public: "an empty day resets the consecutive-day count".
test("[happy-5] unordered short runs each at their limit restart after single missing dates", () => {
  const dates = ["2026-03-08", "2026-03-02", "2026-03-04", "2026-03-01", "2026-03-07", "2026-03-05"];
  assert.deepEqual(checkRoster(dates.map((date) => on(date)), policy({ maxConsecutiveDays: 2 })), []);
});

// Extends public: "a nine-day run crossing a Monday boundary is reported once with every shift".
test("[boundary-3] a scrambled forty-day run crosses a year and many weeks but produces just one full report", () => {
  const dates = Array.from({ length: 40 }, (_, day) =>
    new Date(Date.UTC(2026, 11, 15 + day)).toISOString().slice(0, 10));
  const shifts = dates.reverse().map((date) => on(date));
  shifts.push(on("2026-12-20", 1, 0, 13), on("2027-01-01", 1, 0, 13), on("2027-01-20", 1, 0, 13));
  const reordered = [...shifts.slice(11), ...shifts.slice(0, 11)];
  assert.deepEqual(checkRoster(reordered, policy({ maxConsecutiveDays: 4 })), [
    { code: "consecutive-days", shiftIndexes: Array.from({ length: 43 }, (_, index) => index), measured: 40, limit: 4 },
  ]);
});

// Extends public: "one empty day separates two overlong runs into two reports".
test("[boundary-3] three interleaved overlong runs report separately and sort by first input index", () => {
  const days = [7, 12, 1, 5, 11, 3, 9, 14, 2, 6, 13, 8];
  const shifts = days.map((day) => on(`2026-06-${String(day).padStart(2, "0")}`));
  assert.deepEqual(checkRoster(shifts, policy({ maxConsecutiveDays: 2 })), [
    { code: "consecutive-days", shiftIndexes: [0, 3, 6, 9, 11], measured: 5, limit: 2 },
    { code: "consecutive-days", shiftIndexes: [1, 4, 7, 10], measured: 4, limit: 2 },
    { code: "consecutive-days", shiftIndexes: [2, 5, 8], measured: 3, limit: 2 },
  ]);
});

test("[happy-5] the same written start date counts once even when its instants fall on different UTC days", () => {
  assert.deepEqual(checkRoster([
    { start: "2026-03-02T00:15:00+14:00", end: "2026-03-02T01:15:00+14:00", breakMinutes: 0 },
    { start: "2026-03-02T23:15:00-12:00", end: "2026-03-03T00:15:00-12:00", breakMinutes: 0 },
  ], policy({ maxConsecutiveDays: 1 })), []);
});

test("[happy-5] consecutive written dates count as two days even when both starts share a UTC date", () => {
  assert.deepEqual(checkRoster([
    { start: "2026-03-02T23:00:00-10:00", end: "2026-03-03T00:00:00-10:00", breakMinutes: 0 },
    { start: "2026-03-03T01:00:00+01:00", end: "2026-03-03T02:00:00+01:00", breakMinutes: 0 },
  ], policy({ maxConsecutiveDays: 1 })), [
    { code: "consecutive-days", shiftIndexes: [0, 1], measured: 2, limit: 1 },
  ]);
});

test("[boundary-1] an overnight shift with a changed end offset still belongs to its written start date", () => {
  assert.deepEqual(checkRoster([
    { start: "2026-03-08T23:30:00-03:30", end: "2026-03-09T10:00:00+02:00", breakMinutes: 0 },
    { start: "2026-03-08T08:00:00+04:00", end: "2026-03-08T09:00:00+04:00", breakMinutes: 0 },
  ], policy({ maxWeekHours: 5.5, maxConsecutiveDays: 1 })), [
    { code: "week-hours", shiftIndexes: [0, 1], measured: 6, limit: 5.5 },
  ]);
});

test("[happy-5] zero net working hours do not remove the shift start days from a run", () => {
  assert.deepEqual(checkRoster([
    on("2026-04-01", 1, 60),
    on("2026-04-02", 2, 120),
  ], policy({ maxWeekHours: 0.1, maxConsecutiveDays: 1 })), [
    { code: "consecutive-days", shiftIndexes: [0, 1], measured: 2, limit: 1 },
  ]);
});

test("[boundary-3] leap day connects February and March into one full run", () => {
  assert.deepEqual(checkRoster([
    on("2028-03-01"), on("2028-02-28"), on("2028-02-29"),
  ], policy({ maxConsecutiveDays: 2 })), [
    { code: "consecutive-days", shiftIndexes: [0, 1, 2], measured: 3, limit: 2 },
  ]);
});

test("[happy-4] weekly totals one second above the limit are not rounded down", () => {
  assert.deepEqual(checkRoster([
    on("2026-04-06"),
    { start: "2026-04-07T09:00:00+00:00", end: "2026-04-07T10:30:01+00:00", breakMinutes: 0 },
  ], policy({ maxWeekHours: 2.5 })), [
    { code: "week-hours", shiftIndexes: [0, 1], measured: 9001 / 3600, limit: 2.5 },
  ]);
});
