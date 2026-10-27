import { expect, it } from "vitest";

import {
  normalizeAliases,
  resolveAlias,
  reverseResolveAlias,
} from "../src/utils";

const fixture = {
  "@foo/bar": "@foo/bar/dist/index.mjs",
  "@foo/bar/utils": "@foo/bar/dist/utils.mjs",
  "@": "/root",
  bingpot: "@/bingpot/index.ts",
  test: "@bingpot/index.ts",
  "~": "/root/index.js",
  "~/": "/src",
  "~win": "C:/root/index.js",
  "~win/": "C:/src",
};

function expectReverse(
  cases: Record<string, string[]>,
  aliases: Record<string, string> = fixture,
) {
  for (const [path, result] of Object.entries(cases)) {
    expect(reverseResolveAlias(path, aliases), path).toEqual(result);
  }
}

// --- @happy ---

it("[happy-1] each normalised target maps back to its alias", () => {
  expectReverse({
    "@foo/bar/dist/index.mjs": ["@foo/bar"],
    "@foo/bar/dist/utils.mjs": ["@foo/bar/utils"],
    "/root": ["@"],
    "@bingpot/index.ts": ["test"],
    "/src": ["~/"],
  });
});

it("[happy-1] targets that are also under another target map back to every alias", () => {
  expectReverse({
    "/root/bingpot/index.ts": ["bingpot", "@/bingpot/index.ts"],
    "/root/index.js": ["~", "@/index.js"],
    "C:/root/index.js": ["~win"],
    "C:/src": ["~win/"],
  });
});

it("[happy-2] the rest of the path is joined after the alias", () => {
  expectReverse({
    "/src/foo/bar": ["~/foo/bar"],
    "/root/a/b.ts": ["@/a/b.ts"],
  });
});

it("[happy-2] the rest is joined after a Windows alias and after a file-like target", () => {
  expectReverse({
    "C:/src/foo/bar": ["~win/foo/bar"],
    "/root/index.js/x": ["~/x", "@/index.js/x"],
  });
});

it("[happy-3] every matching alias is returned", () => {
  const aliases = { "~": "/root", "~assets": "/root/some/dir" };
  expect(reverseResolveAlias("/root/some/dir/smth.jpg", aliases)).toEqual([
    "~assets/smth.jpg",
    "~/some/dir/smth.jpg",
  ]);
});

it("[happy-3] a path equal to the more specific target also matches the general alias", () => {
  const aliases = { "~": "/root", "~assets": "/root/some/dir" };
  expect(reverseResolveAlias("/root/some/dir", aliases)).toEqual([
    "~assets",
    "~/some/dir",
  ]);
});

it("[happy-4] windows separators in the path are normalised", () => {
  expectReverse({
    "C:\\src\\foo\\bar": ["~win/foo/bar"],
  });
});

it("[happy-4] a lower-case drive letter in the path is normalised", () => {
  expectReverse({
    "c:/src/foo": ["~win/foo"],
    "c:\\src": ["~win/"],
  });
});

it("[happy-5] dot segments and repeated slashes in the path are resolved before matching", () => {
  expectReverse({
    "/root/./index.js": ["~", "@/index.js"],
    "/src//foo": ["~/foo"],
  });
});

it("[happy-5] a .. segment that leaves every target gives []", () => {
  expectReverse({
    "/root/../etc/passwd": [],
  });
});

it("[happy-6] targets are normalised the same way as the path", () => {
  expect(reverseResolveAlias("C:\\x\\y", { w: "C:\\x" })).toEqual(["w/y"]);
  expect(reverseResolveAlias("/x/y", { k: "/x/./" })).toEqual(["k/y"]);
  expect(reverseResolveAlias("/x/y", { k: "/z/../x" })).toEqual(["k/y"]);
});

it("[happy-6] a normalised drive-letter target does not match a posix path", () => {
  expect(reverseResolveAlias("/x/y", { w: "C:\\x" })).toEqual([]);
});

