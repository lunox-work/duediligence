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

// --- An alias matches when the path equals its target or continues it past a "/" ---

it("[happy-1] each normalised target maps back to its alias", () => {
  expect(reverseResolveAlias("@foo/bar/dist/index.mjs", fixture)).toEqual([
    "@foo/bar",
  ]);
  expect(reverseResolveAlias("@foo/bar/dist/utils.mjs", fixture)).toEqual([
    "@foo/bar/utils",
  ]);
  expect(reverseResolveAlias("/root", fixture)).toEqual(["@"]);
  expect(reverseResolveAlias("@bingpot/index.ts", fixture)).toEqual(["test"]);
  expect(reverseResolveAlias("/src", fixture)).toEqual(["~/"]);
  expect(reverseResolveAlias("C:/root/index.js", fixture)).toEqual(["~win"]);
  expect(reverseResolveAlias("C:/src", fixture)).toEqual(["~win/"]);
});

it("[happy-1] a target nested under another target maps back to both aliases", () => {
  expect(reverseResolveAlias("/root/bingpot/index.ts", fixture)).toEqual([
    "@/bingpot/index.ts",
    "bingpot",
  ]);
  expect(reverseResolveAlias("/root/index.js", fixture)).toEqual([
    "@/index.js",
    "~",
  ]);
});

it("[happy-2] the rest of the path is joined after the alias", () => {
  expect(reverseResolveAlias("/src/foo/bar", fixture)).toEqual(["~/foo/bar"]);
  expect(reverseResolveAlias("/root/a/b.ts", fixture)).toEqual(["@/a/b.ts"]);
});

it("[happy-2] the rest is joined after a drive-letter target", () => {
  expect(reverseResolveAlias("C:/src/foo/bar", fixture)).toEqual([
    "~win/foo/bar",
  ]);
});

it("[happy-3] every matching alias is returned", () => {
  const aliases = { "~": "/root", "~assets": "/root/some/dir" };
  expect(reverseResolveAlias("/root/some/dir/smth.jpg", aliases)).toEqual([
    "~/some/dir/smth.jpg",
    "~assets/smth.jpg",
  ]);
});

it("[happy-3] a path equal to the deeper target is returned under both aliases", () => {
  const aliases = { "~": "/root", "~assets": "/root/some/dir" };
  expect(reverseResolveAlias("/root/some/dir", aliases)).toEqual([
    "~/some/dir",
    "~assets",
  ]);
});

it("[boundary-1] a target does not match a path that continues it without a slash", () => {
  expect(reverseResolveAlias("/srcfoo/bar", fixture)).toEqual([]);
  expect(reverseResolveAlias("/rootfoo", fixture)).toEqual([]);
  expect(reverseResolveAlias("/root2/x.js", fixture)).toEqual([]);
});

it("[boundary-1] a target extended without a slash is skipped while a shorter target still matches", () => {
  expect(reverseResolveAlias("/root/index.jsx", fixture)).toEqual([
    "@/index.jsx",
  ]);
});

it("[boundary-2] the root target matches an absolute path", () => {
  expect(reverseResolveAlias("/a/b", { r: "/" })).toEqual(["r/a/b"]);
});

it("[boundary-2] the root target matches '/' itself but not a relative path", () => {
  expect(reverseResolveAlias("/", { r: "/" })).toEqual(["r"]);
  expect(reverseResolveAlias("a/b", { r: "/" })).toEqual([]);
});

it("[boundary-3] a path that is already aliased is not matched against targets", () => {
  expect(reverseResolveAlias("~/y", { "~": "/x" })).toEqual([]);
});

it("[boundary-3] a bare alias key as the path gives []", () => {
  expect(reverseResolveAlias("~", { "~": "/x" })).toEqual([]);
});

// --- When nothing matches, the result is an empty array ---

it("[unhappy-1] paths outside every alias target give []", () => {
  expect(reverseResolveAlias("foo/bar.js", fixture)).toEqual([]);
  expect(reverseResolveAlias("./bar.js", fixture)).toEqual([]);
  expect(reverseResolveAlias("/other/x", fixture)).toEqual([]);
});

it("[unhappy-1] a path that is a strict prefix of a target gives []", () => {
  expect(reverseResolveAlias("@foo/bar/dist", fixture)).toEqual([]);
  expect(reverseResolveAlias("/sr", fixture)).toEqual([]);
});

