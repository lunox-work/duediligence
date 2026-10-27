/** The named signals the categories are built from. */

import type { IssueFacts } from "./facts.js";
import { signal, type Signal } from "./rules.js";

/** `count` with `noun`, plural unless the count is exactly 1. */
function counted(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

/** No one is assigned. */
export const unassigned: Signal = signal(
  "unassigned",
  (facts) => !facts.assigned,
  () => "unassigned",
);

/** Not in a sprint now and never carried through one. */
export const neverInSprint: Signal = signal(
  "never-in-sprint",
  (facts) => !facts.inSprint && facts.closedSprintCount === 0,
  () => "never in a sprint",
);

/** Not in any current sprint. */
export const notInSprint: Signal = signal(
  "not-in-sprint",
  (facts) => !facts.inSprint,
  () => "not in any sprint",
);

/** The issue is a bug. */
export const bug: Signal = signal(
  "bug",
  (facts) => facts.isBug,
  (facts) =>
    facts.priorityName === null ? "bug" : `${facts.priorityName}-priority bug`,
);

/** Open for at least `days` days. */
export function openAtLeast(days: number): Signal {
  return signal(
    "open-at-least",
    (facts) => facts.ageDays >= days,
    (facts) => `open ${counted(facts.ageDays, "day")}`,
  );
}

/** No update for at least `days` days. */
export function quietAtLeast(days: number): Signal {
  return signal(
    "quiet-at-least",
    (facts) => facts.daysSinceUpdate >= days,
    (facts) => `no update in ${counted(facts.daysSinceUpdate, "day")}`,
  );
}

/** Carried over at least `sprints` closed sprints. */
export function carriedAtLeast(sprints: number): Signal {
  return signal(
    "carried-at-least",
    (facts) => facts.closedSprintCount >= sprints,
    (facts) => {
      const carried = `carried over ${counted(facts.closedSprintCount, "sprint")}`;
      return facts.carriedSince === null
        ? carried
        : `${carried} since ${facts.carriedSince}`;
    },
  );
}

/** At least `votes` votes. */
export function votesAtLeast(votes: number): Signal {
  return signal(
    "votes-at-least",
    (facts) => facts.votes >= votes,
    (facts) => counted(facts.votes, "vote"),
  );
}

/** At least `watchers` watchers. */
export function watchersAtLeast(watchers: number): Signal {
  return signal(
    "watchers-at-least",
    (facts) => facts.watchers >= watchers,
    (facts) => counted(facts.watchers, "watcher"),
  );
}

/** At least `links` duplicates linked. */
export function duplicatesAtLeast(links: number): Signal {
  return signal(
    "duplicates-at-least",
    (facts) => facts.duplicateLinks >= links,
    (facts) => `${counted(facts.duplicateLinks, "duplicate")} linked`,
  );
}

/** At least `comments` comments; never matches an unknown comment count. */
export function commentsAtLeast(comments: number): Signal {
  return signal(
    "comments-at-least",
    (facts) => facts.commentCount !== null && facts.commentCount >= comments,
    (facts) => counted(facts.commentCount ?? 0, "comment"),
  );
}

/** Blocks at least `tickets` open tickets. */
export function blocksAtLeast(tickets: number): Signal {
  return signal(
    "blocks-at-least",
    (facts) => facts.blocksOpenCount >= tickets,
    (facts) => `blocks ${counted(facts.blocksOpenCount, "open ticket")}`,
  );
}

/** Priority ranked at most `rank`; never matches an unset priority. */
export function priorityAtMost(rank: "low" | "medium"): Signal {
  return signal(
    `priority-at-most-${rank}`,
    (facts) =>
      facts.priorityRank === "low" ||
      (rank === "medium" && facts.priorityRank === "medium"),
    (facts) =>
      facts.priorityName === null
        ? "priority unset"
        : `priority ${facts.priorityName}`,
  );
}

/** A due date or a release from 0 to `days` days ahead. */
export function deadlineWithin(days: number): Signal {
  const within = (inDays: number | null): inDays is number =>
    inDays !== null && inDays >= 0 && inDays <= days;
  const dueIn = (facts: IssueFacts): number | null =>
    within(facts.dueInDays) ? facts.dueInDays : null;
  const releaseIn = (facts: IssueFacts): IssueFacts["release"] =>
    facts.release !== null && within(facts.release.inDays)
      ? facts.release
      : null;
  return signal(
    "deadline-within",
    (facts) => dueIn(facts) !== null || releaseIn(facts) !== null,
    (facts) => {
      // The nearer of the two inside the window; a tie goes to the due date.
      const due = dueIn(facts);
      const release = releaseIn(facts);
      if (release !== null && (due === null || release.inDays < due)) {
        return release.inDays === 0
          ? `release ${release.name} today`
          : `release ${release.name} in ${counted(release.inDays, "day")}`;
      }
      return due === null || due === 0
        ? "due today"
        : `due in ${counted(due, "day")}`;
    },
  );
}
