import { expect, test } from "vitest";
import { parseQuery, stringifyQuery } from "../../src/query";

// Results are compared by own enumerable properties (`toEqual`, `Object.keys`);
// the prototype is checked separately with `Object.getPrototypeOf`.

// Every Object.prototype member except the two reserved keys.
const prototypeNames = Object.getOwnPropertyNames(Object.prototype).filter(
  (name) => name !== "__proto__" && name !== "constructor",
);

// @happy 1: A non-empty query yields a null-prototype object

test("[happy-1] the spec example parseQuery('a=1&b=2') has a null prototype", () => {
  const result = parseQuery("a=1&b=2");
  expect(Object.getPrototypeOf(result)).toBe(null);
  expect(Object.keys(result)).toEqual(["a", "b"]);
  expect(result).toEqual({ a: "1", b: "2" });
});

// Extends "[happy-1] parseQuery('a=1&b=2') has a null prototype ...": more keys, decoded values.
test("[happy-1] a query with decoded values, a bare key and a repeat has a null prototype", () => {
  const result = parseQuery("x=hello+world&y=%E5%A5%BD&z&w=1&x=2");
  expect(Object.getPrototypeOf(result)).toBe(null);
  expect(Object.keys(result)).toEqual(["x", "y", "z", "w"]);
  expect(result).toEqual({ x: ["hello world", "2"], y: "好", z: "", w: "1" });
});

// Extends "[happy-1] a leading '?' still yields a null-prototype object": a single key.
test("[happy-1] a single-key query with a leading '?' has a null prototype", () => {
  const result = parseQuery("?only=one");
  expect(Object.getPrototypeOf(result)).toBe(null);
  expect(result).toEqual({ only: "one" });
});

test("[happy-1] a query with many keys has a null prototype and keeps them all", () => {
  const input = Array.from({ length: 50 }, (_, i) => `k${i}=v${i}`).join("&");
  const result = parseQuery(input);
  expect(Object.getPrototypeOf(result)).toBe(null);
  expect(Object.keys(result)).toHaveLength(50);
  expect(result.k0).toBe("v0");
  expect(result.k49).toBe("v49");
});

// @boundary 1: An empty query yields an empty null-prototype object

// Extends the three public "[boundary-1]" tests: all three inputs again, with nothing inherited.
for (const input of ["", "?"]) {
  test(`[boundary-1] parseQuery(${JSON.stringify(input)}) is empty, null-prototype and has no own names`, () => {
    const result = parseQuery(input);
    expect(Object.getPrototypeOf(result)).toBe(null);
    expect(Object.keys(result)).toEqual([]);
    expect(Object.getOwnPropertyNames(result)).toEqual([]);
    expect(result).toEqual({});
  });
}

test("[boundary-1] parseQuery() with no arguments is empty, null-prototype and has no own names", () => {
  const result = parseQuery();
  expect(Object.getPrototypeOf(result)).toBe(null);
  expect(Object.keys(result)).toEqual([]);
  expect(Object.getOwnPropertyNames(result)).toEqual([]);
});

// @boundary 2: The result exposes no inherited Object.prototype members

// Extends "[boundary-2] parseQuery('a=1') exposes no toString, ...": every Object.prototype member.
test("[boundary-2] parseQuery('a=1') exposes none of the Object.prototype members", () => {
  const result = parseQuery("a=1") as Record<string, unknown>;
  expect(Object.getPrototypeOf(result)).toBe(null);
  for (const name of Object.getOwnPropertyNames(Object.prototype)) {
    expect(name in result, name).toBe(false);
    expect(result[name], name).toBeUndefined();
  }
  expect(result.a).toBe("1");
});

