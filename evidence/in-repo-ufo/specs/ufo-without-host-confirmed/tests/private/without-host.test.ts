import { expect, test } from "vitest";
import { withoutHost } from "../../src/utils";
import { withoutHost as withoutHostFromIndex } from "../../src";

// Extends "[happy-1] removes the protocol and host from a simple URL": the remaining spec rows
test("[happy-1] https URL with a query keeps the query", () => {
  expect(withoutHost("https://example.com/foo?q=123")).toBe("/foo?q=123");
});

test("[happy-1] URL with query and hash keeps both", () => {
  expect(withoutHost("http://foo.com/test?query=123#hash")).toBe(
    "/test?query=123#hash"
  );
});

test("[happy-1] host with port and trailing slash path", () => {
  expect(withoutHost("http://example.com:8080/api/v1/")).toBe("/api/v1/");
});

test("[happy-1] ws protocol with localhost and port", () => {
  expect(withoutHost("ws://localhost:3000/socket?x=1")).toBe("/socket?x=1");
});

test("[happy-1] IPv6 host with port", () => {
  expect(withoutHost("http://[::1]:3000/x")).toBe("/x");
});

test("[happy-1] upper-case protocol and host, path case kept", () => {
  expect(withoutHost("HTTP://Example.COM/Foo")).toBe("/Foo");
});

// Extends "[happy-1] removes credentials and port, keeping search and hash": other protocols and longer paths
test("[happy-1] other protocols, deeper paths and user-only credentials", () => {
  expect(withoutHost("ftp://files.example.org:21/pub/a/b.txt?x=1#y")).toBe(
    "/pub/a/b.txt?x=1#y"
  );
  expect(withoutHost("git+ssh://git@github.com/unjs/ufo.git")).toBe(
    "/unjs/ufo.git"
  );
  expect(withoutHost("https://user@sub.example.co.uk/a/b/c")).toBe("/a/b/c");
});

// Shortcut: cutting at the first "@" or "/" anywhere in the input
test("[happy-1] an @ in the path, a / in the query and a ? in the hash are kept", () => {
  expect(withoutHost("http://example.com/a@b")).toBe("/a@b");
  expect(withoutHost("http://example.com/p?a=/b/c")).toBe("/p?a=/b/c");
  expect(withoutHost("http://example.com/p#a?b/c")).toBe("/p#a?b/c");
});

// Shortcut: looking for "://" inside the path instead of only at the start
test("[happy-1] a URL inside the query is not treated as the host", () => {
  expect(
    withoutHost("https://example.com/redirect?to=http://other.com/x#y")
  ).toBe("/redirect?to=http://other.com/x#y");
});

// Extends "[happy-2] the package entry point exposes withoutHost": other inputs
test("[happy-2] the entry point strips credentials, port and empty paths too", () => {
  expect(withoutHostFromIndex("http://u:p@example.com:8080/a?b#c")).toBe(
    "/a?b#c"
  );
  expect(withoutHostFromIndex("https://example.com")).toBe("/");
});

// Extends "[happy-3] host-less absolute path is returned unchanged": the remaining spec rows
test("[happy-3] a lone slash is returned unchanged", () => {
  expect(withoutHost("/")).toBe("/");
});

test("[happy-3] host-less relative path with query and hash is unchanged", () => {
  expect(withoutHost("foo?x#y")).toBe("foo?x#y");
});

// Extends "[happy-3] host-less relative path gets no leading slash and keeps backslashes"
test("[happy-3] relative paths keep their form and backslashes", () => {
  expect(withoutHost("./a/b?c#d")).toBe("./a/b?c#d");
  expect(withoutHost("../x/y")).toBe("../x/y");
  expect(withoutHost("foo\\bar\\baz")).toBe("foo\\bar\\baz");
  expect(withoutHost("/a/b/c/d/e/f?g=h&i=j#k")).toBe("/a/b/c/d/e/f?g=h&i=j#k");
});

// Shortcut: treating the first segment of any input as a host
test("[happy-3] a domain-like first segment without protocol is not removed", () => {
  expect(withoutHost("foo.com/foo?test=123#token")).toBe(
    "foo.com/foo?test=123#token"
  );
  expect(withoutHost("example.com")).toBe("example.com");
});

// Extends "[boundary-1] a URL without a path yields /": the remaining spec rows
test("[boundary-1] a lone slash path yields /", () => {
  expect(withoutHost("http://example.com/")).toBe("/");
});

