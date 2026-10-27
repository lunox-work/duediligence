import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest } from "../../src/index.js";
import type { Submission, Task } from "../../src/index.js";

const DAY = 24 * 60 * 60 * 1000;
// Monday 12:00 in Singapore.
const NOW = new Date("2026-03-16T04:00:00.000Z");

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

function merged(id: string, postedAgo: number, submissions: Submission[] = []): Task {
  return { id, title: `Task ${id}`, status: "merged", postedAt: ago(postedAgo), submissions };
}

// Extends "[unhappy-1] there is no digest when every task is merged": a single merged task.
test("[unhappy-1] there is no digest when the only task is merged", () => {
  assert.equal(buildDigest({ timeZone: "Asia/Singapore", tasks: [merged("m1", 2 * DAY)], now: NOW }), null);
});

// Extends "[unhappy-1] there is no digest when every task is merged": many merged tasks, with submissions,
// some of which would be stalled if they were open.
test("[unhappy-1] there is no digest when ten tasks are all merged, stalled-looking or not", () => {
  const tasks: Task[] = [];
  for (let i = 0; i < 10; i++) {
    tasks.push(merged(`m${i}`, (i * 7 + 1) * DAY, i % 2 === 0 ? [] : [{ at: ago(i * DAY), gate: 3 }]));
  }
  assert.equal(buildDigest({ timeZone: "Asia/Singapore", tasks, now: NOW }), null);
});

// Extends "[unhappy-1] there is no digest when there are no tasks at all": another time zone and moment.
test("[unhappy-1] there is no digest when there are no tasks at all in New York", () => {
  assert.equal(
    buildDigest({ timeZone: "America/New_York", tasks: [], now: new Date("2026-03-09T04:30:00Z") }),
    null,
  );
});

test("[unhappy-1] there is no digest when every task is merged in New York", () => {
  const now = new Date("2026-03-09T04:30:00Z");
  const m1: Task = { id: "m1", title: "Task m1", status: "merged", postedAt: new Date(now.getTime() - 20 * DAY), submissions: [] };
  const m2: Task = {
    id: "m2",
    title: "Task m2",
    status: "merged",
    postedAt: new Date(now.getTime() - 1 * DAY),
    submissions: [{ at: new Date(now.getTime() - DAY / 2), gate: 1 }],
  };
  assert.equal(buildDigest({ timeZone: "America/New_York", tasks: [m1, m2], now }), null);
});
