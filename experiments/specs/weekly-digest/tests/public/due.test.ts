import { test } from "node:test";
import assert from "node:assert/strict";
import { isDigestDue } from "../../src/index.js";

test("[happy-1] the digest is due at Monday 00:30 in Singapore", () => {
  assert.equal(isDigestDue("Asia/Singapore", new Date("2026-03-01T16:30:00Z")), true);
});

test("[happy-1] the digest is not due at Sunday 23:59:59 in Singapore", () => {
  assert.equal(isDigestDue("Asia/Singapore", new Date("2026-03-01T15:59:59Z")), false);
});

test("[happy-1] the digest is due from Monday 00:00:00 in Singapore", () => {
  assert.equal(isDigestDue("Asia/Singapore", new Date("2026-03-01T16:00:00Z")), true);
});

test("[boundary-1] the digest is due at Monday 00:30 in New York after clocks went forward", () => {
  assert.equal(isDigestDue("America/New_York", new Date("2026-03-09T04:30:00Z")), true);
});

test("[boundary-1] the digest is not due at Sunday 23:59:59 in New York after clocks went forward", () => {
  assert.equal(isDigestDue("America/New_York", new Date("2026-03-09T03:59:59Z")), false);
});

test("[boundary-1] the digest is due from Monday 00:00:00 in New York after clocks went forward", () => {
  assert.equal(isDigestDue("America/New_York", new Date("2026-03-09T04:00:00Z")), true);
});

test("[unhappy-2] isDigestDue refuses an unknown time zone with an error naming it", () => {
  assert.throws(
    () => isDigestDue("Mars/Olympus", new Date("2026-03-01T16:30:00Z")),
    (err: unknown) => err instanceof Error && err.message.includes("Mars/Olympus"),
  );
});
