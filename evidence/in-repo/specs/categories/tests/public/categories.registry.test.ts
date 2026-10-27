import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CATEGORIES,
  UNCATEGORIZED,
  all,
  classify,
  createClassifier,
  notInSprint,
  resolveCategories,
  signal,
  silent,
  type Category,
  type CategoryConfig,
  type IssueFacts,
  type ResolvedCategory,
  type Thresholds,
} from "../src/selection/index.js";

/**
 * The registry of six outsourcing categories, a board's overrides of them,
 * and the classifier that says which categories an issue fits and why.
 */

const BASE_FACTS: IssueFacts = {
  ageDays: 0,
  daysSinceUpdate: 0,
  assigned: false,
  inSprint: false,
  closedSprintCount: 0,
  carriedSince: null,
  votes: 0,
  watchers: 0,
  duplicateLinks: 0,
  blocksOpenCount: 0,
  commentCount: null,
  priorityName: null,
  priorityRank: "none",
  isBug: false,
  dueInDays: null,
  release: null,
};

function factsWith(changes: Partial<IssueFacts>): IssueFacts {
  return { ...BASE_FACTS, ...changes };
}

const REGISTRY = [
  {
    id: "left-behind",
    label: "Left behind",
    why: "Open for a long time, untouched for months and never planned into a sprint.",
    defaults: { openDays: 180, quietDays: 90 },
  },
  {
    id: "always-next-sprint",
    label: "Always next sprint",
    why: "Planned into sprint after sprint and carried over every time.",
    defaults: { sprints: 3 },
  },
  {
    id: "quietly-wanted",
    label: "Quietly wanted",
    why: "People keep asking for it, but it is not in a sprint.",
    defaults: { votes: 3, watchers: 5, duplicates: 2, comments: 10 },
  },
  {
    id: "holding-others-up",
    label: "Holding others up",
    why: "Other open tickets wait on it and nobody is assigned.",
    defaults: { blocks: 1 },
  },
  {
    id: "paper-cuts",
    label: "Paper cuts",
    why: "A low-priority bug that has been open a while.",
    defaults: { openDays: 30 },
  },
  {
    id: "deadline-exposed",
    label: "Deadline exposed",
    why: "A due date or release is close and it is not in a sprint.",
    defaults: { withinDays: 14 },
  },
] as const;

function defaultResolved(): ResolvedCategory[] {
  return REGISTRY.map(({ id, label, why, defaults }) => ({
    id,
    label,
    why,
    enabled: true,
    thresholds: { ...defaults },
  }));
}

function byId(
  resolved: readonly ResolvedCategory[],
  id: string,
): ResolvedCategory {
  const found = resolved.find((category) => category.id === id);
  assert.ok(found, `no resolved category ${id}`);
  return found;
}

function custom(id: string, rule: Category["rule"] = () => all()): Category {
  return { id, label: id, why: `${id}.`, defaults: {}, rule };
}

function assertRefused(fn: () => unknown, message: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, message);
    return true;
  });
}

test("[happy-9] the registry ships six categories in a fixed order with their labels, whys and defaults", () => {
  assert.deepEqual(
    CATEGORIES.map((c) => c.id),
    [
      "left-behind",
      "always-next-sprint",
      "quietly-wanted",
      "holding-others-up",
      "paper-cuts",
      "deadline-exposed",
    ],
  );
  assert.deepEqual(
    CATEGORIES.map(({ id, label, why, defaults }) => ({
      id,
      label,
      why,
      defaults,
    })),
    REGISTRY.map(({ id, label, why, defaults }) => ({
      id,
      label,
      why,
      defaults: { ...defaults },
    })),
  );
  assert.equal(UNCATEGORIZED, "uncategorized");
  assert.ok(CATEGORIES.every((c) => c.id !== UNCATEGORIZED));
});

test("[happy-9] the registry, every category and every defaults object are frozen", () => {
  assert.equal(Object.isFrozen(CATEGORIES), true);
  for (const category of CATEGORIES) {
    assert.equal(Object.isFrozen(category), true, category.id);
    assert.equal(Object.isFrozen(category.defaults), true, category.id);
  }
  const first = CATEGORIES[0];
  assert.ok(first);
  assert.throws(() => {
    (first.defaults as Record<string, number>)["openDays"] = 1;
  }, TypeError);
  assert.equal(first.defaults["openDays"], 180);
});

