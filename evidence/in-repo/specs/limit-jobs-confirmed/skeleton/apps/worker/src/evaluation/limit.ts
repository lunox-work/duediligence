/**
 * A cap on how many evaluation jobs one worker runs at once (ticket #104).
 *
 * The wrapper only counts and queues: it never looks at a job's files,
 * commands or results, and it uses no clock, file system or process.
 */

import type { EvaluationProvider } from "sandbox-factory";

/** Evaluation jobs one worker runs at once. */
export const EVALUATION_JOBS_MAX = 2;

/**
 * At most `max` of a provider's jobs at once on this worker. Agent runs share
 * a worker three at a time, and a job is a whole install, build and test
 * run: past the cap, a job waits for one to be destroyed before it is
 * created, or for its run to stop.
 *
 * Never throws for any `max`. The returned provider's `create` rejects with
 * the inner `create`'s error, or with `signal.reason` when the signal aborts
 * before the call is admitted; a limited job's `destroy` rejects with the
 * inner `destroy`'s error.
 */
export function limitJobs(
  _provider: EvaluationProvider,
  _max: number,
): EvaluationProvider {
  throw new Error("not implemented");
}
