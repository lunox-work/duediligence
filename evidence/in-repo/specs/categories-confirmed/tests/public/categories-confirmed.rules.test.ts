import assert from "node:assert/strict";
import { test } from "node:test";

import {
  all,
  any,
  evaluate,
  signal,
  silent,
  type IssueFacts,
  type Rule,
} from "../src/selection/index.js";

/**
 * `evaluate` matches a rule and collects the clauses of the signals that
 * made it match; `signal`, `all`, `any` and `silent` build the rules.
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

function background() {
  return {
    A: signal("a", () => true, () => "alpha"),
    B: signal("b", () => true, () => "beta"),
    N: signal("n", () => false, () => "never"),
    Q: signal("q", () => true, () => null),
  };
}

test("[happy-5] signal, all and any build plain values", () => {
  const { A, B, N } = background();
  const t = () => true;
  const d = () => "described";
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

test("[happy-6] matching rules collect their clauses in rule order", () => {
  const { A, B, N } = background();
  const examples: [string, Rule, string[]][] = [
    ["A", A, ["alpha"]],
    ["all(A, B)", all(A, B), ["alpha", "beta"]],
    ["any(N, A, B)", any(N, A, B), ["alpha", "beta"]],
    ["all(A, any(N, B))", all(A, any(N, B)), ["alpha", "beta"]],
  ];
  for (const [name, rule, clauses] of examples) {
    assert.deepEqual(
      evaluate(rule, BASE_FACTS),
      { matched: true, clauses },
      name,
    );
  }
});

test("[happy-6] clauses drop nulls and silent signals, keep duplicates, and are empty without a match", () => {
  const { A, B, N, Q } = background();
  const examples: [string, Rule, boolean, string[]][] = [
    ["N", N, false, []],
    ["Q", Q, true, []],
    ["silent(A)", silent(A), true, []],
    ["all(A, N)", all(A, N), false, []],
    ["any(N)", any(N), false, []],
    ["all(A, A)", all(A, A), true, ["alpha", "alpha"]],
    ["any(A, all(B, A))", any(A, all(B, A)), true, ["alpha", "beta", "alpha"]],
  ];
  for (const [name, rule, matched, clauses] of examples) {
    assert.deepEqual(evaluate(rule, BASE_FACTS), { matched, clauses }, name);
  }
});

test("[boundary-10] empty combinators follow every and some", () => {
  assert.deepEqual(evaluate(all(), BASE_FACTS), {
    matched: true,
    clauses: [],
  });
  assert.deepEqual(evaluate(any(), BASE_FACTS), {
    matched: false,
    clauses: [],
  });
});

test("[boundary-11] all and any evaluate every child", () => {
  const { N } = background();
  let tCalls = 0;
  const T = signal(
    "t",
    () => {
      tCalls += 1;
      return false;
    },
    () => "t",
  );
  assert.deepEqual(evaluate(all(N, T), BASE_FACTS), {
    matched: false,
    clauses: [],
  });
  assert.equal(tCalls, 1);

  let aCalls = 0;
  let bCalls = 0;
  const A = signal(
    "a",
    () => {
      aCalls += 1;
      return true;
    },
    () => "alpha",
  );
  const B = signal(
    "b",
    () => {
      bCalls += 1;
      return true;
    },
    () => "beta",
  );
  evaluate(any(A, B), BASE_FACTS);
  assert.equal(aCalls, 1);
  assert.equal(bCalls, 1);
});

test("[boundary-12] describe runs only for a signal whose test matched", () => {
  let describeCalls = 0;
  const S = signal(
    "s",
    () => false,
    () => {
      describeCalls += 1;
      return "s";
    },
  );
  evaluate(S, BASE_FACTS);
  assert.equal(describeCalls, 0);
});

test("[happy-7] silent keeps the id and test but never describes, and leaves the original alone", () => {
  const { A } = background();
  const S2 = silent(A);
  assert.equal(S2.id, "a");
  assert.equal(S2.test, A.test);
  assert.equal(S2.describe(BASE_FACTS), null);
  assert.equal(A.describe(BASE_FACTS), "alpha");
});

test("[happy-7] a silent signal whose test fails still fails", () => {
  const { N } = background();
  const S2 = silent(N);
  assert.equal(S2.id, "n");
  assert.equal(S2.test, N.test);
  assert.deepEqual(evaluate(S2, BASE_FACTS), { matched: false, clauses: [] });
  assert.deepEqual(evaluate(all(S2), BASE_FACTS), {
    matched: false,
    clauses: [],
  });
});
