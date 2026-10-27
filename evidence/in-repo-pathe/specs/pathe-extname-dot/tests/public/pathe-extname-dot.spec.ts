import { expect, it } from "vitest";

import { extname, parse } from "../src/_path";
import { posix, win32 } from "../src";

// [happy-1] A name ending with a dot has the extension "."
for (const path of [
  "index.",
  "x.",
  "./x.",
  "file.txt.",
  "a.b.c.",
  "a/b/index.",
  "/temp/myfile.",
  "a.b/c.",
]) {
  it(`[happy-1] extname(${JSON.stringify(path)}) should be "."`, () => {
    expect(extname(path)).to.equal(".");
  });
}

// [happy-2] Windows separators are normalised before the trailing dot is found
for (const path of [
  String.raw`C:\temp\myfile.`,
  String.raw`\temp\myfile.`,
  String.raw`.\myfile.`,
]) {
  it(`[happy-2] extname(${JSON.stringify(path)}) should be "."`, () => {
    expect(extname(path)).to.equal(".");
  });
}

// [boundary-1] Repeated trailing dots still give a single "."
for (const path of ["foo..", "foo...", "..foo."]) {
  it(`[boundary-1] extname(${JSON.stringify(path)}) should be "."`, () => {
    expect(extname(path)).to.equal(".");
  });
}

// [boundary-2] A dotfile name ending with a dot has the extension "."
for (const path of [".index.", ".index.."]) {
  it(`[boundary-2] extname(${JSON.stringify(path)}) should be "."`, () => {
    expect(extname(path)).to.equal(".");
  });
}

// [boundary-3] A drive-relative name ending with a dot is treated as an ordinary segment
it(`[boundary-3] extname("C:.") should be "."`, () => {
  expect(extname("C:.")).to.equal(".");
});

it(`[boundary-3] win32.extname("C:.") should be "." like extname`, () => {
  expect(win32.extname("C:.")).to.equal(".");
});

// [boundary-4] Segments made only of dots
for (const [path, ext] of [
  [".", ""],
  ["..", ""],
  ["...", "."],
  ["....", "."],
  ["/.", ""],
  ["/..", ""],
  ["a/.", ""],
  ["a/..", ""],
  ["./..", ""],
  [String.raw`C:\..`, ""],
  ["/...", "."],
] as const) {
  it(`[boundary-4] extname(${JSON.stringify(path)}) should be ${JSON.stringify(ext)}`, () => {
    expect(extname(path)).to.equal(ext);
  });
}

// [unhappy-1] A trailing "/" or "\" gives "" even when the name before it ends with a dot
for (const path of [
  "./",
  "../",
  "..\\",
  "index./",
  "index.//",
  "foo.\\",
  "index.js/",
  "a.b/",
]) {
  it(`[unhappy-1] extname(${JSON.stringify(path)}) should be ""`, () => {
    expect(extname(path)).to.equal("");
  });
}

// [unhappy-2] An empty path has no extension
it(`[unhappy-2] extname("") should be ""`, () => {
  expect(extname("")).to.equal("");
});

it(`[unhappy-2] posix.extname("") and win32.extname("") should be ""`, () => {
  expect(posix.extname("")).to.equal("");
  expect(win32.extname("")).to.equal("");
});

// [happy-3] Existing results are unchanged
for (const [path, ext] of [
  ["/temp/myfile.html", ".html"],
  ["./myfile.html", ".html"],
  ["./myfile.tar.gz", ".gz"],
  ["./myfile.tar.gz.br", ".br"],
  [".foo", ""],
  ["..foo", ".foo"],
  ["foo.123", ".123"],
  ["./dir/file", ""],
  [String.raw`C:\temp\myfile.html`, ".html"],
  [String.raw`\temp\myfile.html`, ".html"],
  [String.raw`.\myfile.html`, ".html"],
] as const) {
  it(`[happy-3] extname(${JSON.stringify(path)}) should be ${JSON.stringify(ext)}`, () => {
    expect(extname(path)).to.equal(ext);
  });
}

// [happy-4] parse on a path ending with a dot
for (const [path, expected] of [
  ["index.", { root: "", dir: ".", base: "index.", ext: ".", name: "index" }],
  [
    "/home/user/file.txt.",
    {
      root: "/",
      dir: "/home/user",
      base: "file.txt.",
      ext: ".",
      name: "file.txt",
    },
  ],
  [
    String.raw`C:\temp\myfile.`,
    { root: "C:/", dir: "C:/temp", base: "myfile.", ext: ".", name: "myfile" },
  ],
  [
    "./dir/foo..",
    { root: "", dir: "./dir", base: "foo..", ext: ".", name: "foo." },
  ],
  ["...", { root: "", dir: ".", base: "...", ext: ".", name: ".." }],
  ["..", { root: "", dir: ".", base: "..", ext: "", name: ".." }],
] as const) {
  it(`[happy-4] parse(${JSON.stringify(path)})`, () => {
    expect(parse(path)).to.deep.equal(expected);
  });
}

// [happy-5] Namespaced extname
it(`[happy-5] posix.extname("index.") should be "."`, () => {
  expect(posix.extname("index.")).to.equal(".");
});

it(`[happy-5] win32.extname("C:\\temp\\myfile.") should be "."`, () => {
  expect(win32.extname(String.raw`C:\temp\myfile.`)).to.equal(".");
});

it(`[happy-5] posix.extname("..") should be ""`, () => {
  expect(posix.extname("..")).to.equal("");
});

it(`[happy-5] win32.extname("...") should be "."`, () => {
  expect(win32.extname("...")).to.equal(".");
});