// Extends "[boundary-2] an empty result also inherits ...": a result with many keys.
test("[boundary-2] a larger result exposes no toString, valueOf, hasOwnProperty or __proto__", () => {
  const result = parseQuery("?a=1&b=2&a=3&c") as Record<string, unknown>;
  expect(result.toString).toBeUndefined();
  expect(result.valueOf).toBeUndefined();
  expect(result.hasOwnProperty).toBeUndefined();
  expect(result.toLocaleString).toBeUndefined();
  expect(result.__proto__).toBeUndefined();
  expect(result.constructor).toBeUndefined();
  expect("toString" in result).toBe(false);
  expect("constructor" in result).toBe(false);
  expect(Object.keys(result)).toEqual(["a", "b", "c"]);
});

test("[boundary-2] a result holding one prototype-named key inherits none of the others", () => {
  const result = parseQuery("toString=foo") as Record<string, unknown>;
  expect(result.toString).toBe("foo");
  expect(result.valueOf).toBeUndefined();
  expect(result.hasOwnProperty).toBeUndefined();
  expect("valueOf" in result).toBe(false);
  expect("isPrototypeOf" in result).toBe(false);
});

// @boundary 3: Only the top-level object has a null prototype

// Extends "[boundary-3] a repeated key's value is an ordinary array": several array values.
test("[boundary-3] every repeated key's value is an ordinary, usable array", () => {
  const result = parseQuery("a=1&b=x&a=2&b=y&b=z&a=3&c=only");
  expect(Object.getPrototypeOf(result)).toBe(null);
  for (const key of ["a", "b"]) {
    const value = result[key];
    expect(Array.isArray(value)).toBe(true);
    expect(Object.getPrototypeOf(value)).toBe(Array.prototype);
    expect(value).toBeInstanceOf(Array);
    expect(Object.isFrozen(value)).toBe(false);
  }
  expect((result.a as string[]).join(",")).toBe("1,2,3");
  expect((result.b as string[]).map((v) => v.toUpperCase())).toEqual([
    "X",
    "Y",
    "Z",
  ]);
  expect(result.c).toBe("only");
});

// Extends "[boundary-3] a repeated prototype-named key's value is an ordinary array": other names.
test("[boundary-3] repeated valueOf and hasOwnProperty values are ordinary arrays", () => {
  const result = parseQuery("valueOf=1&hasOwnProperty=a&valueOf=2&hasOwnProperty=b");
  expect(Object.getPrototypeOf(result)).toBe(null);
  for (const key of ["valueOf", "hasOwnProperty"]) {
    expect(Array.isArray(result[key])).toBe(true);
    expect(Object.getPrototypeOf(result[key])).toBe(Array.prototype);
  }
  expect(result.valueOf).toEqual(["1", "2"]);
  expect(result.hasOwnProperty).toEqual(["a", "b"]);
  (result.valueOf as unknown as string[]).push("3");
  expect(result.valueOf).toEqual(["1", "2", "3"]);
});

test("[boundary-3] a long repeated key yields an ordinary array of every value", () => {
  const input = Array.from({ length: 20 }, (_, i) => `a=${i}`).join("&");
  const result = parseQuery(input);
  expect(Object.getPrototypeOf(result)).toBe(null);
  expect(Object.getPrototypeOf(result.a)).toBe(Array.prototype);
  expect(result.a).toEqual(Array.from({ length: 20 }, (_, i) => String(i)));
});

// @boundary 4: Every call returns a new object

test("[boundary-4] the spec example: setting first.b leaves second untouched", () => {
  const first = parseQuery("a=1") as Record<string, string | string[]>;
  first.b = "x";
  const second = parseQuery("a=1");
  expect(second).not.toBe(first);
  expect(second).toEqual({ a: "1" });
  expect(Object.keys(second)).toEqual(["a"]);
  expect(Object.getPrototypeOf(second)).toBe(null);
});

// Extends "[boundary-4] mutating one result does not affect the next call's result":
// mutating an array value, overwriting and deleting keys.
test("[boundary-4] mutating a result's array, keys and values leaves the next result untouched", () => {
  const first = parseQuery("a=1&a=2&toString=t") as Record<
    string,
    string | string[]
  >;
  (first.a as string[]).push("99");
  first.toString = "changed";
  first.valueOf = "added";
  const second = parseQuery("a=1&a=2&toString=t");
  expect(second).not.toBe(first);
  expect(second.a).not.toBe(first.a);
  expect(Object.getPrototypeOf(second)).toBe(null);
  expect(Object.keys(second)).toEqual(["a", "toString"]);
  expect(second).toEqual({ a: ["1", "2"], toString: "t" });
});

