import assert from "node:assert/strict";
import { test } from "node:test";

import { canonicalJson, GRAPHIFY_TOOL_VERSION } from "../../src/analysis.js";

/**
 * The canonical JSON encoding: compact, keys sorted by UTF-16 code unit at
 * every depth, strings and numbers as `JSON.stringify` writes them, and a
 * `TypeError` for anything that is not plain JSON data.
 */

function assertTypeError(fn: () => unknown, message: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof TypeError, `expected a TypeError, got ${String(error)}`);
    assert.equal(error.message, message);
    return true;
  });
}

function nullProto(entries: [string, unknown][]): Record<string, unknown> {
  const o = Object.create(null) as Record<string, unknown>;
  for (const [key, value] of entries) {
    o[key] = value;
  }
  return o;
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) {
    return [[...items]];
  }
  const result: T[][] = [];
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) {
      result.push([item, ...tail]);
    }
  });
  return result;
}

const UNDEFINED = "canonicalJson cannot encode undefined";
const FUNCTION = "canonicalJson cannot encode a function";
const SYMBOL = "canonicalJson cannot encode a symbol";
const BIGINT = "canonicalJson cannot encode a bigint";
const NON_FINITE = "canonicalJson cannot encode a non-finite number";
const NON_PLAIN = "canonicalJson cannot encode a non-plain object";
const CYCLIC = "canonicalJson cannot encode a cyclic structure";

// happy-6

// Extends "[happy-6] values are written as compact JSON with sorted keys":
// a larger, deeper manifest-like value.
test("[happy-6] a nested manifest is written compactly with sorted keys", () => {
  const manifest = {
    version: GRAPHIFY_TOOL_VERSION,
    status: "succeeded",
    error: null,
    ok: true,
    retried: false,
    ratio: 0.5,
    artifacts: [
      { path: "graph.json", kind: "graph_json", bytes: 1024 },
      { path: "report.md", kind: "report_md", bytes: 0 },
    ],
    nested: { deep: { deeper: { deepest: [1, [2, [3, []]]] } } },
  };
  assert.equal(
    canonicalJson(manifest),
    '{"artifacts":[{"bytes":1024,"kind":"graph_json","path":"graph.json"},' +
      '{"bytes":0,"kind":"report_md","path":"report.md"}],' +
      '"error":null,"nested":{"deep":{"deeper":{"deepest":[1,[2,[3,[]]]]}}},' +
      '"ok":true,"ratio":0.5,"retried":false,"status":"succeeded",' +
      '"version":"graphifyy@0.4.18+driver-1"}',
  );
});

// Extends "[happy-6] values are written as compact JSON with sorted keys":
// whitespace inside strings and keys is data, not layout, and is kept.
test("[happy-6] spaces and tabs inside strings and keys are kept", () => {
  assert.equal(canonicalJson("a b  c"), '"a b  c"');
  assert.equal(canonicalJson({ "a key": "a value", b: [" ", "x y"] }), '{"a key":"a value","b":[" ","x y"]}');
  assert.equal(canonicalJson({ t: "x\ty" }), '{"t":"x\\ty"}');
});

// Extends "[happy-6] values are written as compact JSON with sorted keys": other primitives.
test("[happy-6] other numbers and non-ASCII strings are written as they are", () => {
  assert.equal(canonicalJson(0), "0");
  assert.equal(canonicalJson(-42), "-42");
  assert.equal(canonicalJson(3.25), "3.25");
  assert.equal(canonicalJson("wörld 日本 😀"), '"wörld 日本 😀"');
  assert.equal(canonicalJson([null, false, true, 0, "", [], {}]), '[null,false,true,0,"",[],{}]');
});

// Extends "[happy-6] values are written as compact JSON with sorted keys": a long array keeps its order.
test("[happy-6] a long array keeps every element in order", () => {
  const values = Array.from({ length: 500 }, (_, i) => (i * 37) % 500);
  assert.equal(canonicalJson(values), `[${values.join(",")}]`);
  const objects = values.slice(0, 50).map((n) => ({ n, m: -n }));
  assert.equal(canonicalJson(objects), `[${objects.map((o) => `{"m":${o.m === 0 ? 0 : o.m},"n":${o.n}}`).join(",")}]`);
});

// happy-7

