import { expect, test } from "vitest";
import { withBase, withoutBase } from "../../src/utils";

// @unhappy #1: withBase adds the base when it is a false prefix of the first segment

test("[unhappy-1] withBase adds the base for every false-prefix row in the spec", () => {
  expect(withBase("/apiv2", "/api")).toBe("/api/apiv2");
  expect(withBase("/apiv2", "/api/")).toBe("/api/apiv2");
  expect(withBase("/apiv2/users", "/api/")).toBe("/api/apiv2/users");
  expect(withBase("/api-docs", "/api")).toBe("/api/api-docs");
  expect(withBase("/api.json", "/api")).toBe("/api/api.json");
  expect(withBase("/api;x", "/api")).toBe("/api/api;x");
  expect(withBase("/api%2F", "/api")).toBe("/api/api%2F");
  expect(withBase("/api#top", "/api")).toBe("/api/api#top");
  expect(withBase("/api#", "/api")).toBe("/api/api#");
  expect(withBase("/foo/barbaz", "/foo/bar")).toBe("/foo/bar/foo/barbaz");
});

// Extends public "[unhappy-1] withBase adds the base when it is a false prefix of the first segment"
test("[unhappy-1] withBase adds a trailing-slash base that is a false prefix of a multi-segment input", () => {
  expect(withBase("/apiv2/users", "/api/")).toBe("/api/apiv2/users");
});

// Extends public "[unhappy-1] withBase adds the base when it is a false prefix of the first segment"
test("[unhappy-1] withBase treats '-', '.' and ';' after the base as no boundary", () => {
  expect(withBase("/api-docs", "/api")).toBe("/api/api-docs");
  expect(withBase("/api.json", "/api")).toBe("/api/api.json");
  expect(withBase("/api;x", "/api")).toBe("/api/api;x");
});

// Extends public "[unhappy-1] withBase treats '#' right after the base as no boundary"
test("[unhappy-1] withBase treats '#' followed by a fragment after the base as no boundary", () => {
  expect(withBase("/api#top", "/api")).toBe("/api/api#top");
});

// Extends public "[unhappy-1] withBase treats '#' right after the base as no boundary"
test("[unhappy-1] withBase treats '%' after the base as no boundary", () => {
  expect(withBase("/api%2F", "/api")).toBe("/api/api%2F");
});

// Extends public "[unhappy-1] withBase adds the base when it is a false prefix of the first segment"
test("[unhappy-1] withBase adds a multi-segment base that is a false prefix of a later segment", () => {
  expect(withBase("/foo/barbaz", "/foo/bar")).toBe("/foo/bar/foo/barbaz");
  expect(withBase("/foo/barbaz/qux", "/foo/bar")).toBe(
    "/foo/bar/foo/barbaz/qux",
  );
});

// Extends public "[unhappy-1] withBase adds the base when it is a false prefix of the first segment"
test("[unhappy-1] withBase adds the base when a digit follows it in a longer path", () => {
  expect(withBase("/api2/v1/users?x=1", "/api")).toBe(
    "/api/api2/v1/users?x=1",
  );
});

// Extends public "[unhappy-1] withBase adds the base when it is a false prefix of the first segment"
// A base with regex metacharacters must be compared literally, never as a pattern.
test("[unhappy-1] withBase compares a base with regex metacharacters literally", () => {
  expect(withBase("/api/x", "/a.i")).toBe("/a.i/api/x");
  expect(withBase("/apiv2", "/a.i")).toBe("/a.i/apiv2");
});

// @happy #1: withBase leaves the input alone when the base ends on a boundary

test("[happy-1] withBase leaves the input alone for every boundary row in the spec", () => {
  expect(withBase("/api", "/api")).toBe("/api");
  expect(withBase("/api/", "/api")).toBe("/api/");
  expect(withBase("/api/users", "/api")).toBe("/api/users");
  expect(withBase("/api?x=1", "/api")).toBe("/api?x=1");
  expect(withBase("/api?", "/api")).toBe("/api?");
  expect(withBase("/foo/bar/baz", "/foo/bar")).toBe("/foo/bar/baz");
  expect(withBase("/base", "/base/")).toBe("/base");
  expect(withBase("/base/a", "/base/")).toBe("/base/a");
});

