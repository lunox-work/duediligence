import { expect, test } from "vitest";
import { withoutHost } from "../../src/utils";
import { withoutHost as withoutHostFromIndex } from "../../src";

// Extends "[happy-1] removes protocol and host, keeping path, query and fragment"
test("[happy-1] removes other protocols and hosts with deeper paths and longer queries", () => {
  expect(withoutHost("ftp://files.example.org:21/pub/readme.txt")).toBe(
    "/pub/readme.txt",
  );
  expect(
    withoutHost("https://a.b.c.example.org:443/p/q/r.html?x=1&y=2#sec-3"),
  ).toBe("/p/q/r.html?x=1&y=2#sec-3");
  expect(withoutHost("git+ssh://git@github.com/unjs/ufo.git")).toBe(
    "/unjs/ufo.git",
  );
});

// Extends "[happy-1] removes credentials, port, IPv6 host and uppercase scheme"
test("[happy-1] removes credentials with an IPv6 host and port, and keeps an @ in the path", () => {
  expect(withoutHost("https://u:p@[2001:db8::1]:8443/v?w#x")).toBe("/v?w#x");
  expect(withoutHost("http://user@host.test/a@b")).toBe("/a@b");
});

// Extends "[happy-1] removes credentials, port, IPv6 host and uppercase scheme"
test("[happy-1] keeps the case of path, query and hash under an uppercase scheme and host", () => {
  expect(withoutHost("HTTPS://WWW.EXAMPLE.ORG/MiXeD/Case?K=V#Frag")).toBe(
    "/MiXeD/Case?K=V#Frag",
  );
});

// Extends "[happy-1] returns the same output when called twice with the same input"
test("[happy-1] gives the same result for repeated calls interleaved with other inputs", () => {
  const a = "https://example.org/one?x=1#y";
  const b = "http://other.test:9000/two";
  expect(withoutHost(a)).toBe("/one?x=1#y");
  expect(withoutHost(b)).toBe("/two");
  expect(withoutHost(a)).toBe("/one?x=1#y");
  expect(withoutHost(b)).toBe("/two");
});

// Extends "[happy-2] withoutHost from the package entry point removes the host"
test("[happy-2] withoutHost from the package entry point handles credentials, port, query and hash", () => {
  expect(withoutHostFromIndex("https://example.com/docs#intro")).toBe(
    "/docs#intro",
  );
  expect(withoutHostFromIndex("http://user:pw@host.test:81/x/y?z=1#w")).toBe(
    "/x/y?z=1#w",
  );
});

// Extends "[happy-2] the entry point re-exports the same function unchanged"
test("[happy-2] the entry point gives the same results as the utils export for host-less input", () => {
  expect(withoutHostFromIndex("foo/bar")).toBe("foo/bar");
  expect(withoutHostFromIndex("?q=1")).toBe("/?q=1");
});

// Extends "[boundary-1] search and hash follow the / of an empty pathname"
test("[boundary-1] a query or hash right after the host is not searched for a slash", () => {
  expect(withoutHost("https://example.com?q=1/x")).toBe("/?q=1/x");
  expect(withoutHost("https://example.com#a/b")).toBe("/#a/b");
  expect(withoutHost("https://example.com:8080?a=b#c")).toBe("/?a=b#c");
});

// Extends "[boundary-1] an empty pathname after a host becomes /"
test("[boundary-1] an empty pathname becomes / for the remaining examples", () => {
  expect(withoutHost("https://u:p@example.org:443")).toBe("/");
  expect(withoutHost("https://")).toBe("/");
});

// Extends "[boundary-2] repeated slashes, empty markers and extra ? and # are kept"
test("[boundary-2] trailing and repeated slashes and lone empty markers are kept", () => {
  expect(withoutHost("http://example.com///")).toBe("///");
  expect(withoutHost("http://example.com/foo/?")).toBe("/foo/?");
  expect(withoutHost("http://example.com/foo#")).toBe("/foo#");
});

// Extends "[boundary-2] encoded and non-ASCII characters are kept verbatim"
test("[boundary-2] encoded characters are neither decoded nor re-cased", () => {
  expect(withoutHost("http://example.com/A%2Fb/C?Q=%41#H%20")).toBe(
    "/A%2Fb/C?Q=%41#H%20",
  );
  expect(withoutHost("http://example.com/a+b?c+d=e#f")).toBe("/a+b?c+d=e#f");
});