test("[boundary-1] a port without a path yields /", () => {
  expect(withoutHost("http://example.com:8080")).toBe("/");
});

test("[boundary-1] credentials without a path yield /", () => {
  expect(withoutHost("http://user@example.com")).toBe("/");
});

// Extends "[boundary-1] an empty path is replaced by / before search and hash": more combinations
test("[boundary-1] empty path with credentials, port, search and hash", () => {
  expect(withoutHost("http://user:pass@example.com:8080?q=1#h")).toBe(
    "/?q=1#h"
  );
  expect(withoutHost("ws://localhost:3000#")).toBe("/#");
  expect(withoutHost("http://example.com?")).toBe("/?");
  expect(withoutHost("https://example.com?a=/b")).toBe("/?a=/b");
});

// Extends "[boundary-2] percent-encoding in the path is kept verbatim": the remaining spec rows
test("[boundary-2] non-ASCII characters and spaces are kept verbatim", () => {
  expect(withoutHost("http://example.com/über?q=ä b#frag ment")).toBe(
    "/über?q=ä b#frag ment"
  );
});

test("[boundary-2] extra ? and # characters stay in search and hash", () => {
  expect(withoutHost("https://example.com/a?b=c?d#e#f")).toBe("/a?b=c?d#e#f");
});

// Extends "[boundary-2] repeated slashes and empty ? and # markers are kept": case, trailing slashes, encodings
test("[boundary-2] case, trailing slashes and encodings are not normalised", () => {
  expect(withoutHost("http://example.com/FOO/Bar/")).toBe("/FOO/Bar/");
  expect(withoutHost("http://example.com/a%2Fb%2520c?x=%26+y#%20")).toBe(
    "/a%2Fb%2520c?x=%26+y#%20"
  );
  expect(withoutHost("http://example.com/foo/?")).toBe("/foo/?");
  expect(withoutHost("http://example.com/foo#")).toBe("/foo#");
  expect(withoutHost("http://example.com/a/./b/../c")).toBe("/a/./b/../c");
  expect(withoutHost("http://example.com///a///")).toBe("///a///");
});

// Extends "[boundary-3] backslashes in a URL with a host are read as slashes"
test("[boundary-3] backslashes in search and hash of a URL with a host become slashes", () => {
  expect(withoutHost("http:\\\\example.com\\a\\b?c\\d#e\\f")).toBe(
    "/a/b?c/d#e/f"
  );
});

test("[boundary-3] mixed slashes and backslashes after the protocol", () => {
  expect(withoutHost("https:/\\example.com/foo\\bar")).toBe("/foo/bar");
  expect(withoutHost("https://example.com\\foo")).toBe("/foo");
});

// Extends "[boundary-4] leading spaces before the protocol are ignored"
test("[boundary-4] leading whitespace before a URL with credentials, port, search and hash", () => {
  expect(withoutHost("\r\n\t   https://u:p@example.com:1/a?b#c")).toBe(
    "/a?b#c"
  );
});

test("[boundary-4] leading spaces before a path-less URL yield /", () => {
  expect(withoutHost("    http://example.com")).toBe("/");
});

// Extends "[boundary-5] a leading NUL character before the protocol is ignored"
test("[boundary-5] NUL characters mixed with spaces before the protocol", () => {
  expect(withoutHost("\u0000 \u0000http://example.com/x?y#z")).toBe("/x?y#z");
});

// Extends "[boundary-6] protocol-relative input drops its first segment as the host"
test("[boundary-6] protocol-relative input with credentials, port, search and hash", () => {
  expect(withoutHost("//user:pass@example.com:8080/a?b#c")).toBe("/a?b#c");
  expect(withoutHost("//example.com?q=1")).toBe("/?q=1");
});

// Extends "[boundary-6] protocol-relative input without a path, or with /\\, is handled"
test("[boundary-6] protocol-relative input written with backslashes", () => {
  expect(withoutHost("\\\\example.com\\foo")).toBe("/foo");
  expect(withoutHost("\\/example.com/foo/bar")).toBe("/foo/bar");
});

// Extends "[boundary-7] host-less query-only input gets a / path"
test("[boundary-7] bare ? and query with slashes get a / path", () => {
  expect(withoutHost("?")).toBe("/?");
  expect(withoutHost("?a/b=c")).toBe("/?a/b=c");
});

