import { expect, test } from "vitest";
import { filterQuery } from "../../src/utils";

type Predicate = (key: string, value: string | string[]) => boolean;

function recorder(result: boolean) {
  const calls: unknown[][] = [];
  const predicate: Predicate = (...args) => {
    calls.push(args);
    return result;
  };
  return { calls, predicate };
}

function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw");
}

// unhappy

// extends "[unhappy-1] prototype-pollution keys are dropped"
test("[unhappy-1] encoded and repeated prototype-pollution keys are dropped", () => {
  const keys: string[] = [];
  const result = filterQuery(
    "/foo?%5F%5Fproto%5F%5F=1&constructor=2&a=3&constructor=4&__proto__=5",
    (key) => {
      keys.push(key);
      return true;
    },
  );
  expect(result).toBe("/foo?a=3");
  expect(keys).toEqual(["a"]);
});

test("[unhappy-1] keys that only resemble prototype-pollution keys are offered and kept", () => {
  const keys: string[] = [];
  const result = filterQuery(
    "/foo?prototype=4&hasOwnProperty=5&toString=6&__proto=7",
    (key) => {
      keys.push(key);
      return true;
    },
  );
  expect(keys).toEqual(["prototype", "hasOwnProperty", "toString", "__proto"]);
  expect(result).toBe("/foo?prototype=4&hasOwnProperty=5&toString=6&__proto=7");
});

test("[unhappy-1] prototype-pollution keys are dropped when the predicate rejects everything else", () => {
  const { calls, predicate } = recorder(false);
  expect(
    filterQuery("http://e.com/p?__proto__=1&b=2&constructor=3#f", predicate),
  ).toBe("http://e.com/p#f");
  expect(calls).toEqual([["b", "2"]]);
});

// extends "[unhappy-2] an error thrown by the predicate propagates unchanged"
test("[unhappy-2] a thrown non-Error value propagates unchanged", () => {
  const thrownValues: unknown[] = ["nope", { code: 7 }, 42];
  for (const thrown of thrownValues) {
    const keys: string[] = [];
    const caught = thrownBy(() =>
      filterQuery("/foo?a=1&b=2&c=3", (key) => {
        keys.push(key);
        if (key === "b") {
          throw thrown;
        }
        return true;
      }),
    );
    expect(caught).toBe(thrown);
    expect(keys).toEqual(["a", "b"]);
  }
});

test("[unhappy-2] a TypeError thrown by the predicate on the last key propagates unchanged", () => {
  const error = new TypeError("from predicate");
  const keys: string[] = [];
  const caught = thrownBy(() =>
    filterQuery("/foo?a=1&b=2&c=3&d=4", (key) => {
      keys.push(key);
      if (key === "d") {
        throw error;
      }
      return false;
    }),
  );
  expect(caught).toBe(error);
  expect((caught as Error).message).toBe("from predicate");
  expect(keys).toEqual(["a", "b", "c", "d"]);
});

test("[unhappy-2] a throw on a repeated key stops before later keys", () => {
  const error = new Error("boom");
  const calls: unknown[][] = [];
  const caught = thrownBy(() =>
    filterQuery("/foo?2=x&a=1&b=2&a=3", (key, value) => {
      calls.push([key, value]);
      if (Array.isArray(value)) {
        throw error;
      }
      return true;
    }),
  );
  expect(caught).toBe(error);
  expect(calls).toEqual([
    ["2", "x"],
    ["a", ["1", "3"]],
  ]);
});

// extends "[unhappy-3] a boolean input is rejected with a TypeError"
test("[unhappy-3] other non-string inputs are rejected with the described TypeError", () => {
  const tests = [
    { input: false, message: "URL input should be string received boolean (false)" },
    { input: 0, message: "URL input should be string received number (0)" },
    {
      input: {},
      message: "URL input should be string received object ([object Object])",
    },
    {
      input: ["/foo?a=1"],
      message: "URL input should be string received object (/foo?a=1)",
    },
    {
      input: new URL("http://a.com/?a=1"),
      message: "URL input should be string received object (http://a.com/?a=1)",
    },
  ];
  for (const t of tests) {
    const { calls, predicate } = recorder(true);
    const caught = thrownBy(() =>
      filterQuery(t.input as unknown as string, predicate),
    );
    expect(caught).toBeInstanceOf(TypeError);
    expect((caught as Error).message).toBe(t.message);
    expect(calls).toEqual([]);
  }
});

