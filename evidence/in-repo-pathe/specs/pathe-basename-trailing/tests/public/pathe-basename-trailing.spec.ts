import { expect, it } from "vitest";

import { basename, dirname, extname, parse } from "../src/path";

// Rule: Paths without a trailing separator keep their current result

it("[happy-1] basename keeps its existing results for paths without a trailing separator", () => {
  expect(basename("/temp/myfile.html")).to.equal("myfile.html");
  expect(basename("./myfile.html")).to.equal("myfile.html");
  expect(basename("./myfile.html", ".html")).to.equal("myfile");
  expect(basename(String.raw`C:\temp\myfile.html`)).to.equal("myfile.html");
  expect(basename(String.raw`\temp\myfile.html`)).to.equal("myfile.html");
  expect(basename(String.raw`.\myfile.html`, ".html")).to.equal("myfile");
  expect(basename("myfile.html")).to.equal("myfile.html");
});

it("[happy-1] basename treats an undefined extension like an omitted one", () => {
  expect(basename("./undefined", undefined)).to.equal("undefined");
  expect(basename("./undefined")).to.equal("undefined");
  expect(basename("./myfile.html", undefined)).to.equal("myfile.html");
});

// Rule: One or more trailing separators, "/" or "\" in any mix, are ignored

it("[happy-2] basename returns the segment before a trailing separator", () => {
  expect(basename("/temp/")).to.equal("temp");
  expect(basename("/temp/myfile.html/")).to.equal("myfile.html");
  expect(basename("temp/")).to.equal("temp");
  expect(basename("C:\\temp\\")).to.equal("temp");
  expect(basename("C:\\temp\\myfile.html\\")).to.equal("myfile.html");
  expect(basename("\\temp\\")).to.equal("temp");
});

it("[happy-2] basename returns the share of a UNC path with a trailing separator", () => {
  expect(basename("//server/share/")).to.equal("share");
  expect(basename("\\\\server\\share\\")).to.equal("share");
});

it("[boundary-1] basename skips repeated trailing separators", () => {
  expect(basename("/temp//")).to.equal("temp");
  expect(basename("/temp///")).to.equal("temp");
  expect(basename("C:\\temp\\\\")).to.equal("temp");
});

it("[boundary-1] basename skips a mixed run of trailing slashes and backslashes", () => {
  expect(basename("/temp\\/\\")).to.equal("temp");
});

// Rule: Empty segments in the middle of a path do not affect the result

it("[boundary-2] basename ignores doubled inner separators", () => {
  expect(basename("/a//b")).to.equal("b");
  expect(basename("/a//b//")).to.equal("b");
});

it("[boundary-2] basename ignores doubled inner backslashes with a trailing backslash", () => {
  expect(basename("a\\\\b\\")).to.equal("b");
});

// Rule: "." and ".." segments are returned literally

it("[boundary-3] basename returns dot segments literally", () => {
  expect(basename("./")).to.equal(".");
  expect(basename("../")).to.equal("..");
  expect(basename("foo/./")).to.equal(".");
  expect(basename("foo/bar/..")).to.equal("..");
});

it("[boundary-3] basename does not resolve a trailing parent segment followed by a separator", () => {
  expect(basename("foo/bar/../")).to.equal("..");
});

// Rule: A path with no non-empty segment has basename ""

it("[boundary-4] basename of a root-only path is empty", () => {
  expect(basename("/")).to.equal("");
  expect(basename("//")).to.equal("");
  expect(basename("///")).to.equal("");
  expect(basename("\\")).to.equal("");
  expect(basename("\\\\")).to.equal("");
});

it("[boundary-4] basename of the empty string is empty", () => {
  expect(basename("")).to.equal("");
});

it("[boundary-5] basename does not apply an extension to an empty basename", () => {
  expect(basename("/", ".html")).to.equal("");
});

it("[boundary-5] basename with an extension stays empty for repeated root separators", () => {
  expect(basename("//", ".html")).to.equal("");
  expect(basename("\\", ".html")).to.equal("");
});

// Rule: A drive letter is an ordinary segment

it("[boundary-6] basename of a drive-letter-only path is the drive", () => {
  expect(basename("C:")).to.equal("C:");
  expect(basename("C:\\")).to.equal("C:");
  expect(basename("C:/")).to.equal("C:");
});

it("[boundary-6] basename uppercases a lowercase drive root", () => {
  expect(basename("c:\\")).to.equal("C:");
});

// Rule: The extension is matched against the segment without its trailing separators

