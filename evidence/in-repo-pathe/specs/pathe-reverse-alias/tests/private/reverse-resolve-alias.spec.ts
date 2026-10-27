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

function expectReverse(
  cases: Record<string, string[]>,
  aliases: Record<string, string> = fixture,
) {
  for (const [path, result] of Object.entries(cases)) {
    expect(reverseResolveAlias(path, aliases), path).toEqual(result);
  }
}

// --- @happy ---

// Extends "[happy-1] each normalised target maps back to its alias": another map
it("[happy-1] a target in another map maps back to its alias and to the enclosing alias", () => {
  const aliases = { "#app": "/app", "#utils": "/app/lib/utils.ts" };
  expect(reverseResolveAlias("/app/lib/utils.ts", aliases)).toEqual([
    "#utils",
    "#app/lib/utils.ts",
  ]);
  expect(reverseResolveAlias("/app", aliases)).toEqual(["#app"]);
});

// Extends "[happy-1] each normalised target maps back to its alias": relative targets
it("[happy-1] a relative target maps back to its alias", () => {
  const aliases = { pkg: "node_modules/pkg/dist/index.js" };
  expectReverse(
    {
      "node_modules/pkg/dist/index.js": ["pkg"],
      "./node_modules/pkg/dist/index.js": ["pkg"],
    },
    aliases,
  );
});

// Extends "[happy-1] targets that are also under another target map back to every alias"
it("[happy-1] a Windows target under another Windows target maps back to both aliases", () => {
  const aliases = { "~d": "D:/root", "~f": "D:/root/file.js" };
  expect(reverseResolveAlias("D:/root/file.js", aliases)).toEqual([
    "~f",
    "~d/file.js",
  ]);
});

// Extends "[happy-2] the rest of the path is joined after the alias": longer rests
it("[happy-2] a long rest is joined after the alias", () => {
  expectReverse({
    "/src/a/b/c/d/e.ts": ["~/a/b/c/d/e.ts"],
    "C:/src/a/b/c.ts": ["~win/a/b/c.ts"],
    "/root/a/b/c/d.ts": ["@/a/b/c/d.ts"],
  });
});

// Extends "[happy-2] the rest is joined after a Windows alias and after a file-like target"
it("[happy-2] the rest is joined after relative and Windows file-like targets", () => {
  expectReverse({
    "@foo/bar/dist/utils.mjs/a": ["@foo/bar/utils/a"],
    "@foo/bar/dist/index.mjs/a/b": ["@foo/bar/a/b"],
    "C:/root/index.js/x": ["~win/x"],
  });
});

// Extends "[happy-3] every matching alias is returned": more aliases, reversed map order
it("[happy-3] every one of several nested aliases is returned", () => {
  const aliases = {
    "~assets": "/root/some/dir",
    "~other": "/root/other",
    "~some": "/root/some",
    "~": "/root",
  };
  expect(reverseResolveAlias("/root/some/dir/smth.jpg", aliases)).toEqual([
    "~assets/smth.jpg",
    "~some/dir/smth.jpg",
    "~/some/dir/smth.jpg",
  ]);
});

// Extends "[happy-3] every matching alias is returned": not only the best match
it("[happy-3] a general alias is returned alongside the specific one", () => {
  const aliases = { "~": "/root", "~assets": "/root/some/dir" };
  expect(reverseResolveAlias("/root/some/dir/a/b.png", aliases)).toHaveLength(
    2,
  );
  expect(reverseResolveAlias("/root/other.png", aliases)).toEqual([
    "~/other.png",
  ]);
});

// Extends "[happy-4] windows separators in the path are normalised"
it("[happy-4] backslashes in posix-style and mixed paths are normalised", () => {
  expectReverse({
    "\\src\\foo": ["~/foo"],
    "\\root\\index.js": ["~", "@/index.js"],
    "C:\\src/foo\\bar": ["~win/foo/bar"],
  });
});

// Extends "[happy-4] a lower-case drive letter in the path is normalised"
it("[happy-4] a lower-case drive letter with backslashes reaches the bare target", () => {
  expectReverse({
    "c:\\root\\index.js": ["~win"],
    "c:\\src\\a\\b": ["~win/a/b"],
  });
});

