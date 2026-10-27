/**
 * Tests for the identicon contract. Its output decides how every existing
 * account looks, so golden vectors pin the exact faces: a determinism check
 * alone would pass after a refactor that silently changed all of them.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildInfoSchema, type BuildInfoDto } from "../src/build-info.js";
import * as identiconModule from "../src/identicon.js";
import { identicon, type Identicon } from "../src/identicon.js";
import * as entry from "../src/index.js";

/**
 * A grid as the spec writes it: five space-separated rows, top to bottom,
 * `#` for true and `.` for false.
 */
function grid(rows: string): boolean[] {
  return rows
    .split(" ")
    .join("")
    .split("")
    .map((cell) => cell === "#");
}

function assertFace(face: Identicon, rows: string, hue: number): void {
  assert.deepEqual(face.cells, grid(rows));
  assert.equal(face.hue, hue);
}

function assertShape(face: Identicon): void {
  assert.equal(face.cells.length, 25);
  for (const cell of face.cells) assert.equal(typeof cell, "boolean");
  for (let row = 0; row < 5; row++) {
    assert.equal(face.cells[row * 5 + 4], face.cells[row * 5 + 0]);
    assert.equal(face.cells[row * 5 + 3], face.cells[row * 5 + 1]);
  }
  assert.ok(Number.isInteger(face.hue));
  assert.ok(face.hue >= 0 && face.hue <= 359);
  assert.deepEqual(Reflect.ownKeys(face).sort(), ["cells", "hue"]);
}

const LONG_GOLDEN = "Zb8f2Kq9Lm3Nx7Rt5Vw1Yc6Hd4Jp0Gs";

const USER_1 = "..#.. .###. #.#.# ..#.. #####";
const USER_2 = "#.#.# #.#.# ..... ##### #####";

// ---- golden vectors ---------------------------------------------------------

test("[happy-1] the pinned seeds a, user-1 and user-2 produce their pinned faces", () => {
  assertFace(identicon("a"), "..#.. #.#.# ..#.. ..#.. .#.#.", 120);
  assertFace(identicon("user-1"), USER_1, 326);
  assertFace(identicon("user-2"), USER_2, 62);
});

// The longest pinned seed, mixing case and digits.
test("[happy-1] the 31-character pinned seed produces its pinned face", () => {
  assertFace(identicon(LONG_GOLDEN), ".###. ##### .#.#. ##.## .#.#.", 196);
});

test("[happy-2] the face for a deep-equals the literal cells array and hue", () => {
  assert.deepEqual(identicon("a"), {
    // prettier-ignore
    cells: [
      false, false, true, false, false,
      true, false, true, false, true,
      false, false, true, false, false,
      false, false, true, false, false,
      false, true, false, true, false,
    ],
    hue: 120,
  });
});

// Neither the object nor its array is frozen; both are plain.
test("[happy-2] the face for a is a plain, unfrozen object with a plain array", () => {
  const face = identicon("a");
  assert.equal(Object.getPrototypeOf(face), Object.prototype);
  assert.ok(Array.isArray(face.cells));
  assert.equal(Object.isFrozen(face), false);
  assert.equal(Object.isFrozen(face.cells), false);
});

// ---- shape ------------------------------------------------------------------

test("[happy-3] every pinned seed's face has the contract's shape", () => {
  for (const seed of ["a", "user-1", "user-2", LONG_GOLDEN]) {
    assertShape(identicon(seed));
  }
});

// The centre fix-up and the all-on grid must not break the mirror or shape.
test("[happy-3] edge seeds' faces have the contract's shape too", () => {
  for (const seed of [
    "",
    "\uD800",
    "x".repeat(10000),
    "user-46623",
    "user-54233",
    "user-46705",
  ]) {
    assertShape(identicon(seed));
  }
});

// ---- repeated and interleaved calls -----------------------------------------

test("[happy-4] repeated calls agree in new objects with new cells arrays", () => {
  const first = identicon("user-1");
  const second = identicon("user-1");
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.notEqual(first.cells, second.cells);
});

// No cache: changing one result cannot reach the next.
test("[happy-4] mutating a returned face does not change a later call's face", () => {
  const first = identicon("user-1");
  const cells = first.cells as boolean[];
  cells.fill(false);
  cells.push(true);
  assertFace(identicon("user-1"), USER_1, 326);
});

test("[concurrency-1] user-1 is unaffected by earlier calls with user-2, a and the empty seed", () => {
  identicon("user-2");
  identicon("a");
  identicon("");
  assertFace(identicon("user-1"), USER_1, 326);
});

// The fix-up lights the centre for user-46623; user-2's centre row is empty
// and must stay so.
test("[concurrency-1] user-2 is unaffected by earlier degenerate seeds", () => {
  identicon("user-46623");
  identicon("user-46705");
  assertFace(identicon("user-2"), USER_2, 62);
});

test("[concurrency-2] calls from overlapping async tasks agree with sequential calls", async () => {
  const seeds = Array.from({ length: 100 }, (_, i) =>
    i % 2 === 0 ? "user-1" : "user-2",
  );
  const results = await Promise.all(
    seeds.map(async (seed) => {
      await Promise.resolve();
      return { seed, face: identicon(seed) };
    }),
  );
  const expected: Record<string, Identicon> = {
    "user-1": identicon("user-1"),
    "user-2": identicon("user-2"),
  };
  for (const { seed, face } of results) {
    assert.deepEqual(face, expected[seed]);
  }
});

