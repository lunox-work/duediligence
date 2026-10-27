import { expect, it } from "vitest";

import { dirname, extname, parse } from "../../src/path";

// Rule: parse takes base, ext and name from the trailing-separator-aware basename

it("[happy-4] parse of the listed POSIX directory path with a trailing separator", () => {
  expect(parse("/home/user/dir/")).to.deep.equal({
    root: "/",
    dir: "/home/user",
    base: "dir",
    ext: "",
    name: "dir",
  });
});

// Extends "[happy-4] parse of a POSIX directory path with a trailing
// separator": other depths and names.
it("[happy-4] parse of other POSIX directory paths with a trailing separator", () => {
  expect(parse("/var/")).to.deep.equal({
    root: "/",
    dir: "/",
    base: "var",
    ext: "",
    name: "var",
  });
  expect(parse("/var/log/nginx/")).to.deep.equal({
    root: "/",
    dir: "/var/log",
    base: "nginx",
    ext: "",
    name: "nginx",
  });
});

// Extends "[happy-4] parse of a POSIX directory path with a trailing
// backslash": ext comes from extname(base), which finds no extension in a
// leading-dot name.
it("[happy-4] parse of a dot-directory with a trailing separator has no extension", () => {
  expect(parse("/home/.config/")).to.deep.equal({
    root: "/",
    dir: "/home",
    base: ".config",
    ext: "",
    name: ".config",
  });
  expect(parse("/home/user/.bashrc\\")).to.deep.equal({
    root: "/",
    dir: "/home/user",
    base: ".bashrc",
    ext: "",
    name: ".bashrc",
  });
});

it("[happy-4] parse of a parent segment with a trailing separator is not resolved", () => {
  const result = parse("/a/../");
  expect(result.base).to.equal("..");
  expect(result.ext).to.equal("");
  expect(result.name).to.equal("..");
});

it("[happy-4] parse of a relative directory path with a trailing separator", () => {
  const result = parse("relative/path/dir/");
  expect(result.dir).to.equal("relative/path");
  expect(result.base).to.equal("dir");
  expect(result.ext).to.equal("");
  expect(result.name).to.equal("dir");
});

it("[happy-5] parse of the listed file-like segment with a trailing separator", () => {
  expect(parse("/home/user/file.txt/")).to.deep.equal({
    root: "/",
    dir: "/home/user",
    base: "file.txt",
    ext: ".txt",
    name: "file",
  });
});

// Extends "[happy-5] parse keeps the extension of a file-like segment with a
// trailing separator": other extensions and a backslash separator.
it("[happy-5] parse keeps other extensions of a file-like segment with a trailing separator", () => {
  expect(parse("/srv/app/index.html/")).to.deep.equal({
    root: "/",
    dir: "/srv/app",
    base: "index.html",
    ext: ".html",
    name: "index",
  });
  expect(parse("/srv/app/main.js\\")).to.deep.equal({
    root: "/",
    dir: "/srv/app",
    base: "main.js",
    ext: ".js",
    name: "main",
  });
  expect(parse("/a/x.y.z.longext/")).to.deep.equal({
    root: "/",
    dir: "/a",
    base: "x.y.z.longext",
    ext: ".longext",
    name: "x.y.z",
  });
});

// Extends "[happy-5] parse takes only the last extension ...": a segment that
// ends in a dot has no extension under extname.
it("[happy-5] parse of a segment ending in a dot with a trailing separator has no extension", () => {
  expect(parse("/home/file./")).to.deep.equal({
    root: "/",
    dir: "/home",
    base: "file.",
    ext: "",
    name: "file.",
  });
});

// Extends "[happy-5] ...": repeated trailing separators still yield the file
// fields; dir is whatever the unchanged dirname gives.
it("[happy-5] parse keeps the extension of a file-like segment after repeated trailing separators", () => {
  expect(parse("/home/user/file.txt///")).to.deep.equal({
    root: "/",
    dir: "/home/user/file.txt/",
    base: "file.txt",
    ext: ".txt",
    name: "file",
  });
});

it("[happy-6] parse of the listed Windows path with a trailing separator", () => {
  expect(parse("C:\\path\\dir\\")).to.deep.equal({
    root: "C:",
    dir: "C:/path",
    base: "dir",
    ext: "",
    name: "dir",
  });
});

// Extends "[happy-6] parse of a Windows path with a trailing separator":
// another drive, a file-like segment, and a forward-slash separator.
it("[happy-6] parse of other Windows paths with a trailing separator", () => {
  expect(parse("D:\\Users\\me\\Documents\\")).to.deep.equal({
    root: "D:",
    dir: "D:/Users/me",
    base: "Documents",
    ext: "",
    name: "Documents",
  });
  expect(parse("C:\\temp\\myfile.html\\")).to.deep.equal({
    root: "C:",
    dir: "C:/temp",
    base: "myfile.html",
    ext: ".html",
    name: "myfile",
  });
  expect(parse("C:/temp/archive.tar.gz/")).to.deep.equal({
    root: "C:",
    dir: "C:/temp",
    base: "archive.tar.gz",
    ext: ".gz",
    name: "archive.tar",
  });
});

// Extends "[happy-6] parse of a lowercase-drive Windows path ...": a drive
// root alone, where base is the (uppercased) drive.
it("[happy-6] parse of a drive root takes base and name from the drive", () => {
  for (const p of ["C:\\", "C:/", "c:\\", "c:/"]) {
    const result = parse(p);
    expect(result.base).to.equal("C:");
    expect(result.ext).to.equal("");
    expect(result.name).to.equal("C:");
  }
});

