import { expect, test } from "vitest";
import { joinURL, withBase } from "../../src/utils";

type Row = { input: (string | undefined | null)[]; out: string; extends: string };

const fmt = (input: Row["input"]) =>
  input.map((i) => (i === undefined ? "undefined" : JSON.stringify(i))).join(", ");

function joinURLCases(key: string, rows: Row[]) {
  for (const t of rows) {
    test(`[${key}] joinURL(${fmt(t.input)}) === ${JSON.stringify(t.out)} (extends public ${t.extends})`, () => {
      expect(joinURL(...(t.input as [string, ...string[]]))).toBe(t.out);
    });
  }
}

// Extends public [happy-1]: protocol bases keep their "//", more segments,
// and the base is kept exactly as written.
joinURLCases("happy-1", [
  { input: ["http://x.com", "a", "b", "c", "d"], out: "http://x.com/a/b/c/d", extends: "[happy-1] joinURL(\"http://x.com\", \"b\")" },
  { input: ["https://example.com/api/", "/v1/users"], out: "https://example.com/api/v1/users", extends: "[happy-1] joinURL(\"http://x.com/\", \"/b\")" },
  { input: ["https://example.com/api", "v1", "/users", "42"], out: "https://example.com/api/v1/users/42", extends: "[happy-1] joinURL(\"a\", \"b\", \"c\")" },
  { input: ["file:///home", "user"], out: "file:///home/user", extends: "[happy-1] joinURL(\"http://x.com\", \"b\")" },
  { input: ["a//b", "c"], out: "a//b/c", extends: "[happy-1] joinURL(\"a/b\", \"c/d\")" },
  { input: ["http://x.com/a/", "b/c", "/d"], out: "http://x.com/a/b/c/d", extends: "[happy-1] joinURL(\"a\", \"b/\", \"/c\")" },
]);

// Extends public [happy-2]: trailing slash on the last input after a protocol base.
joinURLCases("happy-2", [
  { input: ["http://x.com", "b/"], out: "http://x.com/b/", extends: "[happy-2] joinURL(\"a\", \"b/\")" },
  { input: ["http://x.com", "a", "/b/"], out: "http://x.com/a/b/", extends: "[happy-2] joinURL(\"a\", \"/b/\")" },
  { input: ["https://x.com/", "./a/"], out: "https://x.com/a/", extends: "[happy-2] joinURL(\"/\", \"./foo/\")" },
]);

// Extends public [happy-3]: "./" removal after a protocol base and over several inputs.
joinURLCases("happy-3", [
  { input: ["http://x.com", "./b"], out: "http://x.com/b", extends: "[happy-3] joinURL(\"a/\", \"./b\")" },
  { input: ["http://x.com/", "./a", "./b", "/c"], out: "http://x.com/a/b/c", extends: "[happy-3] joinURL(\"/\", \"./foo\", \"bar\")" },
  { input: ["http://x.com", "./"], out: "http://x.com/", extends: "[happy-3] joinURL(\"a\", \"./\")" },
]);

// Extends public [boundary-1]: only one leading "./" or "/" goes; extra
// slashes and dots stay. Shortcut caught: stripping every leading slash or dot.
joinURLCases("boundary-1", [
  { input: ["a", "///b"], out: "a///b", extends: "[boundary-1] joinURL(\"a\", \"//b\")" },
  { input: ["a/", "//b"], out: "a//b", extends: "[boundary-1] joinURL(\"a\", \"//b\")" },
  { input: ["/", "//b"], out: "//b", extends: "[boundary-1] joinURL(\"a\", \"//b\")" },
  { input: ["a", ".//b"], out: "a//b", extends: "[boundary-1] joinURL(\"a\", \"/./b\")" },
  { input: ["a", "./././b"], out: "a/././b", extends: "[boundary-1] joinURL(\"a\", \"././b\")" },
  { input: ["a", "b//"], out: "a/b//", extends: "[boundary-1] joinURL(\"a\", \"b//c\")" },
  { input: ["a", "b", "//c"], out: "a/b//c", extends: "[boundary-1] joinURL(\"a\", \"//b\")" },
  { input: ["http://x.com", "//b"], out: "http://x.com//b", extends: "[boundary-1] joinURL(\"a\", \"//b\")" },
  { input: ["http://x.com", ".b"], out: "http://x.com/.b", extends: "[boundary-1] joinURL(\"a\", \"././b\")" },
]);

// Extends public [boundary-2]: "." and ".." stay anywhere, including in the base
// and in the middle of an input. Shortcut caught: resolving only the last input.
joinURLCases("boundary-2", [
  { input: ["a", "b", "..", "c"], out: "a/b/../c", extends: "[boundary-2] joinURL(\"a\", \"..\")" },
  { input: ["../a", "b"], out: "../a/b", extends: "[boundary-2] joinURL(\"/a\", \"../b\")" },
  { input: ["..", ".."], out: "../..", extends: "[boundary-2] joinURL(\"a\", \"..\")" },
  { input: ["./", "../a"], out: "./../a", extends: "[boundary-2] joinURL(\"/a\", \"../b\")" },
  { input: ["a/b", "./.."], out: "a/b/..", extends: "[boundary-2] joinURL(\"a\", \"..\")" },
  { input: ["a", "/.."], out: "a/..", extends: "[boundary-2] joinURL(\"a\", \"..\")" },
  { input: ["/a", "b/../c"], out: "/a/b/../c", extends: "[boundary-2] joinURL(\"/a/b/c\", \"../../d\")" },
  { input: ["a", "b/./c"], out: "a/b/./c", extends: "[boundary-2] joinURL(\"a\", \".\")" },
  { input: ["/a", "../../../../b"], out: "/a/../../../../b", extends: "[boundary-2] joinURL(\"/a/b/c\", \"../../d\")" },
]);

