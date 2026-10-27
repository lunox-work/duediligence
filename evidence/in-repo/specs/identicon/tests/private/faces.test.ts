/**
 * Hidden tests for the identicon contract: the faces it computes. Golden
 * vectors beyond the public four, the spec's normative algorithm as a model
 * over many seeds, and the byte-level edges (multi-byte UTF-8, surrogates,
 * long seeds) a lookup table or a hand-rolled encoder would get wrong.
 */

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { test } from "node:test";

import { identicon, type Identicon } from "../../src/identicon.js";

/** The spec's grid notation: five rows, top to bottom, `#` set and `.` clear. */
function grid(rows: string): boolean[] {
  const cells = rows.split(" ").join("");
  assert.equal(cells.length, 25, `bad fixture grid: ${rows}`);
  return [...cells].map((c) => c === "#");
}

function assertFace(face: Identicon, rows: string, hue: number): void {
  assert.deepEqual(face.cells, grid(rows));
  assert.equal(face.hue, hue);
}

/** Every property the contract fixes for any result, whatever the seed. */
function assertShape(face: Identicon): void {
  assert.ok(Array.isArray(face.cells));
  assert.equal(face.cells.length, 25);
  for (const cell of face.cells) assert.equal(typeof cell, "boolean");
  for (let r = 0; r < 5; r++) {
    assert.equal(face.cells[r * 5 + 4], face.cells[r * 5 + 0]);
    assert.equal(face.cells[r * 5 + 3], face.cells[r * 5 + 1]);
  }
  assert.ok(Number.isInteger(face.hue));
  assert.ok(face.hue >= 0 && face.hue <= 359);
  assert.deepEqual(Reflect.ownKeys(face).sort(), ["cells", "hue"]);
}

// ---- the spec's algorithm, steps 2-6, as an independent model ---------------

/** Steps 3 and 4: FNV-1a 32-bit, then MurmurHash3 fmix32. */
function modelHash(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Steps 5 and 6: the face a finalized hash gives. */
function faceOf(h: number): { cells: boolean[]; hue: number } {
  const cells: boolean[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const k = col <= 2 ? col : 4 - col;
      cells.push(((h >>> (row * 3 + k)) & 1) === 1);
    }
  }
  return { cells, hue: (h >>> 15) % 360 };
}

/**
 * The model's bytes come from Buffer, not TextEncoder: both encode UTF-8 and
 * both replace an unpaired surrogate with EF BF BD.
 */
function modelFace(seed: string): { cells: boolean[]; hue: number } {
  return faceOf(modelHash(Buffer.from(seed, "utf8")));
}

/** A fixed linear congruential sequence: deterministic, not random. */
function sequence(start: number): () => number {
  let x = start >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x;
  };
}

/** Code points drawn from every UTF-8 length class, surrogates included. */
function unicodeSeed(next: () => number, length: number): string {
  const ranges: [number, number][] = [
    [0x00, 0x7f],
    [0x80, 0x7ff],
    [0x800, 0xd7ff],
    [0xd800, 0xdfff],
    [0xe000, 0xffff],
    [0x10000, 0x10ffff],
  ];
  const units: string[] = [];
  for (let i = 0; i < length; i++) {
    const [lo, hi] = ranges[next() % ranges.length] ?? [0x61, 0x61];
    const cp = lo + (next() % (hi - lo + 1));
    // fromCharCode keeps a surrogate code unit unpaired.
    units.push(cp <= 0xffff ? String.fromCharCode(cp) : String.fromCodePoint(cp));
  }
  return units.join("");
}

// ---- happy-1: golden vectors ------------------------------------------------

const SPEC_GOLDEN = [
  { seed: "a", h: 0x1a80b1b3, grid: "##.## .###. .###. ..... ##.##", hue: 249 },
  { seed: "user-1", h: 0x778f8aec, grid: "..#.. #.#.# ##.## #.#.# .....", hue: 15 },
  { seed: "user-2", h: 0x32dad0d1, grid: "#...# .#.#. ##.## ..... #.#.#", hue: 117 },
  {
    seed: "Zb8f2Kq9Lm3Nx7Rt5Vw1Yc6Hd4Jp0Gs",
    h: 0x9b5d1f62,
    grid: ".#.#. ..#.. #.#.# ##### #...#",
    hue: 346,
  },
] as const;

