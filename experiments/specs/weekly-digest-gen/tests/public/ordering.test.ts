import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest } from "../../src/index.js";
import type { Digest, DigestEntry, Submission, Task } from "../../src/index.js";

const NOW = "2026-10-26T09:00:00.000Z";

function sub(at: string, gate: 1 | 2 | 3): Submission {
  return { at: new Date(at), gate };
}

function openTask(id: string, postedAt: string, submissions: Submission[] = [], title: string = id): Task {
  return { id, title, status: "open", postedAt: new Date(postedAt), submissions };
}

function digestOf(tasks: Task[]): Digest {
  const digest = buildDigest({ timeZone: "UTC", tasks, now: new Date(NOW) });
  assert.ok(digest !== null, "expected a digest, got null");
  return digest!;
}

function ids(digest: Digest): string[] {
  return digest.tasks.map((e: DigestEntry) => e.id);
}

test("[happy-9] the task posted an hour earlier comes first despite its later id", () => {
  const digest = digestOf([openTask("a", "2026-10-19T10:00:00.000Z"), openTask("z", "2026-10-19T09:00:00.000Z")]);
  assert.deepEqual(ids(digest), ["z", "a"]);
});

test("[happy-9] a posting one millisecond earlier comes first", () => {
  const digest = digestOf([openTask("a", "2026-10-19T10:00:00.001Z"), openTask("z", "2026-10-19T10:00:00.000Z")]);
  assert.deepEqual(
    digest.tasks.map((e: DigestEntry) => e.ageDays),
    [6, 6],
  );
  assert.deepEqual(ids(digest), ["z", "a"]);
});

test("[boundary-10] equal posting times are ordered by id", () => {
  const digest = digestOf([openTask("b", "2026-10-19T09:00:00.000Z"), openTask("a", "2026-10-19T09:00:00.000Z")]);
  assert.deepEqual(ids(digest), ["a", "b"]);
});

test("[boundary-10] equal posting times compare ids by UTF-16 code units", () => {
  const at = "2026-10-19T09:00:00.000Z";
  const digest = digestOf([openTask("b", at), openTask("a", at), openTask("B", at), openTask("a10", at), openTask("a2", at)]);
  assert.deepEqual(ids(digest), ["B", "a", "a10", "a2", "b"]);
});

test("[boundary-11] duplicate ids are both listed in input order", () => {
  const at = "2026-10-19T09:00:00.000Z";
  const digest = digestOf([openTask("X", at, [], "first"), openTask("X", at, [], "second")]);
  assert.equal(digest.subject, "Weekly digest: 2 open tasks, 0 stalled");
  assert.deepEqual(
    digest.tasks.map((e: DigestEntry) => e.title),
    ["first", "second"],
  );
});

test("[boundary-11] duplicates listed after another id keep their input order", () => {
  const at = "2026-10-19T09:00:00.000Z";
  const digest = digestOf([openTask("X", at, [], "second"), openTask("Y", at, [], "y"), openTask("X", at, [], "first")]);
  assert.equal(digest.subject, "Weekly digest: 3 open tasks, 0 stalled");
  assert.deepEqual(ids(digest), ["X", "X", "Y"]);
  assert.deepEqual(
    digest.tasks.map((e: DigestEntry) => e.title),
    ["second", "first", "y"],
  );
});

test("[happy-10] a stalled task comes before an older task that is not stalled", () => {
  const digest = digestOf([
    openTask("P", "2026-01-01T09:00:00.000Z", [sub("2026-10-25T09:00:00.000Z", 2)]),
    openTask("Q", "2026-10-01T09:00:00.000Z"),
  ]);
  assert.deepEqual(ids(digest), ["Q", "P"]);
});

test("[happy-10] a task stalled exactly at 14 days precedes an older one active a millisecond later", () => {
  const digest = digestOf([
    openTask("P", "2026-01-01T09:00:00.000Z", [sub("2026-10-12T09:00:00.001Z", 2)]),
    openTask("Q", "2026-10-12T09:00:00.000Z"),
  ]);
  assert.deepEqual(ids(digest), ["Q", "P"]);
});
