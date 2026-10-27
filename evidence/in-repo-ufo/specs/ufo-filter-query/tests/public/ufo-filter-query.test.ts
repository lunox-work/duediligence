import { expect, test } from "vitest";
import { filterQuery } from "../src/utils";

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

test("[happy-1] removing one parameter from a path", () => {
  expect(filterQuery("/foo?bar=1&baz=2", (key) => key !== "bar")).toBe(
    "/foo?baz=2",
  );
});

test("[happy-1] removing a parameter between two kept ones", () => {
  expect(filterQuery("/foo?a=1&bar=2&c=3", (key) => key !== "bar")).toBe(
    "/foo?a=1&c=3",
  );
});

test("[happy-2] keeping only the parameter the predicate accepts", () => {
  expect(filterQuery("/foo?bar=1&baz=2", (key) => key !== "baz")).toBe(
    "/foo?bar=1",
  );
});

test("[happy-2] keeping only the accepted parameter among several", () => {
  expect(
    filterQuery("/foo?bar=1&baz=2&qux=3", (key) => key === "baz"),
  ).toBe("/foo?baz=2");
});

test("[happy-3] protocol, auth, host, port, path and fragment are preserved", () => {
  const tests = [
    {
      input: "http://user:pw@example.com:8080/p?a=1&b=2#frag",
      output: "http://user:pw@example.com:8080/p?b=2#frag",
    },
    { input: "https://example.com?a=1&b=2", output: "https://example.com?b=2" },
    { input: "//example.com/p?a=1&b=2", output: "//example.com/p?b=2" },
    { input: "/foo?a=1&b=2#hash", output: "/foo?b=2#hash" },
    { input: "?a=1&b=2", output: "?b=2" },
  ];
  for (const t of tests) {
    expect(filterQuery(t.input, (key) => key === "b")).toBe(t.output);
  }
});

test("[happy-3] host with port and fragment but no path is preserved", () => {
  expect(
    filterQuery("http://example.com:8080?a=1&b=2#f", (key) => key === "b"),
  ).toBe("http://example.com:8080?b=2#f");
});

test("[happy-3] protocol-relative URL with auth and fragment is preserved", () => {
  expect(
    filterQuery("//user:pw@example.com/p?a=1&b=2#frag", (key) => key === "b"),
  ).toBe("//user:pw@example.com/p?b=2#frag");
});

test("[happy-4] the predicate's return value is read as truthy or falsy", () => {
  const predicate = ((key: string) => (key === "a" ? 1 : 0)) as unknown as Predicate;
  expect(filterQuery("/foo?a=1&b=2", predicate)).toBe("/foo?a=1");
});

test("[happy-4] a non-empty string keeps and undefined drops", () => {
  const predicate = ((key: string) =>
    key === "a" ? "yes" : undefined) as unknown as Predicate;
  expect(filterQuery("/foo?a=1&b=2", predicate)).toBe("/foo?a=1");
});

test("[happy-5] each key is offered once with its single value", () => {
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

test("[happy-5] a single parameter is offered exactly once", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?bar=1", predicate);
  expect(calls).toEqual([["bar", "1"]]);
  expect(calls[0]).toHaveLength(2);
});

test("[happy-6] a repeated key is offered once with an array of its values", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?a=1&b=2&a=3", predicate);
  expect(calls).toEqual([
    ["a", ["1", "3"]],
    ["b", "2"],
  ]);
});

test("[happy-6] a key repeated three times is offered once with all values in order", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?a=3&a=1&a=2", predicate);
  expect(calls).toEqual([["a", ["3", "1", "2"]]]);
});

test("[happy-7] keys and values reach the predicate decoded", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?key%20x=b+c&u=%E5%A5%BD&e=%26", predicate);
  expect(calls).toEqual([
    ["key x", "b c"],
    ["u", "好"],
    ["e", "&"],
  ]);
});

test("[happy-7] values of a repeated key reach the predicate decoded", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?k=a+b&k=%26", predicate);
  expect(calls).toEqual([["k", ["a b", "&"]]]);
});

test("[happy-8] keeping a repeated key keeps all its values together", () => {
  expect(filterQuery("/foo?a=1&b=2&a=3", () => true)).toBe(
    "/foo?a=1&a=3&b=2",
  );
});

