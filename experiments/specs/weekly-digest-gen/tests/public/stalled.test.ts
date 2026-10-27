import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest } from "../../src/index.js";
import type { Digest, DigestEntry, Submission, Task } from "../../src/index.js";

const NOW = "2026-10-26T09:00:00.000Z";

function sub(at: string, gate: 1 | 2 | 3): Submission {
  return { at: new Date(at), gate };
}

function openTask(id: string, postedAt: string, submissions: Submission[] = []): Task {
  return { id, title: id, status: "open", postedAt: new Date(postedAt), submissions };
}

function digestOf(tasks: Task[]): Digest {
  const digest = buildDigest({ timeZone: "UTC", tasks, now: new Date(NOW) });
  assert.ok(digest !== null, "expected a digest, got null");
  return digest!;
}

function entryFor(digest: Digest, id: string): DigestEntry {
  const entry = digest.tasks.find((e: DigestEntry) => e.id === id);
  assert.ok(entry, `no entry for ${id}`);
  return entry!;
}

function stalled(postedAt: string, submissions: Submission[] = []): boolean {
  return entryFor(digestOf([openTask("T1", postedAt, submissions)]), "T1").stalled;
}

test("[boundary-8] a task posted exactly 14 days ago is stalled, a millisecond later it is not", () => {
  assert.equal(stalled("2026-10-12T09:00:00.000Z"), true);
  assert.equal(stalled("2026-10-12T09:00:00.001Z"), false);
});

test("[boundary-8] the threshold applies to the latest submission, and future activity is not stalled", () => {
  assert.equal(stalled("2026-09-01T09:00:00.000Z", [sub("2026-10-12T09:00:00.000Z", 1)]), true);
  assert.equal(stalled("2026-09-01T09:00:00.000Z", [sub("2026-10-12T09:00:00.001Z", 1)]), false);
  assert.equal(stalled("2026-09-01T09:00:00.000Z", [sub("2026-10-27T09:00:00.000Z", 1)]), false);
  assert.equal(stalled("2026-10-30T09:00:00.000Z"), false);
});

test("[happy-7] a recent submission listed before an older one keeps the task active", () => {
  const entry = entryFor(
    digestOf([openTask("T1", "2026-09-01T09:00:00.000Z", [sub("2026-10-20T09:00:00.000Z", 1), sub("2026-10-02T09:00:00.000Z", 2)])]),
    "T1",
  );
  assert.equal(entry.stalled, false);
  assert.equal(entry.furthestGate, 2);
});

test("[happy-7] a latest submission a millisecond inside 14 days counts even when listed first", () => {
  const entry = entryFor(
    digestOf([
      openTask("T1", "2026-09-01T09:00:00.000Z", [
        sub("2026-10-12T09:00:00.001Z", 1),
        sub("2026-10-01T09:00:00.000Z", 3),
        sub("2026-09-15T09:00:00.000Z", 2),
      ]),
    ]),
    "T1",
  );
  assert.equal(entry.stalled, false);
  assert.equal(entry.furthestGate, 3);
});

test("[happy-8] an old task with a recent submission is not stalled, a new unsubmitted one is", () => {
  const digest = digestOf([
    openTask("OLD", "2026-06-01T09:00:00.000Z", [sub("2026-10-25T09:00:00.000Z", 1)]),
    openTask("NEW", "2026-10-10T09:00:00.000Z"),
  ]);
  assert.equal(entryFor(digest, "OLD").stalled, false);
  assert.equal(entryFor(digest, "NEW").stalled, true);
});

test("[happy-8] submission just inside 14 days keeps an old task active, posting exactly 14 days ago stalls a new one", () => {
  const digest = digestOf([
    openTask("OLD", "2026-06-01T09:00:00.000Z", [sub("2026-10-12T09:00:00.001Z", 1)]),
    openTask("NEW", "2026-10-12T09:00:00.000Z"),
  ]);
  assert.equal(entryFor(digest, "OLD").stalled, false);
  assert.equal(entryFor(digest, "NEW").stalled, true);
});
