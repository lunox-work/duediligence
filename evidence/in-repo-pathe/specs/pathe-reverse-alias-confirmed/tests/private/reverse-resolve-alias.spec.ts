import { expect, it } from "vitest";

import {
  normalizeAliases,
  resolveAlias,
  reverseResolveAlias,
} from "../../src/utils";

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

// Extends "[happy-1] each normalised target maps back to its alias": a map other than the fixture.
it("[happy-1] targets of a map other than the fixture map back to their aliases", () => {
  const aliases = { "#lib": "/opt/lib", "#app": "/opt/app/src" };
  expect(reverseResolveAlias("/opt/lib", aliases)).toEqual(["#lib"]);
  expect(reverseResolveAlias("/opt/app/src", aliases)).toEqual(["#app"]);
});

// Extends "[happy-1] a target nested under another target maps back to both aliases": three levels.
it("[happy-1] a target nested under two other targets maps back to all three aliases", () => {
  const aliases = { a: "/r", b: "/r/s", c: "/r/s/t" };
  expect(reverseResolveAlias("/r/s/t", aliases)).toEqual(["a/s/t", "b/t", "c"]);
});

// Extends "[happy-1] each normalised target maps back to its alias": every entry of the normalised fixture.
it("[happy-1] every normalised fixture target yields a result containing its alias", () => {
  for (const [key, target] of Object.entries(normalizeAliases(fixture))) {
    expect(reverseResolveAlias(target, fixture)).toContain(key);
  }
});

// Extends "[happy-2] the rest of the path is joined after the alias": longer rests, under nested targets.
it("[happy-2] a longer rest is joined after every matching alias", () => {
  expect(reverseResolveAlias("/src/a/b/c/d/e.ts", fixture)).toEqual([
    "~/a/b/c/d/e.ts",
  ]);
  expect(reverseResolveAlias("/root/index.js/x", fixture)).toEqual([
    "@/index.js/x",
    "~/x",
  ]);
  expect(reverseResolveAlias("/root/bingpot/index.ts/x", fixture)).toEqual([
    "@/bingpot/index.ts/x",
    "bingpot/x",
  ]);
});

// Extends "[happy-2] the rest is joined after a drive-letter target": other targets.
it("[happy-2] the rest is joined after a drive-letter file target and a package target", () => {
  expect(reverseResolveAlias("C:/root/index.js/deep/file", fixture)).toEqual([
    "~win/deep/file",
  ]);
  expect(reverseResolveAlias("@foo/bar/dist/index.mjs/sub", fixture)).toEqual([
    "@foo/bar/sub",
  ]);
});

// Extends "[happy-3] every matching alias is returned": more aliases, given in reverse order.
it("[happy-3] every one of several matching aliases is returned and non-matching ones are not", () => {
  const aliases = {
    "~assets": "/root/some/dir",
    "~other": "/other",
    "~some": "/root/some",
    "~": "/root",
  };
  expect(reverseResolveAlias("/root/some/dir/smth.jpg", aliases)).toEqual([
    "~/some/dir/smth.jpg",
    "~some/dir/smth.jpg",
    "~assets/smth.jpg",
  ]);
});

// --- Only backslashes and the drive letter of the input path are normalised ---

// Extends "[happy-4] Windows separators in the path are normalised": a posix target.
it("[happy-4] backslashes in the path match a posix target", () => {
  expect(reverseResolveAlias("\\src\\foo", fixture)).toEqual(["~/foo"]);
  expect(reverseResolveAlias("\\root\\index.js", fixture)).toEqual([
    "@/index.js",
    "~",
  ]);
  expect(reverseResolveAlias("/src\\foo", fixture)).toEqual(["~/foo"]);
});

// Extends "[happy-4] a lower-case drive letter in the path is normalised": combined with backslashes.
it("[happy-4] a lower-case drive letter and backslashes together are normalised", () => {
  expect(reverseResolveAlias("c:\\src\\foo\\bar", fixture)).toEqual([
    "~win/foo/bar",
  ]);
  expect(reverseResolveAlias("C:\\src/foo\\bar", fixture)).toEqual([
    "~win/foo/bar",
  ]);
  expect(reverseResolveAlias("c:\\root\\index.js", fixture)).toEqual(["~win"]);
  expect(reverseResolveAlias("c:\\a", { d: "C:/" })).toEqual(["d/a"]);
});

