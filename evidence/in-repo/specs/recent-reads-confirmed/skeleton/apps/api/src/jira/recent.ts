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

/**
 * A store of recent reads. `get` returns a value written less than `ttlMs`
 * ago, or `undefined` for a miss; `set` replaces the value and restarts the
 * entry's ttl from the current time.
 */
export interface RecentReads<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
}

/**
 * Creates an independent store of recent reads.
 *
 * `ttlMs` defaults to `RECENT_JIRA_READ_MS`, `now` to `Date.now` (epoch
 * milliseconds) and `max` to 1000 entries. Options are used as given, without
 * validation; this never throws.
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
 * The key for an issue read: its three parts joined with newlines, as
 * `sharedCredential` in `credential.ts` does. Does no validation.
 */
export function issueKey(
  _organizationId: string,
  _connectionId: string,
  _issueId: string,
): string {
  throw new Error("not implemented");
}
