import { expect, test } from "vitest";
import { parseQuery, stringifyQuery } from "../../src/query";

// Names of Object.prototype members other than the reserved keys, which are
// ordinary query keys once the result inherits nothing.
const prototypeNames = Object.getOwnPropertyNames(Object.prototype).filter(
  (name) => name !== "__proto__" && name !== "constructor",
);

function expectInheritsNothing(result: object) {
  const proto = Object.getPrototypeOf(result);
  expect(proto).not.toBeNull();
  expect(proto).not.toBe(Object.prototype);
  expect(typeof proto).toBe("object");
  expect(Reflect.ownKeys(proto)).toEqual([]);
  expect(Object.getPrototypeOf(proto)).toBeNull();
  expect(result instanceof Object).toBe(false);
}

// Rule: The object parseQuery returns inherits from an empty null-prototype
// object and so inherits nothing

// Extends public "[happy-1] a non-empty query yields an object whose prototype chain ends one step up"
test("[happy-1] a query with decoded, plus-encoded and value-less keys has the one-step prototype chain", () => {
  const result = parseQuery("x=1&y=hello+world&z=%26&w");
  expectInheritsNothing(result);
  expect(result).toEqual({ x: "1", y: "hello world", z: "&", w: "" });
});

// Extends public "[happy-1] a query with a leading ? and a repeated key has the same prototype chain"
test("[happy-1] results of many different non-empty queries share one empty null-prototype prototype", () => {
  const reference = Object.getPrototypeOf(parseQuery("a=1&b=2"));
  const inputs = [
    "toString=1",
    "?a=1&a=2&a=3",
    "?b",
    "__proto__=x&c=3",
    "constructor=1&constructor=2",
    "valueOf&hasOwnProperty=2",
    "%74oString=foo&__PROTO__=bar",
  ];
  for (const input of inputs) {
    const result = parseQuery(input);
    expect(Object.getPrototypeOf(result)).toBe(reference);
    expectInheritsNothing(result);
  }
  expect(Reflect.ownKeys(reference)).toEqual([]);
  expect(Object.getPrototypeOf(reference)).toBeNull();
});

// Extends public "[happy-1] a non-empty query yields an object whose prototype chain ends one step up"
test("[happy-1] a query with 200 keys inherits nothing and has exactly its own keys", () => {
  const parts: string[] = [];
  const expected: Record<string, string> = {};
  for (let i = 0; i < 200; i++) {
    parts.push(`key${i}=value${i}`);
    expected[`key${i}`] = `value${i}`;
  }
  const result = parseQuery(parts.join("&"));
  expectInheritsNothing(result);
  expect(Object.prototype.isPrototypeOf.call(Object.prototype, result)).toBe(
    false,
  );
  expect(result).toEqual(expected);
});

test("[happy-1] the shared prototype stays empty after parsing reserved and prototype-named keys", () => {
  parseQuery("__proto__=x&constructor=y&toString=z&__defineSetter__=q");
  parseQuery("%5F%5Fproto%5F%5F[polluted]=1&__proto__=polluted");
  const fresh = parseQuery("a=1") as Record<string, unknown>;
  expectInheritsNothing(fresh);
  expect("polluted" in fresh).toBe(false);
  expect("x" in fresh).toBe(false);
  expect(fresh).toEqual({ a: "1" });
});

// Extends public "[boundary-1] empty query ... yields an empty object with the same prototype chain"
for (const input of ["&", "?&", "&&&", "?&&"]) {
  test(`[boundary-1] query of only separators ${JSON.stringify(input)} yields an empty object with the prototype chain`, () => {
    const result = parseQuery(input);
    expect(Object.getPrototypeOf(Object.getPrototypeOf(result))).toBeNull();
    expectInheritsNothing(result);
    expect(Object.keys(result)).toEqual([]);
  });
}

