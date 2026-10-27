/** The named signals the category rules are built from. */

import type { Signal } from "./rules.js";

/** Nobody is assigned: `"unassigned"`. */
export const unassigned: Signal = {
  id: "unassigned",
  test: () => {
    throw new Error("not implemented");
  },
  describe: () => {
    throw new Error("not implemented");
  },
};

/** Not in a sprint now and never carried over one: `"never in a sprint"`. */
export const neverInSprint: Signal = {
  id: "never-in-sprint",
  test: () => {
    throw new Error("not implemented");
  },
  describe: () => {
    throw new Error("not implemented");
  },
};

/** Not in a current sprint: `"not in a sprint"`. */
export const notInSprint: Signal = {
  id: "not-in-sprint",
  test: () => {
    throw new Error("not implemented");
  },
  describe: () => {
    throw new Error("not implemented");
  },
};

/** The issue is a bug: `"a bug"`. */
export const bug: Signal = {
  id: "bug",
  test: () => {
    throw new Error("not implemented");
  },
  describe: () => {
    throw new Error("not implemented");
  },
};

/** Open at least `days` days. Throws a `RangeError` for a negative or non-finite threshold. */
export function openAtLeast(_days: number): Signal {
  throw new Error("not implemented");
}

/** No update in at least `days` days. Throws a `RangeError` for a negative or non-finite threshold. */
export function quietAtLeast(_days: number): Signal {
  throw new Error("not implemented");
}

/** Carried over at least `sprints` closed sprints. Throws a `RangeError` for a negative or non-finite threshold. */
export function carriedAtLeast(_sprints: number): Signal {
  throw new Error("not implemented");
}

/** At least `votes` votes. Throws a `RangeError` for a negative or non-finite threshold. */
export function votesAtLeast(_votes: number): Signal {
  throw new Error("not implemented");
}

/** At least `watchers` watchers. Throws a `RangeError` for a negative or non-finite threshold. */
export function watchersAtLeast(_watchers: number): Signal {
  throw new Error("not implemented");
}

/** At least `links` duplicate links. Throws a `RangeError` for a negative or non-finite threshold. */
export function duplicatesAtLeast(_links: number): Signal {
  throw new Error("not implemented");
}

/**
 * At least `comments` comments; never matches an unknown comment count.
 * Throws a `RangeError` for a negative or non-finite threshold.
 */
export function commentsAtLeast(_comments: number): Signal {
  throw new Error("not implemented");
}

/** Blocks at least `tickets` open tickets. Throws a `RangeError` for a negative or non-finite threshold. */
export function blocksAtLeast(_tickets: number): Signal {
  throw new Error("not implemented");
}

/** Priority ranked at most `rank`. Throws a `RangeError` for an unknown rank. */
export function priorityAtMost(_rank: "low" | "medium"): Signal {
  throw new Error("not implemented");
}

/**
 * A due date or an unreleased version within `days` days, including overdue
 * ones; describes the nearer of the two. Throws a `RangeError` for a negative
 * or non-finite threshold.
 */
export function deadlineWithin(_days: number): Signal {
  throw new Error("not implemented");
}