test("[happy-10] with no config every category is enabled at its defaults, in registry order", () => {
  const resolved = resolveCategories();
  assert.equal(resolved.length, 6);
  assert.deepEqual(resolved[0], {
    id: "left-behind",
    label: "Left behind",
    why: "Open for a long time, untouched for months and never planned into a sprint.",
    enabled: true,
    thresholds: { openDays: 180, quietDays: 90 },
  });
  assert.deepEqual(resolved, defaultResolved());
});

test("[happy-10] an empty config resolves the same as no config", () => {
  assert.deepEqual(resolveCategories({}), resolveCategories());
  assert.deepEqual(resolveCategories({}, CATEGORIES), defaultResolved());
});

test("[happy-11] a threshold override replaces only that threshold", () => {
  const resolved = resolveCategories({
    "left-behind": { thresholds: { openDays: 365 } },
  });
  const expected = defaultResolved().map((category) =>
    category.id === "left-behind"
      ? { ...category, thresholds: { openDays: 365, quietDays: 90 } }
      : category,
  );
  assert.deepEqual(resolved, expected);
});

test("[happy-11] overriding one of several thresholds keeps the rest at their defaults", () => {
  const resolved = resolveCategories({
    "quietly-wanted": { thresholds: { watchers: 1 } },
  });
  assert.deepEqual(byId(resolved, "quietly-wanted").thresholds, {
    votes: 3,
    watchers: 1,
    duplicates: 2,
    comments: 10,
  });
  assert.deepEqual(byId(resolved, "left-behind").thresholds, {
    openDays: 180,
    quietDays: 90,
  });
});

test("[boundary-16] finite non-negative overrides are taken, including 0 and fractions", () => {
  for (const [value, expected] of [
    [5, 5],
    [0, 0],
    [2.5, 2.5],
  ] as const) {
    const resolved = resolveCategories({
      "always-next-sprint": { thresholds: { sprints: value } },
    });
    assert.deepEqual(
      byId(resolved, "always-next-sprint").thresholds,
      { sprints: expected },
      String(value),
    );
  }
});

test("[boundary-16] a null, undefined, negative or non-finite override keeps the default", () => {
  for (const value of [
    null,
    undefined,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ]) {
    const resolved = resolveCategories({
      "always-next-sprint": { thresholds: { sprints: value } },
    });
    assert.deepEqual(
      byId(resolved, "always-next-sprint").thresholds,
      { sprints: 3 },
      String(value),
    );
  }
});

test("[boundary-17] unknown thresholds are ignored", () => {
  const resolved = resolveCategories({
    "paper-cuts": { thresholds: { openDays: 60, votes: 9 } },
  });
  assert.deepEqual(byId(resolved, "paper-cuts").thresholds, { openDays: 60 });
});

test("[boundary-17] unknown categories are ignored and the result still has exactly the six registry categories", () => {
  const resolved = resolveCategories({
    "paper-cuts": { thresholds: { openDays: 60, votes: 9 } },
    "no-such-category": { enabled: false },
  });
  assert.deepEqual(
    resolved.map((category) => category.id),
    REGISTRY.map((category) => category.id),
  );
  assert.ok(resolved.every((category) => category.enabled));
});

test("[happy-12] enabled defaults to true when settings are missing, empty or say true", () => {
  const settingsList: CategoryConfig[] = [
    { "quietly-wanted": undefined },
    { "quietly-wanted": {} },
    { "quietly-wanted": { enabled: true } },
  ];
  for (const config of settingsList) {
    const quietlyWanted = byId(resolveCategories(config), "quietly-wanted");
    assert.equal(quietlyWanted.enabled, true, JSON.stringify(config));
    assert.deepEqual(quietlyWanted.thresholds, {
      votes: 3,
      watchers: 5,
      duplicates: 2,
      comments: 10,
    });
  }
});

