import { expect, it } from "vitest";

import { basename } from "../../src/path";

// Rule: Paths without a trailing separator keep their current result

it("[happy-1] basename returns the last segment of every listed path without a trailing separator", () => {
  expect(basename("/temp/myfile.html")).to.equal("myfile.html");
  expect(basename("./myfile.html")).to.equal("myfile.html");
  expect(basename("./myfile.html", ".html")).to.equal("myfile");
  expect(basename("./undefined")).to.equal("undefined");
  expect(basename(String.raw`C:\temp\myfile.html`)).to.equal("myfile.html");
  expect(basename(String.raw`\temp\myfile.html`)).to.equal("myfile.html");
  expect(basename(String.raw`.\myfile.html`, ".html")).to.equal("myfile");
  expect(basename("myfile.html")).to.equal("myfile.html");
});

// Extends "[happy-1] basename keeps its existing results ...": other paths
// and depths, UNC and mixed separators, no trailing separator.
it("[happy-1] basename keeps the last segment of deeper and mixed-separator paths", () => {
  expect(basename("/a/b/c/d/e.f.g")).to.equal("e.f.g");
  expect(basename("a.b/c")).to.equal("c");
  expect(basename(".hidden")).to.equal(".hidden");
  expect(basename("/home/user/.bashrc")).to.equal(".bashrc");
  expect(basename(String.raw`\\server\share\file.txt`)).to.equal("file.txt");
  expect(basename(String.raw`C:/temp\sub/deep\file`)).to.equal("file");
  expect(basename("/x")).to.equal("x");
  expect(basename("x")).to.equal("x");
});

// Extends "[happy-1] basename keeps its existing results ...": other
// extensions, matching and not matching, without a trailing separator.
it("[happy-1] basename removes only a suffix the last segment ends with, without a trailing separator", () => {
  expect(basename("/a/b.tar.gz", ".gz")).to.equal("b.tar");
  expect(basename("/a/b.tar.gz", ".tar.gz")).to.equal("b");
  expect(basename("/a/b.tar.gz", ".tar")).to.equal("b.tar.gz");
  expect(basename("/temp/myfile.html", ".HTML")).to.equal("myfile.html");
  expect(basename("/temp/myfile.html", "html")).to.equal("myfile.");
  expect(basename("/aaa/bbb", "a")).to.equal("bbb");
  expect(basename(String.raw`C:\temp\myfile.html`, ".html")).to.equal("myfile");
});

// Extends "[happy-1] basename treats an undefined extension like an omitted one".
it("[happy-1] basename treats an undefined extension like an omitted one on other paths", () => {
  expect(basename("/temp/undefined", undefined)).to.equal("undefined");
  expect(basename(String.raw`C:\temp\myfile.html`, undefined)).to.equal(
    "myfile.html",
  );
  expect(basename("/a/b.tar.gz", undefined)).to.equal("b.tar.gz");
});

// Rule: One or more trailing separators, "/" or "\" in any mix, are ignored

// Extends "[happy-2] basename returns the segment before a trailing separator":
// other names and depths.
it("[happy-2] basename returns the segment before a trailing separator for other names and depths", () => {
  expect(basename("a/")).to.equal("a");
  expect(basename("/a/")).to.equal("a");
  expect(basename("/a/b/c/d/")).to.equal("d");
  expect(basename("/var/log/nginx/")).to.equal("nginx");
  expect(basename("relative/path/to/dir/")).to.equal("dir");
  expect(basename("/home/user/.config/")).to.equal(".config");
  expect(basename("/temp/my file/")).to.equal("my file");
  expect(basename("/données/日本/")).to.equal("日本");
});

// Extends "[happy-2] basename returns the segment before a trailing separator":
// a backslash after a "/" path, and a "/" after a "\" path.
it("[happy-2] basename treats a trailing backslash on a slash path as a separator", () => {
  expect(basename("/temp/dir\\")).to.equal("dir");
  expect(basename("temp\\")).to.equal("temp");
  expect(basename(String.raw`C:\temp\dir/`)).to.equal("dir");
  expect(basename("a\\b\\c\\")).to.equal("c");
  expect(basename("D:\\Users\\me\\Documents\\")).to.equal("Documents");
});

