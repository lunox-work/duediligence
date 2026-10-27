import { expect, it } from "vitest";

import { parse } from "../../src";
import { filename } from "../../src/utils";

// Extends "[happy-1] last segment without extension is returned whole when a directory has a period":
// parent-directory segments and dotted directories before an extensionless name
it("[happy-1] extensionless name after .. segments and dotted directories", () => {
  expect(filename("../bar")).toBe("bar");
  expect(filename("../../x")).toBe("x");
  expect(filename("..\\foo.v1\\bin\\tool")).toBe("tool");
  expect(filename("foo./bar")).toBe("bar");
  expect(filename("/x.y.z/w")).toBe("w");
});

// Extends "[happy-1] last segment without extension is returned whole when a directory has a period":
// longer paths with many dotted directories
it("[happy-1] extensionless name after many dotted directories", () => {
  expect(filename("/a.b/c.d/e.f/g.h/i")).toBe("i");
  expect(filename("/a/b/c/d/e/f/g/h/i/j.k/l")).toBe("l");
  expect(filename("\\a.b\\c.d\\e.f\\g.h\\i")).toBe("i");
  expect(filename("/x.y/z")).toBe("z");
});

// Extends "[happy-1] mixed separators and dotted directories do not affect an extensionless segment":
// the last separator is a backslash after forward slashes, and UNC-style prefixes
it("[happy-1] extensionless name after mixed separators ending in a backslash", () => {
  expect(filename("a/b.c\\d")).toBe("d");
  expect(filename("C:\\a.b/c.d\\e")).toBe("e");
  expect(filename("\\\\server.local\\share\\readme")).toBe("readme");
  expect(filename("./v1.2\\bin/run")).toBe("run");
});

// Extends "[happy-1] last segment without extension is returned whole when a directory has a period":
// case and non-ASCII names
it("[happy-1] extensionless name keeps its case and non-ASCII characters", () => {
  expect(filename("/dir.d/FILE")).toBe("FILE");
  expect(filename("Ä.B/Ö")).toBe("Ö");
  expect(filename("/ü.d/ñ")).toBe("ñ");
});

// Extends "[happy-2] last segment with an extension loses only that extension":
// other extension lengths and one-character names
it("[happy-2] extensions of unusual length are removed", () => {
  expect(filename("/a/b.c")).toBe("b");
  expect(filename("x.typescript")).toBe("x");
  expect(filename("/v1.2/file.extension123")).toBe("file");
  expect(filename("C:\\very\\deep\\path\\to\\some\\file.min")).toBe("file");
});

// Extends "[happy-2] extension is stripped when every earlier segment also has a period":
// .. segments, mixed separators and more dotted directories
it("[happy-2] extension is stripped after .. segments and mixed separators", () => {
  expect(filename("../bar.js")).toBe("bar");
  expect(filename("/p.q/r.s")).toBe("r");
  expect(filename("/x.y.z/w.ts")).toBe("w");
  expect(filename("C:\\a.b/c.d\\e.txt")).toBe("e");
  expect(filename("a/b.c\\d.e")).toBe("d");
});

// Extends "[happy-3] names with several periods keep everything before the last one":
// more periods than the public cases, after dotted directories
it("[happy-3] only the last of many periods starts the extension", () => {
  expect(filename("/a.b/c.d.e.f.g.h")).toBe("c.d.e.f.g");
  expect(filename("foo.bar/baz.qux.quux")).toBe("baz.qux");
  expect(filename("C:\\x.y\\a.b.c")).toBe("a.b");
  expect(filename("a/b.c\\d.e.f")).toBe("d.e");
});

// Extends "[happy-3] bare name with two periods keeps the first one": inside a dotted directory
it("[happy-3] two-period name inside a dotted directory keeps the first period", () => {
  expect(filename("/v1.0/archive.tar.gz")).toBe("archive.tar");
  expect(filename("..\\v1.0\\archive.tar.gz")).toBe("archive.tar");
});

