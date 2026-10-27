/**
 * Recent Jira reads: a bounded, time-limited memo.
 *
 * A small in-memory store of recent reads keyed by string, where each entry
 * expires a fixed time after it was written, so callers re-read Jira at most
 * once per `ttlMs` per key. Nothing here performs a Jira read, and time comes
 * only from the `now` option.
 */

/** How long a recent issue read is reused: one minute. */
export const RECENT_JIRA_READ_MS = 60000;

/** Default bound on the number of entries one store holds. */
export const RECENT_JIRA_READS_MAX = 1000;

/**
 * A store of recent reads: hands back a value written less than `ttlMs` ago,
 * and forgets values once they are older.
 */
export interface RecentReads<T> {
  /** The value written under `key` less than `ttlMs` ago, or `undefined` on a miss. */
  get(key: string): T | undefined;
  /** Writes `value` under `key`, replacing any value and restarting its ttl from `now()`. */
  set(key: string, value: T): void;
}

/**
 * A new, independent store of recent reads.
 *
 * `ttlMs` defaults to `RECENT_JIRA_READ_MS`, `now` to `Date.now` (epoch
 * milliseconds) and `max` to `RECENT_JIRA_READS_MAX`; an option passed as
 * `undefined` takes its default.
 *
 * Throws a `RangeError` with message `ttlMs must be a positive finite number`
 * when `ttlMs` is not a finite number greater than 0, or
 * `max must be a positive integer` when `max` is not an integer of at least 1.
 * When both are invalid, the `ttlMs` error is thrown.
 */
export function recentReads<T>(
  _options: {
    ttlMs?: number;
    now?: () => number;
    max?: number;
  } = {},
): RecentReads<T> {
  throw new Error("not implemented");
}

/**
 * The store key for one issue read: `[organizationId, connectionId, issueId]`
 * joined with newlines, as `sharedCredential` builds its key. No validation.
 */
export function issueKey(
  _organizationId: string,
  _connectionId: string,
  _issueId: string,
): string {
  throw new Error("not implemented");
}