// Extends "[happy-2] basename returns the share of a UNC path ...": a server
// with no share, and more leading separators.
it("[happy-2] basename returns the last name of other UNC-style paths with a trailing separator", () => {
  expect(basename("//server/")).to.equal("server");
  expect(basename("\\\\server\\")).to.equal("server");
  expect(basename("//server/share/dir/")).to.equal("dir");
  expect(basename("\\\\server\\share\\dir\\file.txt\\")).to.equal(
    "file.txt",
  );
});

// A lowercase drive later in the path is not a drive prefix, so
// normalizeWindowsPath leaves it as it is.
it("[happy-2] basename returns a drive-like segment after the start of the path unchanged", () => {
  expect(basename("/c:/")).to.equal("c:");
  expect(basename("\\c:\\")).to.equal("c:");
  expect(basename("/x/c:/")).to.equal("c:");
});

// Extends "[boundary-1] basename skips repeated trailing separators": longer runs.
it("[boundary-1] basename skips long runs of trailing slashes", () => {
  expect(basename("/temp////")).to.equal("temp");
  expect(basename("/temp/////")).to.equal("temp");
  expect(basename(`/temp${"/".repeat(50)}`)).to.equal("temp");
  expect(basename(`temp${"/".repeat(7)}`)).to.equal("temp");
});

// Extends "[boundary-1] basename skips repeated trailing separators": long
// runs of backslashes only.
it("[boundary-1] basename skips long runs of trailing backslashes", () => {
  expect(basename("C:\\temp\\\\\\")).to.equal("temp");
  expect(basename("C:\\temp\\\\\\\\")).to.equal("temp");
  expect(basename(`C:\\temp${"\\".repeat(40)}`)).to.equal("temp");
  expect(basename("\\temp\\\\\\\\\\")).to.equal("temp");
});

// Extends "[boundary-1] basename skips a mixed run of trailing slashes and
// backslashes": other orders and lengths.
it("[boundary-1] basename skips mixed trailing runs in other orders", () => {
  expect(basename("/temp\\/")).to.equal("temp");
  expect(basename("/temp/\\")).to.equal("temp");
  expect(basename("/temp//\\\\")).to.equal("temp");
  expect(basename("/temp\\\\//")).to.equal("temp");
  expect(basename(String.raw`C:\temp/\/\/\/`)).to.equal("temp");
  expect(basename(`/a/b/temp${"\\/".repeat(25)}`)).to.equal("temp");
});

// Rule: Empty segments in the middle of a path do not affect the result

// Extends "[boundary-2] basename ignores doubled inner separators": more and
// longer empty runs, before and after the last segment.
it("[boundary-2] basename ignores many empty inner segments", () => {
  expect(basename("///a")).to.equal("a");
  expect(basename("a///b///c")).to.equal("c");
  expect(basename("a///b///c///")).to.equal("c");
  expect(basename("//a//b//c//")).to.equal("c");
  expect(basename("a\\\\\\b\\\\\\")).to.equal("b");
  expect(basename(String.raw`\\\a\/\b/\/`)).to.equal("b");
});

it("[boundary-2] basename returns the last segment of a long path with a trailing run", () => {
  const segments = Array.from({ length: 500 }, (_, index) => `seg${index}`);
  expect(basename(`/${segments.join("//")}${"/".repeat(30)}`)).to.equal(
    "seg499",
  );
  expect(basename(`${segments.join("\\\\")}\\\\`)).to.equal("seg499");
});

// Rule: "." and ".." segments are returned literally

// Extends "[boundary-3] basename returns dot segments literally": backslash
// forms and repeated trailing separators.
it("[boundary-3] basename returns dot segments literally with backslashes and repeated separators", () => {
  expect(basename(".\\")).to.equal(".");
  expect(basename("..\\")).to.equal("..");
  expect(basename(".//")).to.equal(".");
  expect(basename("..\\\\")).to.equal("..");
  expect(basename("/./")).to.equal(".");
  expect(basename("/../")).to.equal("..");
  expect(basename("foo\\.\\")).to.equal(".");
  expect(basename("foo\\bar\\..\\\\")).to.equal("..");
});

