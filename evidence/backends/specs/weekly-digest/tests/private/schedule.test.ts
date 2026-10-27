import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest, isDigestDue } from "../../src/index.js";

const DAY = 86_400_000;

function mondayWindow(zone: string, midnight: string): void {
  const start = Date.parse(midnight);
  for (const [offset, expected] of [
    [-1, false], [0, true], [1, true], [12 * 3_600_000, true],
    [DAY - 1, true], [DAY, false], [DAY + 1, false],
  ] as const) {
    assert.equal(isDigestDue(zone, new Date(start + offset)), expected,
      `${zone} at ${new Date(start + offset).toISOString()}`);
  }
}

// Extends public "Singapore Monday is due even while UTC is Sunday" and
// "Singapore Monday includes midnight and ends at Tuesday midnight".
test("[happy-1] Singapore repeats the Monday rule throughout a later full week", () => {
  mondayWindow("Asia/Singapore", "2026-07-05T16:00:00Z");
  const monday = Date.parse("2026-07-05T16:00:00Z");
  for (let day = 0; day < 7; day++) {
    for (const hour of [0, 6, 12, 23]) {
      assert.equal(isDigestDue("Asia/Singapore", new Date(monday + day * DAY + hour * 3_600_000)),
        day === 0, `local day ${day}, hour ${hour}`);
    }
  }
});

// Extends public "Singapore Monday includes midnight and ends at Tuesday midnight".
test("[happy-1] a quarter-hour offset places Monday boundaries at the correct minute", () => {
  mondayWindow("Asia/Kathmandu", "2026-03-15T18:15:00Z");
});

// Extends public "Singapore Monday is due even while UTC is Sunday".
test("[happy-1] opposite sides of the date line use their own local Monday", () => {
  mondayWindow("Pacific/Kiritimati", "2026-03-15T10:00:00Z");
  mondayWindow("Pacific/Pago_Pago", "2026-03-16T11:00:00Z");
});

// Extends public "Singapore Monday includes midnight and ends at Tuesday midnight".
test("[happy-1] Monday evening in a western zone remains due on UTC Tuesday", () => {
  mondayWindow("America/Los_Angeles", "2026-07-06T07:00:00Z");
  assert.equal(isDigestDue("America/Los_Angeles", new Date("2026-07-07T06:30:00Z")), true);
});

// Extends public "Singapore Monday is due even while UTC is Sunday".
test("[happy-1] Monday calculation works across year boundaries and leap years", () => {
  mondayWindow("UTC", "2025-12-29T00:00:00Z");
  mondayWindow("UTC", "2026-01-05T00:00:00Z");
  mondayWindow("Asia/Singapore", "2024-12-29T16:00:00Z");
  mondayWindow("UTC", "2028-02-28T00:00:00Z");
});

// Extends public "New York uses the local Monday after spring daylight saving starts"
// and "New York Monday boundaries use the daylight saving offset".
test("[boundary-1] New York Monday after fall rollback uses standard time", () => {
  mondayWindow("America/New_York", "2026-11-02T05:00:00Z");
  assert.equal(isDigestDue("America/New_York", new Date("2026-11-02T04:30:00Z")), false);
});

// Extends public "New York Monday boundaries use the daylight saving offset".
test("[boundary-1] the same zone switches offsets between consecutive Mondays in another year", () => {
  mondayWindow("America/New_York", "2027-03-08T05:00:00Z");
  mondayWindow("America/New_York", "2027-03-15T04:00:00Z");
});

// Extends public "New York uses the local Monday after spring daylight saving starts".
test("[boundary-1] European clock changes follow European transition dates", () => {
  mondayWindow("Europe/London", "2026-03-29T23:00:00Z");
  mondayWindow("Europe/London", "2026-10-26T00:00:00Z");
});

// Extends public "New York Monday boundaries use the daylight saving offset".
test("[boundary-1] southern hemisphere daylight saving reverses the seasonal offsets", () => {
  mondayWindow("Australia/Sydney", "2026-04-05T14:00:00Z");
  mondayWindow("Australia/Sydney", "2026-10-04T13:00:00Z");
});

const UNKNOWN_ZONES = ["Atlantis/Harbor", "Pacific/No_Such_Island", "Mars/Olympus_Mons"];

function namesZone(zone: string): (error: unknown) => boolean {
  return (error: unknown): boolean => String(error).includes(zone);
}

// Extends public "checking whether a digest is due rejects an unknown time zone by name".
test("[unhappy-2] due checks reject several unknown zones and name the exact rejected zone", () => {
  for (const zone of UNKNOWN_ZONES) {
    assert.throws(() => isDigestDue(zone, new Date("2026-07-06T12:00:00Z")), namesZone(zone));
  }
});

// Extends public "building a digest also rejects an unknown time zone by name".
test("[unhappy-2] digest construction rejects unknown zones with multiple open tasks", () => {
  for (const zone of UNKNOWN_ZONES) {
    assert.throws(() => buildDigest({
      timeZone: zone,
      now: new Date("2026-07-06T12:00:00Z"),
      tasks: ["first", "second"].map((id) => ({
        id, title: id, status: "open" as const,
        postedAt: new Date("2026-06-01T00:00:00Z"), submissions: [],
      })),
    }), namesZone(zone));
  }
});

// Extends public "building a digest also rejects an unknown time zone by name".
test("[unhappy-2] unknown zones are refused even when there are no open tasks", () => {
  for (const zone of UNKNOWN_ZONES) {
    for (const tasks of [[], [{
      id: "closed", title: "Closed", status: "merged" as const,
      postedAt: new Date("2026-01-01T00:00:00Z"), submissions: [],
    }]]) {
      assert.throws(() => buildDigest({
        timeZone: zone, now: new Date("2026-07-06T12:00:00Z"), tasks,
      }), namesZone(zone));
    }
  }
});
