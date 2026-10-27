import { expect, test } from "vitest";
import { filterQuery } from "../src/utils";

type Predicate = (key: string, value: string | string[]) => boolean;

function recorder(result: boolean) {
  const calls: unknown[][] = [];
  const predicate = ((...args: unknown[]) => {
    calls.push(args);
    return result;
  }) as Predicate;
  return { calls, predicate };
}

// Rule: parameters whose key the predicate rejects are removed

test("[happy-1] removes the one parameter the predicate rejects from a path", () => {
  expect(filterQuery("/foo?bar=1&baz=2", (key) => key !== "bar")).toBe(
    "/foo?baz=2",
  );
});

test("[happy-1] removes every value of a rejected repeated key", () => {
  expect(filterQuery("/foo?bar=1&baz=2&bar=3", (key) => key !== "bar")).toBe(
    "/foo?baz=2",
  );
});

test("[happy-2] keeps only the parameter the predicate accepts", () => {
  expect(filterQuery("/foo?bar=1&baz=2", (key) => key !== "baz")).toBe(
    "/foo?bar=1",
  );
});

test("[happy-2] keeps only the middle parameter out of three", () => {
  expect(filterQuery("/foo?a=1&b=2&c=3", (key) => key === "b")).toBe(
    "/foo?b=2",
  );
});

test("[happy-3] leaves protocol, auth, host, port, path and fragment as they are", () => {
  expect(
    filterQuery(
      "http://user:pw@example.com:8080/p?a=1&b=2#frag",
      (key) => key === "b",
    ),
  ).toBe("http://user:pw@example.com:8080/p?b=2#frag");
});

test("[happy-3] preserves the rest of host-only, protocol-relative, hashed and query-only inputs", () => {
  const cases = [
    { input: "https://example.com?a=1&b=2", output: "https://example.com?b=2" },
    { input: "//example.com/p?a=1&b=2", output: "//example.com/p?b=2" },
    { input: "/foo?a=1&b=2#hash", output: "/foo?b=2#hash" },
    { input: "?a=1&b=2", output: "?b=2" },
  ];
  for (const t of cases) {
    expect(filterQuery(t.input, (key) => key === "b")).toBe(t.output);
  }
});

test("[happy-4] reads a 1 / 0 predicate result as truthy / falsy", () => {
  const predicate = ((key: string) => (key === "a" ? 1 : 0)) as unknown as Predicate;
  expect(filterQuery("/foo?a=1&b=2", predicate)).toBe("/foo?a=1");
});

test("[happy-4] reads a non-empty string as truthy and undefined as falsy", () => {
  const predicate = ((key: string) =>
    key === "a" ? "yes" : undefined) as unknown as Predicate;
  expect(filterQuery("/foo?a=1&b=2", predicate)).toBe("/foo?a=1");
});

// Rule: when no parameters are left, the "?" is removed too

test("[boundary-1] removes the query and its '?' when every parameter is rejected", () => {
  expect(filterQuery("/foo?bar=1&baz=2", () => false)).toBe("/foo");
});

test("[boundary-1] keeps the fragment, and empties a query-only input, when every parameter is rejected", () => {
  const cases = [
    { input: "/foo?bar=1&baz=2#hash", output: "/foo#hash" },
    {
      input: "http://example.com/p?a=1#frag",
      output: "http://example.com/p#frag",
    },
    { input: "?a=1", output: "" },
  ];
  for (const t of cases) {
    expect(filterQuery(t.input, () => false)).toBe(t.output);
  }
});

test("[boundary-2] drops a bare trailing '?' without calling the predicate", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("/foo?", predicate)).toBe("/foo");
  expect(calls).toHaveLength(0);
});

test("[boundary-2] drops an empty query before a fragment or made only of '&' without calling the predicate", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("/foo?#h", predicate)).toBe("/foo#h");
  expect(filterQuery("/foo?&&", predicate)).toBe("/foo");
  expect(calls).toHaveLength(0);
});

// Rule: an input with no "?" anywhere is returned exactly as given