// Extends public "[happy-1] withBase leaves the input alone when '/' follows the base"
test("[happy-1] withBase leaves the input alone when '?' follows the base", () => {
  expect(withBase("/api?x=1", "/api")).toBe("/api?x=1");
  expect(withBase("/api?", "/api")).toBe("/api?");
});

// Extends public "[happy-1] withBase leaves the input alone when '/' follows the base"
test("[happy-1] withBase leaves the input alone when it is exactly the base", () => {
  expect(withBase("/api", "/api")).toBe("/api");
  expect(withBase("/api/", "/api")).toBe("/api/");
});

// Extends public "[happy-1] withBase leaves the input alone when it is the base with a trailing '/' removed"
test("[happy-1] withBase leaves the input alone for a trailing-slash base followed by '/'", () => {
  expect(withBase("/base/a", "/base/")).toBe("/base/a");
  expect(withBase("/base?q", "/base/")).toBe("/base?q");
});

// Extends public "[happy-1] withBase leaves the input alone when '/' follows the base"
test("[happy-1] withBase leaves a long input under a multi-segment base alone", () => {
  expect(withBase("/foo/bar/baz", "/foo/bar")).toBe("/foo/bar/baz");
  expect(withBase("/foo/bar/baz/qux/1?x=1#h", "/foo/bar")).toBe(
    "/foo/bar/baz/qux/1?x=1#h",
  );
  expect(withBase("/foo/bar?x=1", "/foo/bar")).toBe("/foo/bar?x=1");
});

// Extends public "[happy-1] withBase leaves the input alone when '/' follows the base"
test("[happy-1] withBase matches a base with regex metacharacters literally", () => {
  expect(withBase("/c++/x", "/c++")).toBe("/c++/x");
  expect(withBase("/a(b/x", "/a(b")).toBe("/a(b/x");
  expect(withBase("/a.i/x", "/a.i")).toBe("/a.i/x");
});

// @unhappy #2: withoutBase leaves the input unchanged when the base is a false prefix

test("[unhappy-2] withoutBase leaves the input unchanged for every false-prefix row in the spec", () => {
  expect(withoutBase("/apiv2", "/api")).toBe("/apiv2");
  expect(withoutBase("/apiv2", "/api/")).toBe("/apiv2");
  expect(withoutBase("/apiv2/users", "/api/")).toBe("/apiv2/users");
  expect(withoutBase("/api-docs", "/api")).toBe("/api-docs");
  expect(withoutBase("/api.json", "/api")).toBe("/api.json");
  expect(withoutBase("/api;x", "/api")).toBe("/api;x");
  expect(withoutBase("/api%2F", "/api")).toBe("/api%2F");
  expect(withoutBase("/api#top", "/api")).toBe("/api#top");
  expect(withoutBase("/api#", "/api")).toBe("/api#");
  expect(withoutBase("/foo/barbaz", "/foo/bar")).toBe("/foo/barbaz");
  expect(withoutBase("https://test.com/apiv2", "https://test.com/api")).toBe(
    "https://test.com/apiv2",
  );
});

// Extends public "[unhappy-2] withoutBase leaves the input unchanged when the base is a false prefix"
test("[unhappy-2] withoutBase treats '#' after the base as no boundary", () => {
  expect(withoutBase("/api#top", "/api")).toBe("/api#top");
  expect(withoutBase("/api#", "/api")).toBe("/api#");
});

// Extends public "[unhappy-2] withoutBase leaves the input unchanged when the base is a false prefix"
test("[unhappy-2] withoutBase treats '-', '.', ';' and '%' after the base as no boundary", () => {
  expect(withoutBase("/api-docs", "/api")).toBe("/api-docs");
  expect(withoutBase("/api.json", "/api")).toBe("/api.json");
  expect(withoutBase("/api;x", "/api")).toBe("/api;x");
  expect(withoutBase("/api%2F", "/api")).toBe("/api%2F");
});

// Extends public "[unhappy-2] withoutBase leaves the input unchanged for a false prefix with a trailing-slash base"
test("[unhappy-2] withoutBase leaves a multi-segment false-prefix input unchanged for a trailing-slash base", () => {
  expect(withoutBase("/apiv2/users", "/api/")).toBe("/apiv2/users");
});

// Extends public "[unhappy-2] withoutBase leaves the input unchanged when the base is a false prefix"
test("[unhappy-2] withoutBase leaves the input unchanged for a multi-segment false prefix", () => {
  expect(withoutBase("/foo/barbaz", "/foo/bar")).toBe("/foo/barbaz");
  expect(withoutBase("/foo/barbaz/qux?x=1", "/foo/bar")).toBe(
    "/foo/barbaz/qux?x=1",
  );
});