// Extends "[happy-5] dot segments and repeated slashes in the path are resolved before matching"
it("[happy-5] more dot segments and repeated slashes are resolved before matching", () => {
  expectReverse({
    "/src/a/../b": ["~/b"],
    "/root/x/../index.js": ["~", "@/index.js"],
    "/src/./foo/./bar": ["~/foo/bar"],
    "/src/foo//bar": ["~/foo/bar"],
    "/root/../root/a": ["@/a"],
    "C:/src/x/../y": ["~win/y"],
  });
});

// Extends "[happy-5] a .. segment that leaves every target gives []"
it("[happy-5] a .. segment that steps out of a target gives []", () => {
  expectReverse({
    "/src/../etc": [],
    "/root/index.js/../../x": [],
  });
});

// Extends "[happy-6] targets are normalised the same way as the path"
it("[happy-6] targets with repeated slashes, backslashes and .. are normalised", () => {
  expect(reverseResolveAlias("/x/y/z", { k: "/x//y/" })).toEqual(["k/z"]);
  expect(reverseResolveAlias("/x/y", { k: "\\x\\y" })).toEqual(["k"]);
  expect(reverseResolveAlias("/x/q", { k: "/a/b/../../x" })).toEqual(["k/q"]);
});

// Extends "[happy-6] targets are normalised the same way as the path": drive letter case
it("[happy-6] a lower-case drive letter in a target is normalised", () => {
  expect(reverseResolveAlias("C:/x/y", { k: "c:/x" })).toEqual(["k/y"]);
  expect(reverseResolveAlias("c:\\x\\y", { k: "c:\\x" })).toEqual(["k/y"]);
});

// Extends "[happy-6] a normalised drive-letter target does not match a posix path"
it("[happy-6] a posix target does not match a drive-letter path", () => {
  expect(reverseResolveAlias("C:\\x\\y", { k: "/x" })).toEqual([]);
  expect(reverseResolveAlias("D:/x/y", { w: "C:\\x" })).toEqual([]);
});

// Extends "[happy-7] targets are first resolved against each other by normalizeAliases"
it("[happy-7] targets resolved through a chain of aliases map back to each alias", () => {
  const aliases = { a: "/r", b: "a/b", c: "b/c" };
  expect(reverseResolveAlias("/r/b/c/d", aliases)).toEqual([
    "c/d",
    "b/c/d",
    "a/b/c/d",
  ]);
});

// Extends "[happy-7] targets are first resolved against each other by normalizeAliases"
it("[happy-7] an alias target written through another alias maps back to both", () => {
  const aliases = { $app: "/proj/src", $lib: "$app/lib" };
  expect(reverseResolveAlias("/proj/src/lib/a.ts", aliases)).toEqual([
    "$lib/a.ts",
    "$app/lib/a.ts",
  ]);
});

// Extends "[happy-7] the unresolved spelling of a target is not matched"
it("[happy-7] the unresolved spelling of a chained target is not matched", () => {
  const aliases = { a: "/r", b: "a/b", c: "b/c" };
  expectReverse({ "a/b": [], "b/c": [], "a/b/c/d": [] }, aliases);
});

// Extends "[happy-8] more specific aliases come first because they give shorter results"
it("[happy-8] results are ordered by their own length, not by the target's specificity", () => {
  const aliases = { "@": "/p", "@verylongalias": "/p/a" };
  expect(reverseResolveAlias("/p/a/b", aliases)).toEqual([
    "@/a/b",
    "@verylongalias/b",
  ]);
});

// Extends "[happy-8] a path equal to the most specific target sorts that bare alias first"
it("[happy-8] four nested aliases are sorted shortest first whatever the map order", () => {
  const aliases = { "@b": "/p/a/b", "@": "/p", "@c": "/p/a/b/c", "@a": "/p/a" };
  expect(reverseResolveAlias("/p/a/b/c/d.ts", aliases)).toEqual([
    "@c/d.ts",
    "@b/c/d.ts",
    "@a/b/c/d.ts",
    "@/a/b/c/d.ts",
  ]);
});

// Extends "[happy-8]": sorting compares lengths, not strings
it("[happy-8] a shorter result sorts before a lexicographically smaller one", () => {
  expect(reverseResolveAlias("/x/y", { aa: "/x", b: "/x" })).toEqual([
    "b/y",
    "aa/y",
  ]);
});

// Extends "[happy-9] a frozen alias map is accepted and left unchanged"
it("[happy-9] a frozen fixture is accepted and left unchanged", () => {
  const aliases = Object.freeze({ ...fixture });
  expect(reverseResolveAlias("/root/index.js", aliases)).toEqual([
    "~",
    "@/index.js",
  ]);
  expect(reverseResolveAlias("C:\\src\\a", aliases)).toEqual(["~win/a"]);
  expect(aliases).toEqual(fixture);
});

