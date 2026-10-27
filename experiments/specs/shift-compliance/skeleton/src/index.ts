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
  throw new Error("not implemented");
}
