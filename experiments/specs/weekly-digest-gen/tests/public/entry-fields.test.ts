import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest } from "../../src/index.js";
import type { DigestEntry, Submission } from "../../src/index.js";

const NOW = "2026-10-26T09:00:00.000Z";

function sub(at: string, gate: 1 | 2 | 3): Submission {
  return { at: new Date(at), gate };
}

function onlyEntry(id: string, title: string, submissions: Submission[]): DigestEntry {
  const digest = buildDigest({
    timeZone: "UTC",
    tasks: [{ id, title, status: "open", postedAt: new Date("2026-10-20T09:00:00.000Z"), submissions }],
    now: new Date(NOW),
  });
  assert.ok(digest !== null, "expected a digest, got null");
  assert.equal(digest!.tasks.length, 1);
  return digest!.tasks[0];
}

test("[happy-6] furthestGate is the gate of one submission, or the highest of several", () => {
  const one = onlyEntry("T1", "T1", [sub("2026-10-21T09:00:00.000Z", 1)]);
  assert.equal(one.submissions, 1);
  assert.equal(one.furthestGate, 1);

  const two = onlyEntry("T1", "T1", [sub("2026-10-21T09:00:00.000Z", 3), sub("2026-10-22T09:00:00.000Z", 1)]);
  assert.equal(two.submissions, 2);
  assert.equal(two.furthestGate, 3);
});

test("[happy-6] furthestGate is 0 with no submissions and the repeated maximum otherwise", () => {
  const none = onlyEntry("T1", "T1", []);
  assert.equal(none.submissions, 0);
  assert.equal(none.furthestGate, 0);

  const three = onlyEntry("T1", "T1", [
    sub("2026-10-21T09:00:00.000Z", 2),
    sub("2026-10-22T09:00:00.000Z", 2),
    sub("2026-10-23T09:00:00.000Z", 1),
  ]);
  assert.equal(three.submissions, 3);
  assert.equal(three.furthestGate, 2);
});

test("[boundary-5] an entry has exactly the six fields with id and title copied", () => {
  assert.deepEqual(onlyEntry("T1", "Fix login", []), {
    id: "T1",
    title: "Fix login",
    ageDays: 6,
    submissions: 0,
    furthestGate: 0,
    stalled: false,
  });
});

test("[boundary-5] an id with spaces and an empty title are copied verbatim", () => {
  assert.deepEqual(onlyEntry(" x ", "", []), {
    id: " x ",
    title: "",
    ageDays: 6,
    submissions: 0,
    furthestGate: 0,
    stalled: false,
  });
});
