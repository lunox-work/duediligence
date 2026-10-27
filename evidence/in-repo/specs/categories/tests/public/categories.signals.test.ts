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
 * The named signals: each has a fixed id, a test with an inclusive threshold,
 * and a description of whatever facts it is given.
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

type Row = [Signal, Partial<IssueFacts>, boolean, string | null];

function checkRows(rows: readonly Row[]): void {
  for (const [subject, changes, expectedTest, expectedDescribe] of rows) {
    const facts = factsWith(changes);
    const label = `${subject.id} with ${JSON.stringify(changes)}`;
    assert.equal(subject.test(facts), expectedTest, label);
    assert.equal(subject.describe(facts), expectedDescribe, label);
  }
}

test("[happy-8] the fixed signals have their ids", () => {
  assert.equal(unassigned.id, "unassigned");
  assert.equal(neverInSprint.id, "never-in-sprint");
  assert.equal(notInSprint.id, "not-in-sprint");
  assert.equal(bug.id, "bug");
});

test("[happy-8] factory signal ids carry their threshold", () => {
  assert.equal(openAtLeast(90).id, "open-at-least:90");
  assert.equal(quietAtLeast(30).id, "quiet-at-least:30");
  assert.equal(carriedAtLeast(3).id, "carried-at-least:3");
  assert.equal(votesAtLeast(3).id, "votes-at-least:3");
  assert.equal(watchersAtLeast(5).id, "watchers-at-least:5");
  assert.equal(duplicatesAtLeast(2).id, "duplicates-at-least:2");
  assert.equal(commentsAtLeast(10).id, "comments-at-least:10");
  assert.equal(blocksAtLeast(1).id, "blocks-at-least:1");
  assert.equal(priorityAtMost("low").id, "priority-at-most:low");
  assert.equal(priorityAtMost("medium").id, "priority-at-most:medium");
  assert.equal(deadlineWithin(14).id, "deadline-within:14");
  assert.equal(openAtLeast(0).id, "open-at-least:0");
});

test("[boundary-13] signals match their facts and describe them, plural for counts other than 1", () => {
  checkRows([
    [unassigned, { assigned: false }, true, "unassigned"],
    [neverInSprint, { inSprint: false, closedSprintCount: 0 }, true, "never in a sprint"],
    [notInSprint, { closedSprintCount: 4 }, true, "not in a sprint"],
    [bug, { isBug: true }, true, "a bug"],
    [openAtLeast(90), { ageDays: 90 }, true, "open 90 days"],
    [quietAtLeast(30), { daysSinceUpdate: 45 }, true, "no update in 45 days"],
    [
      carriedAtLeast(3),
      { closedSprintCount: 3, carriedSince: "2026-02-16T09:00:00.000Z" },
      true,
      "carried over 3 sprints since 2026-02-16",
    ],
    [votesAtLeast(3), { votes: 3 }, true, "3 votes"],
    [watchersAtLeast(5), { watchers: 5 }, true, "5 watchers"],
    [duplicatesAtLeast(2), { duplicateLinks: 2 }, true, "2 duplicates"],
    [commentsAtLeast(10), { commentCount: 10 }, true, "10 comments"],
    [blocksAtLeast(1), { blocksOpenCount: 3 }, true, "blocks 3 open tickets"],
    [
      priorityAtMost("low"),
      { priorityName: "Lowest", priorityRank: "low" },
      true,
      "Lowest priority",
    ],
    [
      priorityAtMost("medium"),
      { priorityName: "Major", priorityRank: "medium" },
      true,
      "Major priority",
    ],
  ]);
});

test("[boundary-13] signals fail below their threshold yet still describe, use the singular for 1, and describe null facts as null", () => {
  checkRows([
    [unassigned, { assigned: true }, false, "unassigned"],
    [neverInSprint, { closedSprintCount: 1 }, false, "never in a sprint"],
    [neverInSprint, { inSprint: true }, false, "never in a sprint"],
    [notInSprint, { inSprint: true }, false, "not in a sprint"],
    [bug, { isBug: false }, false, "a bug"],
    [openAtLeast(90), { ageDays: 89 }, false, "open 89 days"],
    [openAtLeast(1), { ageDays: 1 }, true, "open 1 day"],
    [openAtLeast(0), { ageDays: 0 }, true, "open 0 days"],
    [quietAtLeast(30), { daysSinceUpdate: 29 }, false, "no update in 29 days"],
    [quietAtLeast(1), { daysSinceUpdate: 1 }, true, "no update in 1 day"],
    [carriedAtLeast(3), { closedSprintCount: 2 }, false, "carried over 2 sprints"],
    [carriedAtLeast(1), { closedSprintCount: 1 }, true, "carried over 1 sprint"],
    [votesAtLeast(1), { votes: 1 }, true, "1 vote"],
    [votesAtLeast(3), { votes: 2 }, false, "2 votes"],
    [watchersAtLeast(1), { watchers: 1 }, true, "1 watcher"],
    [duplicatesAtLeast(1), { duplicateLinks: 1 }, true, "1 duplicate"],
    [commentsAtLeast(1), { commentCount: 1 }, true, "1 comment"],
    [commentsAtLeast(0), { commentCount: null }, false, null],
    [blocksAtLeast(1), { blocksOpenCount: 1 }, true, "blocks 1 open ticket"],
    [blocksAtLeast(1), { blocksOpenCount: 0 }, false, "blocks 0 open tickets"],
    [
      priorityAtMost("low"),
      { priorityName: "Medium", priorityRank: "medium" },
      false,
      "Medium priority",
    ],
    [
      priorityAtMost("medium"),
      { priorityName: "High", priorityRank: "high" },
      false,
      "High priority",
    ],
    [
      priorityAtMost("medium"),
      { priorityName: "P2", priorityRank: "none" },
      false,
      "P2 priority",
    ],
    [
      priorityAtMost("low"),
      { priorityName: null, priorityRank: "none" },
      false,
      null,
    ],
  ]);
});

