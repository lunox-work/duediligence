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

const DAY_MS = 86_400_000;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Milliseconds since the epoch, or null when `value` is missing or does not parse. */
function parseTime(value: string | null): number | null {
  if (value === null) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/** Whole days elapsed from `value` to `now`; 0 when missing, unparseable or in the future. */
function elapsedDays(value: string | null, now: Date): number {
  const time = parseTime(value);
  if (time === null) return 0;
  return Math.max(0, Math.floor((now.getTime() - time) / DAY_MS));
}

/** Midnight UTC of the calendar day `time` falls on. */
function utcDay(time: number): number {
  const date = new Date(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** UTC calendar days from `now` to `time`, negative when `time` is earlier. */
function calendarDaysUntil(time: number, now: Date): number {
  return Math.round((utcDay(time) - utcDay(now.getTime())) / DAY_MS);
}

/** The UTC month of the earliest closed sprint, with its year when not now's. */
function carriedSince(
  sprints: readonly SelectionClosedSprint[],
  now: Date,
): string | null {
  let earliest: number | null = null;
  for (const sprint of sprints) {
    const time = parseTime(sprint.startDate) ?? parseTime(sprint.endDate);
    if (time !== null && (earliest === null || time < earliest)) {
      earliest = time;
    }
  }
  if (earliest === null) return null;
  const date = new Date(earliest);
  const month = MONTHS[date.getUTCMonth()] as string;
  const year = date.getUTCFullYear();
  return year === now.getUTCFullYear() ? month : `${month} ${year}`;
}

/** The earliest-dated unreleased version due today or later; ties go to array order. */
function nextRelease(
  releases: readonly SelectionRelease[],
  now: Date,
): IssueFacts["release"] {
  let next: { readonly name: string; readonly time: number } | null = null;
  for (const release of releases) {
    if (release.released) continue;
    const time = parseTime(release.releaseDate);
    if (time === null || calendarDaysUntil(time, now) < 0) continue;
    if (next === null || time < next.time) next = { name: release.name, time };
  }
  if (next === null) return null;
  return { name: next.name, inDays: calendarDaysUntil(next.time, now) };
}

/** Turns one issue read from Jira into `IssueFacts`, measuring from `now`. */
export function factsFor(issue: SelectionIssue, now: Date): IssueFacts {
  const priorityName = issue.priority?.trim() || null;
  const priorityKey = priorityName?.toLowerCase();
  const due = parseTime(issue.dueDate);
  const linksOf = (type: string) =>
    issue.links.filter((link) => link.type.toLowerCase().includes(type));
  return {
    ageDays: elapsedDays(issue.created, now),
    daysSinceUpdate: elapsedDays(issue.updated, now),
    assigned: issue.assignee !== null,
    inSprint: issue.sprint !== null && issue.sprint.state !== "closed",
    closedSprintCount: issue.closedSprints.length,
    carriedSince: carriedSince(issue.closedSprints, now),
    votes: issue.votes ?? 0,
    watchers: issue.watchers ?? 0,
    duplicateLinks: linksOf("duplicate").filter(
      (link) => link.direction === "inward",
    ).length,
    blocksOpenCount: linksOf("block").filter(
      (link) => link.direction === "outward" && link.statusCategory !== "done",
    ).length,
    commentCount: issue.commentCount ?? null,
    priorityName,
    priorityRank:
      priorityKey === undefined
        ? "none"
        : Object.hasOwn(PRIORITY_RANKS, priorityKey)
          ? (PRIORITY_RANKS[priorityKey] as PriorityRank)
          : "high",
    isBug: BUG_ISSUE_TYPES.includes(issue.issueType.trim().toLowerCase()),
    dueInDays: due === null ? null : calendarDaysUntil(due, now),
    release: nextRelease(issue.releases, now),
  };
}