// Extends public [boundary-3]: no query/fragment parsing. Shortcut caught:
// joining only the pathname and re-appending search or hash.
joinURLCases("boundary-3", [
  { input: ["http://x.com/p?q=1", "r"], out: "http://x.com/p?q=1/r", extends: "[boundary-3] joinURL(\"/a?x=1\", \"b\")" },
  { input: ["http://x.com/a#h", "b"], out: "http://x.com/a#h/b", extends: "[boundary-3] joinURL(\"/a#h\", \"b\")" },
  { input: ["/a?x=1", "../b"], out: "/a?x=1/../b", extends: "[boundary-3] joinURL(\"/a?x=1\", \"b\")" },
  { input: ["/a?x=//", "b"], out: "/a?x=//b", extends: "[boundary-3] joinURL(\"/a?x=1\", \"b\")" },
  { input: ["/a#/x/..", "b"], out: "/a#/x/../b", extends: "[boundary-3] joinURL(\"/a#h\", \"b\")" },
]);

// Extends public [boundary-4]: a trailing "/" input adds no trailing slash.
// Shortcut caught: copying the trailing slash of the last raw argument.
joinURLCases("boundary-4", [
  { input: ["a/b", "/"], out: "a/b", extends: "[boundary-4] joinURL(\"a\", \"/\")" },
  { input: ["a", "b", "/"], out: "a/b", extends: "[boundary-4] joinURL(\"a\", \"/\")" },
  { input: ["a", "/", ""], out: "a", extends: "[boundary-4] joinURL(\"a\", \"/\", \"b\")" },
  { input: ["/a", "", "/"], out: "/a", extends: "[boundary-4] joinURL(\"/a\", \"/\")" },
  { input: ["./a", "/"], out: "./a", extends: "[boundary-4] joinURL(\"a\", \"/\")" },
  { input: ["http://x.com", "/"], out: "http://x.com", extends: "[boundary-4] joinURL(\"a\", \"/\")" },
  { input: ["a", "", "/", "", "b", "/"], out: "a/b", extends: "[boundary-4] joinURL(\"a\", \"/\", \"b\")" },
]);

// Extends public [unhappy-1]: a falsy base means "" and the first kept input is
// used unchanged; inputs "" and "/" after it are still skipped.
joinURLCases("unhappy-1", [
  { input: [undefined, "/"], out: "", extends: "[unhappy-1] joinURL(undefined)" },
  { input: ["", "/", "/"], out: "", extends: "[unhappy-1] joinURL(\"\")" },
  { input: [undefined, "/", "a"], out: "a", extends: "[unhappy-1] joinURL(undefined, \"a\", \"b\")" },
  { input: [null, "", "/", "./a", "b"], out: "./a/b", extends: "[unhappy-1] joinURL(undefined, \"./\")" },
  { input: [null, "http://x.com", "b"], out: "http://x.com/b", extends: "[unhappy-1] joinURL(null, \"/a\")" },
  { input: ["", "../a"], out: "../a", extends: "[unhappy-1] joinURL(\"\", \"/a\")" },
  { input: [undefined, "a//b"], out: "a//b", extends: "[unhappy-1] joinURL(undefined, \"a\", \"b\")" },
]);

// withBase now goes through the plain joinURL.

type BaseRow = { input: string; base: string; out: string; extends: string };

function withBaseCases(key: string, rows: BaseRow[]) {
  for (const t of rows) {
    test(`[${key}] withBase(${JSON.stringify(t.input)}, ${JSON.stringify(t.base)}) === ${JSON.stringify(t.out)} (extends public ${t.extends})`, () => {
      expect(withBase(t.input, t.base)).toBe(t.out);
    });
  }
}

// Extends public [happy-7]: a protocol base keeps its "//".
withBaseCases("happy-7", [
  { input: "/bar", base: "http://x.com", out: "http://x.com/bar", extends: "[happy-7] withBase(\"/bar\", \"/foo\")" },
  { input: "bar/", base: "https://x.com/api/", out: "https://x.com/api/bar/", extends: "[happy-7] withBase(\"/bar\", \"/foo\")" },
]);

// Extends public [boundary-14]: ".." anywhere in the input stays.
// Shortcut caught: withBase switched to joinRelativeURL.
withBaseCases("boundary-14", [
  { input: "../../bar", base: "/foo/", out: "/foo/../../bar", extends: "[boundary-14] withBase(\"../bar\", \"/foo\")" },
  { input: "bar/..", base: "/foo", out: "/foo/bar/..", extends: "[boundary-14] withBase(\"../bar\", \"/foo\")" },
  { input: "./../bar", base: "/foo", out: "/foo/../bar", extends: "[boundary-14] withBase(\"../bar\", \"/foo\")" },
  { input: "/a/../b", base: "/foo/x", out: "/foo/x/a/../b", extends: "[boundary-14] withBase(\"../bar\", \"/foo\")" },
]);
