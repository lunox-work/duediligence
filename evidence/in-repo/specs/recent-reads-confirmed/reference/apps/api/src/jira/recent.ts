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
  options: {
    ttlMs?: number;
    now?: () => number;
    max?: number;
  } = {},
): RecentReads<T> {
  const ttlMs = options.ttlMs ?? RECENT_JIRA_READ_MS;
  const now = options.now ?? (() => Date.now());
  const max = options.max ?? 1000;
  // A Map iterates in insertion order, so its first key is the oldest write.
  // `set` deletes before inserting to move a rewritten key to the end.
  const entries = new Map<string, { value: T; writtenAt: number }>();

  return {
    get(key) {
      const entry = entries.get(key);
      if (entry === undefined) return undefined;
      // Negative elapsed time (a clock moving backwards) stays fresh.
      return now() - entry.writtenAt < ttlMs ? entry.value : undefined;
    },
    set(key, value) {
      if (!entries.delete(key)) {
        // A new key: make room. `size > 0` keeps the latest key for max <= 0.
        while (entries.size > 0 && entries.size >= max) {
          entries.delete(entries.keys().next().value as string);
        }
      }
      entries.set(key, { value, writtenAt: now() });
    },
  };
}

/**
 * The key for an issue read: its three parts joined with newlines, as
 * `sharedCredential` in `credential.ts` does. Does no validation.
 */
export function issueKey(
  organizationId: string,
  connectionId: string,
  issueId: string,
): string {
  return [organizationId, connectionId, issueId].join("\n");
}
