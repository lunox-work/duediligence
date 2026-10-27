/** The named signals the category rules are built from. */

import type { IssueFacts } from "./facts.js";
import { signal, type Signal } from "./rules.js";

/** `"<count> <noun>"`, with the noun plural unless the count is exactly 1. */
function count(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

/** Throws a `RangeError` unless `value` is a finite, non-negative number. */
function threshold(name: string, value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `${name} threshold must be a non-negative finite number: ${String(value)}`,
    );
  }
  return value;
}

/** Nobody is assigned: `"unassigned"`. */
export const unassigned: Signal = signal(
  "unassigned",
  (facts) => !facts.assigned,
  () => "unassigned",
);

/** Not in a sprint now and never carried over one: `"never in a sprint"`. */
export const neverInSprint: Signal = signal(
  "never-in-sprint",
  (facts) => !facts.inSprint && facts.closedSprintCount === 0,
  () => "never in a sprint",
);

/** Not in a current sprint: `"not in a sprint"`. */
export const notInSprint: Signal = signal(
  "not-in-sprint",
  (facts) => !facts.inSprint,
  () => "not in a sprint",
);

/** The issue is a bug: `"a bug"`. */
export const bug: Signal = signal(
  "bug",
  (facts) => facts.isBug,
  () => "a bug",
);

/** Open at least `days` days. Throws a `RangeError` for a negative or non-finite threshold. */
export function openAtLeast(days: number): Signal {
  const n = threshold("openAtLeast", days);
  return signal(
    `open-at-least:${String(n)}`,
    (facts) => facts.ageDays >= n,
    (facts) => `open ${count(facts.ageDays, "day")}`,
  );
}

/** No update in at least `days` days. Throws a `RangeError` for a negative or non-finite threshold. */
export function quietAtLeast(days: number): Signal {
  const n = threshold("quietAtLeast", days);
  return signal(
    `quiet-at-least:${String(n)}`,
    (facts) => facts.daysSinceUpdate >= n,
    (facts) => `no update in ${count(facts.daysSinceUpdate, "day")}`,
  );
}

/** Carried over at least `sprints` closed sprints. Throws a `RangeError` for a negative or non-finite threshold. */
export function carriedAtLeast(sprints: number): Signal {
  const n = threshold("carriedAtLeast", sprints);
  return signal(
    `carried-at-least:${String(n)}`,
    (facts) => facts.closedSprintCount >= n,
    (facts) => {
      const carried = `carried over ${count(facts.closedSprintCount, "sprint")}`;
      return facts.carriedSince === null
        ? carried
        : `${carried} since ${facts.carriedSince.slice(0, 10)}`;
    },
  );
}

/** At least `votes` votes. Throws a `RangeError` for a negative or non-finite threshold. */
export function votesAtLeast(votes: number): Signal {
  const n = threshold("votesAtLeast", votes);
  return signal(
    `votes-at-least:${String(n)}`,
    (facts) => facts.votes >= n,
    (facts) => count(facts.votes, "vote"),
  );
}

/** At least `watchers` watchers. Throws a `RangeError` for a negative or non-finite threshold. */
export function watchersAtLeast(watchers: number): Signal {
  const n = threshold("watchersAtLeast", watchers);
  return signal(
    `watchers-at-least:${String(n)}`,
    (facts) => facts.watchers >= n,
    (facts) => count(facts.watchers, "watcher"),
  );
}

/** At least `links` duplicate links. Throws a `RangeError` for a negative or non-finite threshold. */
export function duplicatesAtLeast(links: number): Signal {
  const n = threshold("duplicatesAtLeast", links);
  return signal(
    `duplicates-at-least:${String(n)}`,
    (facts) => facts.duplicateLinks >= n,
    (facts) => count(facts.duplicateLinks, "duplicate"),
  );
}

/**
 * At least `comments` comments; never matches an unknown comment count.
 * Throws a `RangeError` for a negative or non-finite threshold.
 */
export function commentsAtLeast(comments: number): Signal {
  const n = threshold("commentsAtLeast", comments);
  return signal(
    `comments-at-least:${String(n)}`,
    (facts) => facts.commentCount !== null && facts.commentCount >= n,
    (facts) =>
      facts.commentCount === null ? null : count(facts.commentCount, "comment"),
  );
}

/** Blocks at least `tickets` open tickets. Throws a `RangeError` for a negative or non-finite threshold. */
export function blocksAtLeast(tickets: number): Signal {
  const n = threshold("blocksAtLeast", tickets);
  return signal(
    `blocks-at-least:${String(n)}`,
    (facts) => facts.blocksOpenCount >= n,
    (facts) => `blocks ${count(facts.blocksOpenCount, "open ticket")}`,
  );
}

/** The priority ranks each `priorityAtMost` rank admits. */
const RANKS_AT_MOST: Readonly<
  Record<"low" | "medium", readonly IssueFacts["priorityRank"][]>
> = Object.freeze({
  low: Object.freeze(["low"] as const),
  medium: Object.freeze(["low", "medium"] as const),
});

/** Priority ranked at most `rank`. Throws a `RangeError` for an unknown rank. */
export function priorityAtMost(rank: "low" | "medium"): Signal {
  if (!Object.hasOwn(RANKS_AT_MOST, rank)) {
    throw new RangeError(`Unknown priority rank: ${String(rank)}`);
  }
  const admitted = RANKS_AT_MOST[rank];
  return signal(
    `priority-at-most:${rank}`,
    (facts) => admitted.includes(facts.priorityRank),
    (facts) =>
      facts.priorityName === null ? null : `${facts.priorityName} priority`,
  );
}

/** `"due today"`, `"due in <n> day(s)"` or `"overdue by <n> day(s)"`. */
function dueClause(inDays: number): string {
  if (inDays === 0) return "due today";
  if (inDays > 0) return `due in ${count(inDays, "day")}`;
  return `overdue by ${count(-inDays, "day")}`;
}

/**
 * A due date or an unreleased version within `days` days, including overdue
 * ones; describes the nearer of the two. Throws a `RangeError` for a negative
 * or non-finite threshold.
 */
export function deadlineWithin(days: number): Signal {
  const n = threshold("deadlineWithin", days);
  return signal(
    `deadline-within:${String(n)}`,
    (facts) =>
      (facts.dueInDays !== null && facts.dueInDays <= n) ||
      (facts.release !== null && facts.release.inDays <= n),
    (facts) => {
      const { dueInDays, release } = facts;
      if (
        dueInDays !== null &&
        (release === null || dueInDays <= release.inDays)
      ) {
        return dueClause(dueInDays);
      }
      return release === null
        ? null
        : `release ${release.name} ${dueClause(release.inDays)}`;
    },
  );
}
