import { expect, test } from "vitest";
import { withoutHost } from "../src/utils";
import { withoutHost as withoutHostFromIndex } from "../src";

test("[happy-1] removes the protocol and host from a simple URL", () => {
  expect(withoutHost("http://example.com/foo")).toBe("/foo");
});

test("[happy-1] removes credentials and port, keeping search and hash", () => {
  expect(withoutHost("http://user:pass@example.com:8080/a?b#c")).toBe(
    "/a?b#c"
  );
});

test("[happy-2] the package entry point exposes withoutHost", () => {
  expect(withoutHostFromIndex("https://example.com/docs#intro")).toBe(
    "/docs#intro"
  );
});

test("[happy-2] the entry point re-exports the same function as src/utils", () => {
  expect(withoutHostFromIndex).toBe(withoutHost);
});

test("[happy-3] host-less absolute path is returned unchanged", () => {
  expect(withoutHost("/foo?q=1#x")).toBe("/foo?q=1#x");
});

test("[happy-3] host-less relative path gets no leading slash and keeps backslashes", () => {
  expect(withoutHost("foo/bar")).toBe("foo/bar");
  expect(withoutHost("/foo\\bar")).toBe("/foo\\bar");
});

test("[boundary-1] a URL without a path yields /", () => {
  expect(withoutHost("http://example.com")).toBe("/");
});

test("[boundary-1] an empty path is replaced by / before search and hash", () => {
  expect(withoutHost("https://example.com?q=1")).toBe("/?q=1");
  expect(withoutHost("https://example.com#x")).toBe("/#x");
  expect(withoutHost("https://")).toBe("/");
});

test("[boundary-2] percent-encoding in the path is kept verbatim", () => {
  expect(withoutHost("http://example.com/foo%20bar")).toBe("/foo%20bar");
});

test("[boundary-2] repeated slashes and empty ? and # markers are kept", () => {
  expect(withoutHost("http://example.com//foo//bar")).toBe("//foo//bar");
  expect(withoutHost("http://example.com/foo?#")).toBe("/foo?#");
});

test("[boundary-3] backslashes in a URL with a host are read as slashes", () => {
  expect(withoutHost("https:\\\\example.com\\foo\\bar")).toBe("/foo/bar");
});

test("[boundary-3] backslash-only path after the host yields /", () => {
  expect(withoutHost("https:\\\\example.com\\")).toBe("/");
});

test("[boundary-4] leading spaces before the protocol are ignored", () => {
  expect(withoutHost("  https://example.com/x")).toBe("/x");
});

test("[boundary-4] leading tab and newline before the protocol are ignored", () => {
  expect(withoutHost("\t\nhttps://example.com/x")).toBe("/x");
});

test("[boundary-5] a leading NUL character before the protocol is ignored", () => {
  expect(withoutHost("\u0000https://example.com/x")).toBe("/x");
});

test("[boundary-5] several leading NUL characters before a path-less URL yield /", () => {
  expect(withoutHost("\u0000\u0000https://example.com")).toBe("/");
});

test("[boundary-6] protocol-relative input drops its first segment as the host", () => {
  expect(withoutHost("//example.com/foo")).toBe("/foo");
});

test("[boundary-6] protocol-relative input without a path, or with /\\, is handled", () => {
  expect(withoutHost("//example.com")).toBe("/");
  expect(withoutHost("/\\example.com/foo")).toBe("/foo");
});

test("[boundary-7] host-less query-only input gets a / path", () => {
  expect(withoutHost("?q=1")).toBe("/?q=1");
});

test("[boundary-7] host-less hash-only input gets a / path", () => {
  expect(withoutHost("#h")).toBe("/#h");
});

test("[boundary-8] the empty string yields /", () => {
  expect(withoutHost("")).toBe("/");
});

test("[boundary-8] the empty string yields / on every call", () => {
  expect(withoutHost("")).toBe("/");
  expect(withoutHost("")).toBe(withoutHost(""));
});

test("[boundary-9] a file URL keeps its path", () => {
  expect(withoutHost("file:///home/user")).toBe("/home/user");
});

test("[boundary-9] a file URL with a Windows drive letter loses the leading slash", () => {
  expect(withoutHost("file:///C:/foo")).toBe("C:/foo");
});

test("[boundary-10] a result starting with // is read as protocol-relative", () => {
  expect(withoutHost("//foo//bar")).toBe("//bar");
});

test("[boundary-10] applying withoutHost twice differs from applying it once", () => {
  const once = withoutHost("http://example.com//foo//bar");
  expect(once).toBe("//foo//bar");
  expect(withoutHost(once)).toBe("//bar");
});

test("[unhappy-1] javascript: input yields everything after the protocol", () => {
  expect(withoutHost("javascript:alert(1)")).toBe("alert(1)");
});

test("[unhappy-1] mixed-case and blob: protocols keep the rest verbatim", () => {
  expect(withoutHost("JavaScript:alert(1)")).toBe("alert(1)");
  expect(withoutHost("blob:https://example.com/uuid")).toBe(
    "https://example.com/uuid"
  );
});

test("[unhappy-2] mailto: input yields /", () => {
  expect(withoutHost("mailto:a@b.com")).toBe("/");
});

test("[unhappy-2] a custom protocol with a single slash yields /", () => {
  expect(withoutHost("custom:/foo")).toBe("/");
});
