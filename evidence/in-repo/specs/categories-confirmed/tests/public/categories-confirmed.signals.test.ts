import assert from "node:assert/strict";
import { test } from "node:test";

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
  type IssueFacts,
  type Signal,
} from "../src/selection/index.js";

/**
 * Each named signal has a fixed id, an inclusive test and a description of
 * the facts it is given.
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

test("[happy-8] each named signal has its fixed id", () => {
  const examples: [string, () => Signal, string][] = [
    ["unassigned", () => unassigned, "unassigned"],
    ["neverInSprint", () => neverInSprint, "never-in-sprint"],
    ["notInSprint", () => notInSprint, "not-in-sprint"],
    ["bug", () => bug, "bug"],
    ["openAtLeast(90)", () => openAtLeast(90), "open-at-least"],
    ["quietAtLeast(30)", () => quietAtLeast(30), "quiet-at-least"],
    ["carriedAtLeast(3)", () => carriedAtLeast(3), "carried-at-least"],
    ["votesAtLeast(3)", () => votesAtLeast(3), "votes-at-least"],
    ["watchersAtLeast(5)", () => watchersAtLeast(5), "watchers-at-least"],
    [
      "duplicatesAtLeast(2)",
      () => duplicatesAtLeast(2),
      "duplicates-at-least",
    ],
    ["commentsAtLeast(10)", () => commentsAtLeast(10), "comments-at-least"],
    ["blocksAtLeast(1)", () => blocksAtLeast(1), "blocks-at-least"],
    [
      'priorityAtMost("low")',
      () => priorityAtMost("low"),
      "priority-at-most-low",
    ],
    [
      'priorityAtMost("medium")',
      () => priorityAtMost("medium"),
      "priority-at-most-medium",
    ],
    ["deadlineWithin(14)", () => deadlineWithin(14), "deadline-within"],
  ];
  for (const [name, make, id] of examples) {
    assert.equal(make().id, id, name);
  }
});

test("[happy-8] signal ids do not include the threshold", () => {
  assert.equal(openAtLeast(1).id, "open-at-least");
  assert.equal(openAtLeast(365).id, "open-at-least");
  assert.equal(blocksAtLeast(0).id, "blocks-at-least");
  assert.equal(deadlineWithin(0).id, "deadline-within");
});

test("[boundary-13] signal tests are inclusive of their threshold, and descriptions use the singular only for exactly 1", () => {
  const examples: [string, () => Signal, Partial<IssueFacts>, boolean, string][] =
    [
      ["unassigned", () => unassigned, { assigned: false }, true, "unassigned"],
      ["unassigned", () => unassigned, { assigned: true }, false, "unassigned"],
      [
        "neverInSprint",
        () => neverInSprint,
        { inSprint: false, closedSprintCount: 0 },
        true,
        "never in a sprint",
      ],
      [
        "neverInSprint",
        () => neverInSprint,
        { closedSprintCount: 1 },
        false,
        "never in a sprint",
      ],
      [
        "neverInSprint",
        () => neverInSprint,
        { inSprint: true },
        false,
        "never in a sprint",
      ],
      [
        "notInSprint",
        () => notInSprint,
        { closedSprintCount: 4 },
        true,
        "not in any sprint",
      ],
      [
        "notInSprint",
        () => notInSprint,
        { inSprint: true },
        false,
        "not in any sprint",
      ],
      ["bug", () => bug, { isBug: true }, true, "bug"],
      [
        "bug",
        () => bug,
        { isBug: true, priorityName: "Low" },
        true,
        "Low-priority bug",
      ],
      ["bug", () => bug, { isBug: false }, false, "bug"],
      [
        "openAtLeast(90)",
        () => openAtLeast(90),
        { ageDays: 90 },
        true,
        "open 90 days",
      ],
      [
        "openAtLeast(90)",
        () => openAtLeast(90),
        { ageDays: 89 },
        false,
        "open 89 days",
      ],
      ["openAtLeast(1)", () => openAtLeast(1), { ageDays: 1 }, true, "open 1 day"],
      [
        "openAtLeast(0)",
        () => openAtLeast(0),
        { ageDays: 0 },
        true,
        "open 0 days",
      ],
      [
        "quietAtLeast(30)",
        () => quietAtLeast(30),
        { daysSinceUpdate: 45 },
        true,
        "no update in 45 days",
      ],
      [
        "quietAtLeast(30)",
        () => quietAtLeast(30),
        { daysSinceUpdate: 29 },
        false,
        "no update in 29 days",
      ],
      [
        "quietAtLeast(1)",
        () => quietAtLeast(1),
        { daysSinceUpdate: 1 },
        true,
        "no update in 1 day",
      ],
      [
        "carriedAtLeast(3)",
        () => carriedAtLeast(3),
        { closedSprintCount: 3, carriedSince: "February" },
        true,
        "carried over 3 sprints since February",
      ],
      [
        "carriedAtLeast(3)",
        () => carriedAtLeast(3),
        { closedSprintCount: 2 },
        false,
        "carried over 2 sprints",
      ],
      [
        "carriedAtLeast(1)",
        () => carriedAtLeast(1),
        { closedSprintCount: 1 },
        true,
        "carried over 1 sprint",
      ],
      ["votesAtLeast(3)", () => votesAtLeast(3), { votes: 3 }, true, "3 votes"],
      ["votesAtLeast(1)", () => votesAtLeast(1), { votes: 1 }, true, "1 vote"],
      ["votesAtLeast(3)", () => votesAtLeast(3), { votes: 2 }, false, "2 votes"],
      [
        "watchersAtLeast(5)",
        () => watchersAtLeast(5),
        { watchers: 5 },
        true,
        "5 watchers",
      ],
      [
        "watchersAtLeast(1)",
        () => watchersAtLeast(1),
        { watchers: 1 },
        true,
        "1 watcher",
      ],
      [
        "duplicatesAtLeast(2)",
        () => duplicatesAtLeast(2),
        { duplicateLinks: 2 },
        true,
        "2 duplicates linked",
      ],
      [
        "duplicatesAtLeast(1)",
        () => duplicatesAtLeast(1),
        { duplicateLinks: 1 },
        true,
        "1 duplicate linked",
      ],
      [
        "commentsAtLeast(10)",
        () => commentsAtLeast(10),
        { commentCount: 10 },
        true,
        "10 comments",
      ],
      [
        "commentsAtLeast(1)",
        () => commentsAtLeast(1),
        { commentCount: 1 },
        true,
        "1 comment",
      ],
      [
        "commentsAtLeast(0)",
        () => commentsAtLeast(0),
        { commentCount: null },
        false,
        "0 comments",
      ],
      [
        "blocksAtLeast(1)",
        () => blocksAtLeast(1),
        { blocksOpenCount: 1 },
        true,
        "blocks 1 open ticket",
      ],
      [
        "blocksAtLeast(1)",
        () => blocksAtLeast(1),
        { blocksOpenCount: 3 },
        true,
        "blocks 3 open tickets",
      ],
      [
        "blocksAtLeast(1)",
        () => blocksAtLeast(1),
        { blocksOpenCount: 0 },
        false,
        "blocks 0 open tickets",
      ],
      [
        'priorityAtMost("low")',
        () => priorityAtMost("low"),
        { priorityName: "Lowest", priorityRank: "low" },
        true,
        "priority Lowest",
      ],
      [
        'priorityAtMost("low")',
        () => priorityAtMost("low"),
        { priorityName: "Medium", priorityRank: "medium" },
        false,
        "priority Medium",
      ],
      [
        'priorityAtMost("medium")',
        () => priorityAtMost("medium"),
        { priorityName: "Normal", priorityRank: "medium" },
        true,
        "priority Normal",
      ],
      [
        'priorityAtMost("medium")',
        () => priorityAtMost("medium"),
        { priorityName: "Low", priorityRank: "low" },
        true,
        "priority Low",
      ],
      [
        'priorityAtMost("medium")',
        () => priorityAtMost("medium"),
        { priorityName: "High", priorityRank: "high" },
        false,
        "priority High",
      ],
      [
        'priorityAtMost("medium")',
        () => priorityAtMost("medium"),
        { priorityName: "P2", priorityRank: "high" },
        false,
        "priority P2",
      ],
      [
        'priorityAtMost("low")',
        () => priorityAtMost("low"),
        { priorityName: null, priorityRank: "none" },
        false,
        "priority unset",
      ],
    ];
  for (const [name, make, changes, matches, description] of examples) {
    const facts = factsWith(changes);
    const label = `${name} with ${JSON.stringify(changes)}`;
    assert.equal(make().test(facts), matches, label);
    assert.equal(make().describe(facts), description, label);
  }
});

test("[boundary-14] deadlineWithin matches a due date or release 0 to n days ahead and describes the nearer one inside the window", () => {
  const examples: [Partial<IssueFacts>, boolean, string][] = [
    [{ dueInDays: 14 }, true, "due in 14 days"],
    [{ dueInDays: 15 }, false, "due today"],
    [{ dueInDays: 1 }, true, "due in 1 day"],
    [{ dueInDays: 0 }, true, "due today"],
    [{ dueInDays: -1 }, false, "due today"],
    [{ dueInDays: -5 }, false, "due today"],
    [{ release: { name: "2.4", inDays: 7 } }, true, "release 2.4 in 7 days"],
    [{ release: { name: "2.4", inDays: 0 } }, true, "release 2.4 today"],
    [{ release: { name: "2.4", inDays: -2 } }, false, "due today"],
    [{ release: { name: "3.0", inDays: 30 } }, false, "due today"],
    [
      { dueInDays: 20, release: { name: "2.4", inDays: 5 } },
      true,
      "release 2.4 in 5 days",
    ],
    [
      { dueInDays: 3, release: { name: "2.4", inDays: 20 } },
      true,
      "due in 3 days",
    ],
    [
      { dueInDays: 6, release: { name: "2.4", inDays: 5 } },
      true,
      "release 2.4 in 5 days",
    ],
    [
      { dueInDays: 5, release: { name: "2.4", inDays: 5 } },
      true,
      "due in 5 days",
    ],
    [{ dueInDays: null, release: null }, false, "due today"],
  ];
  for (const [changes, matches, description] of examples) {
    const facts = factsWith(changes);
    const label = JSON.stringify(changes);
    assert.equal(deadlineWithin(14).test(facts), matches, label);
    assert.equal(deadlineWithin(14).describe(facts), description, label);
  }
});

test("[boundary-15] signal factories take any number as a threshold without refusing it", () => {
  assert.equal(openAtLeast(0).test(BASE_FACTS), true);
  assert.equal(openAtLeast(-1).test(BASE_FACTS), true);
  assert.equal(quietAtLeast(Number.NaN).test(BASE_FACTS), false);
  const fractional = votesAtLeast(2.5);
  assert.equal(fractional.test(factsWith({ votes: 3 })), true);
  assert.equal(fractional.id, "votes-at-least");
  assert.equal(deadlineWithin(0).test(factsWith({ dueInDays: 0 })), true);
});