test("[happy-8] rejecting a repeated key drops all its values", () => {
  expect(filterQuery("/foo?a=1&b=2&a=3", (key) => key !== "a")).toBe(
    "/foo?b=2",
  );
});

test("[happy-9] selecting by the shape of the value", () => {
  expect(
    filterQuery("/foo?a=1&b=2&a=3", (key, value) => Array.isArray(value)),
  ).toBe("/foo?a=1&a=3");
});

test("[happy-9] selecting arrays when no key repeats drops the whole query", () => {
  expect(
    filterQuery("/foo?a=1&b=2", (key, value) => Array.isArray(value)),
  ).toBe("/foo");
});

test("[happy-10] kept parameters are encoded again", () => {
  const tests = [
    {
      input: "/foo?a=b c&x=%E5%A5%BD&p=1+2",
      output: "/foo?a=b+c&x=%E5%A5%BD&p=1+2",
    },
    { input: "/foo?key%20x=1", output: "/foo?key+x=1" },
    { input: "/foo?a=&b&c=1", output: "/foo?a&b&c=1" },
    { input: "/foo?a=1&&b=2", output: "/foo?a=1&b=2" },
    { input: "/foo?a=%26", output: "/foo?a=%26" },
    { input: "/foo?bar=1&baz=2", output: "/foo?bar=1&baz=2" },
  ];
  for (const t of tests) {
    expect(filterQuery(t.input, () => true)).toBe(t.output);
  }
});

test("[happy-10] a lone key with an empty value is written without '='", () => {
  expect(filterQuery("/foo?a=", () => true)).toBe("/foo?a");
});

// boundary

test("[boundary-1] every parameter is rejected", () => {
  const tests = [
    { input: "/foo?bar=1&baz=2", output: "/foo" },
    { input: "/foo?bar=1&baz=2#hash", output: "/foo#hash" },
    {
      input: "http://example.com/p?a=1#frag",
      output: "http://example.com/p#frag",
    },
    { input: "?a=1", output: "" },
  ];
  for (const t of tests) {
    expect(filterQuery(t.input, () => false)).toBe(t.output);
  }
});

test("[boundary-1] rejecting the only, repeated key removes the '?'", () => {
  expect(filterQuery("//example.com/p?a=1&a=2", () => false)).toBe(
    "//example.com/p",
  );
});

test("[boundary-2] an empty query is dropped without calling the predicate", () => {
  const tests = [
    { input: "/foo?", output: "/foo" },
    { input: "/foo?#h", output: "/foo#h" },
    { input: "/foo?&&", output: "/foo" },
  ];
  for (const t of tests) {
    const { calls, predicate } = recorder(true);
    expect(filterQuery(t.input, predicate)).toBe(t.output);
    expect(calls).toEqual([]);
  }
});

test("[boundary-2] a lone '?' becomes the empty string", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("?", predicate)).toBe("");
  expect(calls).toEqual([]);
});

test("[boundary-2] an empty query on an absolute URL with a fragment is dropped", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("http://example.com/p?#f", predicate)).toBe(
    "http://example.com/p#f",
  );
  expect(calls).toEqual([]);
});

test("[boundary-3] inputs without a query are returned unchanged", () => {
  const inputs = [
    "",
    "/",
    "/foo",
    "http://example.com/a%20b",
    "/foo#section",
  ];
  for (const input of inputs) {
    const { calls, predicate } = recorder(false);
    expect(filterQuery(input, predicate)).toBe(input);
    expect(calls).toEqual([]);
  }
});

test("[boundary-3] an input without a query is not normalised", () => {
  const { calls, predicate } = recorder(false);
  expect(filterQuery("HTTP://Example.COM/a b%zz#x y", predicate)).toBe(
    "HTTP://Example.COM/a b%zz#x y",
  );
  expect(calls).toEqual([]);
});

test("[boundary-4] a '?' that is only inside the fragment is not a query", () => {
  const { calls, predicate } = recorder(false);
  expect(filterQuery("/foo#a?b=1", predicate)).toBe("/foo#a?b=1");
  expect(calls).toEqual([]);
});

test("[boundary-4] a '?' inside the fragment of an absolute URL is not a query", () => {
  const { calls, predicate } = recorder(false);
  expect(filterQuery("http://example.com/p#x?y=1", predicate)).toBe(
    "http://example.com/p#x?y=1",
  );
  expect(calls).toEqual([]);
});

