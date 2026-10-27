import assert from "node:assert/strict";
import { test } from "node:test";

import {
  all,
  any,
  evaluate,
  signal,
  silent,
  votesAtLeast,
  type IssueFacts,
  type Rule,
  type Signal,
} from "../../src/selection/index.js";

/**
 * `all`, `any`, `silent`, `signal` and `evaluate` beyond the public examples:
 * deeper nesting, longer lists, and clauses from children that did not match.
 */

const BASE_FACTS: IssueFacts = {
  ageDays: 0,
  daysSinceUpdate: 0,
  assigned: false,
  inSprint: false,
  closedSprintCount: 0,
  carriedSince: null,
  votes: 0,
  watchers: 0,
  duplicateLinks: 0,
  blocksOpenCount: 0,
  commentCount: null,
  priorityName: null,
  priorityRank: "none",
  isBug: false,
  dueInDays: null,
  release: null,
};

// Plain values equal to signal("a", () => true, () => "alpha") and so on, so
// that loading this file does not depend on `signal`.
const A: Signal = { id: "a", test: () => true, describe: () => "alpha" };
const B: Signal = { id: "b", test: () => true, describe: () => "beta" };
const C: Signal = { id: "c", test: () => true, describe: () => "gamma" };
const N: Signal = { id: "n", test: () => false, describe: () => "never" };
const Q: Signal = { id: "q", test: () => true, describe: () => null };
/** A different signal whose clause is the same text as A's. */
const A2: Signal = { id: "a2", test: () => true, describe: () => "alpha" };

/** A signal whose test and describe throw if called. */
const T: Signal = {
  id: "t",
  test: () => {
    throw new Error("T.test must not be called");
  },
  describe: () => {
    throw new Error("T.describe must not be called");
  },
};

/** A copy of `base` whose test and describe count their calls. */
function counted(base: Signal): {
  signal: Signal;
  tests: () => number;
  describes: () => number;
} {
  let tests = 0;
  let describes = 0;
  return {
    signal: {
      id: base.id,
      test: (facts) => {
        tests += 1;
        return base.test(facts);
      },
      describe: (facts) => {
        describes += 1;
        return base.describe(facts);
      },
    },
    tests: () => tests,
    describes: () => describes,
  };
}

// Extends "[happy-5] signal keeps its function references, and all and any
// build plain values": other ids, more children and nested combinators.
test("[happy-5] all and any keep every child, in order, including nested combinators", () => {
  assert.deepEqual(all(A, B, N, Q, C), { all: [A, B, N, Q, C] });
  assert.deepEqual(any(C, Q, N, B, A), { any: [C, Q, N, B, A] });
  assert.deepEqual(any(all(A, N), any(B)), {
    any: [{ all: [A, N] }, { any: [B] }],
  });
  assert.deepEqual(all(any()), { all: [{ any: [] }] });
});

test("[happy-5] all and any of a single rule wrap it rather than returning it", () => {
  assert.deepEqual(all(A), { all: [A] });
  assert.deepEqual(any(N), { any: [N] });
  const built = all(B);
  assert.ok("all" in built);
  assert.equal(built.all[0], B);
});

test("[happy-5] signal keeps an arbitrary id and its function references, and the result evaluates", () => {
  const t = (facts: IssueFacts): boolean => facts.watchers >= 2;
  const d = (facts: IssueFacts): string | null =>
    facts.watchers > 3 ? null : `${facts.watchers} eyes`;
  const built = signal("watchers:custom:2", t, d);
  assert.equal(built.id, "watchers:custom:2");
  assert.equal(built.test, t);
  assert.equal(built.describe, d);
  assert.deepEqual(evaluate(built, { ...BASE_FACTS, watchers: 2 }), {
    matched: true,
    clauses: ["2 eyes"],
  });
  assert.deepEqual(evaluate(built, { ...BASE_FACTS, watchers: 1 }), {
    matched: false,
    clauses: [],
  });
});

// Extends "[happy-6] evaluate matches signals and combinators and collects
// their clauses in order": a child of any that fails contributes nothing, even
// when some of its own children matched.
test("[happy-6] a failed branch of any contributes no clauses even where its own children matched", () => {
  assert.deepEqual(evaluate(any(all(A, N), B), BASE_FACTS), {
    matched: true,
    clauses: ["beta"],
  });
  assert.deepEqual(evaluate(any(B, all(C, A, N)), BASE_FACTS), {
    matched: true,
    clauses: ["beta"],
  });
  assert.deepEqual(evaluate(any(all(A, N), all(B, N)), BASE_FACTS), {
    matched: false,
    clauses: [],
  });
});

