import { expect, it } from "vitest";

import { basename, dirname, extname, parse } from "../src/path";

// Rule: Paths without a trailing separator keep their current result

it("[happy-1] basename keeps its existing results for paths without a trailing separator", () => {
  const rows: [string, string | undefined, string][] = [
    ["/temp/myfile.html", undefined, "myfile.html"],
    ["./myfile.html", undefined, "myfile.html"],
    ["./myfile.html", ".html", "myfile"],
    ["./undefined", undefined, "undefined"],
    [String.raw`C:\temp\myfile.html`, undefined, "myfile.html"],
    [String.raw`\temp\myfile.html`, undefined, "myfile.html"],
    [String.raw`.\myfile.html`, ".html", "myfile"],
    ["myfile.html", undefined, "myfile.html"],
  ];
  for (const [p, extension, result] of rows) {
    expect(basename(p, extension)).to.equal(result);
  }
});

it("[happy-1] basename with the extension left out matches an undefined extension", () => {
  expect(basename("./undefined")).to.equal("undefined");
  expect(basename(String.raw`C:\temp\myfile.html`)).to.equal("myfile.html");
  expect(basename("myfile.html")).to.equal("myfile.html");
});

// Rule: One or more trailing separators, "/" or "\" in any mix, are ignored

it("[happy-2] basename returns the segment before a trailing separator", () => {
  const rows: [string, string][] = [
    ["/temp/", "temp"],
    ["/temp/myfile.html/", "myfile.html"],
    ["temp/", "temp"],
    ["C:\\temp\\", "temp"],
    ["C:\\temp\\myfile.html\\", "myfile.html"],
    ["\\temp\\", "temp"],
    ["//server/share/", "share"],
    ["\\\\server\\share\\", "share"],
  ];
  for (const [p, result] of rows) {
    expect(basename(p)).to.equal(result);
  }
});

it("[happy-2] basename of a UNC share path with a trailing separator is the share name", () => {
  expect(basename("//server/share/")).to.equal("share");
  expect(basename("\\\\server\\share\\")).to.equal("share");
});

it("[boundary-1] basename skips repeated and mixed trailing separators", () => {
  const rows: [string, string][] = [
    ["/temp//", "temp"],
    ["/temp///", "temp"],
    ["/temp\\/\\", "temp"],
    ["C:\\temp\\\\", "temp"],
  ];
  for (const [p, result] of rows) {
    expect(basename(p)).to.equal(result);
  }
});

it("[boundary-1] basename skips a mixed run of trailing separators after a Windows path", () => {
  expect(basename(String.raw`C:\temp/\/`)).to.equal("temp");
  expect(basename("temp\\\\\\\\")).to.equal("temp");
});

// Rule: Empty segments in the middle of a path do not affect the result

it("[boundary-2] basename ignores doubled inner separators", () => {
  const rows: [string, string][] = [
    ["/a//b", "b"],
    ["/a//b//", "b"],
    ["a\\\\b\\", "b"],
  ];
  for (const [p, result] of rows) {
    expect(basename(p)).to.equal(result);
  }
});

it("[boundary-2] basename strips a matching extension despite doubled inner and trailing separators", () => {
  expect(basename("/a//b.html//", ".html")).to.equal("b");
});

// Rule: "." and ".." segments are returned literally, without resolving them

it("[boundary-3] basename returns dot segments literally", () => {
  const rows: [string, string][] = [
    ["./", "."],
    ["../", ".."],
    ["foo/./", "."],
    ["foo/bar/..", ".."],
    ["foo/bar/../", ".."],
  ];
  for (const [p, result] of rows) {
    expect(basename(p)).to.equal(result);
  }
});

it("[boundary-3] basename returns backslash-terminated dot segments literally", () => {
  expect(basename(".\\")).to.equal(".");
  expect(basename("..\\\\")).to.equal("..");
  expect(basename("foo\\bar\\..\\")).to.equal("..");
});

// Rule: A path with no non-empty segment has basename ""