// extends "[unhappy-4] a null predicate is rejected even for an empty input"
test("[unhappy-4] other non-function predicates are rejected with the described TypeError", () => {
  const tests = [
    {
      input: "/foo?a=1",
      predicate: null,
      message: "filterQuery predicate should be a function received object",
    },
    {
      input: "/foo?a=1",
      predicate: 0,
      message: "filterQuery predicate should be a function received number",
    },
    {
      input: "?a=1",
      predicate: {},
      message: "filterQuery predicate should be a function received object",
    },
    {
      input: "/foo?a=1",
      predicate: [() => true],
      message: "filterQuery predicate should be a function received object",
    },
  ];
  for (const t of tests) {
    const caught = thrownBy(() =>
      filterQuery(t.input, t.predicate as unknown as Predicate),
    );
    expect(caught).toBeInstanceOf(TypeError);
    expect((caught as Error).message).toBe(t.message);
  }
});

test("[unhappy-4] the predicate check runs before inputs that are returned unchanged", () => {
  const tests = [
    { input: "data:text/plain?a=1", predicate: undefined, type: "undefined" },
    { input: "/foo#a?b=1", predicate: "x", type: "string" },
    { input: "/foo?", predicate: 1, type: "number" },
    { input: "", predicate: undefined, type: "undefined" },
  ];
  for (const t of tests) {
    const caught = thrownBy(() =>
      filterQuery(t.input, t.predicate as unknown as Predicate),
    );
    expect(caught).toBeInstanceOf(TypeError);
    expect((caught as Error).message).toBe(
      `filterQuery predicate should be a function received ${t.type}`,
    );
  }
});

// concurrency

// extends "[concurrency-1] the predicate calls filterQuery on another URL"
test("[concurrency-1] calls nested two levels deep are independent", () => {
  const middle: string[] = [];
  const inner: string[] = [];
  const result = filterQuery("/foo?a=1&b=2&c=3", (key) => {
    middle.push(
      filterQuery("/m?x=1&y=2&z=3", (k) => {
        inner.push(filterQuery("/i?p=1&q=2", (kk) => kk === "p"));
        return k !== "y";
      }),
    );
    return key !== "b";
  });
  expect(result).toBe("/foo?a=1&c=3");
  expect(middle).toEqual(["/m?x=1&z=3", "/m?x=1&z=3", "/m?x=1&z=3"]);
  expect(inner).toHaveLength(9);
  for (const r of inner) {
    expect(r).toBe("/i?p=1");
  }
});

test("[concurrency-1] a nested call that throws does not disturb the outer call", () => {
  const keys: string[] = [];
  const result = filterQuery("/foo?a=1&b=2&c=3", (key) => {
    keys.push(key);
    try {
      filterQuery("/x?p=1", () => {
        throw new Error("inner");
      });
    } catch {
      // ignored on purpose
    }
    return key !== "a";
  });
  expect(result).toBe("/foo?b=2&c=3");
  expect(keys).toEqual(["a", "b", "c"]);
});

// extends "[concurrency-2] a call with another predicate in between does not affect the result"
test("[concurrency-2] five repeated calls give the same result and the same predicate calls", () => {
  const runs: { result: string; calls: unknown[][] }[] = [];
  for (let i = 0; i < 5; i++) {
    const calls: unknown[][] = [];
    const result = filterQuery("/foo?b=1&a=2&b=3&9=x", (key, value) => {
      calls.push([key, value]);
      return key !== "a";
    });
    runs.push({ result, calls });
  }
  for (const run of runs) {
    expect(run.result).toBe("/foo?9=x&b=1&b=3");
    expect(run.calls).toEqual([
      ["9", "x"],
      ["b", ["1", "3"]],
      ["a", "2"],
    ]);
  }
});

test("[concurrency-2] a call whose predicate threw does not affect the next call", () => {
  const first = filterQuery("/foo?bar=1&baz=2", (key) => key !== "bar");
  thrownBy(() =>
    filterQuery("/foo?bar=1&baz=2", () => {
      throw new Error("boom");
    }),
  );
  const second = filterQuery("/foo?bar=1&baz=2", (key) => key !== "bar");
  expect(first).toBe("/foo?baz=2");
  expect(second).toBe("/foo?baz=2");
});

test("[concurrency-2] calls on different inputs in between do not affect the result", () => {
  const predicate = (key: string) => key !== "bar";
  const first = filterQuery("/foo?bar=1&baz=2", predicate);
  expect(filterQuery("/other?bar=9&q=8&q=7", predicate)).toBe("/other?q=8&q=7");
  expect(filterQuery("http://e.com/?zip=1", predicate)).toBe(
    "http://e.com/?zip=1",
  );
  const second = filterQuery("/foo?bar=1&baz=2", predicate);
  expect(first).toBe("/foo?baz=2");
  expect(second).toBe("/foo?baz=2");
});
