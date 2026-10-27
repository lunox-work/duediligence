import { test } from "node:test";
import assert from "node:assert/strict";
import { isDigestDue } from "../../src/index.js";

function due(timeZone: string, iso: string): boolean {
  return isDigestDue(timeZone, new Date(iso));
}

// Extends "[happy-1] the digest is due at Monday 00:30 in Singapore": the whole of Monday, up to its last second.
test("[happy-1] the digest is still due at Monday 23:59:59 in Singapore", () => {
  assert.equal(due("Asia/Singapore", "2026-03-02T15:59:59Z"), true);
});

// Extends "[happy-1] the digest is not due at Sunday 23:59:59 in Singapore": Monday ends at local midnight.
test("[happy-1] the digest is not due from Tuesday 00:00:00 in Singapore", () => {
  assert.equal(due("Asia/Singapore", "2026-03-02T16:00:00Z"), false);
});

// Extends "[happy-1] the digest is not due at Sunday 23:59:59 in Singapore": the last millisecond of Sunday.
test("[happy-1] the digest is not due at Sunday 23:59:59.999 in Singapore", () => {
  assert.equal(due("Asia/Singapore", "2026-03-01T15:59:59.999Z"), false);
});

// Extends "[happy-1] the digest is due at Monday 00:30 in Singapore": a UTC-day shortcut gets this wrong.
test("[happy-1] the digest is due at Monday 18:00 in Singapore, also Monday in UTC", () => {
  assert.equal(due("Asia/Singapore", "2026-03-02T10:00:00Z"), true);
});

test("[happy-1] the digest is not due at Tuesday 01:00 in Singapore although it is still Monday in UTC", () => {
  assert.equal(due("Asia/Singapore", "2026-03-02T17:00:00Z"), false);
});

test("[happy-1] the digest is not due on Sunday in New York although it is already Monday in UTC", () => {
  assert.equal(due("America/New_York", "2026-03-09T02:00:00Z"), false);
});

test("[happy-1] the digest is due on Monday 22:00 in New York although it is already Tuesday in UTC", () => {
  assert.equal(due("America/New_York", "2026-03-10T02:00:00Z"), true);
});

// Extends "[happy-1] the digest is due from Monday 00:00:00 in Singapore": another week.
test("[happy-1] the digest is due on another Monday in Singapore, 26 October", () => {
  assert.equal(due("Asia/Singapore", "2026-10-25T16:00:00Z"), true);
  assert.equal(due("Asia/Singapore", "2026-10-26T15:59:59Z"), true);
});

test("[happy-1] the digest is not due on Tuesday to Sunday at noon in Singapore", () => {
  for (const iso of [
    "2026-03-03T04:00:00Z",
    "2026-03-04T04:00:00Z",
    "2026-03-05T04:00:00Z",
    "2026-03-06T04:00:00Z",
    "2026-03-07T04:00:00Z",
    "2026-03-08T04:00:00Z",
  ]) {
    assert.equal(due("Asia/Singapore", iso), false, iso);
  }
});

// Extends "[happy-1] the digest is due from Monday 00:00:00 in Singapore": time zones with other offsets.
test("[happy-1] the digest is due from Monday 00:00 in Kolkata, a half-hour offset", () => {
  assert.equal(due("Asia/Kolkata", "2026-03-01T18:29:59Z"), false);
  assert.equal(due("Asia/Kolkata", "2026-03-01T18:30:00Z"), true);
});

test("[happy-1] the digest is due from Monday 00:00 in Kathmandu, a quarter-hour offset", () => {
  assert.equal(due("Asia/Kathmandu", "2026-03-01T18:14:59Z"), false);
  assert.equal(due("Asia/Kathmandu", "2026-03-01T18:15:00Z"), true);
});

test("[happy-1] the digest is due from Monday 00:00 in Kiritimati, fourteen hours ahead of UTC", () => {
  assert.equal(due("Pacific/Kiritimati", "2026-03-01T09:59:59Z"), false);
  assert.equal(due("Pacific/Kiritimati", "2026-03-01T10:00:00Z"), true);
});

test("[happy-1] the digest is due throughout Monday in Pago Pago, eleven hours behind UTC", () => {
  assert.equal(due("Pacific/Pago_Pago", "2026-03-02T10:59:59Z"), false);
  assert.equal(due("Pacific/Pago_Pago", "2026-03-02T11:00:00Z"), true);
  assert.equal(due("Pacific/Pago_Pago", "2026-03-03T10:59:59Z"), true);
  assert.equal(due("Pacific/Pago_Pago", "2026-03-03T11:00:00Z"), false);
});

test("[happy-1] the digest is due throughout Monday in Los Angeles", () => {
  assert.equal(due("America/Los_Angeles", "2026-03-02T08:00:00Z"), true);
  assert.equal(due("America/Los_Angeles", "2026-03-03T07:59:59Z"), true);
});

// Extends "[boundary-1] the digest is due from Monday 00:00:00 in New York after clocks went forward":
// the end of that Monday, still on daylight time.
test("[boundary-1] the digest is due at Monday 23:59:59 in New York after clocks went forward", () => {
  assert.equal(due("America/New_York", "2026-03-10T03:59:59Z"), true);
});

test("[boundary-1] the digest is not due from Tuesday 00:00:00 in New York after clocks went forward", () => {
  assert.equal(due("America/New_York", "2026-03-10T04:00:00Z"), false);
});

// Extends "[boundary-1] the digest is not due at Sunday 23:59:59 in New York after clocks went forward":
// in winter the offset is five hours, so a fixed four-hour offset gets this wrong.
test("[boundary-1] the digest is not due at Sunday 23:59:59 in New York in winter", () => {
  assert.equal(due("America/New_York", "2026-01-05T04:59:59Z"), false);
});

test("[boundary-1] the digest is due from Monday 00:00:00 in New York in winter", () => {
  assert.equal(due("America/New_York", "2026-01-05T05:00:00Z"), true);
});

test("[boundary-1] the digest is due at Monday 23:59:59 in New York in winter and not at Tuesday 00:00:00", () => {
  assert.equal(due("America/New_York", "2026-01-06T04:59:59Z"), true);
  assert.equal(due("America/New_York", "2026-01-06T05:00:00Z"), false);
});

test("[boundary-1] the digest is not due on Sunday in New York after clocks went back on Sunday 1 November", () => {
  assert.equal(due("America/New_York", "2026-11-02T04:00:00Z"), false);
  assert.equal(due("America/New_York", "2026-11-02T04:59:59Z"), false);
});

test("[boundary-1] the digest is due from Monday 00:00:00 in New York after clocks went back", () => {
  assert.equal(due("America/New_York", "2026-11-02T05:00:00Z"), true);
});

test("[boundary-1] the digest follows Monday in London after clocks went forward on Sunday 29 March", () => {
  assert.equal(due("Europe/London", "2026-03-29T22:59:59Z"), false);
  assert.equal(due("Europe/London", "2026-03-29T23:00:00Z"), true);
  assert.equal(due("Europe/London", "2026-03-30T22:59:59Z"), true);
  assert.equal(due("Europe/London", "2026-03-30T23:00:00Z"), false);
});

test("[boundary-1] the digest follows Monday in Sydney after clocks went back on Sunday 5 April", () => {
  assert.equal(due("Australia/Sydney", "2026-04-05T13:00:00Z"), false);
  assert.equal(due("Australia/Sydney", "2026-04-05T13:59:59Z"), false);
  assert.equal(due("Australia/Sydney", "2026-04-05T14:00:00Z"), true);
});
