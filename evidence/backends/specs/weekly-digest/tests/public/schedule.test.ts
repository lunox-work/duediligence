import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest, isDigestDue } from "../../src/index.js";

test("[happy-1] Singapore Monday is due even while UTC is Sunday", () => {
  assert.equal(isDigestDue("Asia/Singapore", new Date("2026-03-01T16:30:00Z")), true);
  assert.equal(isDigestDue("Asia/Singapore", new Date("2026-03-01T15:59:59Z")), false);
});

test("[happy-1] Singapore Monday includes midnight and ends at Tuesday midnight", () => {
  assert.equal(isDigestDue("Asia/Singapore", new Date("2026-03-01T16:00:00Z")), true);
  assert.equal(isDigestDue("Asia/Singapore", new Date("2026-03-02T15:59:59.999Z")), true);
  assert.equal(isDigestDue("Asia/Singapore", new Date("2026-03-02T16:00:00Z")), false);
});

test("[boundary-1] New York uses the local Monday after spring daylight saving starts", () => {
  assert.equal(isDigestDue("America/New_York", new Date("2026-03-09T04:30:00Z")), true);
  assert.equal(isDigestDue("America/New_York", new Date("2026-03-09T03:59:59Z")), false);
});

test("[boundary-1] New York Monday boundaries use the daylight saving offset", () => {
  assert.equal(isDigestDue("America/New_York", new Date("2026-03-09T03:59:59.999Z")), false);
  assert.equal(isDigestDue("America/New_York", new Date("2026-03-09T04:00:00Z")), true);
  assert.equal(isDigestDue("America/New_York", new Date("2026-03-10T03:59:59.999Z")), true);
  assert.equal(isDigestDue("America/New_York", new Date("2026-03-10T04:00:00Z")), false);
});

test("[unhappy-2] checking whether a digest is due rejects an unknown time zone by name", () => {
  assert.throws(
    () => isDigestDue("Mars/Olympus", new Date("2026-03-16T12:00:00Z")),
    /Mars\/Olympus/,
  );
});

test("[unhappy-2] building a digest also rejects an unknown time zone by name", () => {
  assert.throws(
    () => buildDigest({
      timeZone: "Mars/Olympus",
      now: new Date("2026-03-16T12:00:00Z"),
      tasks: [{
        id: "open-task",
        title: "An open task",
        status: "open",
        postedAt: new Date("2026-03-15T12:00:00Z"),
        submissions: [],
      }],
    }),
    /Mars\/Olympus/,
  );
});
