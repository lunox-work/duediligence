/**
 * One of a worker's shifts: a start and an end as ISO 8601 date-times with a
 * UTC offset, such as "2026-03-02T09:00:00+08:00", and break minutes, 0 when
 * none.
 */
export interface Shift {
  start: string;
  end: string;
  breakMinutes: number;
}

/**
 * The working-time policy the deployment runs under.
 */
export interface Policy {
  /** The most hours per shift. */
  maxShiftHours: number;
  /** The most hours per week. */
  maxWeekHours: number;
  /** The fewest rest minutes between shifts. */
  minRestMinutes: number;
  /** The shift length in hours above which a break is due. */
  breakDueAboveHours: number;
  /** The fewest break minutes that break must have. */
  minBreakMinutes: number;
  /** The most days in a row. */
  maxConsecutiveDays: number;
}

/**
 * The code of a violation.
 */
export type ViolationCode =
  | "break"
  | "consecutive-days"
  | "overlap"
  | "rest"
  | "shift-hours"
  | "week-hours";

/**
 * One breach of the policy, with the shifts it concerns.
 *
 * Measured and limit are in the units the spec gives for each code:
 * "shift-hours", "week-hours", "rest" and "overlap" in hours, "break" in
 * minutes, "consecutive-days" in days. "overlap" has no limit.
 */
