/**
 * A cap on how many evaluation jobs one worker runs at once (ticket #104).
 *
 * The wrapper takes any evaluation provider and returns one that admits at
 * most `max` live jobs, queueing further `create` calls until a slot frees.
 * It only counts and queues: it never looks at a job's files, commands or
 * results, and it uses no clock, file system or process.
 */

import type { EvaluationJob, EvaluationProvider } from "sandbox-factory";

/** How many evaluation jobs one worker runs at once. */
export const EVALUATION_JOBS_MAX = 2;

/**
 * A provider that admits at most `max` live jobs of `provider` at once. A
 * job is live from the moment its `create` is admitted until the promise
 * returned by its `destroy()` settles; later `create` calls wait, first in
 * first out. Throws a `RangeError` unless `max` is a positive safe integer.
 */
export function limitJobs(
  provider: EvaluationProvider,
  max: number,
): EvaluationProvider {
  if (!Number.isSafeInteger(max) || max < 1)
    throw new RangeError(
      `A job limit must be a positive whole number, not ${max}.`,
    );
  let live = 0;
  // Each waiter is admitted by being handed a slot; it never counts itself.
  const waiting: (() => void)[] = [];
  /*
    A freed slot goes straight to the oldest waiter, so the count never
    drops while anyone waits and a later create cannot take it first.
  */
  const release = () => {
    const next = waiting.shift();
    if (next === undefined) live -= 1;
    else next();
  };
  const wrap = (job: EvaluationJob): EvaluationJob => {
    let freed = false;
    const free = () => {
      if (freed) return;
      freed = true;
      release();
    };
    return {
      id: job.id,
      environment: job.environment,
      stage: (files) => job.stage(files),
      exec: (command) => job.exec(command),
      read: (path) => job.read(path),
      destroy: () =>
        job.destroy().then(
          (value) => {
            free();
            return value;
          },
          (error: unknown) => {
            free();
            throw error;
          },
        ),
    };
  };
  // Called once a slot is held; a failed create gives it back at once.
  const admitted = (spec: Parameters<EvaluationProvider["create"]>[0]) => {
    let created: Promise<EvaluationJob>;
    try {
      created = Promise.resolve(provider.create(spec));
    } catch (error) {
      created = Promise.reject(error);
    }
    return created.then(wrap, (error: unknown) => {
      release();
      throw error;
    });
  };
  return {
    name: provider.name,
    create(spec) {
      const { signal } = spec;
      if (signal.aborted) return Promise.reject(signal.reason);
      if (live < max && waiting.length === 0) {
        live += 1;
        return admitted(spec);
      }
      return new Promise<EvaluationJob>((resolve, reject) => {
        const admit = () => {
          signal.removeEventListener("abort", abort);
          resolve(admitted(spec));
        };
        const abort = () => {
          const index = waiting.indexOf(admit);
          if (index !== -1) waiting.splice(index, 1);
          reject(signal.reason);
        };
        signal.addEventListener("abort", abort, { once: true });
        waiting.push(admit);
      });
    },
  };
}