// Extends "[happy-7] key order in nested objects does not change the output":
// every insertion order of four keys, at the top and one level down.
test("[happy-7] every insertion order of the keys gives the same output", () => {
  const keys = ["d", "b", "c", "a"];
  const expected = '{"a":1,"b":2,"c":{"a":1,"b":2,"c":3,"d":4},"d":4}';
  const values: Record<string, number> = { a: 1, b: 2, c: 3, d: 4 };
  for (const outer of permutations(keys)) {
    for (const inner of [outer, [...outer].reverse()]) {
      const nested: Record<string, number> = {};
      for (const key of inner) {
        nested[key] = values[key] as number;
      }
      const o: Record<string, unknown> = {};
      for (const key of outer) {
        o[key] = key === "c" ? nested : values[key];
      }
      assert.equal(canonicalJson(o), expected, `order ${outer.join("")} / ${inner.join("")}`);
    }
  }
});

// Extends "[happy-7] key order in the input does not change the output":
// objects inside arrays at depth, in reversed orders.
test("[happy-7] reversed key orders inside arrays give the same output", () => {
  const a = [{ x: [{ k: 1, j: 2, i: 3 }], w: 0 }, [{ b: 1, a: 2 }]];
  const b = [{ w: 0, x: [{ i: 3, j: 2, k: 1 }] }, [{ a: 2, b: 1 }]];
  const expected = '[{"w":0,"x":[{"i":3,"j":2,"k":1}]},[{"a":2,"b":1}]]';
  assert.equal(canonicalJson(a), expected);
  assert.equal(canonicalJson(b), expected);
});

// happy-8

// Extends "[happy-8] the input is not modified": arrays are not sorted in place,
// and nested objects, null-prototype objects and skipped properties stay as they were.
test("[happy-8] arrays, nested objects and skipped properties are left as they were", () => {
  const sym = Symbol("s");
  const inner = nullProto([
    ["z", 1],
    ["y", 2],
  ]);
  const list = Object.assign([3, 1, 2, { q: 1, p: 2 }], { extra: "kept" });
  const input: Record<string | symbol, unknown> = { c: list, b: undefined, a: inner, [sym]: "s" };
  assert.equal(canonicalJson(input), '{"a":{"y":2,"z":1},"c":[3,1,2,{"p":2,"q":1}]}');
  assert.deepEqual(Object.keys(input), ["c", "b", "a"]);
  assert.ok("b" in input);
  assert.equal(input[sym], "s");
  assert.equal(input["c"], list);
  assert.deepEqual([...list], [3, 1, 2, { q: 1, p: 2 }]);
  assert.deepEqual(Object.keys(list[3] as object), ["q", "p"]);
  assert.equal(list.extra, "kept");
  assert.equal(input["a"], inner);
  assert.deepEqual(Object.keys(inner), ["z", "y"]);
  assert.equal(Object.getPrototypeOf(inner), null);
});

// Extends "[happy-8] the input is not modified": encoding twice gives the same bytes.
test("[happy-8] encoding the same input twice gives the same output and leaves it intact", () => {
  const input = { z: [{ b: 2, a: 1 }], y: "y" };
  const first = canonicalJson(input);
  const second = canonicalJson(input);
  assert.equal(first, '{"y":"y","z":[{"a":1,"b":2}]}');
  assert.equal(second, first);
  assert.deepEqual(Object.keys(input), ["z", "y"]);
  assert.deepEqual(Object.keys(input.z[0] as object), ["b", "a"]);
});

// Extends "[happy-8] the input is not modified": a refused input is not modified either.
test("[happy-8] an input that is refused is left as it was", () => {
  const input: Record<string, unknown> = { b: [2, 1], a: { d: 1, c: 2 }, z: () => 1 };
  assertTypeError(() => canonicalJson(input), FUNCTION);
  assert.deepEqual(Object.keys(input), ["b", "a", "z"]);
  assert.deepEqual(input["b"], [2, 1]);
  assert.deepEqual(Object.keys(input["a"] as object), ["d", "c"]);
});

// boundary-3