export interface Violation {
  code: ViolationCode;
  /** The indexes, as positions in the input, of the shifts concerned. */
  shiftIndexes: number[];
  measured: number;
  limit: number | null;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
// 1970-01-01 was a Thursday; the first Monday on or before it is 1969-12-29.
const MONDAY_EPOCH_MS = -3 * DAY_MS;

/** A shift parsed into instants, with the offset its start is written in. */
interface ParsedShift {
  index: number;
  startMs: number;
  endMs: number;
  /** The offset of the start, in milliseconds east of UTC. */
  offsetMs: number;
  breakMinutes: number;
}

/** Rounds away the floating-point noise of minute and hour arithmetic. */
function tidy(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

/** Reads the UTC offset a date-time is written with, or null when it has none. */
function parseOffsetMs(dateTime: string): number | null {
  const match = /(?:([zZ])|([+-])(\d{2}):?(\d{2}))$/.exec(dateTime.trim());
  if (!match) return null;
  if (match[1]) return 0;
  const sign = match[2] === "-" ? -1 : 1;
  return sign * (Number(match[3]) * 60 + Number(match[4])) * MINUTE_MS;
}

function parseShift(shift: Shift, index: number): ParsedShift {
  const startMs = Date.parse(shift.start);
  const endMs = Date.parse(shift.end);
  const offsetMs = parseOffsetMs(shift.start);
  if (Number.isNaN(startMs) || offsetMs === null || parseOffsetMs(shift.end) === null) {
    throw new Error(`Shift ${index} has a start not written as a date-time with a UTC offset`);
  }
  if (Number.isNaN(endMs)) {
    throw new Error(`Shift ${index} has an end not written as a date-time with a UTC offset`);
  }
  if (endMs <= startMs) {
    throw new Error(`Shift ${index} does not end after it starts`);
  }
  const breakMinutes = shift.breakMinutes;
  if (!Number.isFinite(breakMinutes) || breakMinutes < 0) {
    throw new Error(`Shift ${index} has a negative break`);
  }
  if (breakMinutes * MINUTE_MS > endMs - startMs) {
    throw new Error(`Shift ${index} has a break longer than the shift`);
  }
  return { index, startMs, endMs, offsetMs, breakMinutes };
}

function oneShiftViolations(shifts: ParsedShift[], policy: Policy): Violation[] {
  const violations: Violation[] = [];
  for (const s of shifts) {
    const lengthHours = (s.endMs - s.startMs) / HOUR_MS;
    const hours = tidy(lengthHours - s.breakMinutes / 60);
    if (hours > policy.maxShiftHours) {
      violations.push({
        code: "shift-hours",
        shiftIndexes: [s.index],
        measured: hours,
        limit: policy.maxShiftHours,
      });
    }
    if (lengthHours > policy.breakDueAboveHours && s.breakMinutes < policy.minBreakMinutes) {
      violations.push({
        code: "break",
        shiftIndexes: [s.index],
        measured: s.breakMinutes,
        limit: policy.minBreakMinutes,
      });
    }
  }
  return violations;
}

function restViolations(shifts: ParsedShift[], policy: Policy): Violation[] {
  const byStart = [...shifts].sort((a, b) => a.startMs - b.startMs || a.index - b.index);
  const violations: Violation[] = [];
  for (let i = 1; i < byStart.length; i++) {
    const earlier = byStart[i - 1]!;
    const later = byStart[i]!;
    const restMs = later.startMs - earlier.endMs;
    // Overlapping shifts have no rest between them; the overlap rule reports them.
    if (restMs < 0) continue;
    if (restMs < policy.minRestMinutes * MINUTE_MS) {
      violations.push({
        code: "rest",
        shiftIndexes: [earlier.index, later.index],
        measured: tidy(restMs / HOUR_MS),
        limit: tidy(policy.minRestMinutes / 60),
      });
    }
  }
  return violations;
}

function overlapViolations(shifts: ParsedShift[]): Violation[] {
  const violations: Violation[] = [];
  for (let i = 0; i < shifts.length; i++) {
    for (let j = i + 1; j < shifts.length; j++) {
      const a = shifts[i]!;
      const b = shifts[j]!;
      const overlapMs = Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs);
      if (overlapMs > 0) {
        violations.push({
          code: "overlap",
          shiftIndexes: [a.index, b.index],
          measured: tidy(overlapMs / HOUR_MS),
          limit: null,
        });
      }
    }
  }
  return violations;
}

function weekHoursViolations(shifts: ParsedShift[], policy: Policy): Violation[] {
  // Weeks are keyed by the number of their Monday since MONDAY_EPOCH_MS, read in
  // each shift's own start offset.
  const weeks = new Map<number, { minutes: number; indexes: Set<number> }>();
  for (const s of shifts) {
    const localStart = s.startMs + s.offsetMs;
    const localEnd = s.endMs + s.offsetMs;
    const totalMs = localEnd - localStart;
    let week = Math.floor((localStart - MONDAY_EPOCH_MS) / WEEK_MS);
    for (;;) {
      const weekStart = MONDAY_EPOCH_MS + week * WEEK_MS;
      const weekEnd = weekStart + WEEK_MS;
      if (weekStart >= localEnd) break;
      const inWeekMs = Math.min(localEnd, weekEnd) - Math.max(localStart, weekStart);
      if (inWeekMs > 0) {
        const minutes = inWeekMs / MINUTE_MS - (s.breakMinutes * inWeekMs) / totalMs;
        const entry = weeks.get(week) ?? { minutes: 0, indexes: new Set<number>() };
        entry.minutes += minutes;
        entry.indexes.add(s.index);
        weeks.set(week, entry);
      }
      week++;
    }
  }
  const violations: Violation[] = [];
  for (const week of [...weeks.keys()].sort((a, b) => a - b)) {
    const entry = weeks.get(week)!;
    const hours = tidy(entry.minutes / 60);
    if (hours > policy.maxWeekHours) {
      violations.push({
        code: "week-hours",
        shiftIndexes: [...entry.indexes].sort((a, b) => a - b),
        measured: hours,
        limit: policy.maxWeekHours,
      });
    }
  }
  return violations;
}

function consecutiveDaysViolations(shifts: ParsedShift[], policy: Policy): Violation[] {
  // Days are keyed by their number since 1970-01-01, read in each shift's own
  // start offset.
  const days = new Map<number, Set<number>>();
  for (const s of shifts) {
    const first = Math.floor((s.startMs + s.offsetMs) / DAY_MS);
    const last = Math.floor((s.endMs - 1 + s.offsetMs) / DAY_MS);
    for (let day = first; day <= last; day++) {
      const indexes = days.get(day) ?? new Set<number>();
      indexes.add(s.index);
      days.set(day, indexes);
    }
  }
  const sortedDays = [...days.keys()].sort((a, b) => a - b);
  const violations: Violation[] = [];
  let runStart = 0;
  for (let i = 1; i <= sortedDays.length; i++) {
    if (i < sortedDays.length && sortedDays[i] === sortedDays[i - 1]! + 1) continue;
    const run = sortedDays.slice(runStart, i);
    if (run.length > policy.maxConsecutiveDays) {
      const indexes = new Set<number>();
      for (const day of run) for (const index of days.get(day)!) indexes.add(index);
      violations.push({
        code: "consecutive-days",
        shiftIndexes: [...indexes].sort((a, b) => a - b),
        measured: run.length,
        limit: policy.maxConsecutiveDays,
      });
    }
    runStart = i;
  }
  return violations;
}

/**
 * Checks a worker's shifts against the policy and returns the violations,
 * ordered by their first shift index, then by code alphabetically.
 *
 * Throws an error naming the shift's index when a shift's end is at or before
 * its start, or its break is negative or longer than the shift.
 */
export function checkRoster(shifts: Shift[], policy: Policy): Violation[] {
  const parsed = shifts.map(parseShift);
  const violations = [
    ...oneShiftViolations(parsed, policy),
    ...restViolations(parsed, policy),
    ...overlapViolations(parsed),
    ...weekHoursViolations(parsed, policy),
    ...consecutiveDaysViolations(parsed, policy),
  ];
  // A stable sort keeps the weeks of one code and first index in week order.
  return violations.sort(
    (a, b) =>
      a.shiftIndexes[0]! - b.shiftIndexes[0]! ||
      (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
  );
}
