import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BUG_ISSUE_TYPES,
  PRIORITY_RANKS,
  factsFor,
  type IssueFacts,
  type SelectionIssue,
} from "../src/selection/index.js";

/**
 * `factsFor`: one issue read from Jira reduced to the facts every selection
 * rule is evaluated against, with whole elapsed days measured from a fixed
 * `now`.
 */

const NOW = new Date("2026-10-25T12:00:00.000Z");

const BASE_ISSUE: SelectionIssue = {
  assignee: null,
  priority: "Medium",
  issueType: "Story",
  created: "2026-01-01T00:00:00.000Z",
  updated: "2026-10-01T00:00:00.000Z",
  dueDate: null,
  sprint: null,
  closedSprints: [],
  votes: 0,
  watchers: 0,
  links: [],
  releases: [],
};

function factsWith(changes: Partial<SelectionIssue>): IssueFacts {
  return factsFor({ ...BASE_ISSUE, ...changes }, NOW);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

const BASE_ISSUE_FACTS: IssueFacts = {
  ageDays: 297,
  daysSinceUpdate: 24,
  assigned: false,
  inSprint: false,
  closedSprintCount: 0,
  carriedSince: null,
  votes: 0,
  watchers: 0,
  duplicateLinks: 0,
  blocksOpenCount: 0,
  commentCount: null,
  priorityName: "Medium",
  priorityRank: "medium",
  isBug: false,
  dueInDays: null,
  release: null,
};

test("[happy-1] the base issue becomes facts and is not modified", () => {
  const issue = structuredClone(BASE_ISSUE);
  assert.deepEqual(factsFor(issue, NOW), BASE_ISSUE_FACTS);
  assert.deepEqual(issue, BASE_ISSUE);
});

test("[happy-1] a deeply frozen issue still reduces to the same facts", () => {
  // factsFor does not modify its issue, so freezing it cannot make it throw.
  const issue = deepFreeze(structuredClone(BASE_ISSUE));
  assert.deepEqual(factsFor(issue, NOW), BASE_ISSUE_FACTS);
});

test("[boundary-1] ageDays counts whole elapsed days since created", () => {
  assert.equal(factsWith({ created: "2025-09-20T00:00:00.000Z" }).ageDays, 400);
  assert.equal(factsWith({ created: "2026-10-24T12:00:00.000Z" }).ageDays, 1);
});

test("[boundary-1] ageDays is 0 one millisecond short of a day, and for a future, missing or unparseable created", () => {
  assert.equal(factsWith({ created: "2026-10-24T12:00:00.001Z" }).ageDays, 0);
  assert.equal(factsWith({ created: "2026-10-26T00:00:00.000Z" }).ageDays, 0);
  assert.equal(factsWith({ created: null }).ageDays, 0);
  assert.equal(factsWith({ created: "not a date" }).ageDays, 0);
});

test("[boundary-2] daysSinceUpdate measures whole days from updated", () => {
  assert.equal(
    factsWith({ updated: "2026-04-01T00:00:00.000Z" }).daysSinceUpdate,
    207,
  );
  assert.equal(
    factsWith({ updated: "2026-10-25T12:00:00.000Z" }).daysSinceUpdate,
    0,
  );
});

test("[boundary-2] daysSinceUpdate is 0 for a future update and falls back to ageDays when updated is missing or unparseable", () => {
  assert.equal(
    factsWith({ updated: "2026-11-01T00:00:00.000Z" }).daysSinceUpdate,
    0,
  );
  assert.equal(factsWith({ updated: null }).daysSinceUpdate, 297);
  assert.equal(factsWith({ updated: "yesterday" }).daysSinceUpdate, 297);
});

test("[unhappy-1] an invalid now is refused with a RangeError", () => {
  assert.throws(() => factsFor(BASE_ISSUE, new Date("nope")), RangeError);
});

test("[unhappy-1] an invalid now is refused even when the issue has no dates to measure", () => {
  assert.throws(
    () =>
      factsFor(
        { ...BASE_ISSUE, created: null, updated: null, dueDate: null },
        new Date(Number.NaN),
      ),
    RangeError,
  );
});

test("[boundary-3] a named assignee makes the issue assigned", () => {
  assert.equal(factsWith({ assignee: "Dana" }).assigned, true);
  assert.equal(factsWith({ assignee: null }).assigned, false);
});

test("[boundary-3] a blank assignee name does not count as assigned", () => {
  assert.equal(factsWith({ assignee: "" }).assigned, false);
  assert.equal(factsWith({ assignee: "   " }).assigned, false);
});

test("[boundary-4] any current sprint that is not closed puts the issue in a sprint", () => {
  assert.equal(factsWith({ sprint: null }).inSprint, false);
  assert.equal(factsWith({ sprint: { state: "active" } }).inSprint, true);
  assert.equal(factsWith({ sprint: { state: "future" } }).inSprint, true);
  assert.equal(factsWith({ sprint: { state: "unknown" } }).inSprint, true);
});

test("[boundary-4] a closed current sprint does not count, in any letter case", () => {
  assert.equal(factsWith({ sprint: { state: "closed" } }).inSprint, false);
  assert.equal(factsWith({ sprint: { state: "CLOSED" } }).inSprint, false);
});

test("[happy-2] closed sprints are counted and carriedSince is the earliest one's startDate, verbatim", () => {
  const none = factsWith({ closedSprints: [] });
  assert.equal(none.closedSprintCount, 0);
  assert.equal(none.carriedSince, null);

  const two = factsWith({
    closedSprints: [
      {
        startDate: "2026-03-02T09:00:00.000Z",
        endDate: "2026-03-16T09:00:00.000Z",
      },
      { startDate: "2026-02-16T09:00:00.000Z", endDate: null },
    ],
  });
  assert.equal(two.closedSprintCount, 2);
  assert.equal(two.carriedSince, "2026-02-16T09:00:00.000Z");
});

test("[happy-2] carriedSince falls back to endDate, and is null when no closed sprint date parses", () => {
  const endOnly = factsWith({
    closedSprints: [{ startDate: null, endDate: "2026-04-01T00:00:00.000Z" }],
  });
  assert.equal(endOnly.closedSprintCount, 1);
  assert.equal(endOnly.carriedSince, "2026-04-01T00:00:00.000Z");

  const unparseable = factsWith({
    closedSprints: [
      { startDate: null, endDate: null },
      { startDate: "garbage", endDate: null },
    ],
  });
  assert.equal(unparseable.closedSprintCount, 2);
  assert.equal(unparseable.carriedSince, null);
});

test("[boundary-5] votes, watchers and comment count are carried through", () => {
  const facts = factsWith({ votes: 4, watchers: 7, commentCount: 12 });
  assert.equal(facts.votes, 4);
  assert.equal(facts.watchers, 7);
  assert.equal(facts.commentCount, 12);
});

test("[boundary-5] null votes and watchers become 0, and a null or absent comment count stays null", () => {
  const facts = factsWith({ votes: null, watchers: null, commentCount: null });
  assert.equal(facts.votes, 0);
  assert.equal(facts.watchers, 0);
  assert.equal(facts.commentCount, null);
  assert.equal("commentCount" in BASE_ISSUE, false);
  assert.equal(factsFor(BASE_ISSUE, NOW).commentCount, null);
});

test("[happy-3] duplicate links count either way, and only outward Blocks links to unfinished tickets count as blocking", () => {
  const facts = factsWith({
    links: [
      { type: "Duplicate", direction: "inward", statusCategory: "done" },
      { type: "duplicate", direction: "outward", statusCategory: "new" },
      { type: "Blocks", direction: "outward", statusCategory: "new" },
      { type: "blocks", direction: "outward", statusCategory: "indeterminate" },
      { type: "Blocks", direction: "outward", statusCategory: "unknown" },
      { type: "Blocks", direction: "outward", statusCategory: "Done" },
      { type: "Blocks", direction: "inward", statusCategory: "new" },
      { type: "Relates", direction: "outward", statusCategory: "new" },
    ],
  });
  assert.equal(facts.duplicateLinks, 2);
  assert.equal(facts.blocksOpenCount, 3);
});

test("[happy-3] link type names are matched trimmed, and inward or done Blocks links never count", () => {
  const facts = factsWith({
    links: [
      { type: " Duplicate ", direction: "outward", statusCategory: "new" },
      { type: "  BLOCKS ", direction: "outward", statusCategory: "new" },
      { type: "Blocks", direction: "inward", statusCategory: "indeterminate" },
      { type: "Blocks", direction: "outward", statusCategory: "done" },
    ],
  });
  assert.equal(facts.duplicateLinks, 1);
  assert.equal(facts.blocksOpenCount, 1);
});

test("[boundary-6] every known priority name is ranked through PRIORITY_RANKS", () => {
  const cases: [string, IssueFacts["priorityRank"]][] = [
    ["Highest", "high"],
    ["High", "high"],
    ["Blocker", "high"],
    ["Critical", "high"],
    ["Major", "medium"],
    ["Medium", "medium"],
    ["Low", "low"],
    ["Lowest", "low"],
    ["Minor", "low"],
    ["Trivial", "low"],
  ];
  for (const [priority, rank] of cases) {
    const facts = factsWith({ priority });
    assert.equal(facts.priorityName, priority, priority);
    assert.equal(facts.priorityRank, rank, priority);
  }
});

test("[boundary-6] priority names are trimmed, blank becomes null, and unknown or inherited names rank none", () => {
  const cases: [string | null, string | null, IssueFacts["priorityRank"]][] = [
    ["  low  ", "low", "low"],
    ["P2", "P2", "none"],
    ["constructor", "constructor", "none"],
    ["   ", null, "none"],
    [null, null, "none"],
  ];
  for (const [priority, name, rank] of cases) {
    const facts = factsWith({ priority });
    assert.equal(facts.priorityName, name, String(priority));
    assert.equal(facts.priorityRank, rank, String(priority));
  }
});

test("[boundary-7] bug and defect issue types are bugs", () => {
  assert.equal(factsWith({ issueType: "Bug" }).isBug, true);
  assert.equal(factsWith({ issueType: "Defect" }).isBug, true);
  assert.equal(factsWith({ issueType: "Story" }).isBug, false);
});

test("[boundary-7] the issue type is trimmed but must match a bug type exactly", () => {
  assert.equal(factsWith({ issueType: " bug " }).isBug, true);
  assert.equal(factsWith({ issueType: "Bugfix" }).isBug, false);
});

test("[boundary-8] dueInDays counts UTC calendar days to the due date", () => {
  assert.equal(factsWith({ dueDate: "2026-10-26" }).dueInDays, 1);
  assert.equal(factsWith({ dueDate: "2026-11-08" }).dueInDays, 14);
  assert.equal(factsWith({ dueDate: "2026-10-20" }).dueInDays, -5);
});

test("[boundary-8] dueInDays is 0 on the day, reads only the first ten characters, and is null when unparseable or missing", () => {
  assert.equal(factsWith({ dueDate: "2026-10-25" }).dueInDays, 0);
  assert.equal(
    factsWith({ dueDate: "2026-11-08T23:30:00.000-0500" }).dueInDays,
    14,
  );
  assert.equal(factsWith({ dueDate: "soon" }).dueInDays, null);
  assert.equal(factsWith({ dueDate: null }).dueInDays, null);
});

test("[happy-4] release is the unreleased version with the earliest release date", () => {
  assert.deepEqual(
    factsWith({
      releases: [
        { name: "2.4", releaseDate: "2026-11-01", released: false },
        { name: "2.3", releaseDate: "2026-10-30", released: true },
        { name: "3.0", releaseDate: null, released: false },
      ],
    }).release,
    { name: "2.4", inDays: 7 },
  );
});

test("[happy-4] release ties go to array order, overdue versions count, and undated or released versions are ignored", () => {
  assert.deepEqual(
    factsWith({
      releases: [
        { name: "A", releaseDate: "2026-11-01", released: false },
        { name: "B", releaseDate: "2026-11-01", released: false },
      ],
    }).release,
    { name: "A", inDays: 7 },
  );
  assert.deepEqual(
    factsWith({
      releases: [
        { name: "Late", releaseDate: "2026-10-20", released: false },
        { name: "2.4", releaseDate: "2026-11-01", released: false },
      ],
    }).release,
    { name: "Late", inDays: -5 },
  );
  assert.equal(
    factsWith({
      releases: [
        { name: "1.0", releaseDate: "2026-10-01", released: true },
        { name: "X", releaseDate: "tbd", released: false },
      ],
    }).release,
    null,
  );
  assert.equal(factsWith({ releases: [] }).release, null);
});

test("[boundary-9] the lookup tables are frozen with exactly the specified contents", () => {
  assert.equal(Object.isFrozen(PRIORITY_RANKS), true);
  assert.equal(Object.isFrozen(BUG_ISSUE_TYPES), true);
  assert.deepEqual(BUG_ISSUE_TYPES, ["bug", "defect"]);
  assert.deepEqual(PRIORITY_RANKS, {
    highest: "high",
    high: "high",
    blocker: "high",
    critical: "high",
    major: "medium",
    medium: "medium",
    low: "low",
    lowest: "low",
    minor: "low",
    trivial: "low",
  });
});

test("[boundary-9] writing to a lookup table throws and changes nothing", () => {
  assert.throws(() => {
    (PRIORITY_RANKS as Record<string, string>)["p2"] = "low";
  }, TypeError);
  assert.throws(() => {
    (BUG_ISSUE_TYPES as string[]).push("bugfix");
  }, TypeError);
  assert.equal(Object.hasOwn(PRIORITY_RANKS, "p2"), false);
  assert.deepEqual(BUG_ISSUE_TYPES, ["bug", "defect"]);
});
