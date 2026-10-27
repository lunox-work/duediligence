import { test } from "node:test";
import assert from "node:assert/strict";
import { QuestionLimiter } from "../../src/index.js";
import type { AskResult, Clock } from "../../src/index.js";

const LIMIT_MESSAGE =
  "Daily limit of 20 questions reached for this task. It resets at 00:00 UTC.";

function fixedClock(iso: string): Clock {
  const ms = Date.parse(iso);
  return () => new Date(ms);
}

function refusalMessage(result: AskResult): string {
  if (result.accepted) throw new Error("expected the question to be refused");
  return result.message;
}

function askTimes(limiter: QuestionLimiter, contributorId: string, taskId: string, times: number): void {
  for (let i = 0; i < times; i++) {
    const result = limiter.ask(contributorId, taskId);
    assert.equal(result.accepted, true, `question ${i + 1} should be accepted`);
  }
}

test("a contributor with nothing asked today reads the full allowance of 20", () => {
  const limiter = new QuestionLimiter(fixedClock("2026-03-01T12:00:00.000Z"));
  assert.equal(limiter.remaining("c1", "t1"), 20);
});

test("reading the remaining count twice does not use a question", () => {
  const limiter = new QuestionLimiter(fixedClock("2026-03-01T12:00:00.000Z"));
  assert.equal(limiter.remaining("c1", "t1"), 20);
  assert.equal(limiter.remaining("c1", "t1"), 20);
  const result = limiter.ask("c1", "t1");
  assert.equal(result.accepted, true);
  assert.equal(result.remaining, 19);
});

test("full allowance is reported for other contributors, tasks and dates", () => {
  const limiter = new QuestionLimiter(fixedClock("2031-07-14T05:43:21.007Z"));
  assert.equal(limiter.remaining("alice", "task-42"), 20);
  assert.equal(limiter.remaining("bob", "repo/zeta"), 20);
  assert.equal(limiter.remaining("contributor-with-a-long-identifier-0001", "T"), 20);
});

test("many reads of the remaining count leave all 20 questions available", () => {
  const limiter = new QuestionLimiter(fixedClock("2027-11-05T08:15:00.000Z"));
  for (let i = 0; i < 35; i++) {
    assert.equal(limiter.remaining("reader", "doc-7"), 20);
  }
  for (let i = 1; i <= 20; i++) {
    const result = limiter.ask("reader", "doc-7");
    assert.equal(result.accepted, true, `question ${i} should be accepted`);
    assert.equal(result.remaining, 20 - i);
  }
});

test("the first accepted question leaves 19", () => {
  const limiter = new QuestionLimiter(fixedClock("2026-03-01T12:00:00.000Z"));
  const result = limiter.ask("c1", "t1");
  assert.equal(result.accepted, true);
  assert.equal(result.remaining, 19);
});

test("the first question for other ids is accepted and the read count drops to 19", () => {
  const limiter = new QuestionLimiter(fixedClock("2029-01-09T17:30:00.000Z"));
  const result = limiter.ask("zoe", "billing-service");
  assert.equal(result.accepted, true);
  assert.equal(result.remaining, 19);
  assert.equal(limiter.remaining("zoe", "billing-service"), 19);
});

test("each accepted question uses exactly one from the allowance", () => {
  const limiter = new QuestionLimiter(fixedClock("2026-09-30T03:00:00.000Z"));
  for (let k = 1; k <= 20; k++) {
    const result = limiter.ask("mira", "kernel");
    assert.equal(result.accepted, true, `question ${k} should be accepted`);
    assert.equal(result.remaining, 20 - k);
    assert.equal(limiter.remaining("mira", "kernel"), 20 - k);
  }
});

test("after seven questions the remaining count is 13", () => {
  const limiter = new QuestionLimiter(fixedClock("2028-04-04T22:22:22.222Z"));
  askTimes(limiter, "omar", "parser", 7);
  assert.equal(limiter.remaining("omar", "parser"), 13);
  const result = limiter.ask("omar", "parser");
  assert.equal(result.accepted, true);
  assert.equal(result.remaining, 12);
});

test("the twentieth question is accepted and leaves 0", () => {
  const limiter = new QuestionLimiter(fixedClock("2026-03-01T12:00:00.000Z"));
  askTimes(limiter, "c1", "t1", 19);
  const result = limiter.ask("c1", "t1");
  assert.equal(result.accepted, true);
  assert.equal(result.remaining, 0);
});

