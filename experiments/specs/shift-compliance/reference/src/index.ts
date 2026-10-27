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

/**
 * Checks a worker's shifts against the policy and returns the violations,
 * ordered by their first shift index, then by code alphabetically.
 *
 * Throws an error naming the shift's index when a shift's end is at or before
 * its start, or its break is negative or longer than the shift.
 */
export function checkRoster(shifts: Shift[], policy: Policy): Violation[] {
  const parsed = shifts.map(parseShift);
  const violations: Violation[] = [
    ...checkEachShift(parsed, policy),
    ...checkRestAndOverlap(parsed, policy),
    ...checkWeekHours(parsed, policy),
    ...checkConsecutiveDays(parsed, policy),
  ];
  // Array.prototype.sort is stable, so ties keep the order found.
  return violations.sort(
    (a, b) =>
      a.shiftIndexes[0] - b.shiftIndexes[0] ||
      (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
  );
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

interface ParsedShift {
  index: number;
  /** Start and end as epoch milliseconds. */
  start: number;
  end: number;
  breakMinutes: number;
  /** End minus start, in minutes. */
  spanMinutes: number;
  /** End minus start, minus the break, in minutes. */
  workMinutes: number;
  /** The calendar date of the start in its own offset, as days since the epoch. */
  day: number;
  /** The Monday of that day, as days since the epoch. */
  week: number;
}

const DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;

function parseShift(shift: Shift, index: number): ParsedShift {
  const startMatch = DATE_TIME.exec(shift.start);
  const start = Date.parse(shift.start);
  if (startMatch === null || Number.isNaN(start))
    throw new Error(`shift ${index}: start is not a date-time with an offset`);
  const end = Date.parse(shift.end);
  if (!DATE_TIME.test(shift.end) || Number.isNaN(end))
    throw new Error(`shift ${index}: end is not a date-time with an offset`);
  if (end <= start)
    throw new Error(`shift ${index}: end is at or before its start`);

  const spanMinutes = (end - start) / MINUTE_MS;
  const { breakMinutes } = shift;
  if (!Number.isFinite(breakMinutes) || breakMinutes < 0)
    throw new Error(`shift ${index}: break is negative`);
  if (breakMinutes > spanMinutes)
    throw new Error(`shift ${index}: break is longer than the shift`);

  const [, year, month, date] = startMatch;
  const localMidnight = Date.UTC(Number(year), Number(month) - 1, Number(date));
  const day = localMidnight / DAY_MS;
  const daysSinceMonday = (new Date(localMidnight).getUTCDay() + 6) % 7;

  return {
    index,
    start,
    end,
    breakMinutes,
    spanMinutes,
    workMinutes: spanMinutes - breakMinutes,
    day,
    week: day - daysSinceMonday,
  };
}

function checkEachShift(shifts: ParsedShift[], policy: Policy): Violation[] {
  const violations: Violation[] = [];
  for (const shift of shifts) {
    const hours = shift.workMinutes / 60;
    if (hours > policy.maxShiftHours)
      violations.push({
        code: "shift-hours",
        shiftIndexes: [shift.index],
        measured: hours,
        limit: policy.maxShiftHours,
      });
    if (
      shift.spanMinutes / 60 > policy.breakDueAboveHours &&
      shift.breakMinutes < policy.minBreakMinutes
    )
      violations.push({
        code: "break",
        shiftIndexes: [shift.index],
        measured: shift.breakMinutes,
        limit: policy.minBreakMinutes,
      });
  }
  return violations;
}

function checkRestAndOverlap(
  shifts: ParsedShift[],
  policy: Policy,
): Violation[] {
  const violations: Violation[] = [];
  const byStart = [...shifts].sort((a, b) => a.start - b.start || a.index - b.index);

  for (let i = 1; i < byStart.length; i++) {
    const previous = byStart[i - 1];
    const next = byStart[i];
    const restMinutes = (next.start - previous.end) / MINUTE_MS;
    if (restMinutes < policy.minRestMinutes)
      violations.push({
        code: "rest",
        shiftIndexes: ascending([previous.index, next.index]),
        measured: restMinutes / 60,
        limit: policy.minRestMinutes / 60,
      });
  }

  // A long shift can overlap several later ones, not only the next by start.
  for (let i = 0; i < byStart.length; i++) {
    for (let j = i + 1; j < byStart.length; j++) {
      const first = byStart[i];
      const second = byStart[j];
      if (second.start >= first.end) continue;
      const overlapMs = Math.min(first.end, second.end) - second.start;
      violations.push({
        code: "overlap",
        shiftIndexes: ascending([first.index, second.index]),
        measured: overlapMs / MINUTE_MS / 60,
        limit: null,
      });
    }
  }
  return violations;
}

function checkWeekHours(shifts: ParsedShift[], policy: Policy): Violation[] {
  const weeks = groupBy(shifts, (shift) => shift.week);
  const violations: Violation[] = [];
  for (const members of weeks.values()) {
    const minutes = members.reduce((sum, shift) => sum + shift.workMinutes, 0);
    const hours = minutes / 60;
    if (hours > policy.maxWeekHours)
      violations.push({
        code: "week-hours",
        shiftIndexes: ascending(members.map((shift) => shift.index)),
        measured: hours,
        limit: policy.maxWeekHours,
      });
  }
  return violations;
}

function checkConsecutiveDays(
  shifts: ParsedShift[],
  policy: Policy,
): Violation[] {
  const days = groupBy(shifts, (shift) => shift.day);
  const sortedDays = [...days.keys()].sort((a, b) => a - b);
  const violations: Violation[] = [];

  let runStart = 0;
  for (let i = 1; i <= sortedDays.length; i++) {
    if (i < sortedDays.length && sortedDays[i] === sortedDays[i - 1] + 1)
      continue;
    const run = sortedDays.slice(runStart, i);
    if (run.length > policy.maxConsecutiveDays)
      violations.push({
        code: "consecutive-days",
        shiftIndexes: ascending(
          run.flatMap((day) => days.get(day)!.map((shift) => shift.index)),
        ),
        measured: run.length,
        limit: policy.maxConsecutiveDays,
      });
    runStart = i;
  }
  return violations;
}

function groupBy<K>(
  shifts: ParsedShift[],
  key: (shift: ParsedShift) => K,
): Map<K, ParsedShift[]> {
  const groups = new Map<K, ParsedShift[]>();
  for (const shift of shifts) {
    const k = key(shift);
    const group = groups.get(k);
    if (group) group.push(shift);
    else groups.set(k, [shift]);
  }
  return groups;
}

function ascending(indexes: number[]): number[] {
  return indexes.sort((a, b) => a - b);
}
