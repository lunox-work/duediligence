/**
 * Hidden tests for the identicon contract: seeds that are not strings. Each
 * throws the spec's TypeError and is never coerced, whatever it would coerce
 * to and whether coercing it would throw an error of its own.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { identicon } from "../../src/identicon.js";

const SEED_MESSAGE = "identicon: seed must be a string";

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

// ---- unhappy-1: non-string seeds --------------------------------------------

// Extends the public undefined/null/42/{}/["a"] tests to the other primitive
// types and other numbers.
for (const [label, value] of [
  ["true", true],
  ["false", false],
  ["0", 0],
  ["-1", -1],
  ["NaN", Number.NaN],
  ["1n", 1n],
] as const) {
  test(`[unhappy-1] a ${label} seed throws the seed TypeError`, () => {
    assertSeedRejected(value);
  });
}

// String(symbol) works but `"" + symbol` throws its own TypeError: either way
// the message must be the spec's.
test("[unhappy-1] a Symbol seed throws the seed TypeError, not a conversion error", () => {
  assertSeedRejected(Symbol("a"));
});

// Each of these coerces to a string an implementation could hash.
for (const [label, value] of [
  ["[] (coerces to the empty string)", []],
  ['[""]', [""]],
  ['["user", "1"] (coerces to "user,1")', ["user", "1"]],
  ['an object whose toString returns "a"', { toString: () => "a" }],
  ['an object whose valueOf returns "a"', { valueOf: () => "a" }],
  ['an object whose Symbol.toPrimitive returns "a"', { [Symbol.toPrimitive]: () => "a" }],
  ['an object tagged as a String', { [Symbol.toStringTag]: "String" }],
  ['a function returning "a"', () => "a"],
  ["a Number object", new Number(42)],
  ["a Boolean object", new Boolean(true)],
] as const) {
  test(`[unhappy-1] ${label} throws rather than being coerced`, () => {
    assertSeedRejected(value);
  });
}

// An object whose coercion throws would surface its own error if the
// implementation tried to coerce it before checking the type.
test("[unhappy-1] an object whose toString throws gets the seed TypeError, not its own error", () => {
  let coerced = false;
  assertSeedRejected({
    toString(): string {
      coerced = true;
      throw new Error("coerced");
    },
  });
  assert.equal(coerced, false);
});

// The UTF-8 bytes of "a" are what the hash reads, but the input must be a
// string, not bytes.
test('[unhappy-1] the bytes of "a" as a Uint8Array throw rather than being hashed', () => {
  assertSeedRejected(new TextEncoder().encode("a"));
});

// ---- unhappy-2: String objects ----------------------------------------------

// Extends the public new String("a") and new String("") tests to other
// contents.
for (const [label, value] of [
  ['new String("user-1")', new String("user-1")],
  ['new String("\\uD800")', new String("\uD800")],
  ['new String("x".repeat(10000))', new String("x".repeat(10000))],
  ['Object("a")', Object("a")],
] as const) {
  test(`[unhappy-2] ${label} is not a string seed`, () => {
    assertSeedRejected(value);
  });
}

// A String subclass instance is still an object, whatever its prototype says.
test("[unhappy-2] an instance of a String subclass is not a string seed", () => {
  class Seed extends String {}
  assertSeedRejected(new Seed("a"));
});
