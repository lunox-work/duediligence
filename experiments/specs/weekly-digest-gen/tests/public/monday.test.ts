import { test } from "node:test";
import assert from "node:assert/strict";
import { isDigestDue } from "../../src/index.js";

function due(timeZone: string, now: string): boolean {
  return isDigestDue(timeZone, new Date(now));
}

test("[boundary-1] midday Monday in Asia/Singapore is due", () => {
  assert.equal(due("Asia/Singapore", "2026-10-26T04:00:00.000Z"), true);
});

test("[boundary-1] the first and last millisecond of Monday in Asia/Singapore", () => {
  assert.equal(due("Asia/Singapore", "2026-10-25T15:59:59.999Z"), false);
  assert.equal(due("Asia/Singapore", "2026-10-25T16:00:00.000Z"), true);
  assert.equal(due("Asia/Singapore", "2026-10-26T15:59:59.999Z"), true);
  assert.equal(due("Asia/Singapore", "2026-10-26T16:00:00.000Z"), false);
});

test("[happy-2] one instant is Monday in Singapore and UTC but Sunday in New York", () => {
  assert.equal(due("Asia/Singapore", "2026-10-26T02:00:00.000Z"), true);
  assert.equal(due("UTC", "2026-10-26T02:00:00.000Z"), true);
  assert.equal(due("America/New_York", "2026-10-26T02:00:00.000Z"), false);
});

test("[happy-2] the last millisecond of Sunday in UTC is already Monday in Singapore", () => {
  assert.equal(due("UTC", "2026-10-25T23:59:59.999Z"), false);
  assert.equal(due("Asia/Singapore", "2026-10-25T23:59:59.999Z"), true);
  assert.equal(due("America/New_York", "2026-10-25T23:59:59.999Z"), false);
});

test("[boundary-2] Monday starts at local midnight under EDT in America/New_York", () => {
  assert.equal(due("America/New_York", "2026-10-26T03:59:59.999Z"), false);
  assert.equal(due("America/New_York", "2026-10-26T04:00:00.000Z"), true);
});

test("[boundary-2] after the switch to EST Monday starts an hour later in UTC", () => {
  assert.equal(due("America/New_York", "2026-11-02T04:59:59.999Z"), false);
  assert.equal(due("America/New_York", "2026-11-02T05:00:00.000Z"), true);
});

test("[happy-3] Saturday, Tuesday and Friday noon in UTC are not due", () => {
  assert.equal(due("UTC", "2026-10-24T12:00:00.000Z"), false);
  assert.equal(due("UTC", "2026-10-27T12:00:00.000Z"), false);
  assert.equal(due("UTC", "2026-10-30T12:00:00.000Z"), false);
});

test("[happy-3] the millisecond before Monday and the first of Tuesday in UTC are not due", () => {
  assert.equal(due("UTC", "2026-10-25T23:59:59.999Z"), false);
  assert.equal(due("UTC", "2026-10-27T00:00:00.000Z"), false);
});