test("[boundary-5] special-protocol inputs are not rewritten", () => {
  const inputs = [
    "data:text/plain?a=1",
    "javascript:alert(1)?a=1",
    "JavaScript:void(0)?x=1",
    "blob:https://e.com/id?a=1",
  ];
  for (const input of inputs) {
    const { calls, predicate } = recorder(false);
    expect(filterQuery(input, predicate)).toBe(input);
    expect(calls).toEqual([]);
  }
});

test("[boundary-5] a vbscript: input is not rewritten", () => {
  const { calls, predicate } = recorder(false);
  expect(filterQuery("vbscript:msgbox(1)?a=1", predicate)).toBe(
    "vbscript:msgbox(1)?a=1",
  );
  expect(calls).toEqual([]);
});

test("[boundary-6] a parameter with no '=' or an empty value is offered with ''", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?a=&b&c=1", predicate);
  expect(calls).toEqual([
    ["a", ""],
    ["b", ""],
    ["c", "1"],
  ]);
});

test("[boundary-6] a lone key with no '=' is offered with ''", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?b", predicate);
  expect(calls).toEqual([["b", ""]]);
});

test("[boundary-7] integer-like keys come first in ascending order", () => {
  const calls: string[] = [];
  const result = filterQuery("/foo?b=1&2=x&1=y", (key) => {
    calls.push(key);
    return true;
  });
  expect(calls).toEqual(["1", "2", "b"]);
  expect(result).toBe("/foo?1=y&2=x&b=1");
});

test("[boundary-7] integer-like keys are ordered numerically, not as text", () => {
  const calls: string[] = [];
  const result = filterQuery("/foo?10=a&9=b", (key) => {
    calls.push(key);
    return true;
  });
  expect(calls).toEqual(["9", "10"]);
  expect(result).toBe("/foo?9=b&10=a");
});

test("[boundary-8] empty values inside a repeated key are kept", () => {
  expect(filterQuery("/foo?a=1&a=", () => true)).toBe("/foo?a=1&a=");
});

test("[boundary-8] a leading empty value inside a repeated key is kept", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("/foo?a=&a=1", predicate)).toBe("/foo?a=&a=1");
  expect(calls).toEqual([["a", ["", "1"]]]);
});

test("[boundary-9] a second '?' in the query belongs to the value", () => {
  const { calls, predicate } = recorder(true);
  const result = filterQuery("/foo?a=1?b=2", predicate);
  expect(calls).toEqual([["a", "1?b=2"]]);
  expect(result).toBe("/foo?a=1?b=2");
});

test("[boundary-9] a value that is only '?' is kept as written", () => {
  const { calls, predicate } = recorder(true);
  const result = filterQuery("/foo?a=?", predicate);
  expect(calls).toEqual([["a", "?"]]);
  expect(result).toBe("/foo?a=?");
});

test("[boundary-10] the input string is not modified", () => {
  const input = "/foo?bar=1&baz=2";
  expect(filterQuery(input, () => false)).toBe("/foo");
  expect(input).toBe("/foo?bar=1&baz=2");
});

test("[boundary-10] the input string is not modified when every key is kept", () => {
  const input = "/foo?bar=1&baz=2";
  expect(filterQuery(input, () => true)).toBe("/foo?bar=1&baz=2");
  expect(input).toBe("/foo?bar=1&baz=2");
});

// unhappy

test("[unhappy-1] prototype-pollution keys are dropped", () => {
  const calls: string[] = [];
  const result = filterQuery("/foo?__proto__=1&constructor=2&a=3", (key) => {
    calls.push(key);
    return true;
  });
  expect(result).toBe("/foo?a=3");
  expect(calls).toEqual(["a"]);
});

test("[unhappy-1] a query of only prototype-pollution keys is removed entirely", () => {
  const calls: string[] = [];
  const result = filterQuery("/foo?constructor=1&__proto__=2", (key) => {
    calls.push(key);
    return true;
  });
  expect(result).toBe("/foo");
  expect(calls).toEqual([]);
});