// Extends "[happy-5] a dot segment is not resolved before matching": repeated slashes inside a target.
it("[happy-5] repeated slashes inside a target spelling stop that target from matching", () => {
  expect(reverseResolveAlias("/root//index.js", fixture)).toEqual([
    "@/index.js",
  ]);
});

// Extends "[happy-5] repeated slashes and '..' in the rest are collapsed by join": '..' that leaves the target.
it("[happy-5] '..' in the rest is collapsed by join, not resolved before matching", () => {
  expect(reverseResolveAlias("/src/../root/index.js", fixture)).toEqual([
    "root/index.js",
  ]);
  expect(reverseResolveAlias("/root/../../x", fixture)).toEqual(["../x"]);
  expect(reverseResolveAlias("/root/a/../b", fixture)).toEqual(["@/b"]);
  expect(reverseResolveAlias("/src/./foo/./bar", fixture)).toEqual([
    "~/foo/bar",
  ]);
});

// Extends "[happy-5] a dot segment is not resolved before matching": a dot segment before the target.
it("[happy-5] a dot segment before the target stops it from matching", () => {
  expect(reverseResolveAlias("/./root/x", fixture)).toEqual([]);
  expect(reverseResolveAlias("//root/x", fixture)).toEqual([]);
});

// Extends "[happy-6] targets are first resolved against each other": a dependent alias listed first.
it("[happy-6] a target written through an alias listed after it is resolved", () => {
  const aliases = { proj: "~/proj", "~": "/home/u" };
  expect(reverseResolveAlias("/home/u/proj/x", aliases)).toEqual([
    "~/proj/x",
    "proj/x",
  ]);
});

// Extends "[happy-6] targets are first resolved against each other": a chain of three aliases.
it("[happy-6] a chain of targets is resolved and every link matches", () => {
  const aliases = { a: "/base", b: "a/x", c: "b/y" };
  expect(reverseResolveAlias("/base/x/y/z", aliases)).toEqual([
    "a/x/y/z",
    "b/y/z",
    "c/z",
  ]);
});

// Extends "[happy-6] the unresolved spelling of a target is not matched".
it("[happy-6] the unresolved spelling of a dependent target is not matched", () => {
  const aliases = { proj: "~/proj", "~": "/home/u" };
  expect(reverseResolveAlias("~/proj/x", aliases)).toEqual([]);
});

// --- Results are sorted longest first ---

// Extends "[happy-7] less specific aliases come first": a long alias on a more specific target.
it("[happy-7] a long alias on a more specific target sorts before a short alias on a less specific one", () => {
  const aliases = { s: "/p", verylongalias: "/p/a" };
  expect(reverseResolveAlias("/p/a/b", aliases)).toEqual([
    "verylongalias/b",
    "s/a/b",
  ]);
});

// Extends "[happy-7] less specific aliases come first": more aliases in scrambled order.
it("[happy-7] many results are sorted by length, not by alias order or alphabetically", () => {
  const aliases = {
    m: "/p/a/b",
    zz: "/p/a/b/c",
    aaaaaaaa: "/p/a",
    b: "/p",
  };
  expect(reverseResolveAlias("/p/a/b/c/d", aliases)).toEqual([
    "aaaaaaaa/b/c/d",
    "b/a/b/c/d",
    "m/c/d",
    "zz/d",
  ]);
});

// --- The alias map is never changed and repeated calls give equal results ---

// Extends "[happy-8] a frozen alias map is accepted and left unchanged": targets that normalizeAliases rewrites.
it("[happy-8] a frozen alias map whose targets normalizeAliases rewrites is accepted and left unchanged", () => {
  const aliases = Object.freeze({ bingpot: "@/bingpot/index.ts", "@": "/root" });
  expect(reverseResolveAlias("/root/bingpot/index.ts", aliases)).toEqual([
    "@/bingpot/index.ts",
    "bingpot",
  ]);
  expect(Object.entries(aliases)).toEqual([
    ["bingpot", "@/bingpot/index.ts"],
    ["@", "/root"],
  ]);
});

