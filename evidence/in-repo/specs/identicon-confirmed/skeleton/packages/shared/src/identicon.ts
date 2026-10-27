/**
 * Identicon: a default avatar derived from an account id. Every user and
 * organization gets one computed from its id, with nothing uploaded or
 * stored: a 5×5 grid mirrored left to right, plus a hue.
 *
 * A frozen contract: what `identicon` returns decides how every existing
 * account looks, and a change to it cannot be migrated or rolled back.
 *
 * Imports nothing, so the browser and the extension can both bundle it; it
 * uses only the `TextEncoder` global.
 */

/**
 * The face for one seed: 25 cells, row-major with the top-left first and
 * mirrored left to right, and a hue in degrees, an integer in `0..359`.
 */
export interface Identicon {
  readonly cells: readonly boolean[];
  readonly hue: number;
}

/**
 * The identicon for `seed`: a pure, synchronous function of the seed's UTF-8
 * bytes, hashed with FNV-1a 32-bit and no finalizer. Every string is accepted,
 * including `""`, and each call returns a new object with a new `cells` array.
 */
export function identicon(_seed: string): Identicon {
  throw new Error("not implemented");
}
