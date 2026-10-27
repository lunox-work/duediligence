/**
 * Reduces one issue read from Jira to the facts the selection rules test.
 * Pure: `now` is a parameter, nothing reads a clock.
 */

/** One issue link, seen from the issue being selected. */
export interface SelectionLink {
  readonly type: string;
  readonly direction: "inward" | "outward";
  readonly statusCategory: string;
}

/** A sprint the issue was in that has since closed. */
export interface SelectionClosedSprint {
  readonly startDate: string | null;
  readonly endDate: string | null;
}

/** A fix version the issue is planned for. */
export interface SelectionRelease {
  readonly name: string;
  readonly releaseDate: string | null;
  readonly released: boolean;
}

/** The fields of a Jira issue that selection reads. */
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

/** A priority name ranked: `"none"` when the priority is blank or missing. */
export type PriorityRank = "low" | "medium" | "high" | "none";

/** What the signals test: one issue reduced to plain facts as of `now`. */
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

/**
 * Ranks of the lowercase priority names; a non-blank name that is not a key
 * ranks `"high"`.
 */
export const PRIORITY_RANKS: Readonly<Record<string, PriorityRank>> = {
  lowest: "low",
  trivial: "low",
  low: "low",
  minor: "low",
  medium: "medium",
  normal: "medium",
};

/** Lowercase issue types that count as bugs. */
export const BUG_ISSUE_TYPES: readonly string[] = ["bug", "defect"];

/** Turns one issue read from Jira into `IssueFacts`, measuring from `now`. */
export function factsFor(_issue: SelectionIssue, _now: Date): IssueFacts {
  throw new Error("not implemented");
}
