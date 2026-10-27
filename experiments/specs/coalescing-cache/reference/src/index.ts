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

/** A stored value and the clock's time when its load settled. */
interface Entry<V> {
  value: V;
  settledAt: number;
}

/** A load in flight; `discarded` is set when its key is invalidated. */
interface Load<V> {
  promise: Promise<V>;
  discarded: boolean;
}

/**
 * A cache that shares one in-flight load per key and serves stale values
 * while refreshing.
 */
export class Cache<V> {
  private readonly options: CacheOptions<V>;
  /** Stored entries, least recently used first. */
  private readonly entries = new Map<string, Entry<V>>();
  private readonly loads = new Map<string, Load<V>>();

  /** Creates a cache with a loader, fresh-for and stale-for durations, a maximum number of entries, a clock and an optional error handler. */
  constructor(options: CacheOptions<V>) {
    this.options = options;
  }

  /**
   * Returns a promise of the value for that key. Rejects with the loader's
   * error when the load it waits on rejects.
   */
  get(key: string): Promise<V> {
    const { freshForMs, staleForMs, clock } = this.options;
    const entry = this.entries.get(key);
    if (entry !== undefined) {
      const age = clock() - entry.settledAt;
      if (age < freshForMs + staleForMs) {
        this.touch(key, entry);
        if (age >= freshForMs && !this.loads.has(key)) {
          // A failed refresh is reported to the error handler, not to the
          // get that started it, which has the stale value already.
          this.load(key, true).catch(() => {});
        }
        return Promise.resolve(entry.value);
      }
      this.entries.delete(key);
    }
    return this.loads.get(key)?.promise ?? this.load(key, false);
  }

  /** Drops the entry for that key; a load in flight for it is not stored when it settles. */
  invalidate(key: string): void {
    this.entries.delete(key);
    const load = this.loads.get(key);
    if (load !== undefined) {
      load.discarded = true;
      this.loads.delete(key);
    }
  }

  /** Starts the one load for the key; a refresh reports its failure to the error handler. */
  private load(key: string, refresh: boolean): Promise<V> {
    const { loader, clock, onError } = this.options;
    const load: Load<V> = { promise: undefined as unknown as Promise<V>, discarded: false };
    const settle = () => {
      if (this.loads.get(key) === load) this.loads.delete(key);
    };
    load.promise = new Promise<V>((resolve) => resolve(loader(key))).then(
      (value: V) => {
        settle();
        if (!load.discarded) this.store(key, { value, settledAt: clock() });
        return value;
      },
      (error: unknown) => {
        settle();
        if (refresh) onError?.(error, key);
        throw error;
      },
    );
    this.loads.set(key, load);
    return load.promise;
  }

  /** Stores an entry as the most recently used and drops the least recently used beyond the maximum. */
  private store(key: string, entry: Entry<V>): void {
    this.touch(key, entry);
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.options.maxEntries) break;
      this.entries.delete(oldest);
    }
  }

  private touch(key: string, entry: Entry<V>): void {
    this.entries.delete(key);
    this.entries.set(key, entry);
  }
}