// Extends "[happy-8] an alias map whose targets normalizeAliases rewrites is left unchanged": no keys or symbols added.
it("[happy-8] the alias map gains no own properties or symbols", () => {
  const aliases: Record<string, string> = { "~": "/x", "~/": "/y" };
  expect(reverseResolveAlias("/x/y", aliases)).toEqual(["~/y"]);
  expect(Reflect.ownKeys(aliases)).toEqual(["~", "~/"]);
  expect(aliases).toEqual({ "~": "/x", "~/": "/y" });
});

// Extends "[happy-8] a frozen alias map is accepted and left unchanged": the frozen full fixture.
it("[happy-8] the frozen fixture gives the same results as the plain fixture", () => {
  const frozen = Object.freeze({ ...fixture });
  expect(reverseResolveAlias("/root/index.js", frozen)).toEqual([
    "@/index.js",
    "~",
  ]);
  expect(frozen).toEqual(fixture);
});

// Extends "[happy-9] an already-normalised map gives the same result as the raw map": a multi-result path.
it("[happy-9] an already-normalised map gives the same multi-alias result as the raw map", () => {
  const raw = reverseResolveAlias("/root/index.js", fixture);
  const normalised = reverseResolveAlias(
    "/root/index.js",
    normalizeAliases(fixture),
  );
  expect(raw).toEqual(["@/index.js", "~"]);
  expect(normalised).toEqual(["@/index.js", "~"]);
  expect(raw).not.toBe(normalised);
});

// Extends "[happy-9] repeated calls with no match return distinct empty arrays": non-empty results.
it("[happy-9] changing a returned array does not affect the next call", () => {
  const map = normalizeAliases(fixture);
  const first = reverseResolveAlias("/root/bingpot/index.ts", map);
  expect(first).toEqual(["@/bingpot/index.ts", "bingpot"]);
  first.push("extra");
  first.reverse();
  const second = reverseResolveAlias("/root/bingpot/index.ts", map);
  expect(second).toEqual(["@/bingpot/index.ts", "bingpot"]);
  expect(second).not.toBe(first);
});

// --- Existing exports keep their behaviour ---

// Extends "[happy-10] resolveAlias is unchanged": the same map used by reverseResolveAlias first.
it("[happy-10] resolveAlias is unchanged after reverseResolveAlias used the same map", () => {
  expect(reverseResolveAlias("/src/foo/bar", fixture)).toEqual(["~/foo/bar"]);
  expect(resolveAlias("~/foo/bar", fixture)).toBe("/src/foo/bar");
  expect(resolveAlias("~win/foo/bar", fixture)).toBe("C:/src/foo/bar");
  expect(resolveAlias("foo/bar.js", fixture)).toBe("foo/bar.js");
});

// Extends "[happy-10] resolveAlias still returns an unaliased path unchanged": other aliases, frozen map.
it("[happy-10] resolveAlias still resolves other aliases after reverseResolveAlias", () => {
  const frozen = Object.freeze({ ...fixture });
  expect(reverseResolveAlias("/root/a", frozen)).toEqual(["@/a"]);
  expect(resolveAlias("@/a", frozen)).toBe("/root/a");
  expect(resolveAlias("bingpot", frozen)).toBe("/root/bingpot/index.ts");
  expect(resolveAlias("~win/", frozen)).toBe("C:/src");
});

// --- A target only matches at a segment boundary ---

// Extends "[boundary-1] a target does not match a path that continues it without a slash": other targets.
it("[boundary-1] other fixture targets continued without a slash do not match", () => {
  expect(reverseResolveAlias("/src-old/x", fixture)).toEqual([]);
  expect(reverseResolveAlias("C:/srcfoo", fixture)).toEqual([]);
  expect(reverseResolveAlias("C:/root/index.json", fixture)).toEqual([]);
  expect(reverseResolveAlias("@foo/bar/dist/index.mjsx", fixture)).toEqual([]);
  expect(reverseResolveAlias("/root.bak/x", fixture)).toEqual([]);
});

// Extends "[boundary-1] a target extended without a slash is skipped while a shorter target still matches".
it("[boundary-1] a nested target extended without a slash is skipped while its parent matches", () => {
  expect(reverseResolveAlias("/root/bingpot/index.tsx", fixture)).toEqual([
    "@/bingpot/index.tsx",
  ]);
  const aliases = { lib: "/a/b", top: "/a" };
  expect(reverseResolveAlias("/a/bc", aliases)).toEqual(["top/bc"]);
  expect(reverseResolveAlias("/a/b/c", aliases)).toEqual(["top/b/c", "lib/c"]);
});