it("[boundary-4] basename of root-only and empty paths is empty", () => {
  const rows = ["", "/", "//", "///", "\\", "\\\\"];
  for (const p of rows) {
    expect(basename(p)).to.equal("");
  }
});

it("[boundary-4] basename of a path made only of mixed separators is empty", () => {
  expect(basename("/\\/\\")).to.equal("");
});

it("[boundary-5] basename does not apply an extension to an empty basename", () => {
  expect(basename("/", ".html")).to.equal("");
});

it("[boundary-5] basename of an empty or backslash-only path with an extension is empty", () => {
  expect(basename("", ".html")).to.equal("");
  expect(basename("\\\\", ".html")).to.equal("");
});

// Rule: A drive letter is an ordinary segment, as it already is without a trailing separator

it("[boundary-6] basename of a drive-letter-only path is the drive", () => {
  const rows: [string, string][] = [
    ["C:", "C:"],
    ["C:\\", "C:"],
    ["C:/", "C:"],
    ["c:\\", "C:"],
  ];
  for (const [p, result] of rows) {
    expect(basename(p)).to.equal(result);
  }
});

it("[boundary-6] basename of a drive root with repeated trailing separators is the drive", () => {
  expect(basename("C:\\\\")).to.equal("C:");
  expect(basename("c:/\\")).to.equal("C:");
});

// Rule: The extension is matched against the segment without its trailing separators

it("[happy-3] basename removes a matching extension after skipping trailing separators", () => {
  const rows: [string, string, string][] = [
    ["/temp/myfile.html/", ".html", "myfile"],
    ["/temp/myfile.html//", ".html", "myfile"],
    ["C:\\temp\\myfile.html\\", ".html", "myfile"],
    ["/temp/myfile.html/", ".txt", "myfile.html"],
    ["/temp/myfile.html/", "html", "myfile."],
  ];
  for (const [p, extension, result] of rows) {
    expect(basename(p, extension)).to.equal(result);
  }
});

it("[happy-3] basename removes a matching extension after mixed trailing separators", () => {
  expect(basename(String.raw`C:\temp\myfile.html\/`, ".html")).to.equal(
    "myfile",
  );
  expect(basename("/temp/myfile.html\\", ".txt")).to.equal(
    "myfile.html",
  );
});

it("[boundary-7] basename never matches an extension containing a separator", () => {
  expect(basename("/temp/myfile.html/", ".html/")).to.equal("myfile.html");
});

it("[boundary-7] basename never matches an extension that is only a separator", () => {
  expect(basename("/temp/myfile.html/", "/")).to.equal("myfile.html");
  expect(basename("/temp/myfile.html//", "//")).to.equal("myfile.html");
});

it("[boundary-8] basename with an empty extension removes nothing", () => {
  expect(basename("/temp/myfile.html/", "")).to.equal("myfile.html");
});

it("[boundary-8] basename with an empty extension after a backslash-terminated path removes nothing", () => {
  expect(basename("C:\\temp\\", "")).to.equal("temp");
});

it("[boundary-9] basename leaves an empty result when the extension equals the whole segment", () => {
  const rows: [string, string][] = [
    ["/a/bbb", "bbb"],
    ["/a/bbb/", "bbb"],
    ["/a/.html/", ".html"],
  ];
  for (const [p, extension] of rows) {
    expect(basename(p, extension)).to.equal("");
  }
});

it("[boundary-9] basename leaves an empty result when the extension equals a segment followed by repeated backslashes", () => {
  expect(basename("C:\\a\\bbb\\\\", "bbb")).to.equal("");
});

// Rule: parse takes base, ext and name from the trailing-separator-aware basename

it("[happy-4] parse of a POSIX directory path with a trailing separator", () => {
  expect(parse("/home/user/dir/")).to.deep.equal({
    root: "/",
    dir: "/home/user",
    base: "dir",
    ext: "",
    name: "dir",
  });
});

it("[happy-4] parse of a POSIX directory path ending in a backslash takes base from basename", () => {
  const p = "/home/user/dir\\";
  expect(parse(p)).to.deep.equal({
    root: "/",
    dir: dirname(p),
    base: "dir",
    ext: "",
    name: "dir",
  });
});