test("[happy-6] a rule that fails deep inside gives no clauses at all", () => {
  assert.deepEqual(evaluate(all(A, B, any(N, all(C, N))), BASE_FACTS), {
    matched: false,
    clauses: [],
  });
  assert.deepEqual(evaluate(all(A, any(B, C), N), BASE_FACTS), {
    matched: false,
    clauses: [],
  });
});

test("[happy-6] clauses follow rule order through deep nesting", () => {
  assert.deepEqual(
    evaluate(all(C, any(N, B, all(A, Q)), any(N, any(N))), BASE_FACTS),
    { matched: false, clauses: [] },
  );
  assert.deepEqual(
    evaluate(all(C, any(N, B, all(A, Q)), any(N, any(Q))), BASE_FACTS),
    { matched: true, clauses: ["gamma", "beta", "alpha"] },
  );
  assert.deepEqual(evaluate(any(C, B, A), BASE_FACTS), {
    matched: true,
    clauses: ["gamma", "beta", "alpha"],
  });
});

test("[happy-6] duplicates keep their first position, including identical text from different signals", () => {
  assert.deepEqual(evaluate(all(B, A, B, C, A), BASE_FACTS), {
    matched: true,
    clauses: ["beta", "alpha", "gamma"],
  });
  assert.deepEqual(evaluate(all(A, A2), BASE_FACTS), {
    matched: true,
    clauses: ["alpha"],
  });
  assert.deepEqual(evaluate(any(all(C, A), any(A2, C)), BASE_FACTS), {
    matched: true,
    clauses: ["gamma", "alpha"],
  });
});

test("[happy-6] null clauses are dropped wherever they occur", () => {
  assert.deepEqual(evaluate(all(Q, A, Q, B, Q), BASE_FACTS), {
    matched: true,
    clauses: ["alpha", "beta"],
  });
  assert.deepEqual(evaluate(any(Q, silent(B)), BASE_FACTS), {
    matched: true,
    clauses: [],
  });
});

test("[happy-6] plain rule values evaluate the same as built ones", () => {
  const rule: Rule = { all: [A, { any: [N, B] }] };
  assert.deepEqual(evaluate(rule, BASE_FACTS), {
    matched: true,
    clauses: ["alpha", "beta"],
  });
});

test("[happy-6] evaluate passes the facts it is given to each signal", () => {
  const rule = all(votesAtLeast(2), signal("w", (f) => f.watchers === 4, (f) => `w${f.watchers}`));
  assert.deepEqual(evaluate(rule, { ...BASE_FACTS, votes: 2, watchers: 4 }), {
    matched: true,
    clauses: ["2 votes", "w4"],
  });
  assert.deepEqual(evaluate(rule, { ...BASE_FACTS, votes: 2, watchers: 3 }), {
    matched: false,
    clauses: [],
  });
});

// Extends "[boundary-10] empty combinators nest like every and some".
test("[boundary-10] empty combinators mixed with signals follow every and some", () => {
  assert.deepEqual(evaluate(all(all(), all()), BASE_FACTS), {
    matched: true,
    clauses: [],
  });
  assert.deepEqual(evaluate(any(any(), any()), BASE_FACTS), {
    matched: false,
    clauses: [],
  });
  assert.deepEqual(evaluate(all(A, all()), BASE_FACTS), {
    matched: true,
    clauses: ["alpha"],
  });
  assert.deepEqual(evaluate(any(any(), A), BASE_FACTS), {
    matched: true,
    clauses: ["alpha"],
  });
  assert.deepEqual(evaluate(all(A, any()), BASE_FACTS), {
    matched: false,
    clauses: [],
  });
  assert.deepEqual(evaluate(any(all(), N), BASE_FACTS), {
    matched: true,
    clauses: [],
  });
});

// Extends "[boundary-11] all stops at the first child that does not match":
// the failing child is not first, and the stop happens inside nesting.
test("[boundary-11] all stops at a failing child after matched ones, and at a failing nested combinator", () => {
  const a = counted(A);
  assert.deepEqual(evaluate(all(a.signal, N, T), BASE_FACTS), {
    matched: false,
    clauses: [],
  });
  assert.ok(a.tests() >= 1);
  assert.deepEqual(evaluate(all(any(), T), BASE_FACTS), {
    matched: false,
    clauses: [],
  });
  assert.deepEqual(evaluate(all(all(A, N), T, T), BASE_FACTS), {
    matched: false,
    clauses: [],
  });
});

