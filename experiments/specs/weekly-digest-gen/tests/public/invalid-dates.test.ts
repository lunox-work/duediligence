import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest, isDigestDue } from "../../src/index.js";
import type { Submission, Task, TaskStatus } from "../../src/index.js";

const NOW = "2026-10-26T09:00:00.000Z";

function assertRangeError(fn: () => unknown, message: string): void {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof RangeError, `expected a RangeError, got ${String(err)}`);
    assert.equal((err as RangeError).message, message);
    return true;
  });
}

function task(id: string, status: TaskStatus, postedAt: string, submissions: Submission[] = []): Task {
  return { id, title: id, status, postedAt: new Date(postedAt), submissions };
}

function tasksWithB(b: Task): Task[] {
  return [task("A", "open", "2026-10-19T09:00:00.000Z"), b, task("C", "open", "invalid")];
}

test("[unhappy-4] isDigestDue rejects an unparseable now", () => {
  assertRangeError(() => isDigestDue("UTC", new Date("garbage")), "Invalid date: now");
});

test("[unhappy-4] isDigestDue rejects a now just past the Date range", () => {
  assertRangeError(() => isDigestDue("UTC", new Date(8.64e15 + 1)), "Invalid date: now");
});

test("[unhappy-5] buildDigest rejects an invalid now with no tasks", () => {
  assertRangeError(() => buildDigest({ timeZone: "UTC", tasks: [], now: new Date("garbage") }), "Invalid date: now");
});

test("[unhappy-5] buildDigest reports an invalid now before invalid task dates", () => {
  assertRangeError(
    () => buildDigest({ timeZone: "UTC", tasks: [task("C", "open", "invalid")], now: new Date("garbage") }),
    "Invalid date: now",
  );
});

test("[unhappy-6] isDigestDue checks the time zone before now", () => {
  assertRangeError(() => isDigestDue("Mars/Olympus", new Date("garbage")), 'Unknown time zone: "Mars/Olympus"');
});

test("[unhappy-6] buildDigest checks an offset time zone before now", () => {
  assertRangeError(
    () => buildDigest({ timeZone: "-05:00", tasks: [], now: new Date("garbage") }),
    'Unknown time zone: "-05:00"',
  );
});

test("[unhappy-7] an open task with an invalid postedAt is named", () => {
  assertRangeError(
    () => buildDigest({ timeZone: "UTC", tasks: tasksWithB(task("B", "open", "invalid")), now: new Date(NOW) }),
    'Invalid date in task "B"',
  );
});

test("[unhappy-7] merged tasks, submission dates and the first failure in array order", () => {
  assertRangeError(
    () => buildDigest({ timeZone: "UTC", tasks: tasksWithB(task("B", "merged", "invalid")), now: new Date(NOW) }),
    'Invalid date in task "B"',
  );
  assertRangeError(
    () =>
      buildDigest({
        timeZone: "UTC",
        tasks: tasksWithB(task("B", "open", "2026-10-19T09:00:00.000Z", [{ at: new Date("invalid"), gate: 1 }])),
        now: new Date(NOW),
      }),
    'Invalid date in task "B"',
  );
  assertRangeError(
    () =>
      buildDigest({
        timeZone: "UTC",
        tasks: tasksWithB(
          task("B", "open", "2026-10-19T09:00:00.000Z", [{ at: new Date("2026-10-20T09:00:00.000Z"), gate: 1 }]),
        ),
        now: new Date(NOW),
      }),
    'Invalid date in task "C"',
  );
});
