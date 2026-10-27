import { expect, test } from "vitest";
import { parseQuery, stringifyQuery } from "../src/query";

// Rule: The object parseQuery returns inherits from an empty null-prototype
// object and so inherits nothing

test("[happy-1] a non-empty query yields an object whose prototype chain ends one step up", () => {
  const result = parseQuery("a=1&b=2");
  const proto = Object.getPrototypeOf(result);
  expect(typeof proto).toBe("object");
  expect(proto).not.toBeNull();
  expect(proto).not.toBe(Object.prototype);
  expect(Reflect.ownKeys(proto)).toEqual([]);
  expect(Object.getPrototypeOf(proto)).toBeNull();
  expect(result instanceof Object).toBe(false);
  expect(result).toEqual({ a: "1", b: "2" });
});

test("[happy-1] a query with a leading ? and a repeated key has the same prototype chain", () => {
  const result = parseQuery("?a=1&a=2");
  const proto = Object.getPrototypeOf(result);
  expect(proto).not.toBeNull();
  expect(proto).not.toBe(Object.prototype);
  expect(Reflect.ownKeys(proto)).toEqual([]);
  expect(Object.getPrototypeOf(proto)).toBeNull();
  expect(result instanceof Object).toBe(false);
  expect(result).toEqual({ a: ["1", "2"] });
});

const emptyInputs: Array<{ name: string; call: () => ReturnType<typeof parseQuery> }> = [
  { name: '""', call: () => parseQuery("") },
  { name: '"?"', call: () => parseQuery("?") },
  { name: "(no args)", call: () => parseQuery() },
];

for (const { name, call } of emptyInputs) {
  test(`[boundary-1] empty query ${name} yields an empty object with the same prototype chain`, () => {
    const result = call();
    const proto = Object.getPrototypeOf(result);
    expect(proto).not.toBeNull();
    expect(proto).not.toBe(Object.prototype);
    expect(Object.getPrototypeOf(proto)).toBeNull();
    expect(Object.keys(result)).toEqual([]);
  });
}

test("[boundary-1] an empty query shares its prototype with a non-empty query and inherits nothing", () => {
  const empty = parseQuery("");
  const nonEmpty = parseQuery("a=1");
  expect(Object.getPrototypeOf(empty)).toBe(Object.getPrototypeOf(nonEmpty));
  expect(Reflect.ownKeys(Object.getPrototypeOf(empty))).toEqual([]);
  expect(empty instanceof Object).toBe(false);
  expect(Reflect.ownKeys(empty)).toEqual([]);
});

test("[boundary-2] the result exposes no inherited Object.prototype members", () => {
  const result = parseQuery("a=1") as Record<string, unknown>;
  expect(result.toString).toBeUndefined();
  expect(result.hasOwnProperty).toBeUndefined();
  expect(result.valueOf).toBeUndefined();
  expect("toString" in result).toBe(false);
});

test("[boundary-2] an empty result exposes none of the Object.prototype members", () => {
  const result = parseQuery("") as Record<string, unknown>;
  for (const name of Object.getOwnPropertyNames(Object.prototype)) {
    expect(name in result).toBe(false);
  }
  expect(result.isPrototypeOf).toBeUndefined();
  expect(result.propertyIsEnumerable).toBeUndefined();
  expect(result.toLocaleString).toBeUndefined();
});

test("[boundary-3] only the top-level object has the null-prototype chain", () => {
  const result = parseQuery("a=1&a=2");
  expect(Array.isArray(result.a)).toBe(true);
  expect(Object.getPrototypeOf(result.a)).toBe(Array.prototype);
  expect(result.a).toEqual(["1", "2"]);
});

test("[boundary-3] array values of prototype-named keys are ordinary arrays", () => {
  const result = parseQuery("toString=1&toString=2&toString=3");
  expect(Array.isArray(result.toString)).toBe(true);
  expect(Object.getPrototypeOf(result.toString)).toBe(Array.prototype);
  expect(result.toString).toEqual(["1", "2", "3"]);
  expect(Object.isFrozen(result.toString)).toBe(false);
});

