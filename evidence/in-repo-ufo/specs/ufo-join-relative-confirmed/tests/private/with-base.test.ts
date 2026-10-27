import { expect, test } from "vitest";
import { withBase } from "../../src/utils";

// Extends both "[happy-7]" public tests. The spec keeps today's result here.
test("[happy-7] withBase joins plain inputs onto base and returns inputs that need no base", () => {
  expect(withBase("/bar/baz", "/foo")).toBe("/foo/bar/baz");
  expect(withBase("bar", "/foo/")).toBe("/foo/bar");
  expect(withBase("/bar/", "/foo")).toBe("/foo/bar/");
  expect(withBase("/bar?x=1", "/foo")).toBe("/foo/bar?x=1");
  expect(withBase("/foo/bar", "/foo/")).toBe("/foo/bar");
  expect(withBase("/bar", "")).toBe("/bar");
  expect(withBase("/bar", "/")).toBe("/bar");
  expect(withBase("http://x.com/a", "/foo")).toBe("http://x.com/a");
});

// Extends both "[boundary-14]" public tests
test("[boundary-14] withBase keeps every .. in the input", () => {
  expect(withBase("../../x", "/a/b")).toBe("/a/b/../../x");
  expect(withBase("bar/..", "/foo/")).toBe("/foo/bar/..");
  expect(withBase("..", "/foo")).toBe("/foo/..");
  expect(withBase("/../bar", "/foo")).toBe("/foo/../bar");
  expect(withBase("./../bar", "/foo")).toBe("/foo/../bar");
});

// Extends both "[boundary-15]" public tests
test("[boundary-15] withBase with input / returns the base without its trailing slash", () => {
  expect(withBase("/", "/foo/bar/")).toBe("/foo/bar");
  expect(withBase("/", "/foo/bar")).toBe("/foo/bar");
  expect(withBase("/", "http://x.com/")).toBe("http://x.com");
});
