import { test } from "node:test";
import assert from "node:assert/strict";
import { QuestionLimiter, type AskResult } from "../../src/index.js";

const LIMIT_MESSAGE =
  "Daily limit of 20 questions reached for this task. It resets at 00:00 UTC.";

function accepted(result: AskResult, remaining: number): void {
  assert.equal(result.accepted, true);
  assert.equal(result.remaining, remaining);
}

function refused(result: AskResult): void {
  assert.equal(result.accepted, false);
  assert.equal(result.remaining, 0);
  if (!result.accepted) assert.equal(result.message, LIMIT_MESSAGE);
}

function spend(
  limiter: QuestionLimiter,
  count: number,
  contributor = "calendar-user",
  task = "calendar-task",
): void {
  for (let i = 0; i < count; i += 1) {
    accepted(limiter.ask(contributor, task), 19 - i);
  }
}

// Extends public: "an exhausted allowance resets exactly at midnight UTC".
test("[boundary-2] an allowance started one millisecond before midnight resets immediately", () => {
  let now = "2031-08-09T23:59:59.999Z";
  const limiter = new QuestionLimiter(() => new Date(now));
  spend(limiter, 20);
  refused(limiter.ask("calendar-user", "calendar-task"));
  now = "2031-08-10T00:00:00.000Z";
  accepted(limiter.ask("calendar-user", "calendar-task"), 19);
  assert.equal(limiter.remaining("calendar-user", "calendar-task"), 19);
});

// Extends public: "an exhausted allowance resets exactly at midnight UTC".
test("[boundary-2] each of four consecutive UTC days has exactly twenty questions", () => {
  let now = "2031-08-09T00:00:00.000Z";
  const limiter = new QuestionLimiter(() => new Date(now));
  for (const day of ["09", "10", "11", "12"]) {
    now = `2031-08-${day}T00:00:00.000Z`;
    spend(limiter, 20);
    now = `2031-08-${day}T23:59:59.999Z`;
    for (let attempt = 0; attempt < 31; attempt += 1) {
      refused(limiter.ask("calendar-user", "calendar-task"));
    }
    assert.equal(limiter.remaining("calendar-user", "calendar-task"), 0);
  }
});

// Extends public: "a month rollover restores the full allowance when read at midnight UTC".
test("[boundary-2] unused questions do not carry over and repeated reads see the new day", () => {
  let now = "2030-01-31T22:10:00.000Z";
  const limiter = new QuestionLimiter(() => new Date(now));
  spend(limiter, 6);
  assert.equal(limiter.remaining("calendar-user", "calendar-task"), 14);
  now = "2030-02-01T00:00:00.000Z";
  for (let read = 0; read < 50; read += 1) {
    assert.equal(limiter.remaining("calendar-user", "calendar-task"), 20);
  }
  spend(limiter, 20);
  refused(limiter.ask("calendar-user", "calendar-task"));
});

// Extends public: "a month rollover restores the full allowance when read at midnight UTC".
test("[boundary-2] year rollover resets both exhausted and partly used pairs", () => {
  let now = "2033-12-31T23:59:59.999Z";
  const limiter = new QuestionLimiter(() => new Date(now));
  spend(limiter, 20);
  spend(limiter, 13, "calendar-user", "partial-task");
  now = "2034-01-01T00:00:00.000Z";
  assert.equal(limiter.remaining("calendar-user", "calendar-task"), 20);
  accepted(limiter.ask("calendar-user", "partial-task"), 19);
  accepted(limiter.ask("calendar-user", "calendar-task"), 19);
  assert.equal(limiter.remaining("calendar-user", "partial-task"), 19);
});

test("[boundary-2] leap day and the following March first each have a new allowance", () => {
  let now = "2028-02-28T23:59:59.999Z";
  const limiter = new QuestionLimiter(() => new Date(now));
  spend(limiter, 20);
  refused(limiter.ask("calendar-user", "calendar-task"));
  now = "2028-02-29T00:00:00.000Z";
  assert.equal(limiter.remaining("calendar-user", "calendar-task"), 20);
  spend(limiter, 20);
  now = "2028-02-29T23:59:59.999Z";
  refused(limiter.ask("calendar-user", "calendar-task"));
  now = "2028-03-01T00:00:00.000Z";
  accepted(limiter.ask("calendar-user", "calendar-task"), 19);
});

test("[boundary-2] a non-leap February resets directly into March", () => {
  let now = "2027-02-28T23:59:59.999Z";
  const limiter = new QuestionLimiter(() => new Date(now));
  spend(limiter, 20);
  now = "2027-03-01T00:00:00.000Z";
  accepted(limiter.ask("calendar-user", "calendar-task"), 19);
  spend(limiter, 20, "new-calendar-user", "calendar-task");
  assert.equal(limiter.remaining("calendar-user", "calendar-task"), 19);
});

