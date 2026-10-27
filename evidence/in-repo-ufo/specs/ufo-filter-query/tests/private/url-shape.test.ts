import { expect, test } from "vitest";
import { filterQuery, getQuery, withQuery } from "../../src/utils";

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

// extends "[happy-1] removing one parameter from a path"
test("[happy-1] removing the first parameter of four", () => {
  expect(filterQuery("/foo?a=1&b=2&c=3&d=4", (key) => key !== "a")).toBe(
    "/foo?b=2&c=3&d=4",
  );
});

// extends "[happy-1] removing a parameter between two kept ones"
test("[happy-1] removing the last parameter of four", () => {
  expect(filterQuery("/foo?a=1&b=2&c=3&d=4", (key) => key !== "d")).toBe(
    "/foo?a=1&b=2&c=3",
  );
});

test("[happy-1] removing one parameter from an absolute URL", () => {
  expect(
    filterQuery("https://example.com/p/q?x=1&utm=2&y=3", (key) => key !== "utm"),
  ).toBe("https://example.com/p/q?x=1&y=3");
});

// extends "[happy-2] keeping only the accepted parameter among several"
test("[happy-2] keeping only the first parameter among several", () => {
  expect(filterQuery("/foo?bar=1&baz=2&qux=3&zip=4", (key) => key === "bar")).toBe(
    "/foo?bar=1",
  );
});

test("[happy-2] keeping only the last parameter among several", () => {
  expect(filterQuery("/foo?bar=1&baz=2&qux=3&zip=4", (key) => key === "zip")).toBe(
    "/foo?zip=4",
  );
});

// extends "[happy-3] protocol, auth, host, port, path and fragment are preserved"
test("[happy-3] other URL shapes keep everything but the rejected parameter", () => {
  const tests = [
    {
      input: "http://[::1]:3000/p?a=1&b=2#f",
      output: "http://[::1]:3000/p?b=2#f",
    },
    { input: "file:///home/x?a=1&b=2", output: "file:///home/x?b=2" },
    {
      input: "http://user:p%40ss@e.com/p?a=1&b=2",
      output: "http://user:p%40ss@e.com/p?b=2",
    },
    { input: "/a%20b/c?a=1&b=2#x%20y", output: "/a%20b/c?b=2#x%20y" },
    { input: "/a b?a=1&b=2#x y", output: "/a b?b=2#x y" },
    { input: "?a=1&b=2#h", output: "?b=2#h" },
    { input: "//e.com?a=1&b=2", output: "//e.com?b=2" },
  ];
  for (const t of tests) {
    expect(filterQuery(t.input, (key) => key === "b")).toBe(t.output);
  }
});

// extends "[happy-4] a non-empty string keeps and undefined drops"
test("[happy-4] other truthy return values keep the key", () => {
  const truthy: unknown[] = [{}, [], "0", -1, "false", Number.POSITIVE_INFINITY];
  for (const value of truthy) {
    const predicate = ((key: string) =>
      key === "a" ? value : false) as unknown as Predicate;
    expect(filterQuery("/foo?a=1&b=2", predicate)).toBe("/foo?a=1");
  }
});

test("[happy-4] other falsy return values drop the key", () => {
  const falsy: unknown[] = ["", Number.NaN, null, 0n, -0];
  for (const value of falsy) {
    const predicate = ((key: string) =>
      key === "a" ? true : value) as unknown as Predicate;
    expect(filterQuery("/foo?a=1&b=2", predicate)).toBe("/foo?a=1");
  }
});

// extends "[happy-10] kept parameters are encoded again"
test("[happy-10] kept parameters are encoded again with other characters", () => {
  const tests = [
    {
      input: "/foo?a=%7E&b=x/y&d=1%2B1&e=%3D",
      output: "/foo?a=~&b=x%2Fy&d=1%2B1&e==",
    },
    { input: "/foo?k%3D=1&k%26=2", output: "/foo?k%3D=1&k%26=2" },
    { input: "/foo?e=%5E%60", output: "/foo?e=^`" },
    { input: "/foo?x&y=&z", output: "/foo?x&y&z" },
    { input: "/foo?&&a=1&&", output: "/foo?a=1" },
    { input: "/foo?a=b%20c", output: "/foo?a=b+c" },
  ];
  for (const t of tests) {
    expect(filterQuery(t.input, () => true)).toBe(t.output);
  }
});

// a shortcut that only deletes the rejected raw segments would keep "b c" and "y/z"
test("[happy-10] kept parameters are encoded again when some are dropped", () => {
  expect(
    filterQuery("/foo?a=b c&drop=1&x=y/z&e=&&f", (key) => key !== "drop"),
  ).toBe("/foo?a=b+c&x=y%2Fz&e&f");
});

