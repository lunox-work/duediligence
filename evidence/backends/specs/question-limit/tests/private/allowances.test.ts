import { test } from "node:test";
import assert from "node:assert/strict";
import { QuestionLimiter, type AskResult } from "../../src/index.js";

const LIMIT_MESSAGE =
  "Daily limit of 20 questions reached for this task. It resets at 00:00 UTC.";

const clock = (): Date => new Date("2032-07-18T09:34:21.678Z");

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
  contributor: string,
  task: string,
): void {
  for (let i = 0; i < count; i += 1) {
    accepted(limiter.ask(contributor, task), 19 - i);
  }
}

// Extends public: "a fresh allowance is 20 and repeated reads do not consume it".
test("[happy-1] hundreds of reads across fresh pairs preserve every allowance", () => {
  const limiter = new QuestionLimiter(clock);
  const pairs = [
    ["reader-alpha", "project-blue"],
    ["reader-beta", "project-blue"],
    ["reader-alpha", "project-green"],
  ];
  for (let i = 0; i < 240; i += 1) {
    for (const [contributor, task] of pairs) {
      assert.equal(limiter.remaining(contributor, task), 20);
    }
  }
  for (const [contributor, task] of pairs) {
    accepted(limiter.ask(contributor, task), 19);
    assert.equal(limiter.remaining(contributor, task), 19);
  }
});

// Extends public: "reading with one question left preserves the final question".
test("[happy-1] reads preserve every intermediate balance as well as an exhausted balance", () => {
  const limiter = new QuestionLimiter(clock);
  for (let used = 0; used <= 20; used += 1) {
    for (let read = 0; read < 11; read += 1) {
      assert.equal(limiter.remaining("observer", "task/part/17"), 20 - used);
    }
    if (used < 20) {
      accepted(limiter.ask("observer", "task/part/17"), 19 - used);
    }
  }
  refused(limiter.ask("observer", "task/part/17"));
});

// Extends public: "the first accepted question reports and stores 19 remaining".
test("[happy-2] each of the first nineteen questions stores its own decreasing balance", () => {
  const limiter = new QuestionLimiter(clock);
  for (let question = 1; question <= 19; question += 1) {
    accepted(limiter.ask("contributor-57", "task-812"), 20 - question);
    assert.equal(limiter.remaining("contributor-57", "task-812"), 20 - question);
  }
});

// Extends public: "accepted questions still consume exactly one at the end of a UTC day".
test("[happy-2] advancing through a UTC day consumes one per ask without an hourly reset", () => {
  let now = "2030-11-05T00:00:00.000Z";
  const limiter = new QuestionLimiter(() => new Date(now));
  const times = [
    "2030-11-05T00:00:00.000Z",
    "2030-11-05T00:00:00.001Z",
    "2030-11-05T00:59:59.999Z",
    "2030-11-05T01:00:00.000Z",
    "2030-11-05T11:59:59.999Z",
    "2030-11-05T12:00:00.000Z",
    "2030-11-05T23:59:59.999Z",
  ];
  for (let i = 0; i < times.length; i += 1) {
    now = times[i];
    accepted(limiter.ask("hour-reader", "all-day-task"), 19 - i);
    assert.equal(limiter.remaining("hour-reader", "all-day-task"), 19 - i);
  }
});

// Extends public: "the twentieth question is accepted with zero remaining".
test("[boundary-1] multiple interleaved pairs each accept their own twentieth question", () => {
  const limiter = new QuestionLimiter(clock);
  const pairs = [
    ["a", "x"], ["b", "x"], ["a", "y"], ["b", "y"], ["c", "z"],
  ];
  for (let question = 1; question <= 20; question += 1) {
    for (const [contributor, task] of [...pairs].reverse()) {
      accepted(limiter.ask(contributor, task), 20 - question);
      assert.equal(limiter.remaining(contributor, task), 20 - question);
    }
  }
  for (const [contributor, task] of pairs) {
    refused(limiter.ask(contributor, task));
  }
});

// Extends public: "the twentieth question is accepted at the final millisecond of the day".
test("[boundary-1] a partial allowance survives many time changes until its twentieth ask", () => {
  let now = "2029-06-30T00:00:00.000Z";
  const limiter = new QuestionLimiter(() => new Date(now));
  spend(limiter, 7, "late-finisher", "task-20");
  now = "2029-06-30T12:00:00.000Z";
  for (let used = 7; used < 19; used += 1) {
    accepted(limiter.ask("late-finisher", "task-20"), 19 - used);
  }
  now = "2029-06-30T23:59:59.998Z";
  assert.equal(limiter.remaining("late-finisher", "task-20"), 1);
  now = "2029-06-30T23:59:59.999Z";
  accepted(limiter.ask("late-finisher", "task-20"), 0);
  refused(limiter.ask("late-finisher", "task-20"));
});

