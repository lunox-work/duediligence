import assert from "node:assert/strict";
import { test } from "node:test";
import { recentReads } from "../../src/jira/recent.js";

// The Background clock: "now" returns the number held in "t", which starts at 1000000.
function fakeClock() {
  const clock = { t: 1000000, now: () => clock.t };
  return clock;
}

const TTL_MESSAGE = "ttlMs must be a positive finite number";
const MAX_MESSAGE = "max must be a positive integer";

// A RangeError itself, not just an error named like one, with exactly this message.
function rangeError(message: string) {
  return (error: unknown) => {
    assert.ok(error instanceof RangeError, `expected a RangeError, got ${String(error)}`);
    assert.equal(error.message, message);
    return true;
  };
}

// Extends "[boundary-13] the smallest valid options are accepted":
// the stores built from them work, each to its own ttl.
test("[boundary-13] stores built with ttlMs 1 or 0.5 and max 1 store and expire values", () => {
  const clock = fakeClock();
  const one = recentReads<string>({ now: clock.now, ttlMs: 1, max: 1 });
  const half = recentReads<string>({ now: clock.now, ttlMs: 0.5, max: 1 });
  one.set("k", "one");
  half.set("k", "half");
  assert.equal(one.get("k"), "one");
  assert.equal(half.get("k"), "half");
  clock.t = 1000000.5;
  assert.equal(one.get("k"), "one");
  assert.equal(half.get("k"), undefined);
  clock.t = 1000001;
  assert.equal(one.get("k"), undefined);
});

// Extends "[boundary-13] the smallest valid options are accepted": other small valid values,
// including a max of 1 written as a float literal and fractional ttlMs below 1.
test("[boundary-13] small valid ttlMs and max values are accepted", () => {
  const clock = fakeClock();
  for (const [ttlMs, max] of [
    [0.001, 1],
    [0.25, 2],
    [1, 1.0],
    [Number.EPSILON, 1],
  ] as Array<[number, number]>) {
    assert.doesNotThrow(() => recentReads({ now: clock.now, ttlMs, max }), `ttlMs ${ttlMs}, max ${max}`);
  }
});

// Extends "[unhappy-1] an invalid ttlMs is refused with a RangeError":
// other non-positive values, and the error is a real RangeError.
test("[unhappy-1] other non-positive ttlMs values are refused with a RangeError", () => {
  const clock = fakeClock();
  for (const ttlMs of [-0.5, -Number.MIN_VALUE, -60000, -Number.MAX_VALUE, 0, NaN, Infinity, -Infinity]) {
    assert.throws(
      () => recentReads({ now: clock.now, ttlMs, max: 10 }),
      rangeError(TTL_MESSAGE),
      `ttlMs ${ttlMs}`,
    );
  }
});

// Extends "[unhappy-1] an invalid ttlMs is refused with a RangeError": values that are not numbers
// are not finite numbers, even when they would convert to one.
test("[unhappy-1] a ttlMs that is a numeric string or an object is refused", () => {
  for (const ttlMs of ["60000", "1", [1], { valueOf: () => 1000 }] as unknown[]) {
    assert.throws(
      () => recentReads({ ttlMs: ttlMs as number }),
      rangeError(TTL_MESSAGE),
      `ttlMs ${JSON.stringify(ttlMs)}`,
    );
  }
});

// Extends "[unhappy-1] an invalid ttlMs is refused with a RangeError":
// only undefined takes the default, so null is an invalid ttlMs.
test("[unhappy-1] a ttlMs of null is refused rather than defaulted", () => {
  assert.throws(() => recentReads({ ttlMs: null as unknown as number }), rangeError(TTL_MESSAGE));
});

// Extends "[unhappy-2] an invalid max is refused with a RangeError":
// other non-integers and values below 1, and the error is a real RangeError.
test("[unhappy-2] other fractional or non-positive max values are refused with a RangeError", () => {
  const clock = fakeClock();
  for (const max of [2.5, 1000.5, 1.000001, 0.999, Number.MIN_VALUE, -2, -1000, 0, NaN, Infinity, -Infinity]) {
    assert.throws(
      () => recentReads({ now: clock.now, ttlMs: 1000, max }),
      rangeError(MAX_MESSAGE),
      `max ${max}`,
    );
  }
});

// Extends "[unhappy-2] an invalid max is refused with a RangeError": values that are not numbers
// are not integers, even when they would convert to one.
test("[unhappy-2] a max that is a numeric string or an object is refused", () => {
  for (const max of ["2", "1000", [2], { valueOf: () => 2 }] as unknown[]) {
    assert.throws(
      () => recentReads({ max: max as number }),
      rangeError(MAX_MESSAGE),
      `max ${JSON.stringify(max)}`,
    );
  }
});

// Extends "[unhappy-2] an invalid max is refused with a RangeError":
// only undefined takes the default, so null is an invalid max.
test("[unhappy-2] a max of null is refused rather than defaulted", () => {
  assert.throws(() => recentReads({ max: null as unknown as number }), rangeError(MAX_MESSAGE));
});

// Extends "[unhappy-3] when both are invalid, the ttlMs error wins":
// every pairing of an invalid ttlMs with an invalid max.
test("[unhappy-3] every pairing of invalid ttlMs and invalid max throws the ttlMs RangeError", () => {
  const clock = fakeClock();
  for (const ttlMs of [0, -1, NaN, Infinity, -Infinity]) {
    for (const max of [0, -1, 1.5, NaN, Infinity]) {
      assert.throws(
        () => recentReads({ now: clock.now, ttlMs, max }),
        rangeError(TTL_MESSAGE),
        `ttlMs ${ttlMs}, max ${max}`,
      );
    }
  }
});

// Extends "[unhappy-3] when both are invalid, the ttlMs error wins":
// the options object lists max before ttlMs.
test("[unhappy-3] the ttlMs error wins whatever order the options are written in", () => {
  const options = { max: 0.5, ttlMs: -5 };
  assert.throws(() => recentReads(options), rangeError(TTL_MESSAGE));
});
