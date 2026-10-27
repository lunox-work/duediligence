/**
 * The store a counter is created over, supplied by the caller. Its calls may
 * take any time to resolve, and `set` may reject.
 */
export interface UsageStore {
  /** Resolves to the saved value for `key`, or `undefined` if none is saved. */
  get(key: string): Promise<unknown>;
  /** Saves `value` under `key`. May reject. */
  set(key: string, value: unknown): Promise<void>;
}

/**
 * The tokens and cost one model call reports: a task id, a contributor id,
 * input tokens, output tokens and a cost in micro-dollars, each count a whole
 * number of at least 0.
 */
export interface UsageReport {
  taskId: string;
  contributorId: string;
  inputTokens: number;
  outputTokens: number;
  costMicroDollars: number;
}

/**
 * Exact summed totals of input tokens, output tokens and cost in
 * micro-dollars. A task or contributor with no reports totals 0 for each.
 */
export interface UsageTotals {
  inputTokens: bigint;
  outputTokens: bigint;
  costMicroDollars: bigint;
}

/**
 * Counts token usage per task and per contributor on that task, over a store
 * the caller supplies. A new counter over the same store sees the totals
 * already counted.
 */
export class UsageCounter {
  /** Creates a counter over `store`. */
  constructor(store: UsageStore) {
    throw new Error("not implemented");
  }

  /**
   * Adds `report` to its task's total and to its contributor's total on that
   * task. Reports may overlap; reports on different tasks do not wait for
   * each other. Resolves only once the totals are saved.
   *
   * Rejects with an error, changing no total, if the report has an empty
   * task or contributor id, or a count that is negative, fractional or not a
   * number. Rejects with the store's error, counting nothing, if the store's
   * `set` rejects.
   */
  async report(report: UsageReport): Promise<void> {
    throw new Error("not implemented");
  }

  /** Resolves to the totals of task `taskId`. */
  async taskTotals(taskId: string): Promise<UsageTotals> {
    throw new Error("not implemented");
  }

  /** Resolves to the totals of contributor `contributorId` on task `taskId`. */
  async contributorTotals(taskId: string, contributorId: string): Promise<UsageTotals> {
    throw new Error("not implemented");
  }
}