// Extends public: "the twenty-first question is refused with the specified message".
test("[unhappy-1] all independently exhausted pairs return the exact refusal message", () => {
  const limiter = new QuestionLimiter(clock);
  for (const [contributor, task] of [
    ["message-user", "task-a"],
    ["message-user", "task-b"],
    ["other-user", "task-a"],
  ]) {
    spend(limiter, 20, contributor, task);
    refused(limiter.ask(contributor, task));
    assert.equal(limiter.remaining(contributor, task), 0);
  }
});

// Extends public: "repeated refused questions keep the remaining count at zero".
test("[unhappy-1] hundreds of refusals neither underflow nor replenish an exhausted pair", () => {
  const limiter = new QuestionLimiter(clock);
  spend(limiter, 20, "persistent", "exhausted");
  for (let attempt = 0; attempt < 257; attempt += 1) {
    refused(limiter.ask("persistent", "exhausted"));
    assert.equal(limiter.remaining("persistent", "exhausted"), 0);
    if (attempt < 12) {
      accepted(limiter.ask("persistent", "still-open"), 19 - attempt);
      assert.equal(limiter.remaining("persistent", "still-open"), 19 - attempt);
    }
  }
  assert.equal(limiter.remaining("persistent", "still-open"), 8);
});

// Extends public: "exhausting one pair leaves other tasks and contributors their full allowance".
test("[happy-3] a grid of contributors and tasks retains unequal balances in reverse read order", () => {
  const limiter = new QuestionLimiter(clock);
  const contributors = ["person-8", "person-19", "person-52", "person-104"];
  const tasks = ["task-7", "task-13", "task-29", "task-101", "task-317"];
  // All balances from zero through nineteen occur, including the exhausted pair.
  for (let round = 0; round < 20; round += 1) {
    for (let c = 0; c < contributors.length; c += 1) {
      for (let t = 0; t < tasks.length; t += 1) {
        const usage = 1 + c * tasks.length + t;
        if (round < usage) {
          accepted(limiter.ask(contributors[c], tasks[t]), 19 - round);
        }
      }
    }
  }
  for (let c = contributors.length - 1; c >= 0; c -= 1) {
    for (let t = tasks.length - 1; t >= 0; t -= 1) {
      assert.equal(limiter.remaining(contributors[c], tasks[t]), 19 - c * tasks.length - t);
    }
  }
  assert.equal(limiter.remaining("new-person", tasks[0]), 20);
  assert.equal(limiter.remaining(contributors[0], "new-task"), 20);
});

// Extends public: "distinct ID pairs with overlapping text have separate allowances".
test("[happy-3] delimiter collisions and reversed ID pairs retain separate counts", () => {
  const limiter = new QuestionLimiter(clock);
  const pairs = [
    ["left|middle", "right"], ["left", "middle|right"],
    ["left/middle", "right"], ["left", "middle/right"],
    ["left\u0000middle", "right"], ["left", "middle\u0000right"],
    ["left,middle", "right"], ["left", "middle,right"],
    ["left::middle", "right"], ["left", "middle::right"],
    ["same-a", "same-b"], ["same-b", "same-a"],
  ];
  for (let i = 0; i < pairs.length; i += 1) {
    spend(limiter, i + 1, pairs[i][0], pairs[i][1]);
  }
  for (let i = pairs.length - 1; i >= 0; i -= 1) {
    assert.equal(limiter.remaining(pairs[i][0], pairs[i][1]), 19 - i);
    accepted(limiter.ask(pairs[i][0], pairs[i][1]), 18 - i);
  }
});

// Extends public: "distinct ID pairs with overlapping text have separate allowances".
test("[happy-3] object property names and long non-ASCII IDs are ordinary independent IDs", () => {
  const limiter = new QuestionLimiter(clock);
  const longContributor = "contributor/问/".repeat(160);
  const longTask = "task/答/".repeat(180);
  const pairs = [
    ["__proto__", "constructor"],
    ["constructor", "__proto__"],
    ["toString", "hasOwnProperty"],
    ["hasOwnProperty", "toString"],
    [longContributor, longTask],
    [longContributor + "a", longTask],
    [longContributor, longTask + "a"],
  ];
  for (let i = 0; i < pairs.length; i += 1) {
    assert.equal(limiter.remaining(pairs[i][0], pairs[i][1]), 20);
    spend(limiter, 20 - i, pairs[i][0], pairs[i][1]);
  }
  for (let i = 0; i < pairs.length; i += 1) {
    assert.equal(limiter.remaining(pairs[i][0], pairs[i][1]), i);
  }
});
