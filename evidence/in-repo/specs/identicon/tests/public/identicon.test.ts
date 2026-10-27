/**
 * Tests for the identicon contract: a mirrored 5×5 grid and a hue derived
 * from a seed. The golden vectors are the point: what `identicon` returns
 * decides how every existing account looks, so any change to them is a
 * breaking change, not a refactor.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { identicon, type Identicon } from "../src/identicon.js";
import { buildInfoSchema, formatVersion, handleSchema } from "../src/index.js";

const SEED_MESSAGE = "identicon: seed must be a string";

const GOLDEN = [
  { seed: "a", grid: "##.## .###. .###. ..... ##.##", hue: 249 },
  { seed: "user-1", grid: "..#.. #.#.# ##.## #.#.# .....", hue: 15 },
  { seed: "user-2", grid: "#...# .#.#. ##.## ..... #.#.#", hue: 117 },
] as const;

const LONG_GOLDEN = {
  seed: "Zb8f2Kq9Lm3Nx7Rt5Vw1Yc6Hd4Jp0Gs",
  grid: ".#.#. ..#.. #.#.# ##### #...#",
  hue: 346,
} as const;

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

function assertSeedRejected(value: unknown): void {
  assert.throws(
    () => identicon(value as string),
    (err: unknown) => {
      assert.ok(err instanceof TypeError);
      assert.equal(err.message, SEED_MESSAGE);
      return true;
    },
  );
}

// ---- golden vectors ---------------------------------------------------------

for (const { seed, grid: rows, hue } of GOLDEN) {
  test(`[happy-1] the pinned seed "${seed}" produces its pinned face`, () => {
    assertFace(identicon(seed), rows, hue);
  });
}

// The longest pinned seed, mixed case, with a hue near the top of the range
// and a fully set row that must not be adjusted.
test("[happy-1] the 31-character pinned seed produces its pinned face", () => {
  assertFace(identicon(LONG_GOLDEN.seed), LONG_GOLDEN.grid, LONG_GOLDEN.hue);
});

test('[happy-2] the face for "a" deep-equals the literal cells array and hue', () => {
  assert.deepEqual(
    identicon("a"),
    {
      cells: [
        true, true, false, true, true,
        false, true, true, true, false,
        false, true, true, true, false,
        false, false, false, false, false,
        true, true, false, true, true,
      ],
      hue: 249,
    },
  );
});

// Row-major, top-left first: pins the ends and the one empty row by index.
test('[happy-2] the face for "a" is row-major with the top-left cell first', () => {
  const { cells } = identicon("a");
  assert.equal(cells[0], true);
  assert.equal(cells[2], false);
  assert.equal(cells[5], false);
  assert.deepEqual(cells.slice(15, 20), [false, false, false, false, false]);
  assert.equal(cells[22], false);
  assert.equal(cells[24], true);
});

// ---- shape ------------------------------------------------------------------

for (const seed of [...GOLDEN.map((g) => g.seed), LONG_GOLDEN.seed]) {
  test(`[happy-3] the result for "${seed}" has the contract's shape`, () => {
    assertShape(identicon(seed));
  });
}

test("[happy-3] the shape holds for the empty seed and a lone surrogate", () => {
  assertShape(identicon(""));
  assertShape(identicon("\uD800"));
});

// ---- determinism and freezing -----------------------------------------------

test('[happy-4] repeated calls with "user-1" agree in new objects', () => {
  const first = identicon("user-1");
  const second = identicon("user-1");
  assert.deepEqual(second, first);
  assert.notEqual(second, first);
  assert.notEqual(second.cells, first.cells);
});

// There is no cache, not even for the zero-byte hash.
test("[happy-4] repeated calls with the empty seed still return new objects", () => {
  const first = identicon("");
  const second = identicon("");
  assert.deepEqual(second, first);
  assert.notEqual(second, first);
  assert.notEqual(second.cells, first.cells);
});

test('[happy-5] the result for "user-1" and its cells are frozen', () => {
  const face = identicon("user-1");
  assert.equal(Object.isFrozen(face), true);
  assert.equal(Object.isFrozen(face.cells), true);
  // ES modules are strict, so writes to a frozen object throw.
  assert.throws(() => {
    (face as { hue: number }).hue = 0;
  }, TypeError);
  assert.throws(() => {
    (face.cells as boolean[])[0] = false;
  }, TypeError);
  assertFace(face, "..#.. #.#.# ##.## #.#.# .....", 15);
});

test("[happy-5] the cells of a result cannot grow", () => {
  const face = identicon("");
  assert.throws(() => {
    (face.cells as boolean[]).push(true);
  }, TypeError);
  assert.equal(face.cells.length, 25);
});

// ---- order independence -----------------------------------------------------

test('[concurrency-1] earlier calls with "user-2", "a" and "" do not change "user-1"', () => {
  identicon("user-2");
  identicon("a");
  identicon("");
  assertFace(identicon("user-1"), "..#.. #.#.# ##.## #.#.# .....", 15);
});

// A call that throws part-way leaves nothing behind either.
test('[concurrency-1] a rejected call in between does not change "user-1"', () => {
  identicon("x".repeat(10000));
  assertSeedRejected(undefined);
  assertFace(identicon("user-1"), "..#.. #.#.# ##.## #.#.# .....", 15);
});

test("[concurrency-2] calls from 100 overlapping async tasks agree with sequential calls", async () => {
  const seeds = Array.from({ length: 100 }, (_, i) =>
    i % 2 === 0 ? "user-1" : "user-2",
  );
  const results = await Promise.all(
    seeds.map(async (seed) => {
      await Promise.resolve();
      return { seed, face: identicon(seed) };
    }),
  );
  assert.equal(results.length, 100);
  const user1 = identicon("user-1");
  const user2 = identicon("user-2");
  for (const { seed, face } of results) {
    assert.deepEqual(face, seed === "user-1" ? user1 : user2);
  }
});

// Tasks wait different numbers of turns, so calls run in a scrambled order;
// each result is checked against the golden face, not just a sibling call.
test("[concurrency-2] tasks resuming out of order still get the pinned faces", async () => {
  const results = await Promise.all(
    Array.from({ length: 100 }, async (_, i) => {
      const seed = i % 2 === 0 ? "user-1" : "user-2";
      for (let hop = 0; hop < (i * 7) % 11; hop++) await Promise.resolve();
      return { seed, face: identicon(seed) };
    }),
  );
  for (const { seed, face } of results) {
    if (seed === "user-1") {
      assertFace(face, "..#.. #.#.# ##.## #.#.# .....", 15);
    } else {
      assertFace(face, "#...# .#.#. ##.## ..... #.#.#", 117);
    }
  }
});

// ---- seed bytes -------------------------------------------------------------

const VARIANTS = [
  { seed: "a", note: "baseline", grid: "##.## .###. .###. ..... ##.##", hue: 249 },
  { seed: "A", note: "case is significant", grid: "..#.. .#.#. .#.#. ##### #####", hue: 264 },
  { seed: " a", note: "whitespace is not trimmed", grid: "..... .###. ##### .###. #.#.#", hue: 64 },
] as const;

for (const { seed, note, grid: rows, hue } of VARIANTS) {
  test(`[boundary-1] seed ${JSON.stringify(seed)} gives its own face (${note})`, () => {
    assertFace(identicon(seed), rows, hue);
  });
}

// Canonically equivalent, but different bytes: no normalization.
test("[boundary-1] NFC and NFD spellings of café give different faces", () => {
  const nfc = identicon("café");
  const nfd = identicon("café");
  assertFace(nfc, ".#.#. .#.#. #.#.# .###. .....", 219);
  assertFace(nfd, "##### ##### #.#.# .###. #.#.#", 299);
  assert.notDeepEqual(nfd, nfc);
});

test("[boundary-2] a lone high surrogate hashes as U+FFFD", () => {
  const face = identicon("\uD800");
  assert.deepEqual(face, identicon("�"));
  assertFace(face, ".#.#. ##### ..... ##.## ..#..", 65);
});

// TextEncoder replaces any unpaired surrogate, low as well as high.
test("[boundary-2] a lone low surrogate also hashes as U+FFFD", () => {
  const face = identicon("\uDC00");
  assert.deepEqual(face, identicon("�"));
  assertFace(face, ".#.#. ##### ..... ##.## ..#..", 65);
});

test("[boundary-3] the empty seed is accepted and gives the zero-byte face", () => {
  let face: Identicon | undefined;
  assert.doesNotThrow(() => {
    face = identicon("");
  });
  assert.ok(face);
  assertFace(face, "##.## #...# ..... .###. #####", 196);
});

// Its middle row is all clear and its bottom row all set: returned as
// computed, never re-rolled.
test("[boundary-3] the empty seed's degenerate rows are not adjusted", () => {
  const { cells } = identicon("");
  assert.deepEqual(cells.slice(10, 15), [false, false, false, false, false]);
  assert.deepEqual(cells.slice(20, 25), [true, true, true, true, true]);
});

test('[boundary-4] "x" repeated 10000 times is hashed in full', () => {
  assertFace(identicon("x".repeat(10000)), "#...# .###. ##.## ##### #####", 21);
});

// One byte shorter must give its own face, so nothing is truncated.
test('[boundary-4] "x" repeated 9999 times gives a different, pinned face', () => {
  const shorter = identicon("x".repeat(9999));
  assertFace(shorter, ".#.#. #.#.# ##### .#.#. .#.#.", 195);
  assert.notDeepEqual(shorter, identicon("x".repeat(10000)));
});

// ---- rejected seeds ---------------------------------------------------------

for (const [label, value] of [
  ["undefined", undefined],
  ["null", null],
  ["42", 42],
  ["{}", {}],
] as const) {
  test(`[unhappy-1] a ${label} seed throws a TypeError`, () => {
    assertSeedRejected(value);
  });
}

// ["a"] would coerce to "a"; it must be rejected, not given the "a" face.
test('[unhappy-1] an array seed ["a"] throws rather than being coerced', () => {
  assertSeedRejected(["a"]);
});

test('[unhappy-2] new String("a") is not a string seed', () => {
  assertSeedRejected(new String("a"));
});

test('[unhappy-2] new String("") is not a string seed either', () => {
  assertSeedRejected(new String(""));
});

// ---- package entry point ----------------------------------------------------

test("[happy-6] the package entry point re-exports the same identicon", async () => {
  const entry = (await import("../src/index.js")) as unknown as Record<
    string,
    unknown
  >;
  assert.equal(entry.identicon, identicon);
});

test("[happy-6] existing exports of the entry point behave as before", () => {
  const info = {
    version: "1.4.2",
    gitSha: "7f3a9c1e5b2d8a4f6c0e9b3a1d7f5c2e8a4b6d09",
    gitShortSha: "7f3a9c1",
    buildTime: "2026-09-17T09:14:00.000Z",
    gitRef: "main",
    dirty: false,
  };
  assert.equal(formatVersion(info), "1.4.2+7f3a9c1");
  assert.deepEqual(buildInfoSchema.parse(info), info);
  const handle = handleSchema.safeParse("  FeverSoul  ");
  assert.equal(handle.success, true);
  assert.equal(handle.data, "feversoul");
});