// Extends "[boundary-4] empty input returns a new, writable object on every call": many calls, other inputs.
test("[boundary-4] many calls return distinct writable null-prototype objects", () => {
  const inputs = ["", "?", undefined, "a=1", ""];
  const results = inputs.map((input) => parseQuery(input));
  for (let i = 0; i < results.length; i++) {
    expect(Object.getPrototypeOf(results[i])).toBe(null);
    expect(Object.isFrozen(results[i])).toBe(false);
    for (let j = i + 1; j < results.length; j++) {
      expect(results[i]).not.toBe(results[j]);
    }
  }
  (results[0] as Record<string, string>).z = "1";
  expect(Object.keys(parseQuery())).toEqual([]);
  expect(Object.keys(parseQuery("?"))).toEqual([]);
});

test("[boundary-4] a deleted key on one result is present on the next", () => {
  const first = parseQuery("hasOwnProperty=1&b=2") as Record<string, string>;
  delete first.hasOwnProperty;
  const second = parseQuery("hasOwnProperty=1&b=2");
  expect(Object.getPrototypeOf(second)).toBe(null);
  expect(second).toEqual({ hasOwnProperty: "1", b: "2" });
});

// @happy 2: A single occurrence yields the decoded string value

const specSingleOccurrence: Array<[string, string, string]> = [
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

for (const [input, key, value] of specSingleOccurrence) {
  test(`[happy-2] spec example parseQuery(${JSON.stringify(input)}) on a null-prototype result`, () => {
    const result = parseQuery(input);
    expect(Object.getPrototypeOf(result)).toBe(null);
    expect(Object.keys(result)).toEqual([key]);
    expect(result[key]).toBe(value);
  });
}

// Extends the public "[happy-2]" table: every Object.prototype member name, including
// those it leaves out (__lookupGetter__, __defineSetter__, ...).
for (const name of prototypeNames) {
  test(`[happy-2] the Object.prototype name ${name} is an ordinary key`, () => {
    const result = parseQuery(`${name}=v-${name}`);
    expect(Object.keys(result)).toEqual([name]);
    expect(result[name]).toBe(`v-${name}`);
  });
}

// Extends "[happy-2] parseQuery(\"%74oString=foo\") ...": encoded keys and values.
const encodedSingleOccurrence: Array<[string, string, string]> = [
  ["%76alueOf=%31", "valueOf", "1"],
  ["%68%61%73OwnProperty=a+b", "hasOwnProperty", "a b"],
  ["toString=hello%20world", "toString", "hello world"],
  ["?__lookupGetter__=%E5%A5%BD", "__lookupGetter__", "好"],
  ["__defineSetter__=a%26b", "__defineSetter__", "a&b"],
  ["toLocaleString=x=y", "toLocaleString", "x=y"],
];

for (const [input, key, value] of encodedSingleOccurrence) {
  test(`[happy-2] parseQuery(${JSON.stringify(input)}) yields ${key} = ${JSON.stringify(value)}`, () => {
    const result = parseQuery(input);
    expect(Object.keys(result)).toEqual([key]);
    expect(result[key]).toBe(value);
  });
}

test("[happy-2] several distinct prototype-named keys each yield their own string", () => {
  const result = parseQuery(
    "valueOf=1&toString=2&isPrototypeOf=3&__lookupGetter__=4&propertyIsEnumerable=5",
  );
  expect(Object.keys(result)).toEqual([
    "valueOf",
    "toString",
    "isPrototypeOf",
    "__lookupGetter__",
    "propertyIsEnumerable",
  ]);
  expect(result).toEqual({
    valueOf: "1",
    toString: "2",
    isPrototypeOf: "3",
    __lookupGetter__: "4",
    propertyIsEnumerable: "5",
  });
});

// @boundary 5: A key with no "=" yields an empty string, not an array

test("[boundary-5] the spec example parseQuery('toString') on a null-prototype result", () => {
  const result = parseQuery("toString");
  expect(Object.getPrototypeOf(result)).toBe(null);
  expect(Object.keys(result)).toEqual(["toString"]);
  expect(result).toEqual({ toString: "" });
});

// Extends "[boundary-5] parseQuery('toString') yields { toString: '' }": every Object.prototype name.
for (const name of prototypeNames) {
  test(`[boundary-5] a bare ${name} with no '=' yields an empty string`, () => {
    const result = parseQuery(name);
    expect(Object.keys(result)).toEqual([name]);
    expect(result[name]).toBe("");
    expect(Array.isArray(result[name])).toBe(false);
  });
}

// Extends "[boundary-5] several prototype-named keys with no '=' ...": mixed with valued keys.
test("[boundary-5] bare prototype-named keys mixed with valued keys each yield a string", () => {
  const result = parseQuery("a=1&isPrototypeOf&b=2&toLocaleString&%74oString");
  expect(Object.keys(result)).toEqual([
    "a",
    "isPrototypeOf",
    "b",
    "toLocaleString",
    "toString",
  ]);
  expect(result).toEqual({
    a: "1",
    isPrototypeOf: "",
    b: "2",
    toLocaleString: "",
    toString: "",
  });
});

// @happy 3: A repeated key collects only the query's own values

const specRepeatedKeys: Array<[string, string, string[]]> = [
  ["toString=a&toString=b", "toString", ["a", "b"]],
  ["valueOf=1&valueOf=2&valueOf=3", "valueOf", ["1", "2", "3"]],
  ["toString=&toString=x", "toString", ["", "x"]],
];

for (const [input, key, values] of specRepeatedKeys) {
  test(`[happy-3] spec example parseQuery(${JSON.stringify(input)}) holds exactly ${JSON.stringify(values)}`, () => {
    const result = parseQuery(input);
    expect(Object.keys(result)).toEqual([key]);
    expect(result[key]).toEqual(values);
    expect(result[key]).toHaveLength(values.length);
  });
}

// Extends the public "[happy-3]" table: every Object.prototype member name, repeated.
for (const name of prototypeNames) {
  test(`[happy-3] a repeated ${name} collects only its two values`, () => {
    const result = parseQuery(`${name}=first&${name}=second`);
    expect(Object.keys(result)).toEqual([name]);
    expect(result[name]).toEqual(["first", "second"]);
  });
}

// Extends "[happy-3] parseQuery(\"valueOf=1&valueOf=2&valueOf=3\") ...": more values, other orders.
test("[happy-3] a prototype-named key repeated many times keeps every value in input order", () => {
  const values = ["e", "d", "c", "b", "a", "", "z"];
  const input = values.map((v) => `hasOwnProperty=${v}`).join("&");
  const result = parseQuery(input);
  expect(result.hasOwnProperty).toEqual(values);
});

// Extends "[happy-3] a repeated prototype-named key with no '=' collects empty strings only".
test("[happy-3] a repeated prototype-named key mixing bare, empty and valued occurrences", () => {
  const result = parseQuery("valueOf&valueOf=1&valueOf=&%76alueOf=two+words");
  expect(result).toEqual({ valueOf: ["", "1", "", "two words"] });
});

test("[happy-3] repeated prototype-named keys interleaved with each other stay separate", () => {
  const result = parseQuery("toString=1&valueOf=a&toString=2&valueOf=b&toString=3");
  expect(result).toEqual({ toString: ["1", "2", "3"], valueOf: ["a", "b"] });
});

// @happy 4: Prototype-named keys mix with other keys in first-appearance order

test("[happy-4] the spec example keeps first-appearance order on a null-prototype result", () => {
  const result = parseQuery("a=1&toString=foo&b=2&a=3");
  expect(Object.getPrototypeOf(result)).toBe(null);
  expect(Object.keys(result)).toEqual(["a", "toString", "b"]);
  expect(result).toEqual({ a: ["1", "3"], toString: "foo", b: "2" });
});

// Extends "[happy-4] parseQuery('a=1&toString=foo&b=2&a=3') keeps first-appearance order":
// several prototype-named keys, repeats and reserved keys interleaved.
test("[happy-4] several prototype-named keys, repeats and reserved keys keep first-appearance order", () => {
  const result = parseQuery(
    "valueOf=1&__proto__=z&a=2&toString=3&valueOf=4&constructor=5&a=6&isPrototypeOf",
  );
  expect(Object.keys(result)).toEqual([
    "valueOf",
    "a",
    "toString",
    "isPrototypeOf",
  ]);
  expect(result).toEqual({
    valueOf: ["1", "4"],
    a: ["2", "6"],
    toString: "3",
    isPrototypeOf: "",
  });
});

// Extends "[happy-4] a repeated prototype-named key keeps its first position": reverse order.
test("[happy-4] a later repeat does not move a prototype-named key behind ordinary keys", () => {
  const result = parseQuery("z=1&hasOwnProperty=a&y=2&x=3&hasOwnProperty=b&w=4");
  expect(Object.keys(result)).toEqual(["z", "hasOwnProperty", "y", "x", "w"]);
  expect(result).toEqual({
    z: "1",
    hasOwnProperty: ["a", "b"],
    y: "2",
    x: "3",
    w: "4",
  });
});

// @happy 5: The result round-trips through stringifyQuery

test("[happy-5] the spec example round-trips through stringifyQuery", () => {
  expect(stringifyQuery(parseQuery("toString=foo&valueOf=1&valueOf=2"))).toBe(
    "toString=foo&valueOf=1&valueOf=2",
  );
});

// Extends "[happy-5] stringifyQuery(parseQuery(...)) round-trips prototype-named keys": more keys.
test("[happy-5] several prototype-named and ordinary keys round-trip through stringifyQuery", () => {
  const input =
    "a=1&hasOwnProperty=x&isPrototypeOf=p&isPrototypeOf=q&b=2&toLocaleString=l";
  expect(stringifyQuery(parseQuery(input))).toBe(input);
});

// Extends "[happy-5] a single prototype-named key round-trips ...": other names, three repeats.
test("[happy-5] a thrice-repeated prototype-named key round-trips through stringifyQuery", () => {
  const input = "__lookupGetter__=1&__lookupGetter__=2&__lookupGetter__=3";
  expect(stringifyQuery(parseQuery(input))).toBe(input);
});

test("[happy-5] stringifyQuery groups repeats by first appearance after parsing", () => {
  expect(stringifyQuery(parseQuery("valueOf=1&toString=x&valueOf=2"))).toBe(
    "valueOf=1&valueOf=2&toString=x",
  );
});

// @unhappy 1: The reserved keys never appear in the result

const specReservedKeys: Array<[string, Record<string, string>]> = [
  ["__proto__=x", {}],
  ["constructor=x", {}],
  ["__proto__", {}],
  ["%5F%5Fproto%5F%5F=x", {}],
  ["constructor=x&constructor=y", {}],
  ["a=1&__proto__=x&constructor=y&b=2", { a: "1", b: "2" }],
];

for (const [input, output] of specReservedKeys) {
  test(`[unhappy-1] spec example parseQuery(${JSON.stringify(input)}) has no own reserved key`, () => {
    const result = parseQuery(input);
    expect(Object.getPrototypeOf(result)).toBe(null);
    expect(result).toEqual(output);
    expect(Object.getOwnPropertyNames(result)).toEqual(Object.keys(output));
  });
}

// Extends the public "[unhappy-1]" table: other spellings that decode to a reserved key.
const moreReservedKeys: Array<[string, Record<string, string>]> = [
  ["constructor", {}],
  ["?__proto__=x", {}],
  ["?constructor", {}],
  ["%5f%5fproto%5f%5f=x", {}],
  ["__proto%5F%5F=x", {}],
  ["%63%6F%6E%73%74%72%75%63%74%6F%72=x", {}],
  ["con%73tructor=x", {}],
  ["__proto__=x&__proto__=y&__proto__", {}],
  ["__proto__=x&toString=y", { toString: "y" }],
  ["a=1&__proto__=x&a=2&constructor=y&a=3", { a: ["1", "2", "3"] } as never],
  ["constructor=x&valueOf=1&%5F%5Fproto%5F%5F&valueOf=2", { valueOf: ["1", "2"] } as never],
];

for (const [input, output] of moreReservedKeys) {
  test(`[unhappy-1] parseQuery(${JSON.stringify(input)}) drops the decoded reserved key`, () => {
    const result = parseQuery(input);
    expect(Object.getPrototypeOf(result)).toBe(null);
    expect(result).toEqual(output);
    expect(Object.getOwnPropertyNames(result)).toEqual(Object.keys(output));
  });
}

test("[unhappy-1] a dropped __proto__ value does not become the result's prototype", () => {
  const result = parseQuery("__proto__=x&a=1") as Record<string, unknown>;
  expect(Object.getPrototypeOf(result)).toBe(null);
  expect("__proto__" in result).toBe(false);
  expect(Object.keys(result)).toEqual(["a"]);
});

// @boundary 6: Keys that only resemble the reserved keys are kept

const specResemblingKeys: Array<[string, Record<string, string>]> = [
  ["__PROTO__=x", { __PROTO__: "x" }],
  ["Constructor=x", { Constructor: "x" }],
  ["__proto__[]=x", { "__proto__[]": "x" }],
  ["prototype=x", { prototype: "x" }],
];

for (const [input, output] of specResemblingKeys) {
  test(`[boundary-6] spec example parseQuery(${JSON.stringify(input)}) keeps the key on a null-prototype result`, () => {
    const result = parseQuery(input);
    expect(Object.getPrototypeOf(result)).toBe(null);
    expect(result).toEqual(output);
    expect(Object.keys(result)).toEqual(Object.keys(output));
  });
}

// Extends the public "[boundary-6]" table: other case, affix and encoding variants.
const moreResemblingKeys: Array<[string, Record<string, string | string[]>]> = [
  ["CONSTRUCTOR=x", { CONSTRUCTOR: "x" }],
  ["__Proto__=x", { __Proto__: "x" }],
  ["%5F%5FPROTO%5F%5F=x", { __PROTO__: "x" }],
  ["_proto_=x", { _proto_: "x" }],
  ["__proto=x", { __proto: "x" }],
  ["proto=x", { proto: "x" }],
  ["constructors=x", { constructors: "x" }],
  ["xconstructor=x", { xconstructor: "x" }],
  ["constructor[]=x", { "constructor[]": "x" }],
  ["+constructor=x", { " constructor": "x" }],
  ["__proto__%20=x", { "__proto__ ": "x" }],
  ["Constructor", { Constructor: "" }],
  ["__PROTO__=a&__PROTO__=b", { __PROTO__: ["a", "b"] }],
];

for (const [input, output] of moreResemblingKeys) {
  test(`[boundary-6] parseQuery(${JSON.stringify(input)}) keeps the look-alike key`, () => {
    const result = parseQuery(input);
    expect(Object.getPrototypeOf(result)).toBe(null);
    expect(result).toEqual(output);
    expect(Object.keys(result)).toEqual(Object.keys(output));
  });
}

test("[boundary-6] look-alike keys sit beside dropped reserved keys in first-appearance order", () => {
  const result = parseQuery(
    "Constructor=1&constructor=2&__PROTO__=3&__proto__=4&prototype=5&Constructor=6",
  );
  expect(Object.getPrototypeOf(result)).toBe(null);
  expect(Object.keys(result)).toEqual(["Constructor", "__PROTO__", "prototype"]);
  expect(result).toEqual({
    Constructor: ["1", "6"],
    __PROTO__: "3",
    prototype: "5",
  });
});
