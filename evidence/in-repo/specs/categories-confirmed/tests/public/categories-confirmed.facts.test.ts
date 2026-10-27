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
 * `factsFor` reduces one Jira issue to the facts the selection rules test,
 * measuring every elapsed day from a fixed `now`.
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

function factsWith(changes: Partial<SelectionIssue>): IssueFacts {
  return factsFor({ ...BASE_ISSUE, ...changes }, NOW);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

test("[happy-1] the base issue becomes facts and is not modified", () => {
  const issue = structuredClone(BASE_ISSUE);
  assert.deepEqual(factsFor(issue, NOW), BASE_ISSUE_FACTS);
  assert.deepEqual(issue, BASE_ISSUE);
});

test("[happy-1] a deeply frozen base issue gives the same facts on every call", () => {
  const issue = deepFreeze(structuredClone(BASE_ISSUE));
  assert.deepEqual(factsFor(issue, NOW), BASE_ISSUE_FACTS);
  assert.deepEqual(factsFor(issue, NOW), BASE_ISSUE_FACTS);
});

test("[boundary-1] ageDays is whole elapsed days since created, and 0 when created is missing, unparseable or in the future", () => {
  const examples: [string | null, number][] = [
    ["2025-09-20T00:00:00.000Z", 400],
    ["2026-10-24T12:00:00.000Z", 1],
    ["2026-10-24T12:00:00.001Z", 0],
    ["2026-10-26T00:00:00.000Z", 0],
    [null, 0],
    ["not a date", 0],
  ];
  for (const [created, ageDays] of examples) {
    assert.equal(factsWith({ created }).ageDays, ageDays, `created ${created}`);
  }
});

test("[boundary-2] daysSinceUpdate measures from updated, and is 0 when updated is missing, unparseable or in the future", () => {
  const examples: [string | null, number][] = [
    ["2026-04-01T00:00:00.000Z", 207],
    ["2026-10-25T12:00:00.000Z", 0],
    ["2026-11-01T00:00:00.000Z", 0],
    [null, 0],
    ["yesterday", 0],
  ];
  for (const [updated, days] of examples) {
    assert.equal(
      factsWith({ updated }).daysSinceUpdate,
      days,
      `updated ${updated}`,
    );
  }
});

test("[boundary-3] assigned is true for any assignee that is not null, blank or not", () => {
  const examples: [string | null, boolean][] = [
    [null, false],
    ["", true],
    ["   ", true],
    ["Dana", true],
  ];
  for (const [assignee, assigned] of examples) {
    assert.equal(
      factsWith({ assignee }).assigned,
      assigned,
      `assignee ${JSON.stringify(assignee)}`,
    );
  }
});

test('[boundary-4] inSprint is true for any current sprint whose state is not exactly "closed"', () => {
  const examples: [{ state: string } | null, boolean][] = [
    [null, false],
    [{ state: "active" }, true],
    [{ state: "future" }, true],
    [{ state: "unknown" }, true],
    [{ state: "closed" }, false],
    [{ state: "CLOSED" }, true],
  ];
  for (const [sprint, inSprint] of examples) {
    assert.equal(
      factsWith({ sprint }).inSprint,
      inSprint,
      `sprint ${JSON.stringify(sprint)}`,
    );
  }
});

test("[happy-2] closed sprints are counted and carriedSince names the month of the earliest one", () => {
  const twoThisYear = factsWith({
    closedSprints: [
      {
        startDate: "2026-03-02T09:00:00.000Z",
        endDate: "2026-03-16T09:00:00.000Z",
      },
      { startDate: "2026-02-16T09:00:00.000Z", endDate: null },
    ],
  });
  assert.equal(twoThisYear.closedSprintCount, 2);
  assert.equal(twoThisYear.carriedSince, "February");

  const endOnly = factsWith({
    closedSprints: [{ startDate: null, endDate: "2026-04-01T00:00:00.000Z" }],
  });
  assert.equal(endOnly.closedSprintCount, 1);
  assert.equal(endOnly.carriedSince, "April");

  const garbageStart = factsWith({
    closedSprints: [
      { startDate: "garbage", endDate: "2026-05-01T00:00:00.000Z" },
    ],
  });
  assert.equal(garbageStart.closedSprintCount, 1);
  assert.equal(garbageStart.carriedSince, "May");
});

test("[happy-2] carriedSince adds the year when it is not now's, and is null when no closed sprint date parses", () => {
  const none = factsWith({ closedSprints: [] });
  assert.equal(none.closedSprintCount, 0);
  assert.equal(none.carriedSince, null);

  const lastYear = factsWith({
    closedSprints: [
      { startDate: "2025-11-10T09:00:00.000Z", endDate: null },
      { startDate: "2026-01-05T09:00:00.000Z", endDate: null },
    ],
  });
  assert.equal(lastYear.closedSprintCount, 2);
  assert.equal(lastYear.carriedSince, "November 2025");

  const undated = factsWith({
    closedSprints: [
      { startDate: null, endDate: null },
      { startDate: "garbage", endDate: null },
    ],
  });
  assert.equal(undated.closedSprintCount, 2);
  assert.equal(undated.carriedSince, null);
});

test("[boundary-5] missing votes and watchers become 0, and a missing comment count stays null", () => {
  const nulls = factsWith({ votes: null, watchers: null, commentCount: null });
  assert.equal(nulls.votes, 0);
  assert.equal(nulls.watchers, 0);
  assert.equal(nulls.commentCount, null);

  assert.equal("commentCount" in BASE_ISSUE, false);
  assert.equal(factsFor(BASE_ISSUE, NOW).commentCount, null);

  const counted = factsWith({ votes: 4, watchers: 7, commentCount: 12 });
  assert.equal(counted.votes, 4);
  assert.equal(counted.watchers, 7);
  assert.equal(counted.commentCount, 12);
});

test('[happy-3] duplicates count only inward links, and blocking counts only outward Blocks links not exactly "done"', () => {
  const facts = factsWith({
    links: [
      { type: "Duplicate", direction: "inward", statusCategory: "done" },
      { type: "duplicate", direction: "outward", statusCategory: "new" },
      { type: "Blocks", direction: "outward", statusCategory: "new" },
      { type: "blocks", direction: "outward", statusCategory: "indeterminate" },
      { type: "Blocks", direction: "outward", statusCategory: "unknown" },
      { type: "Blocks", direction: "outward", statusCategory: "Done" },
      { type: "Blocks", direction: "outward", statusCategory: "done" },
      { type: "Blocks", direction: "inward", statusCategory: "new" },
      { type: "Relates", direction: "outward", statusCategory: "new" },
    ],
  });
  assert.equal(facts.duplicateLinks, 1);
  assert.equal(facts.blocksOpenCount, 4);
});

test("[happy-3] link types match case-insensitively, and unrelated or done links count for nothing", () => {
  const upper = factsWith({
    links: [
      { type: "DUPLICATE", direction: "inward", statusCategory: "new" },
      { type: "BLOCKS", direction: "outward", statusCategory: "new" },
    ],
  });
  assert.equal(upper.duplicateLinks, 1);
  assert.equal(upper.blocksOpenCount, 1);

  const nothing = factsWith({
    links: [
      { type: "Relates", direction: "inward", statusCategory: "new" },
      { type: "Blocks", direction: "outward", statusCategory: "done" },
    ],
  });
  assert.equal(nothing.duplicateLinks, 0);
  assert.equal(nothing.blocksOpenCount, 0);
});

test('[boundary-6] priority ranks by its trimmed lowercase name; any other non-blank name is "high" and a blank or missing one is "none"', () => {
  const examples: [string | null, string | null, string][] = [
    ["Highest", "Highest", "high"],
    ["High", "High", "high"],
    ["Blocker", "Blocker", "high"],
    ["Critical", "Critical", "high"],
    ["Major", "Major", "high"],
    ["Medium", "Medium", "medium"],
    ["Normal", "Normal", "medium"],
    ["Low", "Low", "low"],
    ["Lowest", "Lowest", "low"],
    ["Minor", "Minor", "low"],
    ["Trivial", "Trivial", "low"],
    ["  low  ", "low", "low"],
    ["P2", "P2", "high"],
    ["   ", null, "none"],
    [null, null, "none"],
  ];
  for (const [priority, name, rank] of examples) {
    const facts = factsWith({ priority });
    const label = `priority ${JSON.stringify(priority)}`;
    assert.equal(facts.priorityName, name, label);
    assert.equal(facts.priorityRank, rank, label);
  }
});

test("[boundary-7] isBug matches BUG_ISSUE_TYPES against the trimmed lowercase issue type", () => {
  const examples: [string, boolean][] = [
    ["Bug", true],
    [" bug ", true],
    ["Defect", true],
    ["Bugfix", false],
    ["Story", false],
  ];
  for (const [issueType, isBug] of examples) {
    assert.equal(
      factsWith({ issueType }).isBug,
      isBug,
      `issueType ${JSON.stringify(issueType)}`,
    );
  }
});

test("[boundary-8] dueInDays counts UTC calendar days to the due date, negative when overdue and null when unparseable", () => {
  const examples: [string | null, number | null][] = [
    ["2026-10-25", 0],
    ["2026-10-26", 1],
    ["2026-11-08", 14],
    ["2026-11-08T23:30:00.000-05:00", 15],
    ["2026-10-20", -5],
    ["soon", null],
    [null, null],
  ];
  for (const [dueDate, dueInDays] of examples) {
    assert.equal(
      factsWith({ dueDate }).dueInDays,
      dueInDays,
      `dueDate ${dueDate}`,
    );
  }
});

test("[happy-4] release is the unreleased version with the earliest releaseDate today or later", () => {
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
    { name: "2.4", inDays: 7 },
  );
});

test("[happy-4] a release due today counts, and released, unparseable or absent versions give no release", () => {
  assert.deepEqual(
    factsWith({
      releases: [{ name: "Now", releaseDate: "2026-10-25", released: false }],
    }).release,
    { name: "Now", inDays: 0 },
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

test("[boundary-9] the priority and bug lookup tables", () => {
  assert.deepEqual(PRIORITY_RANKS, {
    lowest: "low",
    trivial: "low",
    low: "low",
    minor: "low",
    medium: "medium",
    normal: "medium",
  });
  assert.deepEqual(BUG_ISSUE_TYPES, ["bug", "defect"]);
});
