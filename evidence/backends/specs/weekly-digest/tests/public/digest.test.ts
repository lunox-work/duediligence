import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest, type Digest, type Task } from "../../src/index.js";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-03-16T12:00:00Z");

function ago(milliseconds: number): Date {
  return new Date(NOW - milliseconds);
}

function task(id: string, overrides: Partial<Omit<Task, "id">> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    status: "open",
    postedAt: ago(DAY),
    submissions: [],
    ...overrides,
  };
}

function digestFor(tasks: Task[]): Digest {
  const digest = buildDigest({ timeZone: "Asia/Singapore", tasks, now: new Date(NOW) });
  assert.notEqual(digest, null, "Open tasks should produce a digest");
  return digest!;
}

test("[happy-2] an open task retains its identity and reports age, count and maximum gate", () => {
  const digest = digestFor([task("feature", {
    title: "Ship the feature",
    postedAt: ago(10 * DAY),
    submissions: [
      { at: ago(8 * DAY), gate: 2 },
      { at: ago(2 * DAY), gate: 1 },
    ],
  })]);

  assert.equal(digest.tasks.length, 1);
  assert.deepEqual(digest.tasks[0], {
    id: "feature",
    title: "Ship the feature",
    ageDays: 10,
    submissions: 2,
    furthestGate: 2,
    stalled: false,
  });
});

test("[happy-2] an unsubmitted open task has gate zero and merged tasks are omitted", () => {
  const digest = digestFor([
    task("merged", {
      status: "merged",
      postedAt: ago(30 * DAY),
      submissions: [{ at: ago(20 * DAY), gate: 3 }],
    }),
    task("unsubmitted"),
  ]);

  assert.equal(digest.tasks.length, 1);
  assert.equal(digest.tasks[0]!.id, "unsubmitted");
  assert.equal(digest.tasks[0]!.submissions, 0);
  assert.equal(digest.tasks[0]!.furthestGate, 0);
});

test("[happy-2] gate three is retained and submissions sharing a time are all counted", () => {
  const digest = digestFor([task("all-gates", {
    postedAt: ago(10 * DAY),
    submissions: [
      { at: ago(2 * DAY), gate: 1 },
      { at: ago(2 * DAY), gate: 3 },
      { at: ago(2 * DAY), gate: 2 },
    ],
  })]);

  assert.equal(digest.tasks[0]!.submissions, 3);
  assert.equal(digest.tasks[0]!.furthestGate, 3);
});

test("[boundary-2] age floors nine days and twenty-three hours but includes ten whole days", () => {
  const digest = digestFor([
    task("almost-ten", { postedAt: ago(9 * DAY + 23 * HOUR) }),
    task("ten", { postedAt: ago(10 * DAY) }),
  ]);
  const ages = new Map(digest.tasks.map((entry) => [entry.id, entry.ageDays]));

  assert.equal(ages.get("almost-ten"), 9);
  assert.equal(ages.get("ten"), 10);
});

test("[boundary-2] age crosses a whole-day threshold by elapsed time across daylight saving", () => {
  const now = new Date("2026-03-09T04:30:00Z");
  const digest = buildDigest({
    timeZone: "America/New_York",
    now,
    tasks: [
      task("new", { postedAt: new Date(now.getTime()) }),
      task("under-day", { postedAt: new Date(now.getTime() - DAY + 1) }),
      task("whole-day", { postedAt: new Date(now.getTime() - DAY) }),
      task("over-day", { postedAt: new Date(now.getTime() - DAY - 1) }),
    ],
  });
  assert.notEqual(digest, null);
  const ages = new Map(digest!.tasks.map((entry) => [entry.id, entry.ageDays]));

  assert.equal(ages.get("new"), 0);
  assert.equal(ages.get("under-day"), 0);
  assert.equal(ages.get("whole-day"), 1);
  assert.equal(ages.get("over-day"), 1);
});

test("[boundary-3] exactly fourteen days stalls both unsubmitted and submitted tasks", () => {
  const digest = digestFor([
    task("no-submissions", { postedAt: ago(14 * DAY) }),
    task("with-submission", {
      postedAt: ago(30 * DAY),
      submissions: [{ at: ago(14 * DAY), gate: 1 }],
    }),
  ]);

  assert.equal(digest.tasks.length, 2);
  assert.equal(digest.tasks.every((entry) => entry.stalled), true);
});

