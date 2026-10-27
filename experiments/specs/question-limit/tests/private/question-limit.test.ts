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

// ---------------------------------------------------------------------------
// [happy-1] A contributor with no questions today has the full allowance
// ---------------------------------------------------------------------------

// Extends "full allowance: a contributor with no questions today has 20 remaining":
// other ids, read before any ask on a limiter that has seen other activity.
test("[happy-1] a contributor with no questions has 20 remaining even after others have asked", () => {
  const limiter = limiterAt(NOON);
  askTimes(limiter, "c1", "t1", 7);
  askTimes(limiter, "c2", "t2", 20);
  assert.equal(limiter.remaining("c3", "t3"), 20);
  assert.equal(limiter.remaining("c1", "t2"), 20);
  assert.equal(limiter.remaining("c2", "t1"), 20);
});

test("[happy-1] a fresh limiter reports 20 remaining for arbitrary ids", () => {
  const limiter = limiterAt("2031-07-15T18:30:00.000Z");
  assert.equal(limiter.remaining("contributor-xyz", "task-42"), 20);
  assert.equal(limiter.remaining("x", "y"), 20);
});

// Extends "full allowance: reading the remaining count more than 20 times uses no questions":
// reads interleaved with asks, many pairs, and a full day of 20 accepted after 100 reads.
test("[happy-1] reading the remaining count between every question uses no questions", () => {
  const limiter = limiterAt(NOON);
  for (let i = 0; i < 20; i++) {
    for (let r = 0; r < 5; r++) {
      assert.equal(limiter.remaining("c1", "t1"), 20 - i);
    }
    assertAccepted(limiter.ask("c1", "t1"), 19 - i);
  }
  assert.equal(limiter.remaining("c1", "t1"), 0);
  assertRefused(limiter.ask("c1", "t1"));
});

test("[happy-1] reading many pairs 100 times each uses none of their questions", () => {
  const limiter = limiterAt(NOON);
  const pairs: Array<[string, string]> = [
    ["c1", "t1"],
    ["c1", "t2"],
    ["c2", "t1"],
  ];
  for (let i = 0; i < 100; i++) {
    for (const [c, t] of pairs) assert.equal(limiter.remaining(c, t), 20);
  }
  for (const [c, t] of pairs) {
    askTimes(limiter, c, t, 19);
    assertAccepted(limiter.ask(c, t), 0);
  }
});

test("[happy-1] reading the remaining count after exhaustion and refusal keeps it at 0, and reading on a new day does not use one", () => {
  const time = manualClock(NOON);
  const limiter = new QuestionLimiter(time.clock);
  askTimes(limiter, "c1", "t1", 20);
  time.set("2026-03-02T08:00:00.000Z");
  for (let i = 0; i < 30; i++) assert.equal(limiter.remaining("c1", "t1"), 20);
  askTimes(limiter, "c1", "t1", 20);
  assertRefused(limiter.ask("c1", "t1"));
});

// ---------------------------------------------------------------------------
// [happy-2] An accepted question uses one from the allowance
// ---------------------------------------------------------------------------

// Extends "accepted question: the first question is accepted and 19 remain":
// every accepted question uses exactly one, all the way down.
test("[happy-2] each accepted question uses exactly one, counting 19 down to 0", () => {
  const limiter = limiterAt(NOON);
  for (let expected = 19; expected >= 0; expected--) {
    assertAccepted(limiter.ask("c1", "t1"), expected);
    assert.equal(limiter.remaining("c1", "t1"), expected);
  }
});

test("[happy-2] the first question by other ids at another time is accepted with 19 remaining", () => {
  const limiter = limiterAt("2027-11-30T05:17:42.123Z");
  assertAccepted(limiter.ask("alice", "task-9"), 19);
  assert.equal(limiter.remaining("alice", "task-9"), 19);
  assertAccepted(limiter.ask("alice", "task-9"), 18);
  assertAccepted(limiter.ask("alice", "task-9"), 17);
  assert.equal(limiter.remaining("alice", "task-9"), 17);
});

// Extends "accepted question: the first question at exactly 00:00:00.000 UTC is accepted and 19 remain":
// the last millisecond of the day, and other dates.
test("[happy-2] the first question at 23:59:59.999 UTC is accepted with 19 remaining", () => {
  const limiter = limiterAt("2026-03-01T23:59:59.999Z");
  assertAccepted(limiter.ask("c1", "t1"), 19);
  assert.equal(limiter.remaining("c1", "t1"), 19);
});

