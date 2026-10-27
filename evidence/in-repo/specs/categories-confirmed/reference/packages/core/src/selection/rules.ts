/** Composes named signals into rules and evaluates them against facts. */

import type { IssueFacts } from "./facts.js";

/** A named test on facts, with the clause that says why it matched. */
export interface Signal {
  readonly id: string;
  readonly test: (facts: IssueFacts) => boolean;
  readonly describe: (facts: IssueFacts) => string | null;
}

/** A signal, or every / any of several rules. */
export type Rule =
  | Signal
  | { readonly all: readonly Rule[] }
  | { readonly any: readonly Rule[] };

/** A rule that matches when every one of `rules` matches: `{ all: rules }`. */
export function all(...rules: Rule[]): Rule {
  return { all: rules };
}

/** A rule that matches when any one of `rules` matches: `{ any: rules }`. */
export function any(...rules: Rule[]): Rule {
  return { any: rules };
}

/** The same signal with the same id and test, but it never describes. */
export function silent(signal: Signal): Signal {
  return { id: signal.id, test: signal.test, describe: () => null };
}

/** Builds a signal from its id, test and describe. */
export function signal(
  id: string,
  test: Signal["test"],
  describe: Signal["describe"],
): Signal {
  return { id, test, describe };
}

/** Whether a rule matched, and the clauses of the signals that made it match. */
export interface Evaluation {
  readonly matched: boolean;
  readonly clauses: readonly string[];
}

const NO_MATCH: Evaluation = { matched: false, clauses: [] };

/** Matches `rule` against `facts` and collects the clauses of the signals that made it match. */
export function evaluate(rule: Rule, facts: IssueFacts): Evaluation {
  if ("all" in rule) {
    // Every child is evaluated, even after one fails.
    const results = rule.all.map((child) => evaluate(child, facts));
    if (!results.every((result) => result.matched)) return NO_MATCH;
    return { matched: true, clauses: results.flatMap((r) => r.clauses) };
  }
  if ("any" in rule) {
    const matches = rule.any
      .map((child) => evaluate(child, facts))
      .filter((result) => result.matched);
    if (matches.length === 0) return NO_MATCH;
    return { matched: true, clauses: matches.flatMap((r) => r.clauses) };
  }
  if (!rule.test(facts)) return NO_MATCH;
  const clause = rule.describe(facts);
  return { matched: true, clauses: clause === null ? [] : [clause] };
}