// Extends "[boundary-2] the root target matches an absolute path": more forms of absolute path.
it("[boundary-2] the root target matches deep, backslashed and double-slash absolute paths", () => {
  const aliases = { r: "/" };
  expect(reverseResolveAlias("/a/b/c/d/", aliases)).toEqual(["r/a/b/c/d/"]);
  expect(reverseResolveAlias("\\a\\b", aliases)).toEqual(["r/a/b"]);
  expect(reverseResolveAlias("//a", aliases)).toEqual(["r/a"]);
});

// Extends "[boundary-2] the root target matches '/' itself but not a relative path": drive-letter and dot paths.
it("[boundary-2] the root target does not match drive-letter or dot-relative paths", () => {
  const aliases = { r: "/" };
  expect(reverseResolveAlias("C:/a", aliases)).toEqual([]);
  expect(reverseResolveAlias("./a", aliases)).toEqual([]);
});

// Extends "[boundary-2] the root target matches an absolute path": next to a more specific target.
it("[boundary-2] the root target matches alongside a more specific target", () => {
  expect(reverseResolveAlias("/a/b", { s: "/a", r: "/" })).toEqual([
    "r/a/b",
    "s/b",
  ]);
});

// Extends "[boundary-3] a path that is already aliased is not matched against targets": fixture aliases.
it("[boundary-3] aliased spellings from the fixture are not matched against targets", () => {
  expect(reverseResolveAlias("~/foo/bar", fixture)).toEqual([]);
  expect(reverseResolveAlias("~win/foo", fixture)).toEqual([]);
  expect(reverseResolveAlias("@/x", fixture)).toEqual([]);
  expect(reverseResolveAlias("bingpot", fixture)).toEqual([]);
});

// Extends "[boundary-3] a bare alias key as the path gives []": longer and backslashed aliased paths.
it("[boundary-3] longer and backslashed aliased paths give []", () => {
  expect(reverseResolveAlias("~/y/z", { "~": "/x" })).toEqual([]);
  expect(reverseResolveAlias("~\\y", { "~": "/x" })).toEqual([]);
});

// --- An alias with an empty target ---

// Extends "[boundary-4] an empty target matches every absolute path": alone, with backslashes.
it("[boundary-4] an empty target alone matches absolute and backslashed paths", () => {
  const aliases = { e: "" };
  expect(reverseResolveAlias("/a/b", aliases)).toEqual(["e/a/b"]);
  expect(reverseResolveAlias("\\a", aliases)).toEqual(["e/a"]);
  expect(reverseResolveAlias("/", aliases)).toEqual(["e/"]);
  expect(reverseResolveAlias("", aliases)).toEqual(["e"]);
});

// Extends "[boundary-4] an empty target matches the empty path and '/' but not a relative path": drive letters.
it("[boundary-4] an empty target does not match drive-letter or dot-relative paths", () => {
  const aliases = { e: "" };
  expect(reverseResolveAlias("C:/a", aliases)).toEqual([]);
  expect(reverseResolveAlias("c:\\a", aliases)).toEqual([]);
  expect(reverseResolveAlias("./a", aliases)).toEqual([]);
});

// Extends "[boundary-4] an empty target matches the empty path": two empty targets.
it("[boundary-4] two empty targets both match, in alias map order", () => {
  const aliases = { f: "", e: "" };
  expect(reverseResolveAlias("", aliases)).toEqual(["f", "e"]);
  expect(reverseResolveAlias("/a", aliases)).toEqual(["f/a", "e/a"]);
});

// --- Targets are not normalised ---

// Extends "[boundary-5] backslashes and dot segments in targets are not normalised": lower-case drive letter.
it("[boundary-5] a lower-case drive letter in a target is not upper-cased", () => {
  expect(reverseResolveAlias("c:/x/y", { w: "c:/x" })).toEqual([]);
  expect(reverseResolveAlias("C:/x/y", { w: "c:/x" })).toEqual([]);
});