// Extends "[boundary-2] encoded and non-ASCII characters are kept verbatim"
test("[boundary-2] malformed percent escapes are kept verbatim without throwing", () => {
  expect(withoutHost("http://example.com/%E0%A4%A")).toBe("/%E0%A4%A");
  expect(withoutHost("http://example.com/a?c=e%zz#%")).toBe("/a?c=e%zz#%");
});

// Extends "[boundary-3] backslashes in a URL with a host are read as slashes"
test("[boundary-3] backslashes in the query and hash of a URL with a host are also read as slashes", () => {
  expect(withoutHost("http:\\\\example.com\\a\\b?x=\\y#\\z")).toBe(
    "/a/b?x=/y#/z",
  );
});

// Extends "[boundary-3] backslashes in a URL with a host are read as slashes"
test("[boundary-3] mixed slashes and an uppercase scheme with backslashes", () => {
  expect(withoutHost("https:/\\example.com/foo\\bar")).toBe("/foo/bar");
  expect(withoutHost("HTTP:\\\\Example.com\\Foo")).toBe("/Foo");
});

// Extends "[boundary-4] leading spaces before the protocol are ignored"
test("[boundary-4] leading tabs, newlines and many spaces before the protocol are ignored", () => {
  expect(withoutHost("\t\n https://example.com/x?y#z")).toBe("/x?y#z");
  expect(withoutHost("     http://example.com")).toBe("/");
});

// Extends "[boundary-5] a leading NUL character before the protocol is ignored"
test("[boundary-5] several leading NUL characters, mixed with spaces, are ignored", () => {
  expect(withoutHost("\u0000\u0000https://example.com/a?b")).toBe("/a?b");
  expect(withoutHost("\u0000 \u0000https://example.com/a#b")).toBe("/a#b");
});

// Extends "[boundary-6] protocol-relative input removes its first segment as the host"
test("[boundary-6] protocol-relative input with credentials, port, query and hash", () => {
  expect(withoutHost("//user@example.com:80/a/b?c#d")).toBe("/a/b?c#d");
  expect(withoutHost("//example.com?q=1")).toBe("/?q=1");
  expect(withoutHost("//example.com#h")).toBe("/#h");
});

// Extends "[boundary-6] protocol-relative input removes its first segment as the host"
test("[boundary-6] protocol-relative input written with backslashes", () => {
  expect(withoutHost("\\\\example.com\\foo")).toBe("/foo");
  expect(withoutHost("\\/example.com/foo?x")).toBe("/foo?x");
});

// Extends "[happy-3] host-less relative paths get no leading slash"
test("[happy-3] a host-less input that looks like a domain is kept as a path", () => {
  expect(withoutHost("foo.com/bar")).toBe("foo.com/bar");
  expect(withoutHost("example.com")).toBe("example.com");
  expect(withoutHost("foo")).toBe("foo");
});

// Extends "[happy-3] host-less relative paths get no leading slash"
test("[happy-3] dot-relative paths are returned unchanged", () => {
  expect(withoutHost("./a/b?c#d")).toBe("./a/b?c#d");
  expect(withoutHost("../x")).toBe("../x");
});

// Extends "[happy-3] backslashes in a host-less path are kept"
test("[happy-3] backslashes in a host-less relative path are kept", () => {
  expect(withoutHost("a\\b\\c")).toBe("a\\b\\c");
});

// Extends "[happy-3] host-less absolute paths are returned unchanged"
test("[happy-3] a host-less path with repeated slashes or leading spaces is returned unchanged", () => {
  expect(withoutHost("/foo//bar?a#b")).toBe("/foo//bar?a#b");
  expect(withoutHost("  /x")).toBe("  /x");
});

// Extends "[boundary-7] a query-only input gets / before the query"
test("[boundary-7] lone ? and # get / before them", () => {
  expect(withoutHost("?")).toBe("/?");
  expect(withoutHost("#")).toBe("/#");
});

// Extends "[boundary-7] a hash-only input gets / before the hash"
test("[boundary-7] a query followed by a hash, with extra markers, gets / before it", () => {
  expect(withoutHost("?a#b")).toBe("/?a#b");
  expect(withoutHost("?a?b#c#d")).toBe("/?a?b#c#d");
});