// Extends the public golden tests: the spec's own `h` column decides the face
// through steps 5 and 6, and the model reproduces that `h` from the seed.
test("[happy-1] each pinned seed's face is what steps 5 and 6 make of the spec's h", () => {
  for (const { seed, h, grid: rows, hue } of SPEC_GOLDEN) {
    assert.equal(modelHash(Buffer.from(seed, "utf8")), h);
    const face = identicon(seed);
    assert.deepEqual({ cells: face.cells, hue: face.hue }, faceOf(h));
    assertFace(face, rows, hue);
  }
});

// Extends the public golden tests: a table of the four pinned seeds passes
// them; these seeds, computed by the normative algorithm, it does not.
const MORE_GOLDEN = [
  { seed: "user-3", grid: "..... #...# ..... .###. #...#", hue: 278 },
  { seed: "user-10", grid: "#.#.# ##.## #.#.# .#.#. #...#", hue: 53 },
  { seed: "b", grid: ".#.#. .###. ..... #...# .###.", hue: 352 },
  { seed: "User-1", grid: "#...# .#.#. .###. #.#.# ##.##", hue: 6 },
] as const;

for (const { seed, grid: rows, hue } of MORE_GOLDEN) {
  test(`[happy-1] seed "${seed}", beyond the four pinned ones, gets the algorithm's face`, () => {
    assertFace(identicon(seed), rows, hue);
  });
}

// Extends the public golden tests at the ends of the hue range: an off-by-one
// modulus, a signed shift or a scaled hue gets these wrong.
test('[happy-1] seed "seed-344" has hue 0 and "seed-458" has hue 359', () => {
  assertFace(identicon("seed-344"), "##.## ..... .###. .###. ##.##", 0);
  assertFace(identicon("seed-458"), "#.#.# .#.#. #.#.# #...# #####", 359);
});

// Degenerate grids are returned as computed, never re-rolled or adjusted.
test('[happy-1] seed "seed-44127" keeps its all-clear grid and "seed-4332" its all-set grid', () => {
  assertFace(identicon("seed-44127"), "..... ..... ..... ..... .....", 128);
  assertFace(identicon("seed-4332"), "##### ##### ##### ##### #####", 235);
});

// Extends the public golden tests to a thousand ASCII seeds: any deviation in
// the hash, the finalizer, the bit layout or the hue shows up here.
test("[happy-1] a thousand user-N seeds all match the normative algorithm", () => {
  for (let i = 0; i < 1000; i++) {
    const seed = `user-${i}`;
    const face = identicon(seed);
    assert.deepEqual({ cells: face.cells, hue: face.hue }, modelFace(seed), seed);
  }
});

// ---- happy-2: the literal face for "a" --------------------------------------

// Extends the public literal test: a plain object whose cells are a real array,
// cell by cell from bits 0-14 of h = 0x1a80b1b3.
test('[happy-2] the face for "a" is a plain object whose every cell is bit row*3+k of h', () => {
  const face = identicon("a");
  assert.equal(Object.getPrototypeOf(face), Object.prototype);
  assert.equal(Object.getPrototypeOf(face.cells), Array.prototype);
  const h = 0x1a80b1b3;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const k = col <= 2 ? col : 4 - col;
      assert.equal(face.cells[row * 5 + col], ((h >>> (row * 3 + k)) & 1) === 1);
    }
  }
  assert.deepEqual(face, {
    cells: [
      true, true, false, true, true,
      false, true, true, true, false,
      false, true, true, true, false,
      false, false, false, false, false,
      true, true, false, true, true,
    ],
    hue: 249,
  });
});

// ---- happy-3: shape ---------------------------------------------------------

// Extends the public shape tests to seeds no lookup table holds, including
// the hue extremes and both degenerate grids.
test("[happy-3] the shape holds for five hundred generated seeds and the edge-case seeds", () => {
  const next = sequence(3);
  const seeds = ["seed-344", "seed-458", "seed-44127", "seed-4332", "\0", "\u{1F600}"];
  for (let i = 0; i < 500; i++) seeds.push(unicodeSeed(next, i % 17));
  for (const seed of seeds) assertShape(identicon(seed));
});

