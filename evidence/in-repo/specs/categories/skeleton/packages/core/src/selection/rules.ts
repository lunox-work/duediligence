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
export function all(..._rules: Rule[]): Rule {
  throw new Error("not implemented");
}

/** A rule that matches when any one of `rules` matches: `{ any: rules }`. */
export function any(..._rules: Rule[]): Rule {
  throw new Error("not implemented");
}

/**
 * The same signal with the same id and test, but whose `describe` always
 * returns null. Leaves `signal` unchanged.
 */
export function silent(_signal: Signal): Signal {
  throw new Error("not implemented");
}

/** Builds a signal from its id, test and describe, keeping the same function references. */
export function signal(
  _id: string,
  _test: Signal["test"],
  _describe: Signal["describe"],
): Signal {
  throw new Error("not implemented");
}

/** Whether a rule matched, and the clauses of the signals that made it match. */
export interface Evaluation {
  readonly matched: boolean;
  readonly clauses: readonly string[];
}

/** Matches `rule` against `facts` and collects the clauses of the signals that made it match. */
export function evaluate(_rule: Rule, _facts: IssueFacts): Evaluation {
  throw new Error("not implemented");
}
