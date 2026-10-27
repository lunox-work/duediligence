/**
 * The registry of outsourcing categories, a board's overrides of it, and the
 * classifier that says which categories an issue's facts fit and why.
 */

import type { IssueFacts } from "./facts.js";
import type { Rule } from "./rules.js";

/** Named numeric thresholds a category's rule is built from. */
export type Thresholds = Readonly<Record<string, number>>;

/** One outsourcing category: what it is, why it is worth paying for, and its rule. */
export interface Category {
  readonly id: string;
  readonly label: string;
  readonly why: string;
  readonly defaults: Thresholds;
  readonly rule: (thresholds: Thresholds) => Rule;
}

/** The six shipped categories, in registry order. */
export const CATEGORIES: readonly Category[] = [
  {
    id: "left-behind",
    label: "Left behind",
    why: "The team has shown it won't reach this, so outsourcing takes nothing off the roadmap.",
    defaults: { minAgeDays: 180, minQuietDays: 90 },
    /** `all(openAtLeast(t.minAgeDays), neverInSprint, unassigned, silent(quietAtLeast(t.minQuietDays)))` */
    rule: () => {
      throw new Error("not implemented");
    },
  },
  {
    id: "always-next-sprint",
    label: "Always next sprint",
    why: "Already planned and wanted; the only blocker is capacity.",
    defaults: { minSprints: 2 },
    /** `carriedAtLeast(t.minSprints)` */
    rule: () => {
      throw new Error("not implemented");
    },
  },
  {
    id: "quietly-wanted",
    label: "Quietly wanted",
    why: "Shows demand that the priority field hides, which justifies a higher bounty.",
    defaults: { minVotes: 3, minWatchers: 5, minDuplicates: 1, minComments: 5 },
    /** `all(any(votesAtLeast(t.minVotes), watchersAtLeast(t.minWatchers), commentsAtLeast(t.minComments), duplicatesAtLeast(t.minDuplicates)), priorityAtMost("low"))` */
    rule: () => {
      throw new Error("not implemented");
    },
  },
  {
    id: "holding-others-up",
    label: "Holding others up",
    why: "One bounty unblocks several tickets the team will do in-house.",
    defaults: { minBlocked: 1 },
    /** `all(blocksAtLeast(t.minBlocked), unassigned)` */
    rule: () => {
      throw new Error("not implemented");
    },
  },
  {
    id: "paper-cuts",
    label: "Paper cuts",
    why: "Small, self-contained bugs are what agents fix most reliably, and users notice when they're gone.",
    defaults: { minAgeDays: 90 },
    /** `all(bug, silent(priorityAtMost("medium")), openAtLeast(t.minAgeDays))` */
    rule: () => {
      throw new Error("not implemented");
    },
  },
  {
    id: "deadline-exposed",
    label: "Deadline exposed",
    why: "The deadline justifies paying now rather than waiting for capacity.",
    defaults: { withinDays: 30 },
    /** `all(deadlineWithin(t.withinDays), silent(unassigned), notInSprint)` */
    rule: () => {
      throw new Error("not implemented");
    },
  },
];

/** The id no category has; a classifier never returns it. */
export const UNCATEGORIZED = "uncategorized";

/** A board's override of one category: switch it off, or replace thresholds. */
export interface CategorySettings {
  readonly enabled?: boolean | undefined;
  readonly thresholds?:
    Readonly<Record<string, number | null | undefined>> | undefined;
}

/** A board's overrides, keyed by category id. */
export type CategoryConfig = Readonly<
  Record<string, CategorySettings | undefined>
>;

/** A category with a board's overrides applied. */
export interface ResolvedCategory {
  readonly id: string;
  readonly label: string;
  readonly why: string;
  readonly enabled: boolean;
  readonly thresholds: Thresholds;
}

/** A category an issue fits, and the reason it fits. */
export interface CategoryMatch {
  readonly id: string;
  readonly label: string;
  readonly reason: string;
}

/** Applies a board's overrides to every category, in registry order. */
export function resolveCategories(
  _config: CategoryConfig = {},
  _categories: readonly Category[] = CATEGORIES,
): ResolvedCategory[] {
  throw new Error("not implemented");
}

/**
 * Resolves the categories and builds each enabled rule once, returning a
 * reusable function that gives every enabled category the facts fit, in
 * registry order, with a reason.
 */
export function createClassifier(
  _config: CategoryConfig = {},
  _categories: readonly Category[] = CATEGORIES,
): (facts: IssueFacts) => CategoryMatch[] {
  throw new Error("not implemented");
}

/** Every enabled category `facts` fit, in registry order: `createClassifier` applied once. */
export function classify(
  _facts: IssueFacts,
  _config: CategoryConfig = {},
  _categories: readonly Category[] = CATEGORIES,
): CategoryMatch[] {
  throw new Error("not implemented");
}