test("[boundary-4] every call returns a new object", () => {
  const first = parseQuery("a=1");
  first.b = "x";
  const second = parseQuery("a=1");
  expect(second).not.toBe(first);
  expect(second).toEqual({ a: "1" });
  expect(Object.getPrototypeOf(second)).toBe(Object.getPrototypeOf(first));
  expect(Object.getPrototypeOf(second)).not.toBe(Object.prototype);
  expect(Object.getPrototypeOf(Object.getPrototypeOf(second))).toBeNull();
});

test("[boundary-4] empty input returns a new, writable object on every call", () => {
  const first = parseQuery("");
  first.b = "x";
  expect(first).toEqual({ b: "x" });
  const second = parseQuery("");
  expect(second).not.toBe(first);
  expect(Object.keys(second)).toEqual([]);
  expect(Object.getPrototypeOf(second)).toBe(Object.getPrototypeOf(first));
  expect(Object.getPrototypeOf(second)).not.toBe(Object.prototype);
  expect(Object.getPrototypeOf(Object.getPrototypeOf(second))).toBeNull();
});

// Rule: Keys named after Object.prototype members are ordinary query keys

const singleOccurrence: Array<{ input: string; key: string; value: string }> = [
  { input: "toString=foo", key: "toString", value: "foo" },
  { input: "valueOf=1", key: "valueOf", value: "1" },
  { input: "hasOwnProperty=x", key: "hasOwnProperty", value: "x" },
  { input: "isPrototypeOf=y", key: "isPrototypeOf", value: "y" },
  { input: "propertyIsEnumerable=z", key: "propertyIsEnumerable", value: "z" },
  { input: "toLocaleString=l", key: "toLocaleString", value: "l" },
  { input: "__defineGetter__=a", key: "__defineGetter__", value: "a" },
  { input: "__lookupSetter__=b", key: "__lookupSetter__", value: "b" },
  { input: "?toString=foo", key: "toString", value: "foo" },
  { input: "%74oString=foo", key: "toString", value: "foo" },
];

for (const { input, key, value } of singleOccurrence) {
  test(`[happy-2] single occurrence ${JSON.stringify(input)} yields the decoded string value`, () => {
    const result = parseQuery(input);
    expect(Object.keys(result)).toEqual([key]);
    expect(result[key]).toBe(value);
  });
}

test("[happy-2] every Object.prototype member name other than __proto__ and constructor is an ordinary key", () => {
  const names = Object.getOwnPropertyNames(Object.prototype).filter(
    (name) => name !== "__proto__" && name !== "constructor",
  );
  for (const name of names) {
    const result = parseQuery(`${name}=v`);
    expect(Object.keys(result)).toEqual([name]);
    expect(result[name]).toBe("v");
  }
});

test('[boundary-5] a key with no "=" yields an empty string, not an array', () => {
  const result = parseQuery("toString");
  expect(result).toEqual({ toString: "" });
});

test('[boundary-5] a prototype-named key with a trailing "=" and no value yields an empty string', () => {
  const result = parseQuery("hasOwnProperty=");
  expect(Array.isArray(result.hasOwnProperty)).toBe(false);
  expect(result).toEqual({ hasOwnProperty: "" });
});

const repeatedKeys: Array<{ input: string; key: string; values: string[] }> = [
  { input: "toString=a&toString=b", key: "toString", values: ["a", "b"] },
  {
    input: "valueOf=1&valueOf=2&valueOf=3",
    key: "valueOf",
    values: ["1", "2", "3"],
  },
  { input: "toString=&toString=x", key: "toString", values: ["", "x"] },
];

for (const { input, key, values } of repeatedKeys) {
  test(`[happy-3] repeated key ${JSON.stringify(input)} collects only the query's own values`, () => {
    const result = parseQuery(input);
    expect(result[key]).toEqual(values);
  });
}

