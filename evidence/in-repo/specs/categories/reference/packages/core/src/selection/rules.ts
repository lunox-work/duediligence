/** Named signals composed into rules, and the evaluation that says why a rule matched. */

import type { IssueFacts } from "./facts.js";

/** A named test on facts, with a clause describing them. */
export interface Signal {
  readonly id: string;
  readonly test: (facts: IssueFacts) => boolean;
  readonly describe: (facts: IssueFacts) => string | null;
}

/** A signal, or every / any of a list of rules. */
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

/**
 * The same signal with the same id and test, but whose `describe` always
 * returns null. Leaves `signal` unchanged.
 */
export function silent(signal: Signal): Signal {
  return { id: signal.id, test: signal.test, describe: () => null };
}

/** Builds a signal from its id, test and describe, keeping the same function references. */
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

/**
 * Whether `rule` matches `facts`, appending the clauses of the signals that
 * made it match to `clauses`. `all` stops at its first miss; `any` tries
 * every child.
 */
function collect(rule: Rule, facts: IssueFacts, clauses: string[]): boolean {
  if ("all" in rule) {
    const own: string[] = [];
    for (const child of rule.all) {
      if (!collect(child, facts, own)) return false;
    }
    clauses.push(...own);
    return true;
  }
  if ("any" in rule) {
    let matched = false;
    for (const child of rule.any) {
      if (collect(child, facts, clauses)) matched = true;
    }
    return matched;
  }
  if (!rule.test(facts)) return false;
  const clause = rule.describe(facts);
  if (clause !== null) clauses.push(clause);
  return true;
}

/** Matches `rule` against `facts` and collects the clauses of the signals that made it match. */
export function evaluate(rule: Rule, facts: IssueFacts): Evaluation {
  const clauses: string[] = [];
  if (!collect(rule, facts, clauses)) return { matched: false, clauses: [] };
  return { matched: true, clauses: [...new Set(clauses)] };
}
