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

function task(id: string, postedAgo: number, submissions: Submission[] = []): Task {
  return { id, title: `Task ${id}`, status: "open", postedAt: ago(postedAgo), submissions };
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

test("[boundary-3] a task without submissions posted 14 days before now is stalled", () => {
  assert.equal(entry(build([task("t1", 14 * DAY)]), "t1").stalled, true);
});

test("[boundary-3] a task whose latest submission is 14 days before now is stalled", () => {
  const e = entry(
    build([
      task("t1", 20 * DAY, [
        { at: ago(18 * DAY), gate: 1 },
        { at: ago(14 * DAY), gate: 2 },
      ]),
    ]),
    "t1",
  );
  assert.equal(e.stalled, true);
});

test("[boundary-3] a task whose latest submission is 13 days and 23 hours before now is not stalled", () => {
  const e = entry(build([task("t1", 20 * DAY, [{ at: ago(13 * DAY + 23 * HOUR), gate: 1 }])]), "t1");
  assert.equal(e.stalled, false);
});

test("[boundary-3] a task without submissions posted 13 days and 23 hours before now is not stalled", () => {
  assert.equal(entry(build([task("t1", 13 * DAY + 23 * HOUR)]), "t1").stalled, false);
});

test("[boundary-3] a task posted 30 days ago with a submission 2 days ago is not stalled", () => {
  const e = entry(build([task("t1", 30 * DAY, [{ at: ago(2 * DAY), gate: 1 }])]), "t1");
  assert.equal(e.stalled, false);
});

test("[happy-3] stalled tasks are listed first, then the others, older first within each group", () => {
  const digest = build([
    task("fresh-young", 2 * DAY),
    task("stalled-young", 20 * DAY),
    task("fresh-old", 12 * DAY, [{ at: ago(1 * DAY), gate: 1 }]),
    task("stalled-old", 40 * DAY, [{ at: ago(25 * DAY), gate: 2 }]),
  ]);
  assert.deepEqual(
    digest.tasks.map((e) => e.id),
    ["stalled-old", "stalled-young", "fresh-old", "fresh-young"],
  );
});

test("[happy-3] a stalled task comes before an older task that is not stalled", () => {
  const digest = build([
    task("old-active", 60 * DAY, [{ at: ago(1 * DAY), gate: 3 }]),
    task("young-stalled", 15 * DAY),
  ]);
  assert.deepEqual(
    digest.tasks.map((e) => e.id),
    ["young-stalled", "old-active"],
  );
});

test("[happy-3] tasks of the same age within a group are ordered by id", () => {
  const digest = build([
    task("c", 5 * DAY),
    task("y", 20 * DAY),
    task("a", 5 * DAY),
    task("x", 20 * DAY),
    task("b", 5 * DAY),
  ]);
  assert.deepEqual(
    digest.tasks.map((e) => e.id),
    ["x", "y", "a", "b", "c"],
  );
});