// Extends "[boundary-3] keys sort by UTF-16 code unit ...": case, punctuation and accents,
// where a locale-aware comparison orders them differently.
test("[boundary-3] upper case, punctuation and accents sort by code unit, not by locale", () => {
  const o: Record<string, number> = {};
  for (const [i, key] of ["e", "é", "a", "_", "Z", "E", "B", "~", "A"].entries()) {
    o[key] = i;
  }
  assert.equal(canonicalJson(o), '{"A":8,"B":6,"E":5,"Z":4,"_":3,"a":2,"e":0,"~":7,"é":1}');
});

// Extends "[boundary-3] keys sort by UTF-16 code unit ...": prefixes, the empty key and spaces.
test("[boundary-3] a key sorts before every longer key it is a prefix of", () => {
  const o: Record<string, number> = {};
  for (const [i, key] of ["ab", "a b", "aa", "a", "", " ", "b"].entries()) {
    o[key] = i;
  }
  assert.equal(canonicalJson(o), '{"":4," ":5,"a":3,"a b":1,"aa":2,"ab":0,"b":6}');
});

// Extends "[boundary-3] code-unit order holds for integer-like and astral keys":
// more integer-like keys, including array-index-sized and larger ones.
test("[boundary-3] integer-like keys sort as strings", () => {
  const o: Record<string, number> = {};
  for (const [i, key] of ["2", "100", "10", "1", "0", "01", "-1", "1.5", "4294967295", "4294967294"].entries()) {
    o[key] = i;
  }
  assert.equal(
    canonicalJson(o),
    '{"-1":6,"0":4,"01":5,"1":3,"1.5":7,"10":2,"100":1,"2":0,"4294967294":9,"4294967295":8}',
  );
});

// Extends "[boundary-3] code-unit order holds for integer-like and astral keys":
// astral keys against high BMP keys, where code-point order differs.
test("[boundary-3] astral keys sort by their surrogates before high BMP keys", () => {
  const o: Record<string, number> = {};
  o["￿"] = 1;
  o["ｚ"] = 2;
  o[""] = 3;
  o["😀"] = 4;
  o["𝒜"] = 5;
  o["z"] = 6;
  assert.equal(canonicalJson(o), '{"z":6,"𝒜":5,"😀":4,"":3,"ｚ":2,"￿":1}');
});

// Extends "[boundary-3] code-unit order holds ... at any depth": in null-prototype objects and deep arrays.
test("[boundary-3] code-unit order holds inside null-prototype objects and deep arrays", () => {
  const value = [[nullProto([
    ["b", 1],
    ["B", 2],
    ["10", 3],
    ["9", 4],
  ])]];
  assert.equal(canonicalJson(value), '[[{"10":3,"9":4,"B":2,"b":1}]]');
});

// Extends "[boundary-3] ...": an own "__proto__" key is a key like any other.
test("[boundary-3] an own __proto__ key is written and sorted like any other key", () => {
  const parsed = JSON.parse('{"b":1,"__proto__":{"y":1,"x":2},"Z":3}') as unknown;
  assert.equal(canonicalJson(parsed), '{"Z":3,"__proto__":{"x":2,"y":1},"b":1}');
});

// boundary-4

// Extends "[boundary-4] nested numbers and strings match JSON.stringify":
// every single UTF-16 code unit, as a value and as a key.
test("[boundary-4] every single code unit is written as JSON.stringify writes it", () => {
  for (let unit = 0; unit <= 0xffff; unit += 1) {
    const s = String.fromCharCode(unit);
    assert.equal(canonicalJson(s), JSON.stringify(s), `U+${unit.toString(16)}`);
    if (unit < 0x100 || (unit >= 0xd800 && unit <= 0xdfff) || unit === 0x2028 || unit === 0x2029) {
      assert.equal(canonicalJson({ [s]: s }), JSON.stringify({ [s]: s }), `key U+${unit.toString(16)}`);
    }
  }
});

// Extends "[boundary-4] numbers and strings are written as JSON.stringify writes them":
// surrogate pairs, reversed pairs and escapes in keys among sorted keys.
test("[boundary-4] surrogate pairs stay whole and keys are escaped as strings are", () => {
  assert.equal(canonicalJson("😀"), '"😀"');
  assert.equal(canonicalJson("\ude00\ud83d"), '"\\ude00\\ud83d"');
  assert.equal(canonicalJson("a\ud83d"), '"a\\ud83d"');
  assert.equal(canonicalJson("  /\u007f"), JSON.stringify("  /\u007f"));
  assert.equal(canonicalJson({ "b\n": 1, 'a"': 2, "\\": 3 }), '{"\\\\":3,"a\\"":2,"b\\n":1}');
  assert.equal(canonicalJson({ "\b\f\r": [1] }), '{"\\b\\f\\r":[1]}');
});

