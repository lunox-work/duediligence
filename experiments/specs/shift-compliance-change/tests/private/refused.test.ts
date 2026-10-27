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

// Valid 09:00 to 17:00 shifts from 2026-03-10 on, one a day, in UTC.
function validShifts(count: number): Shift[] {
  return Array.from({ length: count }, (_, i) => {
    const day = String(10 + i).padStart(2, "0");
    return shift(`2026-03-${day}T09:00:00+00:00`, `2026-03-${day}T17:00:00+00:00`);
  });
}

// The roster with the bad shift inserted at the given index.
function withBadAt(index: number, bad: Shift, total: number): Shift[] {
  const shifts = validShifts(total - 1);
  shifts.splice(index, 0, bad);
  return shifts;
}

function assertRefusesIndex(shifts: Shift[], index: number): void {
  assert.throws(
    () => checkRoster(shifts, lenient),
    (err: unknown) => {
      if (!(err instanceof Error)) return false;
      assert.match(err.message, new RegExp(`(?<!\\d)${index}(?!\\d)`));
      return true;
    },
  );
}

// Extends "a shift ending before it starts is refused, naming its index": the first shift.
test("[unhappy-2] a first shift ending before it starts is refused, naming index 0", () => {
  const bad = shift("2026-03-02T17:00:00+00:00", "2026-03-02T09:00:00+00:00");
  assertRefusesIndex(withBadAt(0, bad, 4), 0);
});

// Extends "a shift ending before it starts is refused ...": a two-digit index, and a bad shift
// that would be first if the shifts were sorted by start.
test("[unhappy-2] a shift ending before it starts is refused by its input index, not its sorted position", () => {
  const bad = shift("2026-03-02T17:00:00+00:00", "2026-03-02T09:00:00+00:00");
  assertRefusesIndex(withBadAt(12, bad, 14), 12);
});

// Extends "a shift ending before it starts is refused ...": the end is written later than the
// start but in an offset that makes it the earlier instant.
test("[unhappy-2] an end written later than the start but earlier as an instant is refused", () => {
  const bad = shift("2026-03-05T09:00:00+00:00", "2026-03-05T10:00:00+05:00");
  assertRefusesIndex(withBadAt(2, bad, 5), 2);
});

// Extends "a shift ending exactly when it starts is refused ...": the same instant written in
// two offsets.
test("[unhappy-2] an end at the same instant as the start, written in another offset, is refused", () => {
  const bad = shift("2026-03-05T09:00:00+00:00", "2026-03-05T14:00:00+05:00");
  assertRefusesIndex(withBadAt(1, bad, 3), 1);
});

// Extends "a shift ending exactly when it starts is refused ...": one minute after is not.
test("[unhappy-2] a shift ending one minute after it starts is not refused", () => {
  const shifts = [shift("2026-03-05T09:00:00+00:00", "2026-03-05T09:01:00+00:00")];
  assert.deepEqual(checkRoster(shifts, lenient), []);
});

// Extends "a break longer than the shift is refused, naming the shift's index": one minute
// longer, at another index.
test("[unhappy-3] a break one minute longer than the shift is refused, naming its index", () => {
  const bad = shift("2026-03-05T09:00:00+00:00", "2026-03-05T13:00:00+00:00", 241);
  assertRefusesIndex(withBadAt(5, bad, 7), 5);
});

// Extends "a break longer than the shift is refused ...": the shift's length is measured
// between instants, not between the written clock times.
test("[unhappy-3] a break longer than a shift whose ends are written in different offsets is refused", () => {
  const bad = shift("2026-03-05T09:00:00-05:00", "2026-03-05T18:00:00Z", 300);
  assertRefusesIndex(withBadAt(0, bad, 2), 0);
});

// Extends "a negative break is refused ...": another index and another value.
test("[unhappy-3] a negative break is refused, naming its two-digit index", () => {
  const bad = shift("2026-03-05T09:00:00+00:00", "2026-03-05T17:00:00+00:00", -30);
  assertRefusesIndex(withBadAt(10, bad, 11), 10);
});

// Extends "a break longer than the shift is refused ...": a break exactly as long as the shift
// is not longer than it.
test("[unhappy-3] a break exactly as long as the shift is not refused", () => {
  const shifts = [shift("2026-03-05T09:00:00+00:00", "2026-03-05T13:00:00+00:00", 240)];
  assert.deepEqual(checkRoster(shifts, lenient), []);
});