// Extends "[boundary-8] the empty string gives /"
test("[boundary-8] the empty string gives / on every call", () => {
  expect(withoutHost("")).toBe("/");
  expect(withoutHost("")).toBe("/");
});

// Extends "[unhappy-1] javascript: and data: inputs return everything after the protocol"
test("[unhappy-1] vbscript: inputs in any case return everything after the protocol", () => {
  expect(withoutHost("vbscript:msgbox(1)")).toBe("msgbox(1)");
  expect(withoutHost("VBSCRIPT:msgbox(1)")).toBe("msgbox(1)");
  expect(withoutHost("DATA:text/plain,hi")).toBe("text/plain,hi");
});

// Extends "[unhappy-1] mixed-case script protocol and nested blob URL are kept verbatim"
test("[unhappy-1] ? and # after a script protocol are kept as part of the result", () => {
  expect(withoutHost("javascript:alert(1)?a#b")).toBe("alert(1)?a#b");
  expect(withoutHost("data:text/html;base64,PGI+?x#y")).toBe(
    "text/html;base64,PGI+?x#y",
  );
  expect(withoutHost("blob:https://example.com/uuid?x#y")).toBe(
    "https://example.com/uuid?x#y",
  );
  expect(withoutHost("Blob:http://localhost/abc")).toBe("http://localhost/abc");
});

// Extends "[unhappy-1] javascript: and data: inputs return everything after the protocol"
test("[unhappy-1] leading spaces or NUL before a script protocol are ignored", () => {
  expect(withoutHost("  javascript:alert(1)")).toBe("alert(1)");
  expect(withoutHost("\u0000javascript:void(0)")).toBe("void(0)");
});

// Extends "[unhappy-2] mailto: and tel: inputs give /"
test("[unhappy-2] other non-hierarchical protocols give / even with a query or hash", () => {
  expect(withoutHost("mailto:a@b.com?subject=hi#x")).toBe("/");
  expect(withoutHost("urn:isbn:0451450523")).toBe("/");
  expect(withoutHost("sms:+15551234?body=hi#x")).toBe("/");
  expect(withoutHost("news:comp.lang")).toBe("/");
});

// Extends "[unhappy-2] a custom protocol followed by a single slash gives /"
test("[unhappy-2] an uppercase custom protocol with a single slash, query and hash gives /", () => {
  expect(withoutHost("CUSTOM:/foo/bar?x#y")).toBe("/");
});

// Extends "[boundary-9] a file URL keeps its path"
test("[boundary-9] a file URL with a host, a trailing slash, query and hash keeps them", () => {
  expect(withoutHost("file://localhost/etc/hosts")).toBe("/etc/hosts");
  expect(withoutHost("file:///home/user/docs/?v#t")).toBe(
    "/home/user/docs/?v#t",
  );
  expect(withoutHost("file:///")).toBe("/");
});

// Extends "[boundary-9] a file URL with a Windows drive letter loses the slash before it"
test("[boundary-9] drive-letter file URLs in other cases and with query and hash", () => {
  expect(withoutHost("file:///C:/foo/bar?x#y")).toBe("C:/foo/bar?x#y");
  expect(withoutHost("file:///d:/x")).toBe("d:/x");
  expect(withoutHost("FILE:///C:/foo")).toBe("C:/foo");
});

// Extends "[boundary-9] a file URL with a Windows drive letter loses the slash before it"
test("[boundary-9] only the slash before the first drive letter is dropped", () => {
  expect(withoutHost("file:///C:/foo/D:/bar")).toBe("C:/foo/D:/bar");
});

// Extends "[boundary-10] a result starting with // is read as protocol-relative when passed back in"
test("[boundary-10] repeated calls keep removing the first segment of a // result", () => {
  const first = withoutHost("http://x.com//foo//bar//baz");
  expect(first).toBe("//foo//bar//baz");
  const second = withoutHost(first);
  expect(second).toBe("//bar//baz");
  const third = withoutHost(second);
  expect(third).toBe("//baz");
  expect(withoutHost(third)).toBe("/");
});

// Extends "[boundary-10] withoutHost on //foo//bar removes foo as the host"
test("[boundary-10] a // result with a single segment becomes / when passed back in", () => {
  const first = withoutHost("https://example.com//a");
  expect(first).toBe("//a");
  expect(withoutHost(first)).toBe("/");
});
