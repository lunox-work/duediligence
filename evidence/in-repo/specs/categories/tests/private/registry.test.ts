import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CATEGORIES,
  UNCATEGORIZED,
  all,
  any,
  classify,
  createClassifier,
  evaluate,
  resolveCategories,
  signal,
  silent,
  type Category,
  type CategoryConfig,
  type IssueFacts,
  type ResolvedCategory,
  type Rule,
  type Signal,
  type Thresholds,
} from "../../src/selection/index.js";

/**
 * The registry, a board's overrides and the classifier beyond the public
 * examples: other thresholds, several overrides at once, custom category
 * lists, and facts that only a faithful composition of each rule gets right.
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

function shipped(id: string): Category {
  const found = CATEGORIES.find((category) => category.id === id);
  assert.ok(found, `no shipped category ${id}`);
  return found;
}

function custom(
  id: string,
  rule: Category["rule"] = () => all(),
  defaults: Thresholds = {},
): Category {
  return { id, label: `${id} label`, why: `${id} why.`, defaults, rule };
}

function assertRefused(fn: () => unknown, message: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, message);
    return true;
  });
}

// Plain signals, so that building them does not depend on `signal`.
const A: Signal = { id: "a", test: () => true, describe: () => "alpha" };
const B: Signal = { id: "b", test: () => true, describe: () => "beta" };
const N: Signal = { id: "n", test: () => false, describe: () => "never" };
const Q: Signal = { id: "q", test: () => true, describe: () => null };

function countingCategory(
  id: string,
  defaults: Thresholds,
): { category: Category; calls: Thresholds[] } {
  const calls: Thresholds[] = [];
  return {
    calls,
    category: {
      id,
      label: id.toUpperCase(),
      why: `${id}.`,
      defaults,
      rule: (thresholds): Rule => {
        calls.push(thresholds);
        const votes = thresholds["votes"] ?? 0;
        return signal(
          `votes:${votes}`,
          (f) => f.votes >= votes,
          (f) => `${f.votes} votes`,
        );
      },
    },
  };
}

const MANY = factsWith({
  ageDays: 400,
  daysSinceUpdate: 200,
  isBug: true,
  priorityName: "Trivial",
  priorityRank: "low",
  dueInDays: 3,
});

// Extends "[happy-9] the registry ships six categories ...": each shipped rule
// is the tabled composition, checked at thresholds other than its defaults.
test("[happy-9] left-behind's rule is open, quiet and never-in-sprint at the thresholds it is given", () => {
  const rule = shipped("left-behind").rule({ openDays: 10, quietDays: 5 });
  assert.deepEqual(evaluate(rule, factsWith({ ageDays: 10, daysSinceUpdate: 5 })), {
    matched: true,
    clauses: ["open 10 days", "no update in 5 days", "never in a sprint"],
  });
  assert.equal(evaluate(rule, factsWith({ ageDays: 9, daysSinceUpdate: 5 })).matched, false);
  assert.equal(evaluate(rule, factsWith({ ageDays: 10, daysSinceUpdate: 4 })).matched, false);
  assert.equal(
    evaluate(rule, factsWith({ ageDays: 10, daysSinceUpdate: 5, closedSprintCount: 1 })).matched,
    false,
  );
  assert.equal(
    evaluate(rule, factsWith({ ageDays: 10, daysSinceUpdate: 5, inSprint: true })).matched,
    false,
  );
});

test("[happy-9] always-next-sprint's and holding-others-up's rules use the thresholds they are given", () => {
  const carried = shipped("always-next-sprint").rule({ sprints: 1 });
  assert.deepEqual(evaluate(carried, factsWith({ closedSprintCount: 1 })), {
    matched: true,
    clauses: ["carried over 1 sprint"],
  });
  assert.equal(evaluate(carried, BASE_FACTS).matched, false);

  const holding = shipped("holding-others-up").rule({ blocks: 2 });
  assert.deepEqual(evaluate(holding, factsWith({ blocksOpenCount: 2 })), {
    matched: true,
    clauses: ["blocks 2 open tickets", "unassigned"],
  });
  assert.equal(evaluate(holding, factsWith({ blocksOpenCount: 1 })).matched, false);
  assert.equal(
    evaluate(holding, factsWith({ blocksOpenCount: 2, assigned: true })).matched,
    false,
  );
});

test("[happy-9] quietly-wanted's rule is not-in-sprint, silently, and any of its four counts", () => {
  const rule = shipped("quietly-wanted").rule({
    votes: 1,
    watchers: 2,
    duplicates: 3,
    comments: 4,
  });
  assert.deepEqual(
    evaluate(
      rule,
      factsWith({ votes: 1, watchers: 2, duplicateLinks: 3, commentCount: 4 }),
    ),
    {
      matched: true,
      clauses: ["1 vote", "2 watchers", "3 duplicates", "4 comments"],
    },
  );
  assert.deepEqual(evaluate(rule, factsWith({ duplicateLinks: 3 })), {
    matched: true,
    clauses: ["3 duplicates"],
  });
  assert.equal(
    evaluate(rule, factsWith({ votes: 0, watchers: 1, duplicateLinks: 2, commentCount: 3 })).matched,
    false,
  );
  assert.equal(evaluate(rule, factsWith({ votes: 9, inSprint: true })).matched, false);
});

test("[happy-9] paper-cuts' and deadline-exposed's rules use the thresholds they are given", () => {
  const cuts = shipped("paper-cuts").rule({ openDays: 5 });
  const lowBug = { isBug: true, priorityName: "Low", priorityRank: "low" } as const;
  assert.deepEqual(evaluate(cuts, factsWith({ ...lowBug, ageDays: 5 })), {
    matched: true,
    clauses: ["a bug", "Low priority", "open 5 days"],
  });
  assert.equal(evaluate(cuts, factsWith({ ...lowBug, ageDays: 4 })).matched, false);
  assert.equal(
    evaluate(cuts, factsWith({ ...lowBug, priorityRank: "medium", ageDays: 5 })).matched,
    false,
  );
  assert.equal(
    evaluate(cuts, factsWith({ ...lowBug, isBug: false, ageDays: 5 })).matched,
    false,
  );

  const deadline = shipped("deadline-exposed").rule({ withinDays: 3 });
  assert.deepEqual(evaluate(deadline, factsWith({ dueInDays: 3 })), {
    matched: true,
    clauses: ["due in 3 days"],
  });
  assert.equal(evaluate(deadline, factsWith({ dueInDays: 4 })).matched, false);
  assert.equal(
    evaluate(deadline, factsWith({ dueInDays: 3, inSprint: true })).matched,
    false,
  );
});

// Extends "[happy-9] the registry, every category and every defaults object
// are frozen": writes to the list and to an entry, after which resolving still
// sees the shipped registry.
test("[happy-9] writing to the registry or an entry throws and leaves resolving unchanged", () => {
  assert.throws(() => {
    (CATEGORIES as Category[]).push(custom("extra"));
  }, TypeError);
  const second = CATEGORIES[1];
  assert.ok(second);
  assert.throws(() => {
    (second as { label: string }).label = "Changed";
  }, TypeError);
  assert.throws(() => {
    delete (second.defaults as Record<string, number>)["sprints"];
  }, TypeError);
  assert.equal(CATEGORIES.length, 6);
  assert.ok(CATEGORIES.every((category) => category.id !== UNCATEGORIZED));
  assert.deepEqual(resolveCategories(), defaultResolved());
});

// Extends "[happy-10] with no config every category is enabled at its
// defaults, in registry order": a custom list, in its own order.
test("[happy-10] a custom category list resolves in its own order, enabled at its own defaults", () => {
  const list = [
    custom("zeta", undefined, { votes: 2 }),
    custom("alpha"),
    custom("mid", undefined, { a: 1, b: 0.5 }),
  ];
  assert.deepEqual(resolveCategories({}, list), [
    { id: "zeta", label: "zeta label", why: "zeta why.", enabled: true, thresholds: { votes: 2 } },
    { id: "alpha", label: "alpha label", why: "alpha why.", enabled: true, thresholds: {} },
    { id: "mid", label: "mid label", why: "mid why.", enabled: true, thresholds: { a: 1, b: 0.5 } },
  ]);
  assert.deepEqual(resolveCategories(undefined, list), resolveCategories({}, list));
});

test("[happy-10] the last shipped category resolves with its own label, why and defaults", () => {
  const resolved = resolveCategories();
  assert.deepEqual(resolved[5], {
    id: "deadline-exposed",
    label: "Deadline exposed",
    why: "A due date or release is close and it is not in a sprint.",
    enabled: true,
    thresholds: { withinDays: 14 },
  });
  assert.deepEqual(resolveCategories(undefined), defaultResolved());
});

test("[happy-10] an empty category list resolves to an empty list", () => {
  assert.deepEqual(resolveCategories({}, []), []);
});

// Extends "[happy-11] a threshold override replaces only that threshold":
// several categories overridden at once.
test("[happy-11] overrides on several categories at once each replace only their own thresholds", () => {
  const resolved = resolveCategories({
    "always-next-sprint": { thresholds: { sprints: 6 } },
    "quietly-wanted": { thresholds: { votes: 1, comments: 25 } },
    "deadline-exposed": { thresholds: { withinDays: 7 } },
  });
  const expected = defaultResolved().map((category) => {
    switch (category.id) {
      case "always-next-sprint":
        return { ...category, thresholds: { sprints: 6 } };
      case "quietly-wanted":
        return {
          ...category,
          thresholds: { votes: 1, watchers: 5, duplicates: 2, comments: 25 },
        };
      case "deadline-exposed":
        return { ...category, thresholds: { withinDays: 7 } };
      default:
        return category;
    }
  });
  assert.deepEqual(resolved, expected);
});

test("[happy-11] every threshold of a category can be overridden, and an override may equal the default", () => {
  assert.deepEqual(
    byId(
      resolveCategories({
        "quietly-wanted": {
          thresholds: { votes: 9, watchers: 8, duplicates: 7, comments: 6 },
        },
        "left-behind": { thresholds: { openDays: 180, quietDays: 45 } },
      }),
      "quietly-wanted",
    ).thresholds,
    { votes: 9, watchers: 8, duplicates: 7, comments: 6 },
  );
  assert.deepEqual(
    byId(
      resolveCategories({
        "left-behind": { thresholds: { openDays: 180, quietDays: 45 } },
      }),
      "left-behind",
    ).thresholds,
    { openDays: 180, quietDays: 45 },
  );
});

test("[happy-11] a custom category's thresholds are overridden the same way", () => {
  const list = [custom("own", undefined, { limit: 4, floor: 1 })];
  assert.deepEqual(
    resolveCategories({ own: { thresholds: { floor: 2 } } }, list),
    [
      {
        id: "own",
        label: "own label",
        why: "own why.",
        enabled: true,
        thresholds: { limit: 4, floor: 2 },
      },
    ],
  );
});

// Extends "[boundary-16] a null, undefined, negative or non-finite override
// keeps the default": other categories and other values.
test("[boundary-16] each threshold is judged on its own, across categories and invalid values", () => {
  const resolved = resolveCategories({
    "left-behind": { thresholds: { openDays: -5, quietDays: 7 } },
    "quietly-wanted": {
      thresholds: {
        votes: Number.NEGATIVE_INFINITY,
        watchers: -0.001,
        duplicates: 0,
        comments: Number.NaN,
      },
    },
    "holding-others-up": { thresholds: { blocks: 1e9 } },
    "paper-cuts": { thresholds: { openDays: 0.25 } },
    "deadline-exposed": { thresholds: { withinDays: null } },
  });
  assert.deepEqual(byId(resolved, "left-behind").thresholds, {
    openDays: 180,
    quietDays: 7,
  });
  assert.deepEqual(byId(resolved, "quietly-wanted").thresholds, {
    votes: 3,
    watchers: 5,
    duplicates: 0,
    comments: 10,
  });
  assert.deepEqual(byId(resolved, "holding-others-up").thresholds, { blocks: 1e9 });
  assert.deepEqual(byId(resolved, "paper-cuts").thresholds, { openDays: 0.25 });
  assert.deepEqual(byId(resolved, "deadline-exposed").thresholds, { withinDays: 14 });
});

// Extends "[boundary-17] unknown thresholds are ignored": more unknown keys,
// including inherited property names, and a category with no defaults.
test("[boundary-17] unknown thresholds of any name are ignored, even for a category with no defaults", () => {
  const resolved = resolveCategories({
    "left-behind": { thresholds: { openDays: 200, toString: 1, constructor: 2, sprints: 3 } },
    "always-next-sprint": { thresholds: { openDays: 1 } },
  });
  assert.deepEqual(byId(resolved, "left-behind").thresholds, {
    openDays: 200,
    quietDays: 90,
  });
  assert.deepEqual(byId(resolved, "always-next-sprint").thresholds, { sprints: 3 });
  assert.deepEqual(
    resolveCategories({ bare: { thresholds: { anything: 5 } } }, [custom("bare")])[0]?.thresholds,
    {},
  );
});

// Extends "[boundary-17] unknown categories are ignored ...": several unknown
// ids, one of them the reserved id, carrying settings of their own.
test("[boundary-17] unknown category ids, including the reserved one, change nothing", () => {
  const resolved = resolveCategories({
    uncategorized: { enabled: false },
    "no-such-category": { thresholds: { sprints: 1 } },
  });
  assert.deepEqual(resolved, defaultResolved());
});

// Extends "[happy-12] enabled defaults to true ..." and "[happy-12] enabled
// false switches a category off ...": other categories, and several at once.
test("[happy-12] several categories switched off stay listed in order while the rest stay on", () => {
  const resolved = resolveCategories({
    "left-behind": { enabled: false },
    "paper-cuts": { enabled: false, thresholds: { openDays: 3 } },
    "holding-others-up": { enabled: true },
    "deadline-exposed": { enabled: undefined },
  });
  assert.deepEqual(
    resolved.map((category) => [category.id, category.enabled]),
    [
      ["left-behind", false],
      ["always-next-sprint", true],
      ["quietly-wanted", true],
      ["holding-others-up", true],
      ["paper-cuts", false],
      ["deadline-exposed", true],
    ],
  );
  assert.deepEqual(byId(resolved, "paper-cuts").thresholds, { openDays: 3 });
  assert.deepEqual(byId(resolved, "left-behind").thresholds, {
    openDays: 180,
    quietDays: 90,
  });
});

test("[happy-12] an explicit undefined enabled with thresholds still counts as on", () => {
  const resolved = byId(
    resolveCategories({
      "always-next-sprint": { enabled: undefined, thresholds: { sprints: 4 } },
    }),
    "always-next-sprint",
  );
  assert.equal(resolved.enabled, true);
  assert.deepEqual(resolved.thresholds, { sprints: 4 });
});

// Extends "[boundary-18] each resolve returns fresh objects": every entry, not
// just the first.
test("[boundary-18] every resolved category is a fresh object on every call", () => {
  const R1 = resolveCategories();
  const R2 = resolveCategories();
  assert.notEqual(R1, R2);
  assert.equal(R1.length, 6);
  for (let i = 0; i < R1.length; i += 1) {
    assert.notEqual(R1[i], R2[i], String(i));
    assert.notEqual(R1[i], CATEGORIES[i], String(i));
  }
});

// Extends "[boundary-18] resolving with an override never changes the
// registry's defaults": overrides on all six, and a custom category whose
// defaults are not frozen.
test("[boundary-18] overriding every category leaves every registry defaults object as shipped", () => {
  resolveCategories({
    "left-behind": { thresholds: { openDays: 1, quietDays: 1 } },
    "always-next-sprint": { thresholds: { sprints: 1 } },
    "quietly-wanted": { thresholds: { votes: 1, watchers: 1, duplicates: 1, comments: 1 } },
    "holding-others-up": { thresholds: { blocks: 9 } },
    "paper-cuts": { thresholds: { openDays: 1 } },
    "deadline-exposed": { thresholds: { withinDays: 1 } },
  });
  assert.deepEqual(
    CATEGORIES.map((category) => category.defaults),
    REGISTRY.map((category) => ({ ...category.defaults })),
  );
  assert.deepEqual(resolveCategories(), defaultResolved());
});

test("[boundary-18] resolving with an override does not modify an unfrozen custom category's defaults", () => {
  const defaults: Record<string, number> = { votes: 1, watchers: 2 };
  const category = custom("own", undefined, defaults);
  const R1 = resolveCategories({ own: { thresholds: { votes: 5 } } }, [category]);
  assert.deepEqual(R1[0]?.thresholds, { votes: 5, watchers: 2 });
  assert.deepEqual(defaults, { votes: 1, watchers: 2 });
  assert.deepEqual(resolveCategories({}, [category])[0]?.thresholds, {
    votes: 1,
    watchers: 2,
  });
});

// Extends "[unhappy-3] a category list with a duplicate id is refused": the
// duplicates are not adjacent, one copies a shipped id, or one is disabled.
test("[unhappy-3] duplicates that are not next to each other are refused, naming the id", () => {
  const categories = [custom("a"), custom("dup"), custom("b"), custom("c"), custom("dup")];
  assertRefused(() => resolveCategories({}, categories), "Duplicate category id: dup");
  assertRefused(() => createClassifier({}, categories), "Duplicate category id: dup");
});

test("[unhappy-3] a shipped id repeated in an extended list is refused", () => {
  const leftBehind = shipped("left-behind");
  const categories = [...CATEGORIES, { ...leftBehind, label: "Again" }];
  assertRefused(() => resolveCategories({}, categories), "Duplicate category id: left-behind");
  assertRefused(() => createClassifier({}, categories), "Duplicate category id: left-behind");
});

test("[unhappy-3] a duplicate or reserved id is refused even when the config disables it", () => {
  const duplicated = [custom("x"), custom("x")];
  assertRefused(
    () => resolveCategories({ x: { enabled: false } }, duplicated),
    "Duplicate category id: x",
  );
  assertRefused(
    () => createClassifier({ x: { enabled: false } }, duplicated),
    "Duplicate category id: x",
  );
  const reserved = [custom("ok"), custom("uncategorized")];
  assertRefused(
    () => resolveCategories({ uncategorized: { enabled: false } }, reserved),
    "Reserved category id: uncategorized",
  );
  assertRefused(
    () => createClassifier({ uncategorized: { enabled: false } }, reserved),
    "Reserved category id: uncategorized",
  );
});

test("[unhappy-3] classify refuses the same lists, as createClassifier applied once", () => {
  assertRefused(
    () => classify(BASE_FACTS, {}, [custom("y"), custom("z"), custom("y")]),
    "Duplicate category id: y",
  );
  assertRefused(
    () => classify(BASE_FACTS, {}, [...CATEGORIES, custom(UNCATEGORIZED)]),
    "Reserved category id: uncategorized",
  );
});

// Extends "[happy-13] each shipped category matches at its defaults with its
// reason": other facts that fit each category on its own.
test("[happy-13] each shipped category matches other facts at its defaults, with the first letter of the reason upper-cased", () => {
  const cases: [Partial<IssueFacts>, string, string, string][] = [
    [{ closedSprintCount: 5 }, "always-next-sprint", "Always next sprint", "Carried over 5 sprints"],
    [{ commentCount: 10 }, "quietly-wanted", "Quietly wanted", "10 comments"],
    [{ duplicateLinks: 2 }, "quietly-wanted", "Quietly wanted", "2 duplicates"],
    [{ watchers: 6, commentCount: 9 }, "quietly-wanted", "Quietly wanted", "6 watchers"],
    [
      { votes: 3, watchers: 5, duplicateLinks: 2, commentCount: 10 },
      "quietly-wanted",
      "Quietly wanted",
      "3 votes, 5 watchers, 2 duplicates, 10 comments",
    ],
    [
      { blocksOpenCount: 1 },
      "holding-others-up",
      "Holding others up",
      "Blocks 1 open ticket, unassigned",
    ],
    [
      {
        isBug: true,
        priorityName: "Minor",
        priorityRank: "low",
        ageDays: 30,
        assigned: true,
        inSprint: true,
      },
      "paper-cuts",
      "Paper cuts",
      "A bug, Minor priority, open 30 days",
    ],
    [
      { release: { name: "2.4", inDays: 5 } },
      "deadline-exposed",
      "Deadline exposed",
      "Release 2.4 due in 5 days",
    ],
    [
      { release: { name: "2.4", inDays: 0 } },
      "deadline-exposed",
      "Deadline exposed",
      "Release 2.4 due today",
    ],
    [{ dueInDays: 0 }, "deadline-exposed", "Deadline exposed", "Due today"],
    [{ dueInDays: -2 }, "deadline-exposed", "Deadline exposed", "Overdue by 2 days"],
  ];
  for (const [changes, id, label, reason] of cases) {
    assert.deepEqual(
      classify(factsWith(changes)),
      [{ id, label, reason }],
      JSON.stringify(changes),
    );
  }
});

test("[happy-13] facts that miss one part of a shipped rule match nothing", () => {
  const cases: Partial<IssueFacts>[] = [
    { ageDays: 400, daysSinceUpdate: 200, inSprint: true, assigned: true },
    { ageDays: 400, daysSinceUpdate: 89, assigned: true },
    { blocksOpenCount: 4, assigned: true },
    { isBug: true, priorityName: "Low", priorityRank: "medium", ageDays: 45 },
    { isBug: true, priorityName: "Low", priorityRank: "low", ageDays: 29 },
    { votes: 2, watchers: 4, duplicateLinks: 1, commentCount: 9 },
    { release: { name: "2.4", inDays: 15 } },
  ];
  for (const changes of cases) {
    assert.deepEqual(classify(factsWith(changes)), [], JSON.stringify(changes));
  }
});

// Extends "[happy-14] an issue can fit several categories, returned in
// registry order": a different set of five, whose ids are not in alphabetical
// order, and a custom list kept in its own order.
test("[happy-14] five categories including left-behind come back in registry order", () => {
  const F = factsWith({
    ageDays: 400,
    daysSinceUpdate: 100,
    votes: 3,
    watchers: 5,
    blocksOpenCount: 2,
    isBug: true,
    priorityName: "Lowest",
    priorityRank: "low",
    release: { name: "5.0", inDays: -1 },
  });
  assert.deepEqual(classify(F), [
    {
      id: "left-behind",
      label: "Left behind",
      reason: "Open 400 days, no update in 100 days, never in a sprint",
    },
    { id: "quietly-wanted", label: "Quietly wanted", reason: "3 votes, 5 watchers" },
    {
      id: "holding-others-up",
      label: "Holding others up",
      reason: "Blocks 2 open tickets, unassigned",
    },
    {
      id: "paper-cuts",
      label: "Paper cuts",
      reason: "A bug, Lowest priority, open 400 days",
    },
    {
      id: "deadline-exposed",
      label: "Deadline exposed",
      reason: "Release 5.0 overdue by 1 day",
    },
  ]);
});

test("[happy-14] matches from a custom list come back in that list's order", () => {
  const list = [
    custom("zulu", () => A),
    custom("never", () => N),
    custom("alpha", () => B),
    custom("mike", () => all()),
  ];
  assert.deepEqual(classify(BASE_FACTS, {}, list), [
    { id: "zulu", label: "zulu label", reason: "Alpha" },
    { id: "alpha", label: "alpha label", reason: "Beta" },
    { id: "mike", label: "mike label", reason: "mike why." },
  ]);
});

// Extends "[boundary-19] an issue that fits nothing gets an empty list": the
// base facts themselves, everything disabled, and custom lists.
test("[boundary-19] unassigned base facts, or an issue with every fitting category disabled, get an empty list", () => {
  assert.deepEqual(classify(BASE_FACTS), []);
  assert.deepEqual(
    classify(MANY, {
      "left-behind": { enabled: false },
      "paper-cuts": { enabled: false },
      "deadline-exposed": { enabled: false },
    }),
    [],
  );
});

test("[boundary-19] a custom list that nothing matches, or no categories at all, gives an empty list", () => {
  assert.deepEqual(
    classify(BASE_FACTS, {}, [custom("n1", () => N), custom("n2", () => any())]),
    [],
  );
  assert.deepEqual(classify(MANY, {}, []), []);
  assert.deepEqual(createClassifier({}, [])(MANY), []);
});

// Extends "[boundary-20] a silent clause lets a category match without
// appearing in the reason": the silent clause beside another category's
// match, on a release, and in a custom rule.
test("[boundary-20] carried-over issues not in a sprint fit quietly-wanted without a not-in-sprint clause", () => {
  assert.deepEqual(classify(factsWith({ closedSprintCount: 3, votes: 3 })), [
    {
      id: "always-next-sprint",
      label: "Always next sprint",
      reason: "Carried over 3 sprints",
    },
    { id: "quietly-wanted", label: "Quietly wanted", reason: "3 votes" },
  ]);
});

test("[boundary-20] a release deadline matches only out of a sprint, and the silent clause stays out of the reason", () => {
  assert.deepEqual(classify(factsWith({ release: { name: "R", inDays: 2 } })), [
    { id: "deadline-exposed", label: "Deadline exposed", reason: "Release R due in 2 days" },
  ]);
  assert.deepEqual(
    classify(factsWith({ release: { name: "R", inDays: 2 }, inSprint: true })),
    [],
  );
});

test("[boundary-20] a silent signal in a custom rule gates the match but not the reason", () => {
  const list = [custom("gated", () => all(silent(A), B, silent(N)))];
  assert.deepEqual(classify(BASE_FACTS, {}, list), []);
  const open = [custom("open", () => all(silent(A), B))];
  assert.deepEqual(classify(BASE_FACTS, {}, open), [
    { id: "open", label: "open label", reason: "Beta" },
  ]);
});

// Extends "[happy-15] a threshold override makes a category match": overrides
// of every other category, in both directions.
test("[happy-15] lowering thresholds makes other categories match", () => {
  assert.deepEqual(
    classify(factsWith({ ageDays: 30, daysSinceUpdate: 10 })),
    [],
  );
  assert.deepEqual(
    classify(factsWith({ ageDays: 30, daysSinceUpdate: 10 }), {
      "left-behind": { thresholds: { openDays: 30, quietDays: 10 } },
    }),
    [
      {
        id: "left-behind",
        label: "Left behind",
        reason: "Open 30 days, no update in 10 days, never in a sprint",
      },
    ],
  );
  assert.deepEqual(
    classify(factsWith({ votes: 1 }), { "quietly-wanted": { thresholds: { votes: 1 } } }),
    [{ id: "quietly-wanted", label: "Quietly wanted", reason: "1 vote" }],
  );
  assert.deepEqual(
    classify(
      factsWith({ isBug: true, priorityName: "Low", priorityRank: "low", ageDays: 0 }),
      { "paper-cuts": { thresholds: { openDays: 0 } } },
    ),
    [{ id: "paper-cuts", label: "Paper cuts", reason: "A bug, Low priority, open 0 days" }],
  );
  assert.deepEqual(
    classify(factsWith({ dueInDays: 30 }), {
      "deadline-exposed": { thresholds: { withinDays: 30 } },
    }),
    [{ id: "deadline-exposed", label: "Deadline exposed", reason: "Due in 30 days" }],
  );
});

test("[happy-15] raising thresholds stops categories that match at their defaults", () => {
  assert.deepEqual(
    classify(factsWith({ ageDays: 400, daysSinceUpdate: 200 }), {
      "left-behind": { thresholds: { openDays: 500 } },
    }),
    [],
  );
  assert.deepEqual(
    classify(factsWith({ blocksOpenCount: 2 }), {
      "holding-others-up": { thresholds: { blocks: 3 } },
    }),
    [],
  );
  assert.deepEqual(
    classify(factsWith({ dueInDays: 1 }), {
      "deadline-exposed": { thresholds: { withinDays: 0 } },
    }),
    [],
  );
  assert.deepEqual(
    classify(factsWith({ dueInDays: -1 }), {
      "deadline-exposed": { thresholds: { withinDays: 0 } },
    }),
    [{ id: "deadline-exposed", label: "Deadline exposed", reason: "Overdue by 1 day" }],
  );
});

test("[happy-15] an invalid override keeps the default match, and several overrides apply together", () => {
  assert.deepEqual(
    classify(factsWith({ blocksOpenCount: 1 }), {
      "holding-others-up": { thresholds: { blocks: Number.NaN } },
    }),
    [
      {
        id: "holding-others-up",
        label: "Holding others up",
        reason: "Blocks 1 open ticket, unassigned",
      },
    ],
  );
  assert.deepEqual(
    classify(MANY, {
      "left-behind": { enabled: false },
      "deadline-exposed": { thresholds: { withinDays: 2 } },
    }),
    [
      {
        id: "paper-cuts",
        label: "Paper cuts",
        reason: "A bug, Trivial priority, open 400 days",
      },
    ],
  );
});

// Extends "[boundary-21] a rule that matches with no clauses gives the
// category's why": the why is used as written, and only when there are no
// clauses.
test("[boundary-21] the why is the reason exactly as written, without upper-casing", () => {
  const category: Category = {
    id: "lower",
    label: "Lower",
    why: "everything qualifies, really.",
    defaults: {},
    rule: () => any(Q),
  };
  assert.deepEqual(classify(BASE_FACTS, {}, [category]), [
    { id: "lower", label: "Lower", reason: "everything qualifies, really." },
  ]);
});

test("[boundary-21] in one list, a category with clauses uses them and one without uses its why", () => {
  const list = [
    custom("talks", () => all(Q, A)),
    custom("mute", () => all(Q, silent(B))),
  ];
  assert.deepEqual(classify(BASE_FACTS, {}, list), [
    { id: "talks", label: "talks label", reason: "Alpha" },
    { id: "mute", label: "mute label", reason: "mute why." },
  ]);
});

// Extends "[happy-16] createClassifier builds each enabled rule once and is
// reusable": overridden thresholds reach the rule, and more calls.
test("[happy-16] each enabled rule is built once with its resolved thresholds and used on every call", () => {
  const one = countingCategory("one", { votes: 1, watchers: 2 });
  const two = countingCategory("two", { votes: 9 });
  const three = countingCategory("three", { votes: 3 });
  const C = createClassifier(
    {
      one: { thresholds: { votes: 4, bogus: 1, watchers: null } },
      two: { enabled: false },
    },
    [one.category, two.category, three.category],
  );
  assert.equal(one.calls.length, 1);
  assert.deepEqual(one.calls[0], { votes: 4, watchers: 2 });
  assert.equal(two.calls.length, 0);
  assert.equal(three.calls.length, 1);
  assert.deepEqual(three.calls[0], { votes: 3 });

  const results = [0, 3, 4, 10, 3].map((votes) => C(factsWith({ votes })));
  assert.deepEqual(results, [
    [],
    [{ id: "three", label: "THREE", reason: "3 votes" }],
    [
      { id: "one", label: "ONE", reason: "4 votes" },
      { id: "three", label: "THREE", reason: "4 votes" },
    ],
    [
      { id: "one", label: "ONE", reason: "10 votes" },
      { id: "three", label: "THREE", reason: "10 votes" },
    ],
    [{ id: "three", label: "THREE", reason: "3 votes" }],
  ]);
  assert.equal(one.calls.length, 1);
  assert.equal(two.calls.length, 0);
  assert.equal(three.calls.length, 1);
});

test("[happy-16] the shipped default classifier is reusable across many facts", () => {
  const C = createClassifier();
  assert.deepEqual(C(BASE_FACTS), []);
  assert.deepEqual(C(factsWith({ closedSprintCount: 4, inSprint: true })), [
    { id: "always-next-sprint", label: "Always next sprint", reason: "Carried over 4 sprints" },
  ]);
  assert.deepEqual(C(BASE_FACTS), []);
  assert.deepEqual(C(factsWith({ blocksOpenCount: 1 })), [
    {
      id: "holding-others-up",
      label: "Holding others up",
      reason: "Blocks 1 open ticket, unassigned",
    },
  ]);
});

// Extends "[boundary-22] classify gives the same result as createClassifier
// applied once": custom lists, threshold overrides, and a fresh build each call.
test("[boundary-22] classify equals createClassifier applied once for custom lists and threshold overrides", () => {
  const one = countingCategory("one", { votes: 2 });
  const K: CategoryConfig = { one: { thresholds: { votes: 5 } } };
  for (const votes of [1, 5, 8]) {
    const F = factsWith({ votes });
    assert.deepEqual(
      classify(F, K, [one.category]),
      createClassifier(K, [one.category])(F),
      String(votes),
    );
  }
  assert.deepEqual(classify(factsWith({ votes: 5 }), K, [one.category]), [
    { id: "one", label: "ONE", reason: "5 votes" },
  ]);
  assert.deepEqual(classify(factsWith({ votes: 4 }), K, [one.category]), []);
});

test("[boundary-22] each classify call builds the enabled rules afresh, once", () => {
  const one = countingCategory("one", { votes: 1 });
  const off = countingCategory("off", {});
  const list = [one.category, off.category];
  const K: CategoryConfig = { off: { enabled: false } };
  classify(factsWith({ votes: 1 }), K, list);
  assert.equal(one.calls.length, 1);
  classify(factsWith({ votes: 1 }), K, list);
  assert.equal(one.calls.length, 2);
  assert.equal(off.calls.length, 0);
});

test("[boundary-22] classifiers with different thresholds, called alternately, keep their own thresholds", () => {
  const F = factsWith({ closedSprintCount: 2, assigned: true });
  const lowered = createClassifier({
    "always-next-sprint": { thresholds: { sprints: 2 } },
  });
  const shippedDefaults = createClassifier();
  const match = [
    { id: "always-next-sprint", label: "Always next sprint", reason: "Carried over 2 sprints" },
  ];
  assert.deepEqual(lowered(F), match);
  assert.deepEqual(shippedDefaults(F), []);
  assert.deepEqual(lowered(F), match);
  assert.deepEqual(shippedDefaults(F), []);
  assert.deepEqual(classify(F, { "always-next-sprint": { thresholds: { sprints: 2 } } }), match);
  assert.deepEqual(classify(F), []);
  assert.deepEqual(lowered(F), match);
});
