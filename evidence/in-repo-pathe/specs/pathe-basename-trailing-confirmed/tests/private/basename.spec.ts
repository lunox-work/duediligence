import { expect, it } from "vitest";

import { basename } from "../../src/path";

// Rule: Paths without a trailing separator keep their current result

// Extends "[happy-1] basename keeps its existing results for paths without a trailing separator"
it("[happy-1] basename keeps existing results for deeper and multi-dot paths without a trailing separator", () => {
  const rows: [string, string | undefined, string][] = [
    ["/a/b/c/d/e/f/g.txt", undefined, "g.txt"],
    ["/a/b/archive.tar.gz", undefined, "archive.tar.gz"],
    ["/a/b/archive.tar.gz", ".gz", "archive.tar"],
    ["/a/b/archive.tar.gz", ".tar.gz", "archive"],
    ["D:\\x\\y\\z.md", ".md", "z"],
    ["\\\\server\\share\\file.txt", undefined, "file.txt"],
    ["/temp/myfile.html", ".txt", "myfile.html"],
  ];
  for (const [p, extension, result] of rows) {
    expect(basename(p, extension)).to.equal(result);
  }
});

// Rule: One or more trailing separators, "/" or "\" in any mix, are ignored

// Extends "[happy-2] basename returns the segment before a trailing separator"
it("[happy-2] basename returns the last segment of deeper paths with one trailing separator", () => {
  const rows: [string, string][] = [
    ["/a/b/c/d/e/", "e"],
    ["a/b/", "b"],
    ["/x.html/temp/", "temp"],
    ["/a/b.c.d/", "b.c.d"],
    ["D:\\projects\\app\\src\\", "src"],
    ["relative\\dir\\", "dir"],
    ["//server/share/folder/", "folder"],
    ["\\\\server\\share\\folder\\", "folder"],
    ["//server/", "server"],
    ["/tmp/日本語/", "日本語"],
    ["/tmp/with space/", "with space"],
  ];
  for (const [p, result] of rows) {
    expect(basename(p)).to.equal(result);
  }
});

// Extends "[happy-2] basename returns the segment before a trailing separator":
// a mixed backslash-then-slash single trailing separator on a POSIX path
it("[happy-2] basename returns the segment before a trailing backslash on a POSIX-style path", () => {
  expect(basename("/temp\\")).to.equal("temp");
  expect(basename("/a/b/c\\")).to.equal("c");
});

// Extends "[happy-2] basename returns the segment before a trailing separator":
// whitespace is a non-empty segment and is kept as it is
it("[happy-2] basename keeps whitespace in the segment before a trailing separator", () => {
  expect(basename("/temp /")).to.equal("temp ");
  expect(basename("/a/ /")).to.equal(" ");
});

// Extends "[happy-1] basename with the extension left out matches an undefined extension"
it("[happy-2] basename with the extension left out equals an undefined extension for trailing-separator paths", () => {
  const paths = ["/temp/", "C:\\temp\\myfile.html\\", "//server/share/"];
  for (const p of paths) {
    expect(basename(p)).to.equal(basename(p, undefined));
  }
  expect(basename("C:\\temp\\myfile.html\\", undefined)).to.equal(
    "myfile.html",
  );
});

// Extends "[boundary-1] basename skips repeated and mixed trailing separators"
it("[boundary-1] basename skips a long run of trailing slashes", () => {
  expect(basename("/temp" + "/".repeat(50))).to.equal("temp");
  expect(basename("temp" + "\\".repeat(50))).to.equal("temp");
  expect(basename("/a/b/temp" + "/\\".repeat(25))).to.equal("temp");
});

// Extends "[boundary-1] basename skips repeated and mixed trailing separators"
it("[boundary-1] basename skips two and three trailing separators in each mix", () => {
  const rows: [string, string][] = [
    ["/temp\\\\", "temp"],
    ["/temp/\\", "temp"],
    ["/temp\\/", "temp"],
    ["C:\\temp\\/\\", "temp"],
    ["\\\\server\\share\\\\\\", "share"],
    ["//server/share///", "share"],
    ["a/b/c//", "c"],
  ];
  for (const [p, result] of rows) {
    expect(basename(p)).to.equal(result);
  }
});

// Extends "[boundary-1] basename skips repeated and mixed trailing separators":
// a long path with many segments
it("[boundary-1] basename of a long path with many segments and trailing separators", () => {
  const segments = Array.from({ length: 200 }, (_, index) => `seg${index}`);
  expect(basename("/" + segments.join("/") + "///")).to.equal("seg199");
  expect(basename(segments.join("\\") + "\\\\")).to.equal("seg199");
});

// Rule: Empty segments in the middle of a path do not affect the result

// Extends "[boundary-2] basename ignores doubled inner separators"
it("[boundary-2] basename ignores many empty inner segments before trailing separators", () => {
  const rows: [string, string][] = [
    ["/a////b////", "b"],
    ["/a//b//c//", "c"],
    ["C:\\\\a\\\\\\b\\\\", "b"],
    ["a/\\/\\b/\\", "b"],
    ["//a//", "a"],
  ];
  for (const [p, result] of rows) {
    expect(basename(p)).to.equal(result);
  }
});