// Extends public "[unhappy-2] withoutBase leaves the input unchanged when the base is a false prefix"
test("[unhappy-2] withoutBase applies the boundary rule to a base with a protocol", () => {
  expect(withoutBase("https://test.com/apiv2", "https://test.com/api")).toBe(
    "https://test.com/apiv2",
  );
  expect(
    withoutBase("https://test.com/api-docs/x", "https://test.com/api"),
  ).toBe("https://test.com/api-docs/x");
});

// Extends public "[unhappy-2] withoutBase leaves the input unchanged when the base is a false prefix"
test("[unhappy-2] withoutBase compares a base with regex metacharacters literally", () => {
  expect(withoutBase("/api/x", "/a.i")).toBe("/api/x");
  expect(withoutBase("/apiv2", "/a.i")).toBe("/apiv2");
});

// @happy #2: withoutBase removes the base when it ends on a boundary

test("[happy-2] withoutBase removes the base for every boundary row in the spec", () => {
  expect(withoutBase("/api", "/api")).toBe("/");
  expect(withoutBase("/api/", "/api")).toBe("/");
  expect(withoutBase("/api/users", "/api")).toBe("/users");
  expect(withoutBase("/api?x=1", "/api")).toBe("/?x=1");
  expect(withoutBase("/api?", "/api")).toBe("/?");
  expect(withoutBase("/foo/bar/baz", "/foo/bar")).toBe("/baz");
  expect(withoutBase("/base", "/base/")).toBe("/");
  expect(withoutBase("/base/a", "/base/")).toBe("/a");
  expect(withoutBase("https://test.com/api/x", "https://test.com/api")).toBe(
    "/x",
  );
});

// Extends public "[happy-2] withoutBase keeps the query when '?' follows the base"
test("[happy-2] withoutBase keeps a non-empty query when '?' follows the base", () => {
  expect(withoutBase("/api?x=1", "/api")).toBe("/?x=1");
  expect(withoutBase("/foo/bar?a=1&b=2", "/foo/bar")).toBe("/?a=1&b=2");
});

// Extends public "[happy-2] withoutBase returns '/' when the input is exactly the base"
test("[happy-2] withoutBase returns '/' when the input is the base plus '/'", () => {
  expect(withoutBase("/api/", "/api")).toBe("/");
});

// Extends public "[happy-2] withoutBase returns '/' when the input is exactly the base"
test("[happy-2] withoutBase returns '/' when the input equals a trailing-slash base without its slash", () => {
  expect(withoutBase("/base", "/base/")).toBe("/");
  expect(withoutBase("/base/a", "/base/")).toBe("/a");
});

// Extends public "[happy-2] withoutBase removes the base when '/' follows it"
test("[happy-2] withoutBase removes a multi-segment base from a long input", () => {
  expect(withoutBase("/foo/bar/baz", "/foo/bar")).toBe("/baz");
  expect(withoutBase("/api/v1/users/42/posts?x=1#h", "/api")).toBe(
    "/v1/users/42/posts?x=1#h",
  );
});

// Extends public "[happy-2] withoutBase removes the base when '/' follows it"
test("[happy-2] withoutBase removes a protocol base followed by '/'", () => {
  expect(withoutBase("https://test.com/api/x", "https://test.com/api")).toBe(
    "/x",
  );
});

// Extends public "[happy-2] withoutBase removes the base when '/' follows it"
test("[happy-2] withoutBase removes a base with regex metacharacters literally", () => {
  expect(withoutBase("/c++/x", "/c++")).toBe("/x");
  expect(withoutBase("/a(b/x", "/a(b")).toBe("/x");
  expect(withoutBase("/a.i?q", "/a.i")).toBe("/?q");
});

// @boundary #1: a normalized base that still ends with "/" still needs a boundary

test("[boundary-1] doubled trailing-slash base, every row in the spec", () => {
  expect(withBase("/api/x", "/api//")).toBe("/api/api/x");
  expect(withBase("/api//x", "/api//")).toBe("/api//x");
  expect(withBase("/api/", "/api//")).toBe("/api/");
  expect(withoutBase("/api/x", "/api//")).toBe("/api/x");
  expect(withoutBase("/api//x", "/api//")).toBe("/x");
  expect(withoutBase("/api/", "/api//")).toBe("/");
});

