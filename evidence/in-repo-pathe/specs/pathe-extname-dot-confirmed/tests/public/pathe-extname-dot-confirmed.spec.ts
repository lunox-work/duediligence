import { expect, it } from "vitest";

import { extname, parse } from "../src/_path";
import { posix, win32 } from "../src";

function expectExtnames(cases: Record<string, string>) {
  for (const [input, expected] of Object.entries(cases)) {
    expect(extname(input), `extname(${JSON.stringify(input)})`).to.equal(
      expected,
    );
  }
}

it("[happy-1] a name ending with a dot has the extension '.'", () => {
  expectExtnames({
    "index.": ".",
    "x.": ".",
    "file.txt.": ".",
    "a.b.c.": ".",
  });
});

it("[happy-1] a name ending with a dot after directories has the extension '.'", () => {
  expectExtnames({
    "./x.": ".",
    "a/b/index.": ".",
    "/temp/myfile.": ".",
    "a.b/c.": ".",
  });
});

it("[happy-2] a Windows absolute path ending with a dot has the extension '.'", () => {
  expect(extname(String.raw`C:\temp\myfile.`)).to.equal(".");
});

it("[happy-2] Windows rooted and relative paths ending with a dot have the extension '.'", () => {
  expectExtnames({
    [String.raw`\temp\myfile.`]: ".",
    [String.raw`.\myfile.`]: ".",
  });
});

it("[happy-3] paths with an ordinary extension keep it", () => {
  expectExtnames({
    "/temp/myfile.html": ".html",
    "./myfile.html": ".html",
    "./myfile.tar.gz": ".gz",
    "./myfile.tar.gz.br": ".br",
    "foo.123": ".123",
    [String.raw`C:\temp\myfile.html`]: ".html",
    [String.raw`\temp\myfile.html`]: ".html",
    [String.raw`.\myfile.html`]: ".html",
  });
});

it("[happy-3] dotfiles, leading double dots and extensionless names keep their current results", () => {
  expectExtnames({
    ".foo": "",
    "..foo": ".foo",
    "./dir/file": "",
  });
});

it("[happy-4] parse on a name ending with a dot takes ext '.' and name without it", () => {
  expect(parse("index.")).to.deep.equal({
    root: "",
    dir: ".",
    base: "index.",
    ext: ".",
    name: "index",
  });
  expect(parse("/home/user/file.txt.")).to.deep.equal({
    root: "/",
    dir: "/home/user",
    base: "file.txt.",
    ext: ".",
    name: "file.txt",
  });
  expect(parse(String.raw`C:\temp\myfile.`)).to.deep.equal({
    root: "C:/",
    dir: "C:/temp",
    base: "myfile.",
    ext: ".",
    name: "myfile",
  });
});

it("[happy-4] parse on names made of or ending with several dots", () => {
  expect(parse("./dir/foo..")).to.deep.equal({
    root: "",
    dir: "./dir",
    base: "foo..",
    ext: ".",
    name: "foo.",
  });
  expect(parse("...")).to.deep.equal({
    root: "",
    dir: ".",
    base: "...",
    ext: ".",
    name: "..",
  });
  expect(parse("..")).to.deep.equal({
    root: "",
    dir: ".",
    base: "..",
    ext: "",
    name: "..",
  });
});

it("[happy-5] posix and win32 extname return '.' for names ending with a dot", () => {
  expect(posix.extname("index.")).to.equal(".");
  expect(win32.extname(String.raw`C:\temp\myfile.`)).to.equal(".");
});

it("[happy-5] posix and win32 extname follow the rules for paths made only of dots", () => {
  expect(posix.extname("..")).to.equal("");
  expect(win32.extname("...")).to.equal(".");
});

it("[boundary-1] two trailing dots give a single '.'", () => {
  expect(extname("foo..")).to.equal(".");
});

it("[boundary-1] three trailing dots and leading dots still give a single '.'", () => {
  expectExtnames({
    "foo...": ".",
    "..foo.": ".",
  });
});

it("[boundary-2] a dotfile name ending with a dot has the extension '.'", () => {
  expect(extname(".index.")).to.equal(".");
});

it("[boundary-2] a dotfile name ending with two dots has the extension '.'", () => {
  expect(extname(".index..")).to.equal(".");
});

it("[boundary-3] a drive-relative name ending with a dot has the extension '.'", () => {
  expect(extname("C:.")).to.equal(".");
});

it("[boundary-3] a drive-relative name ending with two dots has the extension '.'", () => {
  expect(extname("C:..")).to.equal(".");
});

it("[boundary-4] only the whole inputs '.' and '..' have no extension; longer runs of dots give '.'", () => {
  expectExtnames({
    ".": "",
    "..": "",
    "...": ".",
    "....": ".",
  });
});

it("[boundary-4] a last segment of dots after a separator gives '.'", () => {
  expectExtnames({
    "/.": ".",
    "/..": ".",
    "a/.": ".",
    "a/..": ".",
    "./..": ".",
    [String.raw`C:\..`]: ".",
    "/...": ".",
  });
});

it("[unhappy-1] a trailing '/' or '\\' after dots or a dotted name gives ''", () => {
  expectExtnames({
    "./": "",
    "../": "",
    "..\\": "",
    "index./": "",
  });
});

it("[unhappy-1] repeated separators, a backslash or a real extension before the separator still give ''", () => {
  expectExtnames({
    "index.//": "",
    "foo.\\": "",
    "index.js/": "",
    "a.b/": "",
  });
});

it("[unhappy-2] an empty path has no extension", () => {
  expect(extname("")).to.equal("");
});

it("[unhappy-2] a path that is only a separator has no extension", () => {
  expectExtnames({
    "/": "",
    "\\": "",
  });
});
