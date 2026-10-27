import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest } from "../../src/index.js";
import type { Digest, DigestEntry, DigestInput, Submission, Task } from "../../src/index.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-03-11T12:00:00.000Z");

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

function task(id: string, postedAgo: number, submissions: Submission[] = [], status: Task["status"] = "open"): Task {
  return { id, title: `Task ${id}`, status, postedAt: ago(postedAgo), submissions };
}

function build(tasks: Task[]): Digest {
  const input: DigestInput = { timeZone: "Asia/Singapore", tasks, now: NOW };
  const digest = buildDigest(input);
  assert.notEqual(digest, null);
  return digest as Digest;
}

function entry(digest: Digest, id: string): DigestEntry {
  const found = digest.tasks.find((e) => e.id === id);
  assert.ok(found, `task ${id} is listed`);
  return found as DigestEntry;
}

test("[happy-2] an open task is listed with age, submissions and furthest gate", () => {
  const digest = build([
    task("t1", 10 * DAY, [
      { at: ago(5 * DAY), gate: 1 },
      { at: ago(3 * DAY), gate: 2 },
    ]),
  ]);
  assert.equal(digest.tasks.length, 1);
  const e = entry(digest, "t1");
  assert.equal(e.title, "Task t1");
  assert.equal(e.ageDays, 10);
  assert.equal(e.submissions, 2);
  assert.equal(e.furthestGate, 2);
  assert.equal(e.stalled, false);
});

test("[happy-2] a task with no submissions has furthest gate 0", () => {
  const e = entry(build([task("t1", 3 * DAY)]), "t1");
  assert.equal(e.submissions, 0);
  assert.equal(e.furthestGate, 0);
});

test("[happy-2] the furthest gate is the highest reached, not the latest", () => {
  const e = entry(
    build([
      task("t1", 10 * DAY, [
        { at: ago(6 * DAY), gate: 3 },
        { at: ago(2 * DAY), gate: 1 },
      ]),
    ]),
    "t1",
  );
  assert.equal(e.submissions, 2);
  assert.equal(e.furthestGate, 3);
});

test("[happy-2] merged tasks are not listed", () => {
  const digest = build([
    task("open-1", 4 * DAY),
    task("merged-1", 5 * DAY, [{ at: ago(1 * DAY), gate: 3 }], "merged"),
  ]);
  assert.deepEqual(
    digest.tasks.map((e) => e.id),
    ["open-1"],
  );
});

test("[boundary-2] a task posted exactly 10 days before now has age 10", () => {
  assert.equal(entry(build([task("t1", 10 * DAY)]), "t1").ageDays, 10);
});

test("[boundary-2] a task posted 9 days and 23 hours before now has age 9", () => {
  assert.equal(entry(build([task("t1", 9 * DAY + 23 * HOUR)]), "t1").ageDays, 9);
});

test("[boundary-2] a task posted one millisecond short of 10 days before now has age 9", () => {
  assert.equal(entry(build([task("t1", 10 * DAY - 1)]), "t1").ageDays, 9);
});
