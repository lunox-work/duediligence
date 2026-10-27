import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest } from "../../src/index.js";
import type { Digest, DigestEntry, DigestInput, Submission, Task } from "../../src/index.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Monday 12:00 in Singapore.
const NOW = new Date("2026-03-16T04:00:00.000Z");

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

function task(id: string, postedAgo: number, submissions: Submission[] = []): Task {
  return { id, title: `Task ${id}`, status: "open", postedAt: ago(postedAgo), submissions };
}

function build(tasks: Task[], timeZone = "Asia/Singapore", now = NOW): Digest {
  const input: DigestInput = { timeZone, tasks, now };
  const digest = buildDigest(input);
  assert.notEqual(digest, null);
  return digest as Digest;
}

function stalled(digest: Digest, id: string): boolean {
  const found = digest.tasks.find((e) => e.id === id);
  assert.ok(found, `task ${id} is listed`);
  return (found as DigestEntry).stalled;
}

// Extends "[boundary-3] a task without submissions posted 14 days before now is stalled": the millisecond either side.
test("[boundary-3] a task without submissions posted one millisecond short of 14 days before now is not stalled", () => {
  assert.equal(stalled(build([task("t1", 14 * DAY - 1)]), "t1"), false);
});

test("[boundary-3] a task without submissions posted 14 days and one millisecond before now is stalled", () => {
  assert.equal(stalled(build([task("t1", 14 * DAY + 1)]), "t1"), true);
});

test("[boundary-3] a task without submissions posted 90 days before now is stalled", () => {
  assert.equal(stalled(build([task("t1", 90 * DAY)]), "t1"), true);
});

test("[boundary-3] a task without submissions posted 1 day before now is not stalled", () => {
  assert.equal(stalled(build([task("t1", 1 * DAY)]), "t1"), false);
});

// Extends "[boundary-3] a task whose latest submission is 14 days before now is stalled": the latest is not last in the list.
test("[boundary-3] a task is stalled by its latest submission when submissions are listed newest first", () => {
  const t = task("t1", 40 * DAY, [
    { at: ago(15 * DAY), gate: 3 },
    { at: ago(30 * DAY), gate: 1 },
    { at: ago(22 * DAY), gate: 2 },
  ]);
  assert.equal(stalled(build([t]), "t1"), true);
});

test("[boundary-3] a task whose latest submission is 14 days and one millisecond before now is stalled", () => {
  const t = task("t1", 20 * DAY, [{ at: ago(14 * DAY + 1), gate: 2 }]);
  assert.equal(stalled(build([t]), "t1"), true);
});

// Extends "[boundary-3] a task whose latest submission is 13 days and 23 hours before now is not stalled":
// the latest submission is first in the list, older ones after it.
test("[boundary-3] a task is not stalled when its latest submission is first in the list and recent", () => {
  const t = task("t1", 40 * DAY, [
    { at: ago(1 * DAY), gate: 1 },
    { at: ago(35 * DAY), gate: 3 },
    { at: ago(20 * DAY), gate: 2 },
  ]);
  assert.equal(stalled(build([t]), "t1"), false);
});

test("[boundary-3] a task is not stalled when its latest submission is in the middle of the list and recent", () => {
  const t = task("t1", 40 * DAY, [
    { at: ago(30 * DAY), gate: 1 },
    { at: ago(3 * DAY), gate: 1 },
    { at: ago(25 * DAY), gate: 3 },
  ]);
  assert.equal(stalled(build([t]), "t1"), false);
});

test("[boundary-3] a task whose latest submission is one millisecond short of 14 days before now is not stalled", () => {
  const t = task("t1", 50 * DAY, [
    { at: ago(40 * DAY), gate: 1 },
    { at: ago(14 * DAY - 1), gate: 1 },
  ]);
  assert.equal(stalled(build([t]), "t1"), false);
});

// Extends "[boundary-3] a task posted 30 days ago with a submission 2 days ago is not stalled": other values.
test("[boundary-3] a task posted 100 days ago with a submission 13 days ago is not stalled", () => {
  assert.equal(stalled(build([task("t1", 100 * DAY, [{ at: ago(13 * DAY), gate: 1 }])]), "t1"), false);
});

test("[boundary-3] a task posted 100 days ago whose only submission reached gate 3 20 days ago is stalled", () => {
  assert.equal(stalled(build([task("t1", 100 * DAY, [{ at: ago(20 * DAY), gate: 3 }])]), "t1"), true);
});

// Extends "[boundary-3] a task without submissions posted 13 days and 23 hours before now is not stalled":
// stalling counts 24-hour periods, not local calendar days. Across the start of daylight saving time
// in New York, fourteen calendar days at 00:30 local are only 13 days and 23 hours.
test("[boundary-3] a task posted fourteen local calendar days ago across a clock change in New York is not stalled", () => {
  const now = new Date("2026-03-12T04:30:00.000Z"); // Thursday 00:30 EDT
  const postedAt = new Date("2026-02-26T05:30:00.000Z"); // Thursday 00:30 EST
  const digest = build(
    [{ id: "t1", title: "Task t1", status: "open", postedAt, submissions: [] }],
    "America/New_York",
    now,
  );
  assert.equal(stalled(digest, "t1"), false);
});

test("[boundary-3] a task posted exactly 14 days ago across a clock change in New York is stalled", () => {
  const now = new Date("2026-03-12T04:30:00.000Z");
  const postedAt = new Date(now.getTime() - 14 * DAY);
  const digest = build(
    [{ id: "t1", title: "Task t1", status: "open", postedAt, submissions: [] }],
    "America/New_York",
    now,
  );
  assert.equal(stalled(digest, "t1"), true);
});

test("[boundary-3] several tasks are each flagged by their own latest activity", () => {
  const digest = build([
    task("a", 14 * DAY),
    task("b", 13 * DAY + 23 * HOUR),
    task("c", 30 * DAY, [{ at: ago(14 * DAY), gate: 1 }]),
    task("d", 30 * DAY, [
      { at: ago(29 * DAY), gate: 3 },
      { at: ago(10 * DAY), gate: 1 },
    ]),
    task("e", 60 * DAY, [{ at: ago(59 * DAY), gate: 2 }]),
  ]);
  assert.equal(stalled(digest, "a"), true);
  assert.equal(stalled(digest, "b"), false);
  assert.equal(stalled(digest, "c"), true);
  assert.equal(stalled(digest, "d"), false);
  assert.equal(stalled(digest, "e"), true);
});