it("[happy-3] basename removes a matching extension after skipping trailing separators", () => {
  expect(basename("/temp/myfile.html/", ".html")).to.equal("myfile");
  expect(basename("/temp/myfile.html//", ".html")).to.equal("myfile");
  expect(basename("C:\\temp\\myfile.html\\", ".html")).to.equal(
    "myfile",
  );
});

it("[happy-3] basename removes only an extension the segment actually ends with", () => {
  expect(basename("/temp/myfile.html/", ".txt")).to.equal("myfile.html");
  expect(basename("/temp/myfile.html/", "html")).to.equal("myfile.");
});

it("[boundary-7] basename never matches an extension containing a separator", () => {
  expect(basename("/temp/myfile.html/", ".html/")).to.equal("myfile.html");
});

it("[boundary-7] basename never matches an extension that is only a separator", () => {
  expect(basename("/temp/myfile.html/", "/")).to.equal("myfile.html");
});

it("[boundary-8] basename with an empty extension removes nothing", () => {
  expect(basename("/temp/myfile.html/", "")).to.equal("myfile.html");
});

it("[boundary-8] basename with an empty extension still skips repeated trailing separators", () => {
  expect(basename("/temp//", "")).to.equal("temp");
});

it("[boundary-9] basename leaves an empty string when the extension equals the whole segment", () => {
  expect(basename("/a/bbb", "bbb")).to.equal("");
  expect(basename("/a/bbb/", "bbb")).to.equal("");
});

it("[boundary-9] basename leaves an empty string for a dot-file segment equal to the extension", () => {
  expect(basename("/a/.html/", ".html")).to.equal("");
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

it("[happy-4] parse of a POSIX directory path with a trailing backslash", () => {
  expect(parse("/home/user/dir\\")).to.deep.equal({
    root: "/",
    dir: "/home/user",
    base: "dir",
    ext: "",
    name: "dir",
  });
});

it("[happy-5] parse keeps the extension of a file-like segment with a trailing separator", () => {
  expect(parse("/home/user/file.txt/")).to.deep.equal({
    root: "/",
    dir: "/home/user",
    base: "file.txt",
    ext: ".txt",
    name: "file",
  });
});

it("[happy-5] parse takes only the last extension of a multi-dot segment with a trailing separator", () => {
  expect(parse("/home/user/archive.tar.gz/")).to.deep.equal({
    root: "/",
    dir: "/home/user",
    base: "archive.tar.gz",
    ext: ".gz",
    name: "archive.tar",
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

it("[happy-6] parse of a lowercase-drive Windows path with a trailing separator", () => {
  expect(parse("c:\\path\\dir\\")).to.deep.equal({
    root: "C:",
    dir: "C:/path",
    base: "dir",
    ext: "",
    name: "dir",
  });
});

it("[boundary-10] parse takes dir from dirname, which removes only one trailing separator", () => {
  expect(parse("/a/b//")).to.deep.equal({
    root: "/",
    dir: "/a/b",
    base: "b",
    ext: "",
    name: "b",
  });
});

it("[boundary-10] parse of a Windows path with two trailing backslashes", () => {
  expect(parse("C:\\a\\b\\\\")).to.deep.equal({
    root: "C:",
    dir: "C:/a/b",
    base: "b",
    ext: "",
    name: "b",
  });
});

it("[boundary-11] parse of the root-only path", () => {
  expect(parse("/")).to.deep.equal({
    root: "/",
    dir: "/",
    base: "",
    ext: "",
    name: "",
  });
});

it("[boundary-11] parse of a backslash root-only path", () => {
  expect(parse("\\")).to.deep.equal({
    root: "/",
    dir: "/",
    base: "",
    ext: "",
    name: "",
  });
});

it("[happy-7] parse keeps its existing results for paths without a trailing separator", () => {
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
});

it("[happy-7] parse keeps its existing result for a relative backslash path", () => {
  expect(parse(String.raw`.\dir\file`)).to.deep.equal({
    root: ".",
    dir: "./dir",
    base: "file",
    ext: "",
    name: "file",
  });
});

// Rule: Other exports are not changed by this ticket

it("[boundary-12] extname and dirname keep their trailing-separator behaviour", () => {
  expect(extname("/temp/myfile.html/")).to.equal("");
  expect(dirname("/temp/")).to.equal("/");
  expect(dirname("/temp/myfile.html/")).to.equal("/temp");
});

it("[boundary-12] dirname of a Windows path with a trailing separator is the drive root", () => {
  expect(dirname("C:\\temp\\")).to.equal("C:/");
});
