import { expect, test } from "vitest";
import { joinRelativeURL } from "../../src/utils";

type Row = { input: (string | undefined | null)[]; out: string; extends: string };

const fmt = (input: Row["input"]) =>
  input.map((i) => (i === undefined ? "undefined" : JSON.stringify(i))).join(", ");

function joinRelativeURLCases(key: string, rows: Row[]) {
  for (const t of rows) {
    test(`[${key}] joinRelativeURL(${fmt(t.input)}) === ${JSON.stringify(t.out)} (extends public ${t.extends})`, () => {
      expect(joinRelativeURL(...(t.input as string[]))).toBe(t.out);
    });
  }
}

// Extends public [happy-4]: more inputs and multi-segment inputs.
joinRelativeURLCases("happy-4", [
  { input: ["a", "b", "c", "d", "e"], out: "a/b/c/d/e", extends: "[happy-4] joinRelativeURL(\"a\", \"b\")" },
  { input: ["/x/y", "z/w"], out: "/x/y/z/w", extends: "[happy-4] joinRelativeURL(\"/a\")" },
  { input: ["/api", "/v1", "users"], out: "/api/v1/users", extends: "[happy-4] joinRelativeURL(\"/\", \"a\")" },
  { input: ["x/", "/y/", "/z"], out: "x/y/z", extends: "[happy-4] joinRelativeURL(\"a\", \"b/\", \"/c\")" },
  { input: ["/", "./foo", "./bar", "baz"], out: "/foo/bar/baz", extends: "[happy-4] joinRelativeURL(\"/\", \"./foo\", \"bar\")" },
]);

// Extends public [happy-5]: ".." inside a single input, several ".." inputs,
// and ".." in a non-absolute path.
joinRelativeURLCases("happy-5", [
  { input: ["/a/b/c/d", "../../../e"], out: "/a/e", extends: "[happy-5] joinRelativeURL(\"/a/b/c\", \"../../d\")" },
  { input: ["/a/b", "c", "..", "..", "d"], out: "/a/d", extends: "[happy-5] joinRelativeURL(\"/a\", \"b\", \"..\")" },
  { input: ["a/b/c", "..", "d"], out: "a/b/d", extends: "[happy-5] joinRelativeURL(\"/a\", \"../b\")" },
  { input: ["/a/b/../c"], out: "/a/c", extends: "[happy-5] joinRelativeURL(\"/a/b\", \"./c/../d\")" },
  { input: ["a", "b/../c"], out: "a/c", extends: "[happy-5] joinRelativeURL(\"/a/b\", \"./c/../d\")" },
]);

// Extends public [happy-6]: "./" prefix with more segments and more "..".
joinRelativeURLCases("happy-6", [
  { input: ["./a/b", "../c"], out: "./a/c", extends: "[happy-6] joinRelativeURL(\"./a\", \"../b\")" },
  { input: ["./a", "b", "c"], out: "./a/b/c", extends: "[happy-6] joinRelativeURL(\"./a\", \"./b\")" },
  { input: ["./a/", "b/"], out: "./a/b/", extends: "[happy-6] joinRelativeURL(\"./\", \"a\")" },
  { input: ["./a/b", "../.."], out: "./", extends: "[happy-6] joinRelativeURL(\"./a\", \"..\")" },
  { input: ["./a", "./b", "../c"], out: "./a/c", extends: "[happy-6] joinRelativeURL(\"./a\", \"../b\")" },
]);

// Extends public [boundary-6]: net depth back at 0 or above after going past
// the start. Shortcut caught: dropping the leading "/" once a ".." removes nothing.
joinRelativeURLCases("boundary-6", [
  { input: ["/a/b/c", "../../../../d"], out: "/d", extends: "[boundary-6] joinRelativeURL(\"/a/b\", \"../../../d\")" },
  { input: ["/a", "..", "..", "b"], out: "/b", extends: "[boundary-6] joinRelativeURL(\"/a\", \"../../d\")" },
  { input: ["/a", "../../d", "e"], out: "/d/e", extends: "[boundary-6] joinRelativeURL(\"/a\", \"../../d\")" },
  { input: ["/a", "../../d/"], out: "/d/", extends: "[boundary-6] joinRelativeURL(\"/a\", \"../../d\")" },
  { input: ["./a", "..", "..", "b", "c"], out: "./b/c", extends: "[boundary-6] joinRelativeURL(\"./a\", \"../../b\")" },
]);

