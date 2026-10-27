import { expect, test } from "vitest";
import { joinRelativeURL, joinURL, withBase } from "../src/utils";

type Row = { input: (string | undefined | null)[]; out: string };

const fmt = (input: Row["input"]) =>
  input.map((i) => (i === undefined ? "undefined" : JSON.stringify(i))).join(", ");

function joinURLCases(key: string, rows: Row[]) {
  for (const t of rows) {
    test(`[${key}] joinURL(${fmt(t.input)}) === ${JSON.stringify(t.out)}`, () => {
      expect(joinURL(...(t.input as [string, ...string[]]))).toBe(t.out);
    });
  }
}

function joinRelativeURLCases(key: string, rows: Row[]) {
  for (const t of rows) {
    test(`[${key}] joinRelativeURL(${fmt(t.input)}) === ${JSON.stringify(t.out)}`, () => {
      expect(joinRelativeURL(...(t.input as string[]))).toBe(t.out);
    });
  }
}

function withBaseCases(
  key: string,
  rows: { input: string; base: string; out: string }[],
) {
  for (const t of rows) {
    test(`[${key}] withBase(${JSON.stringify(t.input)}, ${JSON.stringify(t.base)}) === ${JSON.stringify(t.out)}`, () => {
      expect(withBase(t.input, t.base)).toBe(t.out);
    });
  }
}

// joinURL: plain join

joinURLCases("happy-1", [
  { input: ["a", "b"], out: "a/b" },
  { input: ["a", "b", "c"], out: "a/b/c" },
  { input: ["/a"], out: "/a" },
  { input: ["a/b", "c/d"], out: "a/b/c/d" },
  { input: ["a", "b/", "c"], out: "a/b/c" },
  { input: ["a", "b/", "/c"], out: "a/b/c" },
  { input: ["/", "/b"], out: "/b" },
  { input: ["a/", "b"], out: "a/b" },
  { input: ["http://x.com", "b"], out: "http://x.com/b" },
  { input: ["http://x.com/", "/b"], out: "http://x.com/b" },
]);

joinURLCases("happy-2", [
  { input: ["a", "b/"], out: "a/b/" },
  { input: ["a", "/b/"], out: "a/b/" },
  { input: ["/", "./foo/"], out: "/foo/" },
]);

joinURLCases("happy-3", [
  { input: ["./", "a"], out: "./a" },
  { input: ["./a", "./b"], out: "./a/b" },
  { input: ["a/", "./b"], out: "a/b" },
  { input: ["/", "./foo"], out: "/foo" },
  { input: ["/", "./foo", "bar"], out: "/foo/bar" },
  { input: ["/", "./"], out: "/" },
  { input: ["a", "./"], out: "a/" },
]);

joinURLCases("boundary-1", [
  { input: ["a", "//b"], out: "a//b" },
  { input: ["a", "././b"], out: "a/./b" },
  { input: ["a", "/./b"], out: "a/./b" },
  { input: ["a", "b//c"], out: "a/b//c" },
]);

joinURLCases("boundary-2", [
  { input: ["/a", "../b"], out: "/a/../b" },
  { input: ["a", ".."], out: "a/.." },
  { input: ["a", "."], out: "a/." },
  { input: ["/a/b/c", "../../d"], out: "/a/b/c/../../d" },
]);

joinURLCases("boundary-3", [
  { input: ["/a?x=1", "b"], out: "/a?x=1/b" },
  { input: ["/a#h", "b"], out: "/a#h/b" },
]);

joinURLCases("boundary-4", [
  { input: ["a", ""], out: "a" },
  { input: ["a", "/"], out: "a" },
  { input: ["a/", "/"], out: "a/" },
  { input: ["/a", "/"], out: "/a" },
  { input: ["a", "/", "b"], out: "a/b" },
  { input: ["", ""], out: "" },
]);

joinURLCases("boundary-5", [
  { input: ["/"], out: "/" },
  { input: ["/", "/"], out: "/" },
  { input: ["/", ""], out: "/" },
]);

joinURLCases("unhappy-1", [
  { input: [], out: "" },
  { input: [""], out: "" },
  { input: [undefined], out: "" },
  { input: [undefined, "./"], out: "./" },
  { input: [undefined, "a", "b"], out: "a/b" },
  { input: ["", "/a"], out: "/a" },
  { input: [null, "/a"], out: "/a" },
]);

// joinRelativeURL: relative-aware join

joinRelativeURLCases("happy-4", [
  { input: ["a", "b"], out: "a/b" },
  { input: ["/a"], out: "/a" },
  { input: ["a", "/b"], out: "a/b" },
  { input: ["/", "/b"], out: "/b" },
  { input: ["/", "a"], out: "/a" },
  { input: ["a", "b/", "c"], out: "a/b/c" },
  { input: ["a", "b/", "/c"], out: "a/b/c" },
  { input: ["/", "./foo"], out: "/foo" },
  { input: ["/", "./foo", "bar"], out: "/foo/bar" },
]);