// Extends "[boundary-7] host-less hash-only input gets a / path"
test("[boundary-7] bare # and query followed by hash get a / path", () => {
  expect(withoutHost("#")).toBe("/#");
  expect(withoutHost("?a=1#b")).toBe("/?a=1#b");
});

// Extends "[boundary-8] the empty string yields /"
test("[boundary-8] the empty string through the entry point yields /", () => {
  expect(withoutHostFromIndex("")).toBe("/");
});

// Extends "[boundary-9] a file URL keeps its path"
test("[boundary-9] file URLs with a host, search, hash or only a slash", () => {
  expect(withoutHost("file://localhost/etc/hosts")).toBe("/etc/hosts");
  expect(withoutHost("file:///home/user/a.txt?x#y")).toBe(
    "/home/user/a.txt?x#y"
  );
  expect(withoutHost("file:///")).toBe("/");
});

// Extends "[boundary-9] a file URL with a Windows drive letter loses the leading slash"
test("[boundary-9] other drive letters, lower case, deeper paths", () => {
  expect(withoutHost("file:///D:/a/b?x#y")).toBe("D:/a/b?x#y");
  expect(withoutHost("file:///c:/Users/me")).toBe("c:/Users/me");
});

// Extends "[boundary-10] a result starting with // is read as protocol-relative"
test("[boundary-10] repeated application keeps stripping a leading segment", () => {
  const once = withoutHost("http://example.com//a/b?c#d");
  expect(once).toBe("//a/b?c#d");
  const twice = withoutHost(once);
  expect(twice).toBe("/b?c#d");
  expect(withoutHost(twice)).toBe("/b?c#d");
});

// Extends "[boundary-10] applying withoutHost twice differs from applying it once"
test("[boundary-10] a // result without further path collapses to / when passed back", () => {
  expect(withoutHost("//foo")).toBe("/");
  expect(withoutHost(withoutHost("https://example.com//foo?x"))).toBe("/?x");
});

// Extends "[unhappy-1] javascript: input yields everything after the protocol": the remaining spec row
test("[unhappy-1] data: input yields everything after the protocol", () => {
  expect(withoutHost("data:text/plain,hi")).toBe("text/plain,hi");
});

// Extends "[unhappy-1] mixed-case and blob: protocols keep the rest verbatim": vbscript and other cases
test("[unhappy-1] vbscript: and upper-case script protocols", () => {
  expect(withoutHost("vbscript:msgbox(1)")).toBe("msgbox(1)");
  expect(withoutHost("VBSCRIPT:msgbox(1)")).toBe("msgbox(1)");
  expect(withoutHost("DATA:text/html;base64,PGI+")).toBe("text/html;base64,PGI+");
});

// Shortcut: splitting search and hash off, or treating "//" as a host, for script protocols
test("[unhappy-1] ? # and // after a script protocol are kept verbatim", () => {
  expect(withoutHost("javascript:alert('?x#y')")).toBe("alert('?x#y')");
  expect(withoutHost("data:text/plain,a?b#c")).toBe("text/plain,a?b#c");
  expect(withoutHost("blob:http://example.com/u?x#y")).toBe(
    "http://example.com/u?x#y"
  );
  expect(withoutHost("javascript://example.com/%0Aalert(1)")).toBe(
    "//example.com/%0Aalert(1)"
  );
});

test("[unhappy-1] leading whitespace before a script protocol is ignored", () => {
  expect(withoutHost("  javascript:alert(1)")).toBe("alert(1)");
  expect(withoutHost("\u0000data:x")).toBe("x");
});

// Extends "[unhappy-2] mailto: input yields /": the remaining spec row
test("[unhappy-2] tel: input yields /", () => {
  expect(withoutHost("tel:123")).toBe("/");
});

// Extends "[unhappy-2] a custom protocol with a single slash yields /": other protocols, search and hash
test("[unhappy-2] other non-hierarchical protocols yield / even with search and hash", () => {
  expect(withoutHost("mailto:a@b.com?subject=hi#x")).toBe("/");
  expect(withoutHost("urn:isbn:0451450523")).toBe("/");
  expect(withoutHost("sms:+123")).toBe("/");
  expect(withoutHost("custom:foo?x#y")).toBe("/");
  expect(withoutHost("news:/a/b?c")).toBe("/");
});