test("[boundary-2] skipped months with the same day number cannot reuse an old balance", () => {
  let now = "2030-05-17T04:30:00.000Z";
  const limiter = new QuestionLimiter(() => new Date(now));
  spend(limiter, 20);
  now = "2030-07-17T04:30:00.000Z";
  accepted(limiter.ask("calendar-user", "calendar-task"), 19);
  now = "2031-07-17T04:30:00.000Z";
  assert.equal(limiter.remaining("calendar-user", "calendar-task"), 20);
  accepted(limiter.ask("calendar-user", "calendar-task"), 19);
});

test("[boundary-2] the caller clock may advance before the first operation", () => {
  let now = "2029-09-30T23:59:59.999Z";
  const limiter = new QuestionLimiter(() => new Date(now));
  now = "2029-10-01T23:59:59.999Z";
  spend(limiter, 20);
  now = "2029-10-02T00:00:00.000Z";
  accepted(limiter.ask("calendar-user", "calendar-task"), 19);
  assert.equal(limiter.remaining("calendar-user", "calendar-task"), 19);
});

test("[boundary-2] reading alone observes midnight without requiring an intervening ask", () => {
  let now = "2032-04-12T23:59:59.999Z";
  const limiter = new QuestionLimiter(() => new Date(now));
  spend(limiter, 9);
  assert.equal(limiter.remaining("calendar-user", "calendar-task"), 11);
  now = "2032-04-13T00:00:00.000Z";
  assert.equal(limiter.remaining("calendar-user", "calendar-task"), 20);
  now = "2032-04-14T00:00:00.000Z";
  assert.equal(limiter.remaining("calendar-user", "calendar-task"), 20);
  spend(limiter, 20);
  refused(limiter.ask("calendar-user", "calendar-task"));
});

test("[boundary-2] staggered activity resets every pair without clearing new-day questions", () => {
  let now = "2035-10-20T23:59:59.999Z";
  const limiter = new QuestionLimiter(() => new Date(now));
  const pairs = [["a", "x"], ["a", "y"], ["b", "x"], ["b", "y"]];
  for (let i = 0; i < pairs.length; i += 1) {
    spend(limiter, 20 - i * 4, pairs[i][0], pairs[i][1]);
  }
  now = "2035-10-21T00:00:00.000Z";
  accepted(limiter.ask("a", "x"), 19);
  assert.equal(limiter.remaining("b", "y"), 20);
  accepted(limiter.ask("b", "x"), 19);
  assert.equal(limiter.remaining("a", "y"), 20);
  accepted(limiter.ask("a", "x"), 18);
  now = "2035-10-21T23:59:59.999Z";
  accepted(limiter.ask("b", "y"), 19);
  assert.equal(limiter.remaining("a", "x"), 18);
  assert.equal(limiter.remaining("b", "x"), 19);
  assert.equal(limiter.remaining("a", "y"), 20);
});

test("[boundary-2] offset timestamps reset at UTC midnight rather than the written local date", () => {
  let now = "2031-05-02T08:29:59.999+08:30"; // May 1, 23:59:59.999 UTC.
  const limiter = new QuestionLimiter(() => new Date(now));
  spend(limiter, 20);
  now = "2031-05-01T19:59:59.999-04:00"; // Same instant, different written date.
  refused(limiter.ask("calendar-user", "calendar-task"));
  now = "2031-05-01T20:00:00.000-04:00"; // May 2, 00:00 UTC.
  accepted(limiter.ask("calendar-user", "calendar-task"), 19);
  now = "2031-05-02T08:30:00.000+08:30"; // Same new-day instant.
  assert.equal(limiter.remaining("calendar-user", "calendar-task"), 19);
});

test("[boundary-2] a clock returning the same mutable Date still exposes day changes", () => {
  const suppliedDate = new Date("2036-02-28T23:59:59.999Z");
  const limiter = new QuestionLimiter(() => suppliedDate);
  spend(limiter, 20);
  suppliedDate.setTime(Date.parse("2036-02-29T00:00:00.000Z"));
  accepted(limiter.ask("calendar-user", "calendar-task"), 19);
  assert.equal(limiter.remaining("calendar-user", "calendar-task"), 19);
  suppliedDate.setTime(Date.parse("2036-03-01T00:00:00.000Z"));
  assert.equal(limiter.remaining("calendar-user", "calendar-task"), 20);
});