// Extends "[boundary-4] numbers and strings are written as JSON.stringify writes them":
// other exponents, extremes and integers.
test("[boundary-4] extreme and exponent numbers are written as JSON.stringify writes them", () => {
  const values = [
    1e20,
    -1e21,
    1e-6,
    1e-7,
    -1.5e-10,
    123456789012345680000,
    Number.MAX_VALUE,
    -Number.MAX_VALUE,
    Number.MIN_VALUE,
    Number.MAX_SAFE_INTEGER,
    2 ** 53 + 2,
    Number.EPSILON,
    1 / 3,
  ];
  for (const value of values) {
    assert.equal(canonicalJson(value), JSON.stringify(value), String(value));
  }
  assert.equal(canonicalJson(values), JSON.stringify(values));
  assert.equal(canonicalJson([-0, 1e21, -1e-7, 5e-324]), "[0,1e+21,-1e-7,5e-324]");
  assert.equal(canonicalJson({ z: -0, a: 1e21 }), '{"a":1e+21,"z":0}');
});

// boundary-5

// Extends "[boundary-5] object properties whose value is undefined are left out":
// the undefined property first, in the middle or last in sorted order.
test("[boundary-5] an undefined property is left out wherever it sorts", () => {
  assert.equal(canonicalJson({ b: 1, a: undefined }), '{"b":1}');
  assert.equal(canonicalJson({ c: 1, b: undefined, a: 2 }), '{"a":2,"c":1}');
  assert.equal(canonicalJson({ z: undefined, a: 1 }), '{"a":1}');
  assert.equal(canonicalJson({ a: undefined, b: undefined, c: 3, d: undefined }), '{"c":3}');
});

// Extends "[boundary-5] an object whose only properties are undefined is written empty":
// null-prototype objects and objects deep in arrays.
test("[boundary-5] undefined properties are left out of null-prototype and deeply nested objects", () => {
  const o = nullProto([
    ["b", undefined],
    ["a", nullProto([["u", undefined]])],
  ]);
  assert.equal(canonicalJson(o), '{"a":{}}');
  assert.equal(canonicalJson([[{ x: undefined, y: [{ z: undefined }] }]]), '[[{"y":[{}]}]]');
});

// boundary-6

// Extends "[boundary-6] a nested object with no prototype is accepted":
// several levels, with keys to sort and an own "__proto__" key.
test("[boundary-6] null-prototype objects at several levels are written with sorted keys", () => {
  const o = nullProto([
    ["__proto__", 1],
    ["b", nullProto([["d", nullProto([])], ["c", [nullProto([["y", 1], ["x", 2]])]]])],
    ["Z", 3],
  ]);
  assert.equal(canonicalJson(o), '{"Z":3,"__proto__":1,"b":{"c":[{"x":2,"y":1}],"d":{}}}');
  assert.equal(canonicalJson(nullProto([])), "{}");
});

// boundary-7

// Extends "[boundary-7] symbol keys and extra array properties are ignored":
// whatever their values are.
test("[boundary-7] ignored properties are ignored even when their values could not be encoded", () => {
  const o = { a: 1, [Symbol("f")]: () => 1, [Symbol("b")]: 10n, [Symbol("u")]: undefined };
  assert.equal(canonicalJson(o), '{"a":1}');
  const arr: unknown[] = [1, 2];
  Object.assign(arr, { fn: () => 1, big: 10n, none: undefined, self: arr, "-1": 9, "1.5": 9 });
  assert.equal(canonicalJson(arr), "[1,2]");
  assert.equal(canonicalJson({ list: arr }), '{"list":[1,2]}');
});

