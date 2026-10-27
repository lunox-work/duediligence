import { expect, test } from "vitest";
import { filterQuery } from "../../src/utils";

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

// Extends "[happy-1] removes the one parameter the predicate rejects from a path"
test("[happy-1] removes a rejected key without touching keys that contain its name", () => {
  expect(
    filterQuery("/foo?bar=1&barbaz=2&xbar=3&baz=bar", (key) => key !== "bar"),
  ).toBe("/foo?barbaz=2&xbar=3&baz=bar");
});

// Extends "[happy-1] removes the one parameter the predicate rejects from a path"
test("[happy-1] removes the first, middle or last parameter of a longer query", () => {
  const input = "/foo?a=1&b=2&c=3&d=4&e=5";
  expect(filterQuery(input, (key) => key !== "a")).toBe("/foo?b=2&c=3&d=4&e=5");
  expect(filterQuery(input, (key) => key !== "c")).toBe("/foo?a=1&b=2&d=4&e=5");
  expect(filterQuery(input, (key) => key !== "e")).toBe("/foo?a=1&b=2&c=3&d=4");
});

// Extends "[happy-1] removes every value of a rejected repeated key"
test("[happy-1] removes a tracking parameter from an absolute URL", () => {
  expect(
    filterQuery(
      "https://example.com/search?q=ufo&utm_source=x&page=2&utm_source=y",
      (key) => key !== "utm_source",
    ),
  ).toBe("https://example.com/search?q=ufo&page=2");
});

// Extends "[happy-2] keeps only the parameter the predicate accepts"
test("[happy-2] keeps only the accepted parameters chosen by a set of keys", () => {
  const allowed = new Set(["c", "a"]);
  expect(
    filterQuery("/foo?a=1&b=2&c=3&d=4", (key) => allowed.has(key)),
  ).toBe("/foo?a=1&c=3");
});

// Extends "[happy-2] keeps only the middle parameter out of three"
test("[happy-2] keeps only the parameter whose value the predicate accepts", () => {
  expect(
    filterQuery("/foo?a=1&b=2&c=3", (_key, value) => value === "3"),
  ).toBe("/foo?c=3");
});

// Extends "[happy-3] leaves protocol, auth, host, port, path and fragment as they are"
test("[happy-3] leaves the rest of other absolute URLs as they are", () => {
  const cases = [
    {
      input: "http://example.com:3000/a/b?x=1&b=2&y=3#f",
      output: "http://example.com:3000/a/b?b=2#f",
    },
    { input: "ftp://user@host/p?a=1&b=2", output: "ftp://user@host/p?b=2" },
    {
      input: "https://example.com/a%20b/c?a=1&b=2",
      output: "https://example.com/a%20b/c?b=2",
    },
  ];
  for (const t of cases) {
    expect(filterQuery(t.input, (key) => key === "b")).toBe(t.output);
  }
});

// Extends "[happy-3] preserves the rest of host-only, protocol-relative, hashed and query-only inputs"
test("[happy-3] keeps a fragment that itself contains '?' and '&'", () => {
  expect(filterQuery("/foo/bar.html?a=1&b=2#x?a=1&b=2", (key) => key === "b")).toBe(
    "/foo/bar.html?b=2#x?a=1&b=2",
  );
  expect(filterQuery("?b=2&a=1#?a", (key) => key === "b")).toBe("?b=2#?a");
});

// Extends "[happy-3] preserves the rest of host-only, protocol-relative, hashed and query-only inputs"
test("[happy-3] leaves a relative path without a leading slash as it is", () => {
  expect(filterQuery("foo/bar?a=1&b=2", (key) => key === "b")).toBe(
    "foo/bar?b=2",
  );
});

// Extends "[happy-4] reads a 1 / 0 predicate result as truthy / falsy"
test("[happy-4] reads '0', [] and {} as truthy and NaN, '' and null as falsy", () => {
  const results: Record<string, unknown> = {
    a: "0",
    b: Number.NaN,
    c: [],
    d: "",
    e: {},
    // eslint-disable-next-line unicorn/no-null
    f: null,
    g: -1,
  };
  const predicate = ((key: string) => results[key]) as unknown as Predicate;
  expect(filterQuery("/foo?a=1&b=2&c=3&d=4&e=5&f=6&g=7", predicate)).toBe(
    "/foo?a=1&c=3&e=5&g=7",
  );
});