// Extends public "[boundary-1] withBase adds a doubled-slash base when no boundary follows it"
test("[boundary-1] withBase leaves the input alone when '/' follows a doubled-slash base", () => {
  expect(withBase("/api//x", "/api//")).toBe("/api//x");
});

// Extends public "[boundary-1] withBase adds a doubled-slash base when no boundary follows it"
test("[boundary-1] withBase leaves the input alone when it equals the normalized doubled-slash base", () => {
  expect(withBase("/api/", "/api//")).toBe("/api/");
});

// Extends public "[boundary-1] withoutBase removes a doubled-slash base followed by '/'"
test("[boundary-1] withoutBase returns '/' when the input equals the normalized doubled-slash base", () => {
  expect(withoutBase("/api/", "/api//")).toBe("/");
});

// Extends public "[boundary-1] withoutBase does not treat a normalized base ending in '/' as a boundary"
test("[boundary-1] withoutBase needs a boundary after a deeper doubled-slash base", () => {
  expect(withoutBase("/foo/bar/baz", "/foo/bar//")).toBe("/foo/bar/baz");
  expect(withoutBase("/foo/bar//baz", "/foo/bar//")).toBe("/baz");
  expect(withoutBase("/foo/bar/?q", "/foo/bar//")).toBe("/?q");
});

// @boundary #2: case-sensitive, undecoded matching

test("[boundary-2] differently cased or encoded input, every row in the spec", () => {
  expect(withBase("/API/users", "/api")).toBe("/api/API/users");
  expect(withoutBase("/API/users", "/api")).toBe("/API/users");
  expect(withBase("/api%2Fx", "/api")).toBe("/api/api%2Fx");
  expect(withoutBase("/api%2Fx", "/api")).toBe("/api%2Fx");
});

// Extends public "[boundary-2] withBase matches case-sensitively"
test("[boundary-2] withoutBase matches case-sensitively", () => {
  expect(withoutBase("/API/users", "/api")).toBe("/API/users");
  expect(withoutBase("/api/users", "/API")).toBe("/api/users");
});

// Extends public "[boundary-2] withBase matches case-sensitively"
test("[boundary-2] withBase adds an upper-case base to a lower-case input", () => {
  expect(withBase("/api/users", "/API")).toBe("/API/api/users");
});

// Extends public "[boundary-2] withoutBase does not decode an encoded slash after the base"
test("[boundary-2] withBase does not decode an encoded slash after the base", () => {
  expect(withBase("/api%2Fx", "/api")).toBe("/api/api%2Fx");
  expect(withBase("/api%2fx", "/api")).toBe("/api/api%2fx");
});

// Extends public "[boundary-2] withoutBase does not decode an encoded slash after the base"
test("[boundary-2] withoutBase does not decode an encoded slash or encoded base characters", () => {
  expect(withoutBase("/api%2fx", "/api")).toBe("/api%2fx");
  expect(withoutBase("/%61pi/x", "/api")).toBe("/%61pi/x");
  expect(withoutBase("/api%3Fx", "/api")).toBe("/api%3Fx");
});

// @boundary #3: a backslash after the base is not a boundary

test("[boundary-3] backslash after the base, every row in the spec", () => {
  expect(withBase("/api\\x", "/api")).toBe("/api/api\\x");
  expect(withoutBase("/api\\x", "/api")).toBe("/api\\x");
});

// Extends public "[boundary-3] withoutBase does not treat a backslash as a boundary"
test("[boundary-3] withoutBase does not treat a backslash as a boundary in a longer input", () => {
  expect(withoutBase("/api\\x\\y/z", "/api")).toBe("/api\\x\\y/z");
  expect(withoutBase("/foo/bar\\baz", "/foo/bar")).toBe("/foo/bar\\baz");
});

// Extends public "[boundary-3] withBase does not treat a backslash as a boundary"
test("[boundary-3] withBase does not treat a backslash after a multi-segment base as a boundary", () => {
  expect(withBase("/foo/bar\\baz", "/foo/bar")).toBe("/foo/bar/foo/bar\\baz");
});

// @unhappy #3: the base must sit at the very start of the input

