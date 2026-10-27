import { test } from "node:test";
import assert from "node:assert/strict";
import { QuestionLimiter } from "../../src/index.js";
import type { AskResult, Clock } from "../../src/index.js";

const LIMIT_MESSAGE =
  "Daily limit of 20 questions reached for this task. It resets at 00:00 UTC.";

/** A clock the test moves by hand; it never reads the real time. */
function settableClock(iso: string): { clock: Clock; set: (next: string) => void } {
  let ms = Date.parse(iso);
  return {
    clock: () => new Date(ms),
    set: (next: string) => {
      ms = Date.parse(next);
    },
  };
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

test("the count resets at midnight UTC after a full day of questions", () => {
  const time = settableClock("2026-03-01T09:00:00.000Z");
  const limiter = new QuestionLimiter(time.clock);
  askTimes(limiter, "c1", "t1", 20);

  time.set("2026-03-01T23:59:59.999Z");
  const before = limiter.ask("c1", "t1");
  assert.equal(before.accepted, false);

  time.set("2026-03-02T00:00:00.000Z");
  const after = limiter.ask("c1", "t1");
  assert.equal(after.accepted, true);
  assert.equal(after.remaining, 19);
});

test("the count resets at midnight UTC across a year boundary", () => {
  const time = settableClock("2027-12-31T00:00:00.000Z");
  const limiter = new QuestionLimiter(time.clock);
  askTimes(limiter, "nia", "compiler", 20);

  time.set("2027-12-31T23:59:59.999Z");
  const before = limiter.ask("nia", "compiler");
  assert.equal(before.accepted, false);
  assert.equal(before.remaining, 0);
  assert.equal(refusalMessage(before), LIMIT_MESSAGE);
  assert.equal(limiter.remaining("nia", "compiler"), 0);

  time.set("2028-01-01T00:00:00.000Z");
  assert.equal(limiter.remaining("nia", "compiler"), 20);
  const after = limiter.ask("nia", "compiler");
  assert.equal(after.accepted, true);
  assert.equal(after.remaining, 19);
});

test("the count resets at midnight UTC into a leap day", () => {
  const time = settableClock("2028-02-28T15:45:00.000Z");
  const limiter = new QuestionLimiter(time.clock);
  askTimes(limiter, "ravi", "storage", 20);

  time.set("2028-02-28T23:59:59.999Z");
  assert.equal(limiter.ask("ravi", "storage").accepted, false);

  time.set("2028-02-29T00:00:00.000Z");
  const leapDay = limiter.ask("ravi", "storage");
  assert.equal(leapDay.accepted, true);
  assert.equal(leapDay.remaining, 19);

  askTimes(limiter, "ravi", "storage", 19);
  time.set("2028-02-29T23:59:59.999Z");
  assert.equal(limiter.ask("ravi", "storage").accepted, false);

  time.set("2028-03-01T00:00:00.000Z");
  assert.equal(limiter.remaining("ravi", "storage"), 20);
});

test("the remaining count reads 20 again at the start of the next UTC day", () => {
  const time = settableClock("2029-06-10T18:00:00.000Z");
  const limiter = new QuestionLimiter(time.clock);
  askTimes(limiter, "uma", "search", 20);
  assert.equal(limiter.remaining("uma", "search"), 0);

  time.set("2029-06-11T00:00:00.000Z");
  assert.equal(limiter.remaining("uma", "search"), 20);
});

test("a partly used allowance is full again on the next UTC day", () => {
  const time = settableClock("2026-05-05T11:11:00.000Z");
  const limiter = new QuestionLimiter(time.clock);
  askTimes(limiter, "jo", "api", 7);
  assert.equal(limiter.remaining("jo", "api"), 13);

  time.set("2026-05-06T00:00:00.001Z");
  assert.equal(limiter.remaining("jo", "api"), 20);
  const result = limiter.ask("jo", "api");
  assert.equal(result.accepted, true);
  assert.equal(result.remaining, 19);
});

test("questions anywhere within one UTC day count toward the same day", () => {
  const time = settableClock("2027-08-17T00:00:00.000Z");
  const limiter = new QuestionLimiter(time.clock);
  askTimes(limiter, "sam", "graph", 5);

  time.set("2027-08-17T00:30:00.000Z");
  askTimes(limiter, "sam", "graph", 5);

  time.set("2027-08-17T12:00:00.000Z");
  askTimes(limiter, "sam", "graph", 5);

  time.set("2027-08-17T23:30:00.000Z");
  askTimes(limiter, "sam", "graph", 4);

  time.set("2027-08-17T23:59:59.999Z");
  const twentieth = limiter.ask("sam", "graph");
  assert.equal(twentieth.accepted, true);
  assert.equal(twentieth.remaining, 0);
  const refused = limiter.ask("sam", "graph");
  assert.equal(refused.accepted, false);
  assert.equal(refusalMessage(refused), LIMIT_MESSAGE);
});

test("the clock is read on every call, not only when the limiter is created", () => {
  const time = settableClock("2026-01-01T00:00:00.000Z");
  const limiter = new QuestionLimiter(time.clock);
  askTimes(limiter, "ana", "db", 20);
  assert.equal(limiter.ask("ana", "db").accepted, false);

  time.set("2026-01-05T13:37:00.000Z");
  assert.equal(limiter.remaining("ana", "db"), 20);
  const result = limiter.ask("ana", "db");
  assert.equal(result.accepted, true);
  assert.equal(result.remaining, 19);
});

test("refused questions do not carry over into the next day", () => {
  const time = settableClock("2030-04-01T20:00:00.000Z");
  const limiter = new QuestionLimiter(time.clock);
  askTimes(limiter, "ivy", "net", 20);
  for (let i = 0; i < 6; i++) {
    assert.equal(limiter.ask("ivy", "net").accepted, false);
  }

  time.set("2030-04-02T06:00:00.000Z");
  for (let i = 1; i <= 20; i++) {
    const result = limiter.ask("ivy", "net");
    assert.equal(result.accepted, true, `question ${i} of the new day should be accepted`);
    assert.equal(result.remaining, 20 - i);
  }
  assert.equal(limiter.ask("ivy", "net").accepted, false);
});

test("each UTC day keeps its own count over consecutive days", () => {
  const time = settableClock("2026-11-29T10:00:00.000Z");
  const limiter = new QuestionLimiter(time.clock);
  askTimes(limiter, "leo", "ci", 20);

  time.set("2026-11-30T10:00:00.000Z");
  askTimes(limiter, "leo", "ci", 3);
  assert.equal(limiter.remaining("leo", "ci"), 17);

  time.set("2026-11-30T23:59:59.999Z");
  assert.equal(limiter.remaining("leo", "ci"), 17);

  time.set("2026-12-01T00:00:00.000Z");
  assert.equal(limiter.remaining("leo", "ci"), 20);
});

test("the reset applies to every contributor and task pair", () => {
  const time = settableClock("2031-03-15T21:00:00.000Z");
  const limiter = new QuestionLimiter(time.clock);
  askTimes(limiter, "c7", "task-a", 20);
  askTimes(limiter, "c7", "task-b", 5);
  askTimes(limiter, "c8", "task-a", 12);

  time.set("2031-03-16T00:00:00.000Z");
  assert.equal(limiter.remaining("c7", "task-a"), 20);
  assert.equal(limiter.remaining("c7", "task-b"), 20);
  assert.equal(limiter.remaining("c8", "task-a"), 20);
  const result = limiter.ask("c7", "task-a");
  assert.equal(result.accepted, true);
  assert.equal(result.remaining, 19);
});