test("[happy-2] the first question at midnight on year and leap-day boundaries is accepted with 19 remaining", () => {
  for (const iso of ["2027-01-01T00:00:00.000Z", "2028-02-29T00:00:00.000Z", "1970-01-01T00:00:00.000Z"]) {
    const limiter = limiterAt(iso);
    assertAccepted(limiter.ask("c1", "t1"), 19);
    assert.equal(limiter.remaining("c1", "t1"), 19);
  }
});

test("[happy-2] the result of an accepted question has accepted true", () => {
  const limiter = limiterAt(NOON);
  const result = limiter.ask("c1", "t1");
  assert.strictEqual(result.accepted, true);
  assert.strictEqual(result.remaining, 19);
});

// ---------------------------------------------------------------------------
// [boundary-1] The twentieth question is still accepted
// ---------------------------------------------------------------------------

// Extends "twentieth question: after 19 questions the twentieth is accepted with 0 remaining":
// the 19 earlier questions spread across the day, with other pairs interleaved.
test("[boundary-1] the twentieth question is accepted when earlier ones were spread across the day and interleaved with other pairs", () => {
  const time = manualClock("2026-03-01T00:00:00.000Z");
  const limiter = new QuestionLimiter(time.clock);
  for (let i = 0; i < 19; i++) {
    time.set(new Date(Date.UTC(2026, 2, 1, i, 30)).toISOString());
    assert.equal(limiter.ask("c1", "t1").accepted, true);
    assert.equal(limiter.ask("c2", "t1").accepted, true);
    assert.equal(limiter.ask("c1", "t2").accepted, true);
  }
  time.set("2026-03-01T23:59:59.999Z");
  assertAccepted(limiter.ask("c1", "t1"), 0);
  assertAccepted(limiter.ask("c2", "t1"), 0);
  assertAccepted(limiter.ask("c1", "t2"), 0);
});

// Extends "twentieth question: remaining reads 1 before the twentieth question and 0 after it":
// on a new day after a full previous day.
test("[boundary-1] on the day after an exhausted day, the twentieth question is accepted and the twenty-first refused", () => {
  const time = manualClock(NOON);
  const limiter = new QuestionLimiter(time.clock);
  askTimes(limiter, "c1", "t1", 20);
  time.set("2026-03-02T12:00:00.000Z");
  askTimes(limiter, "c1", "t1", 19);
  assert.equal(limiter.remaining("c1", "t1"), 1);
  assertAccepted(limiter.ask("c1", "t1"), 0);
  assert.equal(limiter.remaining("c1", "t1"), 0);
  assertRefused(limiter.ask("c1", "t1"));
});

test("[boundary-1] the twentieth question is accepted for every one of several pairs", () => {
  const limiter = limiterAt(NOON);
  const pairs: Array<[string, string]> = [
    ["c1", "t1"],
    ["c2", "t1"],
    ["c1", "t2"],
    ["c2", "t2"],
  ];
  for (const [c, t] of pairs) askTimes(limiter, c, t, 19);
  for (const [c, t] of pairs) {
    assert.equal(limiter.remaining(c, t), 1);
    assertAccepted(limiter.ask(c, t), 0);
  }
});

// ---------------------------------------------------------------------------
// [unhappy-1] The twenty-first question is refused with a clear message
// ---------------------------------------------------------------------------

// Extends "twenty-first question: it is refused with 0 remaining and the limit message":
// other ids, other day, the exact message regardless of ids.
test("[unhappy-1] the twenty-first question by other ids on another day is refused with the exact message", () => {
  const limiter = limiterAt("2027-08-09T03:04:05.006Z");
  askTimes(limiter, "bob", "task-77", 20);
  const result = limiter.ask("bob", "task-77");
  assert.equal(result.accepted, false);
  assert.equal(result.remaining, 0);
  if (result.accepted === false) {
    assert.equal(result.message, LIMIT_MESSAGE);
  }
});

// Extends "twenty-first question: further questions stay refused and remaining stays at 0":
// many more refusals, never negative, and refusals do not spill onto other pairs.
test("[unhappy-1] fifty further questions all stay refused, remaining never goes below 0", () => {
  const limiter = limiterAt(NOON);
  askTimes(limiter, "c1", "t1", 20);
  for (let i = 0; i < 50; i++) {
    const result = limiter.ask("c1", "t1");
    assertRefused(result);
  }
  assert.equal(limiter.remaining("c1", "t1"), 0);
});

