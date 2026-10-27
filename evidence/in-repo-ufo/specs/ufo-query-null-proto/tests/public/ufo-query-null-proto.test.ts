import { expect, test } from "vitest";
import { parseQuery, stringifyQuery } from "../src/query";

// Results are compared by own enumerable properties (`toEqual`, `Object.keys`);
// the prototype is checked separately with `Object.getPrototypeOf`.

// @happy 1: A non-empty query yields a null-prototype object

test("[happy-1] parseQuery('a=1&b=2') has a null prototype and own keys a, b", () => {
  const result = parseQuery("a=1&b=2");
  expect(Object.getPrototypeOf(result)).toBe(null);
  expect(result).toEqual({ a: "1", b: "2" });
});

test("[happy-1] a leading '?' still yields a null-prototype object", () => {
  const result = parseQuery("?a=1&b=2");
  expect(Object.getPrototypeOf(result)).toBe(null);
  expect(Object.keys(result)).toEqual(["a", "b"]);
  expect(result).toEqual({ a: "1", b: "2" });
});

// @boundary 1: An empty query yields an empty null-prototype object

test("[boundary-1] parseQuery('') is an empty null-prototype object", () => {
  const result = parseQuery("");
  expect(Object.getPrototypeOf(result)).toBe(null);
  expect(Object.keys(result)).toEqual([]);
});

test("[boundary-1] parseQuery('?') is an empty null-prototype object", () => {
  const result = parseQuery("?");
  expect(Object.getPrototypeOf(result)).toBe(null);
  expect(Object.keys(result)).toEqual([]);
});

test("[boundary-1] parseQuery() with no arguments is an empty null-prototype object", () => {
  const result = parseQuery();
  expect(Object.getPrototypeOf(result)).toBe(null);
  expect(Object.keys(result)).toEqual([]);
});

// @boundary 2: The result exposes no inherited Object.prototype members

test("[boundary-2] parseQuery('a=1') exposes no toString, hasOwnProperty or valueOf", () => {
  const result = parseQuery("a=1") as Record<string, unknown>;
  expect(result.toString).toBeUndefined();
  expect(result.hasOwnProperty).toBeUndefined();
  expect(result.valueOf).toBeUndefined();
  expect("toString" in result).toBe(false);
});

test("[boundary-2] an empty result also inherits no Object.prototype members", () => {
  const result = parseQuery("") as Record<string, unknown>;
  expect(result.toString).toBeUndefined();
  expect(result.isPrototypeOf).toBeUndefined();
  expect(result.propertyIsEnumerable).toBeUndefined();
  expect("hasOwnProperty" in result).toBe(false);
  expect("valueOf" in result).toBe(false);
});

// @boundary 3: Only the top-level object has a null prototype

test("[boundary-3] a repeated key's value is an ordinary array", () => {
  const result = parseQuery("a=1&a=2");
  expect(Array.isArray(result.a)).toBe(true);
  expect(Object.getPrototypeOf(result.a)).toBe(Array.prototype);
  expect(result.a).toEqual(["1", "2"]);
});

test("[boundary-3] a repeated prototype-named key's value is an ordinary array", () => {
  const result = parseQuery("toString=a&toString=b&toString=c");
  expect(Object.getPrototypeOf(result)).toBe(null);
  expect(Array.isArray(result.toString)).toBe(true);
  expect(Object.getPrototypeOf(result.toString)).toBe(Array.prototype);
  expect(result.toString).toEqual(["a", "b", "c"]);
});

// @boundary 4: Every call returns a new object

test("[boundary-4] mutating one result does not affect the next call's result", () => {
  const first = parseQuery("a=1") as Record<string, string | string[]>;
  first.b = "x";
  const second = parseQuery("a=1");
  expect(second).not.toBe(first);
  expect(second).toEqual({ a: "1" });
  expect(Object.getPrototypeOf(second)).toBe(null);
});

test("[boundary-4] empty input returns a new, writable object on every call", () => {
  const first = parseQuery("") as Record<string, string | string[]>;
  first.b = "x";
  expect(first.b).toBe("x");
  const second = parseQuery("");
  expect(second).not.toBe(first);
  expect(Object.keys(second)).toEqual([]);
  expect(Object.getPrototypeOf(second)).toBe(null);
});

// @happy 2: A single occurrence yields the decoded string value

const singleOccurrence: Array<[string, string, string]> = [
  ["toString=foo", "toString", "foo"],
  ["valueOf=1", "valueOf", "1"],
  ["hasOwnProperty=x", "hasOwnProperty", "x"],
  ["isPrototypeOf=y", "isPrototypeOf", "y"],
  ["propertyIsEnumerable=z", "propertyIsEnumerable", "z"],
  ["toLocaleString=l", "toLocaleString", "l"],
  ["__defineGetter__=a", "__defineGetter__", "a"],
  ["__lookupSetter__=b", "__lookupSetter__", "b"],
  ["?toString=foo", "toString", "foo"],
  ["%74oString=foo", "toString", "foo"],
];

for (const [input, key, value] of singleOccurrence) {
  test(`[happy-2] parseQuery(${JSON.stringify(input)}) yields only ${key} = ${JSON.stringify(value)}`, () => {
    const result = parseQuery(input);
    expect(Object.keys(result)).toEqual([key]);
    expect(result[key]).toBe(value);
  });
}