it("[unhappy-2] an empty path gives []", () => {
  expect(reverseResolveAlias("", fixture)).toEqual([]);
});

it("[unhappy-2] an empty path gives [] even with a root target", () => {
  expect(reverseResolveAlias("", { r: "/" })).toEqual([]);
});

it("[unhappy-3] an empty alias map gives []", () => {
  expect(reverseResolveAlias("/x/y", {})).toEqual([]);
});

it("[unhappy-3] an empty alias map with an empty path gives []", () => {
  expect(reverseResolveAlias("", {})).toEqual([]);
});

it("[unhappy-4] matching is case-sensitive", () => {
  expect(reverseResolveAlias("/ROOT/a", fixture)).toEqual([]);
});

it("[unhappy-4] only the drive letter is case-normalised, not the rest of the path", () => {
  expect(reverseResolveAlias("c:/SRC/foo", fixture)).toEqual([]);
});

it("[boundary-4] an empty target matches every absolute path", () => {
  const aliases = { e: "", "~": "/x" };
  expect(reverseResolveAlias("/x/y", aliases)).toEqual(["e/x/y", "~/y"]);
});

it("[boundary-4] an empty target matches the empty path and '/' but not a relative path", () => {
  const aliases = { e: "", "~": "/x" };
  expect(reverseResolveAlias("", aliases)).toEqual(["e"]);
  expect(reverseResolveAlias("/", aliases)).toEqual(["e/"]);
  expect(reverseResolveAlias("x", aliases)).toEqual([]);
});

// --- Only backslashes and the drive letter of the input path are normalised ---

it("[happy-4] Windows separators in the path are normalised", () => {
  expect(reverseResolveAlias("C:\\src\\foo\\bar", fixture)).toEqual([
    "~win/foo/bar",
  ]);
});

it("[happy-4] a lower-case drive letter in the path is normalised", () => {
  expect(reverseResolveAlias("c:/src/foo", fixture)).toEqual(["~win/foo"]);
});

it("[happy-5] a dot segment is not resolved before matching but is collapsed in the result", () => {
  expect(reverseResolveAlias("/root/./index.js", fixture)).toEqual([
    "@/index.js",
  ]);
});

it("[happy-5] repeated slashes and '..' in the rest are collapsed by join", () => {
  expect(reverseResolveAlias("/src//foo", fixture)).toEqual(["~/foo"]);
  expect(reverseResolveAlias("/root/../etc/passwd", fixture)).toEqual([
    "etc/passwd",
  ]);
});

it("[boundary-5] a target with forward slashes matches a backslashed path", () => {
  expect(reverseResolveAlias("C:\\x\\y", { w: "C:/x" })).toEqual(["w/y"]);
});

it("[boundary-5] backslashes and dot segments in targets are not normalised", () => {
  expect(reverseResolveAlias("C:\\x\\y", { w: "C:\\x" })).toEqual([]);
  expect(reverseResolveAlias("/x/y", { w: "C:\\x" })).toEqual([]);
  expect(reverseResolveAlias("/x/y", { k: "/x/./" })).toEqual([]);
  expect(reverseResolveAlias("/x/y", { k: "/z/../x" })).toEqual([]);
});

it("[happy-6] targets are first resolved against each other by normalizeAliases", () => {
  const aliases = { "@": "/root", bingpot: "@/bingpot/index.ts" };
  expect(reverseResolveAlias("/root/bingpot/index.ts", aliases)).toEqual([
    "@/bingpot/index.ts",
    "bingpot",
  ]);
});

it("[happy-6] the unresolved spelling of a target is not matched", () => {
  const aliases = { "@": "/root", bingpot: "@/bingpot/index.ts" };
  expect(reverseResolveAlias("@/bingpot/index.ts", aliases)).toEqual([]);
});

// --- A trailing slash on a target must be present in the path ---

it("[boundary-6] a target with a trailing slash matches paths containing that slash", () => {
  expect(reverseResolveAlias("/x/", { t: "/x/" })).toEqual(["t"]);
  expect(reverseResolveAlias("/x/y", { t: "/x/" })).toEqual(["t/y"]);
});

it("[boundary-6] a target with a trailing slash does not match the bare directory", () => {
  expect(reverseResolveAlias("/x", { t: "/x/" })).toEqual([]);
});

it("[boundary-7] a trailing slash on the path is kept in the result", () => {
  expect(reverseResolveAlias("/src/foo/bar/", fixture)).toEqual([
    "~/foo/bar/",
  ]);
});