// Extends "[happy-5] offers each key once with its single value and exactly two arguments"
test("[happy-5] offers each of four keys once, in order, with exactly two arguments", () => {
  const { calls, predicate } = recorder(false);
  expect(filterQuery("/foo?w=1&x=2&y=3&z=4", predicate)).toBe("/foo");
  expect(calls).toEqual([
    ["w", "1"],
    ["x", "2"],
    ["y", "3"],
    ["z", "4"],
  ]);
  for (const call of calls) {
    expect(call).toHaveLength(2);
    expect(typeof call[1]).toBe("string");
  }
});

// Extends "[happy-5] offers a single parameter exactly once"
test("[happy-5] offers each key once whatever the predicate returns", () => {
  const keys: string[] = [];
  filterQuery("http://e.com/p?k1=a&k2=b&k3=c#h", (key) => {
    keys.push(key);
    return key === "k2";
  });
  expect(keys).toEqual(["k1", "k2", "k3"]);
});

// Extends "[happy-6] offers a repeated key once with an array of its values in input order"
test("[happy-6] offers two interleaved repeated keys once each with their values in input order", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?a=1&b=2&a=3&b=4&a=5&c=6", predicate);
  expect(calls).toEqual([
    ["a", ["1", "3", "5"]],
    ["b", ["2", "4"]],
    ["c", "6"],
  ]);
});

// Extends "[happy-6] keeps input order, not sorted order, for the values of a key repeated three times"
test("[happy-6] offers a key repeated five times with all its values, including duplicates", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?z=b&z=a&z=b&z=c&z=a", predicate);
  expect(calls).toEqual([["z", ["b", "a", "b", "c", "a"]]]);
});

// Extends "[happy-7] offers keys and values decoded"
test("[happy-7] offers encoded '=', '/', '#', '?' and non-ASCII keys and values decoded", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?a%3Db=%3D&%E5%A5%BD=%2F&h=%23x&q=%3F", predicate);
  expect(calls).toEqual([
    ["a=b", "="],
    ["好", "/"],
    ["h", "#x"],
    ["q", "?"],
  ]);
});

// Extends "[happy-7] decodes '+' in a key to a space and an encoded '+' in a value to '+'"
test("[happy-7] offers the decoded values of a repeated key", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?t=a+b&t=%E5%A5%BD&t=x%26y", predicate);
  expect(calls).toEqual([["t", ["a b", "好", "x&y"]]]);
});

// Rule: a repeated key is kept or dropped as a whole, and written grouped

// Extends "[happy-8] keeps all values of a repeated key together"
test("[happy-8] groups two interleaved repeated keys where each first appears", () => {
  expect(filterQuery("/foo?b=1&a=2&b=3&a=4&c=5", () => true)).toBe(
    "/foo?b=1&b=3&a=2&a=4&c=5",
  );
});

// Extends "[happy-8] groups a repeated key where it first appears"
test("[happy-8] groups the kept repeated key after another key is removed", () => {
  expect(
    filterQuery("/foo?a=1&c=0&b=2&a=3&c=9", (key) => key !== "c"),
  ).toBe("/foo?a=1&a=3&b=2");
});

// Extends "[happy-9] selects the keys whose value is an array"
test("[happy-9] selects keys by the contents of their values", () => {
  expect(
    filterQuery("/foo?a=1&b=2&a=3&c=2&c=4&d=5", (_key, value) =>
      (Array.isArray(value) ? value : [value]).includes("2"),
    ),
  ).toBe("/foo?b=2&c=2&c=4");
});

// Extends "[happy-9] selects the keys whose value is a single string"
test("[happy-9] selects the keys repeated more than twice", () => {
  expect(
    filterQuery(
      "/foo?a=1&b=1&a=2&b=2&a=3&c=1",
      (_key, value) => Array.isArray(value) && value.length > 2,
    ),
  ).toBe("/foo?a=1&a=2&a=3");
});

// Rule: kept parameters are written again with stringifyQuery

// Extends "[happy-10] encodes kept parameters again"
test("[happy-10] writes '/', '+', lower-case escapes and trailing spaces again in normal form", () => {
  const cases = [
    { input: "/foo?q=a/b", output: "/foo?q=a%2Fb" },
    { input: "/foo?q=a%2Bb", output: "/foo?q=a%2Bb" },
    { input: "/foo?a=%e5%a5%bd", output: "/foo?a=%E5%A5%BD" },
    { input: "/foo?a=1%20", output: "/foo?a=1+" },
    { input: "/foo?k%3D1=2", output: "/foo?k%3D1=2" },
    { input: "/foo?h=%23x", output: "/foo?h=%23x" },
  ];
  for (const t of cases) {
    expect(filterQuery(t.input, () => true)).toBe(t.output);
  }
});

