/**
 * The registry of outsourcing categories, a board's overrides of them, and the
 * classifier that says which categories an issue fits and why.
 */

import type { IssueFacts } from "./facts.js";
import { all, any, evaluate, silent, type Rule } from "./rules.js";
import {
  blocksAtLeast,
  bug,
  carriedAtLeast,
  commentsAtLeast,
  deadlineWithin,
  duplicatesAtLeast,
  neverInSprint,
  notInSprint,
  openAtLeast,
  priorityAtMost,
  quietAtLeast,
  unassigned,
  votesAtLeast,
  watchersAtLeast,
} from "./signals.js";

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

/**
 * The threshold named `key`. Resolution always fills in every key of a
 * category's defaults; a missing one throws a `RangeError`.
 */
function threshold(thresholds: Thresholds, key: string): number {
  const value = thresholds[key];
  if (value === undefined) throw new RangeError(`Missing threshold: ${key}`);
  return value;
}

/** The six shipped categories, in registry order. Frozen, as is each entry and its `defaults`. */
export const CATEGORIES: readonly Category[] = Object.freeze([
  Object.freeze({
    id: "left-behind",
    label: "Left behind",
    why: "Open for a long time, untouched for months and never planned into a sprint.",
    defaults: Object.freeze({ openDays: 180, quietDays: 90 }),
    rule: (t: Thresholds) =>
      all(
        openAtLeast(threshold(t, "openDays")),
        quietAtLeast(threshold(t, "quietDays")),
        neverInSprint,
      ),
  }),
  Object.freeze({
    id: "always-next-sprint",
    label: "Always next sprint",
    why: "Planned into sprint after sprint and carried over every time.",
    defaults: Object.freeze({ sprints: 3 }),
    rule: (t: Thresholds) => carriedAtLeast(threshold(t, "sprints")),
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
    rule: (t: Thresholds) =>
      all(
        silent(notInSprint),
        any(
          votesAtLeast(threshold(t, "votes")),
          watchersAtLeast(threshold(t, "watchers")),
          duplicatesAtLeast(threshold(t, "duplicates")),
          commentsAtLeast(threshold(t, "comments")),
        ),
      ),
  }),
  Object.freeze({
    id: "holding-others-up",
    label: "Holding others up",
    why: "Other open tickets wait on it and nobody is assigned.",
    defaults: Object.freeze({ blocks: 1 }),
    rule: (t: Thresholds) =>
      all(blocksAtLeast(threshold(t, "blocks")), unassigned),
  }),
  Object.freeze({
    id: "paper-cuts",
    label: "Paper cuts",
    why: "A low-priority bug that has been open a while.",
    defaults: Object.freeze({ openDays: 30 }),
    rule: (t: Thresholds) =>
      all(bug, priorityAtMost("low"), openAtLeast(threshold(t, "openDays"))),
  }),
  Object.freeze({
    id: "deadline-exposed",
    label: "Deadline exposed",
    why: "A due date or release is close and it is not in a sprint.",
    defaults: Object.freeze({ withinDays: 14 }),
    rule: (t: Thresholds) =>
      all(deadlineWithin(threshold(t, "withinDays")), silent(notInSprint)),
  }),
]);

/** Reserved id no category may use; never returned by a classifier. */
export const UNCATEGORIZED = "uncategorized";

/** A board's override of one category: whether it is on, and threshold overrides. */
export interface CategorySettings {
  readonly enabled?: boolean | undefined;
  readonly thresholds?:
    Readonly<Record<string, number | null | undefined>> | undefined;
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

/** Throws for a duplicate or reserved category id. */
function checkIds(categories: readonly Category[]): void {
  const seen = new Set<string>();
  for (const category of categories) {
    if (category.id === UNCATEGORIZED) {
      throw new Error(`Reserved category id: ${UNCATEGORIZED}`);
    }
    if (seen.has(category.id)) {
      throw new Error(`Duplicate category id: ${category.id}`);
    }
    seen.add(category.id);
  }
}

/** Whether `value` is a usable threshold override: a finite, non-negative number. */
function isThreshold(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** `record[key]` when it is an own property, so inherited names never count. */
function own<T>(
  record: Readonly<Record<string, T>> | undefined,
  key: string,
): T | undefined {
  return record !== undefined && Object.hasOwn(record, key)
    ? record[key]
    : undefined;
}

/** One category with its board settings applied; `enabled` is true unless exactly false. */
function resolveOne(
  category: Category,
  config: CategoryConfig,
): ResolvedCategory {
  const settings = own(config, category.id);
  const thresholds: Record<string, number> = {};
  for (const [key, fallback] of Object.entries(category.defaults)) {
    const override = own(settings?.thresholds, key);
    thresholds[key] = isThreshold(override) ? override : fallback;
  }
  return {
    id: category.id,
    label: category.label,
    why: category.why,
    enabled: settings?.enabled !== false,
    thresholds,
  };
}

/** The evaluation's clauses joined with ", " and capitalised, or `why` when there are none. */
function reasonFor(clauses: readonly string[], why: string): string {
  if (clauses.length === 0) return why;
  const reason = clauses.join(", ");
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}

/**
 * Applies a board's overrides to every category, in registry order, returning
 * fresh objects. Throws an `Error` ("Duplicate category id: <id>" or
 * "Reserved category id: uncategorized") for a duplicate or reserved id.
 */
export function resolveCategories(
  config: CategoryConfig = {},
  categories: readonly Category[] = CATEGORIES,
): ResolvedCategory[] {
  checkIds(categories);
  return categories.map((category) => resolveOne(category, config));
}

/**
 * Builds a reusable classifier that returns every enabled category whose rule
 * matches, in registry order, with a reason. Resolves and builds each enabled
 * rule once, at creation. Throws an `Error` ("Duplicate category id: <id>" or
 * "Reserved category id: uncategorized") for a duplicate or reserved id.
 */
export function createClassifier(
  config: CategoryConfig = {},
  categories: readonly Category[] = CATEGORIES,
): (facts: IssueFacts) => CategoryMatch[] {
  checkIds(categories);
  const built = categories.flatMap((category) => {
    const resolved = resolveOne(category, config);
    if (!resolved.enabled) return [];
    return [{ ...resolved, rule: category.rule(resolved.thresholds) }];
  });
  return (facts) =>
    built.flatMap(({ id, label, why, rule }) => {
      const { matched, clauses } = evaluate(rule, facts);
      return matched ? [{ id, label, reason: reasonFor(clauses, why) }] : [];
    });
}

/**
 * Every enabled category `facts` fits, in registry order, with a reason:
 * `createClassifier(config, categories)` applied once.
 */
export function classify(
  facts: IssueFacts,
  config: CategoryConfig = {},
  categories: readonly Category[] = CATEGORIES,
): CategoryMatch[] {
  return createClassifier(config, categories)(facts);
}
