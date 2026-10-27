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

const DAY_MS = 86_400_000;

/** Milliseconds since the epoch, or null when `value` is missing or unparseable. */
function parseTime(value: string | null): number | null {
  if (value === null) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/** Whole days elapsed from `value` to `now`; 0 when missing, unparseable or in the future. */
function elapsedDays(value: string | null, now: number): number | null {
  const time = parseTime(value);
  if (time === null) return null;
  return Math.max(0, Math.floor((now - time) / DAY_MS));
}

/** The UTC midnight of a `YYYY-MM-DD` prefix, or null when it is not a real date. */
function calendarDay(value: string | null): number | null {
  if (value === null) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.slice(0, 10));
  if (match === null) return null;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return time;
}

/** UTC calendar days from `today` to `value`'s date, negative when past; null when unparseable. */
function daysUntil(value: string | null, today: number): number | null {
  const day = calendarDay(value);
  return day === null ? null : Math.round((day - today) / DAY_MS);
}

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

/** The earliest closed sprint's `startDate ?? endDate`, verbatim; null when none parse. */
function carriedSinceOf(
  sprints: readonly SelectionClosedSprint[],
): string | null {
  let earliest: { readonly value: string; readonly time: number } | null = null;
  for (const sprint of sprints) {
    const value = sprint.startDate ?? sprint.endDate;
    const time = parseTime(value);
    if (value === null || time === null) continue;
    if (earliest === null || time < earliest.time) earliest = { value, time };
  }
  return earliest === null ? null : earliest.value;
}

/** The unreleased version with the earliest parseable release date; ties go to array order. */
function nextRelease(
  releases: readonly SelectionRelease[],
  today: number,
): IssueFacts["release"] {
  let next: { readonly name: string; readonly inDays: number } | null = null;
  for (const release of releases) {
    if (release.released) continue;
    const inDays = daysUntil(release.releaseDate, today);
    if (inDays === null) continue;
    if (next === null || inDays < next.inDays) {
      next = { name: release.name, inDays };
    }
  }
  return next;
}

/**
 * Reduces one issue to `IssueFacts`, measuring whole elapsed days from `now`.
 * Does not modify `issue`. Throws a `RangeError` when `now` is an invalid date.
 */
export function factsFor(issue: SelectionIssue, now: Date): IssueFacts {
  const nowTime = now.getTime();
  if (Number.isNaN(nowTime)) throw new RangeError("Invalid date: now");
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  const ageDays = elapsedDays(issue.created, nowTime) ?? 0;
  const priorityName = issue.priority?.trim() || null;
  const priorityKey = priorityName === null ? null : priorityName.toLowerCase();
  let duplicateLinks = 0;
  let blocksOpenCount = 0;
  for (const link of issue.links) {
    const type = normalized(link.type);
    if (type === "duplicate") duplicateLinks += 1;
    if (
      type === "blocks" &&
      link.direction === "outward" &&
      normalized(link.statusCategory) !== "done"
    ) {
      blocksOpenCount += 1;
    }
  }

  return {
    ageDays,
    daysSinceUpdate: elapsedDays(issue.updated, nowTime) ?? ageDays,
    assigned: issue.assignee !== null && issue.assignee.trim() !== "",
    inSprint:
      issue.sprint !== null && issue.sprint.state.toLowerCase() !== "closed",
    closedSprintCount: issue.closedSprints.length,
    carriedSince: carriedSinceOf(issue.closedSprints),
    votes: issue.votes ?? 0,
    watchers: issue.watchers ?? 0,
    duplicateLinks,
    blocksOpenCount,
    commentCount: issue.commentCount ?? null,
    priorityName,
    priorityRank:
      priorityKey !== null && Object.hasOwn(PRIORITY_RANKS, priorityKey)
        ? (PRIORITY_RANKS[priorityKey] ?? "none")
        : "none",
    isBug: BUG_ISSUE_TYPES.includes(normalized(issue.issueType)),
    dueInDays: daysUntil(issue.dueDate, today),
    release: nextRelease(issue.releases, today),
  };
}