test("[boundary-3] less than fourteen days of inactivity does not stall a task", () => {
  const digest = digestFor([
    task("unsubmitted-13d23h", { postedAt: ago(13 * DAY + 23 * HOUR) }),
    task("submitted-13d23h", {
      postedAt: ago(30 * DAY),
      submissions: [{ at: ago(13 * DAY + 23 * HOUR), gate: 2 }],
    }),
    task("unsubmitted-one-ms-short", { postedAt: ago(14 * DAY - 1) }),
    task("submitted-one-ms-short", {
      postedAt: ago(30 * DAY),
      submissions: [{ at: ago(14 * DAY - 1), gate: 1 }],
    }),
  ]);

  assert.equal(digest.tasks.length, 4);
  assert.equal(digest.tasks.every((entry) => !entry.stalled), true);
});

test("[boundary-3] the latest submission refreshes an old task regardless of array order or gate", () => {
  const digest = digestFor([task("recent-activity", {
    postedAt: ago(30 * DAY),
    submissions: [
      { at: ago(2 * DAY), gate: 1 },
      { at: ago(20 * DAY), gate: 3 },
    ],
  })]);

  assert.equal(digest.tasks[0]!.stalled, false);
});

test("[happy-3] stalled tasks precede active tasks and each group sorts older tasks first", () => {
  const digest = digestFor([
    task("active-young", { postedAt: ago(2 * DAY) }),
    task("stalled-young", { postedAt: ago(14 * DAY) }),
    task("active-old", {
      postedAt: ago(60 * DAY),
      submissions: [{ at: ago(DAY), gate: 1 }],
    }),
    task("stalled-old", { postedAt: ago(30 * DAY) }),
  ]);

  assert.deepEqual(digest.tasks.map((entry) => entry.id), [
    "stalled-old", "stalled-young", "active-old", "active-young",
  ]);
});

test("[happy-3] equal-age tasks sort by id within both stalled and active groups", () => {
  const digest = digestFor([
    task("active-z", { postedAt: ago(2 * DAY) }),
    task("stalled-z", { postedAt: ago(20 * DAY) }),
    task("active-a", { postedAt: ago(2 * DAY) }),
    task("stalled-a", { postedAt: ago(20 * DAY) }),
  ]);

  assert.deepEqual(digest.tasks.map((entry) => entry.id), [
    "stalled-a", "stalled-z", "active-a", "active-z",
  ]);
});

test("[happy-4] the subject counts five open tasks and two stalled tasks", () => {
  const digest = digestFor([
    task("stalled-one", { postedAt: ago(14 * DAY) }),
    task("active-one"),
    task("stalled-two", { postedAt: ago(20 * DAY) }),
    task("active-two"),
    task("active-three"),
    task("merged", { status: "merged", postedAt: ago(30 * DAY) }),
  ]);

  assert.equal(digest.subject, "Weekly digest: 5 open tasks, 2 stalled");
});

test("[happy-4] the subject uses singular task and includes zero or one stalled", () => {
  assert.equal(
    digestFor([task("active")]).subject,
    "Weekly digest: 1 open task, 0 stalled",
  );
  assert.equal(
    digestFor([task("stalled", { postedAt: ago(14 * DAY) })]).subject,
    "Weekly digest: 1 open task, 1 stalled",
  );
});

test("[unhappy-1] an empty task list produces no digest", () => {
  assert.equal(buildDigest({
    timeZone: "Asia/Singapore",
    now: new Date(NOW),
    tasks: [],
  }), null);
});

test("[unhappy-1] tasks that are all merged produce no digest", () => {
  assert.equal(buildDigest({
    timeZone: "Asia/Singapore",
    now: new Date(NOW),
    tasks: [
      task("merged-empty", { status: "merged", postedAt: ago(30 * DAY) }),
      task("merged-submitted", {
        status: "merged",
        submissions: [{ at: ago(HOUR), gate: 3 }],
      }),
    ],
  }), null);
});