// Extends public "[boundary-1] an empty query shares its prototype with a non-empty query and inherits nothing"
test('[boundary-1] "", "?" and no args all yield empty objects with one shared prototype', () => {
  const results = [parseQuery(""), parseQuery("?"), parseQuery()];
  const reference = Object.getPrototypeOf(parseQuery("toString=1"));
  for (const result of results) {
    expect(Object.getPrototypeOf(result)).toBe(reference);
    expect(Object.getPrototypeOf(Object.getPrototypeOf(result))).toBeNull();
    expect(Object.keys(result)).toEqual([]);
    expect(Reflect.ownKeys(result)).toEqual([]);
    expect(result instanceof Object).toBe(false);
  }
});

// Extends public "[boundary-2] the result exposes no inherited Object.prototype members"
test("[boundary-2] a non-empty result exposes none of the Object.prototype members", () => {
  const result = parseQuery("a=1&b=2") as Record<string, unknown>;
  for (const name of Object.getOwnPropertyNames(Object.prototype)) {
    expect(name in result).toBe(false);
    expect(result[name]).toBeUndefined();
  }
  expect(result.constructor).toBeUndefined();
  expect(result.__proto__).toBeUndefined();
  expect(result.__lookupGetter__).toBeUndefined();
});

// Extends public "[boundary-2] the result exposes no inherited Object.prototype members"
test("[boundary-2] a result holding a prototype-named key exposes only that key, not the other members", () => {
  const result = parseQuery("toString=foo") as Record<string, unknown>;
  expect(result.toString).toBe("foo");
  expect(result.valueOf).toBeUndefined();
  expect(result.hasOwnProperty).toBeUndefined();
  expect(result.isPrototypeOf).toBeUndefined();
  expect("valueOf" in result).toBe(false);
  expect("hasOwnProperty" in result).toBe(false);
  expect("constructor" in result).toBe(false);
});

// Extends public "[boundary-3] only the top-level object has the null-prototype chain"
test("[boundary-3] several repeated keys each hold an ordinary array while the top level inherits nothing", () => {
  const result = parseQuery(
    "a=1&b=1&a=2&b=2&a=3&hasOwnProperty=x&hasOwnProperty=y",
  );
  expectInheritsNothing(result);
  for (const key of ["a", "b", "hasOwnProperty"]) {
    const value = result[key];
    expect(Array.isArray(value)).toBe(true);
    expect(Object.getPrototypeOf(value)).toBe(Array.prototype);
    expect(value instanceof Array).toBe(true);
    expect(Object.isExtensible(value)).toBe(true);
  }
  expect(result).toEqual({
    a: ["1", "2", "3"],
    b: ["1", "2"],
    hasOwnProperty: ["x", "y"],
  });
});

// Extends public "[boundary-3] array values of prototype-named keys are ordinary arrays"
test("[boundary-3] single values are plain strings and array values of prototype-named keys accept pushes", () => {
  const result = parseQuery("toString=foo&valueOf=1&valueOf=2");
  expect(typeof result.toString).toBe("string");
  expect(result.toString).toBe("foo");
  const values = result.valueOf as unknown as string[];
  expect(Object.getPrototypeOf(values)).toBe(Array.prototype);
  values.push("3");
  expect(values).toEqual(["1", "2", "3"]);
});

// Extends public "[boundary-4] every call returns a new object"
test("[boundary-4] calls keep no state: a prototype-named key parsed again is a single value, not an array", () => {
  const first = parseQuery("toString=a") as Record<string, unknown>;
  Object.assign(first, { valueOf: "x" });
  const second = parseQuery("toString=b");
  expect(second).not.toBe(first);
  expect(second).toEqual({ toString: "b" });
  const third = parseQuery("toString=a");
  expect(third).toEqual({ toString: "a" });
  expect(first).toEqual({ toString: "a", valueOf: "x" });
  expect(Object.getPrototypeOf(third)).toBe(Object.getPrototypeOf(first));
  expect(Object.getPrototypeOf(Object.getPrototypeOf(third))).toBeNull();
});

// Extends public "[boundary-4] every call returns a new object"
test("[boundary-4] array values are new on every call", () => {
  const first = parseQuery("valueOf=1&valueOf=2");
  (first.valueOf as unknown as string[]).push("3");
  const second = parseQuery("valueOf=1&valueOf=2");
  expect(second.valueOf).not.toBe(first.valueOf);
  expect(second.valueOf).toEqual(["1", "2"]);
  expect(first.valueOf).toEqual(["1", "2", "3"]);
});

