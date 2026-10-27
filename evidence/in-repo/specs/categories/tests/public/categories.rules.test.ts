import assert from "node:assert/strict";
import { test } from "node:test";

import {
  all,
  any,
  evaluate,
  signal,
  silent,
  type IssueFacts,
  type Signal,
} from "../src/selection/index.js";

/**
 * Rules compose named signals with `all` and `any`; `evaluate` says whether a
 * rule matched and collects the clauses of the signals that made it match.
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
const N: Signal = { id: "n", test: () => false, describe: () => "never" };
const Q: Signal = { id: "q", test: () => true, describe: () => null };

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

test("[happy-5] signal keeps its function references, and all and any build plain values", () => {
  const t = (facts: IssueFacts): boolean => facts.votes > 0;
  const d = (facts: IssueFacts): string => `${facts.votes} votes`;
  const built = signal("a", t, d);
  assert.equal(built.id, "a");
  assert.equal(built.test, t);
  assert.equal(built.describe, d);
  assert.deepEqual(all(A, B), { all: [A, B] });
  assert.deepEqual(any(A, N), { any: [A, N] });
});

test("[happy-5] all and any with no rules build empty lists", () => {
  assert.deepEqual(all(), { all: [] });
  assert.deepEqual(any(), { any: [] });
});

test("[happy-6] evaluate matches signals and combinators and collects their clauses in order", () => {
  assert.deepEqual(evaluate(A, BASE_FACTS), {
    matched: true,
    clauses: ["alpha"],
  });
  assert.deepEqual(evaluate(N, BASE_FACTS), { matched: false, clauses: [] });
  assert.deepEqual(evaluate(all(A, B), BASE_FACTS), {
    matched: true,
    clauses: ["alpha", "beta"],
  });
  assert.deepEqual(evaluate(all(A, N), BASE_FACTS), {
    matched: false,
    clauses: [],
  });
  assert.deepEqual(evaluate(any(N, A, B), BASE_FACTS), {
    matched: true,
    clauses: ["alpha", "beta"],
  });
  assert.deepEqual(evaluate(any(N), BASE_FACTS), {
    matched: false,
    clauses: [],
  });
  assert.deepEqual(evaluate(all(A, any(N, B)), BASE_FACTS), {
    matched: true,
    clauses: ["alpha", "beta"],
  });
});

test("[happy-6] evaluate drops null and duplicate clauses", () => {
  assert.deepEqual(evaluate(Q, BASE_FACTS), { matched: true, clauses: [] });
  assert.deepEqual(evaluate(silent(A), BASE_FACTS), {
    matched: true,
    clauses: [],
  });
  assert.deepEqual(evaluate(all(A, A), BASE_FACTS), {
    matched: true,
    clauses: ["alpha"],
  });
  assert.deepEqual(evaluate(any(A, all(B, A)), BASE_FACTS), {
    matched: true,
    clauses: ["alpha", "beta"],
  });
});

test("[boundary-10] an empty all matches and an empty any does not", () => {
  assert.deepEqual(evaluate(all(), BASE_FACTS), {
    matched: true,
    clauses: [],
  });
  assert.deepEqual(evaluate(any(), BASE_FACTS), {
    matched: false,
    clauses: [],
  });
});

test("[boundary-10] empty combinators nest like every and some", () => {
  assert.deepEqual(evaluate(any(all()), BASE_FACTS), {
    matched: true,
    clauses: [],
  });
  assert.deepEqual(evaluate(all(any()), BASE_FACTS), {
    matched: false,
    clauses: [],
  });
});

test("[boundary-11] all stops at the first child that does not match", () => {
  assert.deepEqual(evaluate(all(N, T), BASE_FACTS), {
    matched: false,
    clauses: [],
  });
});

test("[boundary-11] any evaluates every child even after one has matched", () => {
  const a = counted(A);
  const b = counted(B);
  assert.deepEqual(evaluate(any(a.signal, b.signal), BASE_FACTS), {
    matched: true,
    clauses: ["alpha", "beta"],
  });
  assert.equal(a.tests(), 1);
  assert.equal(b.tests(), 1);
});

test("[boundary-12] describe is not called for a signal whose test did not match", () => {
  let describeCalls = 0;
  const S = signal(
    "s",
    () => false,
    () => {
      describeCalls += 1;
      return "should not appear";
    },
  );
  assert.deepEqual(evaluate(S, BASE_FACTS), { matched: false, clauses: [] });
  assert.equal(describeCalls, 0);
});

test("[boundary-12] inside any, an unmatched signal is not described while a matched sibling is", () => {
  const s = counted(N);
  const a = counted(A);
  assert.deepEqual(evaluate(any(s.signal, a.signal), BASE_FACTS), {
    matched: true,
    clauses: ["alpha"],
  });
  assert.equal(s.tests(), 1);
  assert.equal(s.describes(), 0);
  assert.equal(a.describes(), 1);
});

test("[happy-7] silent keeps the id and test, never describes, and leaves the original alone", () => {
  const S2 = silent(A);
  assert.equal(S2.id, "a");
  assert.equal(S2.test, A.test);
  assert.equal(S2.describe(BASE_FACTS), null);
  assert.equal(A.describe(BASE_FACTS), "alpha");
});

test("[happy-7] a silenced signal that does not match still does not match", () => {
  const S2 = silent(N);
  assert.equal(S2.id, "n");
  assert.equal(S2.test, N.test);
  assert.deepEqual(evaluate(S2, BASE_FACTS), { matched: false, clauses: [] });
  assert.deepEqual(evaluate(all(silent(N), A), BASE_FACTS), {
    matched: false,
    clauses: [],
  });
  assert.equal(N.describe(BASE_FACTS), "never");
});
