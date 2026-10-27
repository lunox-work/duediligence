import { expect, test } from "vitest";
import { withoutHost } from "../src/utils";
import { withoutHost as withoutHostFromIndex } from "../src";

test("[happy-1] removes protocol and host, keeping path, query and fragment", () => {
  expect(withoutHost("http://example.com/foo")).toBe("/foo");
  expect(withoutHost("https://example.com/foo?q=123")).toBe("/foo?q=123");
  expect(withoutHost("http://foo.com/test?query=123#hash")).toBe(
    "/test?query=123#hash",
  );
  expect(withoutHost("ws://localhost:3000/socket?x=1")).toBe("/socket?x=1");
});

test("[happy-1] removes credentials, port, IPv6 host and uppercase scheme", () => {
  expect(withoutHost("http://user:pass@example.com:8080/a?b#c")).toBe("/a?b#c");
  expect(withoutHost("http://example.com:8080/api/v1/")).toBe("/api/v1/");
  expect(withoutHost("http://[::1]:3000/x")).toBe("/x");
  expect(withoutHost("HTTP://Example.COM/Foo")).toBe("/Foo");
});

test("[happy-1] returns the same output when called twice with the same input", () => {
  const input = "http://user:pass@example.com:8080/a?b#c";
  expect(withoutHost(input)).toBe("/a?b#c");
  expect(withoutHost(input)).toBe("/a?b#c");
  expect(input).toBe("http://user:pass@example.com:8080/a?b#c");
});

test("[happy-2] withoutHost from the package entry point removes the host", () => {
  expect(withoutHostFromIndex("https://example.com/docs#intro")).toBe(
    "/docs#intro",
  );
});

test("[happy-2] the entry point re-exports the same function unchanged", () => {
  expect(withoutHostFromIndex).toBe(withoutHost);
  expect(withoutHostFromIndex("http://example.com")).toBe("/");
});

test("[boundary-1] an empty pathname after a host becomes /", () => {
  expect(withoutHost("http://example.com")).toBe("/");
  expect(withoutHost("http://example.com/")).toBe("/");
  expect(withoutHost("http://example.com:8080")).toBe("/");
  expect(withoutHost("http://user@example.com")).toBe("/");
});

test("[boundary-1] search and hash follow the / of an empty pathname", () => {
  expect(withoutHost("https://example.com?q=1")).toBe("/?q=1");
  expect(withoutHost("https://example.com#x")).toBe("/#x");
});

test("[boundary-1] a protocol with nothing after // gives /", () => {
  expect(withoutHost("https://")).toBe("/");
});

test("[boundary-2] encoded and non-ASCII characters are kept verbatim", () => {
  expect(withoutHost("http://example.com/foo%20bar")).toBe("/foo%20bar");
  expect(withoutHost("http://example.com/über?q=ä b#frag ment")).toBe(
    "/über?q=ä b#frag ment",
  );
});

test("[boundary-2] repeated slashes, empty markers and extra ? and # are kept", () => {
  expect(withoutHost("http://example.com//foo//bar")).toBe("//foo//bar");
  expect(withoutHost("http://example.com/foo?#")).toBe("/foo?#");
  expect(withoutHost("https://example.com/a?b=c?d#e#f")).toBe("/a?b=c?d#e#f");
});

test("[boundary-3] backslashes in a URL with a host are read as slashes", () => {
  expect(withoutHost("https:\\\\example.com\\foo\\bar")).toBe("/foo/bar");
});

test("[boundary-3] a backslash-separated URL with only a host gives /", () => {
  expect(withoutHost("https:\\\\example.com")).toBe("/");
});

test("[boundary-4] leading spaces before the protocol are ignored", () => {
  expect(withoutHost("  https://example.com/x")).toBe("/x");
});

test("[boundary-4] leading spaces before a protocol and bare host give /", () => {
  expect(withoutHost("  https://example.com")).toBe("/");
});

test("[boundary-5] a leading NUL character before the protocol is ignored", () => {
  expect(withoutHost("\u0000https://example.com/x")).toBe("/x");
});

test("[boundary-5] a leading NUL before a protocol and bare host gives /", () => {
  expect(withoutHost("\u0000https://example.com")).toBe("/");
});

test("[boundary-6] protocol-relative input removes its first segment as the host", () => {
  expect(withoutHost("//example.com/foo")).toBe("/foo");
  expect(withoutHost("/\\example.com/foo")).toBe("/foo");
});

test("[boundary-6] protocol-relative input with only a host gives /", () => {
  expect(withoutHost("//example.com")).toBe("/");
});

test("[happy-3] host-less absolute paths are returned unchanged", () => {
  expect(withoutHost("/foo?q=1#x")).toBe("/foo?q=1#x");
  expect(withoutHost("/")).toBe("/");
});

test("[happy-3] host-less relative paths get no leading slash", () => {
  expect(withoutHost("foo/bar")).toBe("foo/bar");
  expect(withoutHost("foo?x#y")).toBe("foo?x#y");
});

test("[happy-3] backslashes in a host-less path are kept", () => {
  expect(withoutHost("/foo\\bar")).toBe("/foo\\bar");
});

test("[boundary-7] a query-only input gets / before the query", () => {
  expect(withoutHost("?q=1")).toBe("/?q=1");
});

test("[boundary-7] a hash-only input gets / before the hash", () => {
  expect(withoutHost("#h")).toBe("/#h");
});

test("[boundary-8] the empty string gives /", () => {
  expect(withoutHost("")).toBe("/");
});

test("[boundary-8] the empty string does not throw", () => {
  expect(() => withoutHost("")).not.toThrow();
});

test("[unhappy-1] javascript: and data: inputs return everything after the protocol", () => {
  expect(withoutHost("javascript:alert(1)")).toBe("alert(1)");
  expect(withoutHost("data:text/plain,hi")).toBe("text/plain,hi");
});

test("[unhappy-1] mixed-case script protocol and nested blob URL are kept verbatim", () => {
  expect(withoutHost("JavaScript:alert(1)")).toBe("alert(1)");
  expect(withoutHost("blob:https://example.com/uuid")).toBe(
    "https://example.com/uuid",
  );
});

test("[unhappy-2] mailto: and tel: inputs give /", () => {
  expect(withoutHost("mailto:a@b.com")).toBe("/");
  expect(withoutHost("tel:123")).toBe("/");
});

test("[unhappy-2] a custom protocol followed by a single slash gives /", () => {
  expect(withoutHost("custom:/foo")).toBe("/");
});

test("[boundary-9] a file URL keeps its path", () => {
  expect(withoutHost("file:///home/user")).toBe("/home/user");
});

test("[boundary-9] a file URL with a Windows drive letter loses the slash before it", () => {
  expect(withoutHost("file:///C:/foo")).toBe("C:/foo");
});

test("[boundary-10] a result starting with // is read as protocol-relative when passed back in", () => {
  const first = withoutHost("http://example.com//foo//bar");
  expect(first).toBe("//foo//bar");
  expect(withoutHost(first)).toBe("//bar");
});

test("[boundary-10] withoutHost on //foo//bar removes foo as the host", () => {
  expect(withoutHost("//foo//bar")).toBe("//bar");
});