// Extends public "[boundary-4] empty input returns a new, writable object on every call"
test("[boundary-4] 100 calls return 100 distinct objects sharing one prototype", () => {
  const results = new Set<object>();
  const protos = new Set<unknown>();
  for (let i = 0; i < 100; i++) {
    const result = parseQuery(i % 2 === 0 ? "" : "a=1");
    results.add(result);
    protos.add(Object.getPrototypeOf(result));
  }
  expect(results.size).toBe(100);
  expect(protos.size).toBe(1);
  const [proto] = protos;
  expect(proto).not.toBe(Object.prototype);
  expect(proto).not.toBeNull();
  expect(Object.getPrototypeOf(proto)).toBeNull();
});

// Rule: Keys named after Object.prototype members are ordinary query keys

// Extends public "[happy-2] single occurrence ... yields the decoded string value"
const decodedSingles: Array<{ input: string; key: string; value: string }> = [
  { input: "toString=a%20b", key: "toString", value: "a b" },
  { input: "valueOf=a+b", key: "valueOf", value: "a b" },
  { input: "hasOwnProperty=x=y", key: "hasOwnProperty", value: "x=y" },
  {
    input: "%5F%5FdefineGetter%5F%5F=g",
    key: "__defineGetter__",
    value: "g",
  },
  { input: "?%69sPrototypeOf=%3F", key: "isPrototypeOf", value: "?" },
  { input: "__lookupGetter__=%E2%9C%93", key: "__lookupGetter__", value: "✓" },
  { input: "toLocaleString=%2526", key: "toLocaleString", value: "%26" },
  { input: "toString=toString", key: "toString", value: "toString" },
  { input: "valueOf=__proto__", key: "valueOf", value: "__proto__" },
];

for (const { input, key, value } of decodedSingles) {
  test(`[happy-2] single occurrence ${JSON.stringify(input)} yields the decoded value ${JSON.stringify(value)}`, () => {
    const result = parseQuery(input);
    expect(Object.keys(result)).toEqual([key]);
    expect(result[key]).toBe(value);
  });
}

// Extends public "[happy-2] every Object.prototype member name other than __proto__ and constructor is an ordinary key"
test("[happy-2] every prototype member name with a percent-encoded first character decodes to an ordinary key", () => {
  for (const name of prototypeNames) {
    const encoded =
      "%" + name.charCodeAt(0).toString(16).toUpperCase() + name.slice(1);
    const result = parseQuery(`${encoded}=v-${name}`);
    expect(Object.keys(result)).toEqual([name]);
    expect(result[name]).toBe(`v-${name}`);
  }
});

// Extends public '[boundary-5] a key with no "=" yields an empty string, not an array'
const noEquals: Array<{ input: string; output: Record<string, string> }> = [
  { input: "valueOf", output: { valueOf: "" } },
  { input: "?hasOwnProperty", output: { hasOwnProperty: "" } },
  { input: "%74oString", output: { toString: "" } },
  { input: "__defineSetter__", output: { __defineSetter__: "" } },
  { input: "toString&a=1", output: { toString: "", a: "1" } },
  { input: "a=1&isPrototypeOf", output: { a: "1", isPrototypeOf: "" } },
];

for (const { input, output } of noEquals) {
  test(`[boundary-5] value-less key in ${JSON.stringify(input)} yields an empty string, not an array`, () => {
    const result = parseQuery(input);
    expect(result).toEqual(output);
    for (const key of Object.keys(output)) {
      expect(typeof result[key]).toBe("string");
    }
  });
}

test('[boundary-5] every prototype member name with no "=" yields an empty string', () => {
  for (const name of prototypeNames) {
    const result = parseQuery(name);
    expect(Object.keys(result)).toEqual([name]);
    expect(result[name]).toBe("");
  }
});

