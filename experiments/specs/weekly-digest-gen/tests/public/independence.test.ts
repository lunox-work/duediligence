import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest, isDigestDue } from "../../src/index.js";
import type { Digest, DigestEntry, DigestInput, Submission, Task, TaskStatus } from "../../src/index.js";

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

function fullDigest(): Digest {
  return {
    subject: "Weekly digest: 4 open tasks, 2 stalled",
    tasks: [
      { id: "T1", title: "Fix login", ageDays: 25, submissions: 2, furthestGate: 3, stalled: true },
      { id: "T5", title: "Dark mode", ageDays: 20, submissions: 0, furthestGate: 0, stalled: true },
      { id: "T4", title: "Speed up CI", ageDays: 36, submissions: 1, furthestGate: 2, stalled: false },
      { id: "T2", title: "Add export", ageDays: 7, submissions: 0, furthestGate: 0, stalled: false },
    ],
  };
}

const T2_ONLY: Digest = {
  subject: "Weekly digest: 1 open task, 0 stalled",
  tasks: [{ id: "T2", title: "Add export", ageDays: 7, submissions: 0, furthestGate: 0, stalled: false }],
};

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function interleave(first: DigestInput, second: DigestInput): void {
  const nyDue = (): boolean => isDigestDue("America/New_York", new Date("2026-10-26T02:00:00.000Z"));

  const a = buildDigest(first);
  assert.equal(nyDue(), false);
  const b = buildDigest(second);
  assert.equal(nyDue(), false);
  const c = buildDigest(first);

  assert.deepEqual(a, fullDigest());
  assert.deepEqual(c, fullDigest());
  assert.notEqual(a, c);
  assert.equal(b!.subject, "Weekly digest: 1 open task, 0 stalled");
  assert.deepEqual(b, T2_ONLY);
}

test("[concurrency-1] interleaved calls on shared input are identical and leave the input unchanged", () => {
  const tasks = fullDigestTasks();
  const first: DigestInput = { timeZone: "Asia/Singapore", tasks, now: new Date(NOW) };
  const second: DigestInput = { timeZone: "UTC", tasks: [tasks[1]], now: new Date(NOW) };
  const snapshot = structuredClone(first);
  const taskRefs = [...tasks];
  const submissionRefs = tasks.map((t: Task) => t.submissions);
  const submissionItemRefs = tasks.map((t: Task) => [...t.submissions]);

  interleave(first, second);

  assert.deepEqual(first, snapshot);
  assert.equal(first.tasks, tasks);
  assert.equal(tasks.length, taskRefs.length);
  tasks.forEach((t: Task, i: number) => {
    assert.equal(t, taskRefs[i]);
    assert.equal(t.submissions, submissionRefs[i]);
    assert.equal(t.submissions.length, submissionItemRefs[i].length);
    t.submissions.forEach((s: Submission, j: number) => assert.equal(s, submissionItemRefs[i][j]));
  });
});

test("[concurrency-1] interleaved calls succeed on deeply frozen input", () => {
  const tasks = fullDigestTasks();
  const first = deepFreeze<DigestInput>({ timeZone: "Asia/Singapore", tasks, now: new Date(NOW) });
  const second = deepFreeze<DigestInput>({ timeZone: "UTC", tasks: [tasks[1]], now: new Date(NOW) });
  const snapshot = structuredClone(first);

  interleave(first, second);

  assert.deepEqual(first, snapshot);
});

test("[concurrency-2] mutating a returned digest does not affect the next call", () => {
  const input: DigestInput = { timeZone: "Asia/Singapore", tasks: fullDigestTasks(), now: new Date(NOW) };
  const first = buildDigest(input);
  assert.ok(first !== null, "expected a digest, got null");
  first!.tasks.push({ id: "EXTRA", title: "Extra", ageDays: 0, submissions: 0, furthestGate: 0, stalled: false });
  first!.tasks[0].stalled = false;

  assert.deepEqual(buildDigest(input), fullDigest());
});

test("[concurrency-2] rewriting every part of a returned digest leaves later results fresh and correct", () => {
  const input: DigestInput = { timeZone: "Asia/Singapore", tasks: fullDigestTasks(), now: new Date(NOW) };
  const first = buildDigest(input);
  assert.ok(first !== null, "expected a digest, got null");
  const firstEntries = [...first!.tasks];
  first!.subject = "changed";
  first!.tasks.forEach((e: DigestEntry) => {
    e.id = "changed";
    e.title = "changed";
    e.ageDays = -1;
    e.submissions = -1;
    e.furthestGate = 0;
    e.stalled = !e.stalled;
  });
  first!.tasks.reverse();
  first!.tasks.length = 0;

  const second = buildDigest(input);
  assert.deepEqual(second, fullDigest());
  assert.notEqual(second, first);
  assert.notEqual(second!.tasks, first!.tasks);
  second!.tasks.forEach((e: DigestEntry) => assert.ok(!firstEntries.includes(e), "entry object reused across calls"));
});
