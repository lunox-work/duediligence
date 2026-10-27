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
  private readonly store: UsageStore;
  /** The tail of each task's queue of reports, while it has any in flight. */
  private readonly queues = new Map<string, Promise<void>>();

  /** Creates a counter over `store`. */
  constructor(store: UsageStore) {
    this.store = store;
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
    const { taskId, contributorId, added } = validate(report);
    // A task's totals and its contributors' totals are saved under one key in
    // one `set`, so a report counts fully or not at all. Reports on the same
    // task run one after another, so none reads totals another is changing.
    return this.onTask(taskId, async () => {
      const record = decodeRecord(await this.store.get(taskKey(taskId)));
      record.task = add(record.task, added);
      record.contributors.set(contributorId, add(record.contributors.get(contributorId) ?? ZERO, added));
      await this.store.set(taskKey(taskId), encodeRecord(record));
    });
  }

  /** Resolves to the totals of task `taskId`. */
  async taskTotals(taskId: string): Promise<UsageTotals> {
    const record = decodeRecord(await this.store.get(taskKey(taskId)));
    return { ...record.task };
  }

  /** Resolves to the totals of contributor `contributorId` on task `taskId`. */
  async contributorTotals(taskId: string, contributorId: string): Promise<UsageTotals> {
    const record = decodeRecord(await this.store.get(taskKey(taskId)));
    return { ...(record.contributors.get(contributorId) ?? ZERO) };
  }

  /** Runs `work` once every earlier piece of work on `taskId` has settled. */
  private onTask(taskId: string, work: () => Promise<void>): Promise<void> {
    const previous = this.queues.get(taskId) ?? Promise.resolve();
    const result = previous.then(work);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.queues.set(taskId, tail);
    void tail.then(() => {
      if (this.queues.get(taskId) === tail) this.queues.delete(taskId);
    });
    return result;
  }
}

const ZERO: UsageTotals = { inputTokens: 0n, outputTokens: 0n, costMicroDollars: 0n };

const COUNTS = ["inputTokens", "outputTokens", "costMicroDollars"] as const;

/** A task's totals and its contributors' totals on it, as saved under one key. */
interface TaskRecord {
  task: UsageTotals;
  contributors: Map<string, UsageTotals>;
}

/**
 * The saved form of a `TaskRecord`: counts as decimal strings, so any store
 * that keeps JSON keeps them exact, and contributors as `[id, input, output,
 * cost]` entries, so no id can clash with an object property.
 */
interface SavedRecord {
  task: [string, string, string];
  contributors: Array<[string, string, string, string]>;
}

function taskKey(taskId: string): string {
  return `usage-task:${taskId}`;
}

function validate(report: UsageReport): { taskId: string; contributorId: string; added: UsageTotals } {
  if (typeof report !== "object" || report === null) {
    throw new TypeError("a usage report must be an object");
  }
  const { taskId, contributorId } = report;
  if (typeof taskId !== "string" || taskId.length === 0) {
    throw new TypeError("a usage report needs a non-empty task id");
  }
  if (typeof contributorId !== "string" || contributorId.length === 0) {
    throw new TypeError("a usage report needs a non-empty contributor id");
  }
  const added = { ...ZERO };
  for (const field of COUNTS) {
    const value: unknown = report[field];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw new RangeError(`${field} must be a whole number of at least 0, got ${String(value)}`);
    }
    added[field] = BigInt(value);
  }
  return { taskId, contributorId, added };
}

function add(a: UsageTotals, b: UsageTotals): UsageTotals {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    costMicroDollars: a.costMicroDollars + b.costMicroDollars,
  };
}

function encodeTotals(t: UsageTotals): [string, string, string] {
  return [t.inputTokens.toString(), t.outputTokens.toString(), t.costMicroDollars.toString()];
}

function decodeTotals(input: unknown, output: unknown, cost: unknown): UsageTotals {
  return { inputTokens: decodeCount(input), outputTokens: decodeCount(output), costMicroDollars: decodeCount(cost) };
}

function decodeCount(value: unknown): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error("saved usage totals are malformed");
  }
  return BigInt(value);
}

function encodeRecord(record: TaskRecord): SavedRecord {
  return {
    task: encodeTotals(record.task),
    contributors: [...record.contributors].map(([id, t]) => [id, ...encodeTotals(t)]),
  };
}

function decodeRecord(saved: unknown): TaskRecord {
  if (saved === undefined) return { task: { ...ZERO }, contributors: new Map() };
  const s = saved as Partial<SavedRecord> | null;
  if (typeof s !== "object" || s === null || !Array.isArray(s.task) || !Array.isArray(s.contributors)) {
    throw new Error("saved usage totals are malformed");
  }
  const contributors = new Map<string, UsageTotals>();
  for (const entry of s.contributors) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") {
      throw new Error("saved usage totals are malformed");
    }
    contributors.set(entry[0], decodeTotals(entry[1], entry[2], entry[3]));
  }
  return { task: decodeTotals(s.task[0], s.task[1], s.task[2]), contributors };
}