test("[boundary-11] a short-circuited all inside any does not stop any's other children", () => {
  const b = counted(B);
  assert.deepEqual(evaluate(any(all(N, T), b.signal), BASE_FACTS), {
    matched: true,
    clauses: ["beta"],
  });
  assert.ok(b.tests() >= 1);
});

// Extends "[boundary-11] any evaluates every child even after one has matched":
// more children, and an any nested in all.
test("[boundary-11] any tests every one of many children after the first has matched", () => {
  const children = [counted(A), counted(N), counted(B), counted(Q), counted(C)];
  assert.deepEqual(
    evaluate(any(...children.map((child) => child.signal)), BASE_FACTS),
    { matched: true, clauses: ["alpha", "beta", "gamma"] },
  );
  for (const child of children) {
    assert.ok(child.tests() >= 1, child.signal.id);
  }
});

test("[boundary-11] an any nested in all tests all its children", () => {
  const b = counted(B);
  const c = counted(C);
  assert.deepEqual(evaluate(all(A, any(b.signal, c.signal)), BASE_FACTS), {
    matched: true,
    clauses: ["alpha", "beta", "gamma"],
  });
  assert.ok(b.tests() >= 1);
  assert.ok(c.tests() >= 1);
});

// Extends "[boundary-12] describe is not called for a signal whose test did
// not match": the unmatched signal sits inside all and deep in any.
test("[boundary-12] an unmatched signal is never described, wherever it sits", () => {
  const s1 = counted(N);
  assert.deepEqual(evaluate(all(A, s1.signal), BASE_FACTS), {
    matched: false,
    clauses: [],
  });
  assert.equal(s1.describes(), 0);

  const s2 = counted(N);
  const s3 = counted(N);
  assert.deepEqual(
    evaluate(any(all(B, any(s2.signal, C)), s3.signal), BASE_FACTS),
    { matched: true, clauses: ["beta", "gamma"] },
  );
  assert.ok(s2.tests() >= 1);
  assert.ok(s3.tests() >= 1);
  assert.equal(s2.describes(), 0);
  assert.equal(s3.describes(), 0);
});

test("[boundary-12] a test that depends on the facts gates describe on those facts", () => {
  let describeCalls = 0;
  const S = signal(
    "s",
    (f) => f.votes > 0,
    (f) => {
      describeCalls += 1;
      return `${f.votes}`;
    },
  );
  assert.deepEqual(evaluate(S, BASE_FACTS), { matched: false, clauses: [] });
  assert.equal(describeCalls, 0);
  assert.deepEqual(evaluate(S, { ...BASE_FACTS, votes: 2 }), {
    matched: true,
    clauses: ["2"],
  });
  assert.ok(describeCalls >= 1);
});

// Extends "[happy-7] silent keeps the id and test, never describes, and leaves
// the original alone": a factory signal, facts that would describe, and
// silencing twice.
test("[happy-7] silencing a factory signal keeps its id and test and describes nothing for any facts", () => {
  const original = votesAtLeast(3);
  const quiet = silent(original);
  assert.equal(quiet.id, "votes-at-least:3");
  assert.equal(quiet.test, original.test);
  for (const votes of [0, 3, 10]) {
    const facts = { ...BASE_FACTS, votes };
    assert.equal(quiet.describe(facts), null, String(votes));
    assert.equal(original.describe(facts), `${votes} votes`, String(votes));
  }
  assert.deepEqual(evaluate(quiet, { ...BASE_FACTS, votes: 5 }), {
    matched: true,
    clauses: [],
  });
  assert.equal(original.id, "votes-at-least:3");
});

test("[happy-7] silencing twice is still silent, and the silenced copy is a different signal", () => {
  const twice = silent(silent(B));
  assert.equal(twice.id, "b");
  assert.equal(twice.test, B.test);
  assert.equal(twice.describe(BASE_FACTS), null);
  assert.notEqual(silent(B), B);
  assert.equal(B.describe(BASE_FACTS), "beta");
  assert.deepEqual(evaluate(all(silent(A), B, silent(C)), BASE_FACTS), {
    matched: true,
    clauses: ["beta"],
  });
});

test("[happy-7] a silenced signal leaves the same clause from an unsilenced one in place", () => {
  assert.deepEqual(evaluate(all(silent(A), A2), BASE_FACTS), {
    matched: true,
    clauses: ["alpha"],
  });
  assert.deepEqual(evaluate(all(A, silent(A)), BASE_FACTS), {
    matched: true,
    clauses: ["alpha"],
  });
});