test("[happy-12] enabled false switches a category off while it stays listed with its thresholds resolved", () => {
  const off = byId(
    resolveCategories({ "quietly-wanted": { enabled: false } }),
    "quietly-wanted",
  );
  assert.equal(off.enabled, false);
  assert.deepEqual(off.thresholds, {
    votes: 3,
    watchers: 5,
    duplicates: 2,
    comments: 10,
  });

  const offWithOverride = byId(
    resolveCategories({
      "quietly-wanted": { enabled: false, thresholds: { comments: 4 } },
    }),
    "quietly-wanted",
  );
  assert.equal(offWithOverride.enabled, false);
  assert.deepEqual(offWithOverride.thresholds, {
    votes: 3,
    watchers: 5,
    duplicates: 2,
    comments: 4,
  });
});

test("[boundary-18] resolving with an override never changes the registry's defaults", () => {
  const R1 = resolveCategories({
    "left-behind": { thresholds: { openDays: 1 } },
  });
  assert.deepEqual(R1[0]?.thresholds, { openDays: 1, quietDays: 90 });
  assert.deepEqual(CATEGORIES[0]?.defaults, { openDays: 180, quietDays: 90 });
});

test("[boundary-18] each resolve returns fresh objects", () => {
  const R1 = resolveCategories({
    "left-behind": { thresholds: { openDays: 1 } },
  });
  const R2 = resolveCategories();
  assert.notEqual(R2[0], R1[0]);
  assert.notEqual(resolveCategories()[0], R2[0]);
  assert.notEqual(R2[0]?.thresholds, CATEGORIES[0]?.defaults);
});

test("[unhappy-3] a category list with a duplicate id is refused", () => {
  const categories = [custom("x"), custom("x")];
  assertRefused(
    () => resolveCategories({}, categories),
    "Duplicate category id: x",
  );
  assertRefused(
    () => createClassifier({}, categories),
    "Duplicate category id: x",
  );
});

test("[unhappy-3] a category list using the reserved id is refused", () => {
  const categories = [custom("uncategorized")];
  assertRefused(
    () => resolveCategories({}, categories),
    "Reserved category id: uncategorized",
  );
  assertRefused(
    () => createClassifier({}, categories),
    "Reserved category id: uncategorized",
  );
});

test("[happy-13] each shipped category matches at its defaults with its reason", () => {
  const cases: [Partial<IssueFacts>, string, string, string][] = [
    [
      { ageDays: 400, daysSinceUpdate: 200, assigned: true },
      "left-behind",
      "Left behind",
      "Open 400 days, no update in 200 days, never in a sprint",
    ],
    [
      {
        closedSprintCount: 3,
        carriedSince: "2026-02-16T09:00:00.000Z",
        inSprint: true,
        assigned: true,
      },
      "always-next-sprint",
      "Always next sprint",
      "Carried over 3 sprints since 2026-02-16",
    ],
    [
      { votes: 4, watchers: 7, closedSprintCount: 1 },
      "quietly-wanted",
      "Quietly wanted",
      "4 votes, 7 watchers",
    ],
    [
      { blocksOpenCount: 2, inSprint: true },
      "holding-others-up",
      "Holding others up",
      "Blocks 2 open tickets, unassigned",
    ],
    [
      {
        isBug: true,
        priorityName: "Low",
        priorityRank: "low",
        ageDays: 45,
        daysSinceUpdate: 1,
        inSprint: true,
      },
      "paper-cuts",
      "Paper cuts",
      "A bug, Low priority, open 45 days",
    ],
    [
      { dueInDays: 10, assigned: true, closedSprintCount: 1 },
      "deadline-exposed",
      "Deadline exposed",
      "Due in 10 days",
    ],
  ];
  for (const [changes, id, label, reason] of cases) {
    assert.deepEqual(classify(factsWith(changes)), [{ id, label, reason }], id);
  }
});

test("[happy-13] a shipped category matches exactly at its default thresholds", () => {
  assert.deepEqual(
    classify(factsWith({ ageDays: 180, daysSinceUpdate: 90, assigned: true })),
    [
      {
        id: "left-behind",
        label: "Left behind",
        reason: "Open 180 days, no update in 90 days, never in a sprint",
      },
    ],
  );
  assert.deepEqual(
    classify(factsWith({ ageDays: 179, daysSinceUpdate: 90, assigned: true })),
    [],
  );
});