// Extends "[happy-10] normalises keys, empty values and empty segments when everything is kept"
test("[happy-10] normalises the kept parameters when another one is removed", () => {
  expect(
    filterQuery("/foo?&a=b c&&drop=1&e=&x=%e5%a5%bd&", (key) => key !== "drop"),
  ).toBe("/foo?a=b+c&e&x=%E5%A5%BD");
});

// Rule: when no parameters are left, the "?" is removed too

// Extends "[boundary-1] removes the query and its '?' when every parameter is rejected"
test("[boundary-1] removes the '?' from absolute and protocol-relative URLs when every parameter is rejected", () => {
  const cases = [
    { input: "//example.com/p?a=1&b=2", output: "//example.com/p" },
    {
      input: "http://user:pw@e.com:81/p?a=1&a=2#f",
      output: "http://user:pw@e.com:81/p#f",
    },
    { input: "https://example.com?a=1", output: "https://example.com" },
    { input: "?a=1&b=2#h", output: "#h" },
  ];
  for (const t of cases) {
    expect(filterQuery(t.input, () => false)).toBe(t.output);
  }
});

// Extends "[boundary-1] keeps the fragment, and empties a query-only input, when every parameter is rejected"
test("[boundary-1] removes the '?' when a selective predicate happens to reject every parameter", () => {
  expect(filterQuery("/foo?a=1&b=2&a=3", (key) => key === "z")).toBe("/foo");
});

// Extends "[boundary-2] drops a bare trailing '?' without calling the predicate"
test("[boundary-2] drops a lone '?' and empty queries on absolute URLs without calling the predicate", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("?", predicate)).toBe("");
  expect(filterQuery("?&", predicate)).toBe("");
  expect(filterQuery("http://e.com/p?", predicate)).toBe("http://e.com/p");
  expect(filterQuery("http://e.com/p?#f", predicate)).toBe("http://e.com/p#f");
  expect(filterQuery("/foo?&#h", predicate)).toBe("/foo#h");
  expect(calls).toHaveLength(0);
});

// Rule: an input with no "?" anywhere is returned exactly as given

// Extends "[boundary-3] returns empty, root, encoded and hashed inputs without a query exactly as given"
test("[boundary-3] returns inputs a rebuild would change exactly as given when there is no '?'", () => {
  const { calls, predicate } = recorder(false);
  for (const input of [
    "JavaScript:alert(1)",
    "data:text/plain,hello",
    "HTTP://EXAMPLE.COM/A",
    "file:///C:/x",
    "http:\\\\example.com\\a",
    "  /foo bar ",
    "/foo#",
  ]) {
    expect(filterQuery(input, predicate)).toBe(input);
  }
  expect(calls).toHaveLength(0);
});

// Rule: a "?" only inside the fragment is not a query

// Extends "[boundary-4] treats a '?' only inside the fragment as not a query"
test("[boundary-4] leaves fragments holding '?' unchanged without calling the predicate", () => {
  const { calls, predicate } = recorder(false);
  for (const input of [
    "/foo#?",
    "http://e.com#a?b=1&c=2",
    "//e.com/p#x?y=1",
    "#?a=1",
  ]) {
    expect(filterQuery(input, predicate)).toBe(input);
  }
  expect(calls).toHaveLength(0);
});

// Rule: script-protocol inputs that contain a "?" are rebuilt without filtering

// Extends "[boundary-5] rebuilds a data: input with '//' and its query unfiltered"
test("[boundary-5] rebuilds a vbscript: input with '//' and its query unfiltered", () => {
  const { calls, predicate } = recorder(false);
  expect(filterQuery("vbscript:msgbox(1)?a=1", predicate)).toBe(
    "vbscript://msgbox(1)?a=1",
  );
  expect(calls).toHaveLength(0);
});