// Extends "[boundary-5] backslashes and dot segments in targets are not normalised": the literal spelling matches.
it("[boundary-5] a target with dot segments or repeated slashes matches its literal spelling", () => {
  expect(reverseResolveAlias("/x/../y/z", { k: "/x/../y" })).toEqual(["k/z"]);
  expect(reverseResolveAlias("/y/z", { k: "/x/../y" })).toEqual([]);
  expect(reverseResolveAlias("/x//y", { k: "/x//" })).toEqual(["k/y"]);
  expect(reverseResolveAlias("/x/y", { k: "/x//" })).toEqual([]);
  expect(reverseResolveAlias("/x/./a", { k: "/x/." })).toEqual(["k/a"]);
  expect(reverseResolveAlias("/x/a", { k: "/x/." })).toEqual([]);
});

// --- A trailing slash on a target must be present in the path ---

// Extends "[boundary-6] a target with a trailing slash matches paths containing that slash": deeper and backslashed.
it("[boundary-6] a target with a trailing slash matches deeper and backslashed paths", () => {
  const aliases = { t: "/x/" };
  expect(reverseResolveAlias("/x/y/z", aliases)).toEqual(["t/y/z"]);
  expect(reverseResolveAlias("\\x\\", aliases)).toEqual(["t"]);
  expect(reverseResolveAlias("/x//", aliases)).toEqual(["t/"]);
  expect(reverseResolveAlias("/xy", aliases)).toEqual([]);
});

// Extends "[boundary-6] a target with a trailing slash does not match the bare directory": next to the slash-less target.
it("[boundary-6] only the slash-less target matches the bare directory", () => {
  const aliases = { t: "/x/", u: "/x" };
  expect(reverseResolveAlias("/x", aliases)).toEqual(["u"]);
  expect(reverseResolveAlias("/x/", aliases)).toEqual(["u/", "t"]);
});

// Extends "[boundary-6] a target with a trailing slash does not match the bare directory": a drive root target.
it("[boundary-6] a drive root target does not match the bare drive", () => {
  expect(reverseResolveAlias("C:", { d: "C:/" })).toEqual([]);
  expect(reverseResolveAlias("C:/", { d: "C:/" })).toEqual(["d"]);
});

// Extends "[boundary-7] a trailing slash on the path is kept in the result": nested targets and drive letters.
it("[boundary-7] a trailing slash is kept for every matching alias", () => {
  expect(reverseResolveAlias("/root/index.js/", fixture)).toEqual([
    "@/index.js/",
    "~/",
  ]);
  expect(reverseResolveAlias("/root/a/", fixture)).toEqual(["@/a/"]);
  expect(reverseResolveAlias("C:/src/foo/", fixture)).toEqual(["~win/foo/"]);
  expect(reverseResolveAlias("C:\\src\\", fixture)).toEqual(["~win/"]);
});

// Extends "[boundary-8] the alias is used as written, including its own trailing slash": a scoped package alias.
it("[boundary-8] a scoped alias with a trailing slash is kept as written", () => {
  const aliases = { "@scope/pkg/": "/node_modules/pkg" };
  expect(reverseResolveAlias("/node_modules/pkg", aliases)).toEqual([
    "@scope/pkg/",
  ]);
  expect(reverseResolveAlias("/node_modules/pkg/a", aliases)).toEqual([
    "@scope/pkg/a",
  ]);
  expect(reverseResolveAlias("C:/src", fixture)).toEqual(["~win/"]);
});

// Extends "[boundary-8] an alias with a trailing slash is joined to the rest without doubling the slash": trailing slash on the path too.
it("[boundary-8] an alias with a trailing slash joined to a rest with a trailing slash", () => {
  expect(reverseResolveAlias("/src/a/b/", { "~/": "/src" })).toEqual([
    "~/a/b/",
  ]);
});

// --- Ties keep alias map order; duplicates are kept ---

// Extends "[boundary-9] results of equal length keep the alias map's order": three aliases, not alphabetical.
it("[boundary-9] three results of equal length keep the alias map's order", () => {
  expect(reverseResolveAlias("/x/y", { c: "/x", a: "/x", b: "/x" })).toEqual([
    "c/y",
    "a/y",
    "b/y",
  ]);
});