// Extends public "[happy-3] repeated key ... collects only the query's own values"
const repeated: Array<{ input: string; key: string; values: string[] }> = [
  {
    input:
      "hasOwnProperty=1&hasOwnProperty=2&hasOwnProperty=3&hasOwnProperty=4",
    key: "hasOwnProperty",
    values: ["1", "2", "3", "4"],
  },
  { input: "valueOf&valueOf=1&valueOf=", key: "valueOf", values: ["", "1", ""] },
  {
    input: "__lookupGetter__=b&__lookupGetter__=a",
    key: "__lookupGetter__",
    values: ["b", "a"],
  },
  { input: "toString=x&toString=x", key: "toString", values: ["x", "x"] },
  {
    input: "isPrototypeOf=%20&isPrototypeOf=+",
    key: "isPrototypeOf",
    values: [" ", " "],
  },
  {
    input: "?%74oString=1&toString=2",
    key: "toString",
    values: ["1", "2"],
  },
];

for (const { input, key, values } of repeated) {
  test(`[happy-3] repeated key in ${JSON.stringify(input)} collects ${JSON.stringify(values)}`, () => {
    const result = parseQuery(input);
    expect(Object.keys(result)).toEqual([key]);
    expect(result[key]).toEqual(values);
  });
}

// Extends public "[happy-3] repeated key ... collects only the query's own values"
test("[happy-3] every prototype member name repeated three times collects exactly its three values", () => {
  for (const name of prototypeNames) {
    const result = parseQuery(`${name}=1&${name}=2&${name}=3`);
    expect(Object.keys(result)).toEqual([name]);
    expect(result[name]).toEqual(["1", "2", "3"]);
  }
});

// Extends public "[happy-3] repeated key ... collects only the query's own values"
test("[happy-3] a prototype-named key repeated 500 times collects its 500 values in input order", () => {
  const parts: string[] = [];
  const expected: string[] = [];
  for (let i = 0; i < 500; i++) {
    parts.push(`valueOf=${i}`);
    expected.push(String(i));
  }
  const result = parseQuery(parts.join("&"));
  expect(result.valueOf).toEqual(expected);
});

// Extends public '[happy-3] a repeated prototype-named key with no "=" collects empty strings'
test("[happy-3] interleaved prototype-named keys each collect only their own values", () => {
  const result = parseQuery(
    "toString=1&valueOf=a&toString=2&valueOf=b&toString=3",
  );
  expect(result.toString).toEqual(["1", "2", "3"]);
  expect(result.valueOf).toEqual(["a", "b"]);
});

// Extends public "[happy-4] prototype-named keys mix with other keys in first-appearance order"
test("[happy-4] several prototype-named keys and repeats keep first-appearance order", () => {
  const result = parseQuery(
    "valueOf=1&hasOwnProperty=2&valueOf=3&z=4&hasOwnProperty=5",
  );
  expect(Object.keys(result)).toEqual(["valueOf", "hasOwnProperty", "z"]);
  expect(result).toEqual({
    valueOf: ["1", "3"],
    hasOwnProperty: ["2", "5"],
    z: "4",
  });
});

// Extends public "[happy-4] a prototype-named key that appears first and repeats keeps its first position"
test("[happy-4] dropped reserved keys between prototype-named keys do not disturb the order", () => {
  const result = parseQuery(
    "constructor=0&toString=1&__proto__=2&a=3&toString=4",
  );
  expect(Object.keys(result)).toEqual(["toString", "a"]);
  expect(result).toEqual({ toString: ["1", "4"], a: "3" });
});

// Extends public "[happy-4] prototype-named keys mix with other keys in first-appearance order"
test("[happy-4] all prototype member names interleaved with other keys keep first-appearance order, repeats included", () => {
  const order: string[] = [];
  const parts: string[] = [];
  for (const [i, name] of prototypeNames.entries()) {
    order.push(name, `k${i}`);
    parts.push(`${name}=${i}`, `k${i}=${i}`);
  }
  // Repeat every key in reverse order; positions must not move.
  for (const key of [...order].reverse()) {
    parts.push(`${key}=again`);
  }
  const result = parseQuery(parts.join("&"));
  expect(Object.keys(result)).toEqual(order);
  for (const [i, name] of prototypeNames.entries()) {
    expect(result[name]).toEqual([String(i), "again"]);
    expect(result[`k${i}`]).toEqual([String(i), "again"]);
  }
});