// Extends "[boundary-3] basename does not resolve a trailing parent segment
// ...": longer chains of dot segments that would resolve to something else.
it("[boundary-3] basename does not resolve chains of dot segments", () => {
  expect(basename("a/b/c/../../")).to.equal("..");
  expect(basename("a/b/../c/./")).to.equal(".");
  expect(basename("/a/../b/")).to.equal("b");
  expect(basename("a/.../")).to.equal("...");
  expect(basename("a/..b/")).to.equal("..b");
});

// Rule: A path with no non-empty segment has basename ""

it("[boundary-4] basename of every listed root-only or empty path is empty", () => {
  expect(basename("")).to.equal("");
  expect(basename("/")).to.equal("");
  expect(basename("//")).to.equal("");
  expect(basename("///")).to.equal("");
  expect(basename("\\")).to.equal("");
  expect(basename("\\\\")).to.equal("");
});

// Extends "[boundary-4] basename of a root-only path is empty": longer and
// mixed runs of separators only.
it("[boundary-4] basename of a long or mixed run of separators only is empty", () => {
  expect(basename("////")).to.equal("");
  expect(basename("/".repeat(64))).to.equal("");
  expect(basename("\\\\\\")).to.equal("");
  expect(basename("\\".repeat(64))).to.equal("");
  expect(basename("/\\")).to.equal("");
  expect(basename("\\/\\/\\/")).to.equal("");
});

// Extends "[boundary-5] basename does not apply an extension to an empty
// basename": other extensions and other separator-only paths.
it("[boundary-5] basename with an extension stays empty for every separator-only path", () => {
  expect(basename("/", ".html")).to.equal("");
  expect(basename("///", ".html")).to.equal("");
  expect(basename("\\\\", ".html")).to.equal("");
  expect(basename("/\\/", ".html")).to.equal("");
  expect(basename("", ".html")).to.equal("");
  expect(basename("/", "/")).to.equal("");
  expect(basename("//", "x")).to.equal("");
});

// Rule: A drive letter is an ordinary segment

// Extends "[boundary-6] basename of a drive-letter-only path is the drive":
// other letters and repeated separators.
it("[boundary-6] basename of other drive roots is the drive", () => {
  expect(basename("D:\\")).to.equal("D:");
  expect(basename("Z:/")).to.equal("Z:");
  expect(basename("C:\\\\")).to.equal("C:");
  expect(basename("C://")).to.equal("C:");
  expect(basename("C:/\\/")).to.equal("C:");
  expect(basename("D:")).to.equal("D:");
});

// Extends "[boundary-6] basename uppercases a lowercase drive root": the
// uppercasing comes from normalizeWindowsPath, which needs the separator, so
// it must run before the trailing separators are dropped.
it("[boundary-6] basename uppercases other lowercase drive roots", () => {
  expect(basename("c:/")).to.equal("C:");
  expect(basename("d:\\")).to.equal("D:");
  expect(basename("x:\\\\\\")).to.equal("X:");
  expect(basename("e:/\\")).to.equal("E:");
  expect(basename("c:")).to.equal("c:");
});

// Rule: The extension is matched against the segment without its trailing separators

it("[happy-3] basename handles every listed extension case after a trailing separator", () => {
  expect(basename("/temp/myfile.html/", ".html")).to.equal("myfile");
  expect(basename("/temp/myfile.html//", ".html")).to.equal("myfile");
  expect(basename("C:\\temp\\myfile.html\\", ".html")).to.equal(
    "myfile",
  );
  expect(basename("/temp/myfile.html/", ".txt")).to.equal("myfile.html");
  expect(basename("/temp/myfile.html/", "html")).to.equal("myfile.");
});

// Extends "[happy-3] basename removes a matching extension after skipping
// trailing separators": longer and mixed runs, other extensions.
it("[happy-3] basename removes a matching extension after long and mixed trailing runs", () => {
  expect(basename("/temp/myfile.html///", ".html")).to.equal("myfile");
  expect(basename(`/temp/myfile.html${"/".repeat(20)}`, ".html")).to.equal(
    "myfile",
  );
  expect(basename("/temp/myfile.html\\/\\", ".html")).to.equal("myfile");
  expect(basename("C:\\temp\\myfile.html\\\\\\", ".html")).to.equal(
    "myfile",
  );
  expect(basename("/a/b.tar.gz/", ".gz")).to.equal("b.tar");
  expect(basename("/a/b.tar.gz//", ".tar.gz")).to.equal("b");
  expect(basename("/a/b.tar.gz/", "z")).to.equal("b.tar.g");
});