test("[unhappy-1] refusals for one pair do not use questions of other pairs", () => {
  const limiter = limiterAt(NOON);
  askTimes(limiter, "c1", "t1", 20);
  askTimes(limiter, "c2", "t1", 5);
  for (let i = 0; i < 30; i++) assertRefused(limiter.ask("c1", "t1"));
  assert.equal(limiter.remaining("c2", "t1"), 15);
  assert.equal(limiter.remaining("c1", "t2"), 20);
  assertAccepted(limiter.ask("c2", "t1"), 14);
});

test("[unhappy-1] the twenty-first question is refused when the twenty were asked across the whole day", () => {
  const time = manualClock("2026-03-01T00:00:00.000Z");
  const limiter = new QuestionLimiter(time.clock);
  for (let i = 0; i < 20; i++) {
    time.set(new Date(Date.UTC(2026, 2, 1, i, 0, 0)).toISOString());
    assert.equal(limiter.ask("c1", "t1").accepted, true);
  }
  time.set("2026-03-01T23:59:59.999Z");
  assertRefused(limiter.ask("c1", "t1"));
});

test("[unhappy-1] a contributor exhausting a second task is refused on it with the same message", () => {
  const limiter = limiterAt(NOON);
  askTimes(limiter, "c1", "t1", 20);
  askTimes(limiter, "c1", "t2", 20);
  assertRefused(limiter.ask("c1", "t2"));
  assertRefused(limiter.ask("c1", "t1"));
});

// ---------------------------------------------------------------------------
// [boundary-2] The count resets at midnight UTC
// ---------------------------------------------------------------------------

// Extends "midnight reset: refused at 23:59:59.999Z, accepted at 00:00:00.000Z with 19 remaining":
// a 24-hour rolling window would refuse here; the day boundary is midnight UTC.
test("[boundary-2] questions asked late on one day do not count the next day, even within 24 hours", () => {
  const time = manualClock("2026-03-01T23:00:00.000Z");
  const limiter = new QuestionLimiter(time.clock);
  askTimes(limiter, "c1", "t1", 20);
  time.set("2026-03-01T23:59:59.999Z");
  assertRefused(limiter.ask("c1", "t1"));
  time.set("2026-03-02T00:00:00.000Z");
  assertAccepted(limiter.ask("c1", "t1"), 19);
});

test("[boundary-2] questions asked early on a day still count late that same day", () => {
  const time = manualClock("2026-03-01T00:00:00.000Z");
  const limiter = new QuestionLimiter(time.clock);
  askTimes(limiter, "c1", "t1", 20);
  time.set("2026-03-01T23:59:59.999Z");
  assert.equal(limiter.remaining("c1", "t1"), 0);
  assertRefused(limiter.ask("c1", "t1"));
});

test("[boundary-2] a partly used day resets to the full allowance at midnight UTC, not to what was left", () => {
  const time = manualClock("2026-03-01T22:00:00.000Z");
  const limiter = new QuestionLimiter(time.clock);
  askTimes(limiter, "c1", "t1", 10);
  time.set("2026-03-02T00:00:00.000Z");
  assert.equal(limiter.remaining("c1", "t1"), 20);
  assertAccepted(limiter.ask("c1", "t1"), 19);
});

test("[boundary-2] the reset happens across month and year boundaries", () => {
  const cases: Array<[string, string, string]> = [
    ["2026-03-31T12:00:00.000Z", "2026-03-31T23:59:59.999Z", "2026-04-01T00:00:00.000Z"],
    ["2026-12-31T12:00:00.000Z", "2026-12-31T23:59:59.999Z", "2027-01-01T00:00:00.000Z"],
    ["2028-02-28T12:00:00.000Z", "2028-02-28T23:59:59.999Z", "2028-02-29T00:00:00.000Z"],
    ["2028-02-29T12:00:00.000Z", "2028-02-29T23:59:59.999Z", "2028-03-01T00:00:00.000Z"],
  ];
  for (const [start, last, next] of cases) {
    const time = manualClock(start);
    const limiter = new QuestionLimiter(time.clock);
    askTimes(limiter, "c1", "t1", 20);
    time.set(last);
    assertRefused(limiter.ask("c1", "t1"));
    time.set(next);
    assertAccepted(limiter.ask("c1", "t1"), 19);
  }
});

