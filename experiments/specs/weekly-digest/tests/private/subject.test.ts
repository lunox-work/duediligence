import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest } from "../../src/index.js";
import type { Digest, DigestInput, Submission, Task } from "../../src/index.js";

const DAY = 24 * 60 * 60 * 1000;
// Monday 12:00 in Singapore.
const NOW = new Date("2026-03-16T04:00:00.000Z");

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

function task(id: string, postedAgo: number, status: Task["status"] = "open", submissions: Submission[] = []): Task {
  return { id, title: `Task ${id}`, status, postedAt: ago(postedAgo), submissions };
}

function subject(tasks: Task[]): string {
  const input: DigestInput = { timeZone: "Asia/Singapore", tasks, now: NOW };
  const digest = buildDigest(input);
  assert.notEqual(digest, null);
  return (digest as Digest).subject;
}

// Extends "[happy-4] the subject counts 5 open tasks of which 2 are stalled": other counts.
test("[happy-4] the subject counts 7 open tasks of which 4 are stalled", () => {
  assert.equal(
    subject([
      task("t1", 15 * DAY),
      task("t2", 1 * DAY),
      task("t3", 40 * DAY),
      task("t4", 2 * DAY),
      task("t5", 20 * DAY),
      task("t6", 30 * DAY, "open", [{ at: ago(1 * DAY), gate: 1 }]),
      task("t7", 30 * DAY, "open", [{ at: ago(14 * DAY), gate: 3 }]),
    ]),
    "Weekly digest: 7 open tasks, 4 stalled",
  );
});

test("[happy-4] the subject counts 12 open tasks of which 12 are stalled", () => {
  const tasks: Task[] = [];
  for (let i = 1; i <= 12; i++) tasks.push(task(`t${String(i).padStart(2, "0")}`, (14 + i) * DAY));
  assert.equal(subject(tasks), "Weekly digest: 12 open tasks, 12 stalled");
});

test("[happy-4] the subject counts 3 open tasks with 0 stalled", () => {
  assert.equal(
    subject([task("t1", 1 * DAY), task("t2", 5 * DAY), task("t3", 13 * DAY)]),
    "Weekly digest: 3 open tasks, 0 stalled",
  );
});

test("[happy-4] the subject counts 2 open tasks of which 2 are stalled", () => {
  assert.equal(subject([task("t1", 20 * DAY), task("t2", 14 * DAY)]), "Weekly digest: 2 open tasks, 2 stalled");
});

// Extends "[happy-4] the subject reads 1 open task and 0 stalled when one task is open and none is stalled".
test("[happy-4] the subject reads 1 open task and 1 stalled when the one open task is stalled", () => {
  assert.equal(subject([task("t1", 20 * DAY)]), "Weekly digest: 1 open task, 1 stalled");
});

test("[happy-4] the subject reads 1 open task when merged tasks are alongside it", () => {
  assert.equal(
    subject([task("m1", 2 * DAY, "merged"), task("t1", 3 * DAY), task("m2", 40 * DAY, "merged")]),
    "Weekly digest: 1 open task, 0 stalled",
  );
});

test("[happy-4] the subject reads 2 open tasks, 1 stalled with the stalled task counted by its latest submission", () => {
  assert.equal(
    subject([
      task("t1", 40 * DAY, "open", [{ at: ago(2 * DAY), gate: 1 }]),
      task("t2", 40 * DAY, "open", [{ at: ago(16 * DAY), gate: 2 }]),
    ]),
    "Weekly digest: 2 open tasks, 1 stalled",
  );
});

// Extends "[happy-4] the subject counts only open tasks, not merged ones": merged stalled-looking tasks are not counted.
test("[happy-4] merged tasks count neither as open nor as stalled in the subject", () => {
  assert.equal(
    subject([
      task("m1", 30 * DAY, "merged"),
      task("m2", 60 * DAY, "merged"),
      task("m3", 1 * DAY, "merged"),
      task("t1", 2 * DAY),
      task("t2", 3 * DAY),
      task("t3", 25 * DAY),
    ]),
    "Weekly digest: 3 open tasks, 1 stalled",
  );
});