// Extends "[happy-3] basename removes only an extension the segment actually
// ends with": suffixes that occur elsewhere, differ in case, or are longer
// than the segment.
it("[happy-3] basename keeps the segment when it does not end with the extension", () => {
  expect(basename("/temp/myfile.html/", ".HTML")).to.equal("myfile.html");
  expect(basename("/a/b.tar.gz/", ".tar")).to.equal("b.tar.gz");
  expect(basename("/a/b/", "xb")).to.equal("b");
  expect(basename("/a/b//", "a/b")).to.equal("b");
  expect(basename("/temp/myfile.html/", "myfile")).to.equal("myfile.html");
});

it("[happy-3] basename removes an extension from a drive or dot segment after a trailing separator", () => {
  expect(basename("C:\\", ":")).to.equal("C");
  expect(basename("../", ".")).to.equal(".");
  expect(basename("/home/.config/", "config")).to.equal(".");
});

// Extends "[boundary-7] basename never matches an extension containing a
// separator": backslash forms and longer separator runs.
it("[boundary-7] basename never matches an extension ending in a backslash or a separator run", () => {
  expect(basename("/temp/myfile.html\\", ".html\\")).to.equal("myfile.html");
  expect(basename("C:\\temp\\myfile.html\\", ".html\\")).to.equal(
    "myfile.html",
  );
  expect(basename("/temp/myfile.html//", ".html//")).to.equal("myfile.html");
  expect(basename("/temp/myfile.html//", ".html/")).to.equal("myfile.html");
  expect(basename("/temp/myfile.html/", "\\")).to.equal("myfile.html");
  expect(basename("/temp/myfile.html\\", "/")).to.equal("myfile.html");
});

it("[boundary-7] basename never matches an extension spanning more than the last segment", () => {
  expect(basename("/temp/myfile.html/", "temp/myfile.html/")).to.equal(
    "myfile.html",
  );
  expect(basename("/temp/myfile.html/", "/myfile.html")).to.equal(
    "myfile.html",
  );
  expect(basename("/a/b/", "a/b/")).to.equal("b");
  expect(basename("/a/b/", "/a/b/")).to.equal("b");
});

// Extends "[boundary-8] basename with an empty extension removes nothing":
// other separators and paths.
it("[boundary-8] basename with an empty extension removes nothing after other trailing runs", () => {
  expect(basename("/temp/myfile.html\\", "")).to.equal("myfile.html");
  expect(basename("C:\\temp\\myfile.html\\\\", "")).to.equal(
    "myfile.html",
  );
  expect(basename("/a//b///", "")).to.equal("b");
  expect(basename("../", "")).to.equal("..");
  expect(basename("C:/", "")).to.equal("C:");
});

it("[boundary-8] basename with an empty extension removes nothing from a short segment or a separator-only path", () => {
  expect(basename("/temp/", "")).to.equal("temp");
  expect(basename("//", "")).to.equal("");
});

it("[boundary-9] basename leaves an empty string for every listed whole-segment extension", () => {
  expect(basename("/a/bbb", "bbb")).to.equal("");
  expect(basename("/a/bbb/", "bbb")).to.equal("");
  expect(basename("/a/.html/", ".html")).to.equal("");
});

// Extends "[boundary-9] basename leaves an empty string when the extension
// equals the whole segment": longer and mixed trailing runs, other names.
it("[boundary-9] basename leaves an empty string for a whole-segment extension after long trailing runs", () => {
  expect(basename("/a/bbb///", "bbb")).to.equal("");
  expect(basename("C:\\a\\bbb\\\\", "bbb")).to.equal("");
  expect(basename("/a/myfile.html\\/", "myfile.html")).to.equal("");
  expect(basename("C:\\", "C:")).to.equal("");
  expect(basename("../", "..")).to.equal("");
});