// Rule: "." and ".." segments are returned literally, without resolving them

// Extends "[boundary-3] basename returns dot segments literally"
it("[boundary-3] basename returns dot segments literally in deeper and Windows paths", () => {
  const rows: [string, string][] = [
    ["a/b/c/../../", ".."],
    ["/a/./b/./", "."],
    ["/..//", ".."],
    ["/a/.../", "..."],
    ["C:\\temp\\..\\", ".."],
    ["C:\\.\\", "."],
    ["./././", "."],
    ["../../", ".."],
  ];
  for (const [p, result] of rows) {
    expect(basename(p)).to.equal(result);
  }
});

// Rule: A path with no non-empty segment has basename ""

// Extends "[boundary-4] basename of root-only and empty paths is empty"
it("[boundary-4] basename of long separator-only paths is empty", () => {
  const rows = [
    "/".repeat(20),
    "\\".repeat(20),
    "\\/".repeat(10),
    "////",
    "\\\\\\",
    "\\/",
  ];
  for (const p of rows) {
    expect(basename(p)).to.equal("");
  }
});

// Extends "[boundary-5] basename does not apply an extension to an empty basename"
it("[boundary-5] basename of separator-only paths with an extension is empty", () => {
  expect(basename("///", ".html")).to.equal("");
  expect(basename("\\", ".html")).to.equal("");
  expect(basename("//", "/")).to.equal("");
  expect(basename("/\\/", "html")).to.equal("");
});

// Rule: A drive letter is an ordinary segment, as it already is without a trailing separator

// Extends "[boundary-6] basename of a drive-letter-only path is the drive"
it("[boundary-6] basename of other drive roots is the upper-cased drive", () => {
  const rows: [string, string][] = [
    ["D:/", "D:"],
    ["d:\\", "D:"],
    ["z:/", "Z:"],
    ["C:/\\/", "C:"],
    ["C:" + "\\".repeat(10), "C:"],
  ];
  for (const [p, result] of rows) {
    expect(basename(p)).to.equal(result);
  }
});

// Rule: The extension is matched against the segment without its trailing separators

// Extends "[happy-3] basename removes a matching extension after skipping trailing separators"
it("[happy-3] basename removes multi-part and partial extensions after trailing separators", () => {
  const rows: [string, string, string][] = [
    ["C:\\temp\\archive.tar.gz\\\\", ".gz", "archive.tar"],
    ["C:\\temp\\archive.tar.gz\\\\", ".tar.gz", "archive"],
    ["/temp/myfile.html/", "l", "myfile.htm"],
    ["/temp/myfile.html/", "myfile", "myfile.html"],
    ["/x.html/temp/", ".html", "temp"],
    ["/a/b.html" + "/".repeat(20), ".html", "b"],
    ["//server/share.d/", ".d", "share"],
  ];
  for (const [p, extension, result] of rows) {
    expect(basename(p, extension)).to.equal(result);
  }
});

// Extends "[boundary-7] basename never matches an extension containing a separator"
it("[boundary-7] basename never matches an extension ending in a backslash or a mixed separator", () => {
  expect(basename("C:\\temp\\myfile.html\\", ".html\\")).to.equal(
    "myfile.html",
  );
  expect(basename("/temp/myfile.html/", ".html\\")).to.equal("myfile.html");
  expect(basename("/temp/myfile.html//", ".html//")).to.equal("myfile.html");
  expect(basename("/temp/myfile.html\\/", ".html\\/")).to.equal(
    "myfile.html",
  );
});

// Extends "[boundary-7] basename never matches an extension containing a separator"
it("[boundary-7] basename never matches an extension that spans a separator into the parent", () => {
  expect(basename("/temp/myfile.html/", "temp/myfile.html")).to.equal(
    "myfile.html",
  );
  expect(basename("/temp/myfile.html/", "/myfile.html")).to.equal(
    "myfile.html",
  );
  expect(basename("/temp/myfile.html/", "\\")).to.equal("myfile.html");
});

// Extends "[boundary-8] basename with an empty extension removes nothing"
it("[boundary-8] basename with an empty extension removes nothing after repeated separators", () => {
  expect(basename("/a/b//", "")).to.equal("b");
  expect(basename("C:\\", "")).to.equal("C:");
  expect(basename("foo/../", "")).to.equal("..");
  expect(basename("/temp/myfile.html" + "\\".repeat(5), "")).to.equal(
    "myfile.html",
  );
});

// Extends "[boundary-9] basename leaves an empty result when the extension equals the whole segment"
it("[boundary-9] basename leaves an empty result for whole-segment extensions after repeated separators", () => {
  const rows: [string, string][] = [
    ["/a/bbb//", "bbb"],
    ["temp/", "temp"],
    ["C:\\a\\.html\\\\", ".html"],
    ["C:/", "C:"],
    ["/a/b/myfile.html" + "/".repeat(10), "myfile.html"],
  ];
  for (const [p, extension] of rows) {
    expect(basename(p, extension)).to.equal("");
  }
});
