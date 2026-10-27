import { expect, it } from "vitest";

import { extname } from "../../src/_path";

// [happy-1] extends public [happy-1]: longer names, deeper paths, other
// characters, and dots in earlier segments
for (const path of [
  "a.",
  "README.",
  "my file.",
  "archive.tar.gz.",
  "a.b.c.d.e.f.",
  "some/deep/nested/dir/index.",
  "/a/b/c/d/e/f/g/file.txt.",
  "../foo.",
  "../../foo.",
  "./../a/b.",
  "a/b/../c.",
  "a./b.",
  "a.b.c/d.e.f/g.",
  "1.",
  "-.",
  "файл.",
  "😀.",
  "x y z.",
  `${"a".repeat(1000)}.`,
  `${"dir/".repeat(200)}name.`,
]) {
  it(`[happy-1] hidden extname(${JSON.stringify(path)}) should be "."`, () => {
    expect(extname(path)).to.equal(".");
  });
}

// [happy-1] extends public [happy-1]: the trailing dot comes after an
// existing extension, so the previous extension must not be returned
it(`[happy-1] hidden extname("index.html.") is "." and not ".html"`, () => {
  expect(extname("index.html.")).to.equal(".");
  expect(extname("/srv/www/index.html.")).to.equal(".");
});

// [happy-2] extends public [happy-2]: other backslash and mixed separator
// layouts
for (const path of [
  String.raw`a\b\index.`,
  String.raw`..\foo.`,
  String.raw`D:\dir\sub\file.txt.`,
  String.raw`c:\temp\myfile.`,
  String.raw`a\b/c\d/e.`,
  String.raw`a/b\c.`,
  String.raw`\\server\share\file.`,
  String.raw`a.b\c.`,
  String.raw`.\.\x.`,
]) {
  it(`[happy-2] hidden extname(${JSON.stringify(path)}) should be "."`, () => {
    expect(extname(path)).to.equal(".");
  });
}

// [boundary-1] extends public [boundary-1]: longer runs of trailing dots,
// leading dots, and paths with directories
for (const path of [
  "foo....",
  `foo${".".repeat(50)}`,
  "...foo.",
  "...foo..",
  "a.b..",
  "a..b..",
  "dir/foo..",
  "/abs/dir/foo...",
  String.raw`C:\temp\foo..`,
  String.raw`dir\foo...`,
  "x..",
]) {
  it(`[boundary-1] hidden extname(${JSON.stringify(path)}) should be "."`, () => {
    expect(extname(path)).to.equal(".");
  });
}

// [boundary-2] extends public [boundary-2]: dotfiles inside directories,
// with backslashes, short names and several trailing dots
for (const path of [
  ".a.",
  ".a..",
  ".index...",
  ".foo.bar.",
  "dir/.index.",
  "/home/user/.bashrc.",
  String.raw`dir\.index.`,
  String.raw`C:\Users\me\.config.`,
  "./.hidden.",
]) {
  it(`[boundary-2] hidden extname(${JSON.stringify(path)}) should be "."`, () => {
    expect(extname(path)).to.equal(".");
  });
}

// [boundary-3] extends public [boundary-3]: other drive letters, lower case,
// more dots and a name after the colon
for (const path of ["D:.", "c:.", "z:.", "C:..", "C:...", "C:foo.", "C:foo.txt."]) {
  it(`[boundary-3] hidden extname(${JSON.stringify(path)}) should be "."`, () => {
    expect(extname(path)).to.equal(".");
  });
}

// [boundary-4] extends public [boundary-4]: longer runs of dots and runs
// after other separators give "."
for (const path of [
  ".....",
  `${".".repeat(64)}`,
  "a/.....",
  "a/b/c/...",
  "../...",
  "./...",
  String.raw`\...`,
  String.raw`dir\...`,
  String.raw`C:\...`,
  "C:/...",
  ".../...",
  "../../....",
]) {
  it(`[boundary-4] hidden extname(${JSON.stringify(path)}) should be "."`, () => {
    expect(extname(path)).to.equal(".");
  });
}

// [boundary-4] extends public [boundary-4]: "." and ".." as the last segment
// after other prefixes give "", paired with a "..." case of the same
// scenario, so a shortcut keyed on the raw input or the whole string fails
for (const [dotOnly, threeDots] of [
  [String.raw`dir\.`, String.raw`dir\...`],
  [String.raw`dir\..`, String.raw`dir\...`],
  [String.raw`\.`, String.raw`\...`],
  [String.raw`\..`, String.raw`\....`],
  ["C:/..", "C:/..."],
  [String.raw`C:\.`, String.raw`C:\...`],
  ["../..", "../..."],
  ["./.", "./..."],
  [".../..", ".../..."],
  ["..../.", "..../...."],
  ["a/b/c/..", "a/b/c/..."],
  ["foo./..", "foo./..."],
  [String.raw`a\b/..`, String.raw`a\b/...`],
] as const) {
  it(`[boundary-4] hidden extname(${JSON.stringify(dotOnly)}) should be "" and extname(${JSON.stringify(threeDots)}) should be "."`, () => {
    expect(extname(dotOnly)).to.equal("");
    expect(extname(threeDots)).to.equal(".");
  });
}

// [unhappy-1] extends public [unhappy-1]: more trailing separators, mixed
// separators, and names that would give "." or "..." without the separator
for (const path of [
  "index.///",
  "index.\\\\",
  "index./\\/",
  "a/b/index./",
  "/temp/myfile./",
  "C:\\temp\\myfile.\\",
  ".../",
  "...\\",
  "..../",
  ".index./",
  "foo../",
  "C:./",
  "file.txt/",
  "C:\\temp\\myfile.html\\",
  "/",
  "\\",
  "//",
  "a/./",
  "a/../",
]) {
  it(`[unhappy-1] hidden extname(${JSON.stringify(path)}) should be ""`, () => {
    expect(extname(path)).to.equal("");
  });
}

// [unhappy-2] extends public [unhappy-2]: the empty path still gives ""
// after a call that gives "."
it(`[unhappy-2] hidden extname("") should be "" after extname("index.")`, () => {
  extname("index.");
  expect(extname("")).to.equal("");
});

// [happy-3] extends public [happy-3]: other values whose result is unchanged,
// including dots that end earlier segments rather than the last one
for (const [path, ext] of [
  ["a./b.js", ".js"],
  ["a./b", ""],
  ["foo./bar", ""],
  [String.raw`foo.\bar`, ""],
  ["a.b/c", ""],
  ["...foo", ".foo"],
  ["a/..foo", ".foo"],
  [".index.js", ".js"],
  ["file.x", ".x"],
  ["file.a.b.c.d", ".d"],
  ["C:foo.txt", ".txt"],
  [String.raw`D:\a.b\c.d`, ".d"],
  ["file", ""],
  ["name.extension-with-a-much-longer-tail", ".extension-with-a-much-longer-tail"],
] as const) {
  it(`[happy-3] hidden extname(${JSON.stringify(path)}) should be ${JSON.stringify(ext)}`, () => {
    expect(extname(path)).to.equal(ext);
  });
}