// Extends "[boundary-7] ...": symbol keys on null-prototype objects and empty arrays with extras.
test("[boundary-7] symbol keys on null-prototype objects and extras on empty arrays are ignored", () => {
  const o = nullProto([["b", 1]]);
  (o as Record<symbol, unknown>)[Symbol("s")] = 2;
  const empty = Object.assign([], { extra: { k: 1 } });
  assert.equal(canonicalJson(o), '{"b":1}');
  assert.equal(canonicalJson(empty), "[]");
  assert.equal(canonicalJson({ [Symbol("only")]: 1 }), "{}");
});

// boundary-8

// Extends "[boundary-8] a value shared by two branches but not cyclic is written at both places":
// at different depths, many times, and after its first subtree is finished.
test("[boundary-8] a shared value is written at every depth it appears", () => {
  const leaf = [1];
  const shared = { d: leaf, c: 0 };
  const value = { e: [shared, [shared]], b: { c: { d: shared } }, a: shared, z: leaf };
  const s = '{"c":0,"d":[1]}';
  assert.equal(canonicalJson(value), `{"a":${s},"b":{"c":{"d":${s}}},"e":[${s},[${s}]],"z":[1]}`);
});

// Extends "[boundary-8] an array shared by siblings is written at each place": many repeats.
test("[boundary-8] a value repeated many times in one array is written each time", () => {
  const shared = nullProto([["k", [true]]]);
  const value = Array.from({ length: 25 }, () => shared);
  assert.equal(canonicalJson(value), `[${Array.from({ length: 25 }, () => '{"k":[true]}').join(",")}]`);
});

// unhappy-4

// Extends "[unhappy-4] nested values that are not plain data are refused":
// values JSON.stringify would quietly drop or write as null.
test("[unhappy-4] values JSON.stringify would drop or write as null are refused", () => {
  assertTypeError(() => canonicalJson({ s: Symbol("s") }), SYMBOL);
  assertTypeError(() => canonicalJson([Symbol("s")]), SYMBOL);
  assertTypeError(() => canonicalJson([() => 1]), FUNCTION);
  assertTypeError(() => canonicalJson([Number.NaN]), NON_FINITE);
  assertTypeError(() => canonicalJson({ n: Number.NaN }), NON_FINITE);
  assertTypeError(() => canonicalJson([undefined]), UNDEFINED);
  assertTypeError(() => canonicalJson({ a: [undefined] }), UNDEFINED);
});

// Extends "[unhappy-4] top-level values that are not plain data are refused": other top-level values.
test("[unhappy-4] other top-level values that are not plain data are refused", () => {
  assertTypeError(() => canonicalJson(Number.POSITIVE_INFINITY), NON_FINITE);
  assertTypeError(() => canonicalJson(Number.NEGATIVE_INFINITY), NON_FINITE);
  assertTypeError(() => canonicalJson(0n), BIGINT);
  assertTypeError(() => canonicalJson(function named() {}), FUNCTION);
  assertTypeError(() => canonicalJson(class C {}), FUNCTION);
  assertTypeError(() => canonicalJson(Symbol.iterator), SYMBOL);
});

// Extends "[unhappy-4] top-level values that are not plain data are refused": other non-plain objects.
test("[unhappy-4] other non-plain objects are refused, at the top and nested", () => {
  class Point {
    x = 1;
  }
  const nonPlain: unknown[] = [
    new Set([1]),
    new WeakMap(),
    /re/,
    new Error("e"),
    new Number(1),
    new Boolean(false),
    Object(Symbol("s")),
    Object(10n),
    new Uint8Array(2),
    new ArrayBuffer(2),
    new Point(),
    Object.create({}),
    Object.create(nullProto([])),
    Object.create(Array.prototype),
  ];
  for (const value of nonPlain) {
    assertTypeError(() => canonicalJson(value), NON_PLAIN);
    assertTypeError(() => canonicalJson([value]), NON_PLAIN);
    assertTypeError(() => canonicalJson({ v: value }), NON_PLAIN);
  }
});

// Extends "[unhappy-4] nested values that are not plain data are refused": deep inside
// arrays, plain objects and null-prototype objects.
test("[unhappy-4] values deep in the structure are refused with the same message", () => {
  assertTypeError(() => canonicalJson({ a: { b: [1, { c: [10n] }] } }), BIGINT);
  assertTypeError(() => canonicalJson([[[[() => 1]]]]), FUNCTION);
  assertTypeError(() => canonicalJson({ a: [{ b: Number.NEGATIVE_INFINITY }] }), NON_FINITE);
  assertTypeError(() => canonicalJson([{ m: new Map() }]), NON_PLAIN);
  assertTypeError(() => canonicalJson(nullProto([["z", nullProto([["s", Symbol("s")]])]])), SYMBOL);
  assertTypeError(() => canonicalJson({ ok: 1, list: [1, 2, [3, undefined]] }), UNDEFINED);
});