test("[unhappy-3] base later in the input or no leading slash, every row in the spec", () => {
  expect(withBase("/a/api", "/api")).toBe("/api/a/api");
  expect(withoutBase("/a/api", "/api")).toBe("/a/api");
  expect(withBase("api/x", "/api")).toBe("/api/api/x");
  expect(withoutBase("api/x", "/api")).toBe("api/x");
});

// Extends public "[unhappy-3] withBase adds the base when it appears later in the input"
test("[unhappy-3] withoutBase leaves the input unchanged when the base appears later", () => {
  expect(withoutBase("/a/api", "/api")).toBe("/a/api");
  expect(withoutBase("/x/y/api/z", "/api")).toBe("/x/y/api/z");
});

// Extends public "[unhappy-3] withoutBase leaves an input without a leading slash unchanged"
test("[unhappy-3] withBase adds the base to an input without a leading slash", () => {
  expect(withBase("api/x", "/api")).toBe("/api/api/x");
});

// Extends public "[unhappy-3] withBase adds the base when it appears later in the input"
test("[unhappy-3] withBase adds the base when it appears later in a longer input", () => {
  expect(withBase("/x/y/api/z", "/api")).toBe("/api/x/y/api/z");
});

// @boundary #4: empty or root base returns the input unchanged

test("[boundary-4] empty or root base, every row in the spec", () => {
  expect(withBase("/apiv2", "")).toBe("/apiv2");
  expect(withBase("/apiv2", "/")).toBe("/apiv2");
  expect(withoutBase("/apiv2", "")).toBe("/apiv2");
  expect(withoutBase("/apiv2", "/")).toBe("/apiv2");
  expect(withoutBase("/test/", "/")).toBe("/test/");
  expect(withoutBase("/?test", "/")).toBe("/?test");
});

// Extends public "[boundary-4] withBase returns the input unchanged for an empty base"
test("[boundary-4] withBase returns the input unchanged for a root base", () => {
  expect(withBase("/apiv2", "/")).toBe("/apiv2");
});

// Extends public "[boundary-4] withoutBase returns the input unchanged for a root base"
test("[boundary-4] withoutBase returns the input unchanged for an empty or root base", () => {
  expect(withoutBase("/apiv2", "")).toBe("/apiv2");
  expect(withoutBase("/apiv2", "/")).toBe("/apiv2");
  expect(withoutBase("/test/", "/")).toBe("/test/");
});

// @boundary #5: withBase never prefixes an input that has a protocol

test("[boundary-5] withBase with a protocol input, every row in the spec", () => {
  expect(withBase("https://test.com", "/base/")).toBe("https://test.com");
  expect(withBase("https://test.com/apiv2", "https://test.com/api")).toBe(
    "https://test.com/apiv2",
  );
  expect(withBase("https://test.com/apiv2", "/api")).toBe(
    "https://test.com/apiv2",
  );
});

// Extends public "[boundary-5] withBase returns an input with a protocol unchanged"
test("[boundary-5] withBase returns a protocol input unchanged for a path base", () => {
  expect(withBase("https://test.com/apiv2", "/api")).toBe(
    "https://test.com/apiv2",
  );
  expect(withBase("http://example.org/a/b?x=1", "/a")).toBe(
    "http://example.org/a/b?x=1",
  );
});

// @boundary #6: empty or root input

test("[boundary-6] empty or root input, every row in the spec", () => {
  expect(withBase("", "/foo")).toBe("/foo");
  expect(withBase("/", "/foo/")).toBe("/foo");
  expect(withoutBase("", "/foo")).toBe("");
  expect(withoutBase("/", "/foo")).toBe("/");
  expect(withoutBase("/", "/foo/")).toBe("/");
  expect(withoutBase("/bar", "/foo")).toBe("/bar");
});

// Extends public "[boundary-6] withBase returns the normalized base for a root input"
test("[boundary-6] withBase returns the base for an empty input", () => {
  expect(withBase("", "/foo")).toBe("/foo");
});

// Extends public "[boundary-6] withoutBase returns an empty input unchanged"
test("[boundary-6] withoutBase returns a root input unchanged", () => {
  expect(withoutBase("/", "/foo")).toBe("/");
  expect(withoutBase("/", "/foo/")).toBe("/");
});

// Extends public "[boundary-6] withoutBase returns an empty input unchanged"
test("[boundary-6] withoutBase returns an unrelated input unchanged", () => {
  expect(withoutBase("/bar", "/foo")).toBe("/bar");
});
