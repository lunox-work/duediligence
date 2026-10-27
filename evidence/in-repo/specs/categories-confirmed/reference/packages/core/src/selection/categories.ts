/**
 * The registry of outsourcing categories, a board's overrides of it, and the
 * classifier that says which categories an issue's facts fit and why.
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

/** One outsourcing category: what it is, why it is worth paying for, and its rule. */
export interface Category {
  readonly id: string;
  readonly label: string;
  readonly why: string;
  readonly defaults: Thresholds;
  readonly rule: (thresholds: Thresholds) => Rule;
}

/**
 * A category whose rule reads its own threshold names: a threshold missing
 * from what the rule is given falls back to its default.
 */
function category<K extends string>(definition: {
  readonly id: string;
  readonly label: string;
  readonly why: string;
  readonly defaults: Readonly<Record<K, number>>;
  readonly rule: (thresholds: Readonly<Record<K, number>>) => Rule;
}): Category {
  return {
    ...definition,
    rule: (thresholds) =>
      definition.rule({ ...definition.defaults, ...thresholds }),
  };
}

/** The six shipped categories, in registry order. */
export const CATEGORIES: readonly Category[] = [
  category({
    id: "left-behind",
    label: "Left behind",
    why: "The team has shown it won't reach this, so outsourcing takes nothing off the roadmap.",
    defaults: { minAgeDays: 180, minQuietDays: 90 },
    rule: (t) =>
      all(
        openAtLeast(t.minAgeDays),
        neverInSprint,
        unassigned,
        silent(quietAtLeast(t.minQuietDays)),
      ),
  }),
  category({
    id: "always-next-sprint",
    label: "Always next sprint",
    why: "Already planned and wanted; the only blocker is capacity.",
    defaults: { minSprints: 2 },
    rule: (t) => carriedAtLeast(t.minSprints),
  }),
  category({
    id: "quietly-wanted",
    label: "Quietly wanted",
    why: "Shows demand that the priority field hides, which justifies a higher bounty.",
    defaults: { minVotes: 3, minWatchers: 5, minDuplicates: 1, minComments: 5 },
    rule: (t) =>
      all(
        any(
          votesAtLeast(t.minVotes),
          watchersAtLeast(t.minWatchers),
          commentsAtLeast(t.minComments),
          duplicatesAtLeast(t.minDuplicates),
        ),
        priorityAtMost("low"),
      ),
  }),
  category({
    id: "holding-others-up",
    label: "Holding others up",
    why: "One bounty unblocks several tickets the team will do in-house.",
    defaults: { minBlocked: 1 },
    rule: (t) => all(blocksAtLeast(t.minBlocked), unassigned),
  }),
  category({
    id: "paper-cuts",
    label: "Paper cuts",
    why: "Small, self-contained bugs are what agents fix most reliably, and users notice when they're gone.",
    defaults: { minAgeDays: 90 },
    rule: (t) =>
      all(bug, silent(priorityAtMost("medium")), openAtLeast(t.minAgeDays)),
  }),
  category({
    id: "deadline-exposed",
    label: "Deadline exposed",
    why: "The deadline justifies paying now rather than waiting for capacity.",
    defaults: { withinDays: 30 },
    rule: (t) =>
      all(deadlineWithin(t.withinDays), silent(unassigned), notInSprint),
  }),
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
  config: CategoryConfig = {},
  categories: readonly Category[] = CATEGORIES,
): ResolvedCategory[] {
  return categories.map((category) => {
    const settings = Object.hasOwn(config, category.id)
      ? config[category.id]
      : undefined;
    const thresholds: Record<string, number> = {};
    for (const [name, fallback] of Object.entries(category.defaults)) {
      const value = settings?.thresholds?.[name];
      thresholds[name] =
        typeof value === "number" && Number.isFinite(value) ? value : fallback;
    }
    return {
      id: category.id,
      label: category.label,
      why: category.why,
      enabled: settings?.enabled !== false,
      thresholds,
    };
  });
}

/** Upper-cases the first character of `text`. */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Resolves the categories and builds each enabled rule once, returning a
 * reusable function that gives every enabled category the facts fit, in
 * registry order, with a reason.
 */
export function createClassifier(
  config: CategoryConfig = {},
  categories: readonly Category[] = CATEGORIES,
): (facts: IssueFacts) => CategoryMatch[] {
  const resolved = resolveCategories(config, categories);
  const built = categories.flatMap((category, index) => {
    const { label, enabled, thresholds } = resolved[index] as ResolvedCategory;
    return enabled
      ? [{ id: category.id, label, rule: category.rule(thresholds) }]
      : [];
  });
  return (facts) =>
    built.flatMap(({ id, label, rule }) => {
      const { matched, clauses } = evaluate(rule, facts);
      if (!matched) return [];
      const reason =
        clauses.length === 0 ? label : capitalize(clauses.join(", "));
      return [{ id, label, reason }];
    });
}

/** Every enabled category `facts` fit, in registry order: `createClassifier` applied once. */
export function classify(
  facts: IssueFacts,
  config: CategoryConfig = {},
  categories: readonly Category[] = CATEGORIES,
): CategoryMatch[] {
  return createClassifier(config, categories)(facts);
}
