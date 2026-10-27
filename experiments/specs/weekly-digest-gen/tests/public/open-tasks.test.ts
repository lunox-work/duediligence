import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest } from "../../src/index.js";
import type { Digest, Submission, Task, TaskStatus } from "../../src/index.js";

const NOW = "2026-10-26T09:00:00.000Z";

function task(id: string, title: string, status: TaskStatus, postedAt: string, submissions: Submission[] = []): Task {
  return { id, title, status, postedAt: new Date(postedAt), submissions };
}

function sub(at: string, gate: 1 | 2 | 3): Submission {
  return { at: new Date(at), gate };
}

function fullDigestTasks(): Task[] {
  return [
    task("T1", "Fix login", "open", "2026-10-01T09:00:00.000Z", [
      sub("2026-10-05T09:00:00.000Z", 1),
      sub("2026-10-08T09:00:00.000Z", 3),
    ]),
    task("T2", "Add export", "open", "2026-10-19T09:00:00.000Z"),
    task("T3", "Docs", "merged", "2026-09-01T09:00:00.000Z"),
    task("T4", "Speed up CI", "open", "2026-09-20T09:00:00.000Z", [sub("2026-10-20T09:00:00.000Z", 2)]),
    task("T5", "Dark mode", "open", "2026-10-05T12:00:00.000Z"),
  ];
}

const FULL_DIGEST: Digest = {
  subject: "Weekly digest: 4 open tasks, 2 stalled",
  tasks: [
    { id: "T1", title: "Fix login", ageDays: 25, submissions: 2, furthestGate: 3, stalled: true },
    { id: "T5", title: "Dark mode", ageDays: 20, submissions: 0, furthestGate: 0, stalled: true },
    { id: "T4", title: "Speed up CI", ageDays: 36, submissions: 1, furthestGate: 2, stalled: false },
    { id: "T2", title: "Add export", ageDays: 7, submissions: 0, furthestGate: 0, stalled: false },
  ],
};

test("[happy-4] a full digest lists open tasks with their state, merged excluded", () => {
  const digest = buildDigest({ timeZone: "Asia/Singapore", tasks: fullDigestTasks(), now: new Date(NOW) });
  assert.deepEqual(digest, FULL_DIGEST);
});

test("[happy-4] the same tasks in another time zone give the same digest", () => {
  const digest = buildDigest({ timeZone: "America/New_York", tasks: fullDigestTasks(), now: new Date(NOW) });
  assert.deepEqual(digest, FULL_DIGEST);
});

test("[boundary-3] an empty tasks array gives null", () => {
  assert.equal(buildDigest({ timeZone: "Asia/Singapore", tasks: [], now: new Date(NOW) }), null);
});

test("[boundary-3] an empty tasks array gives null on a non-Monday in a lowercase zone", () => {
  assert.equal(
    buildDigest({ timeZone: "asia/singapore", tasks: [], now: new Date("2026-10-28T09:00:00.000Z") }),
    null,
  );
});

test("[boundary-4] only merged tasks gives null", () => {
  const tasks = [
    task("M1", "Old", "merged", "2026-09-01T09:00:00.000Z", [sub("2026-09-02T09:00:00.000Z", 3)]),
    task("M2", "Older", "merged", "2026-08-01T09:00:00.000Z"),
  ];
  assert.equal(buildDigest({ timeZone: "Asia/Singapore", tasks, now: new Date(NOW) }), null);
});

test("[boundary-4] a single merged task with recent activity still gives null", () => {
  const tasks = [task("M1", "Fresh", "merged", "2026-10-26T09:00:00.000Z", [sub("2026-10-26T09:00:00.000Z", 1)])];
  assert.equal(buildDigest({ timeZone: "Asia/Singapore", tasks, now: new Date(NOW) }), null);
});

test("[happy-5] buildDigest builds a digest on a Wednesday", () => {
  const digest = buildDigest({
    timeZone: "Asia/Singapore",
    tasks: [task("T2", "Add export", "open", "2026-10-19T09:00:00.000Z")],
    now: new Date("2026-10-28T09:00:00.000Z"),
  });
  assert.deepEqual(digest, {
    subject: "Weekly digest: 1 open task, 0 stalled",
    tasks: [{ id: "T2", title: "Add export", ageDays: 9, submissions: 0, furthestGate: 0, stalled: false }],
  });
});

test("[happy-5] buildDigest builds a digest in the last millisecond before Monday", () => {
  const digest = buildDigest({
    timeZone: "Asia/Singapore",
    tasks: [task("T2", "Add export", "open", "2026-10-19T09:00:00.000Z")],
    now: new Date("2026-10-25T15:59:59.999Z"),
  });
  assert.deepEqual(digest, {
    subject: "Weekly digest: 1 open task, 0 stalled",
    tasks: [{ id: "T2", title: "Add export", ageDays: 6, submissions: 0, furthestGate: 0, stalled: false }],
  });
});
