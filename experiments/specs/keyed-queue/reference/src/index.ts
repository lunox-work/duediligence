/**
 * A job: a function that returns a promise. It has started once it has been
 * called, and has settled once the promise it returned has settled.
 */
export type Job<T> = () => Promise<T>;

/** A submission that has not started yet. */
interface Entry {
  key: string;
  job: Job<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  /** Detaches the abort listener, if any. */
  detach: () => void;
}

/**
 * A queue that runs jobs serially per key and in parallel across keys, with
 * at most `cap` jobs running at once.
 */
export class KeyedQueue {
  private readonly cap: number;
  /** Jobs not yet started, in submission order. */
  private readonly queue: Entry[] = [];
  /** Keys with a job running. */
  private readonly busy = new Set<string>();
  private active = 0;
  private idleWaiters: Array<() => void> = [];
  private pumping = false;

  /**
   * Creates a queue with a cap, the most jobs that may run at once.
   * Throws an error if `cap` is not a positive whole number.
   */
  constructor(cap: number) {
    if (typeof cap !== "number" || !Number.isInteger(cap) || cap <= 0) {
      throw new RangeError(`cap must be a positive whole number, got ${String(cap)}`);
    }
    this.cap = cap;
  }

  /**
   * Submits a job with a key and an optional abort signal. Returns a promise
   * that settles as the job's promise settles; rejects with the thrown error
   * if the job throws synchronously. Rejects with the signal's reason if the
   * signal is already aborted at submission, or is aborted before the job has
   * started, and the job's function is then never called.
   */
  submit<T>(key: string, job: Job<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);

    return new Promise<T>((resolve, reject) => {
      const entry: Entry = {
        key,
        job,
        resolve: resolve as (value: unknown) => void,
        reject,
        detach: () => {},
      };
      if (signal) {
        const onAbort = () => {
          const index = this.queue.indexOf(entry);
          if (index === -1) return;
          this.queue.splice(index, 1);
          reject(signal.reason);
          this.checkIdle();
        };
        signal.addEventListener("abort", onAbort, { once: true });
        entry.detach = () => signal.removeEventListener("abort", onAbort);
      }
      this.queue.push(entry);
      this.pump();
    });
  }

  /** The number of jobs running. */
  get running(): number {
    return this.active;
  }

  /** The number of jobs waiting. */
  get waiting(): number {
    return this.queue.length;
  }

  /**
   * A promise that the queue is idle: resolves once nothing is running or
   * waiting; already resolved on a queue with nothing running or waiting.
   */
  onIdle(): Promise<void> {
    if (this.isIdle()) return Promise.resolve();
    return new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }

  private isIdle(): boolean {
    return this.active === 0 && this.queue.length === 0;
  }

  private checkIdle(): void {
    if (!this.isIdle()) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  /** Starts, in submission order, every waiting job whose key is free while a slot is free. */
  private pump(): void {
    if (this.pumping) return;
    this.pumping = true;
    try {
      let index = 0;
      while (this.active < this.cap && index < this.queue.length) {
        const entry = this.queue[index];
        if (this.busy.has(entry.key)) {
          index++;
          continue;
        }
        this.queue.splice(index, 1);
        // A job started synchronously may submit more; rescan from the start.
        this.start(entry);
        index = 0;
      }
    } finally {
      this.pumping = false;
    }
  }

  private start(entry: Entry): void {
    entry.detach();
    this.active++;
    this.busy.add(entry.key);

    let result: Promise<unknown>;
    try {
      result = Promise.resolve(entry.job());
    } catch (error) {
      result = Promise.reject(error);
    }

    result.then(
      (value) => {
        this.finish(entry.key);
        entry.resolve(value);
      },
      (error: unknown) => {
        this.finish(entry.key);
        entry.reject(error);
      },
    );
  }

  private finish(key: string): void {
    this.active--;
    this.busy.delete(key);
    this.pump();
    this.checkIdle();
  }
}