// ---- boundary-1: bytes, not text --------------------------------------------

// Extends the public NFC/NFD test: one code point from each UTF-8 length
// class and its edges. A charCodeAt or byte-truncating hash, or CESU-8 for
// astral code points, gets these wrong.
const CODE_POINTS = [
  { label: "U+0080", seed: "\u0080", grid: "#.#.# .###. .#.#. ..#.. #.#.#", hue: 273 },
  { label: "U+07FF", seed: "߿", grid: "..... ..#.. #.#.# .#.#. .###.", hue: 34 },
  { label: "U+0800", seed: "ࠀ", grid: "..#.. ..#.. .###. .###. .#.#.", hue: 233 },
  { label: "U+FFFF", seed: "￿", grid: ".#.#. .#.#. .###. #.#.# .....", hue: 154 },
  { label: "U+10000", seed: "\u{10000}", grid: ".#.#. ##.## .#.#. #...# .#.#.", hue: 297 },
  { label: "U+10FFFF", seed: "\u{10FFFF}", grid: "##.## .#.#. .#.#. .###. .#.#.", hue: 14 },
  { label: "U+1F600 (a surrogate pair)", seed: "\u{1F600}", grid: ".#.#. #...# ..... ..#.. .#.#.", hue: 199 },
  { label: "日本 (three bytes each)", seed: "日本", grid: "##### ##.## ..#.. ..... #...#", hue: 129 },
] as const;

for (const { label, seed, grid: rows, hue } of CODE_POINTS) {
  test(`[boundary-1] the seed ${label} is hashed as its UTF-8 bytes`, () => {
    assertFace(identicon(seed), rows, hue);
  });
}

// Extends the public whitespace test: trailing and other whitespace count too,
// and a NUL byte is a byte.
const WHITESPACE = [
  { label: '"a "', seed: "a ", grid: "#.#.# ..#.. .#.#. #.#.# #####", hue: 299 },
  { label: '"a\\t"', seed: "a\t", grid: ".#.#. ##### ##.## .###. .....", hue: 169 },
  { label: '"a\\n"', seed: "a\n", grid: "##.## ..... #...# ##### .#.#.", hue: 100 },
  { label: '"user-1 "', seed: "user-1 ", grid: "#.#.# .###. ..#.. #...# .#.#.", hue: 112 },
  { label: '" "', seed: " ", grid: "..#.. .#.#. ##### ##.## #...#", hue: 356 },
  { label: '"\\0"', seed: "\0", grid: "##.## ##.## ..#.. #.#.# .#.#.", hue: 281 },
] as const;

for (const { label, seed, grid: rows, hue } of WHITESPACE) {
  test(`[boundary-1] the seed ${label} is not trimmed and gets its own face`, () => {
    assertFace(identicon(seed), rows, hue);
  });
}

// Extends the public NFC/NFD test to compatibility forms: NFKC would fold
// these together, and toLowerCase would fold the Kelvin sign into "k".
test("[boundary-1] compatibility characters are not normalized: ﬁ is not fi, K (Kelvin) is not K", () => {
  const ligature = identicon("ﬁ");
  const fi = identicon("fi");
  assertFace(ligature, "##.## ..#.. #...# ##.## .....", 167);
  assertFace(fi, "..... ##.## ..... #.#.# #...#", 135);
  const kelvin = identicon("K");
  const latinK = identicon("K");
  assertFace(kelvin, "..#.. ##### .###. #...# ..#..", 70);
  assertFace(latinK, "##### .#.#. .#.#. ..... #####", 298);
});

// Extends the public NFC/NFD test to hundreds of mixed-script seeds.
test("[boundary-1] three hundred generated seeds across every UTF-8 length match the model", () => {
  const next = sequence(17);
  for (let i = 0; i < 300; i++) {
    const seed = unicodeSeed(next, 1 + (i % 12));
    const face = identicon(seed);
    assert.deepEqual(
      { cells: face.cells, hue: face.hue },
      modelFace(seed),
      JSON.stringify(seed),
    );
  }
});

// ---- boundary-2: lone surrogates --------------------------------------------