// Extends public [boundary-7]: deeper negative depth and "../" counted from the
// net depth, not from the unmatched ".." parts. Shortcut caught: POSIX-style
// resolution that keeps every unmatched "..".
joinRelativeURLCases("boundary-7", [
  { input: ["/a", "../../../../d"], out: "../../d", extends: "[boundary-7] joinRelativeURL(\"/a\", \"../../../d\")" },
  { input: ["/a/b", "../../../../c"], out: "../c", extends: "[boundary-7] joinRelativeURL(\"/a\", \"../../../d\")" },
  { input: ["./a", "../../.."], out: "../../", extends: "[boundary-7] joinRelativeURL(\"./a\", \"../..\")" },
  { input: ["../.."], out: "../../", extends: "[boundary-7] joinRelativeURL(\"..\")" },
  { input: ["..", "..", ".."], out: "../../../", extends: "[boundary-7] joinRelativeURL(\"..\")" },
  { input: ["../../a"], out: "../a", extends: "[boundary-7] joinRelativeURL(\"../a\", \"./../../b\")" },
  { input: ["/x", "../../../../y/"], out: "../../y/", extends: "[boundary-7] joinRelativeURL(\"/a\", \"../../../d/\")" },
  { input: ["/a", "../../d", ".."], out: "../", extends: "[boundary-7] joinRelativeURL(\"./a\", \"../..\")" },
  { input: ["/a/b", "../../../.."], out: "../../", extends: "[boundary-7] joinRelativeURL(\"./a\", \"../..\")" },
]);

// Extends public [boundary-8]: a ".." that removes nothing still offsets later segments.
joinRelativeURLCases("boundary-8", [
  { input: ["../../a", "b", "c"], out: "a/b/c", extends: "[boundary-8] joinRelativeURL(\"../a\", \"b\")" },
  { input: ["../a/b"], out: "a/b", extends: "[boundary-8] joinRelativeURL(\"../a\")" },
  { input: ["../../a/b"], out: "a/b", extends: "[boundary-8] joinRelativeURL(\"../a\")" },
  { input: ["..", "a", "b/"], out: "a/b/", extends: "[boundary-8] joinRelativeURL(\"../a\", \"b\")" },
  { input: ["../a", "../b", "c"], out: "b/c", extends: "[boundary-8] joinRelativeURL(\"../a\", \"../b\")" },
  { input: ["a/../../../b", "c"], out: "b/c", extends: "[boundary-8] joinRelativeURL(\"a/b/../../..\", \"c\")" },
]);

// Extends public [boundary-9]: everything cancels out; only prefix and trailing slash remain.
joinRelativeURLCases("boundary-9", [
  { input: ["a/b", "../.."], out: "", extends: "[boundary-9] joinRelativeURL(\"a\", \"..\")" },
  { input: ["a/b", "../../"], out: "/", extends: "[boundary-9] joinRelativeURL(\"a\", \"../\")" },
  { input: ["/a/b/", "../../"], out: "/", extends: "[boundary-9] joinRelativeURL(\"/a\", \"../\")" },
  { input: ["a", "b", "..", ".."], out: "", extends: "[boundary-9] joinRelativeURL(\"a\", \"..\")" },
  { input: [".", "."], out: "", extends: "[boundary-9] joinRelativeURL(\".\")" },
  { input: [".", "./"], out: "/", extends: "[boundary-9] joinRelativeURL(\".\")" },
  { input: [".", "a", "b"], out: "a/b", extends: "[boundary-9] joinRelativeURL(\".\", \"a\")" },
]);

// Extends public [boundary-10]: longer runs of empty and "." parts, and
// another protocol URL. Shortcut caught: detecting a protocol and keeping "//".
joinRelativeURLCases("boundary-10", [
  { input: ["a///b"], out: "a/b", extends: "[boundary-10] joinRelativeURL(\"a//b\")" },
  { input: ["/a//b//c"], out: "/a/b/c", extends: "[boundary-10] joinRelativeURL(\"a//b\")" },
  { input: ["a/././b/."], out: "a/b", extends: "[boundary-10] joinRelativeURL(\"a/./b\")" },
  { input: ["///"], out: "/", extends: "[boundary-10] joinRelativeURL(\"//\")" },
  { input: ["a//", "//b"], out: "a/b", extends: "[boundary-10] joinRelativeURL(\"a/\", \"/b/\", \"c//\")" },
  { input: [".//a"], out: "./a", extends: "[boundary-10] joinRelativeURL(\"a/./b\")" },
  { input: ["https://example.com/api", "v1"], out: "https:/example.com/api/v1", extends: "[boundary-10] joinRelativeURL(\"http://x.com\", \"b\")" },
  { input: ["http://x.com/", "../b"], out: "http:/b", extends: "[boundary-10] joinRelativeURL(\"http://x.com\", \"b\")" },
  { input: ["https://example.com/a/", "b/"], out: "https:/example.com/a/b/", extends: "[boundary-10] joinRelativeURL(\"http://x.com\", \"b\")" },
]);

