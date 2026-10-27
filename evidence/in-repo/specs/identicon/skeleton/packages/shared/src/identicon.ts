/**
 * The default avatar for a user or organization, computed from its id with
 * nothing uploaded or stored: a 5×5 grid mirrored left to right, plus a hue.
 *
 * A frozen contract: what it returns decides how every existing account
 * looks, and a change to it cannot be migrated or rolled back.
 *
 * Imports nothing, so the browser and the extension can both bundle it.
 */

/** A face: 25 row-major cells, top-left first, and an integer hue in 0..359. */
export interface Identicon {
  readonly cells: readonly boolean[];
  readonly hue: number;
}

/**
 * The face for a seed (an account id), a pure, synchronous function of its UTF-8 bytes.
 * Returns a new frozen object, with frozen `cells`, on every call.
 *
 * Throws a `TypeError` ("identicon: seed must be a string") when the seed is
 * not a string, including a `String` object; it is never coerced.
 */
export function identicon(_seed: string): Identicon {
  throw new Error("not implemented");
}
