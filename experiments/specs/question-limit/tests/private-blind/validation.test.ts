import { test } from "node:test";
import assert from "node:assert/strict";
import { QuestionLimiter } from "../../src/index.js";
import type { Clock } from "../../src/index.js";

function fixedClock(iso: string): Clock {
  const ms = Date.parse(iso);
  return () => new Date(ms);
}

/** The call fails with an error of its own, not the stub's placeholder. */
function isRejection(err: unknown): boolean {
  return err instanceof Error && !/not implemented/i.test(err.message);
}

test("a question with an empty contributor id fails and uses no allowance", () => {
  const limiter = new QuestionLimiter(fixedClock("2026-03-01T12:00:00.000Z"));
  assert.throws(() => limiter.ask("", "t1"), isRejection);
  assert.equal(limiter.remaining("c1", "t1"), 20);
  const result = limiter.ask("c1", "t1");
  assert.equal(result.accepted, true);
  assert.equal(result.remaining, 19);
});

test("a question with an empty task id fails and uses no allowance", () => {
  const limiter = new QuestionLimiter(fixedClock("2026-03-01T12:00:00.000Z"));
  assert.throws(() => limiter.ask("c1", ""), isRejection);
  assert.equal(limiter.remaining("c1", "t1"), 20);
  const result = limiter.ask("c1", "t1");
  assert.equal(result.accepted, true);
  assert.equal(result.remaining, 19);
});

test("a question with both ids empty fails", () => {
  const limiter = new QuestionLimiter(fixedClock("2027-07-07T07:07:07.000Z"));
  assert.throws(() => limiter.ask("", ""), isRejection);
});

test("failed questions do not use a partly spent allowance", () => {
  const limiter = new QuestionLimiter(fixedClock("2028-10-31T19:00:00.000Z"));
  for (let i = 0; i < 19; i++) {
    assert.equal(limiter.ask("dana", "q9").accepted, true);
  }
  for (let i = 0; i < 4; i++) {
    assert.throws(() => limiter.ask("dana", ""), isRejection);
    assert.throws(() => limiter.ask("", "q9"), isRejection);
  }
  assert.equal(limiter.remaining("dana", "q9"), 1);
  const last = limiter.ask("dana", "q9");
  assert.equal(last.accepted, true);
  assert.equal(last.remaining, 0);
});

test("an empty id fails every time, however often it is tried", () => {
  const limiter = new QuestionLimiter(fixedClock("2029-12-01T01:00:00.000Z"));
  for (let i = 0; i < 25; i++) {
    assert.throws(() => limiter.ask("", "report"), isRejection);
    assert.throws(() => limiter.ask("henry", ""), isRejection);
  }
  assert.equal(limiter.remaining("henry", "report"), 20);
});

test("an empty id fails even when the contributor has used up a task's allowance", () => {
  const limiter = new QuestionLimiter(fixedClock("2026-02-02T02:02:02.000Z"));
  for (let i = 0; i < 20; i++) {
    assert.equal(limiter.ask("gus", "core").accepted, true);
  }
  assert.throws(() => limiter.ask("gus", ""), isRejection);
  assert.throws(() => limiter.ask("", "core"), isRejection);
  assert.equal(limiter.remaining("gus", "core"), 0);
  assert.equal(limiter.remaining("gus", "other"), 20);
});
