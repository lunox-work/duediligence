/**
 * A cap on how many evaluation jobs one worker runs at once (ticket #104).
 *
 * The wrapper takes any evaluation provider and returns one that admits at
 * most `max` live jobs, queueing further `create` calls until a slot frees.
 * It only counts and queues: it never looks at a job's files, commands or
 * results, and it uses no clock, file system or process.
 */

import type { EvaluationProvider } from "sandbox-factory";

/** How many evaluation jobs one worker runs at once. */
export const EVALUATION_JOBS_MAX = 2;

/**
 * A provider that admits at most `max` live jobs of `provider` at once. A
 * job is live from the moment its `create` is admitted until the promise
 * returned by its `destroy()` settles; later `create` calls wait, first in
 * first out. Throws a `RangeError` unless `max` is a positive safe integer.
 */
export function limitJobs(
  _provider: EvaluationProvider,
  _max: number,
): EvaluationProvider {
  throw new Error("not implemented");
}
