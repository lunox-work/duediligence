/** The named signals the categories are built from. */

import type { Signal } from "./rules.js";

/** No one is assigned. */
export const unassigned: Signal = {
  id: "unassigned",
  test: () => {
    throw new Error("not implemented");
  },
  describe: () => {
    throw new Error("not implemented");
  },
};

/** Not in a sprint now and never carried through one. */
export const neverInSprint: Signal = {
  id: "never-in-sprint",
  test: () => {
    throw new Error("not implemented");
  },
  describe: () => {
    throw new Error("not implemented");
  },
};

/** Not in any current sprint. */
export const notInSprint: Signal = {
  id: "not-in-sprint",
  test: () => {
    throw new Error("not implemented");
  },
  describe: () => {
    throw new Error("not implemented");
  },
};

/** The issue is a bug. */
export const bug: Signal = {
  id: "bug",
  test: () => {
    throw new Error("not implemented");
  },
  describe: () => {
    throw new Error("not implemented");
  },
};

/** Open for at least `days` days. */
export function openAtLeast(_days: number): Signal {
  throw new Error("not implemented");
}

/** No update for at least `days` days. */
export function quietAtLeast(_days: number): Signal {
  throw new Error("not implemented");
}

/** Carried over at least `sprints` closed sprints. */
export function carriedAtLeast(_sprints: number): Signal {
  throw new Error("not implemented");
}

/** At least `votes` votes. */
export function votesAtLeast(_votes: number): Signal {
  throw new Error("not implemented");
}

/** At least `watchers` watchers. */
export function watchersAtLeast(_watchers: number): Signal {
  throw new Error("not implemented");
}

/** At least `links` duplicates linked. */
export function duplicatesAtLeast(_links: number): Signal {
  throw new Error("not implemented");
}

/** At least `comments` comments; never matches an unknown comment count. */
export function commentsAtLeast(_comments: number): Signal {
  throw new Error("not implemented");
}

/** Blocks at least `tickets` open tickets. */
export function blocksAtLeast(_tickets: number): Signal {
  throw new Error("not implemented");
}

/** Priority ranked at most `rank`; never matches an unset priority. */
export function priorityAtMost(_rank: "low" | "medium"): Signal {
  throw new Error("not implemented");
}

/** A due date or a release from 0 to `days` days ahead. */
export function deadlineWithin(_days: number): Signal {
  throw new Error("not implemented");
}
