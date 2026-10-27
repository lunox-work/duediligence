import { expect, test } from "vitest";
import { withBase, withoutBase } from "../src/utils";

test("[unhappy-1] withBase adds the base when it is a false prefix of the first segment", () => {
  expect(withBase("/apiv2", "/api")).toBe("/api/apiv2");
});

test("[unhappy-1] withBase treats '#' right after the base as no boundary", () => {
  expect(withBase("/api#", "/api")).toBe("/api/api#");
});

test("[happy-1] withBase leaves the input alone when '/' follows the base", () => {
  expect(withBase("/api/users", "/api")).toBe("/api/users");
});

test("[happy-1] withBase leaves the input alone when it is the base with a trailing '/' removed", () => {
  expect(withBase("/base", "/base/")).toBe("/base");
});

test("[unhappy-2] withoutBase leaves the input unchanged when the base is a false prefix", () => {
  expect(withoutBase("/apiv2", "/api")).toBe("/apiv2");
});

test("[unhappy-2] withoutBase leaves the input unchanged for a false prefix with a trailing-slash base", () => {
  expect(withoutBase("/apiv2", "/api/")).toBe("/apiv2");
});

test("[happy-2] withoutBase removes the base when '/' follows it", () => {
  expect(withoutBase("/api/users", "/api")).toBe("/users");
});

test("[happy-2] withoutBase returns '/' when the input is exactly the base", () => {
  expect(withoutBase("/api", "/api")).toBe("/");
});

test("[happy-2] withoutBase keeps the query when '?' follows the base", () => {
  expect(withoutBase("/api?", "/api")).toBe("/?");
});

test("[boundary-1] withoutBase removes a doubled-slash base followed by '/'", () => {
  expect(withoutBase("/api//x", "/api//")).toBe("/x");
});

test("[boundary-1] withoutBase does not treat a normalized base ending in '/' as a boundary", () => {
  expect(withoutBase("/api/x", "/api//")).toBe("/api/x");
});

test("[boundary-1] withBase adds a doubled-slash base when no boundary follows it", () => {
  expect(withBase("/api/x", "/api//")).toBe("/api/api/x");
});

test("[boundary-2] withBase matches case-sensitively", () => {
  expect(withBase("/API/users", "/api")).toBe("/api/API/users");
});

test("[boundary-2] withoutBase does not decode an encoded slash after the base", () => {
  expect(withoutBase("/api%2Fx", "/api")).toBe("/api%2Fx");
});

test("[boundary-3] withBase does not treat a backslash as a boundary", () => {
  expect(withBase("/api\\x", "/api")).toBe("/api/api\\x");
});

test("[boundary-3] withoutBase does not treat a backslash as a boundary", () => {
  expect(withoutBase("/api\\x", "/api")).toBe("/api\\x");
});

test("[unhappy-3] withBase adds the base when it appears later in the input", () => {
  expect(withBase("/a/api", "/api")).toBe("/api/a/api");
});

test("[unhappy-3] withoutBase leaves an input without a leading slash unchanged", () => {
  expect(withoutBase("api/x", "/api")).toBe("api/x");
});

test("[boundary-4] withBase returns the input unchanged for an empty base", () => {
  expect(withBase("/apiv2", "")).toBe("/apiv2");
});

test("[boundary-4] withoutBase returns the input unchanged for a root base", () => {
  expect(withoutBase("/?test", "/")).toBe("/?test");
});

test("[boundary-5] withBase returns an input with a protocol unchanged", () => {
  expect(withBase("https://test.com", "/base/")).toBe("https://test.com");
});

test("[boundary-5] withBase returns a protocol input unchanged even when the protocol base is a false prefix", () => {
  expect(withBase("https://test.com/apiv2", "https://test.com/api")).toBe(
    "https://test.com/apiv2",
  );
});

test("[boundary-6] withBase returns the normalized base for a root input", () => {
  expect(withBase("/", "/foo/")).toBe("/foo");
});

test("[boundary-6] withoutBase returns an empty input unchanged", () => {
  expect(withoutBase("", "/foo")).toBe("");
});
