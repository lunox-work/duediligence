import { expect, test } from "vitest";
import { filterQuery, getQuery } from "../../src/utils";

type Predicate = (key: string, value: string | string[]) => boolean;

function recorder(result: boolean) {
  const calls: unknown[][] = [];
  const predicate: Predicate = (...args) => {
    calls.push(args);
    return result;
  };
  return { calls, predicate };
}

// happy

// extends "[happy-5] each key is offered once with its single value"
test("[happy-5] five keys are each offered once, in first-appearance order, with two arguments", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("http://e.com/p?zeta=5&alpha=1&mid=3&beta=2&omega=9#h", predicate);
  expect(calls).toEqual([
    ["zeta", "5"],
    ["alpha", "1"],
    ["mid", "3"],
    ["beta", "2"],
    ["omega", "9"],
  ]);
  for (const call of calls) {
    expect(call).toHaveLength(2);
  }
});

test("[happy-5] each key is offered once with two arguments when the predicate rejects", () => {
  const { calls, predicate } = recorder(false);
  filterQuery("/foo?x=1&y=2&x=3", predicate);
  expect(calls).toEqual([
    ["x", ["1", "3"]],
    ["y", "2"],
  ]);
  for (const call of calls) {
    expect(call).toHaveLength(2);
  }
});

// extends "[happy-6] a key repeated three times is offered once with all values in order"
test("[happy-6] two interleaved repeated keys are each offered once with their values in order", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?x=1&y=a&x=2&s=only&y=b&x=3", predicate);
  expect(calls).toEqual([
    ["x", ["1", "2", "3"]],
    ["y", ["a", "b"]],
    ["s", "only"],
  ]);
  expect(Array.isArray(calls[0][1])).toBe(true);
  expect(typeof calls[2][1]).toBe("string");
});

test("[happy-6] a key repeated with identical values is offered all of them", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?a=1&a=1&a=1&a=1", predicate);
  expect(calls).toEqual([["a", ["1", "1", "1", "1"]]]);
});

// extends "[happy-7] keys and values reach the predicate decoded"
test("[happy-7] other encodings reach the predicate decoded", () => {
  const { calls, predicate } = recorder(true);
  filterQuery(
    "/foo?k%3D=%2B&%E5%A5%BD=x&a+b=c%20d&t=a=b&s=%2F%3F%23",
    predicate,
  );
  expect(calls).toEqual([
    ["k=", "+"],
    ["好", "x"],
    ["a b", "c d"],
    ["t", "a=b"],
    ["s", "/?#"],
  ]);
});

test("[happy-7] keys reach the predicate decoded in the same form getQuery gives", () => {
  const input = "/foo?%61=1&k%26y=%E2%9C%93&n=%zz";
  const { calls, predicate } = recorder(true);
  filterQuery(input, predicate);
  expect(calls).toEqual(Object.entries(getQuery(input)));
  expect(calls).toEqual([
    ["a", "1"],
    ["k&y", "✓"],
    ["n", "%zz"],
  ]);
});

// extends "[happy-8] keeping a repeated key keeps all its values together"
test("[happy-8] several repeated keys are each written grouped where they first appear", () => {
  expect(filterQuery("/foo?b=1&a=2&b=3&c=4&a=5", () => true)).toBe(
    "/foo?b=1&b=3&a=2&a=5&c=4",
  );
});

test("[happy-8] kept repeated keys stay grouped when another key is dropped", () => {
  expect(filterQuery("/foo?b=1&a=2&b=3&c=4&a=5", (key) => key !== "c")).toBe(
    "/foo?b=1&b=3&a=2&a=5",
  );
});

test("[happy-8] a repeated integer-like key is grouped and written first", () => {
  expect(filterQuery("/foo?x=1&3=a&x=2&3=b", () => true)).toBe(
    "/foo?3=a&3=b&x=1&x=2",
  );
});

// extends "[happy-9] selecting by the shape of the value"
test("[happy-9] selecting the keys whose value is not an array", () => {
  expect(
    filterQuery("/foo?a=1&b=2&a=3&c=4", (key, value) => !Array.isArray(value)),
  ).toBe("/foo?b=2&c=4");
});

test("[happy-9] selecting by the content of the value", () => {
  expect(
    filterQuery("/foo?a=1&b=2&a=3&c=2", (key, value) => value === "2"),
  ).toBe("/foo?b=2&c=2");
  expect(
    filterQuery(
      "/foo?a=1&b=3&a=3&c=4",
      (key, value) => Array.isArray(value) && value.includes("3"),
    ),
  ).toBe("/foo?a=1&a=3");
});

// boundary

// extends "[boundary-6] a lone key with no '=' is offered with ''"
test("[boundary-6] a repeated key with missing and empty values is offered '' for each", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?a&a=1&a=&x", predicate);
  expect(calls).toEqual([
    ["a", ["", "1", ""]],
    ["x", ""],
  ]);
});

test("[boundary-6] several keys without values are each offered ''", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?x&y=&z#h", predicate);
  expect(calls).toEqual([
    ["x", ""],
    ["y", ""],
    ["z", ""],
  ]);
});

// extends "[boundary-7] integer-like keys are ordered numerically, not as text"
test("[boundary-7] several integer-like keys among others are offered and written in parseQuery order", () => {
  const input = "/foo?b=1&100=c&a=2&3=d&20=e";
  const keys: string[] = [];
  const result = filterQuery(input, (key) => {
    keys.push(key);
    return true;
  });
  expect(keys).toEqual(["3", "20", "100", "b", "a"]);
  expect(result).toBe("/foo?3=d&20=e&100=c&b=1&a=2");
});

test("[boundary-7] keys are offered in the same order getQuery gives them", () => {
  const input = "/foo?b=1&01=x&1=y&-1=z&10=q&2=w";
  const keys: string[] = [];
  filterQuery(input, (key) => {
    keys.push(key);
    return true;
  });
  expect(keys).toEqual(Object.keys(getQuery(input)));
});

test("[boundary-7] integer-like keys stay first when others are dropped", () => {
  expect(
    filterQuery("/foo?z=1&9=a&y=2&10=b", (key) => key !== "y"),
  ).toBe("/foo?9=a&10=b&z=1");
});

// extends "[boundary-8] a leading empty value inside a repeated key is kept"
test("[boundary-8] missing and empty values inside a repeated key are all kept", () => {
  expect(filterQuery("/foo?a&a=1&a", () => true)).toBe("/foo?a=&a=1&a=");
  expect(filterQuery("/foo?a=&a=", () => true)).toBe("/foo?a=&a=");
});

test("[boundary-8] empty values inside a kept repeated key survive dropping another key", () => {
  expect(filterQuery("/foo?a=&d=1&a=2&a=", (key) => key === "a")).toBe(
    "/foo?a=&a=2&a=",
  );
});

// extends "[boundary-9] a second '?' in the query belongs to the value"
test("[boundary-9] a value containing '?' is offered and written whole beside other keys", () => {
  const { calls, predicate } = recorder(true);
  const result = filterQuery("/foo?a=1?b=2&c=3", predicate);
  expect(calls).toEqual([
    ["a", "1?b=2"],
    ["c", "3"],
  ]);
  expect(result).toBe("/foo?a=1?b=2&c=3");
});

test("[boundary-9] a value containing '?' survives dropping another key", () => {
  expect(filterQuery("/foo?a=x?y&b=?#h", (key) => key === "b")).toBe(
    "/foo?b=?#h",
  );
  expect(filterQuery("/foo?a=1?b=2&c=3", (key) => key !== "c")).toBe(
    "/foo?a=1?b=2",
  );
});
