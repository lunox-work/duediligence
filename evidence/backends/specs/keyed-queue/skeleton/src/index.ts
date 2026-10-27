/**
 * A job: a function that returns a promise. It has started once it has been
 * called, and has settled once the promise it returned has settled.
 */
export type Job<T> = () => Promise<T>;

/**
 * A queue that runs jobs serially per key and in parallel across keys, with
 * at most `cap` jobs running at once.
 */
export class KeyedQueue {
  /**
   * Creates a queue with a cap, the most jobs that may run at once.
   * Throws an error if `cap` is not a positive whole number.
   */
  constructor(cap: number) {
    throw new Error("not implemented");
  }

  /**
   * Submits a job with a key and an optional abort signal. Returns a promise
   * that settles as the job's promise settles; rejects with the thrown error
   * if the job throws synchronously. Rejects with the signal's reason if the
   * signal is already aborted at submission, or is aborted before the job has
   * started, and the job's function is then never called.
   */
  submit<T>(key: string, job: Job<T>, signal?: AbortSignal): Promise<T> {
    throw new Error("not implemented");
  }

  /** The number of jobs running. */
  get running(): number {
    throw new Error("not implemented");
  }

  /** The number of jobs waiting. */
  get waiting(): number {
    throw new Error("not implemented");
  }

  /**
   * A promise that the queue is idle: resolves once nothing is running or
   * waiting; already resolved on a queue with nothing running or waiting.
   */
  onIdle(): Promise<void> {
    throw new Error("not implemented");
  }
}
