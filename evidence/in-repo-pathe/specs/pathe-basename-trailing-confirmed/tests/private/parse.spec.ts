import { expect, it } from "vitest";

import { basename, dirname, extname, parse } from "../../src/path";

// Rule: parse takes base, ext and name from the trailing-separator-aware basename

// Extends "[happy-4] parse of a POSIX directory path with a trailing separator"
it("[happy-4] parse of other POSIX directory paths with a trailing separator", () => {
  expect(parse("/var/log/")).to.deep.equal({
    root: "/",
    dir: "/var",
    base: "log",
    ext: "",
    name: "log",
  });
  expect(parse("/a/b/c/d/e/")).to.deep.equal({
    root: "/",
    dir: "/a/b/c/d",
    base: "e",
    ext: "",
    name: "e",
  });
  expect(parse("/tmp/")).to.deep.equal({
    root: "/",
    dir: "/",
    base: "tmp",
    ext: "",
    name: "tmp",
  });
});

// Extends "[happy-4] parse of a POSIX directory path with a trailing separator":
// a ".." segment before the trailing separator is taken literally
it("[happy-4] parse of a POSIX path ending in a dot-dot segment and a separator", () => {
  expect(parse("/a/b/../")).to.deep.equal({
    root: "/",
    dir: "/a/b",
    base: "..",
    ext: "",
    name: "..",
  });
});

// Extends "[happy-5] parse of a file-like segment with a trailing separator keeps its extension"
it("[happy-5] parse of multi-dot file-like segments with a trailing separator", () => {
  expect(parse("/home/user/archive.tar.gz/")).to.deep.equal({
    root: "/",
    dir: "/home/user",
    base: "archive.tar.gz",
    ext: ".gz",
    name: "archive.tar",
  });
  expect(parse("/srv/app.config.json\\")).to.deep.equal({
    root: "/",
    dir: dirname("/srv/app.config.json\\"),
    base: "app.config.json",
    ext: ".json",
    name: "app.config",
  });
});

// Extends "[happy-5] parse of a file-like segment with a trailing separator keeps its extension"
it("[happy-5] parse of a Windows file-like segment with a trailing separator keeps its extension", () => {
  expect(parse("C:\\docs\\report.pdf\\")).to.deep.equal({
    root: "C:",
    dir: "C:/docs",
    base: "report.pdf",
    ext: ".pdf",
    name: "report",
  });
});

// Extends "[happy-6] parse of a Windows path with a trailing separator"
it("[happy-6] parse of deeper Windows paths on other drives with a trailing separator", () => {
  expect(parse("D:\\a\\b\\c\\")).to.deep.equal({
    root: "D:",
    dir: "D:/a/b",
    base: "c",
    ext: "",
    name: "c",
  });
  expect(parse("e:/work/project/")).to.deep.equal({
    root: "E:",
    dir: "E:/work",
    base: "project",
    ext: "",
    name: "project",
  });
});

// Extends "[happy-6] parse of a Windows path with a trailing separator":
// one level below the drive root
it("[happy-6] parse of a Windows folder directly under the drive with a trailing separator", () => {
  expect(parse("C:\\temp\\")).to.deep.equal({
    root: "C:",
    dir: "C:/",
    base: "temp",
    ext: "",
    name: "temp",
  });
});

// Extends "[boundary-10] parse keeps dir from dirname, which removes only one trailing separator"
it("[boundary-10] parse of paths with three or more trailing separators keeps dir from dirname", () => {
  for (const p of ["/a/b///", "/a/b" + "/".repeat(6), "C:\\x\\y\\\\\\"]) {
    const result = parse(p);
    expect(result.dir).to.equal(dirname(p));
  }
  expect(parse("/a/b///")).to.deep.equal({
    root: "/",
    dir: "/a/b/",
    base: "b",
    ext: "",
    name: "b",
  });
  expect(parse("C:\\x\\y\\\\\\")).to.deep.equal({
    root: "C:",
    dir: "C:/x/y/",
    base: "y",
    ext: "",
    name: "y",
  });
});

// Extends "[boundary-10] parse keeps dir from dirname, which removes only one trailing separator"
it("[boundary-10] parse of a file-like segment with two trailing slashes keeps dir from dirname", () => {
  expect(parse("/a/file.txt//")).to.deep.equal({
    root: "/",
    dir: "/a/file.txt",
    base: "file.txt",
    ext: ".txt",
    name: "file",
  });
});

// Extends "[boundary-11] parse of a root-only path"
it("[boundary-11] parse of a backslash root-only path", () => {
  expect(parse("\\")).to.deep.equal({
    root: "/",
    dir: "/",
    base: "",
    ext: "",
    name: "",
  });
});

// Extends "[boundary-11] parse of a root-only path"
it("[boundary-11] parse of long separator-only paths has empty base, ext and name", () => {
  for (const p of ["///", "/".repeat(10), "\\\\\\", "/\\/\\"]) {
    const result = parse(p);
    expect(result.base).to.equal("");
    expect(result.ext).to.equal("");
    expect(result.name).to.equal("");
    expect(result.dir).to.equal(dirname(p));
  }
});

// Extends "[happy-7] parse keeps its existing results for paths without a trailing separator"
it("[happy-7] parse keeps existing results for other paths without a trailing separator", () => {
  expect(parse("/a/b/archive.tar.gz")).to.deep.equal({
    root: "/",
    dir: "/a/b",
    base: "archive.tar.gz",
    ext: ".gz",
    name: "archive.tar",
  });
  expect(parse("D:\\x\\y.md")).to.deep.equal({
    root: "D:",
    dir: "D:/x",
    base: "y.md",
    ext: ".md",
    name: "y",
  });
  expect(parse("/home/.bashrc")).to.deep.equal({
    root: "/",
    dir: "/home",
    base: ".bashrc",
    ext: "",
    name: ".bashrc",
  });
});

// Extends "[happy-5] parse of a file-like segment with a trailing separator keeps its extension":
// base, ext and name follow basename and extname for every trailing-separator path
it("[happy-5] parse takes base from basename and ext from extname of base for trailing-separator paths", () => {
  const paths = [
    "/a/b.c.d/",
    "/x/y.tar.gz//",
    "C:\\a\\b.txt\\/",
    "rel/file.md\\",
    "/a/.hidden.txt/",
  ];
  for (const p of paths) {
    const result = parse(p);
    expect(result.base).to.equal(basename(p));
    expect(result.ext).to.equal(extname(result.base));
    expect(result.name + result.ext).to.equal(result.base);
    expect(result.dir).to.equal(dirname(p));
  }
  expect(parse("/a/b.c.d/").ext).to.equal(".d");
  expect(parse("/a/b.c.d/").name).to.equal("b.c");
  expect(parse("/a/.hidden.txt/").ext).to.equal(".txt");
  expect(parse("/a/.hidden.txt/").name).to.equal(".hidden");
});

// Rule: Other exports are not changed by this ticket

// Extends "[boundary-12] extname and dirname keep their trailing-separator behaviour"
it("[boundary-12] extname and dirname keep their behaviour for repeated and mixed trailing separators", () => {
  expect(extname("/temp/myfile.html//")).to.equal("");
  expect(extname("/a/archive.tar.gz\\")).to.equal("");
  expect(dirname("/a/b//")).to.equal("/a/b");
  expect(dirname("C:\\temp\\\\")).to.equal("C:/temp");
  expect(dirname("/temp/myfile.html\\")).to.equal("/temp");
  expect(dirname("temp/")).to.equal(".");
});
