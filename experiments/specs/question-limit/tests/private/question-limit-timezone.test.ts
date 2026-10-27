import { test } from "node:test";
import assert from "node:assert/strict";
import { QuestionLimiter } from "../../src/index.js";
import type { AskResult, Clock } from "../../src/index.js";

const LIMIT_MESSAGE =
  "Daily limit of 20 questions reached for this task. It resets at 00:00 UTC.";

const NOON = "2026-03-01T12:00:00.000Z";

/** A clock fixed at `iso` that the test moves explicitly with `set`. */
function manualClock(iso: string): { clock: Clock; set: (iso: string) => void } {
  let now = new Date(iso).getTime();
  return {
    clock: () => new Date(now),
    set: (next: string) => {
      now = new Date(next).getTime();
    },
  };
}

function limiterAt(iso: string): QuestionLimiter {
  return new QuestionLimiter(manualClock(iso).clock);
}

function askTimes(limiter: QuestionLimiter, contributorId: string, taskId: string, times: number): void {
  for (let i = 0; i < times; i++) {
    const result = limiter.ask(contributorId, taskId);
    assert.equal(result.accepted, true, `setup question ${i + 1} for ${contributorId}/${taskId} should be accepted`);
  }
}

function assertAccepted(result: AskResult, remaining: number): void {
  assert.equal(result.accepted, true);
  assert.equal(result.remaining, remaining);
}

function assertRefused(result: AskResult): void {
  assert.equal(result.accepted, false);
  assert.equal(result.remaining, 0);
  if (result.accepted === false) {
    assert.equal(result.message, LIMIT_MESSAGE);
  }
}

/** Asserts `fn` throws an Error; the spec names no message, only that it fails with an error. */
function assertFailsWithError(fn: () => unknown): void {
  assert.throws(fn, (error: unknown) => error instanceof Error);
}

// The day runs in UTC whatever the process's local time zone is. Each test
// sets a fixed, non-UTC time zone and restores the previous one afterwards.
function withTimeZone(tz: string, body: () => void): void {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try {
    body();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

// Extends "midnight reset: refused at 23:59:59.999Z, accepted at 00:00:00.000Z with 19 remaining":
// a local-time day would not change at midnight UTC when the zone is behind UTC.
test("[boundary-2] the count resets at midnight UTC when the local time zone is behind UTC", () => {
  withTimeZone("America/Los_Angeles", () => {
    const time = manualClock("2026-03-01T09:00:00.000Z");
    const limiter = new QuestionLimiter(time.clock);
    askTimes(limiter, "c1", "t1", 20);
    time.set("2026-03-01T23:59:59.999Z");
    assertRefused(limiter.ask("c1", "t1"));
    time.set("2026-03-02T00:00:00.000Z");
    assertAccepted(limiter.ask("c1", "t1"), 19);
  });
});

test("[boundary-2] the count resets at midnight UTC when the local time zone is ahead of UTC", () => {
  withTimeZone("Asia/Tokyo", () => {
    // 2026-03-01T14:00Z is local 23:00 on 2026-03-01; 2026-03-01T16:00Z is local 01:00 on 2026-03-02.
    const time = manualClock("2026-03-01T14:00:00.000Z");
    const limiter = new QuestionLimiter(time.clock);
    askTimes(limiter, "c1", "t1", 20);
    time.set("2026-03-01T16:00:00.000Z");
    assertRefused(limiter.ask("c1", "t1"));
    time.set("2026-03-01T23:59:59.999Z");
    assertRefused(limiter.ask("c1", "t1"));
    time.set("2026-03-02T00:00:00.000Z");
    assertAccepted(limiter.ask("c1", "t1"), 19);
  });
});

test("[boundary-2] questions on one UTC day spanning a local midnight count as one day", () => {
  withTimeZone("Pacific/Kiritimati", () => {
    // UTC+14: 2026-03-01T09:00Z is local 23:00, 2026-03-01T11:00Z is local 01:00 the next day.
    const time = manualClock("2026-03-01T09:00:00.000Z");
    const limiter = new QuestionLimiter(time.clock);
    askTimes(limiter, "c1", "t1", 10);
    time.set("2026-03-01T11:00:00.000Z");
    askTimes(limiter, "c1", "t1", 10);
    assert.equal(limiter.remaining("c1", "t1"), 0);
    assertRefused(limiter.ask("c1", "t1"));
  });
});

// Extends "twentieth question: after 19 questions the twentieth is accepted with 0 remaining":
// the 19 earlier questions fall on one UTC day but two local days.
test("[boundary-1] the twentieth question is accepted with 0 remaining when the day spans a local midnight", () => {
  withTimeZone("America/New_York", () => {
    // UTC-5 in March before DST: 04:00Z is local 23:00 on 2026-02-28 ... 06:00Z is local 01:00 on 2026-03-01.
    const time = manualClock("2026-03-01T04:00:00.000Z");
    const limiter = new QuestionLimiter(time.clock);
    askTimes(limiter, "c1", "t1", 10);
    time.set("2026-03-01T06:00:00.000Z");
    askTimes(limiter, "c1", "t1", 9);
    assertAccepted(limiter.ask("c1", "t1"), 0);
    assertRefused(limiter.ask("c1", "t1"));
  });
});
