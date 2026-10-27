import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest } from "../../src/index.js";

function ageDays(timeZone: string, postedAt: string, now: string): number {
  const digest = buildDigest({
    timeZone,
    tasks: [{ id: "T1", title: "T1", status: "open", postedAt: new Date(postedAt), submissions: [] }],
    now: new Date(now),
  });
  assert.ok(digest !== null, "expected a digest, got null");
  assert.equal(digest!.tasks.length, 1);
  return digest!.tasks[0].ageDays;
}

const NOW = "2026-10-26T09:00:00.000Z";

test("[boundary-6] age counts whole days posted exactly 0, 1 and 14 days ago", () => {
  assert.equal(ageDays("UTC", "2026-10-26T09:00:00.000Z", NOW), 0);
  assert.equal(ageDays("UTC", "2026-10-25T09:00:00.000Z", NOW), 1);
  assert.equal(ageDays("UTC", "2026-10-12T09:00:00.000Z", NOW), 14);
});

test("[boundary-6] age rounds down a millisecond short and is 0 when posted after now", () => {
  assert.equal(ageDays("UTC", "2026-10-25T09:00:00.001Z", NOW), 0);
  assert.equal(ageDays("UTC", "2026-10-12T09:00:00.001Z", NOW), 13);
  assert.equal(ageDays("UTC", "2026-10-26T09:00:00.001Z", NOW), 0);
  assert.equal(ageDays("UTC", "2026-11-30T09:00:00.000Z", NOW), 0);
});

test("[boundary-7] age across the New York DST change is 2 for 48 hours", () => {
  assert.equal(ageDays("America/New_York", "2026-10-31T12:00:00.000Z", "2026-11-02T12:00:00.000Z"), 2);
});

test("[boundary-7] age across the New York DST change uses elapsed time, not wall-clock time", () => {
  assert.equal(ageDays("America/New_York", "2026-10-31T11:30:00.000Z", "2026-11-02T12:00:00.000Z"), 2);
  assert.equal(ageDays("America/New_York", "2026-10-31T12:00:00.001Z", "2026-11-02T12:00:00.000Z"), 1);
});
