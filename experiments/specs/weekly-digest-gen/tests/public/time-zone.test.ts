import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest, isDigestDue } from "../../src/index.js";
import type { Task } from "../../src/index.js";

const NOW = "2026-10-26T02:00:00.000Z";

function assertRangeError(fn: () => unknown, message: string): void {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof RangeError, `expected a RangeError, got ${String(err)}`);
    assert.equal((err as RangeError).message, message);
    return true;
  });
}

function openTask(id: string, postedAt: string): Task {
  return { id, title: id, status: "open", postedAt: new Date(postedAt), submissions: [] };
}

test("[happy-1] canonical IANA time zones are accepted and report Monday", () => {
  assert.equal(isDigestDue("Asia/Singapore", new Date(NOW)), true);
  assert.equal(isDigestDue("America/New_York", new Date(NOW)), false);
  assert.equal(isDigestDue("UTC", new Date(NOW)), true);
});

test("[happy-1] lowercase names, Etc zones and legacy links are accepted", () => {
  assert.equal(isDigestDue("utc", new Date(NOW)), true);
  assert.equal(isDigestDue("asia/singapore", new Date(NOW)), true);
  assert.equal(isDigestDue("Etc/GMT-8", new Date(NOW)), true);
  assert.equal(isDigestDue("US/Eastern", new Date(NOW)), false);
});

test("[unhappy-1] isDigestDue rejects an unknown zone name", () => {
  assertRangeError(() => isDigestDue("Mars/Olympus", new Date(NOW)), 'Unknown time zone: "Mars/Olympus"');
});

test("[unhappy-1] isDigestDue rejects empty, untrimmed and UTC offset zones", () => {
  assertRangeError(() => isDigestDue("", new Date(NOW)), 'Unknown time zone: ""');
  assertRangeError(() => isDigestDue(" UTC", new Date(NOW)), 'Unknown time zone: " UTC"');
  assertRangeError(() => isDigestDue("+08:00", new Date(NOW)), 'Unknown time zone: "+08:00"');
  assertRangeError(() => isDigestDue("-05:00", new Date(NOW)), 'Unknown time zone: "-05:00"');
});

test("[unhappy-2] buildDigest rejects an unknown zone with no tasks", () => {
  assertRangeError(
    () => buildDigest({ timeZone: "Mars/Olympus", tasks: [], now: new Date("2026-10-26T09:00:00.000Z") }),
    'Unknown time zone: "Mars/Olympus"',
  );
});

test("[unhappy-2] buildDigest rejects an offset zone when only merged tasks would give null", () => {
  const merged: Task = {
    id: "M1",
    title: "Old",
    status: "merged",
    postedAt: new Date("2026-09-01T09:00:00.000Z"),
    submissions: [],
  };
  assertRangeError(
    () => buildDigest({ timeZone: "+08:00", tasks: [merged], now: new Date("2026-10-26T09:00:00.000Z") }),
    'Unknown time zone: "+08:00"',
  );
});

test("[unhappy-3] buildDigest rejects an unknown zone when a task is open", () => {
  assertRangeError(
    () =>
      buildDigest({
        timeZone: "Not/AZone",
        tasks: [openTask("T1", "2026-10-19T09:00:00.000Z")],
        now: new Date("2026-10-26T09:00:00.000Z"),
      }),
    'Unknown time zone: "Not/AZone"',
  );
});

test("[unhappy-3] the unknown zone is reported before an invalid now and invalid task dates", () => {
  assertRangeError(
    () =>
      buildDigest({
        timeZone: "Not/AZone",
        tasks: [openTask("T1", "2026-10-19T09:00:00.000Z"), openTask("T2", "invalid")],
        now: new Date("garbage"),
      }),
    'Unknown time zone: "Not/AZone"',
  );
});