// Extends "[happy-9] a frozen alias map whose targets refer to each other is left unchanged"
it("[happy-9] an unfrozen map with targets needing normalisation is left unchanged", () => {
  const aliases: Record<string, string> = {
    k: "/x/./",
    "w/": "C:\\x",
    "@": "/root",
    bingpot: "@/bingpot/index.ts",
  };
  const keys = Object.keys(aliases);
  expect(reverseResolveAlias("/x/y", aliases)).toEqual(["k/y"]);
  expect(reverseResolveAlias("/root/bingpot/index.ts", aliases)).toEqual([
    "bingpot",
    "@/bingpot/index.ts",
  ]);
  expect(aliases).toEqual({
    k: "/x/./",
    "w/": "C:\\x",
    "@": "/root",
    bingpot: "@/bingpot/index.ts",
  });
  expect(Object.keys(aliases)).toEqual(keys);
  expect(Object.getOwnPropertySymbols(aliases)).toEqual([]);
});

// Extends "[happy-10] an already-normalised map gives the same result as the raw map"
it("[happy-10] an already-normalised map gives the same results as the raw map for other paths", () => {
  const normalized = normalizeAliases(fixture);
  for (const [path, result] of Object.entries({
    "/root/bingpot/index.ts": ["bingpot", "@/bingpot/index.ts"],
    "C:/root/index.js": ["~win"],
    "/root/index.js/x": ["~/x", "@/index.js/x"],
  })) {
    const fromRaw = reverseResolveAlias(path, fixture);
    const fromNormalized = reverseResolveAlias(path, normalized);
    expect(fromRaw, path).toEqual(result);
    expect(fromNormalized, path).toEqual(result);
    expect(fromRaw).not.toBe(fromNormalized);
  }
});

// Extends "[happy-10] repeated calls with no match return distinct empty arrays"
it("[happy-10] changing a returned array does not affect the next call", () => {
  const aliases = normalizeAliases(fixture);
  const first = reverseResolveAlias("/root/index.js", aliases);
  expect(first).toEqual(["~", "@/index.js"]);
  first.push("junk");
  first[0] = "changed";
  const second = reverseResolveAlias("/root/index.js", aliases);
  expect(second).toEqual(["~", "@/index.js"]);
  expect(second).not.toBe(first);
});

// Extends "[happy-11] resolveAlias is unchanged": after reverseResolveAlias used the same map
it("[happy-11] resolveAlias is unchanged after reverseResolveAlias has used the fixture", () => {
  expect(reverseResolveAlias("/src/foo/bar", fixture)).toEqual(["~/foo/bar"]);
  expect(reverseResolveAlias("C:/src/foo/bar", fixture)).toEqual([
    "~win/foo/bar",
  ]);
  expect(reverseResolveAlias("foo/bar.js", fixture)).toEqual([]);
  expect(resolveAlias("~/foo/bar", fixture)).toBe("/src/foo/bar");
  expect(resolveAlias("~win/foo/bar", fixture)).toBe("C:/src/foo/bar");
  expect(resolveAlias("foo/bar.js", fixture)).toBe("foo/bar.js");
});

// --- @boundary ---

// Extends "[boundary-1] a target only matches at a segment boundary": punctuation after the target
it("[boundary-1] punctuation after a target is not a segment boundary", () => {
  expectReverse({
    "/root.d/x": [],
    "/src-old/a": [],
    "/src_x": [],
    "/src.bak": [],
    "C:/srcfoo": [],
    "@foo/bar/dist/index.mjsx": [],
  });
});

// Extends "[boundary-1] a target continued by more characters falls back to the shorter target"
it("[boundary-1] a file-like target continued by an extension falls back to the shorter target", () => {
  expectReverse({
    "/root/index.js.map": ["@/index.js.map"],
    "/root/index.js-x/y": ["@/index.js-x/y"],
  });
});

// Extends "[boundary-2] the root target / matches every absolute path"
it("[boundary-2] the root target / matches deep paths and sits after more specific aliases", () => {
  expect(reverseResolveAlias("/a/b/c/d.ts", { r: "/" })).toEqual([
    "r/a/b/c/d.ts",
  ]);
  expect(reverseResolveAlias("/src/x", { r: "/", s: "/src" })).toEqual([
    "s/x",
    "r/src/x",
  ]);
});