// Tasks resume after different numbers of ticks, so calls finish out of start
// order; each still gets its pinned face.
test("[concurrency-2] async tasks resuming out of order each get their pinned face", async () => {
  const results = await Promise.all(
    Array.from({ length: 100 }, async (_, i) => {
      const seed = i % 2 === 0 ? "user-1" : "user-2";
      for (let tick = 0; tick < 100 - i; tick++) await Promise.resolve();
      return { seed, face: identicon(seed) };
    }),
  );
  for (const { seed, face } of results) {
    if (seed === "user-1") assertFace(face, USER_1, 326);
    else assertFace(face, USER_2, 62);
  }
});

// ---- bytes ------------------------------------------------------------------

test("[boundary-1] case and leading whitespace give their own faces", () => {
  assertFace(identicon("a"), "..#.. #.#.# ..#.. ..#.. .#.#.", 120);
  assertFace(identicon("A"), "..#.. #...# ##.## ##.## #####", 295);
  assertFace(identicon(" a"), ".#.#. ##### ..... .###. ..#..", 138);
});

// Canonically equivalent strings are not normalized to one face.
test("[boundary-1] NFC and NFD spellings of café give different faces", () => {
  const nfc = "café";
  const nfd = "café";
  assert.equal(nfc.normalize("NFC"), nfd.normalize("NFC"));
  assertFace(identicon(nfc), "#...# #...# #...# ..... #.#.#", 62);
  assertFace(identicon(nfd), "##### .###. ..... .#.#. #...#", 211);
});

test("[boundary-2] a lone high surrogate hashes as U+FFFD", () => {
  const face = identicon("\uD800");
  assert.deepEqual(face, identicon("�"));
  assertFace(face, ".#.#. #...# #...# .###. #...#", 239);
});

// TextEncoder replaces a lone low surrogate the same way.
test("[boundary-2] a lone low surrogate also hashes as U+FFFD", () => {
  const face = identicon("\uDC00");
  assert.deepEqual(face, identicon("�"));
  assertFace(face, ".#.#. #...# #...# .###. #...#", 239);
});

// ---- any string -------------------------------------------------------------

test("[boundary-3] the empty seed is accepted and hashes zero bytes", () => {
  let face: Identicon | undefined;
  assert.doesNotThrow(() => {
    face = identicon("");
  });
  assert.ok(face);
  assertFace(face, "#.#.# ..... ##### .###. #...#", 225);
});

// One NUL byte is a byte, not nothing.
test("[boundary-3] a single NUL character is not the empty seed", () => {
  assert.notDeepEqual(identicon("\u0000"), identicon(""));
  assertFace(identicon(""), "#.#.# ..... ##### .###. #...#", 225);
});

test("[boundary-4] a seed of 9999 x's is hashed in full", () => {
  assertFace(identicon("x".repeat(9999)), "##### ##### #.#.# ##### .###.", 275);
});

// One more character past 9999 still changes the face: nothing truncates.
test("[boundary-4] a seed of 10000 x's is hashed in full, unlike 9999", () => {
  const face = identicon("x".repeat(10000));
  assertFace(face, "#.#.# ..... ..... ..#.. ..#..", 310);
  assert.notDeepEqual(face, identicon("x".repeat(9999)));
});

// ---- degenerate hashes ------------------------------------------------------

test("[boundary-5] a hash with no cell bits set lights only the centre cell", () => {
  assertFace(identicon("user-46623"), "..... ..... ..#.. ..... .....", 76);
  assertFace(identicon("user-54233"), "..... ..... ..#.. ..... .....", 64);
});

// An all-on grid is returned as computed; nothing re-rolls the hash.
test("[boundary-5] a hash with every cell bit set keeps every cell", () => {
  assertFace(identicon("user-46705"), "##### ##### ##### ##### #####", 247);
});

// ---- package surface --------------------------------------------------------

/**
 * Read through the namespace rather than a named import, so this file still
 * compiles before the entry point gains the re-export.
 */
const fromEntry = (entry as Record<string, unknown>).identicon;

test("[happy-5] the entry point re-exports the same identicon function", () => {
  assert.equal(typeof fromEntry, "function");
  assert.equal(fromEntry, identicon);
});

test("[happy-5] the existing exports of the entry point behave as before", () => {
  const identified: BuildInfoDto = {
    version: "1.4.2",
    gitSha: "7f3a9c1e5b2d8a4f6c0e9b3a1d7f5c2e8a4b6d09",
    gitShortSha: "7f3a9c1",
    buildTime: "2026-09-17T09:14:00.000Z",
    gitRef: "main",
    dirty: false,
  };
  assert.equal(entry.formatVersion(identified), "1.4.2+7f3a9c1");
  assert.equal(entry.buildInfoSchema, buildInfoSchema);
  assert.deepEqual(entry.buildInfoSchema.parse(identified), identified);
  assert.equal(
    entry.buildInfoSchema.safeParse({ ...identified, gitSha: "" }).success,
    false,
  );
  const handle = entry.handleSchema.safeParse("  FeverSoul  ");
  assert.equal(handle.success, true);
  assert.equal(handle.data, "feversoul");
  assert.equal(entry.handleSchema.safeParse("no").success, false);
});

// The hash and bit layout stay private.
test("[happy-5] the identicon module exports identicon and nothing else", () => {
  assert.deepEqual(Object.keys(identiconModule), ["identicon"]);
});