it("[happy-7] targets are first resolved against each other by normalizeAliases", () => {
  const aliases = { "@": "/root", bingpot: "@/bingpot/index.ts" };
  expect(reverseResolveAlias("/root/bingpot/index.ts", aliases)).toEqual([
    "bingpot",
    "@/bingpot/index.ts",
  ]);
});

it("[happy-7] the unresolved spelling of a target is not matched", () => {
  const aliases = { "@": "/root", bingpot: "@/bingpot/index.ts" };
  expect(reverseResolveAlias("@/bingpot/index.ts", aliases)).toEqual([]);
});

it("[happy-8] more specific aliases come first because they give shorter results", () => {
  const aliases = { "@": "/p", "@a": "/p/a", "@b": "/p/a/b" };
  expect(reverseResolveAlias("/p/a/b/c", aliases)).toEqual([
    "@b/c",
    "@a/b/c",
    "@/a/b/c",
  ]);
});

it("[happy-8] a path equal to the most specific target sorts that bare alias first", () => {
  const aliases = { "@": "/p", "@a": "/p/a", "@b": "/p/a/b" };
  expect(reverseResolveAlias("/p/a/b", aliases)).toEqual([
    "@b",
    "@a/b",
    "@/a/b",
  ]);
});

it("[happy-9] a frozen alias map is accepted and left unchanged", () => {
  const aliases = Object.freeze({ "~": "/x" });
  expect(reverseResolveAlias("/x/y", aliases)).toEqual(["~/y"]);
  expect(aliases).toEqual({ "~": "/x" });
});

it("[happy-9] a frozen alias map whose targets refer to each other is left unchanged", () => {
  const aliases = Object.freeze({
    "@": "/root",
    bingpot: "@/bingpot/index.ts",
  });
  expect(reverseResolveAlias("/root/bingpot/index.ts", aliases)).toEqual([
    "bingpot",
    "@/bingpot/index.ts",
  ]);
  expect(aliases).toEqual({ "@": "/root", bingpot: "@/bingpot/index.ts" });
});

it("[happy-10] an already-normalised map gives the same result as the raw map", () => {
  const fromRaw = reverseResolveAlias("/src/foo", fixture);
  const fromNormalized = reverseResolveAlias(
    "/src/foo",
    normalizeAliases(fixture),
  );
  expect(fromRaw).toEqual(["~/foo"]);
  expect(fromNormalized).toEqual(["~/foo"]);
  expect(fromRaw).not.toBe(fromNormalized);
});

it("[happy-10] repeated calls with no match return distinct empty arrays", () => {
  const aliases = normalizeAliases(fixture);
  const first = reverseResolveAlias("/other/x", aliases);
  const second = reverseResolveAlias("/other/x", aliases);
  expect(first).toEqual([]);
  expect(second).toEqual([]);
  expect(first).not.toBe(second);
});

it("[happy-11] resolveAlias is unchanged", () => {
  expect(resolveAlias("~/foo/bar", fixture)).toBe("/src/foo/bar");
  expect(resolveAlias("~win/foo/bar", fixture)).toBe("C:/src/foo/bar");
});

it("[happy-11] resolveAlias still returns an unaliased path unchanged", () => {
  expect(resolveAlias("foo/bar.js", fixture)).toBe("foo/bar.js");
});

// --- @boundary ---

it("[boundary-1] a target only matches at a segment boundary", () => {
  expectReverse({
    "/srcfoo/bar": [],
    "/rootfoo": [],
    "/root2/x.js": [],
  });
});

it("[boundary-1] a target continued by more characters falls back to the shorter target", () => {
  expectReverse({
    "/root/index.jsx": ["@/index.jsx"],
  });
});

it("[boundary-2] the root target / matches every absolute path", () => {
  expect(reverseResolveAlias("/a/b", { r: "/" })).toEqual(["r/a/b"]);
});

it("[boundary-2] the root target / matches / itself but not a relative path", () => {
  expect(reverseResolveAlias("/", { r: "/" })).toEqual(["r/"]);
  expect(reverseResolveAlias("a/b", { r: "/" })).toEqual([]);
});

it("[boundary-3] a path that is already aliased is not matched against targets", () => {
  expect(reverseResolveAlias("~/y", { "~": "/x" })).toEqual([]);
});