it("[boundary-7] a path that is a target plus a trailing slash keeps the slash", () => {
  expect(reverseResolveAlias("/root/", fixture)).toEqual(["@/"]);
  expect(reverseResolveAlias("/src/", fixture)).toEqual(["~/"]);
});

it("[boundary-8] the alias is used as written, including its own trailing slash", () => {
  expect(reverseResolveAlias("/src", { "~/": "/src" })).toEqual(["~/"]);
});

it("[boundary-8] an alias with a trailing slash is joined to the rest without doubling the slash", () => {
  expect(reverseResolveAlias("/src/a", { "~/": "/src" })).toEqual(["~/a"]);
});

// --- Results are sorted longest first; ties keep order; duplicates are kept ---

it("[happy-7] less specific aliases come first because they give longer results", () => {
  const aliases = { "@": "/p", "@a": "/p/a", "@b": "/p/a/b" };
  expect(reverseResolveAlias("/p/a/b/c", aliases)).toEqual([
    "@/a/b/c",
    "@a/b/c",
    "@b/c",
  ]);
});

it("[happy-7] a path equal to a middle target sorts its two matches longest first", () => {
  const aliases = { "@": "/p", "@a": "/p/a", "@b": "/p/a/b" };
  expect(reverseResolveAlias("/p/a", aliases)).toEqual(["@/a", "@a"]);
});

it("[boundary-9] results of equal length keep the alias map's order", () => {
  expect(reverseResolveAlias("/x/y", { b: "/x", a: "/x" })).toEqual([
    "b/y",
    "a/y",
  ]);
});

it("[boundary-9] bare aliases of equal length keep the alias map's order", () => {
  expect(reverseResolveAlias("/x", { b: "/x", a: "/x" })).toEqual(["b", "a"]);
});

it("[boundary-10] two aliases that produce the same result both appear", () => {
  expect(reverseResolveAlias("/x/y", { "~": "/x", "~/": "/x" })).toEqual([
    "~/y",
    "~/y",
  ]);
});

it("[boundary-10] two aliases that produce the same trailing-slash result both appear", () => {
  expect(reverseResolveAlias("/x/", { "~": "/x", "~/": "/x" })).toEqual([
    "~/",
    "~/",
  ]);
});

// --- The alias map is never changed and repeated calls give equal results ---

it("[happy-8] a frozen alias map is accepted and left unchanged", () => {
  const aliases = Object.freeze({ "~": "/x" });
  expect(reverseResolveAlias("/x/y", aliases)).toEqual(["~/y"]);
  expect(aliases).toEqual({ "~": "/x" });
});

it("[happy-8] an alias map whose targets normalizeAliases rewrites is left unchanged", () => {
  const aliases = { bingpot: "@/bingpot/index.ts", "@": "/root" };
  expect(reverseResolveAlias("/root/bingpot/index.ts", aliases)).toEqual([
    "@/bingpot/index.ts",
    "bingpot",
  ]);
  expect(Object.entries(aliases)).toEqual([
    ["bingpot", "@/bingpot/index.ts"],
    ["@", "/root"],
  ]);
});

it("[happy-9] an already-normalised map gives the same result as the raw map", () => {
  const raw = reverseResolveAlias("/src/foo", fixture);
  const normalised = reverseResolveAlias("/src/foo", normalizeAliases(fixture));
  expect(raw).toEqual(["~/foo"]);
  expect(normalised).toEqual(["~/foo"]);
  expect(raw).not.toBe(normalised);
});

it("[happy-9] repeated calls with no match return distinct empty arrays", () => {
  const first = reverseResolveAlias("/other/x", fixture);
  const second = reverseResolveAlias("/other/x", fixture);
  expect(first).toEqual([]);
  expect(second).toEqual([]);
  expect(first).not.toBe(second);
});

// --- Existing exports keep their behaviour ---

it("[happy-10] resolveAlias is unchanged", () => {
  expect(resolveAlias("~/foo/bar", fixture)).toBe("/src/foo/bar");
  expect(resolveAlias("~win/foo/bar", fixture)).toBe("C:/src/foo/bar");
});

it("[happy-10] resolveAlias still returns an unaliased path unchanged", () => {
  expect(resolveAlias("foo/bar.js", fixture)).toBe("foo/bar.js");
});