test("[boundary-2] the same day-of-month in another month or year is a different day", () => {
  const time = manualClock("2026-03-01T12:00:00.000Z");
  const limiter = new QuestionLimiter(time.clock);
  askTimes(limiter, "c1", "t1", 20);
  time.set("2026-04-01T12:00:00.000Z");
  assertAccepted(limiter.ask("c1", "t1"), 19);
  askTimes(limiter, "c1", "t1", 19);
  time.set("2027-04-01T12:00:00.000Z");
  assertAccepted(limiter.ask("c1", "t1"), 19);
});

test("[boundary-2] the count resets on a later day even when days are skipped", () => {
  const time = manualClock(NOON);
  const limiter = new QuestionLimiter(time.clock);
  askTimes(limiter, "c1", "t1", 20);
  time.set("2026-03-09T00:00:00.000Z");
  assert.equal(limiter.remaining("c1", "t1"), 20);
  assertAccepted(limiter.ask("c1", "t1"), 19);
});

// Extends "midnight reset: questions from 00:00:00.000Z to 23:59:59.999Z count as one day, the next starts full":
// several consecutive days, each with its own full allowance.
test("[boundary-2] each of several consecutive days has its own allowance of 20", () => {
  const time = manualClock("2026-03-01T00:00:00.000Z");
  const limiter = new QuestionLimiter(time.clock);
  for (let day = 1; day <= 5; day++) {
    const dd = String(day).padStart(2, "0");
    time.set(`2026-03-${dd}T00:00:00.000Z`);
    assert.equal(limiter.remaining("c1", "t1"), 20);
    askTimes(limiter, "c1", "t1", 10);
    time.set(`2026-03-${dd}T23:59:59.999Z`);
    askTimes(limiter, "c1", "t1", 9);
    assertAccepted(limiter.ask("c1", "t1"), 0);
    assertRefused(limiter.ask("c1", "t1"));
  }
});

test("[boundary-2] the reset applies to every pair, not only the one that asks first", () => {
  const time = manualClock(NOON);
  const limiter = new QuestionLimiter(time.clock);
  askTimes(limiter, "c1", "t1", 20);
  askTimes(limiter, "c2", "t1", 20);
  askTimes(limiter, "c1", "t2", 13);
  time.set("2026-03-02T00:00:00.000Z");
  assertAccepted(limiter.ask("c1", "t1"), 19);
  assert.equal(limiter.remaining("c2", "t1"), 20);
  assert.equal(limiter.remaining("c1", "t2"), 20);
  assertAccepted(limiter.ask("c2", "t1"), 19);
  assertAccepted(limiter.ask("c1", "t2"), 19);
});

test("[boundary-2] remaining read just after midnight is 20 without any question asked first", () => {
  const time = manualClock("2026-03-01T23:59:59.999Z");
  const limiter = new QuestionLimiter(time.clock);
  askTimes(limiter, "c1", "t1", 20);
  assert.equal(limiter.remaining("c1", "t1"), 0);
  time.set("2026-03-02T00:00:00.000Z");
  assert.equal(limiter.remaining("c1", "t1"), 20);
});

test("[boundary-2] the clock is read at each call, not once when the limiter is created", () => {
  let calls = 0;
  let now = Date.parse("2026-03-01T12:00:00.000Z");
  const limiter = new QuestionLimiter(() => {
    calls++;
    return new Date(now);
  });
  askTimes(limiter, "c1", "t1", 20);
  now = Date.parse("2026-03-02T00:00:00.000Z");
  assertAccepted(limiter.ask("c1", "t1"), 19);
  assert.ok(calls >= 1);
});

// ---------------------------------------------------------------------------
// [happy-3] Allowances are separate per task and per contributor
// ---------------------------------------------------------------------------

// Extends "separate allowances: an exhausted contributor can still ask about another task, and others can ask about the task":
// the other pairs get their full allowance of 20, not just one question.
test("[happy-3] the other task and the other contributor each get a full 20 after c1 exhausts t1", () => {
  const limiter = limiterAt(NOON);
  askTimes(limiter, "c1", "t1", 20);
  askTimes(limiter, "c1", "t2", 19);
  assertAccepted(limiter.ask("c1", "t2"), 0);
  assertRefused(limiter.ask("c1", "t2"));
  askTimes(limiter, "c2", "t1", 19);
  assertAccepted(limiter.ask("c2", "t1"), 0);
  assertRefused(limiter.ask("c2", "t1"));
  assertAccepted(limiter.ask("c2", "t2"), 19);
});

