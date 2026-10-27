import { test } from "node:test";
import assert from "node:assert/strict";
import { QuestionLimiter, type AskResult } from "../../src/index.js";

const LIMIT_MESSAGE =
  "Daily limit of 20 questions reached for this task. It resets at 00:00 UTC.";

const clock = (): Date => new Date("2031-12-24T16:45:00.000Z");

function accepted(result: AskResult, remaining: number): void {
  assert.equal(result.accepted, true);
  assert.equal(result.remaining, remaining);
}

function spend(
  limiter: QuestionLimiter,
  count: number,
  contributor: string,
  task: string,
): void {
  for (let i = 0; i < count; i += 1) {
    accepted(limiter.ask(contributor, task), 19 - i);
  }
}

function invalid(limiter: QuestionLimiter, contributor: string, task: string): void {
  // The specification requires an error but prescribes neither its wording nor
  // a more specific error class. Keep construction and all successful calls
  // outside this assertion so an unimplemented constructor cannot satisfy it.
  assert.throws(
    () => limiter.ask(contributor, task),
    (error: unknown): boolean => error instanceof Error,
  );
}

// Extends public: "either empty ID throws without using a fresh allowance".
test("[unhappy-2] repeated empty contributor requests preserve multiple fresh task allowances", () => {
  const limiter = new QuestionLimiter(clock);
  for (let attempt = 0; attempt < 45; attempt += 1) {
    invalid(limiter, "", "fresh-task-a");
    invalid(limiter, "", "fresh-task-b");
  }
  for (const contributor of ["valid-a", "valid-b"]) {
    for (const task of ["fresh-task-a", "fresh-task-b"]) {
      assert.equal(limiter.remaining(contributor, task), 20);
      spend(limiter, 20, contributor, task);
    }
  }
});

// Extends public: "either empty ID throws without using a fresh allowance".
test("[unhappy-2] repeated empty task requests preserve multiple fresh contributor allowances", () => {
  const limiter = new QuestionLimiter(clock);
  for (let attempt = 0; attempt < 45; attempt += 1) {
    invalid(limiter, "valid-a", "");
    invalid(limiter, "valid-b", "");
  }
  for (const contributor of ["valid-b", "valid-a"]) {
    for (const task of ["new-task-b", "new-task-a"]) {
      assert.equal(limiter.remaining(contributor, task), 20);
      spend(limiter, 20, contributor, task);
    }
  }
});

// Extends public: "empty IDs including both empty preserve the last available question".
test("[unhappy-2] invalid requests interleaved with every accepted question preserve exact balances", () => {
  const limiter = new QuestionLimiter(clock);
  for (let used = 0; used < 20; used += 1) {
    invalid(limiter, "", "interleaved-task");
    invalid(limiter, "interleaved-user", "");
    invalid(limiter, "", "");
    assert.equal(limiter.remaining("interleaved-user", "interleaved-task"), 20 - used);
    accepted(limiter.ask("interleaved-user", "interleaved-task"), 19 - used);
  }
  const result = limiter.ask("interleaved-user", "interleaved-task");
  assert.equal(result.accepted, false);
  assert.equal(result.remaining, 0);
  if (!result.accepted) assert.equal(result.message, LIMIT_MESSAGE);
});

// Extends public: "empty IDs including both empty preserve the last available question".
test("[unhappy-2] invalid IDs still throw after exhaustion and preserve unrelated partial balances", () => {
  const limiter = new QuestionLimiter(clock);
  spend(limiter, 20, "exhausted-user", "exhausted-task");
  spend(limiter, 7, "exhausted-user", "open-task");
  spend(limiter, 12, "open-user", "exhausted-task");
  for (let attempt = 0; attempt < 30; attempt += 1) {
    invalid(limiter, "", "exhausted-task");
    invalid(limiter, "exhausted-user", "");
    invalid(limiter, "", "");
  }
  assert.equal(limiter.remaining("exhausted-user", "exhausted-task"), 0);
  assert.equal(limiter.remaining("exhausted-user", "open-task"), 13);
  assert.equal(limiter.remaining("open-user", "exhausted-task"), 8);
  accepted(limiter.ask("exhausted-user", "open-task"), 12);
  accepted(limiter.ask("open-user", "exhausted-task"), 7);
});

test("[unhappy-2] invalid requests at midnight leave the entire new daily allowance available", () => {
  let now = "2032-12-31T23:59:59.999Z";
  const limiter = new QuestionLimiter(() => new Date(now));
  spend(limiter, 20, "year-user", "year-task");
  invalid(limiter, "year-user", "");
  invalid(limiter, "", "year-task");
  now = "2033-01-01T00:00:00.000Z";
  invalid(limiter, "", "");
  invalid(limiter, "year-user", "");
  invalid(limiter, "", "year-task");
  assert.equal(limiter.remaining("year-user", "year-task"), 20);
  spend(limiter, 20, "year-user", "year-task");
});

test("[unhappy-2] invalid IDs preserve several different partially used allowances", () => {
  const limiter = new QuestionLimiter(clock);
  const pairs = [["alpha", "one"], ["alpha", "two"], ["beta", "one"], ["beta", "two"]];
  for (let i = 0; i < pairs.length; i += 1) {
    spend(limiter, 3 + i * 4, pairs[i][0], pairs[i][1]);
  }
  for (const [contributor, task] of pairs) {
    invalid(limiter, contributor, "");
    invalid(limiter, "", task);
    invalid(limiter, "", "");
  }
  for (let i = pairs.length - 1; i >= 0; i -= 1) {
    assert.equal(limiter.remaining(pairs[i][0], pairs[i][1]), 17 - i * 4);
    accepted(limiter.ask(pairs[i][0], pairs[i][1]), 16 - i * 4);
  }
});