test("[boundary-3] returns a path without a query unchanged without calling the predicate", () => {
  const { calls, predicate } = recorder(false);
  expect(filterQuery("/foo", predicate)).toBe("/foo");
  expect(calls).toHaveLength(0);
});

test("[boundary-3] returns empty, root, encoded and hashed inputs without a query exactly as given", () => {
  const { calls, predicate } = recorder(false);
  for (const input of [
    "",
    "/",
    "http://example.com/a%20b",
    "/foo#section",
  ]) {
    expect(filterQuery(input, predicate)).toBe(input);
  }
  expect(calls).toHaveLength(0);
});

test("[boundary-4] treats a '?' only inside the fragment as not a query", () => {
  const { calls, predicate } = recorder(false);
  expect(filterQuery("/foo#a?b=1", predicate)).toBe("/foo#a?b=1");
  expect(calls).toHaveLength(0);
});

test("[boundary-4] treats a fragment starting with '?' on an absolute URL as not a query", () => {
  const { calls, predicate } = recorder(false);
  expect(filterQuery("http://example.com/p#?a=1&b=2", predicate)).toBe(
    "http://example.com/p#?a=1&b=2",
  );
  expect(calls).toHaveLength(0);
});

// Rule: script-protocol inputs that contain a "?" are rebuilt without filtering

test("[boundary-5] rebuilds a data: input with '//' and its query unfiltered", () => {
  const { calls, predicate } = recorder(false);
  expect(filterQuery("data:text/plain?a=1", predicate)).toBe(
    "data://text/plain?a=1",
  );
  expect(calls).toHaveLength(0);
});

test("[boundary-5] lower-cases a mixed-case script protocol and leaves javascript: and blob: queries unfiltered", () => {
  const { calls, predicate } = recorder(false);
  const cases = [
    { input: "javascript:alert(1)?a=1", output: "javascript://alert(1)?a=1" },
    { input: "JavaScript:void(0)?x=1", output: "javascript://void(0)?x=1" },
    {
      input: "blob:https://e.com/id?a=1",
      output: "blob://https://e.com/id?a=1",
    },
  ];
  for (const t of cases) {
    expect(filterQuery(t.input, predicate)).toBe(t.output);
  }
  expect(calls).toHaveLength(0);
});

// Rule: the predicate is called once per distinct key, decoded, in parseQuery key order

test("[happy-5] offers each key once with its single value and exactly two arguments", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?bar=1&baz=2", predicate);
  expect(calls).toHaveLength(2);
  expect(calls).toEqual([
    ["bar", "1"],
    ["baz", "2"],
  ]);
  for (const call of calls) {
    expect(call).toHaveLength(2);
  }
});

test("[happy-5] offers a single parameter exactly once", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?a=1", predicate);
  expect(calls).toEqual([["a", "1"]]);
});

test("[happy-6] offers a repeated key once with an array of its values in input order", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?a=1&b=2&a=3", predicate);
  expect(calls).toEqual([
    ["a", ["1", "3"]],
    ["b", "2"],
  ]);
});

test("[happy-6] keeps input order, not sorted order, for the values of a key repeated three times", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?a=3&a=1&a=2", predicate);
  expect(calls).toEqual([["a", ["3", "1", "2"]]]);
});

test("[happy-7] offers keys and values decoded", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?key%20x=b+c&u=%E5%A5%BD&e=%26", predicate);
  expect(calls).toEqual([
    ["key x", "b c"],
    ["u", "好"],
    ["e", "&"],
  ]);
});

test("[happy-7] decodes '+' in a key to a space and an encoded '+' in a value to '+'", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?a+b=c%2Bd", predicate);
  expect(calls).toEqual([["a b", "c+d"]]);
});

test("[boundary-6] offers a parameter with no '=' or an empty value with the empty string", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?a=&b&c=1", predicate);
  expect(calls).toEqual([
    ["a", ""],
    ["b", ""],
    ["c", "1"],
  ]);
});

test("[boundary-6] offers a lone key without '=' with the empty string", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("/foo?a", predicate)).toBe("/foo?a");
  expect(calls).toEqual([["a", ""]]);
});