// Extends "[boundary-1] dotfile with no further period is returned whole":
// shortest dotfile, mixed separators, dotted and .. directories
it("[boundary-1] dotfiles under dotted directories and mixed separators are returned whole", () => {
  expect(filename("\\.bashrc")).toBe(".bashrc");
  expect(filename("C:\\a.b/.c")).toBe(".c");
  expect(filename("/home/u.s.e.r/.cache")).toBe(".cache");
  expect(filename("../.env")).toBe(".env");
  expect(filename("a/b.c\\.d")).toBe(".d");
});

// Extends "[boundary-1] bare dotfile with no directory is returned whole": a one-character dotfile
it("[boundary-1] bare one-character dotfile is returned whole", () => {
  expect(filename(".a")).toBe(".a");
  expect(filename(".Z")).toBe(".Z");
});

// Extends "[boundary-2] dotfile with a further period loses only the final extension":
// more than one further period, so only the final one is removed
it("[boundary-2] dotfile with several further periods loses only the final extension", () => {
  expect(filename("/a.b/.x.y.z")).toBe(".x.y");
  expect(filename("./.x.y.z")).toBe(".x.y");
  expect(filename("C:\\a.b\\.env.production.local")).toBe(".env.production");
  expect(filename(".\\.babelrc.js")).toBe(".babelrc");
});

// Extends "[boundary-2] shortest dotfile with a further period keeps its leading period":
// with directories, and with a backslash separator
it("[boundary-2] dotfile with one further period under dotted directories", () => {
  expect(filename("/n.m/.git.keep")).toBe(".git");
  expect(filename("x.y\\.a.b")).toBe(".a");
  expect(filename(".a.b.c")).toBe(".a.b");
});

// Extends "[boundary-3] segments ending in a period lose that trailing period":
// trailing periods after directories, after a leading period, and doubled
it("[boundary-3] a trailing period after the first character starts an empty extension", () => {
  expect(filename("a..")).toBe("a.");
  expect(filename("x/.a.")).toBe(".a");
  expect(filename("C:\\dir.v2\\foo.")).toBe("foo");
  expect(filename("x.y/a.b.c.")).toBe("a.b.c");
  expect(filename("a...b")).toBe("a..");
  expect(filename(".a..b")).toBe(".a.");
});

// Extends "[boundary-3] segments made of periods keep the leading period":
// longer runs of periods, .. after dotted directories and backslashes
it("[boundary-3] segments made of periods lose only their last period", () => {
  expect(filename("....")).toBe("...");
  expect(filename("foo/...")).toBe("..");
  expect(filename("\\..")).toBe(".");
  expect(filename("C:\\x.y\\..")).toBe(".");
  expect(filename("a.b/..")).toBe(".");
  expect(filename("foo/bar/..")).toBe(".");
  expect(filename("x.y/.")).toBe(".");
  expect(filename("...foo")).toBe("..");
  expect(filename("x/...foo")).toBe("..");
});

// Extends "[boundary-4] filename equals parse(path).name for ordinary paths": more paths, with
// backslashes, mixed separators, .. segments and dotfiles
it("[boundary-4] filename equals parse(path).name for paths with dotted directories and mixed separators", () => {
  for (const path of [
    "C:\\Users\\john.doe\\foo\\myFile",
    "./v1.2/bin/run",
    "a.b/c.d/e",
    "C:\\dir.v2/file",
    "../bar",
    "/x.y.z/w",
    "a/b.c\\d",
    "\\\\server.local\\share\\readme",
    "/a/b/c/d/e/f/g/h/i/j.k/l",
    "/my dir.v2/ my file ",
    "Ä.B/Ö",
  ]) {
    expect(filename(path)).toBe(parse(path).name);
  }
});

// Extends "[boundary-4] filename equals parse(path).name for segments with consecutive periods":
// dotfiles and longer runs of periods
it("[boundary-4] filename equals parse(path).name for dotfiles and runs of periods", () => {
  for (const path of [
    ".gitignore",
    "/a.b/.x.y.z",
    "C:\\a.b\\.env.production.local",
    "...foo",
    "a...b",
    ".a..b",
    "/q.r/a..b",
    "C:\\a.b\\..x",
    "/.config.d/run",
    "./.x.y\\..z",
  ]) {
    expect(filename(path)).toBe(parse(path).name);
  }
});

