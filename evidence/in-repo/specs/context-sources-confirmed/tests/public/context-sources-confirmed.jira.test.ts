import assert from "node:assert/strict";
import { test } from "node:test";

import { type JiraContext, jiraContextFields } from "../src/sources.js";

/** The filled-in issue "PAY-42". */
const PAY_42: JiraContext = {
  key: "PAY-42",
  issueType: "Story",
  status: "In Progress",
  statusCategory: "indeterminate",
  priority: "High",
  labels: ["billing"],
  components: ["api"],
  fixVersions: [],
  parentKey: "PAY-1",
  dueDate: null,
  storyPoints: 5,
  originalEstimateSeconds: 28800,
  remainingEstimateSeconds: null,
  votes: 0,
  watchers: 3,
  subtaskCount: 2,
  links: [{ type: "Blocks", direction: "outward", key: "PAY-50", done: false }],
  updated: "2026-10-01T10:00:00.000+0000",
};

/** An issue with nothing set beyond `key`, with `overrides` applied. */
function bare(key: string, overrides: Partial<JiraContext> = {}): JiraContext {
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
    updated: null,
    ...overrides,
  };
}

test("[happy-8] a filled-in issue", () => {
  assert.equal(
    JSON.stringify(jiraContextFields(PAY_42)),
    '{"issueType":"Story","status":"In Progress","priority":"High","labels":["billing"],"components":["api"],"storyPoints":5,"originalEstimateHours":8,"votes":0,"watchers":3,"subtasks":2,"hasParent":true,"links":[{"type":"Blocks","direction":"outward","done":false}]}',
  );
});

test("[happy-8] every field set gives every key in order, with new link objects and the issue unchanged", () => {
  const links = Array.from({ length: 30 }, (_, index) => ({
    type: `T${index}`,
    direction: index % 2 === 0 ? ("inward" as const) : ("outward" as const),
    key: `X-${index}`,
    done: index % 3 === 0,
  }));
  const issue = bare("FULL-1", {
    issueType: "Bug",
    status: "Done",
    statusCategory: "done",
    priority: "Low",
    labels: ["b", "a"],
    components: ["web", "api"],
    fixVersions: ["1.2", "1.1"],
    parentKey: "FULL-0",
    dueDate: "2026-12-01",
    storyPoints: 3,
    originalEstimateSeconds: 7200,
    remainingEstimateSeconds: 3600,
    votes: 4,
    watchers: 1,
    subtaskCount: 1,
    links,
    updated: "2026-10-01T10:00:00.000+0000",
  });
  const before = structuredClone(issue);
  const fields = jiraContextFields(issue);
  assert.deepEqual(Object.keys(fields), [
    "issueType",
    "status",
    "priority",
    "labels",
    "components",
    "fixVersions",
    "dueDate",
    "storyPoints",
    "originalEstimateHours",
    "remainingEstimateHours",
    "votes",
    "watchers",
    "subtasks",
    "hasParent",
    "links",
  ]);
  assert.deepEqual(fields["labels"], ["b", "a"]);
  assert.deepEqual(fields["fixVersions"], ["1.2", "1.1"]);
  const shown = fields["links"] as Record<string, unknown>[];
  assert.equal(shown.length, 30);
  shown.forEach((link, index) => {
    assert.deepEqual(Object.keys(link), ["type", "direction", "done"]);
    assert.deepEqual(link, {
      type: links[index]!.type,
      direction: links[index]!.direction,
      done: links[index]!.done,
    });
    assert.notEqual(link, links[index]);
  });
  assert.deepEqual(issue, before);
});

test("[boundary-11] an issue with nothing beyond its key gives no fields", () => {
  assert.deepEqual(
    jiraContextFields(
      bare("OPS-1", { updated: "2026-10-01T10:00:00.000+0000" }),
    ),
    {},
  );
});

test("[boundary-11] a status category alone gives no fields", () => {
  assert.deepEqual(
    jiraContextFields(
      bare("OPS-1", {
        statusCategory: "done",
        updated: "2026-10-01T10:00:00.000+0000",
      }),
    ),
    {},
  );
});

test("[boundary-12] blank strings and zero are kept, a link's key is left out", () => {
  const issue = bare("OPS-2", {
    priority: "  ",
    status: "",
    storyPoints: 0,
    dueDate: "2026-11-30",
    links: [{ type: "Relates", direction: "inward", key: null, done: true }],
  });
  assert.equal(
    JSON.stringify(jiraContextFields(issue)),
    '{"status":"","priority":"  ","dueDate":"2026-11-30","storyPoints":0,"links":[{"type":"Relates","direction":"inward","done":true}]}',
  );
});

test("[boundary-12] a blank parent key still has a parent, and blank array items are kept", () => {
  const issue = bare("OPS-2", {
    parentKey: "",
    labels: [""],
    votes: 0,
    watchers: 0,
  });
  assert.equal(
    JSON.stringify(jiraContextFields(issue)),
    '{"labels":[""],"votes":0,"watchers":0,"hasParent":true}',
  );
});

test("[boundary-13] estimates are given in hours to one decimal", () => {
  const cases: [number, number | null, Record<string, number>][] = [
    [28800, null, { originalEstimateHours: 8 }],
    [5400, 1000, { originalEstimateHours: 1.5, remainingEstimateHours: 0.3 }],
    [3600, 180, { originalEstimateHours: 1, remainingEstimateHours: 0.1 }],
    [0, 59, { originalEstimateHours: 0, remainingEstimateHours: 0 }],
  ];
  for (const [original, remaining, fields] of cases) {
    assert.deepEqual(
      jiraContextFields(
        bare("OPS-3", {
          originalEstimateSeconds: original,
          remainingEstimateSeconds: remaining,
        }),
      ),
      fields,
      `${original}/${remaining}`,
    );
  }
});

test("[boundary-13] a half tenth of an hour rounds up and just under an hour rounds to 1", () => {
  assert.deepEqual(
    jiraContextFields(
      bare("OPS-3", {
        originalEstimateSeconds: null,
        remainingEstimateSeconds: 1980,
      }),
    ),
    { remainingEstimateHours: 0.6 },
  );
  assert.deepEqual(
    jiraContextFields(bare("OPS-3", { originalEstimateSeconds: 3599 })),
    { originalEstimateHours: 1 },
  );
});
