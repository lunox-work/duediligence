import assert from "node:assert/strict";
import { test } from "node:test";

import { jiraContextFields, type JiraContext, type JiraIssueLinkContext } from "../../src/sources.js";

/**
 * jiraContextFields: the fields beyond key and text, in a fixed key order,
 * without nulls, blank strings or empty arrays, subtaskCount always.
 */

/** A JiraContext carrying nothing beyond its key. */
function emptyJira(key: string): JiraContext {
  return {
    key,
    issueType: null,
    status: null,
    statusCategory: null,
    priority: null,
    labels: [],
    components: [],
    fixVersions: [],
    parentKey: null,
    dueDate: null,
    storyPoints: null,
    originalEstimateSeconds: null,
    remainingEstimateSeconds: null,
    votes: null,
    watchers: null,
    subtaskCount: 0,
    links: [],
    updated: "2026-10-01T10:00:00.000+0000",
  };
}

/** Every field filled in, its keys inserted in the reverse of the fixed order. */
const OPS_7: JiraContext = {
  updated: "2026-10-02T08:30:00.000+0000",
  links: [
    { type: "Blocks", direction: "outward", key: "OPS-8", done: false },
    { type: "Duplicate", direction: "inward", key: null, done: true },
  ],
  subtaskCount: 7,
  watchers: 9,
  votes: 4,
  remainingEstimateSeconds: 1800,
  originalEstimateSeconds: 3600,
  storyPoints: 8,
  dueDate: "2026-12-01",
  parentKey: "OPS-1",
  fixVersions: ["1.2.0", "1.3.0"],
  components: ["web", "api"],
  labels: ["z", "a"],
  priority: "Low",
  statusCategory: "done",
  status: "Done",
  issueType: "Bug",
  key: "OPS-7",
};

const OPS_7_FIELDS =
  '{"issueType":"Bug","status":"Done","statusCategory":"done","priority":"Low","labels":["z","a"],"components":["web","api"],"fixVersions":["1.2.0","1.3.0"],"parentKey":"OPS-1","dueDate":"2026-12-01","storyPoints":8,"originalEstimateSeconds":3600,"remainingEstimateSeconds":1800,"votes":4,"watchers":9,"subtaskCount":7,"links":[{"type":"Blocks","direction":"outward","key":"OPS-8","done":false},{"type":"Duplicate","direction":"inward","key":null,"done":true}]}';

// Extends "[happy-8] a filled-in issue".
test("[happy-8] every field filled in comes out in the fixed order, whatever the context's key order", () => {
  assert.equal(JSON.stringify(jiraContextFields(OPS_7)), OPS_7_FIELDS);
});

// Extends "[happy-8] links are not capped and keep their order".
test("[happy-8] each link is rebuilt with exactly its four keys, in order", () => {
  const link = {
    done: true,
    key: "X-2",
    direction: "inward",
    extra: "dropped",
    type: "Duplicate",
  } as unknown as JiraIssueLinkContext;
  assert.equal(
    JSON.stringify(jiraContextFields({ ...emptyJira("X-1"), links: [link] })),
    '{"subtaskCount":0,"links":[{"type":"Duplicate","direction":"inward","key":"X-2","done":true}]}',
  );
});

test("[happy-8] array items are kept as given, blank and repeated ones included", () => {
  const context: JiraContext = {
    ...emptyJira("X-3"),
    labels: ["", " spaced ", "dup", "dup"],
    components: ["b", "a"],
    subtaskCount: 1,
  };
  assert.equal(
    JSON.stringify(jiraContextFields(context)),
    '{"labels":[""," spaced ","dup","dup"],"components":["b","a"],"subtaskCount":1}',
  );
});

// Extends "[boundary-13] an issue with nothing beyond its key still says how many subtasks it has".
test("[boundary-13] nothing beyond the key, with updated null, still gives the subtask count", () => {
  assert.deepEqual(jiraContextFields({ ...emptyJira("OPS-1"), updated: null, subtaskCount: 4 }), {
    subtaskCount: 4,
  });
});

// Extends "[boundary-13] key and updated are never included".
test("[boundary-13] every string blank and every array empty leaves only the subtask count", () => {
  const context: JiraContext = {
    ...emptyJira("OPS-2"),
    issueType: "\t",
    status: "\n ",
    statusCategory: " ",
    priority: "",
    parentKey: "   ",
    dueDate: "  ",
  };
  assert.deepEqual(jiraContextFields(context), { subtaskCount: 0 });
});

// Extends "[boundary-14] blank strings are left out, zero is kept, a link without a key keeps its null".
test("[boundary-14] a non-blank string is kept as given, a fractional or zero number is kept", () => {
  const context: JiraContext = {
    ...emptyJira("OPS-3"),
    issueType: " Task",
    status: "0",
    priority: " ",
    storyPoints: 0.5,
    votes: 0,
    links: [{ type: "Clones", direction: "outward", key: null, done: false }],
  };
  assert.equal(
    JSON.stringify(jiraContextFields(context)),
    '{"issueType":" Task","status":"0","storyPoints":0.5,"votes":0,"subtaskCount":0,"links":[{"type":"Clones","direction":"outward","key":null,"done":false}]}',
  );
});

// Extends "[boundary-14] every zero number is kept and strings are kept as given".
test("[boundary-14] each empty array is left out on its own", () => {
  const context: JiraContext = { ...emptyJira("OPS-4"), components: ["x"], fixVersions: [] };
  assert.equal(JSON.stringify(jiraContextFields(context)), '{"components":["x"],"subtaskCount":0}');
  const versions: JiraContext = { ...emptyJira("OPS-5"), fixVersions: ["2.0"] };
  assert.equal(JSON.stringify(jiraContextFields(versions)), '{"fixVersions":["2.0"],"subtaskCount":0}');
});

// Extends "[boundary-15] the result does not share arrays with the context".
test("[boundary-15] changing the context afterwards does not change the result", () => {
  const labels = ["z", "a"];
  const components = ["web", "api"];
  const fixVersions = ["1.2.0", "1.3.0"];
  const link = { type: "Blocks", direction: "outward" as const, key: "OPS-8", done: false };
  const links: JiraIssueLinkContext[] = [
    link,
    { type: "Duplicate", direction: "inward", key: null, done: true },
  ];
  const fields = jiraContextFields({ ...OPS_7, labels, components, fixVersions, links });
  labels.push("late");
  components.length = 0;
  fixVersions.reverse();
  links.push({ type: "Relates", direction: "inward", key: "OPS-9", done: false });
  (link as { key: string | null }).key = "CHANGED";
  assert.equal(JSON.stringify(fields), OPS_7_FIELDS);
});

// Extends "[boundary-15] the result does not share links with the context".
test("[boundary-15] two calls do not share arrays with each other", () => {
  const first = jiraContextFields(OPS_7);
  const second = jiraContextFields(OPS_7);
  (first.components as string[]).push("extra");
  (first.fixVersions as string[]).pop();
  (first.links as unknown[]).length = 0;
  assert.equal(JSON.stringify(second), OPS_7_FIELDS);
  assert.equal(JSON.stringify(jiraContextFields(OPS_7)), OPS_7_FIELDS);
});