test("[happy-14] an issue can fit several categories, returned in registry order", () => {
  const F = factsWith({
    ageDays: 400,
    daysSinceUpdate: 200,
    isBug: true,
    priorityName: "Trivial",
    priorityRank: "low",
    dueInDays: 3,
  });
  assert.deepEqual(classify(F), [
    {
      id: "left-behind",
      label: "Left behind",
      reason: "Open 400 days, no update in 200 days, never in a sprint",
    },
    {
      id: "paper-cuts",
      label: "Paper cuts",
      reason: "A bug, Trivial priority, open 400 days",
    },
    {
      id: "deadline-exposed",
      label: "Deadline exposed",
      reason: "Due in 3 days",
    },
  ]);
});

test("[happy-14] an issue at every threshold fits five categories at once, in registry order", () => {
  const F = factsWith({
    ageDays: 30,
    closedSprintCount: 3,
    votes: 3,
    blocksOpenCount: 1,
    isBug: true,
    priorityName: "Low",
    priorityRank: "low",
    dueInDays: 14,
  });
  assert.deepEqual(classify(F), [
    {
      id: "always-next-sprint",
      label: "Always next sprint",
      reason: "Carried over 3 sprints",
    },
    { id: "quietly-wanted", label: "Quietly wanted", reason: "3 votes" },
    {
      id: "holding-others-up",
      label: "Holding others up",
      reason: "Blocks 1 open ticket, unassigned",
    },
    {
      id: "paper-cuts",
      label: "Paper cuts",
      reason: "A bug, Low priority, open 30 days",
    },
    {
      id: "deadline-exposed",
      label: "Deadline exposed",
      reason: "Due in 14 days",
    },
  ]);
});

test("[boundary-19] an issue that fits nothing gets an empty list", () => {
  assert.deepEqual(classify(factsWith({ assigned: true })), []);
});

test("[boundary-19] an issue just short of every threshold gets an empty list, never UNCATEGORIZED", () => {
  const F = factsWith({
    ageDays: 179,
    daysSinceUpdate: 200,
    closedSprintCount: 2,
    votes: 2,
    watchers: 4,
    duplicateLinks: 1,
    commentCount: 9,
    isBug: true,
    priorityName: "Medium",
    priorityRank: "medium",
    dueInDays: 15,
    release: { name: "2.4", inDays: 15 },
  });
  const result = classify(F);
  assert.ok(result.every((match) => match.id !== UNCATEGORIZED));
  assert.deepEqual(result, []);
});

test("[boundary-20] a silent clause lets a category match without appearing in the reason", () => {
  assert.deepEqual(classify(factsWith({ votes: 5 })), [
    { id: "quietly-wanted", label: "Quietly wanted", reason: "5 votes" },
  ]);
  assert.deepEqual(classify(factsWith({ votes: 5, inSprint: true })), []);
});

test("[boundary-20] a silent clause can break a deadline match that otherwise fits", () => {
  assert.deepEqual(classify(factsWith({ dueInDays: 3, assigned: true })), [
    { id: "deadline-exposed", label: "Deadline exposed", reason: "Due in 3 days" },
  ]);
  assert.deepEqual(
    classify(factsWith({ dueInDays: 3, assigned: true, inSprint: true })),
    [],
  );
});

test("[happy-15] a threshold override makes a category match", () => {
  const F = factsWith({ closedSprintCount: 2, assigned: true });
  assert.deepEqual(classify(F), []);
  assert.deepEqual(
    classify(F, { "always-next-sprint": { thresholds: { sprints: 2 } } }),
    [
      {
        id: "always-next-sprint",
        label: "Always next sprint",
        reason: "Carried over 2 sprints",
      },
    ],
  );
  assert.deepEqual(
    classify(F, {
      "always-next-sprint": { enabled: false, thresholds: { sprints: 2 } },
    }),
    [],
  );
});

test("[happy-15] a zero threshold override matches while an invalid one keeps the default", () => {
  const F = factsWith({ assigned: true });
  assert.deepEqual(
    classify(F, { "always-next-sprint": { thresholds: { sprints: 0 } } }),
    [
      {
        id: "always-next-sprint",
        label: "Always next sprint",
        reason: "Carried over 0 sprints",
      },
    ],
  );
  assert.deepEqual(
    classify(F, { "always-next-sprint": { thresholds: { sprints: -1 } } }),
    [],
  );
});