test("[boundary-7] offers and writes integer-like keys first in ascending order", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("/foo?b=1&2=x&1=y", predicate)).toBe("/foo?1=y&2=x&b=1");
  expect(calls.map((call) => call[0])).toEqual(["1", "2", "b"]);
});

test("[boundary-7] orders integer-like keys numerically, not as text", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("/foo?10=a&9=b", predicate)).toBe("/foo?9=b&10=a");
  expect(calls.map((call) => call[0])).toEqual(["9", "10"]);
});

// Rule: a repeated key is kept or dropped as a whole, and written grouped

test("[happy-8] keeps all values of a repeated key together", () => {
  expect(filterQuery("/foo?a=1&b=2&a=3", () => true)).toBe(
    "/foo?a=1&a=3&b=2",
  );
});

test("[happy-8] groups a repeated key where it first appears", () => {
  expect(filterQuery("/foo?b=2&a=1&b=3", () => true)).toBe(
    "/foo?b=2&b=3&a=1",
  );
});

test("[happy-9] selects the keys whose value is an array", () => {
  expect(
    filterQuery("/foo?a=1&b=2&a=3", (_key, value) => Array.isArray(value)),
  ).toBe("/foo?a=1&a=3");
});

test("[happy-9] selects the keys whose value is a single string", () => {
  expect(
    filterQuery("/foo?a=1&b=2&a=3", (_key, value) => !Array.isArray(value)),
  ).toBe("/foo?b=2");
});

test("[boundary-8] keeps an empty value inside a repeated key", () => {
  expect(filterQuery("/foo?a=1&a=", () => true)).toBe("/foo?a=1&a=");
});

test("[boundary-8] keeps an empty first value inside a repeated key", () => {
  expect(filterQuery("/foo?a=&a=1", () => true)).toBe("/foo?a=&a=1");
});

// Rule: kept parameters are written again with stringifyQuery

test("[happy-10] encodes kept parameters again", () => {
  expect(filterQuery("/foo?a=b c&x=%E5%A5%BD&p=1+2", () => true)).toBe(
    "/foo?a=b+c&x=%E5%A5%BD&p=1+2",
  );
});

test("[happy-10] normalises keys, empty values and empty segments when everything is kept", () => {
  const cases = [
    { input: "/foo?key%20x=1", output: "/foo?key+x=1" },
    { input: "/foo?a=&b&c=1", output: "/foo?a&b&c=1" },
    { input: "/foo?a=1&&b=2", output: "/foo?a=1&b=2" },
    { input: "/foo?a=%26", output: "/foo?a=%26" },
    { input: "/foo?bar=1&baz=2", output: "/foo?bar=1&baz=2" },
  ];
  for (const t of cases) {
    expect(filterQuery(t.input, () => true)).toBe(t.output);
  }
});

test("[boundary-9] treats a second '?' in the query as part of the value", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("/foo?a=1?b=2", predicate)).toBe("/foo?a=1?b=2");
  expect(calls).toEqual([["a", "1?b=2"]]);
});

test("[boundary-9] keeps a value containing '?' while dropping a later parameter", () => {
  expect(filterQuery("/foo?a=1?b=2&c=3", (key) => key !== "c")).toBe(
    "/foo?a=1?b=2",
  );
});

// Rule: "__proto__" and "constructor" are always removed

test("[unhappy-1] drops prototype-pollution keys without offering them", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("/foo?__proto__=1&constructor=2&a=3", predicate)).toBe(
    "/foo?a=3",
  );
  expect(calls.map((call) => call[0])).toEqual(["a"]);
});

test("[unhappy-1] removes the query when it holds only prototype-pollution keys", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("/foo?__proto__=1&constructor=2", predicate)).toBe("/foo");
  expect(calls).toHaveLength(0);
});

// Rule: an error thrown by the predicate propagates unchanged

test("[unhappy-2] propagates the predicate's error and offers no later keys", () => {
  const error = new Error("boom");
  const keys: string[] = [];
  let thrown: unknown;
  try {
    filterQuery("/foo?a=1&b=2&c=3", (key) => {
      keys.push(key);
      if (key === "b") {
        throw error;
      }
      return true;
    });
  } catch (error_) {
    thrown = error_;
  }
  expect(thrown).toBe(error);
  expect((thrown as Error).message).toBe("boom");
  expect(keys).toEqual(["a", "b"]);
});

