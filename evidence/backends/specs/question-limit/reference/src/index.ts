/** The clock the caller supplies; it returns the current time. */
export type Clock = () => Date;

/** The result of asking a question: whether it was accepted, and how many questions remain today. */
export type AskResult =
  | { accepted: true; remaining: number }
  | { accepted: false; remaining: number; message: string };

const DAILY_LIMIT = 20;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LIMIT_MESSAGE = `Daily limit of ${DAILY_LIMIT} questions reached for this task. It resets at 00:00 UTC.`;

/** Questions one contributor has asked about one task on one UTC day. */
interface Usage {
  day: number;
  count: number;
}

/**
 * Limits questions per contributor per task per day. The limit is 20
 * questions, and a day runs from 00:00 UTC to the next 00:00 UTC.
 */
export class QuestionLimiter {
  readonly #clock: Clock;
  /** Usage keyed by contributor id, then task id; nested maps keep every pair of ids distinct. */
  readonly #usage = new Map<string, Map<string, Usage>>();

  /** Creates a limiter that reads the current time from `clock`. */
  constructor(clock: Clock) {
    this.#clock = clock;
  }

  /** Reads how many questions `contributorId` has left on `taskId` today; reading does not use a question. */
  remaining(contributorId: string, taskId: string): number {
    return DAILY_LIMIT - this.#usedToday(contributorId, taskId, this.#today());
  }

  /**
   * Asks a question about `taskId` as `contributorId`. An accepted question
   * uses one from the allowance; once the limit is reached the question is
   * refused with a message.
   *
   * Throws if `contributorId` or `taskId` is empty; no allowance is used.
   */
  ask(contributorId: string, taskId: string): AskResult {
    if (contributorId === "") throw new Error("A question needs a contributor id.");
    if (taskId === "") throw new Error("A question needs a task id.");

    const today = this.#today();
    const used = this.#usedToday(contributorId, taskId, today);
    if (used >= DAILY_LIMIT) {
      return { accepted: false, remaining: 0, message: LIMIT_MESSAGE };
    }

    let byTask = this.#usage.get(contributorId);
    if (byTask === undefined) {
      byTask = new Map();
      this.#usage.set(contributorId, byTask);
    }
    byTask.set(taskId, { day: today, count: used + 1 });
    return { accepted: true, remaining: DAILY_LIMIT - (used + 1) };
  }

  /** The current UTC day, as whole days since the Unix epoch. */
  #today(): number {
    return Math.floor(this.#clock().getTime() / MS_PER_DAY);
  }

  #usedToday(contributorId: string, taskId: string, today: number): number {
    const usage = this.#usage.get(contributorId)?.get(taskId);
    return usage !== undefined && usage.day === today ? usage.count : 0;
  }
}