test("[boundary-21] a rule that matches with no clauses gives the category's why", () => {
  const category: Category = {
    id: "all-of-it",
    label: "All of it",
    why: "Everything qualifies.",
    defaults: {},
    rule: () => all(),
  };
  assert.deepEqual(classify(BASE_FACTS, {}, [category]), [
    { id: "all-of-it", label: "All of it", reason: "Everything qualifies." },
  ]);
});

test("[boundary-21] a rule matched only by silent signals gives the why, and no match when the silent signal fails", () => {
  const category: Category = {
    id: "quiet-only",
    label: "Quiet only",
    why: "Nothing to say beyond this.",
    defaults: {},
    rule: () => silent(notInSprint),
  };
  assert.deepEqual(classify(BASE_FACTS, {}, [category]), [
    {
      id: "quiet-only",
      label: "Quiet only",
      reason: "Nothing to say beyond this.",
    },
  ]);
  assert.deepEqual(classify(factsWith({ inSprint: true }), {}, [category]), []);
});

function countingCategory(
  id: string,
  label: string,
  why: string,
  defaults: Thresholds,
): { category: Category; calls: Thresholds[] } {
  const calls: Thresholds[] = [];
  return {
    calls,
    category: {
      id,
      label,
      why,
      defaults,
      rule: (thresholds) => {
        calls.push(thresholds);
        return signal(
          "s",
          (f) => f.votes >= 1,
          (f) => `${f.votes} votes`,
        );
      },
    },
  };
}

test("[happy-16] createClassifier builds each enabled rule once and is reusable", () => {
  const one = countingCategory("one", "One", "First.", { votes: 1 });
  const two = countingCategory("two", "Two", "Second.", {});
  const C = createClassifier({ two: { enabled: false } }, [
    one.category,
    two.category,
  ]);
  assert.equal(one.calls.length, 1);
  assert.deepEqual(one.calls[0], { votes: 1 });
  assert.equal(two.calls.length, 0);

  assert.deepEqual(C(factsWith({ votes: 1 })), [
    { id: "one", label: "One", reason: "1 votes" },
  ]);
  assert.deepEqual(C(BASE_FACTS), []);
  assert.deepEqual(C(factsWith({ votes: 2 })), [
    { id: "one", label: "One", reason: "2 votes" },
  ]);
  assert.equal(one.calls.length, 1);
  assert.equal(two.calls.length, 0);
});

test("[happy-16] a classifier with every category disabled builds no rules and matches nothing", () => {
  const one = countingCategory("one", "One", "First.", { votes: 1 });
  const two = countingCategory("two", "Two", "Second.", {});
  const C = createClassifier(
    { one: { enabled: false }, two: { enabled: false } },
    [one.category, two.category],
  );
  assert.deepEqual(C(factsWith({ votes: 5 })), []);
  assert.equal(one.calls.length, 0);
  assert.equal(two.calls.length, 0);
});

const MANY = factsWith({
  ageDays: 400,
  daysSinceUpdate: 200,
  isBug: true,
  priorityName: "Trivial",
  priorityRank: "low",
  dueInDays: 3,
});

test("[boundary-22] classify gives the same result as createClassifier applied once", () => {
  const K: CategoryConfig = { "paper-cuts": { enabled: false } };
  assert.deepEqual(classify(MANY, K), createClassifier(K)(MANY));
  assert.deepEqual(
    classify(MANY, K).map((match) => match.id),
    ["left-behind", "deadline-exposed"],
  );
});

test("[boundary-22] two classifiers from different configs, called alternately, do not interfere", () => {
  const K1: CategoryConfig = { "paper-cuts": { enabled: false } };
  const K2: CategoryConfig = { "left-behind": { enabled: false } };
  const alone1 = createClassifier(K1)(MANY);
  const alone2 = createClassifier(K2)(MANY);
  const C1 = createClassifier(K1);
  const C2 = createClassifier(K2);
  assert.deepEqual(C1(MANY), alone1);
  assert.deepEqual(C2(MANY), alone2);
  assert.deepEqual(C1(MANY), alone1);
  assert.deepEqual(C2(MANY), alone2);
  assert.notDeepEqual(alone1, alone2);
});
