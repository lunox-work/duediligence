/**
 * Hidden tests for the identicon contract: the result objects. A new frozen
 * object on every call, no cache and no module state, whatever order calls
 * come in and whatever ran before.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { identicon, type Identicon } from "../../src/identicon.js";

const SEED_MESSAGE = "identicon: seed must be a string";

const LONG_SEED = "Zb8f2Kq9Lm3Nx7Rt5Vw1Yc6Hd4Jp0Gs";

const FACES: Record<string, { grid: string; hue: number }> = {
  a: { grid: "##.## .###. .###. ..... ##.##", hue: 249 },
  "user-1": { grid: "..#.. #.#.# ##.## #.#.# .....", hue: 15 },
  "user-2": { grid: "#...# .#.#. ##.## ..... #.#.#", hue: 117 },
  [LONG_SEED]: { grid: ".#.#. ..#.. #.#.# ##### #...#", hue: 346 },
  "": { grid: "##.## #...# ..... .###. #####", hue: 196 },
  "\uD800": { grid: ".#.#. ##### ..... ##.## ..#..", hue: 65 },
};

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

function assertPinned(face: Identicon, seed: string): void {
  const expected = FACES[seed];
  assert.ok(expected, `no pinned face for ${JSON.stringify(seed)}`);
  assertFace(face, expected.grid, expected.hue);
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

// ---- happy-4: repeated calls ------------------------------------------------

// Extends the public "user-1" and empty-seed tests: three calls each, for
// other seeds, all distinct objects with distinct cells.
for (const seed of ["a", "user-2", LONG_SEED, "\uD800"]) {
  test(`[happy-4] three calls with ${JSON.stringify(seed)} agree in three new objects`, () => {
    const faces = [identicon(seed), identicon(seed), identicon(seed)];
    for (const face of faces) assertPinned(face, seed);
    assert.equal(new Set(faces).size, 3);
    assert.equal(new Set(faces.map((f) => f.cells)).size, 3);
  });
}

// The same seed built at runtime is still the same seed, and still a new
// object: a cache keyed on anything else would show up here.
test('[happy-4] "user-" + 1 built at runtime gives a new object equal to the face for "user-1"', () => {
  const literal = identicon("user-1");
  const built = identicon(["user", String(1)].join("-"));
  assert.deepEqual(built, literal);
  assert.notEqual(built, literal);
  assert.notEqual(built.cells, literal.cells);
  assertPinned(built, "user-1");
});

test('[happy-4] repeated calls with "x" repeated 10000 times return new, equal objects', () => {
  const seed = "x".repeat(10000);
  const first = identicon(seed);
  const second = identicon(seed);
  assert.deepEqual(second, first);
  assert.notEqual(second, first);
  assert.notEqual(second.cells, first.cells);
  assertFace(second, "#...# .###. ##.## ##### #####", 21);
});

// ---- happy-5: frozen results ------------------------------------------------

// Extends the public "user-1" freezing test to other seeds.
for (const seed of ["a", "user-2", LONG_SEED, "\uD800"]) {
  test(`[happy-5] the result for ${JSON.stringify(seed)} and its cells are frozen`, () => {
    const face = identicon(seed);
    assert.equal(Object.isFrozen(face), true);
    assert.equal(Object.isFrozen(face.cells), true);
    assertPinned(face, seed);
  });
}

// Extends the public test's two assignments: every way of writing to a frozen
// object or array throws in strict mode, and leaves the face as it was.
test('[happy-5] no write to the result for "a" or its cells gets through', () => {
  const face = identicon("a");
  const writable = face as unknown as Record<string, unknown>;
  const cells = face.cells as boolean[];
  const attempts: [string, () => unknown][] = [
    ["assign cells", () => (writable.cells = [])],
    ["add a key", () => (writable.extra = 1)],
    ["delete hue", () => delete writable.hue],
    ["define a key", () => Object.defineProperty(face, "extra", { value: 1 })],
    ["assign the last cell", () => (cells[24] = false)],
    ["assign past the end", () => (cells[25] = true)],
    ["truncate", () => (cells.length = 0)],
    ["pop", () => cells.pop()],
    ["shift", () => cells.shift()],
    ["unshift", () => cells.unshift(true)],
    ["splice", () => cells.splice(0, 1)],
    ["fill", () => cells.fill(false)],
    ["reverse", () => cells.reverse()],
    ["sort", () => cells.sort()],
  ];
  for (const [label, attempt] of attempts) {
    assert.throws(attempt, TypeError, label);
  }
  assert.deepEqual(Reflect.ownKeys(face).sort(), ["cells", "hue"]);
  assertPinned(face, "a");
  assertPinned(identicon("a"), "a");
});

// ---- concurrency-1: call order ----------------------------------------------

// Extends the public test to other orders: every pinned face, after every
// other pinned seed has been called, in forward and reverse order.
test("[concurrency-1] each pinned face is unchanged by the calls before it, in either order", () => {
  const seeds = Object.keys(FACES);
  for (const order of [seeds, [...seeds].reverse()]) {
    for (const seed of order) assertPinned(identicon(seed), seed);
  }
});

// A module-level byte buffer that is not cleared between calls would leave a
// long seed's tail behind for a short one.
test('[concurrency-1] a short seed after a long one: "a" after "x" repeated 100000 times', () => {
  identicon("x".repeat(100000));
  assertPinned(identicon("a"), "a");
  identicon("\u{1F600}".repeat(3000));
  assertPinned(identicon(""), "");
  assertPinned(identicon("user-2"), "user-2");
});

// Calls with other non-strings in between leave nothing behind, whatever
// they did themselves.
test('[concurrency-1] calls with a Symbol, a String object and a coercible object do not change "user-1"', () => {
  for (const value of [Symbol("user-1"), new String("user-2"), { toString: () => "a" }]) {
    try {
      identicon(value as unknown as string);
    } catch {
      // Their outcome is unhappy-1 and unhappy-2's to assert.
    }
  }
  assertPinned(identicon("user-1"), "user-1");
});

test('[concurrency-1] a thousand calls with other seeds do not change "user-1" or "user-2"', () => {
  for (let i = 0; i < 1000; i++) identicon(`seed-${i}`);
  assertPinned(identicon("user-1"), "user-1");
  assertPinned(identicon("user-2"), "user-2");
});

// ---- concurrency-2: overlapping async tasks ---------------------------------

// Extends the public 100-task tests: 600 tasks over six seeds, resuming in a
// scrambled order, each checked against its pinned face.
test("[concurrency-2] 600 overlapping tasks over six seeds each get the pinned face", async () => {
  const seeds = Object.keys(FACES);
  const results = await Promise.all(
    Array.from({ length: 600 }, async (_, i) => {
      const seed = seeds[(i * 5) % seeds.length] ?? "a";
      for (let hop = 0; hop < (i * 13) % 17; hop++) await Promise.resolve();
      return { seed, face: identicon(seed) };
    }),
  );
  assert.equal(results.length, 600);
  for (const { seed, face } of results) assertPinned(face, seed);
});

// Tasks that interleave rejected calls with good ones still agree with
// sequential calls, and every result is its own frozen object.
test("[concurrency-2] overlapping tasks that mix rejected seeds with good ones agree with sequential calls", async () => {
  const results = await Promise.all(
    Array.from({ length: 200 }, async (_, i) => {
      for (let hop = 0; hop < (i * 7) % 5; hop++) await Promise.resolve();
      if (i % 3 === 2) {
        assertSeedRejected(i);
        return undefined;
      }
      const seed = i % 3 === 0 ? "user-1" : LONG_SEED;
      return { seed, face: identicon(seed) };
    }),
  );
  const user1 = identicon("user-1");
  const long = identicon(LONG_SEED);
  const faces = new Set<Identicon>();
  for (const result of results) {
    if (result === undefined) continue;
    assert.deepEqual(result.face, result.seed === "user-1" ? user1 : long);
    assert.equal(Object.isFrozen(result.face), true);
    faces.add(result.face);
  }
  assert.equal(faces.size, 134);
  assertPinned(user1, "user-1");
  assertPinned(long, LONG_SEED);
});
