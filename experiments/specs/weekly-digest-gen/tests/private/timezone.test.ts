import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest, isDigestDue } from "../../src/index.js";
import type { Task } from "../../src/index.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-03-16T04:00:00.000Z");

function openTask(id: string, postedAgo: number): Task {
  return { id, title: `Task ${id}`, status: "open", postedAt: new Date(NOW.getTime() - postedAgo), submissions: [] };
}

function namesZone(zone: string) {
  return (err: unknown) => err instanceof Error && err.message.includes(zone);
}

// Extends "[unhappy-2] isDigestDue refuses an unknown time zone with an error naming it": other unknown names.
test("[unhappy-2] isDigestDue refuses Moon/Tranquility with an error naming it", () => {
  assert.throws(() => isDigestDue("Moon/Tranquility", NOW), namesZone("Moon/Tranquility"));
});

test("[unhappy-2] isDigestDue refuses Europe/Atlantis with an error naming it", () => {
  assert.throws(() => isDigestDue("Europe/Atlantis", NOW), namesZone("Europe/Atlantis"));
});

test("[unhappy-2] isDigestDue refuses an unknown time zone on a day that is not Monday anywhere", () => {
  assert.throws(
    () => isDigestDue("Mars/Olympus", new Date("2026-03-04T12:00:00Z")),
    namesZone("Mars/Olympus"),
  );
});

// Extends "[unhappy-2] buildDigest refuses an unknown time zone with an error naming it": other names, more tasks.
test("[unhappy-2] buildDigest refuses Moon/Tranquility with an error naming it", () => {
  assert.throws(
    () =>
      buildDigest({
        timeZone: "Moon/Tranquility",
        tasks: [openTask("a", 2 * DAY), openTask("b", 20 * DAY), openTask("c", 40 * DAY)],
        now: NOW,
      }),
    namesZone("Moon/Tranquility"),
  );
});

test("[unhappy-2] buildDigest refuses Europe/Atlantis with an error naming it", () => {
  assert.throws(
    () => buildDigest({ timeZone: "Europe/Atlantis", tasks: [openTask("a", 3 * DAY)], now: NOW }),
    namesZone("Europe/Atlantis"),
  );
});