// Extends public [boundary-11]: only "/" separates; "?", "#", "\\", spaces,
// encoded dots and longer dot runs are ordinary characters.
// Shortcut caught: parsing query/hash and joining only the pathname.
joinRelativeURLCases("boundary-11", [
  { input: ["a", "....", "b"], out: "a/..../b", extends: "[boundary-11] joinRelativeURL(\"a\", \"...\", \"b\")" },
  { input: ["a", "...", ".."], out: "a", extends: "[boundary-11] joinRelativeURL(\"a\", \"...\", \"b\")" },
  { input: ["a\\..", "b"], out: "a\\../b", extends: "[boundary-11] joinRelativeURL(\"a\\\\b\", \"..\")" },
  { input: ["/p?q=a/..", "c"], out: "/c", extends: "[boundary-11] joinRelativeURL(\"/a?x=1\", \"../b\")" },
  { input: ["/a#x/../y"], out: "/y", extends: "[boundary-11] joinRelativeURL(\"/a#h\", \"../b\")" },
  { input: ["/a?x=1", "b"], out: "/a?x=1/b", extends: "[boundary-11] joinRelativeURL(\"/a?x=1\", \"../b\")" },
  { input: ["a b", "..", "c d"], out: "c d", extends: "[boundary-11] joinRelativeURL(\"/a b\", \"c\")" },
  { input: ["%2e%2e", "a"], out: "%2e%2e/a", extends: "[boundary-11] joinRelativeURL(\"a\", \"...\", \"b\")" },
]);

// Extends public [boundary-12]: trailing slashes on earlier inputs are not kept;
// only the last input's counts. Shortcut caught: checking the first input or any input.
joinRelativeURLCases("boundary-12", [
  { input: ["a/", "b/", "c"], out: "a/b/c", extends: "[boundary-12] joinRelativeURL(\"a/\", \"b\")" },
  { input: ["/a/", "b/", "c/", "d"], out: "/a/b/c/d", extends: "[boundary-12] joinRelativeURL(\"a/\", \"b\")" },
  { input: ["a", "./"], out: "a/", extends: "[boundary-12] joinRelativeURL(\"a\", \"b\", \"/\")" },
  { input: ["a", "b", "./"], out: "a/b/", extends: "[boundary-12] joinRelativeURL(\"a\", \"b\", \"/\")" },
  { input: ["a", "b/."], out: "a/b", extends: "[boundary-12] joinRelativeURL(\"a\", \"b/\")" },
  { input: ["/a", "b/c/"], out: "/a/b/c/", extends: "[boundary-12] joinRelativeURL(\"/a\", \"./b/\")" },
  { input: ["x", "y", "z", "../"], out: "x/y/", extends: "[boundary-12] joinRelativeURL(\"/a\", \"b\", \"../\")" },
]);

// Extends public [boundary-13]: "/" alone as first or last input.
joinRelativeURLCases("boundary-13", [
  { input: ["/", "/"], out: "/", extends: "[boundary-13] joinRelativeURL(\"/\")" },
  { input: ["/", "/", "/"], out: "/", extends: "[boundary-13] joinRelativeURL(\"/\")" },
  { input: ["/", "a", "/"], out: "/a/", extends: "[boundary-13] joinRelativeURL(\"/\", \"./\")" },
  { input: ["a", "/"], out: "a/", extends: "[boundary-13] joinRelativeURL(\"/\", \"./\")" },
  { input: ["/", "b"], out: "/b", extends: "[boundary-13] joinRelativeURL(\"/\")" },
  { input: ["./", "/"], out: "./", extends: "[boundary-13] joinRelativeURL(\"/\", \"./\")" },
]);

// Extends public [unhappy-2]: falsy values in every position, and in runs.
// Shortcut caught: picking "first"/"last" before dropping falsy inputs.
joinRelativeURLCases("unhappy-2", [
  { input: [undefined], out: "", extends: "[unhappy-2] joinRelativeURL(\"\")" },
  { input: [null, null], out: "", extends: "[unhappy-2] joinRelativeURL(\"\", \"\")" },
  { input: [undefined, "a/", null], out: "a/", extends: "[unhappy-2] joinRelativeURL(\"a/\", \"\")" },
  { input: ["", "", "a", "", "b", ""], out: "a/b", extends: "[unhappy-2] joinRelativeURL(\"a\", \"b\", \"\")" },
  { input: [null, "./", undefined], out: "./", extends: "[unhappy-2] joinRelativeURL(undefined, \"./a\")" },
  { input: ["a", undefined, "/"], out: "a/", extends: "[unhappy-2] joinRelativeURL(\"a\", \"\", \"b/\")" },
  { input: ["a", "b/", ""], out: "a/b/", extends: "[unhappy-2] joinRelativeURL(\"a\", \"b\", \"\")" },
  { input: [undefined, "/a", "../b", null], out: "/b", extends: "[unhappy-2] joinRelativeURL(null, \"/a\", undefined)" },
  { input: ["", "./a/", ""], out: "./a/", extends: "[unhappy-2] joinRelativeURL(undefined, \"./a\")" },
]);
