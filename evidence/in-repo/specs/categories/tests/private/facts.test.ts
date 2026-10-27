import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BUG_ISSUE_TYPES,
  PRIORITY_RANKS,
  factsFor,
  type IssueFacts,
  type SelectionIssue,
} from "../../src/selection/index.js";

/**
 * `factsFor` beyond the public examples: other dates, other clocks, longer
 * link and sprint lists, and the shortcuts those examples let through.
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

function factsWith(changes: Partial<SelectionIssue>, now: Date = NOW): IssueFacts {
  return factsFor({ ...BASE_ISSUE, ...changes }, now);
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

const RICH_ISSUE: SelectionIssue = {
  assignee: "  Dana  ",
  priority: "  Trivial ",
  issueType: " DEFECT ",
  created: "2025-09-20T00:00:00.000Z",
  updated: "2026-04-01T00:00:00.000Z",
  dueDate: "2026-11-08",
  sprint: { state: "Active" },
  closedSprints: [
    { startDate: "2026-05-04T09:00:00.000Z", endDate: "2026-05-18T09:00:00.000Z" },
    { startDate: "2026-04-20T09:00:00.000Z", endDate: "2026-05-04T09:00:00.000Z" },
    { startDate: null, endDate: "2026-06-01T09:00:00.000Z" },
  ],
  votes: 6,
  watchers: 11,
  commentCount: 0,
  links: [
    { type: "Duplicate", direction: "outward", statusCategory: "done" },
    { type: "Blocks", direction: "outward", statusCategory: "indeterminate" },
    { type: "Blocks", direction: "inward", statusCategory: "new" },
  ],
  releases: [
    { name: "5.1", releaseDate: "2026-12-01", released: false },
    { name: "5.0", releaseDate: "2026-11-15", released: false },
  ],
};

// Extends "[happy-1] the base issue becomes facts and is not modified": every
// field set to a non-default value, so no field can be left at a constant.
test("[happy-1] a fully populated issue reduces to every expected fact and is not modified", () => {
  const issue = structuredClone(RICH_ISSUE);
  assert.deepEqual(factsFor(issue, NOW), {
    ageDays: 400,
    daysSinceUpdate: 207,
    assigned: true,
    inSprint: true,
    closedSprintCount: 3,
    carriedSince: "2026-04-20T09:00:00.000Z",
    votes: 6,
    watchers: 11,
    duplicateLinks: 1,
    blocksOpenCount: 1,
    commentCount: 0,
    priorityName: "Trivial",
    priorityRank: "low",
    isBug: true,
    dueInDays: 14,
    release: { name: "5.0", inDays: 21 },
  });
  assert.deepEqual(issue, RICH_ISSUE);
});

// Extends "[happy-1] a deeply frozen issue still reduces to the same facts":
// a frozen issue with non-empty sprint, link and release lists.
test("[happy-1] a deeply frozen issue with sprints, links and releases still reduces", () => {
  const issue = deepFreeze(structuredClone(RICH_ISSUE));
  const facts = factsFor(issue, NOW);
  assert.equal(facts.closedSprintCount, 3);
  assert.equal(facts.carriedSince, "2026-04-20T09:00:00.000Z");
  assert.deepEqual(facts.release, { name: "5.0", inDays: 21 });
});

// Extends "[happy-1] the base issue becomes facts": the same issue measured
// from another now, so the 297 and 24 cannot be constants.
test("[happy-1] the base issue measured from another now gives other day counts", () => {
  const facts = factsFor(BASE_ISSUE, new Date("2027-01-01T00:00:00.000Z"));
  assert.equal(facts.ageDays, 365);
  assert.equal(facts.daysSinceUpdate, 92);
});

test("[happy-1] two calls with the same issue and now return equal facts", () => {
  assert.deepEqual(factsFor(RICH_ISSUE, NOW), factsFor(RICH_ISSUE, NOW));
});

// Extends "[boundary-1] ageDays counts whole elapsed days since created".
test("[boundary-1] ageDays floors partial days rather than rounding them", () => {
  // 2.5 days.
  assert.equal(factsWith({ created: "2026-10-23T00:00:00.000Z" }).ageDays, 2);
  // 1 day and 23 hours.
  assert.equal(factsWith({ created: "2026-10-23T13:00:00.000Z" }).ageDays, 1);
  assert.equal(factsWith({ created: "2016-10-25T12:00:00.000Z" }).ageDays, 3652);
});

test("[boundary-1] ageDays measures elapsed time, not calendar dates, across time zone offsets", () => {
  // 2026-10-24T13:00Z: 23 hours before now, though the written date is the 24th.
  assert.equal(
    factsWith({ created: "2026-10-24T11:00:00.000-02:00" }).ageDays,
    0,
  );
  // 2026-10-24T11:00Z: 25 hours before now.
  assert.equal(
    factsWith({ created: "2026-10-24T13:00:00.000+02:00" }).ageDays,
    1,
  );
});

// Extends "[boundary-1] ageDays is 0 ... for a future, missing or unparseable created".
test("[boundary-1] ageDays is 0 at exactly now and for a created years in the future, never negative", () => {
  assert.equal(factsWith({ created: "2026-10-25T12:00:00.000Z" }).ageDays, 0);
  assert.equal(factsWith({ created: "2031-01-01T00:00:00.000Z" }).ageDays, 0);
  assert.equal(factsWith({ created: "" }).ageDays, 0);
});

// Extends "[boundary-2] daysSinceUpdate measures whole days from updated".
test("[boundary-2] daysSinceUpdate floors partial days and is independent of created", () => {
  assert.equal(
    factsWith({
      created: "2020-01-01T00:00:00.000Z",
      updated: "2026-10-23T00:00:00.000Z",
    }).daysSinceUpdate,
    2,
  );
  assert.equal(
    factsWith({ updated: "2026-10-24T12:00:00.001Z" }).daysSinceUpdate,
    0,
  );
});

// Extends "[boundary-2] ... falls back to ageDays when updated is missing or
// unparseable": the fallback follows created rather than being fixed at 297.
test("[boundary-2] the daysSinceUpdate fallback follows ageDays for other created dates", () => {
  assert.equal(
    factsWith({ created: "2025-09-20T00:00:00.000Z", updated: null })
      .daysSinceUpdate,
    400,
  );
  assert.equal(
    factsWith({ created: "2025-09-20T00:00:00.000Z", updated: "" })
      .daysSinceUpdate,
    400,
  );
  assert.equal(
    factsWith({ created: null, updated: null }).daysSinceUpdate,
    0,
  );
  assert.equal(
    factsWith({ created: "2027-01-01T00:00:00.000Z", updated: "never" })
      .daysSinceUpdate,
    0,
  );
});

test("[boundary-2] a future updated gives 0 rather than falling back to ageDays", () => {
  assert.equal(
    factsWith({
      created: "2025-09-20T00:00:00.000Z",
      updated: "2027-06-01T00:00:00.000Z",
    }).daysSinceUpdate,
    0,
  );
});

// Extends "[unhappy-1] an invalid now is refused with a RangeError": other
// invalid dates, and an issue with every list populated.
test("[unhappy-1] any invalid now is refused with a RangeError, whatever the issue holds", () => {
  for (const now of [
    new Date(""),
    new Date(Number.POSITIVE_INFINITY),
    new Date("2026-13-45T99:99:99Z"),
  ]) {
    assert.throws(() => factsFor(RICH_ISSUE, now), RangeError, String(now));
  }
});

// Extends "[boundary-3] a blank assignee name does not count as assigned".
test("[boundary-3] whitespace-only assignees of any kind are unassigned, a padded name is assigned", () => {
  assert.equal(factsWith({ assignee: "\t\n " }).assigned, false);
  assert.equal(factsWith({ assignee: "  Dana  " }).assigned, true);
  assert.equal(factsWith({ assignee: "x" }).assigned, true);
});

// Extends "[boundary-4] a closed current sprint does not count, in any letter case".
test("[boundary-4] closed in mixed case is out of a sprint, any other state is in one", () => {
  assert.equal(factsWith({ sprint: { state: "Closed" } }).inSprint, false);
  assert.equal(factsWith({ sprint: { state: "cLoSeD" } }).inSprint, false);
  assert.equal(factsWith({ sprint: { state: "ACTIVE" } }).inSprint, true);
  assert.equal(factsWith({ sprint: { state: "" } }).inSprint, true);
  assert.equal(factsWith({ sprint: { state: "closing" } }).inSprint, true);
});

// Extends "[happy-2] closed sprints are counted and carriedSince is the
// earliest one's startDate": the earliest is neither first nor last.
test("[happy-2] carriedSince is the earliest of many closed sprints wherever it sits in the list", () => {
  const facts = factsWith({
    closedSprints: [
      { startDate: "2026-05-04T09:00:00.000Z", endDate: null },
      { startDate: "2026-06-01T09:00:00.000Z", endDate: null },
      { startDate: "2026-01-05T09:00:00.000Z", endDate: null },
      { startDate: "2026-03-02T09:00:00.000Z", endDate: null },
      { startDate: "2026-07-13T09:00:00.000Z", endDate: null },
    ],
  });
  assert.equal(facts.closedSprintCount, 5);
  assert.equal(facts.carriedSince, "2026-01-05T09:00:00.000Z");
});

test("[happy-2] a sprint without a startDate competes on its endDate", () => {
  const facts = factsWith({
    closedSprints: [
      { startDate: "2026-03-02T09:00:00.000Z", endDate: "2026-03-16T09:00:00.000Z" },
      { startDate: null, endDate: "2026-02-01T00:00:00.000Z" },
      { startDate: null, endDate: null },
    ],
  });
  assert.equal(facts.closedSprintCount, 3);
  assert.equal(facts.carriedSince, "2026-02-01T00:00:00.000Z");
});

test("[happy-2] earliest is by instant, not by string, and the winner is returned verbatim", () => {
  // 2026-02-16T05:00Z sorts after 2026-02-16T08:00Z as a string.
  const facts = factsWith({
    closedSprints: [
      { startDate: "2026-02-16T08:00:00.000Z", endDate: null },
      { startDate: "2026-02-16T10:00:00.000+05:00", endDate: null },
    ],
  });
  assert.equal(facts.carriedSince, "2026-02-16T10:00:00.000+05:00");
});

test("[happy-2] unparseable sprints are counted but skipped when picking carriedSince", () => {
  const facts = factsWith({
    closedSprints: [
      { startDate: "garbage", endDate: null },
      { startDate: "2026-04-01T00:00:00.000Z", endDate: null },
      { startDate: null, endDate: null },
    ],
  });
  assert.equal(facts.closedSprintCount, 3);
  assert.equal(facts.carriedSince, "2026-04-01T00:00:00.000Z");
});

// Extends "[boundary-5] votes, watchers and comment count are carried through".
test("[boundary-5] a zero comment count stays 0 rather than becoming null", () => {
  assert.equal(factsWith({ commentCount: 0 }).commentCount, 0);
  const facts = factsWith({ votes: 0, watchers: 0, commentCount: 0 });
  assert.equal(facts.votes, 0);
  assert.equal(facts.watchers, 0);
});

test("[boundary-5] large counts and a mix of null and present counts are carried independently", () => {
  const a = factsWith({ votes: 1234, watchers: null, commentCount: 987 });
  assert.equal(a.votes, 1234);
  assert.equal(a.watchers, 0);
  assert.equal(a.commentCount, 987);
  const b = factsWith({ votes: null, watchers: 56, commentCount: undefined });
  assert.equal(b.votes, 0);
  assert.equal(b.watchers, 56);
  assert.equal(b.commentCount, null);
});

// Extends "[happy-3] duplicate links count either way ...": more links, other
// letter cases, and unrelated link types.
test("[happy-3] many links are counted with types matched case-insensitively and unrelated types ignored", () => {
  const facts = factsWith({
    links: [
      { type: "DUPLICATE", direction: "inward", statusCategory: "new" },
      { type: "Duplicate", direction: "outward", statusCategory: "done" },
      { type: "duplicate ", direction: "inward", statusCategory: "indeterminate" },
      { type: "BLOCKS", direction: "outward", statusCategory: "new" },
      { type: "Blocks", direction: "outward", statusCategory: "indeterminate" },
      { type: " blocks", direction: "outward", statusCategory: "" },
      { type: "Blocks", direction: "outward", statusCategory: "done" },
      { type: "Blocks", direction: "inward", statusCategory: "new" },
      { type: "Blocks", direction: "inward", statusCategory: "indeterminate" },
      { type: "Cloners", direction: "outward", statusCategory: "new" },
      { type: "Relates", direction: "inward", statusCategory: "new" },
    ],
  });
  assert.equal(facts.duplicateLinks, 3);
  assert.equal(facts.blocksOpenCount, 3);
});

test("[happy-3] duplicate links never count as blocking, and blocking links never count as duplicates", () => {
  const onlyDuplicates = factsWith({
    links: [
      { type: "Duplicate", direction: "outward", statusCategory: "new" },
      { type: "Duplicate", direction: "outward", statusCategory: "new" },
    ],
  });
  assert.equal(onlyDuplicates.duplicateLinks, 2);
  assert.equal(onlyDuplicates.blocksOpenCount, 0);
  const onlyBlocks = factsWith({
    links: [
      { type: "Blocks", direction: "outward", statusCategory: "new" },
      { type: "Blocks", direction: "inward", statusCategory: "done" },
    ],
  });
  assert.equal(onlyBlocks.duplicateLinks, 0);
  assert.equal(onlyBlocks.blocksOpenCount, 1);
});

// Extends "[boundary-6] every known priority name is ranked through PRIORITY_RANKS".
test("[boundary-6] priority names in any letter case and padding rank through PRIORITY_RANKS, keeping their written case", () => {
  const cases: [string, string, IssueFacts["priorityRank"]][] = [
    ["HIGHEST", "HIGHEST", "high"],
    ["\tblocker\n", "blocker", "high"],
    [" CrItIcAl ", "CrItIcAl", "high"],
    ["  Major ", "Major", "medium"],
    ["MEDIUM", "MEDIUM", "medium"],
    ["lowest", "lowest", "low"],
    [" Minor", "Minor", "low"],
    ["TRIVIAL ", "TRIVIAL", "low"],
  ];
  for (const [priority, name, rank] of cases) {
    const facts = factsWith({ priority });
    assert.equal(facts.priorityName, name, priority);
    assert.equal(facts.priorityRank, rank, priority);
  }
});

// Extends "[boundary-6] ... unknown or inherited names rank none".
test("[boundary-6] other inherited property names and near misses rank none", () => {
  for (const priority of [
    "toString",
    "hasOwnProperty",
    "__proto__",
    "valueOf",
    "Highest!",
    "Very Low",
    "P1",
  ]) {
    const facts = factsWith({ priority });
    assert.equal(facts.priorityName, priority, priority);
    assert.equal(facts.priorityRank, "none", priority);
  }
  const blank = factsWith({ priority: "" });
  assert.equal(blank.priorityName, null);
  assert.equal(blank.priorityRank, "none");
});

// Extends "[boundary-7] the issue type is trimmed but must match a bug type exactly".
test("[boundary-7] bug types match in any letter case and padding, and nothing else is a bug", () => {
  for (const issueType of ["BUG", "bug", "\tDefect\n", "DEFECT", "  dEfEcT "]) {
    assert.equal(factsWith({ issueType }).isBug, true, issueType);
  }
  for (const issueType of ["", "Bugs", "Bug Report", "Defects", "Task", "Epic"]) {
    assert.equal(factsWith({ issueType }).isBug, false, issueType);
  }
});

// Extends "[boundary-8] dueInDays counts UTC calendar days to the due date".
test("[boundary-8] dueInDays counts across month, year and leap-year boundaries", () => {
  assert.equal(factsWith({ dueDate: "2026-12-01" }).dueInDays, 37);
  assert.equal(factsWith({ dueDate: "2027-01-01" }).dueInDays, 68);
  assert.equal(factsWith({ dueDate: "2028-10-25" }).dueInDays, 731);
  assert.equal(factsWith({ dueDate: "2025-10-25" }).dueInDays, -365);
});

test("[boundary-8] dueInDays counts calendar days from now's UTC date, whatever the time of day", () => {
  const lateNow = new Date("2026-10-25T23:59:59.999Z");
  assert.equal(factsWith({ dueDate: "2026-10-26" }, lateNow).dueInDays, 1);
  assert.equal(factsWith({ dueDate: "2026-10-25" }, lateNow).dueInDays, 0);
  const earlyNow = new Date("2026-10-25T00:00:00.000Z");
  assert.equal(factsWith({ dueDate: "2026-10-25" }, earlyNow).dueInDays, 0);
  assert.equal(factsWith({ dueDate: "2026-10-24" }, earlyNow).dueInDays, -1);
});

test("[boundary-8] dueInDays ignores everything after the first ten characters", () => {
  // As an instant this is 2026-10-25T11:00Z, before now; its date is the 26th.
  assert.equal(
    factsWith({ dueDate: "2026-10-26T01:00:00.000+14:00" }).dueInDays,
    1,
  );
  // As an instant this is 2026-10-21T03:00Z; its date is the 20th.
  assert.equal(
    factsWith({ dueDate: "2026-10-20T23:00:00.000-0400" }).dueInDays,
    -5,
  );
});

test("[boundary-8] an empty or wordy due date is null", () => {
  assert.equal(factsWith({ dueDate: "" }).dueInDays, null);
  assert.equal(factsWith({ dueDate: "next week" }).dueInDays, null);
});

// Extends "[happy-4] release is the unreleased version with the earliest release date".
test("[happy-4] the earliest unreleased version is picked from a longer list wherever it sits", () => {
  assert.deepEqual(
    factsWith({
      releases: [
        { name: "6.0", releaseDate: "2027-03-01", released: false },
        { name: "5.2", releaseDate: "2026-12-15", released: false },
        { name: "5.0", releaseDate: "2026-10-01", released: true },
        { name: "5.1", releaseDate: "2026-12-01", released: false },
        { name: "later", releaseDate: null, released: false },
      ],
    }).release,
    { name: "5.1", inDays: 37 },
  );
});

test("[happy-4] an earlier released version and an earlier unparseable date do not win", () => {
  assert.deepEqual(
    factsWith({
      releases: [
        { name: "old", releaseDate: "2026-01-01", released: true },
        { name: "bad", releaseDate: "someday", released: false },
        { name: "next", releaseDate: "2026-11-20", released: false },
      ],
    }).release,
    { name: "next", inDays: 26 },
  );
});

test("[happy-4] release days are counted from the date's first ten characters, like dueInDays", () => {
  assert.deepEqual(
    factsWith({
      releases: [
        { name: "2.4", releaseDate: "2026-11-01T23:30:00.000-0500", released: false },
      ],
    }).release,
    { name: "2.4", inDays: 7 },
  );
  assert.deepEqual(
    factsWith(
      {
        releases: [{ name: "today", releaseDate: "2026-10-26", released: false }],
      },
      new Date("2026-10-26T23:00:00.000Z"),
    ).release,
    { name: "today", inDays: 0 },
  );
});

test("[happy-4] a tie between three versions goes to the first in array order", () => {
  assert.deepEqual(
    factsWith({
      releases: [
        { name: "later", releaseDate: "2026-12-01", released: false },
        { name: "C", releaseDate: "2026-11-01", released: false },
        { name: "A", releaseDate: "2026-11-01", released: false },
        { name: "B", releaseDate: "2026-11-01", released: false },
      ],
    }).release,
    { name: "C", inDays: 7 },
  );
});

test("[happy-4] only released versions give null", () => {
  assert.equal(
    factsWith({
      releases: [
        { name: "1.0", releaseDate: "2026-11-01", released: true },
        { name: "1.1", releaseDate: "2026-12-01", released: true },
      ],
    }).release,
    null,
  );
});

// Extends "[boundary-9] writing to a lookup table throws and changes nothing".
test("[boundary-9] overwriting or deleting lookup entries throws and changes nothing", () => {
  assert.throws(() => {
    (PRIORITY_RANKS as Record<string, string>)["high"] = "low";
  }, TypeError);
  assert.throws(() => {
    delete (PRIORITY_RANKS as Record<string, string>)["trivial"];
  }, TypeError);
  assert.throws(() => {
    (BUG_ISSUE_TYPES as string[])[0] = "story";
  }, TypeError);
  assert.throws(() => {
    (BUG_ISSUE_TYPES as string[]).length = 0;
  }, TypeError);
  assert.equal(PRIORITY_RANKS["high"], "high");
  assert.equal(PRIORITY_RANKS["trivial"], "low");
  assert.deepEqual(BUG_ISSUE_TYPES, ["bug", "defect"]);
  assert.equal(factsWith({ priority: "High" }).priorityRank, "high");
  assert.equal(factsWith({ issueType: "Bug" }).isBug, true);
});

test("[boundary-9] PRIORITY_RANKS has exactly the ten keys and no others", () => {
  assert.deepEqual(Object.keys(PRIORITY_RANKS).sort(), [
    "blocker",
    "critical",
    "high",
    "highest",
    "low",
    "lowest",
    "major",
    "medium",
    "minor",
    "trivial",
  ]);
  // factsFor ranks through exactly these keys.
  assert.equal(factsWith({ priority: "Critical" }).priorityRank, "high");
});