test("[unhappy-2] an error thrown by the predicate propagates unchanged", () => {
  const error = new Error("boom");
  const calls: string[] = [];
  let caught: unknown;
  try {
    filterQuery("/foo?a=1&b=2&c=3", (key) => {
      calls.push(key);
      if (key === "b") {
        throw error;
      }
      return true;
    });
  } catch (error_) {
    caught = error_;
  }
  expect(caught).toBe(error);
  expect((caught as Error).message).toBe("boom");
  expect(calls).toEqual(["a", "b"]);
});

test("[unhappy-2] a throw on the first key stops before any later key", () => {
  const error = new Error("boom");
  const calls: string[] = [];
  let caught: unknown;
  try {
    filterQuery("/foo?a=1&b=2&c=3", (key) => {
      calls.push(key);
      throw error;
    });
  } catch (error_) {
    caught = error_;
  }
  expect(caught).toBe(error);
  expect(calls).toEqual(["a"]);
});

test("[unhappy-3] input is not a string", () => {
  const tests = [
    {
      input: undefined,
      message: "URL input should be string received undefined (undefined)",
    },
    {
      input: null,
      message: "URL input should be string received object (null)",
    },
    { input: 42, message: "URL input should be string received number (42)" },
  ];
  for (const t of tests) {
    const { calls, predicate } = recorder(true);
    expect(() =>
      filterQuery(t.input as unknown as string, predicate),
    ).toThrowError(new TypeError(t.message));
    expect(() => filterQuery(t.input as unknown as string, predicate)).toThrow(
      TypeError,
    );
    expect(calls).toEqual([]);
  }
});

test("[unhappy-3] a boolean input is rejected with a TypeError", () => {
  const { calls, predicate } = recorder(true);
  expect(() => filterQuery(true as unknown as string, predicate)).toThrow(
    TypeError,
  );
  expect(() => filterQuery(true as unknown as string, predicate)).toThrow(
    "URL input should be string received boolean (true)",
  );
  expect(calls).toEqual([]);
});

test("[unhappy-4] predicate is not a function", () => {
  const tests = [
    {
      input: "/foo?a=1",
      predicate: undefined,
      message: "filterQuery predicate should be a function received undefined",
    },
    {
      input: "/foo",
      predicate: true,
      message: "filterQuery predicate should be a function received boolean",
    },
    {
      input: "/foo?a=1",
      predicate: "a",
      message: "filterQuery predicate should be a function received string",
    },
  ];
  for (const t of tests) {
    const call = () =>
      filterQuery(t.input, t.predicate as unknown as Predicate);
    expect(call).toThrow(TypeError);
    expect(call).toThrowError(new TypeError(t.message));
  }
});

test("[unhappy-4] a null predicate is rejected even for an empty input", () => {
  const call = () => filterQuery("", null as unknown as Predicate);
  expect(call).toThrow(TypeError);
  expect(call).toThrow(
    "filterQuery predicate should be a function received object",
  );
});

// concurrency

test("[concurrency-1] the predicate calls filterQuery on another URL", () => {
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

test("[concurrency-1] the predicate calls filterQuery on the same URL", () => {
  const inner: string[] = [];
  const result = filterQuery("/foo?a=1&b=2", (key) => {
    inner.push(filterQuery("/foo?a=1&b=2", (k) => k === "a"));
    return key === "b";
  });
  expect(result).toBe("/foo?b=2");
  expect(inner).toEqual(["/foo?a=1", "/foo?a=1"]);
});

test("[concurrency-2] repeated calls with the same arguments give the same result", () => {
  const predicate = (key: string) => key !== "bar";
  const first = filterQuery("/foo?bar=1&baz=2", predicate);
  const second = filterQuery("/foo?bar=1&baz=2", predicate);
  expect(first).toBe("/foo?baz=2");
  expect(second).toBe("/foo?baz=2");
});

test("[concurrency-2] a call with another predicate in between does not affect the result", () => {
  const first = filterQuery("/foo?bar=1&baz=2", (key) => key !== "bar");
  const other = filterQuery("/foo?bar=1&baz=2", (key) => key !== "baz");
  const second = filterQuery("/foo?bar=1&baz=2", (key) => key !== "bar");
  expect(first).toBe("/foo?baz=2");
  expect(other).toBe("/foo?bar=1");
  expect(second).toBe("/foo?baz=2");
});
