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
export function identicon(seed: string): Identicon {
  const h = fnv1a32(new TextEncoder().encode(seed));
  const cells: boolean[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      // Cols 3 and 4 mirror cols 1 and 0, so only cols 0..2 read the hash.
      const k = col <= 2 ? col : GRID_SIZE - 1 - col;
      cells.push(((h >>> (row * 3 + k)) & 1) === 1);
    }
  }
  // A blank face reads as a missing image, so light the centre. Never
  // re-roll the hash: that would move the face of an existing account.
  if (!cells.includes(true)) {
    cells[CENTRE_CELL] = true;
  }
  // Bits 15..31, disjoint from the grid's bits 0..14.
  const hue = (h >>> 15) % 360;
  return { cells, hue };
}

const GRID_SIZE = 5;

/** Index of the centre cell, row 2 col 2. */
const CENTRE_CELL = 12;

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a 32-bit over `bytes`, unsigned, with no finalizer. */
function fnv1a32(bytes: Uint8Array): number {
  let h = FNV_OFFSET_BASIS;
  for (const b of bytes) {
    h = Math.imul(h ^ b, FNV_PRIME);
  }
  return h >>> 0;
}