// Extends "[boundary-5] lower-cases a mixed-case script protocol and leaves javascript: and blob: queries unfiltered"
test("[boundary-5] lower-cases upper-case script protocols and keeps several parameters and a fragment unfiltered", () => {
  const { calls, predicate } = recorder(false);
  const cases = [
    {
      input: "DATA:text/plain?a=1&b=2#x",
      output: "data://text/plain?a=1&b=2#x",
    },
    { input: "BLOB:https://e.com/id?a=1&a=2", output: "blob://https://e.com/id?a=1&a=2" },
    { input: "VBScript:x?__proto__=1", output: "vbscript://x?__proto__=1" },
  ];
  for (const t of cases) {
    expect(filterQuery(t.input, predicate)).toBe(t.output);
  }
  expect(calls).toHaveLength(0);
});

// Rule: the predicate is offered empty values as the empty string

// Extends "[boundary-6] offers a parameter with no '=' or an empty value with the empty string"
test("[boundary-6] offers a repeated key with empty and missing values as empty strings", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?a&b=1&a=&a=2", predicate);
  expect(calls).toEqual([
    ["a", ["", "", "2"]],
    ["b", "1"],
  ]);
});

// Extends "[boundary-6] offers a lone key without '=' with the empty string"
test("[boundary-6] keeps an empty-valued key while dropping another", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("/foo?x=&y", predicate)).toBe("/foo?x&y");
  expect(calls).toEqual([
    ["x", ""],
    ["y", ""],
  ]);
  expect(filterQuery("/foo?a=&b", (key) => key === "b")).toBe("/foo?b");
});

// Rule: integer-like keys come first in ascending order

// Extends "[boundary-7] offers and writes integer-like keys first in ascending order"
test("[boundary-7] offers and writes several integer-like keys first, then the others in first-appearance order", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("/foo?z=1&10=a&2=b&a=c&0=d", predicate)).toBe(
    "/foo?0=d&2=b&10=a&z=1&a=c",
  );
  expect(calls.map((call) => call[0])).toEqual(["0", "2", "10", "z", "a"]);
});

// Extends "[boundary-7] orders integer-like keys numerically, not as text"
test("[boundary-7] does not move keys with a leading zero or a sign", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("/foo?b=1&01=x&-1=z&1=y", predicate)).toBe(
    "/foo?1=y&b=1&01=x&-1=z",
  );
  expect(calls.map((call) => call[0])).toEqual(["1", "b", "01", "-1"]);
});

// Extends "[boundary-7] offers and writes integer-like keys first in ascending order"
test("[boundary-7] groups a repeated integer-like key first while filtering another", () => {
  expect(
    filterQuery("/foo?b=1&5=x&c=2&3=w&5=y", (key) => key !== "c"),
  ).toBe("/foo?3=w&5=x&5=y&b=1");
});

// Rule: empty values inside a repeated key are kept

// Extends "[boundary-8] keeps an empty value inside a repeated key"
test("[boundary-8] writes the empty values of a repeated key with '='", () => {
  expect(filterQuery("/foo?a&a", () => true)).toBe("/foo?a=&a=");
  expect(filterQuery("/foo?a=&a=&b=1", () => true)).toBe("/foo?a=&a=&b=1");
});

// Extends "[boundary-8] keeps an empty first value inside a repeated key"
test("[boundary-8] keeps the empty values of a repeated key while dropping another key", () => {
  expect(filterQuery("/foo?b=1&a=&c=&a=2", (key) => key === "a")).toBe(
    "/foo?a=&a=2",
  );
});

// Rule: a second "?" in the query belongs to the value

// Extends "[boundary-9] treats a second '?' in the query as part of the value"
test("[boundary-9] offers every parameter after a value containing '?'", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("/foo?a=1?b=2&c=3", predicate)).toBe("/foo?a=1?b=2&c=3");
  expect(calls).toEqual([
    ["a", "1?b=2"],
    ["c", "3"],
  ]);
});

// Extends "[boundary-9] keeps a value containing '?' while dropping a later parameter"
test("[boundary-9] does not offer the text after a second '?' as its own key", () => {
  const keys: string[] = [];
  expect(
    filterQuery("http://e.com/p?a=1?b=2&b=3", (key) => {
      keys.push(key);
      return key === "b";
    }),
  ).toBe("http://e.com/p?b=3");
  expect(keys).toEqual(["a", "b"]);
});

// Rule: the input string is not modified