test("[boundary-14] deadlineWithin matches a due date or release inside the window and describes it", () => {
  const within = deadlineWithin(14);
  checkRows([
    [within, { dueInDays: 1 }, true, "due in 1 day"],
    [within, { dueInDays: -5 }, true, "overdue by 5 days"],
    [within, { release: { name: "2.4", inDays: 7 } }, true, "release 2.4 due in 7 days"],
    [
      within,
      { release: { name: "2.4", inDays: -2 } },
      true,
      "release 2.4 overdue by 2 days",
    ],
    [
      within,
      { dueInDays: 20, release: { name: "2.4", inDays: 5 } },
      true,
      "release 2.4 due in 5 days",
    ],
    [
      within,
      { dueInDays: 3, release: { name: "2.4", inDays: 20 } },
      true,
      "due in 3 days",
    ],
  ]);
});

test("[boundary-14] deadlineWithin includes the window's last day and today, excludes the day after, and prefers the due date on a tie", () => {
  const within = deadlineWithin(14);
  checkRows([
    [within, { dueInDays: 14 }, true, "due in 14 days"],
    [within, { dueInDays: 15 }, false, "due in 15 days"],
    [within, { dueInDays: 0 }, true, "due today"],
    [within, { dueInDays: -1 }, true, "overdue by 1 day"],
    [within, { release: { name: "2.4", inDays: 0 } }, true, "release 2.4 due today"],
    [
      within,
      { release: { name: "3.0", inDays: 30 } },
      false,
      "release 3.0 due in 30 days",
    ],
    [
      within,
      { dueInDays: 5, release: { name: "2.4", inDays: 5 } },
      true,
      "due in 5 days",
    ],
    [within, { dueInDays: null, release: null }, false, null],
  ]);
});

test("[unhappy-2] signal factories refuse a negative or non-finite threshold with a RangeError", () => {
  const calls: [string, () => Signal][] = [
    ["openAtLeast(-1)", () => openAtLeast(-1)],
    ["quietAtLeast(NaN)", () => quietAtLeast(Number.NaN)],
    ["carriedAtLeast(Infinity)", () => carriedAtLeast(Number.POSITIVE_INFINITY)],
    ["votesAtLeast(-0.5)", () => votesAtLeast(-0.5)],
    ["watchersAtLeast(-1)", () => watchersAtLeast(-1)],
    ["duplicatesAtLeast(NaN)", () => duplicatesAtLeast(Number.NaN)],
    ["commentsAtLeast(-1)", () => commentsAtLeast(-1)],
    ["blocksAtLeast(-Infinity)", () => blocksAtLeast(Number.NEGATIVE_INFINITY)],
    ["deadlineWithin(NaN)", () => deadlineWithin(Number.NaN)],
    ['priorityAtMost("high")', () => priorityAtMost("high" as never)],
  ];
  for (const [name, call] of calls) {
    assert.throws(call, RangeError, name);
  }
});

test("[unhappy-2] a threshold just below zero is refused while the largest finite one is accepted", () => {
  assert.throws(() => openAtLeast(-0.001), RangeError);
  assert.throws(() => deadlineWithin(-0.001), RangeError);
  assert.equal(
    openAtLeast(Number.MAX_VALUE).id,
    `open-at-least:${String(Number.MAX_VALUE)}`,
  );
  assert.equal(openAtLeast(Number.MAX_VALUE).test(factsWith({ ageDays: 400 })), false);
});

test("[boundary-15] a zero threshold is accepted and matches zero", () => {
  assert.equal(openAtLeast(0).test(BASE_FACTS), true);
  assert.equal(deadlineWithin(0).test(factsWith({ dueInDays: 0 })), true);
});

test("[boundary-15] a fractional threshold is accepted, compared inclusively and kept in the id", () => {
  const signal = votesAtLeast(2.5);
  assert.equal(signal.id, "votes-at-least:2.5");
  assert.equal(signal.test(factsWith({ votes: 3 })), true);
  assert.equal(signal.test(factsWith({ votes: 2 })), false);
  assert.equal(deadlineWithin(0).test(factsWith({ dueInDays: 1 })), false);
});
