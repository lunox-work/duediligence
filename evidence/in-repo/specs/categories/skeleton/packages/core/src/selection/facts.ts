/**
 * Facts about one issue read from Jira: the pure reduction every selection
 * rule is evaluated against. Nothing here reads a clock; `now` is a parameter.
 */

/** One issue link, as read from Jira. */
export interface SelectionLink {
  readonly type: string;
  readonly direction: "inward" | "outward";
  readonly statusCategory: string;
}

/** A closed sprint the issue was part of. */
export interface SelectionClosedSprint {
  readonly startDate: string | null;
  readonly endDate: string | null;
}

/** A fix version (release) the issue is attached to. */
export interface SelectionRelease {
  readonly name: string;
  readonly releaseDate: string | null;
  readonly released: boolean;
}

/** One issue read from Jira, as `factsFor` takes it. */
export interface SelectionIssue {
  readonly assignee: string | null;
  readonly priority: string | null;
  readonly issueType: string;
  readonly created: string | null;
  readonly updated: string | null;
  readonly dueDate: string | null;
  readonly sprint: { readonly state: string } | null;
  readonly closedSprints: readonly SelectionClosedSprint[];
  readonly votes: number | null;
  readonly watchers: number | null;
  readonly commentCount?: number | null;
  readonly links: readonly SelectionLink[];
  readonly releases: readonly SelectionRelease[];
}

/** Where a priority name ranks; `"none"` for a missing or unknown priority. */
export type PriorityRank = "low" | "medium" | "high" | "none";

/** An issue reduced to the facts signals test and describe. */
export interface IssueFacts {
  readonly ageDays: number;
  readonly daysSinceUpdate: number;
  readonly assigned: boolean;
  readonly inSprint: boolean;
  readonly closedSprintCount: number;
  readonly carriedSince: string | null;
  readonly votes: number;
  readonly watchers: number;
  readonly duplicateLinks: number;
  readonly blocksOpenCount: number;
  readonly commentCount: number | null;
  readonly priorityName: string | null;
  readonly priorityRank: PriorityRank;
  readonly isBug: boolean;
  readonly dueInDays: number | null;
  readonly release: { readonly name: string; readonly inDays: number } | null;
}

/** Priority rank by trimmed, lowercased priority name. Frozen. */
export const PRIORITY_RANKS: Readonly<Record<string, PriorityRank>> =
  Object.freeze({
    highest: "high",
    high: "high",
    blocker: "high",
    critical: "high",
    major: "medium",
    medium: "medium",
    low: "low",
    lowest: "low",
    minor: "low",
    trivial: "low",
  });

/** Trimmed, lowercased issue types that count as a bug. Frozen. */
export const BUG_ISSUE_TYPES: readonly string[] = Object.freeze([
  "bug",
  "defect",
]);

/**
 * Reduces one issue to `IssueFacts`, measuring whole elapsed days from `now`.
 * Does not modify `issue`. Throws a `RangeError` when `now` is an invalid date.
 */
export function factsFor(_issue: SelectionIssue, _now: Date): IssueFacts {
  throw new Error("not implemented");
}