it("[happy-5] parse of a file-like segment with a trailing separator keeps its extension", () => {
  expect(parse("/home/user/file.txt/")).to.deep.equal({
    root: "/",
    dir: "/home/user",
    base: "file.txt",
    ext: ".txt",
    name: "file",
  });
});

it("[happy-5] parse of a dotfile segment with a trailing separator has no extension", () => {
  expect(parse("/home/user/.bashrc/")).to.deep.equal({
    root: "/",
    dir: "/home/user",
    base: ".bashrc",
    ext: "",
    name: ".bashrc",
  });
});

it("[happy-6] parse of a Windows path with a trailing separator", () => {
  expect(parse("C:\\path\\dir\\")).to.deep.equal({
    root: "C:",
    dir: "C:/path",
    base: "dir",
    ext: "",
    name: "dir",
  });
});

it("[happy-6] parse of a lowercase-drive Windows path with a forward trailing separator", () => {
  expect(parse("c:\\path\\dir/")).to.deep.equal({
    root: "C:",
    dir: "C:/path",
    base: "dir",
    ext: "",
    name: "dir",
  });
});

it("[boundary-10] parse keeps dir from dirname, which removes only one trailing separator", () => {
  expect(parse("/a/b//")).to.deep.equal({
    root: "/",
    dir: "/a/b",
    base: "b",
    ext: "",
    name: "b",
  });
});

it("[boundary-10] parse of a backslash path with two trailing separators keeps dir from dirname", () => {
  const p = String.raw`C:\temp\myfile.html\\`;
  expect(parse(p)).to.deep.equal({
    root: "C:",
    dir: dirname(p),
    base: "myfile.html",
    ext: ".html",
    name: "myfile",
  });
});

it("[boundary-11] parse of a root-only path", () => {
  expect(parse("/")).to.deep.equal({
    root: "/",
    dir: "/",
    base: "",
    ext: "",
    name: "",
  });
});

it("[boundary-11] parse of a doubled root-only path has empty base, ext and name", () => {
  expect(parse("//")).to.deep.equal({
    root: "/",
    dir: dirname("//"),
    base: "",
    ext: "",
    name: "",
  });
});

it("[happy-7] parse keeps its existing results for paths without a trailing separator", () => {
  const rows: [string, Record<string, string>][] = [
    [
      "/home/user/dir/file.txt",
      {
        root: "/",
        dir: "/home/user/dir",
        base: "file.txt",
        ext: ".txt",
        name: "file",
      },
    ],
    [
      "./dir/file",
      { root: ".", dir: "./dir", base: "file", ext: "", name: "file" },
    ],
    [
      String.raw`C:\path\dir\file.txt`,
      {
        root: "C:",
        dir: "C:/path/dir",
        base: "file.txt",
        ext: ".txt",
        name: "file",
      },
    ],
    [
      String.raw`.\dir\file`,
      { root: ".", dir: "./dir", base: "file", ext: "", name: "file" },
    ],
  ];
  for (const [p, result] of rows) {
    expect(parse(p)).to.deep.equal(result);
  }
});

it("[happy-7] parse of a path with a doubled inner separator takes base, ext and name from the last segment", () => {
  const p = "/home//user/file.txt";
  expect(parse(p)).to.deep.equal({
    root: "/",
    dir: dirname(p),
    base: "file.txt",
    ext: ".txt",
    name: "file",
  });
});

// Rule: Other exports are not changed by this ticket

it("[boundary-12] extname and dirname keep their trailing-separator behaviour", () => {
  expect(extname("/temp/myfile.html/")).to.equal("");
  expect(dirname("/temp/")).to.equal("/");
  expect(dirname("C:\\temp\\")).to.equal("C:/");
  expect(dirname("/temp/myfile.html/")).to.equal("/temp");
});

it("[boundary-12] extname of a backslash-terminated Windows path stays empty", () => {
  expect(extname("C:\\temp\\myfile.html\\")).to.equal("");
});