// Extends "[unhappy-1] path ending in a separator gives undefined":
// trailing backslashes and slashes after dotted and .. directories
it("[unhappy-1] trailing separator after a dotted directory gives undefined", () => {
  expect(filename("foo.d\\")).toBeUndefined();
  expect(filename("x/y.z/")).toBeUndefined();
  expect(filename("a.b/c/")).toBeUndefined();
  expect(filename("C:\\dir.v2\\")).toBeUndefined();
  expect(filename("../")).toBeUndefined();
  expect(filename("..\\")).toBeUndefined();
  expect(filename("/Users/john.doe/")).toBeUndefined();
});

// Extends "[unhappy-1] empty path and repeated trailing separators give undefined":
// other runs and mixes of separators
it("[unhappy-1] repeated and mixed trailing separators give undefined", () => {
  expect(filename("//")).toBeUndefined();
  expect(filename("\\\\")).toBeUndefined();
  expect(filename("/foo/bar\\\\")).toBeUndefined();
  expect(filename("a/\\")).toBeUndefined();
  expect(filename("a.b\\/")).toBeUndefined();
  expect(filename("/foo/bar.d///")).toBeUndefined();
  expect(filename("C:/")).toBeUndefined();
  expect(filename(".\\")).toBeUndefined();
});

// Extends "[boundary-5] characters other than separators and the extension are kept exactly":
// whitespace, tabs, case and non-ASCII after dotted directories
it("[boundary-5] whitespace, case and non-ASCII characters are kept after dotted directories", () => {
  expect(filename("/my dir.v2/ my file ")).toBe(" my file ");
  expect(filename("/x.y/ a b ")).toBe(" a b ");
  expect(filename("/tmp/ .txt")).toBe(" ");
  expect(filename("/tmp/\ttab.md")).toBe("\ttab");
  expect(filename("/TMP.D/README")).toBe("README");
  expect(filename("/x.y/Ünïcödé")).toBe("Ünïcödé");
  expect(filename(". .")).toBe(". ");
});

// Extends "[boundary-5] a lone space and a bare drive are returned as written":
// other drives, a drive-relative name and several spaces
it("[boundary-5] drive letters get no special handling", () => {
  expect(filename("D:")).toBe("D:");
  expect(filename("c:")).toBe("c:");
  expect(filename("C:foo.txt")).toBe("C:foo");
  expect(filename("   ")).toBe("   ");
  expect(filename("C:\\a.b\\C:")).toBe("C:");
});

// Extends "[boundary-6] repeated and interleaved calls return the same results":
// many rounds of interleaved calls, including undefined results and long-then-short inputs
it("[boundary-6] many rounds of interleaved calls return the same results", () => {
  const cases: Array<[string, string | undefined]> = [
    ["/a/b/c/d/e/f/g/h/i/j.k/l", "l"],
    ["x/y", "y"],
    ["/Users/john.doe/foo/myFile", "myFile"],
    ["/temp/.env.local", ".env"],
    ["/foo/bar/", undefined],
    ["..", "."],
    ["a", "a"],
    ["", undefined],
    ["C:\\Users\\john.doe\\foo\\myFile", "myFile"],
  ];
  for (let round = 0; round < 50; round++) {
    for (const [path, expected] of cases) {
      expect(filename(path)).toBe(expected);
    }
  }
});

// Extends "[boundary-6] a call after an undefined result is unaffected":
// reversed order and a shorter path after a longer one
it("[boundary-6] results do not depend on the preceding call", () => {
  expect(filename("/Users/john.doe/foo/myFile")).toBe("myFile");
  expect(filename("e")).toBe("e");
  expect(filename("")).toBeUndefined();
  expect(filename("e")).toBe("e");
  expect(filename("/temp/.env.local")).toBe(".env");
  expect(filename("/Users/john.doe/foo/myFile")).toBe("myFile");
});