// Extends the public lone-surrogate tests to the other ends of both
// surrogate ranges.
test("[boundary-2] the lone surrogates U+DBFF and U+DFFF also hash as U+FFFD", () => {
  const replacement = identicon("�");
  for (const seed of ["\uDBFF", "\uDFFF"]) {
    const face = identicon(seed);
    assert.deepEqual(face, replacement);
    assertFace(face, ".#.#. ##### ..... ##.## ..#..", 65);
  }
});

// Extends the public lone-surrogate tests: a surrogate among other text is
// replaced in place, and the rest is hashed as it stands.
test('[boundary-2] a lone surrogate inside "a\\uD800b" is replaced in place', () => {
  const face = identicon("a\uD800b");
  assert.deepEqual(face, identicon("a�b"));
  assertFace(face, "..#.. ..... ##### ..#.. .#.#.", 348);
});

// A high surrogate followed by an ordinary character is not a pair: an
// encoder that combines it with whatever follows gets this wrong.
test('[boundary-2] a high surrogate before an ordinary character, "\\uD800a", hashes as "\\uFFFDa"', () => {
  const face = identicon("\uD800a");
  assert.deepEqual(face, identicon("�a"));
  assertFace(face, ".###. ..... ##.## ##### ..#..", 185);
});

// Low then high is two unpaired surrogates, not a pair in the wrong order.
test('[boundary-2] a reversed pair "\\uDC00\\uD800" hashes as two U+FFFD', () => {
  const face = identicon("\uDC00\uD800");
  assert.deepEqual(face, identicon("��"));
  assertFace(face, "..#.. ##### ##### .#.#. .###.", 210);
});

// ---- boundary-3: the empty seed ---------------------------------------------

// Extends the public empty-seed test: an empty string built at runtime is the
// same seed, and its face is the finalized offset basis, with no bytes hashed.
test("[boundary-3] an empty seed built at runtime gives the zero-byte face", () => {
  const empty = "user-1".slice(6);
  const face = identicon(empty);
  assert.deepEqual({ cells: face.cells, hue: face.hue }, faceOf(modelHash(new Uint8Array(0))));
  assertFace(face, "##.## #...# ..... .###. #####", 196);
  assert.notDeepEqual(face, identicon("\0"));
});

// ---- boundary-4: long seeds -------------------------------------------------

// Extends the public 9999/10000 tests to longer seeds: a cap at 10000, 2^16
// or any other length truncates these.
test('[boundary-4] "x" repeated 65537 and 100000 times are hashed in full', () => {
  assertFace(identicon("x".repeat(65537)), "##.## #.#.# #.#.# ..... .###.", 327);
  assertFace(identicon("x".repeat(100000)), "##### #...# .###. ..... .....", 65);
});

// A difference at the very end, the very start or the middle of a long seed
// changes the face: nothing is skipped or sampled.
test("[boundary-4] long seeds that differ in one character at the end, start or middle get their own faces", () => {
  assertFace(identicon("x".repeat(10000) + "y"), "#.#.# ##.## .#.#. .###. .#.#.", 187);
  assertFace(identicon("y" + "x".repeat(10000)), "..... ##### ..#.. #.#.# ..#..", 149);
  assertFace(
    identicon("x".repeat(5000) + "y" + "x".repeat(4999)),
    "..#.. .###. #.#.# ##### #.#.#",
    56,
  );
});

// A cap on bytes rather than characters shows up on multi-byte seeds.
test("[boundary-4] long multi-byte seeds are hashed in full", () => {
  assertFace(identicon("é".repeat(5000)), "#...# ##### ##### ##.## .###.", 62);
  assertFace(identicon("\u{1F600}".repeat(3000)), ".#.#. ..#.. .###. ..... #.#.#", 350);
});

test("[boundary-4] seeds of x around every power of two up to 2^16 match the model", () => {
  for (let p = 6; p <= 16; p++) {
    for (const n of [2 ** p - 1, 2 ** p, 2 ** p + 1]) {
      const seed = "x".repeat(n);
      const face = identicon(seed);
      assert.deepEqual({ cells: face.cells, hue: face.hue }, modelFace(seed), `n = ${n}`);
    }
  }
});