// Extends "[boundary-2] the root target / matches / itself but not a relative path"
it("[boundary-2] targets that normalise to / match every absolute path", () => {
  expect(reverseResolveAlias("/a/b", { r: "\\" })).toEqual(["r/a/b"]);
  expect(reverseResolveAlias("/a/b", { r: "/q/.." })).toEqual(["r/a/b"]);
  expect(reverseResolveAlias("/", { r: "/q/../" })).toEqual(["r/"]);
});

// Extends "[boundary-2] the root target / matches / itself but not a relative path"
it("[boundary-2] the root target / does not match other relative paths", () => {
  expectReverse({ "./a": [], ".": [], "a": [], "../a": [] }, { r: "/" });
});

// Extends "[boundary-3] a path that is already aliased is not matched against targets"
it("[boundary-3] aliased spellings from the fixture are not matched against targets", () => {
  expectReverse({
    "~/foo": [],
    "~win/foo": [],
    "@/bingpot/index.ts": [],
    "bingpot": [],
  });
});

// Extends "[boundary-3] a path equal to an alias key is not matched against targets"
it("[boundary-3] a deeper aliased path is not matched against targets", () => {
  expect(reverseResolveAlias("~/y/z", { "~": "/x" })).toEqual([]);
  expect(reverseResolveAlias("~/", { "~": "/x" })).toEqual([]);
});

// Extends "[boundary-4] a target with a trailing slash also matches the bare directory"
it("[boundary-4] a deeper target with a trailing slash matches the bare directory and below", () => {
  expectReverse(
    {
      "/x/y": ["t"],
      "/x/y/": ["t/"],
      "/x/y/z/": ["t/z/"],
      "/x/yz": [],
    },
    { t: "/x/y/" },
  );
});

// Extends "[boundary-4] a target with a trailing slash matches paths below it"
it("[boundary-4] trailing backslashes and a drive root on a target don't matter", () => {
  expect(reverseResolveAlias("/x", { t: "\\x\\" })).toEqual(["t"]);
  expect(reverseResolveAlias("C:/x/y", { d: "C:/" })).toEqual(["d/x/y"]);
  expect(reverseResolveAlias("c:\\x", { d: "c:\\" })).toEqual(["d/x"]);
});

// Extends "[boundary-5] a trailing slash on the path is kept in the result"
it("[boundary-5] a trailing slash is kept for Windows paths and file-like targets", () => {
  expectReverse({
    "C:/src/foo/": ["~win/foo/"],
    "C:\\src\\foo\\": ["~win/foo/"],
    "/root/index.js/": ["~/", "@/index.js/"],
  });
});

// Extends "[boundary-5] a path that is a target plus a trailing slash keeps the slash"
it("[boundary-5] a trailing slash survives repeated slashes and dot segments", () => {
  expectReverse({
    "/root/a//": ["@/a/"],
    "/src/foo/./": ["~/foo/"],
    "C:/src/": ["~win/"],
  });
});

// Extends "[boundary-6] the alias is used as written, including its own trailing slash"
it("[boundary-6] aliases with a trailing slash or a scope are put in front as written", () => {
  expect(reverseResolveAlias("/a", { "$lib/": "/a" })).toEqual(["$lib/"]);
  expect(reverseResolveAlias("/a/", { "#internal": "/a" })).toEqual([
    "#internal/",
  ]);
  expect(reverseResolveAlias("/a/b", { "@scope/pkg": "/a" })).toEqual([
    "@scope/pkg/b",
  ]);
  expect(reverseResolveAlias("/a/b", { MyAlias: "/a" })).toEqual([
    "MyAlias/b",
  ]);
});

// Extends "[boundary-6] an alias with a trailing slash is not doubled when the rest is joined"
it("[boundary-6] an alias with a trailing slash is not doubled for a path with a trailing slash", () => {
  expect(reverseResolveAlias("/src/", { "~/": "/src" })).toEqual(["~/"]);
  expect(reverseResolveAlias("/src/a/b/", { "~/": "/src" })).toEqual([
    "~/a/b/",
  ]);
});

// Extends "[boundary-7] results of equal length keep the alias map's order": normalizeAliases order
it("[boundary-7] equal-length results follow normalizeAliases order, not the raw map order", () => {
  // normalizeAliases puts "z/" (two segments) before "a" (one segment)
  expect(reverseResolveAlias("/x/q", { a: "/x", "z/": "/x" })).toEqual([
    "z/q",
    "a/q",
  ]);
});

