/**
 * A cap on how many evaluation jobs one worker runs at once (ticket #104).
 *
 * The wrapper only counts and queues: it never looks at a job's files,
 * commands or results, and it uses no clock, file system or process.
 */

import type { EvaluationJob, EvaluationProvider } from "sandbox-factory";

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
  provider: EvaluationProvider,
  max: number,
): EvaluationProvider {
  let live = 0;
  /** Creates waiting for a slot, oldest first; each is admitted by `admit`. */
  const waiting: { admit(): void }[] = [];

  // A freed slot goes straight to the oldest waiter, so a later create
  // cannot see it as free.
  const release = () => {
    const next = waiting.shift();
    if (next === undefined) live -= 1;
    else next.admit();
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
      destroy: () => {
        let destroyed: Promise<void>;
        try {
          destroyed = job.destroy();
        } catch (error) {
          free();
          return Promise.reject(error);
        }
        return destroyed.then(
          (value) => {
            free();
            return value;
          },
          (error: unknown) => {
            free();
            throw error;
          },
        );
      },
    };
  };

  /** Calls the inner create for a call that holds a slot. */
  const start = (spec: Parameters<EvaluationProvider["create"]>[0]) => {
    let created: Promise<EvaluationJob>;
    try {
      created = provider.create(spec);
    } catch (error) {
      release();
      return Promise.reject(error);
    }
    return created.then(wrap, (error: unknown) => {
      release();
      throw error;
    });
  };

  return {
    name: provider.name,
    create: (spec) => {
      if (live < max && waiting.length === 0) {
        live += 1;
        return start(spec);
      }
      const { signal } = spec;
      if (signal.aborted) return Promise.reject(signal.reason);
      return new Promise<EvaluationJob>((resolve, reject) => {
        const waiter = {
          admit: () => {
            signal.removeEventListener("abort", onAbort);
            resolve(start(spec));
          },
        };
        const onAbort = () => {
          waiting.splice(waiting.indexOf(waiter), 1);
          reject(signal.reason);
        };
        signal.addEventListener("abort", onAbort, { once: true });
        waiting.push(waiter);
      });
    },
  };
}