// Extends "[boundary-9] bare aliases of equal length keep the alias map's order": order is normalizeAliases order.
it("[boundary-9] equal-length results follow normalizeAliases order, not insertion order", () => {
  expect(reverseResolveAlias("/x/y", { abc: "/x", "a/b": "/x" })).toEqual([
    "a/b/y",
    "abc/y",
  ]);
});

// Extends "[boundary-9] results of equal length keep the alias map's order": ties after a longer result.
it("[boundary-9] ties keep alias map order after a longer result", () => {
  expect(
    reverseResolveAlias("/x/y/z", { zz: "/x", b: "/x/y", a: "/x/y" }),
  ).toEqual(["zz/y/z", "b/z", "a/z"]);
});

// Extends "[boundary-10] two aliases that produce the same result both appear": three copies.
it("[boundary-10] three aliases that produce the same result all appear", () => {
  expect(
    reverseResolveAlias("/x/y", { "~": "/x", "~/": "/x", "~//": "/x" }),
  ).toEqual(["~/y", "~/y", "~/y"]);
});

// Extends "[boundary-10] two aliases that produce the same result both appear": from different targets.
it("[boundary-10] aliases on different targets that produce the same result both appear", () => {
  expect(reverseResolveAlias("/x/b/c", { a: "/x", "a/b": "/x/b" })).toEqual([
    "a/b/c",
    "a/b/c",
  ]);
});

// Extends "[boundary-10] two aliases that produce the same result both appear": with another result between them in the map.
it("[boundary-10] duplicates are kept alongside a longer distinct result", () => {
  expect(
    reverseResolveAlias("/x/y", { "~": "/x", other: "/x", "~/": "/x" }),
  ).toEqual(["other/y", "~/y", "~/y"]);
});

// --- When nothing matches, the result is an empty array ---

// Extends "[unhappy-1] paths outside every alias target give []": target text inside the path, relative spellings.
it("[unhappy-1] a target appearing later in the path or without its leading slash gives []", () => {
  expect(reverseResolveAlias("/usr/root/x", fixture)).toEqual([]);
  expect(reverseResolveAlias("x/root", fixture)).toEqual([]);
  expect(reverseResolveAlias("root/index.js", fixture)).toEqual([]);
  expect(reverseResolveAlias("src/foo", fixture)).toEqual([]);
});

// Extends "[unhappy-1] a path that is a strict prefix of a target gives []": root, other drives.
it("[unhappy-1] the root and other drives give []", () => {
  expect(reverseResolveAlias("/", fixture)).toEqual([]);
  expect(reverseResolveAlias("C:/other", fixture)).toEqual([]);
  expect(reverseResolveAlias("D:/src/foo", fixture)).toEqual([]);
  expect(reverseResolveAlias("@foo/baz", fixture)).toEqual([]);
});

// Extends "[unhappy-2] an empty path gives [] even with a root target": other maps.
it("[unhappy-2] an empty path gives [] with slash-ended and plain targets", () => {
  expect(reverseResolveAlias("", { "~": "/x" })).toEqual([]);
  expect(reverseResolveAlias("", { r: "/", s: "/x/", "~/": "/src" })).toEqual(
    [],
  );
});

// Extends "[unhappy-3] an empty alias map gives []": other paths.
it("[unhappy-3] an empty alias map gives [] for root, drive and relative paths", () => {
  expect(reverseResolveAlias("/", {})).toEqual([]);
  expect(reverseResolveAlias("C:\\x", {})).toEqual([]);
  expect(reverseResolveAlias("a", {})).toEqual([]);
});

// Extends "[unhappy-4] matching is case-sensitive": a case difference after the target.
it("[unhappy-4] a case difference past a shorter target still blocks the longer one", () => {
  expect(reverseResolveAlias("/root/INDEX.js", fixture)).toEqual([
    "@/INDEX.js",
  ]);
  expect(reverseResolveAlias("c:/root/index.JS", fixture)).toEqual([]);
});

// Extends "[unhappy-4] only the drive letter is case-normalised": other case differences.
it("[unhappy-4] case differences in path or target give []", () => {
  expect(reverseResolveAlias("/Src/foo", fixture)).toEqual([]);
  expect(reverseResolveAlias("C:/SRC", fixture)).toEqual([]);
  expect(reverseResolveAlias("/users/me/x", { u: "/Users/Me" })).toEqual([]);
});