test("[happy-3] partial counts are tracked independently for each contributor and task pair", () => {
  const limiter = limiterAt(NOON);
  const counts: Array<[string, string, number]> = [
    ["c1", "t1", 5],
    ["c1", "t2", 3],
    ["c2", "t1", 7],
    ["c2", "t2", 11],
    ["c3", "t1", 1],
  ];
  // Interleave the asks round-robin so no pair's questions are contiguous.
  for (let round = 0; round < 11; round++) {
    for (const [c, t, n] of counts) {
      if (round < n) assert.equal(limiter.ask(c, t).accepted, true);
    }
  }
  for (const [c, t, n] of counts) assert.equal(limiter.remaining(c, t), 20 - n);
  assert.equal(limiter.remaining("c3", "t2"), 20);
});

test("[happy-3] many contributors on many tasks each get their own allowance", () => {
  const limiter = limiterAt(NOON);
  for (let c = 0; c < 10; c++) {
    for (let t = 0; t < 10; t++) {
      assertAccepted(limiter.ask(`c${c}`, `t${t}`), 19);
    }
  }
  for (let c = 0; c < 10; c++) {
    for (let t = 0; t < 10; t++) {
      assert.equal(limiter.remaining(`c${c}`, `t${t}`), 19);
    }
  }
});

test("[happy-3] the same string as contributor id and as task id names different allowances", () => {
  const limiter = limiterAt(NOON);
  askTimes(limiter, "x", "y", 20);
  assertRefused(limiter.ask("x", "y"));
  assertAccepted(limiter.ask("y", "x"), 19);
  askTimes(limiter, "same", "same", 3);
  assert.equal(limiter.remaining("same", "same"), 17);
  assert.equal(limiter.remaining("same", "other"), 20);
  assert.equal(limiter.remaining("other", "same"), 20);
});

// Extends "separate allowances: pairs whose ids would collide if naively joined stay separate":
// other separators a key-joining implementation might use.
test("[happy-3] ids containing common separators do not collide with other pairs", () => {
  const limiter = limiterAt(NOON);
  const separators = [":", "|", "/", ",", "-", "_", ".", " ", "\u0000", "\n", "::", "#", "\t", "\"", "[", "]"];
  for (const sep of separators) {
    askTimes(limiter, `a${sep}b`, "c", 20);
    assertRefused(limiter.ask(`a${sep}b`, "c"));
    assert.equal(limiter.remaining("a", `b${sep}c`), 20, `separator ${JSON.stringify(sep)}`);
    assertAccepted(limiter.ask("a", `b${sep}c`), 19);
  }
});

test("[happy-3] ids that would collide under JSON-array or length-free encodings stay separate", () => {
  const limiter = limiterAt(NOON);
  askTimes(limiter, 'a","b', "c", 20);
  assert.equal(limiter.remaining("a", 'b","c'), 20);
  askTimes(limiter, "a", "bc", 20);
  assert.equal(limiter.remaining("ab", "c"), 20);
  assertAccepted(limiter.ask("ab", "c"), 19);
});

test("[happy-3] ids that are names of Object prototype properties get ordinary allowances", () => {
  const limiter = limiterAt(NOON);
  const names = ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf", "prototype"];
  for (const name of names) {
    assert.equal(limiter.remaining(name, "t1"), 20, `contributor ${name}`);
    assert.equal(limiter.remaining("c1", name), 20, `task ${name}`);
    assertAccepted(limiter.ask(name, "t1"), 19);
    assertAccepted(limiter.ask("c1", name), 19);
    assertAccepted(limiter.ask(name, name), 19);
  }
  for (const name of names) {
    assert.equal(limiter.remaining(name, "t1"), 19);
    assert.equal(limiter.remaining("c1", name), 19);
    assert.equal(limiter.remaining(name, name), 19);
  }
});

test("[happy-3] ids differing only by case or by unicode content are different", () => {
  const limiter = limiterAt(NOON);
  askTimes(limiter, "C1", "T1", 20);
  assert.equal(limiter.remaining("c1", "t1"), 20);
  askTimes(limiter, "日本", "タスク", 20);
  assertRefused(limiter.ask("日本", "タスク"));
  assert.equal(limiter.remaining("日", "本タスク"), 20);
  assertAccepted(limiter.ask("c1", "t1"), 19);
});

