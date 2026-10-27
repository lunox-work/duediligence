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
} from "../../src/selection/index.js";

/**
 * The named signals beyond the public examples: other thresholds, other
 * counts, and facts that pull a signal's test and description apart.
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

// Extends "[happy-8] factory signal ids carry their threshold": thresholds
// other than the public ones, so ids cannot be looked up from a fixed table.
test("[happy-8] factory ids carry any threshold as String(n)", () => {
  assert.equal(openAtLeast(365).id, "open-at-least:365");
  assert.equal(quietAtLeast(0).id, "quiet-at-least:0");
  assert.equal(quietAtLeast(7.25).id, "quiet-at-least:7.25");
  assert.equal(carriedAtLeast(12).id, "carried-at-least:12");
  assert.equal(votesAtLeast(100).id, "votes-at-least:100");
  assert.equal(watchersAtLeast(0.5).id, "watchers-at-least:0.5");
  assert.equal(duplicatesAtLeast(7).id, "duplicates-at-least:7");
  assert.equal(commentsAtLeast(0).id, "comments-at-least:0");
  assert.equal(blocksAtLeast(4).id, "blocks-at-least:4");
  assert.equal(deadlineWithin(0).id, "deadline-within:0");
  assert.equal(deadlineWithin(30).id, "deadline-within:30");
  assert.equal(openAtLeast(1e21).id, `open-at-least:${String(1e21)}`);
});

test("[happy-8] the same factory called with two thresholds gives two signals that keep their own", () => {
  const short = openAtLeast(10);
  const long = openAtLeast(20);
  assert.equal(short.id, "open-at-least:10");
  assert.equal(long.id, "open-at-least:20");
  const facts = factsWith({ ageDays: 15 });
  assert.equal(short.test(facts), true);
  assert.equal(long.test(facts), false);
});

// Extends "[happy-8] the fixed signals have their ids": the fixed signals,
// whose ids are already in the seam, also test the facts.
test("[boundary-13] the fixed signals test the base facts", () => {
  assert.equal(unassigned.test(BASE_FACTS), true);
  assert.equal(neverInSprint.test(BASE_FACTS), true);
  assert.equal(notInSprint.test(BASE_FACTS), true);
  assert.equal(bug.test(BASE_FACTS), false);
});

// Extends "[boundary-13] signals match their facts and describe them, plural
// for counts other than 1": other thresholds and counts on either side.
test("[boundary-13] count signals are inclusive at other thresholds and describe other counts", () => {
  checkRows([
    [openAtLeast(365), { ageDays: 364 }, false, "open 364 days"],
    [openAtLeast(365), { ageDays: 365 }, true, "open 365 days"],
    [openAtLeast(2), { ageDays: 2 }, true, "open 2 days"],
    [quietAtLeast(0), { daysSinceUpdate: 0 }, true, "no update in 0 days"],
    [quietAtLeast(60), { daysSinceUpdate: 59 }, false, "no update in 59 days"],
    [quietAtLeast(60), { daysSinceUpdate: 61 }, true, "no update in 61 days"],
    [carriedAtLeast(5), { closedSprintCount: 4 }, false, "carried over 4 sprints"],
    [carriedAtLeast(5), { closedSprintCount: 7 }, true, "carried over 7 sprints"],
    [carriedAtLeast(1), { closedSprintCount: 0 }, false, "carried over 0 sprints"],
    [votesAtLeast(10), { votes: 9 }, false, "9 votes"],
    [votesAtLeast(10), { votes: 10 }, true, "10 votes"],
    [votesAtLeast(1), { votes: 0 }, false, "0 votes"],
    [watchersAtLeast(5), { watchers: 4 }, false, "4 watchers"],
    [watchersAtLeast(2), { watchers: 2 }, true, "2 watchers"],
    [watchersAtLeast(1), { watchers: 0 }, false, "0 watchers"],
    [duplicatesAtLeast(2), { duplicateLinks: 1 }, false, "1 duplicate"],
    [duplicatesAtLeast(3), { duplicateLinks: 5 }, true, "5 duplicates"],
    [duplicatesAtLeast(1), { duplicateLinks: 0 }, false, "0 duplicates"],
    [blocksAtLeast(3), { blocksOpenCount: 2 }, false, "blocks 2 open tickets"],
    [blocksAtLeast(3), { blocksOpenCount: 3 }, true, "blocks 3 open tickets"],
  ]);
});

test("[boundary-13] a zero comment count is a count, not a missing one", () => {
  checkRows([
    [commentsAtLeast(0), { commentCount: 0 }, true, "0 comments"],
    [commentsAtLeast(1), { commentCount: 0 }, false, "0 comments"],
    [commentsAtLeast(5), { commentCount: 4 }, false, "4 comments"],
    [commentsAtLeast(5), { commentCount: 5 }, true, "5 comments"],
    [commentsAtLeast(10), { commentCount: null }, false, null],
  ]);
});

test("[boundary-13] carriedAtLeast appends the first ten characters of carriedSince, as written, whatever its test says", () => {
  checkRows([
    [
      carriedAtLeast(1),
      { closedSprintCount: 1, carriedSince: "2026-02-16T09:00:00.000Z" },
      true,
      "carried over 1 sprint since 2026-02-16",
    ],
    [
      carriedAtLeast(3),
      { closedSprintCount: 2, carriedSince: "2026-05-04T09:00:00.000Z" },
      false,
      "carried over 2 sprints since 2026-05-04",
    ],
    [
      carriedAtLeast(1),
      // As an instant this is 2026-02-17T04:00Z; the written date is kept.
      { closedSprintCount: 4, carriedSince: "2026-02-16T23:00:00.000-0500" },
      true,
      "carried over 4 sprints since 2026-02-16",
    ],
  ]);
});

test("[boundary-13] the in-sprint signals read inSprint and closedSprintCount separately", () => {
  checkRows([
    [neverInSprint, { inSprint: true, closedSprintCount: 2 }, false, "never in a sprint"],
    [neverInSprint, { closedSprintCount: 7 }, false, "never in a sprint"],
    [notInSprint, { inSprint: false, closedSprintCount: 0 }, true, "not in a sprint"],
    [notInSprint, { inSprint: true, closedSprintCount: 3 }, false, "not in a sprint"],
    [unassigned, { assigned: true, blocksOpenCount: 3 }, false, "unassigned"],
    [bug, { isBug: true, priorityRank: "high" }, true, "a bug"],
  ]);
});

test("[boundary-13] priorityAtMost tests the rank and describes the name, even when they disagree", () => {
  checkRows([
    [priorityAtMost("medium"), { priorityName: "Minor", priorityRank: "low" }, true, "Minor priority"],
    [priorityAtMost("medium"), { priorityName: "Medium", priorityRank: "medium" }, true, "Medium priority"],
    [priorityAtMost("low"), { priorityName: "Trivial", priorityRank: "low" }, true, "Trivial priority"],
    [priorityAtMost("low"), { priorityName: "Blocker", priorityRank: "high" }, false, "Blocker priority"],
    [priorityAtMost("low"), { priorityName: "Low", priorityRank: "medium" }, false, "Low priority"],
    [priorityAtMost("low"), { priorityName: "Urgent", priorityRank: "low" }, true, "Urgent priority"],
    [priorityAtMost("medium"), { priorityName: "Lowest", priorityRank: "none" }, false, "Lowest priority"],
    [priorityAtMost("medium"), { priorityName: null, priorityRank: "none" }, false, null],
  ]);
});

// Extends "[boundary-14] deadlineWithin matches a due date or release inside
// the window and describes it": other windows than 14.
test("[boundary-14] deadlineWithin uses its own window, inclusively", () => {
  checkRows([
    [deadlineWithin(0), { dueInDays: 0 }, true, "due today"],
    [deadlineWithin(0), { dueInDays: 1 }, false, "due in 1 day"],
    [deadlineWithin(0), { dueInDays: -3 }, true, "overdue by 3 days"],
    [deadlineWithin(30), { dueInDays: 30 }, true, "due in 30 days"],
    [deadlineWithin(30), { dueInDays: 31 }, false, "due in 31 days"],
    [deadlineWithin(30), { release: { name: "3.0", inDays: 30 } }, true, "release 3.0 due in 30 days"],
    [deadlineWithin(3), { release: { name: "3.0", inDays: 4 } }, false, "release 3.0 due in 4 days"],
    [deadlineWithin(2.5), { dueInDays: 2 }, true, "due in 2 days"],
    [deadlineWithin(2.5), { dueInDays: 3 }, false, "due in 3 days"],
  ]);
});

test("[boundary-14] a missing due date or release never matches on its own", () => {
  // A null compared with <= would coerce to 0 and match.
  checkRows([
    [deadlineWithin(14), { dueInDays: 20, release: null }, false, "due in 20 days"],
    [deadlineWithin(14), { dueInDays: null, release: { name: "9", inDays: 15 } }, false, "release 9 due in 15 days"],
    [deadlineWithin(0), { dueInDays: null, release: null }, false, null],
  ]);
});

test("[boundary-14] the release wording uses its name verbatim and the singular for one day", () => {
  checkRows([
    [deadlineWithin(14), { release: { name: "v3.1-beta", inDays: 1 } }, true, "release v3.1-beta due in 1 day"],
    [deadlineWithin(14), { release: { name: "Q4 drop", inDays: -1 } }, true, "release Q4 drop overdue by 1 day"],
    [deadlineWithin(14), { release: { name: "2.5", inDays: -30 } }, true, "release 2.5 overdue by 30 days"],
    [deadlineWithin(14), { dueInDays: -400 }, true, "overdue by 400 days"],
  ]);
});

test("[boundary-14] the nearer of a due date and a release is described, whether or not either is in the window", () => {
  checkRows([
    [deadlineWithin(14), { dueInDays: 10, release: { name: "2.4", inDays: 4 } }, true, "release 2.4 due in 4 days"],
    [deadlineWithin(14), { dueInDays: 2, release: { name: "2.4", inDays: 9 } }, true, "due in 2 days"],
    [deadlineWithin(14), { dueInDays: 30, release: { name: "2.4", inDays: 20 } }, false, "release 2.4 due in 20 days"],
    [deadlineWithin(14), { dueInDays: 20, release: { name: "2.4", inDays: 30 } }, false, "due in 20 days"],
    [deadlineWithin(14), { dueInDays: 6, release: { name: "2.4", inDays: -1 } }, true, "release 2.4 overdue by 1 day"],
    [deadlineWithin(14), { dueInDays: -2, release: { name: "2.4", inDays: 5 } }, true, "overdue by 2 days"],
    [deadlineWithin(14), { dueInDays: 0, release: { name: "2.4", inDays: 0 } }, true, "due today"],
    [deadlineWithin(14), { dueInDays: 25, release: { name: "2.4", inDays: 25 } }, false, "due in 25 days"],
  ]);
});

// Extends "[unhappy-2] signal factories refuse a negative or non-finite
// threshold with a RangeError": every factory with every kind of bad value.
test("[unhappy-2] every numeric factory refuses every kind of negative or non-finite threshold", () => {
  const factories: [string, (n: number) => Signal][] = [
    ["openAtLeast", openAtLeast],
    ["quietAtLeast", quietAtLeast],
    ["carriedAtLeast", carriedAtLeast],
    ["votesAtLeast", votesAtLeast],
    ["watchersAtLeast", watchersAtLeast],
    ["duplicatesAtLeast", duplicatesAtLeast],
    ["commentsAtLeast", commentsAtLeast],
    ["blocksAtLeast", blocksAtLeast],
    ["deadlineWithin", deadlineWithin],
  ];
  const bad = [
    -1,
    -0.5,
    -1000,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  for (const [name, factory] of factories) {
    for (const value of bad) {
      assert.throws(() => factory(value), RangeError, `${name}(${value})`);
    }
  }
});

test("[unhappy-2] priorityAtMost refuses every rank other than low and medium", () => {
  for (const rank of ["high", "none", "", "lowest", "minor"]) {
    assert.throws(() => priorityAtMost(rank as never), RangeError, rank);
  }
});

// Extends "[boundary-15] a zero threshold is accepted and matches zero": every
// numeric factory at 0.
test("[boundary-15] every numeric factory accepts zero and matches a zero count", () => {
  assert.equal(quietAtLeast(0).test(BASE_FACTS), true);
  assert.equal(carriedAtLeast(0).test(BASE_FACTS), true);
  assert.equal(votesAtLeast(0).test(BASE_FACTS), true);
  assert.equal(watchersAtLeast(0).test(BASE_FACTS), true);
  assert.equal(duplicatesAtLeast(0).test(BASE_FACTS), true);
  assert.equal(blocksAtLeast(0).test(BASE_FACTS), true);
  assert.equal(commentsAtLeast(0).test(factsWith({ commentCount: 0 })), true);
  assert.equal(deadlineWithin(0).test(factsWith({ dueInDays: -1 })), true);
  assert.equal(
    deadlineWithin(0).test(factsWith({ release: { name: "r", inDays: 0 } })),
    true,
  );
  assert.equal(blocksAtLeast(0).id, "blocks-at-least:0");
});

// Extends "[boundary-15] a fractional threshold is accepted, compared
// inclusively and kept in the id": other factories with fractions.
test("[boundary-15] fractional thresholds are accepted by other factories and compared against whole counts", () => {
  const open = openAtLeast(0.5);
  assert.equal(open.id, "open-at-least:0.5");
  assert.equal(open.test(BASE_FACTS), false);
  assert.equal(open.test(factsWith({ ageDays: 1 })), true);
  const blocks = blocksAtLeast(1.5);
  assert.equal(blocks.test(factsWith({ blocksOpenCount: 1 })), false);
  assert.equal(blocks.test(factsWith({ blocksOpenCount: 2 })), true);
  const comments = commentsAtLeast(9.99);
  assert.equal(comments.id, "comments-at-least:9.99");
  assert.equal(comments.test(factsWith({ commentCount: 9 })), false);
  assert.equal(comments.test(factsWith({ commentCount: 10 })), true);
  const within = deadlineWithin(0.5);
  assert.equal(within.id, "deadline-within:0.5");
  assert.equal(within.test(factsWith({ dueInDays: 0 })), true);
  assert.equal(within.test(factsWith({ dueInDays: 1 })), false);
});
