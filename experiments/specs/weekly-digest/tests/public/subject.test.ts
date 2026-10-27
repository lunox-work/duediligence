import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest } from "../../src/index.js";
import type { Digest, DigestInput, Task } from "../../src/index.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-03-11T12:00:00.000Z");

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

function task(id: string, postedAgo: number, status: Task["status"] = "open"): Task {
  return { id, title: `Task ${id}`, status, postedAt: ago(postedAgo), submissions: [] };
}

function build(tasks: Task[]): Digest {
  const input: DigestInput = { timeZone: "Asia/Singapore", tasks, now: NOW };
  const digest = buildDigest(input);
  assert.notEqual(digest, null);
  return digest as Digest;
}

test("[happy-4] the subject counts 5 open tasks of which 2 are stalled", () => {
  const digest = build([
    task("t1", 1 * DAY),
    task("t2", 20 * DAY),
    task("t3", 3 * DAY),
    task("t4", 30 * DAY),
    task("t5", 5 * DAY),
  ]);
  assert.equal(digest.subject, "Weekly digest: 5 open tasks, 2 stalled");
});

test("[happy-4] the subject reads 1 open task and 0 stalled when one task is open and none is stalled", () => {
  assert.equal(build([task("t1", 1 * DAY)]).subject, "Weekly digest: 1 open task, 0 stalled");
});

test("[happy-4] the subject counts only open tasks, not merged ones", () => {
  const digest = build([
    task("t1", 20 * DAY),
    task("t2", 2 * DAY),
    task("m1", 30 * DAY, "merged"),
  ]);
  assert.equal(digest.subject, "Weekly digest: 2 open tasks, 1 stalled");
});

test("[unhappy-1] there is no digest when every task is merged", () => {
  const input: DigestInput = {
    timeZone: "Asia/Singapore",
    tasks: [task("m1", 3 * DAY, "merged"), task("m2", 20 * DAY, "merged")],
    now: NOW,
  };
  assert.equal(buildDigest(input), null);
});

test("[unhappy-1] there is no digest when there are no tasks at all", () => {
  assert.equal(buildDigest({ timeZone: "Asia/Singapore", tasks: [], now: NOW }), null);
});

test("[unhappy-2] buildDigest refuses an unknown time zone with an error naming it", () => {
  assert.throws(
    () => buildDigest({ timeZone: "Mars/Olympus", tasks: [task("t1", 3 * DAY)], now: NOW }),
    (err: unknown) => err instanceof Error && err.message.includes("Mars/Olympus"),
  );
});