test("[happy-2] a prototype-named key with an empty value after '=' yields an empty string", () => {
  const result = parseQuery("toString=");
  expect(Object.keys(result)).toEqual(["toString"]);
  expect(result.toString).toBe("");
});

// @boundary 5: A key with no "=" yields an empty string, not an array

test("[boundary-5] parseQuery('toString') yields { toString: '' }", () => {
  const result = parseQuery("toString");
  expect(result).toEqual({ toString: "" });
  expect(Array.isArray(result.toString)).toBe(false);
});

test("[boundary-5] several prototype-named keys with no '=' each yield an empty string", () => {
  const result = parseQuery("?valueOf&hasOwnProperty");
  expect(Object.keys(result)).toEqual(["valueOf", "hasOwnProperty"]);
  expect(result).toEqual({ valueOf: "", hasOwnProperty: "" });
});

// @happy 3: A repeated key collects only the query's own values

const repeatedKeys: Array<[string, string, string[]]> = [
  ["toString=a&toString=b", "toString", ["a", "b"]],
  ["valueOf=1&valueOf=2&valueOf=3", "valueOf", ["1", "2", "3"]],
  ["toString=&toString=x", "toString", ["", "x"]],
];

for (const [input, key, values] of repeatedKeys) {
  test(`[happy-3] parseQuery(${JSON.stringify(input)}) collects ${key} as ${JSON.stringify(values)}`, () => {
    const result = parseQuery(input);
    expect(result[key]).toEqual(values);
  });
}

test("[happy-3] a repeated prototype-named key with no '=' collects empty strings only", () => {
  const result = parseQuery("hasOwnProperty&hasOwnProperty");
  expect(result).toEqual({ hasOwnProperty: ["", ""] });
});

// @happy 4: Prototype-named keys mix with other keys in first-appearance order

test("[happy-4] parseQuery('a=1&toString=foo&b=2&a=3') keeps first-appearance order", () => {
  const result = parseQuery("a=1&toString=foo&b=2&a=3");
  expect(Object.keys(result)).toEqual(["a", "toString", "b"]);
  expect(result).toEqual({ a: ["1", "3"], toString: "foo", b: "2" });
});

test("[happy-4] a repeated prototype-named key keeps its first position", () => {
  const result = parseQuery("toString=1&a=2&toString=3");
  expect(Object.keys(result)).toEqual(["toString", "a"]);
  expect(result).toEqual({ toString: ["1", "3"], a: "2" });
});

// @happy 5: The result round-trips through stringifyQuery

test("[happy-5] stringifyQuery(parseQuery(...)) round-trips prototype-named keys", () => {
  expect(stringifyQuery(parseQuery("toString=foo&valueOf=1&valueOf=2"))).toBe(
    "toString=foo&valueOf=1&valueOf=2",
  );
});

test("[happy-5] a single prototype-named key round-trips through stringifyQuery", () => {
  expect(stringifyQuery(parseQuery("hasOwnProperty=x"))).toBe(
    "hasOwnProperty=x",
  );
});

// @unhappy 1: The reserved keys never appear in the result

const reservedKeys: Array<[string, Record<string, string>]> = [
  ["__proto__=x", {}],
  ["constructor=x", {}],
  ["__proto__", {}],
  ["%5F%5Fproto%5F%5F=x", {}],
  ["constructor=x&constructor=y", {}],
  ["a=1&__proto__=x&constructor=y&b=2", { a: "1", b: "2" }],
];

for (const [input, output] of reservedKeys) {
  test(`[unhappy-1] parseQuery(${JSON.stringify(input)}) drops the reserved keys`, () => {
    const result = parseQuery(input);
    expect(result).toEqual(output);
    expect(Object.keys(result)).toEqual(Object.keys(output));
    expect(Object.getPrototypeOf(result)).toBe(null);
  });
}

test("[unhappy-1] a percent-encoded 'constructor' with a leading '?' is dropped", () => {
  const result = parseQuery("?%63onstructor=x&toString=y");
  expect(Object.keys(result)).toEqual(["toString"]);
  expect(result).toEqual({ toString: "y" });
  expect(Object.getPrototypeOf(result)).toBe(null);
});

// @boundary 6: Keys that only resemble the reserved keys are kept

const resemblingKeys: Array<[string, Record<string, string>]> = [
  ["__PROTO__=x", { __PROTO__: "x" }],
  ["Constructor=x", { Constructor: "x" }],
  ["__proto__[]=x", { "__proto__[]": "x" }],
  ["prototype=x", { prototype: "x" }],
];

for (const [input, output] of resemblingKeys) {
  test(`[boundary-6] parseQuery(${JSON.stringify(input)}) keeps the look-alike key`, () => {
    const result = parseQuery(input);
    expect(result).toEqual(output);
    expect(Object.keys(result)).toEqual(Object.keys(output));
  });
}

test("[boundary-6] a key that decodes to 'constructor ' (trailing space) is kept", () => {
  const result = parseQuery("constructor+=x");
  expect(Object.keys(result)).toEqual(["constructor "]);
  expect(result).toEqual({ "constructor ": "x" });
});
