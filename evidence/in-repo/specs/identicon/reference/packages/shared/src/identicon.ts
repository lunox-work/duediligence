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
export function identicon(seed: string): Identicon {
  if (typeof seed !== "string") {
    throw new TypeError("identicon: seed must be a string");
  }
  const h = fmix32(fnv1a32(new TextEncoder().encode(seed)));
  const cells: boolean[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      // Cols 3 and 4 mirror cols 1 and 0.
      const k = col <= 2 ? col : 4 - col;
      cells.push(((h >>> (row * 3 + k)) & 1) === 1);
    }
  }
  // Bits 15-31, disjoint from the grid's bits 0-14.
  const hue = (h >>> 15) % 360;
  return Object.freeze({ cells: Object.freeze(cells), hue });
}

/** FNV-1a, 32-bit, as an unsigned integer. */
function fnv1a32(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h = Math.imul(h ^ b, 0x01000193) >>> 0;
  }
  return h;
}

/** MurmurHash3's `fmix32` finalizer, as an unsigned integer. */
function fmix32(input: number): number {
  let h = input;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
