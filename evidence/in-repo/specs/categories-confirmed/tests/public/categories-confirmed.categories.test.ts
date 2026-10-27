import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CATEGORIES,
  UNCATEGORIZED,
  all,
  classify,
  createClassifier,
  resolveCategories,
  signal,
  type Category,
  type CategoryConfig,
  type IssueFacts,
  type Rule,
  type Thresholds,
} from "../src/selection/index.js";

/**
 * The registry of six categories, a board's overrides of it, and the
 * classifier that says which enabled categories an issue's facts fit and why.
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
    why: "The team has shown it won't reach this, so outsourcing takes nothing off the roadmap.",
    defaults: { minAgeDays: 180, minQuietDays: 90 },
  },
  {
    id: "always-next-sprint",
    label: "Always next sprint",
    why: "Already planned and wanted; the only blocker is capacity.",
    defaults: { minSprints: 2 },
  },
  {
    id: "quietly-wanted",
    label: "Quietly wanted",
    why: "Shows demand that the priority field hides, which justifies a higher bounty.",
    defaults: { minVotes: 3, minWatchers: 5, minDuplicates: 1, minComments: 5 },
  },
  {
    id: "holding-others-up",
    label: "Holding others up",
    why: "One bounty unblocks several tickets the team will do in-house.",
    defaults: { minBlocked: 1 },
  },
  {
    id: "paper-cuts",
    label: "Paper cuts",
    why: "Small, self-contained bugs are what agents fix most reliably, and users notice when they're gone.",
    defaults: { minAgeDays: 90 },
  },
  {
    id: "deadline-exposed",
    label: "Deadline exposed",
    why: "The deadline justifies paying now rather than waiting for capacity.",
    defaults: { withinDays: 30 },
  },
];

const DEFAULT_RESOLVED = REGISTRY.map((entry) => ({
  id: entry.id,
  label: entry.label,
  why: entry.why,
  enabled: true,
  thresholds: entry.defaults,
}));

function resolvedById(config: CategoryConfig, id: string) {
  const found = resolveCategories(config).find((c) => c.id === id);
  assert.ok(found, `no resolved category ${id}`);
  return found;
}

const LEFT_BEHIND_MATCH = {
  id: "left-behind",
  label: "Left behind",
  reason: "Open 400 days, never in a sprint, unassigned",
};

test("[happy-9] the registry lists six categories in a fixed order with their labels, whys and defaults", () => {
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
    CATEGORIES.map((c) => ({
      id: c.id,
      label: c.label,
      why: c.why,
      defaults: c.defaults,
    })),
    REGISTRY,
  );
});

test('[happy-9] no category id equals UNCATEGORIZED, which is "uncategorized"', () => {
  assert.equal(UNCATEGORIZED, "uncategorized");
  for (const category of CATEGORIES) {
    assert.notEqual(category.id, UNCATEGORIZED);
  }
});

test("[happy-10] with no config every category is enabled at its defaults, in registry order", () => {
  const resolved = resolveCategories();
  assert.equal(resolved.length, 6);
  assert.deepEqual(resolved[0], {
    id: "left-behind",
    label: "Left behind",
    why: "The team has shown it won't reach this, so outsourcing takes nothing off the roadmap.",
    enabled: true,
    thresholds: { minAgeDays: 180, minQuietDays: 90 },
  });
  assert.deepEqual(resolved, DEFAULT_RESOLVED);
});

test("[happy-10] an empty config resolves the same as no config", () => {
  assert.deepEqual(resolveCategories({}), resolveCategories());
  assert.deepEqual(resolveCategories({}), DEFAULT_RESOLVED);
});

test("[happy-11] a threshold override replaces only that threshold", () => {
  const resolved = resolveCategories({
    "left-behind": { thresholds: { minAgeDays: 365 } },
  });
  assert.deepEqual(resolved[0]?.thresholds, {
    minAgeDays: 365,
    minQuietDays: 90,
  });
  assert.deepEqual(resolved.slice(1), DEFAULT_RESOLVED.slice(1));
});

test("[happy-11] an empty thresholds override keeps every default", () => {
  assert.deepEqual(
    resolveCategories({ "left-behind": { thresholds: {} } }),
    DEFAULT_RESOLVED,
  );
});

test("[boundary-16] an override that is null, undefined or not finite keeps the default; any finite number replaces it", () => {
  const examples: [number | null | undefined, number][] = [
    [5, 5],
    [0, 0],
    [2.5, 2.5],
    [null, 2],
    [undefined, 2],
    [-1, -1],
    [Number.NaN, 2],
    [Number.POSITIVE_INFINITY, 2],
  ];
  for (const [value, resolved] of examples) {
    assert.deepEqual(
      resolvedById(
        { "always-next-sprint": { thresholds: { minSprints: value } } },
        "always-next-sprint",
      ).thresholds,
      { minSprints: resolved },
      `minSprints ${value}`,
    );
  }
});

test("[boundary-17] unknown thresholds and unknown categories are ignored", () => {
  const resolved = resolveCategories({
    "paper-cuts": { thresholds: { minAgeDays: 60, minVotes: 9 } },
    "no-such-category": { enabled: false },
  });
  assert.deepEqual(
    resolved.find((c) => c.id === "paper-cuts")?.thresholds,
    { minAgeDays: 60 },
  );
  assert.deepEqual(
    resolved.map((c) => c.id),
    REGISTRY.map((entry) => entry.id),
  );
});

test("[happy-12] enabled defaults to true unless the settings say false", () => {
  const examples: [string, CategoryConfig][] = [
    ["undefined", { "quietly-wanted": undefined }],
    ["{}", { "quietly-wanted": {} }],
    ["{ enabled: true }", { "quietly-wanted": { enabled: true } }],
  ];
  for (const [name, config] of examples) {
    const resolved = resolvedById(config, "quietly-wanted");
    assert.equal(resolved.enabled, true, name);
    assert.deepEqual(
      resolved.thresholds,
      { minVotes: 3, minWatchers: 5, minDuplicates: 1, minComments: 5 },
      name,
    );
  }
});

test("[happy-12] only false switches a category off, and its thresholds still resolve", () => {
  const off = resolvedById(
    { "quietly-wanted": { enabled: false } },
    "quietly-wanted",
  );
  assert.equal(off.enabled, false);
  assert.deepEqual(off.thresholds, {
    minVotes: 3,
    minWatchers: 5,
    minDuplicates: 1,
    minComments: 5,
  });

  const offWithOverride = resolvedById(
    { "quietly-wanted": { enabled: false, thresholds: { minComments: 4 } } },
    "quietly-wanted",
  );
  assert.equal(offWithOverride.enabled, false);
  assert.deepEqual(offWithOverride.thresholds, {
    minVotes: 3,
    minWatchers: 5,
    minDuplicates: 1,
    minComments: 4,
  });
});

test("[boundary-18] resolving returns fresh objects and never changes the registry", () => {
  const R1 = resolveCategories({
    "left-behind": { thresholds: { minAgeDays: 1 } },
  });
  assert.deepEqual(R1[0]?.thresholds, { minAgeDays: 1, minQuietDays: 90 });
  assert.deepEqual(CATEGORIES[0]?.defaults, {
    minAgeDays: 180,
    minQuietDays: 90,
  });
  assert.notEqual(resolveCategories()[0], R1[0]);
});

test("[happy-13] each shipped category matches at its defaults with its reason", () => {
  const examples: [Partial<IssueFacts>, string, string, string][] = [
    [
      { ageDays: 400, daysSinceUpdate: 200 },
      "left-behind",
      "Left behind",
      "Open 400 days, never in a sprint, unassigned",
    ],
    [
      {
        closedSprintCount: 3,
        carriedSince: "February",
        inSprint: true,
        assigned: true,
      },
      "always-next-sprint",
      "Always next sprint",
      "Carried over 3 sprints since February",
    ],
    [
      {
        votes: 4,
        watchers: 7,
        priorityName: "Low",
        priorityRank: "low",
        closedSprintCount: 1,
      },
      "quietly-wanted",
      "Quietly wanted",
      "4 votes, 7 watchers, priority Low",
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
        ageDays: 120,
        daysSinceUpdate: 1,
        inSprint: true,
      },
      "paper-cuts",
      "Paper cuts",
      "Low-priority bug, open 120 days",
    ],
    [
      { dueInDays: 10, closedSprintCount: 1 },
      "deadline-exposed",
      "Deadline exposed",
      "Due in 10 days, not in any sprint",
    ],
  ];
  for (const [changes, id, label, reason] of examples) {
    assert.deepEqual(
      classify(factsWith(changes)),
      [{ id, label, reason }],
      id,
    );
  }
});

test("[happy-13] each shipped category matches exactly at its default thresholds", () => {
  const examples: [Partial<IssueFacts>, string, string, string][] = [
    [
      { ageDays: 180, daysSinceUpdate: 90 },
      "left-behind",
      "Left behind",
      "Open 180 days, never in a sprint, unassigned",
    ],
    [
      { closedSprintCount: 2, inSprint: true, assigned: true },
      "always-next-sprint",
      "Always next sprint",
      "Carried over 2 sprints",
    ],
    [
      {
        votes: 3,
        watchers: 5,
        commentCount: 5,
        duplicateLinks: 1,
        priorityName: "Low",
        priorityRank: "low",
        closedSprintCount: 1,
      },
      "quietly-wanted",
      "Quietly wanted",
      "3 votes, 5 watchers, 5 comments, 1 duplicate linked, priority Low",
    ],
    [
      { blocksOpenCount: 1, inSprint: true },
      "holding-others-up",
      "Holding others up",
      "Blocks 1 open ticket, unassigned",
    ],
    [
      {
        isBug: true,
        priorityName: "Medium",
        priorityRank: "medium",
        ageDays: 90,
        daysSinceUpdate: 1,
        inSprint: true,
      },
      "paper-cuts",
      "Paper cuts",
      "Medium-priority bug, open 90 days",
    ],
    [
      { dueInDays: 30, closedSprintCount: 1 },
      "deadline-exposed",
      "Deadline exposed",
      "Due in 30 days, not in any sprint",
    ],
  ];
  for (const [changes, id, label, reason] of examples) {
    assert.deepEqual(
      classify(factsWith(changes)),
      [{ id, label, reason }],
      id,
    );
  }
});

test("[happy-14] an issue can fit several categories, and matches come in registry order", () => {
  const facts = factsWith({
    ageDays: 400,
    daysSinceUpdate: 200,
    isBug: true,
    priorityName: "Trivial",
    priorityRank: "low",
    dueInDays: 3,
  });
  assert.deepEqual(classify(facts), [
    LEFT_BEHIND_MATCH,
    {
      id: "paper-cuts",
      label: "Paper cuts",
      reason: "Trivial-priority bug, open 400 days",
    },
    {
      id: "deadline-exposed",
      label: "Deadline exposed",
      reason: "Due in 3 days, not in any sprint",
    },
  ]);
});

test("[happy-14] an issue fitting five categories gets all five in registry order", () => {
  const facts = factsWith({
    ageDays: 90,
    closedSprintCount: 2,
    votes: 3,
    priorityName: "Low",
    priorityRank: "low",
    blocksOpenCount: 1,
    isBug: true,
    dueInDays: 0,
  });
  assert.deepEqual(classify(facts), [
    {
      id: "always-next-sprint",
      label: "Always next sprint",
      reason: "Carried over 2 sprints",
    },
    {
      id: "quietly-wanted",
      label: "Quietly wanted",
      reason: "3 votes, priority Low",
    },
    {
      id: "holding-others-up",
      label: "Holding others up",
      reason: "Blocks 1 open ticket, unassigned",
    },
    {
      id: "paper-cuts",
      label: "Paper cuts",
      reason: "Low-priority bug, open 90 days",
    },
    {
      id: "deadline-exposed",
      label: "Deadline exposed",
      reason: "Due today, not in any sprint",
    },
  ]);
});

test("[boundary-19] an issue that fits nothing gets an empty list, never UNCATEGORIZED", () => {
  assert.deepEqual(classify(factsWith({ assigned: true })), []);
});

test("[boundary-20] a silent clause can make or break a match without appearing in the reason", () => {
  const facts = factsWith({ ageDays: 400, daysSinceUpdate: 200 });
  assert.deepEqual(classify(facts), [LEFT_BEHIND_MATCH]);
  assert.deepEqual(classify({ ...facts, daysSinceUpdate: 10 }), []);
  assert.deepEqual(classify(factsWith({ dueInDays: 5 })), [
    {
      id: "deadline-exposed",
      label: "Deadline exposed",
      reason: "Due in 5 days, not in any sprint",
    },
  ]);
  assert.deepEqual(classify(factsWith({ dueInDays: 5, assigned: true })), []);
});

test("[happy-15] overrides change what matches", () => {
  const facts = factsWith({ closedSprintCount: 1, assigned: true });
  assert.deepEqual(classify(facts), []);
  assert.deepEqual(
    classify(facts, { "always-next-sprint": { thresholds: { minSprints: 1 } } }),
    [
      {
        id: "always-next-sprint",
        label: "Always next sprint",
        reason: "Carried over 1 sprint",
      },
    ],
  );
  assert.deepEqual(
    classify(facts, {
      "always-next-sprint": { enabled: false, thresholds: { minSprints: 1 } },
    }),
    [],
  );
});

test("[happy-15] a threshold overridden to 0 matches an issue with none of it", () => {
  assert.deepEqual(
    classify(factsWith({ assigned: true }), {
      "always-next-sprint": { thresholds: { minSprints: 0 } },
    }),
    [
      {
        id: "always-next-sprint",
        label: "Always next sprint",
        reason: "Carried over 0 sprints",
      },
    ],
  );
});

test("[boundary-21] a rule that matches with no clauses gives the category's label as the reason", () => {
  const custom: Category = {
    id: "all-of-it",
    label: "All of it",
    why: "Everything qualifies.",
    defaults: {},
    rule: () => all(),
  };
  assert.deepEqual(classify(BASE_FACTS, {}, [custom]), [
    { id: "all-of-it", label: "All of it", reason: "All of it" },
  ]);
});

function countingCategories() {
  const calls: Record<string, Thresholds[]> = { one: [], two: [] };
  const counted =
    (id: string) =>
    (thresholds: Thresholds): Rule => {
      calls[id]?.push(thresholds);
      return signal(
        "s",
        (f) => f.votes >= 1,
        (f) => `${f.votes} votes`,
      );
    };
  const one: Category = {
    id: "one",
    label: "One",
    why: "First.",
    defaults: { votes: 1 },
    rule: counted("one"),
  };
  const two: Category = {
    id: "two",
    label: "Two",
    why: "Second.",
    defaults: {},
    rule: counted("two"),
  };
  return { calls, one, two };
}

test("[happy-16] createClassifier builds each enabled rule once and is reusable", () => {
  const { calls, one, two } = countingCategories();
  const C = createClassifier({ two: { enabled: false } }, [one, two]);
  assert.deepEqual(calls.one, [{ votes: 1 }]);
  assert.deepEqual(calls.two, []);

  assert.deepEqual(C(factsWith({ votes: 1 })), [
    { id: "one", label: "One", reason: "1 votes" },
  ]);
  assert.deepEqual(C(BASE_FACTS), []);
  assert.deepEqual(C(factsWith({ votes: 2 })), [
    { id: "one", label: "One", reason: "2 votes" },
  ]);
  assert.equal(calls.one?.length, 1);
});

test("[happy-16] a classifier with every category disabled builds no rule and matches nothing", () => {
  const { calls, one, two } = countingCategories();
  const C = createClassifier(
    { one: { enabled: false }, two: { enabled: false } },
    [one, two],
  );
  assert.deepEqual(C(factsWith({ votes: 5 })), []);
  assert.deepEqual(calls.one, []);
  assert.deepEqual(calls.two, []);
});

test("[boundary-22] classify is createClassifier applied once, and classifiers do not interfere", () => {
  const facts = factsWith({
    ageDays: 400,
    daysSinceUpdate: 200,
    isBug: true,
    priorityName: "Trivial",
    priorityRank: "low",
    dueInDays: 3,
  });
  const K: CategoryConfig = { "paper-cuts": { enabled: false } };
  assert.deepEqual(classify(facts, K), createClassifier(K)(facts));

  const withK = createClassifier(K);
  const withDefaults = createClassifier();
  const aloneK = createClassifier(K)(facts);
  const aloneDefaults = createClassifier()(facts);
  assert.deepEqual(withK(facts), aloneK);
  assert.deepEqual(withDefaults(facts), aloneDefaults);
  assert.deepEqual(withK(facts), aloneK);
  assert.deepEqual(withDefaults(facts), aloneDefaults);
  assert.deepEqual(
    aloneK.map((m) => m.id),
    ["left-behind", "deadline-exposed"],
  );
  assert.deepEqual(
    aloneDefaults.map((m) => m.id),
    ["left-behind", "paper-cuts", "deadline-exposed"],
  );
});