// Extends "[boundary-10] leaves the input string unmodified"
test("[boundary-10] leaves an absolute input string unmodified when parameters are removed", () => {
  const input = "http://e.com/p?a=b c&b=2#f";
  expect(filterQuery(input, (key) => key === "a")).toBe("http://e.com/p?a=b+c#f");
  expect(input).toBe("http://e.com/p?a=b c&b=2#f");
});

// Rule: "__proto__" and "constructor" are always removed

// Extends "[unhappy-1] drops prototype-pollution keys without offering them"
test("[unhappy-1] drops repeated and encoded prototype-pollution keys without offering them", () => {
  const { calls, predicate } = recorder(true);
  expect(
    filterQuery(
      "/foo?a=1&__proto__=x&%5F%5Fproto%5F%5F=y&constructor=z&b=2&constructor=w",
      predicate,
    ),
  ).toBe("/foo?a=1&b=2");
  expect(calls.map((call) => call[0])).toEqual(["a", "b"]);
});

// Extends "[unhappy-1] removes the query when it holds only prototype-pollution keys"
test("[unhappy-1] keeps other Object.prototype names and drops only the two polluting keys", () => {
  const { calls, predicate } = recorder(true);
  expect(
    filterQuery("/foo?toString=1&constructor=2&hasOwnProperty=3", predicate),
  ).toBe("/foo?toString=1&hasOwnProperty=3");
  expect(calls).toEqual([
    ["toString", "1"],
    ["hasOwnProperty", "3"],
  ]);
});

// Extends "[unhappy-1] drops prototype-pollution keys without offering them"
test("[unhappy-1] drops prototype-pollution keys even when the predicate accepts everything on an absolute URL", () => {
  expect(
    filterQuery("http://e.com/p?constructor=1&__proto__=2#f", () => true),
  ).toBe("http://e.com/p#f");
});

// Rule: an error thrown by the predicate propagates unchanged

class PredicateError extends Error {}

// Extends "[unhappy-2] propagates the predicate's error and offers no later keys"
test("[unhappy-2] propagates an error subclass from the last key unchanged", () => {
  const error = new PredicateError("late");
  const keys: string[] = [];
  let thrown: unknown;
  try {
    filterQuery("/foo?a=1&b=2&c=3&d=4", (key) => {
      keys.push(key);
      if (key === "d") {
        throw error;
      }
      return false;
    });
  } catch (error_) {
    thrown = error_;
  }
  expect(thrown).toBe(error);
  expect(thrown).toBeInstanceOf(PredicateError);
  expect((thrown as Error).message).toBe("late");
  expect(keys).toEqual(["a", "b", "c", "d"]);
});

// Extends "[unhappy-2] stops at the first key when the predicate throws on it"
test("[unhappy-2] propagates a TypeError thrown by the predicate without wrapping it", () => {
  const error = new TypeError("from predicate");
  const keys: string[] = [];
  let thrown: unknown;
  try {
    filterQuery("/foo?x=1&y=2&x=3&z=4", (key) => {
      keys.push(key);
      if (key === "y") {
        throw error;
      }
      return true;
    });
  } catch (error_) {
    thrown = error_;
  }
  expect(thrown).toBe(error);
  expect((thrown as Error).message).toBe("from predicate");
  expect(keys).toEqual(["x", "y"]);
});

// Extends "[unhappy-2] propagates the predicate's error and offers no later keys"
test("[unhappy-2] propagates a thrown error when the predicate would have kept every other key", () => {
  const error = new Error("boom");
  expect(() =>
    filterQuery("/foo?a=1&b=2&c=3", (key) => {
      if (key === "b") {
        throw error;
      }
      return true;
    }),
  ).toThrow(error);
});

// Rule: arguments are not checked up front

// Extends "[unhappy-3] throws a TypeError when input is null or a number"
test("[unhappy-3] throws a TypeError when input is a boolean or a plain object", () => {
  const { calls, predicate } = recorder(true);
  expect(() => filterQuery(true as unknown as string, predicate)).toThrow(
    TypeError,
  );
  expect(() => filterQuery({} as unknown as string, predicate)).toThrow(
    TypeError,
  );
  expect(calls).toHaveLength(0);
});

// Extends "[unhappy-3] throws a TypeError when input is undefined"
test("[unhappy-3] throws a TypeError for a non-string input even with a non-function predicate", () => {
  expect(() =>
    filterQuery(undefined as unknown as string, true as unknown as Predicate),
  ).toThrow(TypeError);
  expect(() =>
    filterQuery(0 as unknown as string, undefined as unknown as Predicate),
  ).toThrow(TypeError);
});

