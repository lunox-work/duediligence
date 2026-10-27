/** The clock the caller supplies; it returns the current time. */
export type Clock = () => Date;

/** The result of asking a question: whether it was accepted, and how many questions remain today. */
export type AskResult =
  | { accepted: true; remaining: number }
  | { accepted: false; remaining: number; message: string };

/**
 * Limits questions per contributor per task per day. The limit is 20
 * questions, and a day runs from 00:00 UTC to the next 00:00 UTC.
 */
export class QuestionLimiter {
  /** Creates a limiter that reads the current time from `clock`. */
  constructor(clock: Clock) {
    throw new Error("not implemented");
  }

  /** Reads how many questions `contributorId` has left on `taskId` today; reading does not use a question. */
  remaining(contributorId: string, taskId: string): number {
    throw new Error("not implemented");
  }

  /**
   * Asks a question about `taskId` as `contributorId`. An accepted question
   * uses one from the allowance; once the limit is reached the question is
   * refused with a message.
   *
   * Throws if `contributorId` or `taskId` is empty; no allowance is used.
   */
  ask(contributorId: string, taskId: string): AskResult {
    throw new Error("not implemented");
  }
}
