import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest } from "../../src/index.js";
import type { Digest, DigestInput, Submission, Task } from "../../src/index.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Monday 12:00 in Singapore.
const NOW = new Date("2026-03-16T04:00:00.000Z");

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

function task(id: string, postedAgo: number, submissions: Submission[] = [], status: Task["status"] = "open"): Task {
  return { id, title: `Task ${id}`, status, postedAt: ago(postedAgo), submissions };
}

function order(tasks: Task[]): string[] {
  const input: DigestInput = { timeZone: "Asia/Singapore", tasks, now: NOW };
  const digest = buildDigest(input);
  assert.notEqual(digest, null);
  return (digest as Digest).tasks.map((e) => e.id);
}

// Extends "[happy-3] stalled tasks are listed first, then the others, older first within each group": more tasks, shuffled.
test("[happy-3] eight shuffled tasks are listed stalled first, then the others, older first within each group", () => {
  const ids = order([
    task("f3", 4 * DAY),
    task("s2", 25 * DAY),
    task("f1", 13 * DAY, [{ at: ago(12 * DAY), gate: 1 }]),
    task("s4", 15 * DAY),
    task("f4", 1 * DAY, [{ at: ago(2 * HOUR), gate: 2 }]),
    task("s1", 70 * DAY, [{ at: ago(50 * DAY), gate: 3 }]),
    task("f2", 9 * DAY, [{ at: ago(3 * DAY), gate: 1 }]),
    task("s3", 18 * DAY),
  ]);
  assert.deepEqual(ids, ["s1", "s2", "s3", "s4", "f1", "f2", "f3", "f4"]);
});

// Extends "[happy-3] stalled tasks are listed first, then the others, older first within each group":
// "older" is by posting, not by latest submission, in both groups.
test("[happy-3] within the stalled group the task posted earlier comes first even when its latest submission is more recent", () => {
  const ids = order([
    task("no-subs", 30 * DAY),
    task("posted-earlier", 40 * DAY, [{ at: ago(15 * DAY), gate: 1 }]),
  ]);
  assert.deepEqual(ids, ["posted-earlier", "no-subs"]);
});

test("[happy-3] within the other group the task posted earlier comes first even when its latest submission is more recent", () => {
  const ids = order([
    task("quiet", 10 * DAY, [{ at: ago(9 * DAY), gate: 2 }]),
    task("posted-earlier", 20 * DAY, [{ at: ago(1 * DAY), gate: 1 }]),
  ]);
  assert.deepEqual(ids, ["posted-earlier", "quiet"]);
});

// Extends "[happy-3] a stalled task comes before an older task that is not stalled": at the 14-day line.
test("[happy-3] a task stalled at exactly 14 days comes before a much older task that is not stalled", () => {
  const ids = order([
    task("old-active", 90 * DAY, [{ at: ago(13 * DAY + 23 * HOUR), gate: 2 }]),
    task("just-stalled", 14 * DAY),
  ]);
  assert.deepEqual(ids, ["just-stalled", "old-active"]);
});

test("[happy-3] every stalled task comes before every task that is not stalled, however old", () => {
  const ids = order([
    task("active-1", 100 * DAY, [{ at: ago(1 * DAY), gate: 1 }]),
    task("stalled-1", 16 * DAY),
    task("active-2", 80 * DAY, [{ at: ago(2 * DAY), gate: 3 }]),
    task("stalled-2", 15 * DAY),
  ]);
  assert.deepEqual(ids, ["stalled-1", "stalled-2", "active-1", "active-2"]);
});

// Extends "[happy-3] tasks of the same age within a group are ordered by id": input in reverse id order.
test("[happy-3] tasks posted at the same time are ordered by id when given in reverse id order", () => {
  const ids = order([
    task("delta", 6 * DAY),
    task("charlie", 6 * DAY),
    task("bravo", 6 * DAY),
    task("alpha", 6 * DAY),
  ]);
  assert.deepEqual(ids, ["alpha", "bravo", "charlie", "delta"]);
});

test("[happy-3] stalled tasks posted at the same time are ordered by id", () => {
  const ids = order([
    task("task-07", 30 * DAY),
    task("task-03", 30 * DAY),
    task("task-09", 30 * DAY),
    task("task-01", 30 * DAY),
    task("task-05", 2 * DAY),
  ]);
  assert.deepEqual(ids, ["task-01", "task-03", "task-07", "task-09", "task-05"]);
});

test("[happy-3] an older task comes first even when its id sorts later", () => {
  const ids = order([task("aaa", 3 * DAY), task("mmm", 5 * DAY), task("zzz", 9 * DAY)]);
  assert.deepEqual(ids, ["zzz", "mmm", "aaa"]);
});

test("[happy-3] ties by id inside both groups, with merged tasks among them not listed", () => {
  const ids = order([
    task("e", 3 * DAY),
    task("m", 20 * DAY, [], "merged"),
    task("d", 20 * DAY),
    task("c", 3 * DAY),
    task("b", 20 * DAY),
    task("n", 3 * DAY, [], "merged"),
    task("a", 7 * DAY, [{ at: ago(1 * DAY), gate: 1 }]),
  ]);
  assert.deepEqual(ids, ["b", "d", "a", "c", "e"]);
});

test("[happy-3] when every task is stalled they are listed older first", () => {
  const ids = order([task("p", 20 * DAY), task("q", 50 * DAY), task("r", 33 * DAY)]);
  assert.deepEqual(ids, ["q", "r", "p"]);
});

test("[happy-3] when no task is stalled they are listed older first", () => {
  const ids = order([
    task("p", 2 * DAY),
    task("q", 12 * DAY),
    task("r", 30 * DAY, [{ at: ago(5 * DAY), gate: 2 }]),
  ]);
  assert.deepEqual(ids, ["r", "q", "p"]);
});
