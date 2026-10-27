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
    assert.equal(result.accepted, true, `setup question ${i + 1} should be accepted`);
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

// Scenario: A contributor with no questions today has the full allowance

test("full allowance: a contributor with no questions today has 20 remaining", () => {
  const limiter = limiterAt(NOON);
  assert.equal(limiter.remaining("c1", "t1"), 20);
  assert.equal(limiter.remaining("c1", "t1"), 20);
  assertAccepted(limiter.ask("c1", "t1"), 19);
});

test("full allowance: reading the remaining count more than 20 times uses no questions", () => {
  const limiter = limiterAt(NOON);
  for (let i = 0; i < 25; i++) {
    assert.equal(limiter.remaining("c1", "t1"), 20);
  }
  askTimes(limiter, "c1", "t1", 19);
  assertAccepted(limiter.ask("c1", "t1"), 0);
});

// Scenario: An accepted question uses one from the allowance

test("accepted question: the first question is accepted and 19 remain", () => {
  const limiter = limiterAt(NOON);
  assertAccepted(limiter.ask("c1", "t1"), 19);
  assert.equal(limiter.remaining("c1", "t1"), 19);
});

test("accepted question: the first question at exactly 00:00:00.000 UTC is accepted and 19 remain", () => {
  const limiter = limiterAt("2026-03-01T00:00:00.000Z");
  assertAccepted(limiter.ask("c1", "t1"), 19);
  assert.equal(limiter.remaining("c1", "t1"), 19);
});

// Scenario: The twentieth question is still accepted

test("twentieth question: after 19 questions the twentieth is accepted with 0 remaining", () => {
  const limiter = limiterAt(NOON);
  askTimes(limiter, "c1", "t1", 19);
  assertAccepted(limiter.ask("c1", "t1"), 0);
});

test("twentieth question: remaining reads 1 before the twentieth question and 0 after it", () => {
  const limiter = limiterAt(NOON);
  askTimes(limiter, "c1", "t1", 19);
  assert.equal(limiter.remaining("c1", "t1"), 1);
  assertAccepted(limiter.ask("c1", "t1"), 0);
  assert.equal(limiter.remaining("c1", "t1"), 0);
});

// Scenario: The twenty-first question is refused with a clear message

test("twenty-first question: it is refused with 0 remaining and the limit message", () => {
  const limiter = limiterAt(NOON);
  askTimes(limiter, "c1", "t1", 20);
  assertRefused(limiter.ask("c1", "t1"));
});

test("twenty-first question: further questions stay refused and remaining stays at 0", () => {
  const limiter = limiterAt(NOON);
  askTimes(limiter, "c1", "t1", 20);
  for (let i = 0; i < 5; i++) {
    assertRefused(limiter.ask("c1", "t1"));
    assert.equal(limiter.remaining("c1", "t1"), 0);
  }
});

// Scenario: The count resets at midnight UTC

test("midnight reset: refused at 23:59:59.999Z, accepted at 00:00:00.000Z with 19 remaining", () => {
  const time = manualClock("2026-03-01T09:00:00.000Z");
  const limiter = new QuestionLimiter(time.clock);
  askTimes(limiter, "c1", "t1", 20);
  time.set("2026-03-01T23:59:59.999Z");
  assertRefused(limiter.ask("c1", "t1"));
  time.set("2026-03-02T00:00:00.000Z");
  assertAccepted(limiter.ask("c1", "t1"), 19);
});

test("midnight reset: questions from 00:00:00.000Z to 23:59:59.999Z count as one day, the next starts full", () => {
  const time = manualClock("2026-03-01T00:00:00.000Z");
  const limiter = new QuestionLimiter(time.clock);
  askTimes(limiter, "c1", "t1", 10);
  time.set("2026-03-01T23:59:59.999Z");
  askTimes(limiter, "c1", "t1", 10);
  assert.equal(limiter.remaining("c1", "t1"), 0);
  assertRefused(limiter.ask("c1", "t1"));
  time.set("2026-03-02T00:00:00.000Z");
  assert.equal(limiter.remaining("c1", "t1"), 20);
});

// Scenario: Allowances are separate per task and per contributor

test("separate allowances: an exhausted contributor can still ask about another task, and others can ask about the task", () => {
  const limiter = limiterAt(NOON);
  askTimes(limiter, "c1", "t1", 20);
  assertAccepted(limiter.ask("c1", "t2"), 19);
  assertAccepted(limiter.ask("c2", "t1"), 19);
  assertRefused(limiter.ask("c1", "t1"));
});

test("separate allowances: pairs whose ids would collide if naively joined stay separate", () => {
  const limiter = limiterAt(NOON);
  askTimes(limiter, "c1", "t1", 20);
  askTimes(limiter, "a:b", "c", 20);
  assert.equal(limiter.remaining("c1t", "1"), 20);
  assert.equal(limiter.remaining("c", "1t1"), 20);
  assert.equal(limiter.remaining("t1", "c1"), 20);
  assert.equal(limiter.remaining("a", "b:c"), 20);
  assertAccepted(limiter.ask("a", "b:c"), 19);
});

// Scenario: A question with no contributor or no task is rejected

test("empty ids: asking with an empty contributor id or an empty task id throws", () => {
  const limiter = limiterAt(NOON);
  assert.throws(() => limiter.ask("", "t1"));
  assert.throws(() => limiter.ask("c1", ""));
  assert.throws(() => limiter.ask("", ""));
  assert.equal(limiter.remaining("c1", "t1"), 20);
});

test("empty ids: rejected questions use no allowance even when only one question is left", () => {
  const limiter = limiterAt(NOON);
  askTimes(limiter, "c1", "t1", 19);
  for (let i = 0; i < 25; i++) {
    assert.throws(() => limiter.ask("c1", ""));
    assert.throws(() => limiter.ask("", "t1"));
  }
  assert.equal(limiter.remaining("c1", "t1"), 1);
  assertAccepted(limiter.ask("c1", "t1"), 0);
});