it("[boundary-3] a path equal to an alias key is not matched against targets", () => {
  expect(reverseResolveAlias("~", { "~": "/x" })).toEqual([]);
});

it("[boundary-4] a target with a trailing slash matches paths below it", () => {
  expect(reverseResolveAlias("/x/y", { t: "/x/" })).toEqual(["t/y"]);
});

it("[boundary-4] a target with a trailing slash also matches the bare directory", () => {
  expect(reverseResolveAlias("/x", { t: "/x/" })).toEqual(["t"]);
  expect(reverseResolveAlias("/x/", { t: "/x/" })).toEqual(["t/"]);
  expect(reverseResolveAlias("/xy", { t: "/x/" })).toEqual([]);
});

it("[boundary-5] a trailing slash on the path is kept in the result", () => {
  expectReverse({
    "/src/foo/bar/": ["~/foo/bar/"],
  });
});

it("[boundary-5] a path that is a target plus a trailing slash keeps the slash", () => {
  expectReverse({
    "/root/": ["@/"],
    "/src/": ["~/"],
  });
});

it("[boundary-6] the alias is used as written, including its own trailing slash", () => {
  expect(reverseResolveAlias("/src", { "~/": "/src" })).toEqual(["~/"]);
});

it("[boundary-6] an alias with a trailing slash is not doubled when the rest is joined", () => {
  expect(reverseResolveAlias("/src/a", { "~/": "/src" })).toEqual(["~/a"]);
});

it("[boundary-7] results of equal length keep the alias map's order", () => {
  expect(reverseResolveAlias("/x/y", { b: "/x", a: "/x" })).toEqual([
    "b/y",
    "a/y",
  ]);
});

it("[boundary-7] bare aliases of equal length keep the alias map's order", () => {
  expect(reverseResolveAlias("/x", { b: "/x", a: "/x" })).toEqual(["b", "a"]);
});

it("[boundary-8] two aliases that produce the same result appear once", () => {
  expect(reverseResolveAlias("/x/y", { "~": "/x", "~/": "/x" })).toEqual([
    "~/y",
  ]);
});

it("[boundary-8] two aliases that produce different results both appear", () => {
  expect(reverseResolveAlias("/x", { "~": "/x", "~/": "/x" })).toEqual([
    "~",
    "~/",
  ]);
});

// --- @unhappy ---

it("[unhappy-1] paths outside every alias target give []", () => {
  expectReverse({
    "foo/bar.js": [],
    "./bar.js": [],
    "/other/x": [],
  });
});

it("[unhappy-1] a path that is a parent of a target gives []", () => {
  expectReverse({
    "@foo/bar": [],
    "/": [],
  });
});

it("[unhappy-2] an empty path gives []", () => {
  expect(reverseResolveAlias("", fixture)).toEqual([]);
});

it("[unhappy-2] an empty path gives [] even against the root target", () => {
  expect(reverseResolveAlias("", { r: "/" })).toEqual([]);
});

it("[unhappy-3] an empty alias map gives []", () => {
  expect(reverseResolveAlias("/x/y", {})).toEqual([]);
});

it("[unhappy-3] an empty alias map gives [] for the root path", () => {
  expect(reverseResolveAlias("/", {})).toEqual([]);
});

it("[unhappy-4] matching is case-sensitive", () => {
  expect(reverseResolveAlias("/ROOT/a", fixture)).toEqual([]);
});

it("[unhappy-4] only the drive letter is case-insensitive", () => {
  expect(reverseResolveAlias("c:/root/index.js", fixture)).toEqual(["~win"]);
  expect(reverseResolveAlias("C:/SRC", fixture)).toEqual([]);
});

it("[unhappy-5] an alias with an empty target is ignored", () => {
  expect(reverseResolveAlias("/x/y", { e: "", "~": "/x" })).toEqual(["~/y"]);
});

it("[unhappy-5] a map with only an empty target gives []", () => {
  expect(reverseResolveAlias("/x/y", { e: "" })).toEqual([]);
  expect(reverseResolveAlias("y", { e: "" })).toEqual([]);
});