test("[unhappy-2] stops at the first key when the predicate throws on it", () => {
  const keys: string[] = [];
  expect(() =>
    filterQuery("/foo?a=1&b=2&c=3", (key) => {
      keys.push(key);
      throw new Error("boom");
    }),
  ).toThrow("boom");
  expect(keys).toEqual(["a"]);
});

// Rule: arguments are not checked up front

test("[unhappy-3] throws a TypeError when input is undefined", () => {
  const { calls, predicate } = recorder(true);
  expect(() => filterQuery(undefined as unknown as string, predicate)).toThrow(
    TypeError,
  );
  expect(calls).toHaveLength(0);
});

test("[unhappy-3] throws a TypeError when input is null or a number", () => {
  const { calls, predicate } = recorder(true);
  // eslint-disable-next-line unicorn/no-null
  expect(() => filterQuery(null as unknown as string, predicate)).toThrow(
    TypeError,
  );
  expect(() => filterQuery(42 as unknown as string, predicate)).toThrow(
    TypeError,
  );
  expect(calls).toHaveLength(0);
});

test("[unhappy-4] throws a TypeError when the predicate is not a function and there is a parameter", () => {
  expect(() =>
    filterQuery("/foo?a=1", undefined as unknown as Predicate),
  ).toThrow(TypeError);
  expect(() => filterQuery("/foo?a=1", "a" as unknown as Predicate)).toThrow(
    TypeError,
  );
});

test("[unhappy-4] does not throw for a non-function predicate when there is no parameter to offer", () => {
  expect(filterQuery("/foo", true as unknown as Predicate)).toBe("/foo");
  expect(filterQuery("/foo?", undefined as unknown as Predicate)).toBe("/foo");
});

// Rule: filterQuery is synchronous and keeps no state

test("[concurrency-1] a filterQuery call nested in the predicate is independent", () => {
  const inner: string[] = [];
  const result = filterQuery("/foo?a=1&b=2", (key) => {
    inner.push(filterQuery("/x?p=1&q=2", (k) => k === "q"));
    return key === "b";
  });
  expect(result).toBe("/foo?b=2");
  expect(inner.length).toBeGreaterThan(0);
  for (const r of inner) {
    expect(r).toBe("/x?q=2");
  }
});

test("[concurrency-1] a nested call that removes every parameter does not affect the outer call", () => {
  const inner: string[] = [];
  const result = filterQuery("/foo?a=1&b=2", (key) => {
    inner.push(filterQuery("/x?p=1", () => false));
    return key === "a";
  });
  expect(result).toBe("/foo?a=1");
  expect(inner).toEqual(["/x", "/x"]);
});

test("[concurrency-2] repeated calls with the same arguments give the same result", () => {
  const predicate = (key: string) => key !== "bar";
  expect(filterQuery("/foo?bar=1&baz=2", predicate)).toBe("/foo?baz=2");
  expect(filterQuery("/foo?bar=1&baz=2", predicate)).toBe("/foo?baz=2");
});

test("[concurrency-2] a call on another input in between does not change the repeated result", () => {
  const predicate = (key: string) => key !== "bar";
  const first = filterQuery("/foo?bar=1&baz=2", predicate);
  expect(filterQuery("/other?bar=1", predicate)).toBe("/other");
  const second = filterQuery("/foo?bar=1&baz=2", predicate);
  expect(first).toBe("/foo?baz=2");
  expect(second).toBe("/foo?baz=2");
});

test("[boundary-10] leaves the input string unmodified", () => {
  const input = "/foo?bar=1&baz=2";
  expect(filterQuery(input, () => false)).toBe("/foo");
  expect(input).toBe("/foo?bar=1&baz=2");
});

test("[boundary-10] leaves the input string unmodified when every parameter is kept", () => {
  const input = "/foo?a=b c&a=1";
  expect(filterQuery(input, () => true)).toBe("/foo?a=b+c&a=1");
  expect(input).toBe("/foo?a=b c&a=1");
});
