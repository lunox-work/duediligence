import { expect, it } from "vitest";

import { extname } from "../../src/_path";
import { posix, win32 } from "../../src";

// [happy-5] extends public [happy-5]: each namespace with the inputs the
// public test only gives to the other namespace, and more values
for (const [ns, nsExtname] of [
  ["posix", posix.extname],
  ["win32", win32.extname],
] as const) {
  for (const path of [
    "index.",
    String.raw`C:\temp\myfile.`,
    "...",
    "foo..",
    ".index.",
    "a/b/file.txt.",
    String.raw`dir\...`,
  ]) {
    it(`[happy-5] hidden ${ns}.extname(${JSON.stringify(path)}) should be "."`, () => {
      expect(nsExtname(path)).to.equal(".");
    });
  }

  for (const [dotOnly, threeDots] of [
    ["..", "...."],
    [".", "a/..."],
    ["a/..", "/..."],
    [String.raw`C:\..`, String.raw`C:\...`],
  ] as const) {
    it(`[happy-5] hidden ${ns}.extname(${JSON.stringify(dotOnly)}) should be "" and ${ns}.extname(${JSON.stringify(threeDots)}) should be "."`, () => {
      expect(nsExtname(dotOnly)).to.equal("");
      expect(nsExtname(threeDots)).to.equal(".");
    });
  }
}

// [happy-5] extends public [happy-5]: the namespaces agree with extname on a
// mixed batch of inputs
it(`[happy-5] hidden posix.extname and win32.extname agree with extname`, () => {
  const paths = [
    "index.",
    "index./",
    "..",
    "...",
    ".foo",
    "..foo",
    "file.txt.",
    String.raw`C:\temp\myfile.html`,
    "C:.",
    "",
  ];
  expect(paths.map((p) => posix.extname(p))).to.deep.equal(
    paths.map((p) => extname(p)),
  );
  expect(paths.map((p) => win32.extname(p))).to.deep.equal(
    paths.map((p) => extname(p)),
  );
  expect(paths.map((p) => extname(p))).to.deep.equal([
    ".",
    "",
    "",
    ".",
    "",
    ".foo",
    ".",
    ".html",
    ".",
    "",
  ]);
});
