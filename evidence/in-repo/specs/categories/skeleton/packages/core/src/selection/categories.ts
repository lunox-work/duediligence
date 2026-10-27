/**
 * The registry of outsourcing categories, a board's overrides of them, and the
 * classifier that says which categories an issue fits and why.
 */

import type { IssueFacts } from "./facts.js";
import type { Rule } from "./rules.js";

/** Named numeric thresholds a category's rule is built from. */
export type Thresholds = Readonly<Record<string, number>>;

/** One outsourcing category: who it is, why it matters, and its rule. */
export interface Category {
  readonly id: string;
  readonly label: string;
  readonly why: string;
  readonly defaults: Thresholds;
  readonly rule: (thresholds: Thresholds) => Rule;
}

/** The six shipped categories, in registry order. Frozen, as is each entry and its `defaults`. */
export const CATEGORIES: readonly Category[] = Object.freeze([
  Object.freeze({
    id: "left-behind",
    label: "Left behind",
    why: "Open for a long time, untouched for months and never planned into a sprint.",
    defaults: Object.freeze({ openDays: 180, quietDays: 90 }),
    rule: () => {
      throw new Error("not implemented");
    },
  }),
  Object.freeze({
    id: "always-next-sprint",
    label: "Always next sprint",
    why: "Planned into sprint after sprint and carried over every time.",
    defaults: Object.freeze({ sprints: 3 }),
    rule: () => {
      throw new Error("not implemented");
    },
  }),
  Object.freeze({
    id: "quietly-wanted",
    label: "Quietly wanted",
    why: "People keep asking for it, but it is not in a sprint.",
    defaults: Object.freeze({
      votes: 3,
      watchers: 5,
      duplicates: 2,
      comments: 10,
    }),
    rule: () => {
      throw new Error("not implemented");
    },
  }),
  Object.freeze({
    id: "holding-others-up",
    label: "Holding others up",
    why: "Other open tickets wait on it and nobody is assigned.",
    defaults: Object.freeze({ blocks: 1 }),
    rule: () => {
      throw new Error("not implemented");
    },
  }),
  Object.freeze({
    id: "paper-cuts",
    label: "Paper cuts",
    why: "A low-priority bug that has been open a while.",
    defaults: Object.freeze({ openDays: 30 }),
    rule: () => {
      throw new Error("not implemented");
    },
  }),
  Object.freeze({
    id: "deadline-exposed",
    label: "Deadline exposed",
    why: "A due date or release is close and it is not in a sprint.",
    defaults: Object.freeze({ withinDays: 14 }),
    rule: () => {
      throw new Error("not implemented");
    },
  }),
]);

/** Reserved id no category may use; never returned by a classifier. */
export const UNCATEGORIZED = "uncategorized";

/** A board's override of one category: whether it is on, and threshold overrides. */
export interface CategorySettings {
  readonly enabled?: boolean | undefined;
  readonly thresholds?:
    | Readonly<Record<string, number | null | undefined>>
    | undefined;
}

/** A board's overrides, by category id. */
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

/**
 * Applies a board's overrides to every category, in registry order, returning
 * fresh objects. Throws an `Error` ("Duplicate category id: <id>" or
 * "Reserved category id: uncategorized") for a duplicate or reserved id.
 */
export function resolveCategories(
  _config: CategoryConfig = {},
  _categories: readonly Category[] = CATEGORIES,
): ResolvedCategory[] {
  throw new Error("not implemented");
}

/**
 * Builds a reusable classifier that returns every enabled category whose rule
 * matches, in registry order, with a reason. Resolves and builds each enabled
 * rule once, at creation. Throws an `Error` ("Duplicate category id: <id>" or
 * "Reserved category id: uncategorized") for a duplicate or reserved id.
 */
export function createClassifier(
  _config: CategoryConfig = {},
  _categories: readonly Category[] = CATEGORIES,
): (facts: IssueFacts) => CategoryMatch[] {
  throw new Error("not implemented");
}

/**
 * Every enabled category `facts` fits, in registry order, with a reason:
 * `createClassifier(config, categories)` applied once.
 */
export function classify(
  _facts: IssueFacts,
  _config: CategoryConfig = {},
  _categories: readonly Category[] = CATEGORIES,
): CategoryMatch[] {
  throw new Error("not implemented");
}
