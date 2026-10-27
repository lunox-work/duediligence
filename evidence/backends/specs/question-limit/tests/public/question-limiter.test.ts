import { test } from "node:test";
import assert from "node:assert/strict";
import { QuestionLimiter, type AskResult } from "../../src/index.js";

const LIMIT_MESSAGE =
  "Daily limit of 20 questions reached for this task. It resets at 00:00 UTC.";

function fixedClock(): Date {
  return new Date("2026-03-01T12:00:00.000Z");
}

function assertAccepted(result: AskResult, remaining: number): void {
  assert.equal(result.accepted, true);
  assert.equal(result.remaining, remaining);
}

function assertRefused(result: AskResult): void {
  assert.equal(result.accepted, false);
  assert.equal(result.remaining, 0);
  if (!result.accepted) {
    assert.equal(result.message, LIMIT_MESSAGE);
  }
}

function askQuestions(
  limiter: QuestionLimiter,
  count: number,
  contributorId = "c1",
  taskId = "t1",
): void {
  for (let i = 0; i < count; i += 1) {
    assertAccepted(limiter.ask(contributorId, taskId), 19 - i);
  }
}

test("[happy-1] a fresh allowance is 20 and repeated reads do not consume it", () => {
  const limiter = new QuestionLimiter(fixedClock);

  assert.equal(limiter.remaining("c1", "t1"), 20);
  assert.equal(limiter.remaining("c1", "t1"), 20);
  assert.equal(limiter.remaining("c1", "t1"), 20);
  assertAccepted(limiter.ask("c1", "t1"), 19);
});

test("[happy-1] reading with one question left preserves the final question", () => {
  const limiter = new QuestionLimiter(fixedClock);
  askQuestions(limiter, 19);

  assert.equal(limiter.remaining("c1", "t1"), 1);
  assert.equal(limiter.remaining("c1", "t1"), 1);
  assertAccepted(limiter.ask("c1", "t1"), 0);
});

test("[happy-2] the first accepted question reports and stores 19 remaining", () => {
  const limiter = new QuestionLimiter(fixedClock);

  assertAccepted(limiter.ask("c1", "t1"), 19);
  assert.equal(limiter.remaining("c1", "t1"), 19);
});

test("[happy-2] accepted questions still consume exactly one at the end of a UTC day", () => {
  const limiter = new QuestionLimiter(
    () => new Date("2026-03-01T23:59:59.999Z"),
  );

  assertAccepted(limiter.ask("c1", "t1"), 19);
  assertAccepted(limiter.ask("c1", "t1"), 18);
  assert.equal(limiter.remaining("c1", "t1"), 18);
});

test("[boundary-1] the twentieth question is accepted with zero remaining", () => {
  const limiter = new QuestionLimiter(fixedClock);
  askQuestions(limiter, 19);

  assert.equal(limiter.remaining("c1", "t1"), 1);
  assertAccepted(limiter.ask("c1", "t1"), 0);
  assert.equal(limiter.remaining("c1", "t1"), 0);
});

test("[boundary-1] the twentieth question is accepted at the final millisecond of the day", () => {
  let now = "2026-03-01T12:00:00.000Z";
  const limiter = new QuestionLimiter(() => new Date(now));
  askQuestions(limiter, 19);

  now = "2026-03-01T23:59:59.999Z";
  assertAccepted(limiter.ask("c1", "t1"), 0);
  assert.equal(limiter.remaining("c1", "t1"), 0);
});

test("[unhappy-1] the twenty-first question is refused with the specified message", () => {
  const limiter = new QuestionLimiter(fixedClock);
  askQuestions(limiter, 20);

  assertRefused(limiter.ask("c1", "t1"));
  assert.equal(limiter.remaining("c1", "t1"), 0);
});

