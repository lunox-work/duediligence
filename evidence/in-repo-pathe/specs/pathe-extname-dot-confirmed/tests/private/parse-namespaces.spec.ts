import { expect, it } from "vitest";

import { parse } from "../../src/_path";
import { posix, win32 } from "../../src";

// Extends "[happy-4] parse on a name ending with a dot takes ext '.' and name without it".
it("[happy-4] parse on other paths ending with a single dot", () => {
  expect(parse("a/b.c.")).to.deep.equal({
    root: "",
    dir: "a",
    base: "b.c.",
    ext: ".",
    name: "b.c",
  });
  expect(parse("/x.")).to.deep.equal({
    root: "/",
    dir: "/",
    base: "x.",
    ext: ".",
    name: "x",
  });
  expect(parse(String.raw`D:\a\b\archive.tar.gz.`)).to.deep.equal({
    root: "D:/",
    dir: "D:/a/b",
    base: "archive.tar.gz.",
    ext: ".",
    name: "archive.tar.gz",
  });
  expect(parse(".index.")).to.deep.equal({
    root: "",
    dir: ".",
    base: ".index.",
    ext: ".",
    name: ".index",
  });
});

// Extends "[happy-4] parse on names made of or ending with several dots".
it("[happy-4] parse on longer runs of dots and dotted names", () => {
  expect(parse("....")).to.deep.equal({
    root: "",
    dir: ".",
    base: "....",
    ext: ".",
    name: "...",
  });
  expect(parse("a/foo...")).to.deep.equal({
    root: "",
    dir: "a",
    base: "foo...",
    ext: ".",
    name: "foo..",
  });
  expect(parse(".index..")).to.deep.equal({
    root: "",
    dir: ".",
    base: ".index..",
    ext: ".",
    name: ".index.",
  });
});

// Shortcut: parse calling extname on the whole path instead of on base.
// parse keeps its code, so ext is extname(base): a trailing separator is
// dropped by basename, and a base of "." or ".." gives "".
it("[happy-4] parse takes ext from base, not from the whole path", () => {
  expect(parse("index./")).to.deep.equal({
    root: "",
    dir: ".",
    base: "index.",
    ext: ".",
    name: "index",
  });
  expect(parse("C:\\a\\b.\\")).to.deep.equal({
    root: "C:/",
    dir: "C:/a",
    base: "b.",
    ext: ".",
    name: "b",
  });
  expect(parse("/..")).to.deep.equal({
    root: "/",
    dir: "/",
    base: "..",
    ext: "",
    name: "..",
  });
  expect(parse("a/.")).to.deep.equal({
    root: "",
    dir: "a",
    base: ".",
    ext: "",
    name: ".",
  });
});

// Extends the [happy-4] parse tests to the posix and win32 namespaces, which
// delegate to the same parse.
it("[happy-4] posix.parse and win32.parse on a path ending with a dot", () => {
  const expected = {
    root: "/",
    dir: "/home/user",
    base: "file.txt.",
    ext: ".",
    name: "file.txt",
  };
  expect(posix.parse("/home/user/file.txt.")).to.deep.equal(expected);
  expect(win32.parse("/home/user/file.txt.")).to.deep.equal(expected);
  expect(win32.parse(String.raw`C:\temp\foo..`)).to.deep.equal({
    root: "C:/",
    dir: "C:/temp",
    base: "foo..",
    ext: ".",
    name: "foo.",
  });
});

// Extends "[happy-5] posix and win32 extname return '.' for names ending with a dot":
// each namespace on the other's example and on more paths.
it("[happy-5] posix and win32 extname agree on names ending with a dot", () => {
  for (const ns of [posix, win32]) {
    expect(ns.extname("index.")).to.equal(".");
    expect(ns.extname(String.raw`C:\temp\myfile.`)).to.equal(".");
    expect(ns.extname("a/b/file.txt.")).to.equal(".");
    expect(ns.extname("foo..")).to.equal(".");
    expect(ns.extname(".index.")).to.equal(".");
  }
});

// Extends "[happy-5] posix and win32 extname follow the rules for paths made only of dots".
// Shortcut: delegating to Node's posix or win32 extname, which differ here.
it("[happy-5] posix and win32 extname follow the pathe rules where Node differs", () => {
  for (const ns of [posix, win32]) {
    expect(ns.extname("..")).to.equal("");
    expect(ns.extname(".")).to.equal("");
    expect(ns.extname("...")).to.equal(".");
    expect(ns.extname("/..")).to.equal(".");
    expect(ns.extname("a/.")).to.equal(".");
    expect(ns.extname("C:.")).to.equal(".");
    expect(ns.extname("index./")).to.equal("");
    expect(ns.extname("index.js/")).to.equal("");
    expect(ns.extname("a/.foo")).to.equal(".foo");
  }
});