// Extends "[unhappy-4] nested values that are not plain data are refused" ([1, , 3]): other holes.
test("[unhappy-4] holes anywhere in an array are refused as undefined", () => {
  assertTypeError(() => canonicalJson(new Array(3)), UNDEFINED);
  // eslint-disable-next-line no-sparse-arrays
  assertTypeError(() => canonicalJson([, 1]), UNDEFINED);
  // eslint-disable-next-line no-sparse-arrays
  assertTypeError(() => canonicalJson([1, ,]), UNDEFINED);
  // eslint-disable-next-line no-sparse-arrays
  assertTypeError(() => canonicalJson({ a: [[1, , 2]] }), UNDEFINED);
});

// Extends "[unhappy-4] nested values ... toJSON included": toJSON is never called,
// whether it is an own property or inherited from a class.
test("[unhappy-4] toJSON is refused as a function and never called", () => {
  let calls = 0;
  const own = {
    a: 1,
    toJSON: () => {
      calls += 1;
      return "replaced";
    },
  };
  assertTypeError(() => canonicalJson(own), FUNCTION);
  assertTypeError(() => canonicalJson([{ b: own }]), FUNCTION);
  assertTypeError(() => canonicalJson(nullProto([["toJSON", () => 1]])), FUNCTION);
  class Stamped {
    toJSON(): string {
      calls += 1;
      return "replaced";
    }
  }
  assertTypeError(() => canonicalJson(new Stamped()), NON_PLAIN);
  assertTypeError(() => canonicalJson({ s: new Stamped() }), NON_PLAIN);
  assertTypeError(() => canonicalJson([new Date(0)]), NON_PLAIN);
  assert.equal(calls, 0);
});

// unhappy-5

// Extends "[unhappy-5] a cycle two objects deep is refused": cycles that do not pass
// through the root, deeper cycles and cycles through null-prototype objects.
test("[unhappy-5] cycles below the root and deep cycles are refused", () => {
  const inner: Record<string, unknown> = { k: 1 };
  inner["self"] = inner;
  assertTypeError(() => canonicalJson({ a: { b: inner } }), CYCLIC);
  assertTypeError(() => canonicalJson([1, [2, { x: inner }]]), CYCLIC);

  const root: Record<string, unknown> = {};
  let node = root;
  for (let i = 0; i < 20; i += 1) {
    const next: Record<string, unknown> = { i };
    node["next"] = next;
    node = next;
  }
  node["back"] = root;
  assertTypeError(() => canonicalJson(root), CYCLIC);

  const bare = nullProto([["a", 1]]);
  bare["z"] = nullProto([["up", bare]]);
  assertTypeError(() => canonicalJson(bare), CYCLIC);
});

// Extends "[unhappy-5] a cyclic structure is refused": a cycle beside a shared, non-cyclic value.
test("[unhappy-5] a cycle is refused even beside a value that is only shared", () => {
  const shared = { k: 1 };
  const o: Record<string, unknown> = { a: shared, b: shared };
  o["c"] = { d: o };
  assertTypeError(() => canonicalJson(o), CYCLIC);
});

// unhappy-6

// Extends "[unhappy-6] a cycle from an object through an array back to it is refused":
// array-only cycles deeper down and cycles not through the root.
test("[unhappy-6] deeper cycles through arrays are refused", () => {
  const arr: unknown[] = [1];
  arr.push([2, [3, arr]]);
  assertTypeError(() => canonicalJson(arr), CYCLIC);

  const inner: unknown[] = [];
  inner.push(inner);
  assertTypeError(() => canonicalJson([[1], inner]), CYCLIC);
  assertTypeError(() => canonicalJson({ list: inner }), CYCLIC);

  const outer: unknown[] = [];
  outer.push({ x: [{ y: outer }] });
  assertTypeError(() => canonicalJson(outer), CYCLIC);
});