// Extends public "[happy-5] the result round-trips through stringifyQuery"
const roundTrips: Array<{ input: string; output: string }> = [
  { input: "toString", output: "toString" },
  {
    input: "hasOwnProperty=a&b=1&hasOwnProperty=c",
    output: "hasOwnProperty=a&hasOwnProperty=c&b=1",
  },
  { input: "__proto__=x&valueOf=1&constructor=2", output: "valueOf=1" },
  {
    input: "isPrototypeOf=1&isPrototypeOf=2&isPrototypeOf=3&toLocaleString=z",
    output: "isPrototypeOf=1&isPrototypeOf=2&isPrototypeOf=3&toLocaleString=z",
  },
  { input: "toString=&toString=x", output: "toString=&toString=x" },
  { input: "?valueOf=a+b", output: "valueOf=a+b" },
];

for (const { input, output } of roundTrips) {
  test(`[happy-5] ${JSON.stringify(input)} stringifies back to ${JSON.stringify(output)}`, () => {
    expect(stringifyQuery(parseQuery(input))).toBe(output);
  });
}

// Rule: "__proto__" and "constructor" are still dropped, matched on the
// decoded key exactly

// Extends public "[unhappy-1] reserved keys in ... never appear in the result"
const reserved: Array<{ input: string; output: Record<string, string | string[]> }> = [
  { input: "__pro%74o__=x", output: {} },
  { input: "%5f%5fproto%5f%5f=x", output: {} },
  { input: "%63onstructor=x&%63onstructor=y", output: {} },
  { input: "constructor", output: {} },
  { input: "?__proto__=%7B%7D", output: {} },
  { input: "constructor&a=1", output: { a: "1" } },
  { input: "a=1&constructor=2&a=3", output: { a: ["1", "3"] } },
  { input: "__proto__=x&__proto__=y&toString=z", output: { toString: "z" } },
  {
    input: "toString=1&__proto__=2&toString=3",
    output: { toString: ["1", "3"] },
  },
];

for (const { input, output } of reserved) {
  test(`[unhappy-1] reserved keys in ${JSON.stringify(input)} are dropped`, () => {
    const reference = Object.getPrototypeOf(parseQuery("a=1"));
    const result = parseQuery(input);
    expect(result).toEqual(output);
    expect(Reflect.ownKeys(result)).toEqual(Object.keys(output));
    expect(Object.getPrototypeOf(result)).toBe(reference);
    expect(Object.getPrototypeOf(Object.getPrototypeOf(result))).toBeNull();
    expect(Reflect.ownKeys(reference)).toEqual([]);
  });
}

// Extends public "[boundary-6] key resembling a reserved key in ... is kept"
const lookalikes: Array<{ input: string; output: Record<string, string | string[]> }> = [
  { input: "__proto__+=x", output: { "__proto__ ": "x" } },
  { input: "_proto_=x", output: { _proto_: "x" } },
  { input: "__proto=x", output: { __proto: "x" } },
  { input: "proto__=x", output: { proto__: "x" } },
  { input: "CONSTRUCTOR=x", output: { CONSTRUCTOR: "x" } },
  { input: "constructors=x", output: { constructors: "x" } },
  { input: "constructor[]=x", output: { "constructor[]": "x" } },
  { input: "%5F%5FPROTO%5F%5F=x", output: { __PROTO__: "x" } },
  { input: "__PROTO__=1&__PROTO__=2", output: { __PROTO__: ["1", "2"] } },
  { input: "prototype=a&prototype=b", output: { prototype: ["a", "b"] } },
  { input: "Constructor&constructor", output: { Constructor: "" } },
];

for (const { input, output } of lookalikes) {
  test(`[boundary-6] look-alike key in ${JSON.stringify(input)} is kept in a result that inherits nothing`, () => {
    const result = parseQuery(input);
    expect(result).toEqual(output);
    expect(Object.keys(result)).toEqual(Object.keys(output));
    expectInheritsNothing(result);
  });
}