test('[happy-3] a repeated prototype-named key with no "=" collects empty strings', () => {
  const result = parseQuery("toString&toString");
  expect(result.toString).toEqual(["", ""]);
  expect(Object.keys(result)).toEqual(["toString"]);
});

test("[happy-4] prototype-named keys mix with other keys in first-appearance order", () => {
  const result = parseQuery("a=1&toString=foo&b=2&a=3");
  expect(Object.keys(result)).toEqual(["a", "toString", "b"]);
  expect(result).toEqual({ a: ["1", "3"], toString: "foo", b: "2" });
});

test("[happy-4] a prototype-named key that appears first and repeats keeps its first position", () => {
  const result = parseQuery("toString=1&a=2&toString=3");
  expect(Object.keys(result)).toEqual(["toString", "a"]);
  expect(result).toEqual({ toString: ["1", "3"], a: "2" });
});

test("[happy-5] the result round-trips through stringifyQuery", () => {
  expect(stringifyQuery(parseQuery("toString=foo&valueOf=1&valueOf=2"))).toBe(
    "toString=foo&valueOf=1&valueOf=2",
  );
});

test("[happy-5] an empty result stringifies to an empty string", () => {
  expect(stringifyQuery(parseQuery(""))).toBe("");
});

// Rule: "__proto__" and "constructor" are still dropped, matched on the
// decoded key exactly

const reservedKeys: Array<{ input: string; output: Record<string, string> }> = [
  { input: "__proto__=x", output: {} },
  { input: "constructor=x", output: {} },
  { input: "__proto__", output: {} },
  { input: "%5F%5Fproto%5F%5F=x", output: {} },
  { input: "constructor=x&constructor=y", output: {} },
  { input: "a=1&__proto__=x&constructor=y&b=2", output: { a: "1", b: "2" } },
];

for (const { input, output } of reservedKeys) {
  test(`[unhappy-1] reserved keys in ${JSON.stringify(input)} never appear in the result`, () => {
    const result = parseQuery(input);
    expect(result).toEqual(output);
    expect(Object.getPrototypeOf(result)).not.toBe(Object.prototype);
    expect(Object.getPrototypeOf(Object.getPrototypeOf(result))).toBeNull();
  });
}

test("[unhappy-1] percent-encoded constructor with no value is dropped and the prototype is untouched", () => {
  const reference = Object.getPrototypeOf(parseQuery("a=1"));
  const result = parseQuery("%63onstructor&__proto__=y");
  expect(Reflect.ownKeys(result)).toEqual([]);
  expect(Object.getPrototypeOf(result)).toBe(reference);
  expect(Reflect.ownKeys(Object.getPrototypeOf(result))).toEqual([]);
  expect(Object.getPrototypeOf(Object.getPrototypeOf(result))).toBeNull();
});

const lookalikeKeys: Array<{ input: string; output: Record<string, string> }> = [
  { input: "__PROTO__=x", output: { __PROTO__: "x" } },
  { input: "Constructor=x", output: { Constructor: "x" } },
  { input: "__proto__[]=x", output: { "__proto__[]": "x" } },
  { input: "prototype=x", output: { prototype: "x" } },
];

for (const { input, output } of lookalikeKeys) {
  test(`[boundary-6] key resembling a reserved key in ${JSON.stringify(input)} is kept`, () => {
    const result = parseQuery(input);
    expect(result).toEqual(output);
  });
}

test("[boundary-6] a look-alike key is kept next to a dropped reserved key", () => {
  const result = parseQuery("__proto__=x&__PROTO__=y&constructor=z&CONSTRUCTOR=w");
  expect(Object.keys(result)).toEqual(["__PROTO__", "CONSTRUCTOR"]);
  expect(result).toEqual({ __PROTO__: "y", CONSTRUCTOR: "w" });
});