it("[happy-6] parse of a UNC share with a trailing separator", () => {
  expect(parse("\\\\server\\share\\")).to.deep.equal({
    root: "/",
    dir: "//server",
    base: "share",
    ext: "",
    name: "share",
  });
});

// Rule: dir still comes from the unchanged dirname

it("[boundary-10] parse of the listed path with two trailing separators", () => {
  expect(parse("/a/b//")).to.deep.equal({
    root: "/",
    dir: "/a/b",
    base: "b",
    ext: "",
    name: "b",
  });
});

// Extends "[boundary-10] parse takes dir from dirname, which removes only one
// trailing separator": three separators leave dirname with a trailing "/".
it("[boundary-10] parse with three trailing separators keeps dirname's dir", () => {
  expect(parse("/a/b///")).to.deep.equal({
    root: "/",
    dir: "/a/b/",
    base: "b",
    ext: "",
    name: "b",
  });
});

// Extends "[boundary-10] parse of a Windows path with two trailing
// backslashes": three backslashes and a mixed run.
it("[boundary-10] parse with longer and mixed trailing runs keeps dirname's dir", () => {
  expect(parse("C:\\a\\b.tar.gz\\\\\\")).to.deep.equal({
    root: "C:",
    dir: "C:/a/b.tar.gz/",
    base: "b.tar.gz",
    ext: ".gz",
    name: "b.tar",
  });
  expect(parse("/home/user/dir\\/\\/")).to.deep.equal({
    root: "/",
    dir: "/home/user/dir//",
    base: "dir",
    ext: "",
    name: "dir",
  });
  expect(parse("/a/..//")).to.deep.equal({
    root: "/",
    dir: "/a/..",
    base: "..",
    ext: "",
    name: "..",
  });
});

it("[boundary-11] parse of the listed root-only path", () => {
  expect(parse("/")).to.deep.equal({
    root: "/",
    dir: "/",
    base: "",
    ext: "",
    name: "",
  });
});

// Extends "[boundary-11] parse of a backslash root-only path": longer and
// mixed separator-only paths.
it("[boundary-11] parse of longer and mixed separator-only paths", () => {
  for (const p of ["//", "///", "\\\\\\", "/\\/"]) {
    expect(parse(p)).to.deep.equal({
      root: "/",
      dir: "/",
      base: "",
      ext: "",
      name: "",
    });
  }
});

// Rule: Existing parse results are unchanged

it("[happy-7] parse keeps every listed existing result", () => {
  expect(parse("/home/user/dir/file.txt")).to.deep.equal({
    root: "/",
    dir: "/home/user/dir",
    base: "file.txt",
    ext: ".txt",
    name: "file",
  });
  expect(parse("./dir/file")).to.deep.equal({
    root: ".",
    dir: "./dir",
    base: "file",
    ext: "",
    name: "file",
  });
  expect(parse(String.raw`C:\path\dir\file.txt`)).to.deep.equal({
    root: "C:",
    dir: "C:/path/dir",
    base: "file.txt",
    ext: ".txt",
    name: "file",
  });
  expect(parse(String.raw`.\dir\file`)).to.deep.equal({
    root: ".",
    dir: "./dir",
    base: "file",
    ext: "",
    name: "file",
  });
});

// Extends "[happy-7] parse keeps its existing results for paths without a
// trailing separator": other paths without a trailing separator.
it("[happy-7] parse keeps its existing results for other paths without a trailing separator", () => {
  expect(parse("/a/b.tar.gz")).to.deep.equal({
    root: "/",
    dir: "/a",
    base: "b.tar.gz",
    ext: ".gz",
    name: "b.tar",
  });
  expect(parse("C:/x/y")).to.deep.equal({
    root: "C:",
    dir: "C:/x",
    base: "y",
    ext: "",
    name: "y",
  });
  expect(parse(String.raw`\\server\share\file.txt`)).to.deep.equal({
    root: "/",
    dir: "//server/share",
    base: "file.txt",
    ext: ".txt",
    name: "file",
  });
});

// Rule: Other exports are not changed by this ticket

it("[boundary-12] extname and dirname keep every listed trailing-separator result", () => {
  expect(extname("/temp/myfile.html/")).to.equal("");
  expect(dirname("/temp/")).to.equal("/");
  expect(dirname("C:\\temp\\")).to.equal("C:/");
  expect(dirname("/temp/myfile.html/")).to.equal("/temp");
});

// Extends "[boundary-12] extname and dirname keep their trailing-separator
// behaviour": other separators and repeated runs.
it("[boundary-12] extname stays empty for other paths with trailing separators", () => {
  expect(extname("/temp/myfile.html//")).to.equal("");
  expect(extname("C:\\temp\\myfile.html\\")).to.equal("");
  expect(extname("/a/b.tar.gz\\")).to.equal("");
});

it("[boundary-12] dirname removes only one trailing separator for other paths", () => {
  expect(dirname("\\temp\\")).to.equal("/");
  expect(dirname("C:\\temp\\myfile.html\\")).to.equal("C:/temp");
  expect(dirname("/temp//")).to.equal("/temp");
  expect(dirname("/a/b///")).to.equal("/a/b/");
});