joinRelativeURLCases("happy-5", [
  { input: ["/a", "../b"], out: "/b" },
  { input: ["/a/b/c", "../../d"], out: "/a/d" },
  { input: ["/a", "../b", "./c"], out: "/b/c" },
  { input: ["/a/b", "./c/../d"], out: "/a/b/d" },
  { input: ["/a", "b", ".."], out: "/a" },
]);

joinRelativeURLCases("happy-6", [
  { input: ["./", "a"], out: "./a" },
  { input: ["./a", "./b"], out: "./a/b" },
  { input: ["./a"], out: "./a" },
  { input: ["./a", "../b"], out: "./b" },
  { input: ["./", "./"], out: "./" },
  { input: ["./a", ".."], out: "./" },
]);

joinRelativeURLCases("boundary-6", [
  { input: ["/a", "../../d"], out: "/d" },
  { input: ["/a", ".././../d"], out: "/d" },
  { input: ["/a/b", "../../../d"], out: "/d" },
  { input: ["/a", ".."], out: "/" },
  { input: ["./a", "../../b"], out: "./b" },
]);

joinRelativeURLCases("boundary-7", [
  { input: ["/a", "../../../d"], out: "../d" },
  { input: ["/a", "../../../d/"], out: "../d/" },
  { input: ["../a", "./../../b"], out: "../b" },
  { input: ["../a", "../../../b"], out: "../../b" },
  { input: ["../a", "../../../../b"], out: "../../../b" },
  { input: ["./a", "../.."], out: "../" },
  { input: [".."], out: "../" },
  { input: ["../"], out: "../" },
]);

joinRelativeURLCases("boundary-8", [
  { input: ["../a"], out: "a" },
  { input: ["../a", "b"], out: "a/b" },
  { input: ["../a", "../b"], out: "b" },
  { input: ["../a", "./../b"], out: "b" },
  { input: ["../a/", "../b"], out: "b" },
  { input: ["a/b/../../..", "c"], out: "c" },
]);

joinRelativeURLCases("boundary-9", [
  { input: ["a", ".."], out: "" },
  { input: ["a", "../"], out: "/" },
  { input: ["/a", "../"], out: "/" },
  { input: ["."], out: "" },
  { input: [".", "a"], out: "a" },
]);

joinRelativeURLCases("boundary-10", [
  { input: ["a//b"], out: "a/b" },
  { input: ["a/./b"], out: "a/b" },
  { input: ["a/", "/b/", "c//"], out: "a/b/c/" },
  { input: ["//"], out: "/" },
  { input: ["http://x.com", "b"], out: "http:/x.com/b" },
]);

joinRelativeURLCases("boundary-11", [
  { input: ["a", "...", "b"], out: "a/.../b" },
  { input: ["a\\b", ".."], out: "" },
  { input: ["/a?x=1", "../b"], out: "/b" },
  { input: ["/a#h", "../b"], out: "/b" },
  { input: ["/a b", "c"], out: "/a b/c" },
]);

joinRelativeURLCases("boundary-12", [
  { input: ["a/"], out: "a/" },
  { input: ["a", "b/"], out: "a/b/" },
  { input: ["/a", "./b/"], out: "/a/b/" },
  { input: ["/", "./foo/"], out: "/foo/" },
  { input: ["/", "a/"], out: "/a/" },
  { input: ["a", "b", "/"], out: "a/b/" },
  { input: ["/a", "b", "../"], out: "/a/" },
  { input: ["a/", "b"], out: "a/b" },
]);

joinRelativeURLCases("boundary-13", [
  { input: ["/"], out: "/" },
  { input: ["/", "./"], out: "/" },
]);

joinRelativeURLCases("unhappy-2", [
  { input: [], out: "" },
  { input: [""], out: "" },
  { input: ["", ""], out: "" },
  { input: ["", "/a"], out: "/a" },
  { input: [undefined, "./a"], out: "./a" },
  { input: [null, "/a", undefined], out: "/a" },
  { input: ["a/", ""], out: "a/" },
  { input: ["a", "b", ""], out: "a/b" },
  { input: ["a", "", "b/"], out: "a/b/" },
]);

// withBase: now built on the plain joinURL

withBaseCases("happy-7", [
  { input: "/bar", base: "/foo", out: "/foo/bar" },
  { input: "", base: "/foo", out: "/foo" },
  { input: "/", base: "/foo/", out: "/foo/" },
  { input: "/base", base: "/base/", out: "/base" },
]);

withBaseCases("boundary-14", [
  { input: "../bar", base: "/foo", out: "/foo/../bar" },
]);