test("[happy-3] ids that differ only by surrounding whitespace are different", () => {
  const limiter = limiterAt(NOON);
  askTimes(limiter, "c1", "t1", 20);
  assert.equal(limiter.remaining(" c1", "t1"), 20);
  assert.equal(limiter.remaining("c1", "t1 "), 20);
  assertAccepted(limiter.ask("c1 ", "t1"), 19);
});

test("[happy-3] long ids are tracked separately", () => {
  const limiter = limiterAt(NOON);
  const long = "x".repeat(5000);
  askTimes(limiter, long, long, 20);
  assertRefused(limiter.ask(long, long));
  assert.equal(limiter.remaining(long + "x", long), 20);
  assert.equal(limiter.remaining(long, long.slice(1)), 20);
});

// ---------------------------------------------------------------------------
// [unhappy-2] A question with no contributor or no task is rejected
// ---------------------------------------------------------------------------

// Extends "empty ids: asking with an empty contributor id or an empty task id throws":
// it throws an Error rather than returning a refused result, even when the other id is exhausted.
test("[unhappy-2] an empty task id fails with an error even when the contributor is exhausted elsewhere", () => {
  const limiter = limiterAt(NOON);
  askTimes(limiter, "c1", "t1", 20);
  assertFailsWithError(() => limiter.ask("c1", ""));
  assertFailsWithError(() => limiter.ask("", "t1"));
  assertRefused(limiter.ask("c1", "t1"));
});

test("[unhappy-2] empty ids fail with an error, not a refused or accepted result", () => {
  const limiter = limiterAt(NOON);
  for (const [c, t] of [["", "t1"], ["c1", ""], ["", ""]] as Array<[string, string]>) {
    let returned: unknown = undefined;
    let thrown: unknown = undefined;
    try {
      returned = limiter.ask(c, t);
    } catch (error) {
      thrown = error;
    }
    assert.equal(returned, undefined, `ask(${JSON.stringify(c)}, ${JSON.stringify(t)}) returned instead of failing`);
    assert.ok(thrown instanceof Error);
  }
  assert.equal(limiter.remaining("c1", "t1"), 20);
});

// Extends "empty ids: rejected questions use no allowance even when only one question is left":
// no allowance of any pair is used, across many pairs and partial counts.
test("[unhappy-2] failed questions use no allowance of any pair", () => {
  const limiter = limiterAt(NOON);
  askTimes(limiter, "c1", "t1", 4);
  askTimes(limiter, "c2", "t2", 12);
  for (let i = 0; i < 40; i++) {
    assertFailsWithError(() => limiter.ask("c1", ""));
    assertFailsWithError(() => limiter.ask("", "t1"));
    assertFailsWithError(() => limiter.ask("c2", ""));
    assertFailsWithError(() => limiter.ask("", "t2"));
    assertFailsWithError(() => limiter.ask("", ""));
  }
  assert.equal(limiter.remaining("c1", "t1"), 16);
  assert.equal(limiter.remaining("c2", "t2"), 8);
  assert.equal(limiter.remaining("c1", "t2"), 20);
  assert.equal(limiter.remaining("c2", "t1"), 20);
  askTimes(limiter, "c2", "t2", 7);
  assertAccepted(limiter.ask("c2", "t2"), 0);
  assertRefused(limiter.ask("c2", "t2"));
});

test("[unhappy-2] failed questions before any valid question leave the full allowance for every pair", () => {
  const limiter = limiterAt(NOON);
  for (let i = 0; i < 25; i++) {
    assertFailsWithError(() => limiter.ask("", "t1"));
    assertFailsWithError(() => limiter.ask("c1", ""));
  }
  askTimes(limiter, "c1", "t1", 19);
  assertAccepted(limiter.ask("c1", "t1"), 0);
  assertRefused(limiter.ask("c1", "t1"));
});

test("[unhappy-2] empty ids still fail on a new day and use none of that day's allowance", () => {
  const time = manualClock(NOON);
  const limiter = new QuestionLimiter(time.clock);
  askTimes(limiter, "c1", "t1", 20);
  time.set("2026-03-02T00:00:00.000Z");
  assertFailsWithError(() => limiter.ask("c1", ""));
  assertFailsWithError(() => limiter.ask("", "t1"));
  assert.equal(limiter.remaining("c1", "t1"), 20);
  assertAccepted(limiter.ask("c1", "t1"), 19);
});