// Extends "[boundary-7] bare aliases of equal length keep the alias map's order"
it("[boundary-7] many equal-length results keep the map order among mixed lengths", () => {
  const aliases: Record<string, string> = {};
  for (const key of ["m", "bb", "k", "c", "aa", "z", "d", "j", "e", "y"]) {
    aliases[key] = "/x";
  }
  for (const key of ["i", "h", "g", "f", "cc", "n", "o", "p"]) {
    aliases[key] = "/x";
  }
  expect(reverseResolveAlias("/x/y", aliases)).toEqual([
    "m/y",
    "k/y",
    "c/y",
    "z/y",
    "d/y",
    "j/y",
    "e/y",
    "y/y",
    "i/y",
    "h/y",
    "g/y",
    "f/y",
    "n/y",
    "o/y",
    "p/y",
    "bb/y",
    "aa/y",
    "cc/y",
  ]);
});

// Extends "[boundary-8] two aliases that produce the same result appear once"
it("[boundary-8] aliases that join to the same result appear once", () => {
  expect(reverseResolveAlias("/x/y", { "./a": "/x", a: "/x" })).toEqual([
    "a/y",
  ]);
  expect(reverseResolveAlias("/x/", { "~": "/x", "~/": "/x/" })).toEqual([
    "~/",
  ]);
});

// Extends "[boundary-8] two aliases that produce different results both appear"
it("[boundary-8] non-adjacent duplicates are removed while other results stay", () => {
  expect(
    reverseResolveAlias("/x/y", { "~": "/x", b: "/x", "~/": "/x", c: "/x/y" }),
  ).toEqual(["c", "~/y", "b/y"]);
});

// --- @unhappy ---

// Extends "[unhappy-1] paths outside every alias target give []"
it("[unhappy-1] relative spellings, other drives and other roots give []", () => {
  expectReverse({
    "src/foo": [],
    "root/index.js": [],
    "../src/foo": [],
    "D:/src/foo": [],
    "C:/other/x": [],
    "/x": [],
  });
});

// Extends "[unhappy-1] a path that is a parent of a target gives []"
it("[unhappy-1] a parent of a nested target gives [] in another map", () => {
  expectReverse(
    { "/app/lib": [], "/": [], "/ap": [] },
    { "#utils": "/app/lib/utils.ts", "#app": "/app/src" },
  );
});

// Extends "[unhappy-2] an empty path gives [] even against the root target"
it("[unhappy-2] an empty path gives [] against targets that normalise to .", () => {
  expect(reverseResolveAlias("", { d: "." })).toEqual([]);
  expect(reverseResolveAlias("", { d: "./" })).toEqual([]);
});

// Extends "[unhappy-3] an empty alias map gives []"
it("[unhappy-3] an empty alias map gives [] for many kinds of path", () => {
  expectReverse(
    { "": [], "C:/": [], "a/b": [], ".": [], "C:\\x\\y": [], "/x/": [] },
    {},
  );
});

// Extends "[unhappy-4] matching is case-sensitive"
it("[unhappy-4] case differences after the drive letter prevent a match", () => {
  expectReverse({
    "/Src/foo": [],
    "C:/Root/index.js": [],
    "/root/INDEX.js": ["@/INDEX.js"],
    "@FOO/bar/dist/index.mjs": [],
  });
});

// Extends "[unhappy-4] only the drive letter is case-insensitive": target case
it("[unhappy-4] a target's case is not folded either", () => {
  expect(reverseResolveAlias("/x/y", { k: "/X" })).toEqual([]);
  expect(reverseResolveAlias("/X/y", { k: "/x" })).toEqual([]);
});

// Extends "[unhappy-5] an alias with an empty target is ignored"
it("[unhappy-5] an empty target is ignored wherever it sits in the map", () => {
  expect(reverseResolveAlias("/x/y", { "~": "/x", e: "" })).toEqual(["~/y"]);
  expect(reverseResolveAlias("/a", { e: "", r: "/" })).toEqual(["r/a"]);
});

// Extends "[unhappy-5] a map with only an empty target gives []"
it("[unhappy-5] an empty target does not match . or ./", () => {
  expect(reverseResolveAlias(".", { e: "" })).toEqual([]);
  expect(reverseResolveAlias("./", { e: "" })).toEqual([]);
  expect(reverseResolveAlias("./a", { e: "" })).toEqual([]);
});
