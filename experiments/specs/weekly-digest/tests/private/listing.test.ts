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

function task(
  id: string,
  postedAgo: number,
  submissions: Submission[] = [],
  status: Task["status"] = "open",
  title = `Task ${id}`,
): Task {
  return { id, title, status, postedAt: ago(postedAgo), submissions };
}

function build(tasks: Task[], timeZone = "Asia/Singapore", now = NOW): Digest {
  const input: DigestInput = { timeZone, tasks, now };
  const digest = buildDigest(input);
  assert.notEqual(digest, null);
  return digest as Digest;
}

function entry(digest: Digest, id: string): DigestEntry {
  const found = digest.tasks.find((e) => e.id === id);
  assert.ok(found, `task ${id} is listed`);
  return found as DigestEntry;
}

// Extends "[happy-2] an open task is listed with age, submissions and furthest gate": several tasks, each with its own state.
test("[happy-2] several open tasks are each listed with their own age, submissions and furthest gate", () => {
  const digest = build([
    task("a", 3 * DAY, [{ at: ago(1 * DAY), gate: 1 }]),
    task("b", 7 * DAY, [
      { at: ago(6 * DAY), gate: 1 },
      { at: ago(5 * DAY), gate: 3 },
      { at: ago(4 * DAY), gate: 2 },
    ]),
    task("c", 11 * DAY),
    task("d", 1 * DAY, [
      { at: ago(20 * HOUR), gate: 2 },
      { at: ago(10 * HOUR), gate: 2 },
    ]),
  ]);
  assert.equal(digest.tasks.length, 4);
  const a = entry(digest, "a");
  assert.equal(a.ageDays, 3);
  assert.equal(a.submissions, 1);
  assert.equal(a.furthestGate, 1);
  const b = entry(digest, "b");
  assert.equal(b.ageDays, 7);
  assert.equal(b.submissions, 3);
  assert.equal(b.furthestGate, 3);
  const c = entry(digest, "c");
  assert.equal(c.ageDays, 11);
  assert.equal(c.submissions, 0);
  assert.equal(c.furthestGate, 0);
  const d = entry(digest, "d");
  assert.equal(d.ageDays, 1);
  assert.equal(d.submissions, 2);
  assert.equal(d.furthestGate, 2);
});

// Extends "[happy-2] an open task is listed with age, submissions and furthest gate": the title is the task's own, whatever it is.
test("[happy-2] an open task is listed with its own id and title", () => {
  const e = entry(
    build([task("PRJ-482", 4 * DAY, [], "open", "Fix flaky login test on CI")]),
    "PRJ-482",
  );
  assert.equal(e.id, "PRJ-482");
  assert.equal(e.title, "Fix flaky login test on CI");
});

// Extends "[happy-2] an open task is listed with age, submissions and furthest gate": many submissions.
test("[happy-2] a task with nine submissions is listed with 9 submissions", () => {
  const subs: Submission[] = [];
  for (let i = 0; i < 9; i++) subs.push({ at: ago((9 - i) * HOUR), gate: 1 });
  const e = entry(build([task("t1", 2 * DAY, subs)]), "t1");
  assert.equal(e.submissions, 9);
  assert.equal(e.furthestGate, 1);
});

// Extends "[happy-2] the furthest gate is the highest reached, not the latest": the highest is neither first nor last.
test("[happy-2] the furthest gate is the highest reached when it is in the middle of the submissions", () => {
  const e = entry(
    build([
      task("t1", 12 * DAY, [
        { at: ago(10 * DAY), gate: 1 },
        { at: ago(8 * DAY), gate: 3 },
        { at: ago(5 * DAY), gate: 2 },
        { at: ago(1 * DAY), gate: 1 },
      ]),
    ]),
    "t1",
  );
  assert.equal(e.submissions, 4);
  assert.equal(e.furthestGate, 3);
});

test("[happy-2] the furthest gate is the highest reached when the submissions are not in time order", () => {
  const e = entry(
    build([
      task("t1", 12 * DAY, [
        { at: ago(1 * DAY), gate: 1 },
        { at: ago(9 * DAY), gate: 2 },
        { at: ago(4 * DAY), gate: 1 },
      ]),
    ]),
    "t1",
  );
  assert.equal(e.submissions, 3);
  assert.equal(e.furthestGate, 2);
});

test("[happy-2] the furthest gate is 3 when a single submission reached gate 3", () => {
  const e = entry(build([task("t1", 5 * DAY, [{ at: ago(2 * DAY), gate: 3 }])]), "t1");
  assert.equal(e.submissions, 1);
  assert.equal(e.furthestGate, 3);
});

