import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest } from "../../src/index.js";
import type { Task } from "../../src/index.js";

// Stalled tasks were posted 55 days before now, the others 6 days before.
function subjectFor(n: number, s: number): string {
  const tasks: Task[] = [];
  for (let i = 0; i < n; i++) {
    const isStalled = i < s;
    tasks.push({
      id: `${isStalled ? "S" : "F"}${i}`,
      title: `Task ${i}`,
      status: "open",
      postedAt: new Date(isStalled ? "2026-09-01T09:00:00.000Z" : "2026-10-20T09:00:00.000Z"),
      submissions: [],
    });
  }
  const digest = buildDigest({ timeZone: "UTC", tasks, now: new Date("2026-10-26T09:00:00.000Z") });
  assert.ok(digest !== null, "expected a digest, got null");
  return digest!.subject;
}

test("[boundary-9] subject with several open tasks uses the plural", () => {
  assert.equal(subjectFor(5, 2), "Weekly digest: 5 open tasks, 2 stalled");
  assert.equal(subjectFor(2, 0), "Weekly digest: 2 open tasks, 0 stalled");
});

test("[boundary-9] subject is singular for one task and plain for two-digit counts", () => {
  assert.equal(subjectFor(1, 0), "Weekly digest: 1 open task, 0 stalled");
  assert.equal(subjectFor(1, 1), "Weekly digest: 1 open task, 1 stalled");
  assert.equal(subjectFor(12, 12), "Weekly digest: 12 open tasks, 12 stalled");
});