// Extends "[unhappy-4] throws a TypeError when the predicate is not a function and there is a parameter"
test("[unhappy-4] throws a TypeError for null, number and object predicates when there is a parameter", () => {
  for (const predicate of [
    // eslint-disable-next-line unicorn/no-null
    null,
    42,
    {},
    true,
  ]) {
    expect(() =>
      filterQuery("http://e.com/p?a=1#x", predicate as unknown as Predicate),
    ).toThrow(TypeError);
  }
});

// Extends "[unhappy-4] does not throw for a non-function predicate when there is no parameter to offer"
test("[unhappy-4] returns for a non-function predicate when no parameter is left after parsing", () => {
  const predicate = undefined as unknown as Predicate;
  expect(filterQuery("", predicate)).toBe("");
  expect(filterQuery("/foo?&&", predicate)).toBe("/foo");
  expect(filterQuery("/foo#a?b=1", predicate)).toBe("/foo#a?b=1");
  expect(filterQuery("/foo?__proto__=1&constructor=2", predicate)).toBe("/foo");
  expect(filterQuery("data:text/plain?a=1", predicate)).toBe(
    "data://text/plain?a=1",
  );
  expect(filterQuery("JavaScript:x", "a" as unknown as Predicate)).toBe(
    "JavaScript:x",
  );
});

// Rule: filterQuery is synchronous and keeps no state

// Extends "[concurrency-1] a filterQuery call nested in the predicate is independent"
test("[concurrency-1] a nested call on the same input with a different predicate is independent", () => {
  const inner: string[] = [];
  const outerKeys: string[] = [];
  const result = filterQuery("/foo?a=1&b=2&c=3", (key) => {
    outerKeys.push(key);
    inner.push(filterQuery("/foo?a=1&b=2&c=3", (k) => k === "a"));
    return key !== "a";
  });
  expect(result).toBe("/foo?b=2&c=3");
  expect(outerKeys).toEqual(["a", "b", "c"]);
  expect(inner).toEqual(["/foo?a=1", "/foo?a=1", "/foo?a=1"]);
});

// Extends "[concurrency-1] a nested call that removes every parameter does not affect the outer call"
test("[concurrency-1] calls nested three deep and a nested call that throws do not affect the outer call", () => {
  const innermost: string[] = [];
  const caught: unknown[] = [];
  const result = filterQuery("/o?a=1&b=2", (key) => {
    const middle = filterQuery("/m?x=1&y=2", (k) => {
      innermost.push(filterQuery("/i?p=1&q=2&p=3", (kk) => kk === "p"));
      return k === "y";
    });
    expect(middle).toBe("/m?y=2");
    try {
      filterQuery("/t?z=1", () => {
        throw new Error("inner");
      });
    } catch (error) {
      caught.push(error);
    }
    return key === "a";
  });
  expect(result).toBe("/o?a=1");
  expect(innermost).toEqual(["/i?p=1&p=3", "/i?p=1&p=3", "/i?p=1&p=3", "/i?p=1&p=3"]);
  expect(caught).toHaveLength(2);
  for (const error of caught) {
    expect((error as Error).message).toBe("inner");
  }
});

// Extends "[concurrency-2] repeated calls with the same arguments give the same result"
test("[concurrency-2] repeated calls give the same result many times over", () => {
  const predicate = (key: string) => key !== "bar";
  const results = Array.from({ length: 5 }, () =>
    filterQuery("http://e.com/p?bar=1&baz=2&bar=3#h", predicate),
  );
  expect(results).toEqual(Array.from({ length: 5 }, () => "http://e.com/p?baz=2#h"));
});

// Extends "[concurrency-2] a call on another input in between does not change the repeated result"
test("[concurrency-2] the same input with another predicate in between, or a call that threw, does not change the repeated result", () => {
  const predicate = (key: string) => key !== "bar";
  expect(filterQuery("/foo?bar=1&baz=2", predicate)).toBe("/foo?baz=2");
  expect(filterQuery("/foo?bar=1&baz=2", (key) => key === "bar")).toBe(
    "/foo?bar=1",
  );
  expect(() =>
    filterQuery("/foo?bar=1&baz=2", () => {
      throw new Error("boom");
    }),
  ).toThrow("boom");
  expect(filterQuery("/foo?bar=1&baz=2", predicate)).toBe("/foo?baz=2");
});
