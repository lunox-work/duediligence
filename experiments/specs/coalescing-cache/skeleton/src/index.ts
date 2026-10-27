/** A loader that takes a key and returns a promise of a value. */
export type Loader<V> = (key: string) => Promise<V>;

/** A clock that returns the current time in milliseconds. */
export type Clock = () => number;

/** An error handler, called with the error and the key when a background refresh rejects. */
export type ErrorHandler = (error: unknown, key: string) => void;

/** What a cache is created with. */
export interface CacheOptions<V> {
  /** Takes a key and returns a promise of a value. */
  loader: Loader<V>;
  /** Fresh-for duration in milliseconds. */
  freshForMs: number;
  /** Stale-for duration in milliseconds. */
  staleForMs: number;
  /** Maximum number of entries. */
  maxEntries: number;
  /** Returns the current time in milliseconds; all timing comes from it. */
  clock: Clock;
  /** Optional error handler, called with the error and the key when a background refresh rejects. */
  onError?: ErrorHandler;
}

/**
 * A cache that shares one in-flight load per key and serves stale values
 * while refreshing.
 */
export class Cache<V> {
  /** Creates a cache with a loader, fresh-for and stale-for durations, a maximum number of entries, a clock and an optional error handler. */
  constructor(options: CacheOptions<V>) {
    throw new Error("not implemented");
  }

  /**
   * Returns a promise of the value for that key. Rejects with the loader's
   * error when the load it waits on rejects.
   */
  get(key: string): Promise<V> {
    throw new Error("not implemented");
  }

  /** Drops the entry for that key; a load in flight for it is not stored when it settles. */
  invalidate(key: string): void {
    throw new Error("not implemented");
  }
}
