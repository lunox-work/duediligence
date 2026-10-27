import assert from "node:assert/strict";
import { test } from "node:test";

import { canonicalJson } from "../src/analysis.js";

/**
 * The canonical JSON used as cache-key input: compact, arrays in order, own
 * enumerable string keys sorted by UTF-16 code unit at every depth, strings
 * and numbers as `JSON.stringify` writes them, and refusal of anything that
 * is not a JSON value.
 */

const NOT_JSON = "Cache parameters must be JSON values.";

function assertRefused(value: unknown): void {
  assert.throws(
    () => canonicalJson(value),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.name, "Error");
      assert.equal(error instanceof TypeError, false);
      assert.equal(error.message, NOT_JSON);
      return true;
    },
  );
}

test("[happy-6] values are written compactly", () => {
  assert.equal(canonicalJson(null), "null");
  assert.equal(canonicalJson(true), "true");
  assert.equal(canonicalJson(42), "42");
  assert.equal(canonicalJson("héllo"), '"héllo"');
  assert.equal(canonicalJson([3, 1, 2]), "[3,1,2]");
  assert.equal(
    canonicalJson({ b: 1, a: [true, null], c: "x" }),
    '{"a":[true,null],"b":1,"c":"x"}',
  );
  assert.equal(canonicalJson({ z: { y: 1, x: 2 }, a: [] }), '{"a":[],"z":{"x":2,"y":1}}');
  assert.equal(canonicalJson({}), "{}");
});

test("[happy-6] empty containers nested at depth are written with no whitespace", () => {
  assert.equal(canonicalJson({ b: [[], {}], a: {} }), '{"a":{},"b":[[],{}]}');
  assert.equal(canonicalJson(false), "false");
  assert.equal(canonicalJson(""), '""');
  assert.equal(canonicalJson([]), "[]");
});

test("[happy-7] key order in the input does not change the output", () => {
  const a = { b: 1, a: [true, null], c: "x" };
  const b = { c: "x", a: [true, null], b: 1 };
  assert.equal(canonicalJson(a), '{"a":[true,null],"b":1,"c":"x"}');
  assert.equal(canonicalJson(b), '{"a":[true,null],"b":1,"c":"x"}');
});

test("[happy-7] key order does not matter at any depth, including inside arrays", () => {
  const a = { outer: [{ y: { q: 1, p: 2 }, x: 0 }], inner: { b: 1, a: 2 } };
  const b = { inner: { a: 2, b: 1 }, outer: [{ x: 0, y: { p: 2, q: 1 } }] };
  const expected = '{"inner":{"a":2,"b":1},"outer":[{"x":0,"y":{"p":2,"q":1}}]}';
  assert.equal(canonicalJson(a), expected);
  assert.equal(canonicalJson(b), expected);
});

test("[happy-8] the input is not modified", () => {
  const input = { b: [2, 1], a: { d: 1, c: 2 } };
  canonicalJson(input);
  assert.deepEqual(Object.keys(input), ["b", "a"]);
  assert.deepEqual(input.b, [2, 1]);
  assert.deepEqual(Object.keys(input.a), ["d", "c"]);
});

test("[happy-8] a deeply frozen input is accepted", () => {
  const inner = Object.freeze({ d: 1, c: 2 });
  const list = Object.freeze([2, 1]);
  const input = Object.freeze({ b: list, a: inner });
  assert.equal(canonicalJson(input), '{"a":{"c":2,"d":1},"b":[2,1]}');
});

test("[boundary-4] keys sort by UTF-16 code unit, not numerically or by code point", () => {
  const value = {
    b: 1,
    a: 2,
    B: 3,
    "10": 4,
    "9": 5,
    "ｚ": 6,
    "😀": 7,
    "é": 8,
  };
  assert.equal(
    canonicalJson(value),
    '{"10":4,"9":5,"B":3,"a":2,"b":1,"é":8,"😀":7,"ｚ":6}',
  );
});

test("[boundary-4] the empty key sorts first and a prefix sorts before its extensions", () => {
  assert.equal(
    canonicalJson({ ab: 3, a: 2, "": 1, aB: 4 }),
    '{"":1,"a":2,"aB":4,"ab":3}',
  );
});

test("[boundary-5] numbers and strings follow JSON.stringify", () => {
  assert.equal(canonicalJson(-0), "0");
  assert.equal(canonicalJson(1e21), "1e+21");
  assert.equal(canonicalJson(0.1 + 0.2), "0.30000000000000004");
  assert.equal(canonicalJson("\u0001"), '"\\u0001"');
  assert.equal(canonicalJson('a"b\\c\n'), '"a\\"b\\\\c\\n"');
  assert.equal(canonicalJson("\ud800"), '"\\ud800"');
  assert.equal(canonicalJson(Number.NaN), "null");
  assert.equal(canonicalJson([Number.POSITIVE_INFINITY]), "[null]");
  assert.equal(canonicalJson({ n: Number.NEGATIVE_INFINITY }), '{"n":null}');
});

test("[boundary-5] other numbers and strings match JSON.stringify exactly", () => {
  const values: unknown[] = [
    -1e21,
    1e-7,
    5e-7,
    Number.MAX_VALUE,
    Number.MIN_VALUE,
    -1.5,
    "\u001f",
    "\u007f",
    "\t\r\b\f",
    "\udc00x",
    "😀",
    " ",
    "/",
  ];
  for (const value of values) {
    assert.equal(canonicalJson(value), JSON.stringify(value));
  }
});