test("[happy-10] the kept query is written the way withQuery writes it", () => {
  const inputs = [
    "/foo?a=%zz&b=%25",
    "/foo?a=1+2&b=%2B&c=a%26b",
    "/foo?u=%E5%A5%BD&v=好",
    "/foo?k%20x=%22q%22&l=(1)!*",
    "/foo?t=a=b&s=%3D%3D",
  ];
  for (const input of inputs) {
    expect(filterQuery(input, () => true)).toBe(
      withQuery("/foo", getQuery(input)),
    );
  }
});

// boundary

// extends "[boundary-1] every parameter is rejected"
test("[boundary-1] rejecting every parameter in other URL shapes removes the '?'", () => {
  const tests = [
    { input: "//e.com/p?a=1&b=2#h", output: "//e.com/p#h" },
    { input: "https://e.com?a=1&a=2", output: "https://e.com" },
    { input: "?a=1&b=2#h", output: "#h" },
    {
      input: "http://user:pw@e.com:8080/p?a=1&b=2&c=3#f",
      output: "http://user:pw@e.com:8080/p#f",
    },
  ];
  for (const t of tests) {
    expect(filterQuery(t.input, () => false)).toBe(t.output);
  }
});

test("[boundary-1] a predicate that rejects every key present removes the '?'", () => {
  expect(filterQuery("/foo?a=1&b=2&a=3", (key) => key === "zzz")).toBe("/foo");
});

// extends "[boundary-2] an empty query is dropped without calling the predicate"
test("[boundary-2] other empty queries are dropped without calling the predicate", () => {
  const tests = [
    { input: "?&", output: "" },
    { input: "//e.com/p?&&&#h", output: "//e.com/p#h" },
    { input: "http://e.com?", output: "http://e.com" },
    { input: "/foo?&#", output: "/foo#" },
  ];
  for (const t of tests) {
    const { calls, predicate } = recorder(true);
    expect(filterQuery(t.input, predicate)).toBe(t.output);
    expect(calls).toEqual([]);
  }
});

// extends "[boundary-3] an input without a query is not normalised"
test("[boundary-3] other inputs without a '?' are returned exactly as given", () => {
  const inputs = [
    "file:///C:/x",
    "http:\\\\e.com\\p",
    "//e.com",
    "/a b#c d",
    "  /foo",
    "data:text/plain,hi",
    "JavaScript:void(0)",
    "http://e.com/%7Efoo/a%2Fb#%E5%A5%BD",
  ];
  for (const input of inputs) {
    const { calls, predicate } = recorder(false);
    expect(filterQuery(input, predicate)).toBe(input);
    expect(calls).toEqual([]);
  }
});

// extends "[boundary-4] a '?' inside the fragment of an absolute URL is not a query"
test("[boundary-4] other inputs with a '?' only in the fragment are returned unchanged", () => {
  const inputs = ["//e.com/p#?a=1", "#?a=1", "/foo#a?b=1&c=2", "/foo#?"];
  for (const input of inputs) {
    const { calls, predicate } = recorder(false);
    expect(filterQuery(input, predicate)).toBe(input);
    expect(calls).toEqual([]);
  }
});

test("[boundary-4] a '?' in the fragment is left alone when there is also a query", () => {
  const keys: string[] = [];
  const result = filterQuery("/foo?a=1&b=2#x?a=1&c=3", (key) => {
    keys.push(key);
    return key === "b";
  });
  expect(result).toBe("/foo?b=2#x?a=1&c=3");
  expect(keys).toEqual(["a", "b"]);
});

// extends "[boundary-5] special-protocol inputs are not rewritten"
test("[boundary-5] special-protocol inputs in other cases and shapes are not rewritten", () => {
  const inputs = [
    "DATA:text/plain?a=1",
    "VBScript:x?a=1",
    "Blob:https://e.com/id?a=1&b=2#h",
    "data:text/plain?a=1#frag",
    "javascript:void(0)?a=1&b=2",
    "data:text/plain?",
  ];
  for (const input of inputs) {
    const { calls, predicate } = recorder(false);
    expect(filterQuery(input, predicate)).toBe(input);
    expect(calls).toEqual([]);
  }
});

test("[boundary-5] special-protocol inputs are not rewritten when the predicate accepts", () => {
  const inputs = ["data:text/plain?a=b c", "blob:https://e.com/id?a=1&&b"];
  for (const input of inputs) {
    const { calls, predicate } = recorder(true);
    expect(filterQuery(input, predicate)).toBe(input);
    expect(calls).toEqual([]);
  }
});

// extends "[boundary-10] the input string is not modified"
test("[boundary-10] the input string is not modified when some keys are kept", () => {
  const input = "http://e.com/p?a=b c&d=2#f";
  expect(filterQuery(input, (key) => key === "a")).toBe("http://e.com/p?a=b+c#f");
  expect(input).toBe("http://e.com/p?a=b c&d=2#f");
});