// Extends "[happy-2] a task with no submissions has furthest gate 0": alongside tasks that have submissions.
test("[happy-2] tasks with no submissions have furthest gate 0 next to tasks that have some", () => {
  const digest = build([
    task("with", 6 * DAY, [{ at: ago(1 * DAY), gate: 3 }]),
    task("none-1", 2 * DAY),
    task("none-2", 20 * DAY),
  ]);
  assert.equal(entry(digest, "none-1").furthestGate, 0);
  assert.equal(entry(digest, "none-1").submissions, 0);
  assert.equal(entry(digest, "none-2").furthestGate, 0);
  assert.equal(entry(digest, "none-2").submissions, 0);
  assert.equal(entry(digest, "with").furthestGate, 3);
});

// Extends "[happy-2] merged tasks are not listed": several merged tasks interleaved with open ones.
test("[happy-2] several merged tasks interleaved with open ones are not listed", () => {
  const digest = build([
    task("m1", 30 * DAY, [], "merged"),
    task("o1", 2 * DAY),
    task("m2", 3 * DAY, [{ at: ago(1 * DAY), gate: 3 }], "merged"),
    task("o2", 5 * DAY, [{ at: ago(1 * DAY), gate: 1 }]),
    task("m3", 1 * DAY, [], "merged"),
    task("o3", 8 * DAY),
  ]);
  const ids = digest.tasks.map((e) => e.id).sort();
  assert.deepEqual(ids, ["o1", "o2", "o3"]);
});

test("[happy-2] a merged task is not listed even when it would be stalled", () => {
  const digest = build([task("open", 2 * DAY), task("old-merged", 60 * DAY, [], "merged")]);
  assert.deepEqual(
    digest.tasks.map((e) => e.id),
    ["open"],
  );
});

// Extends "[boundary-2] a task posted 9 days and 23 hours before now has age 9": less than one day is age 0.
test("[boundary-2] a task posted 23 hours before now has age 0", () => {
  assert.equal(entry(build([task("t1", 23 * HOUR)]), "t1").ageDays, 0);
});

test("[boundary-2] a task posted one millisecond before now has age 0", () => {
  assert.equal(entry(build([task("t1", 1)]), "t1").ageDays, 0);
});

test("[boundary-2] a task posted exactly now has age 0", () => {
  assert.equal(entry(build([task("t1", 0)]), "t1").ageDays, 0);
});

// Extends "[boundary-2] a task posted exactly 10 days before now has age 10": exactly one day.
test("[boundary-2] a task posted exactly 24 hours before now has age 1", () => {
  assert.equal(entry(build([task("t1", 1 * DAY)]), "t1").ageDays, 1);
});

// A round-to-nearest shortcut gets this wrong.
test("[boundary-2] a task posted 4 days and 13 hours before now has age 4", () => {
  assert.equal(entry(build([task("t1", 4 * DAY + 13 * HOUR)]), "t1").ageDays, 4);
});

test("[boundary-2] a task posted 10 days and one millisecond before now has age 10", () => {
  assert.equal(entry(build([task("t1", 10 * DAY + 1)]), "t1").ageDays, 10);
});

test("[boundary-2] a task posted 400 days and 23 hours before now has age 400", () => {
  assert.equal(entry(build([task("t1", 400 * DAY + 23 * HOUR)]), "t1").ageDays, 400);
});

test("[boundary-2] ages of several tasks each count whole 24-hour periods", () => {
  const digest = build([
    task("a", 2 * DAY - 1),
    task("b", 2 * DAY),
    task("c", 6 * DAY + 12 * HOUR),
    task("d", 21 * DAY - 1),
  ]);
  assert.equal(entry(digest, "a").ageDays, 1);
  assert.equal(entry(digest, "b").ageDays, 2);
  assert.equal(entry(digest, "c").ageDays, 6);
  assert.equal(entry(digest, "d").ageDays, 20);
});

// Age counts 24-hour periods, not local calendar days: across the start of daylight saving
// time in New York, ten calendar days at 00:30 local are only 9 days and 23 hours.
test("[boundary-2] a task posted ten local calendar days ago across a clock change in New York has age 9", () => {
  const now = new Date("2026-03-12T04:30:00.000Z"); // Thursday 00:30 EDT
  const postedAt = new Date("2026-03-02T05:30:00.000Z"); // Monday 00:30 EST
  const digest = build(
    [{ id: "t1", title: "Task t1", status: "open", postedAt, submissions: [] }],
    "America/New_York",
    now,
  );
  assert.equal(entry(digest, "t1").ageDays, 9);
});