test("[unhappy-1] repeated refused questions keep the remaining count at zero", () => {
  const limiter = new QuestionLimiter(fixedClock);
  askQuestions(limiter, 20);

  for (let i = 0; i < 3; i += 1) {
    assertRefused(limiter.ask("c1", "t1"));
    assert.equal(limiter.remaining("c1", "t1"), 0);
  }
});

test("[boundary-2] an exhausted allowance resets exactly at midnight UTC", () => {
  let now = "2026-03-01T12:00:00.000Z";
  const limiter = new QuestionLimiter(() => new Date(now));
  askQuestions(limiter, 20);

  now = "2026-03-01T23:59:59.999Z";
  assertRefused(limiter.ask("c1", "t1"));
  now = "2026-03-02T00:00:00.000Z";
  assertAccepted(limiter.ask("c1", "t1"), 19);
  assert.equal(limiter.remaining("c1", "t1"), 19);
});

test("[boundary-2] a month rollover restores the full allowance when read at midnight UTC", () => {
  let now = "2026-03-31T23:59:59.999Z";
  const limiter = new QuestionLimiter(() => new Date(now));
  askQuestions(limiter, 20);
  assert.equal(limiter.remaining("c1", "t1"), 0);

  // This offset timestamp represents April 1 at exactly 00:00 UTC.
  now = "2026-04-01T08:00:00.000+08:00";
  assert.equal(limiter.remaining("c1", "t1"), 20);
  assert.equal(limiter.remaining("c1", "t1"), 20);
  assertAccepted(limiter.ask("c1", "t1"), 19);
});

test("[happy-3] exhausting one pair leaves other tasks and contributors their full allowance", () => {
  const limiter = new QuestionLimiter(fixedClock);
  askQuestions(limiter, 20);

  assert.equal(limiter.remaining("c1", "t2"), 20);
  assert.equal(limiter.remaining("c2", "t1"), 20);
  assertAccepted(limiter.ask("c1", "t2"), 19);
  assertAccepted(limiter.ask("c2", "t1"), 19);
  assert.equal(limiter.remaining("c1", "t1"), 0);
  assert.equal(limiter.remaining("c1", "t2"), 19);
  assert.equal(limiter.remaining("c2", "t1"), 19);
});

test("[happy-3] distinct ID pairs with overlapping text have separate allowances", () => {
  const limiter = new QuestionLimiter(fixedClock);
  // These pairs collide if IDs are joined without a separator or with a colon.
  askQuestions(limiter, 20, "c1:t2", "t3");
  assert.equal(limiter.remaining("c1", "t2:t3"), 20);
  assertAccepted(limiter.ask("c1", "t2:t3"), 19);

  askQuestions(limiter, 20, "c1", "t23");
  assert.equal(limiter.remaining("c1t", "23"), 20);
  assertAccepted(limiter.ask("c1t", "23"), 19);
  assert.equal(limiter.remaining("c1:t2", "t3"), 0);
  assert.equal(limiter.remaining("c1", "t23"), 0);
});

test("[unhappy-2] either empty ID throws without using a fresh allowance", () => {
  const limiter = new QuestionLimiter(fixedClock);

  assert.throws(() => limiter.ask("", "t1"));
  assert.equal(limiter.remaining("c1", "t1"), 20);
  assert.throws(() => limiter.ask("c1", ""));
  assert.equal(limiter.remaining("c1", "t1"), 20);
  assertAccepted(limiter.ask("c1", "t1"), 19);
});

test("[unhappy-2] empty IDs including both empty preserve the last available question", () => {
  const limiter = new QuestionLimiter(fixedClock);
  askQuestions(limiter, 19);

  assert.throws(() => limiter.ask("", "t1"));
  assert.equal(limiter.remaining("c1", "t1"), 1);
  assert.throws(() => limiter.ask("c1", ""));
  assert.equal(limiter.remaining("c1", "t1"), 1);
  assert.throws(() => limiter.ask("", ""));
  assert.equal(limiter.remaining("c1", "t1"), 1);
  assertAccepted(limiter.ask("c1", "t1"), 0);
});