test("[boundary-6] an object with no prototype is accepted", () => {
  const o = Object.create(null) as Record<string, number>;
  o["b"] = 2;
  o["a"] = 1;
  assert.equal(canonicalJson(o), '{"a":1,"b":2}');
});

test("[boundary-6] an object with no prototype is accepted nested inside an array", () => {
  const o = Object.create(null) as Record<string, number>;
  o["y"] = 1;
  o["x"] = 2;
  assert.equal(canonicalJson([o, { o }]), '[{"x":2,"y":1},{"o":{"x":2,"y":1}}]');
});

test("[boundary-7] any other object is written as its own enumerable string keys", () => {
  class Built {
    b: number;
    a: number;
    constructor() {
      this.b = 1;
      this.a = 2;
    }
  }
  assert.equal(canonicalJson(new Date(0)), "{}");
  assert.equal(canonicalJson(new Map([[1, 2]])), "{}");
  assert.equal(canonicalJson(new String("x")), '{"0":"x"}');
  assert.equal(canonicalJson({ d: new Date(0) }), '{"d":{}}');
  assert.equal(canonicalJson(new Built()), '{"a":2,"b":1}');
});

test("[boundary-7] inherited and non-enumerable properties are left out", () => {
  class WithGetter {
    own = 1;
    get inherited(): number {
      return 2;
    }
  }
  const hidden = { shown: 1 };
  Object.defineProperty(hidden, "hidden", { value: 2, enumerable: false });
  const child = Object.create({ fromProto: 3 }) as Record<string, number>;
  child["mine"] = 4;
  assert.equal(canonicalJson(new WithGetter()), '{"own":1}');
  assert.equal(canonicalJson(hidden), '{"shown":1}');
  assert.equal(canonicalJson(child), '{"mine":4}');
});

test("[boundary-8] an array hole is written as nothing between the commas", () => {
  assert.equal(canonicalJson([1, , 3]), "[1,,3]");
});

test("[boundary-8] a leading hole is written as nothing before the first comma", () => {
  assert.equal(canonicalJson([, 1]), "[,1]");
});

test("[boundary-9] symbol keys and extra array properties are ignored", () => {
  const o = { a: 1, [Symbol("s")]: 2 };
  const arr = Object.assign([1, 2], { extra: 3 });
  assert.equal(canonicalJson(o), '{"a":1}');
  assert.equal(canonicalJson(arr), "[1,2]");
});

test("[boundary-9] ignored keys are ignored even when their values are not JSON", () => {
  const o = { a: 1, [Symbol("s")]: undefined, [Symbol("f")]: () => 1 };
  const arr = Object.assign([1, 2], { extra: undefined, fn: () => 1 });
  assert.equal(canonicalJson(o), '{"a":1}');
  assert.equal(canonicalJson(arr), "[1,2]");
});

test("[boundary-10] a value shared by two branches but not cyclic is written at both places", () => {
  const shared = { k: 1 };
  assert.equal(canonicalJson({ x: shared, y: [shared] }), '{"x":{"k":1},"y":[{"k":1}]}');
});

test("[boundary-10] an array shared by sibling elements is written at each place", () => {
  const shared = [1];
  assert.equal(canonicalJson([shared, shared, { s: shared }]), '[[1],[1],{"s":[1]}]');
});

test("[unhappy-1] undefined, functions and symbols are refused", () => {
  const values: unknown[] = [
    undefined,
    [1, undefined],
    { b: undefined, a: 1 },
    () => 1,
    { f: () => 1 },
    Symbol("s"),
    { toJSON: () => 1 },
  ];
  for (const value of values) {
    assertRefused(value);
  }
});

test("[unhappy-1] values that are not JSON are refused deep inside the structure", () => {
  assertRefused({ a: [{ b: [undefined] }] });
  assertRefused([[Symbol("s")]]);
  assertRefused({ z: { y: function named() {} } });
});

test("[unhappy-2] a bigint is refused with a TypeError", () => {
  assert.throws(() => canonicalJson(10n), TypeError);
  assert.throws(() => canonicalJson({ n: 10n }), TypeError);
});

test("[unhappy-2] a bigint deep inside an array is refused with a TypeError", () => {
  assert.throws(() => canonicalJson([1, { a: [0n] }]), TypeError);
});

test("[unhappy-3] a cyclic structure is refused with a RangeError", () => {
  const o: Record<string, unknown> = { a: 1 };
  o["self"] = o;
  assert.throws(() => canonicalJson(o), RangeError);
});

test("[unhappy-3] a cycle through an intermediate object is refused with a RangeError", () => {
  const o: Record<string, unknown> = { a: 1 };
  o["child"] = { back: o };
  assert.throws(() => canonicalJson(o), RangeError);
});

test("[unhappy-4] a cycle through an array is refused with a RangeError", () => {
  const arr: unknown[] = [];
  arr.push(arr);
  assert.throws(() => canonicalJson(arr), RangeError);
});

test("[unhappy-4] a cycle from an array through an object element is refused with a RangeError", () => {
  const arr: unknown[] = [];
  arr.push({ back: arr });
  assert.throws(() => canonicalJson(arr), RangeError);
});