test("the twentieth question for other ids is accepted and the read count is then 0", () => {
  const limiter = new QuestionLimiter(fixedClock("2030-12-25T10:00:00.000Z"));
  askTimes(limiter, "lee", "auth", 18);
  assert.equal(limiter.remaining("lee", "auth"), 2);
  const nineteenth = limiter.ask("lee", "auth");
  assert.equal(nineteenth.accepted, true);
  assert.equal(nineteenth.remaining, 1);
  const twentieth = limiter.ask("lee", "auth");
  assert.equal(twentieth.accepted, true);
  assert.equal(twentieth.remaining, 0);
  assert.equal(limiter.remaining("lee", "auth"), 0);
});

test("the twenty-first question is refused with the limit message and 0 remaining", () => {
  const limiter = new QuestionLimiter(fixedClock("2026-03-01T12:00:00.000Z"));
  askTimes(limiter, "c1", "t1", 20);
  const result = limiter.ask("c1", "t1");
  assert.equal(result.accepted, false);
  assert.equal(result.remaining, 0);
  assert.equal(refusalMessage(result), LIMIT_MESSAGE);
});

test("every question past the limit is refused with the same message", () => {
  const limiter = new QuestionLimiter(fixedClock("2027-02-14T14:14:14.000Z"));
  askTimes(limiter, "pat", "infra", 20);
  for (let i = 21; i <= 30; i++) {
    const result = limiter.ask("pat", "infra");
    assert.equal(result.accepted, false, `question ${i} should be refused`);
    assert.equal(result.remaining, 0);
    assert.equal(refusalMessage(result), LIMIT_MESSAGE);
    assert.equal(limiter.remaining("pat", "infra"), 0);
  }
});

test("allowances are separate per task and per contributor", () => {
  const limiter = new QuestionLimiter(fixedClock("2026-03-01T12:00:00.000Z"));
  askTimes(limiter, "c1", "t1", 20);
  const otherTask = limiter.ask("c1", "t2");
  assert.equal(otherTask.accepted, true);
  const otherContributor = limiter.ask("c2", "t1");
  assert.equal(otherContributor.accepted, true);
});

test("exhausting one pair leaves every other pair with its own full allowance", () => {
  const limiter = new QuestionLimiter(fixedClock("2028-08-08T08:08:08.008Z"));
  askTimes(limiter, "bob", "x", 20);
  assert.equal(limiter.ask("bob", "x").accepted, false);

  const bobOnY = limiter.ask("bob", "y");
  assert.equal(bobOnY.accepted, true);
  assert.equal(bobOnY.remaining, 19);

  const carolOnX = limiter.ask("carol", "x");
  assert.equal(carolOnX.accepted, true);
  assert.equal(carolOnX.remaining, 19);

  assert.equal(limiter.remaining("carol", "y"), 20);
  assert.equal(limiter.remaining("bob", "x"), 0);
  const bobOnXAgain = limiter.ask("bob", "x");
  assert.equal(bobOnXAgain.accepted, false);
});

test("interleaved questions are counted for each pair independently", () => {
  const limiter = new QuestionLimiter(fixedClock("2029-05-20T16:00:00.000Z"));
  for (let i = 0; i < 5; i++) {
    limiter.ask("eve", "alpha");
    limiter.ask("eve", "beta");
    limiter.ask("finn", "alpha");
  }
  askTimes(limiter, "eve", "alpha", 3);
  assert.equal(limiter.remaining("eve", "alpha"), 12);
  assert.equal(limiter.remaining("eve", "beta"), 15);
  assert.equal(limiter.remaining("finn", "alpha"), 15);
  assert.equal(limiter.remaining("finn", "beta"), 20);
});

test("pairs whose ids would collide when joined are still separate", () => {
  const limiter = new QuestionLimiter(fixedClock("2026-10-10T10:10:10.000Z"));
  askTimes(limiter, "a:b", "c", 20);
  assert.equal(limiter.remaining("a", "b:c"), 20);
  assert.equal(limiter.ask("a", "b:c").accepted, true);
  askTimes(limiter, "ab", "c", 20);
  assert.equal(limiter.remaining("a", "bc"), 20);
  assert.equal(limiter.ask("a", "bc").accepted, true);
});

test("swapping contributor and task ids gives a different allowance", () => {
  const limiter = new QuestionLimiter(fixedClock("2027-03-03T03:03:03.000Z"));
  askTimes(limiter, "p", "q", 20);
  assert.equal(limiter.remaining("q", "p"), 20);
  const swapped = limiter.ask("q", "p");
  assert.equal(swapped.accepted, true);
  assert.equal(swapped.remaining, 19);
  assert.equal(limiter.ask("p", "q").accepted, false);
});
