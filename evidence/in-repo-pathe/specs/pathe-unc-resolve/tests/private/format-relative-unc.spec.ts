import { expect, it, vi } from "vitest";

import { format, relative, resolve } from "../../src/_path";

const WINDOWS_CWD = String.raw`C:\Windows\path\only`;
const UNC_CWD = String.raw`\\server\share\project`;

function withCwd<T>(value: string, function_: () => T): T {
  const cwd = process.cwd;
  process.cwd = vi.fn(() => value);
  try {
    return function_();
  } finally {
    process.cwd = cwd;
  }
}

// Scenario: format over UNC segments

// Extends "format keeps the UNC prefix of a root" with a backslash root.
it("[happy-6] format keeps the UNC prefix of a backslash root", () => {
  expect(format({ root: "\\\\server\\share\\", base: "x.txt" })).to.equal(
    "//server/share/x.txt",
  );
});

it("[happy-6] format keeps the UNC prefix of a root combined with name and ext", () => {
  expect(format({ root: "//server/share/", name: "x", ext: "md" })).to.equal("//server/share/x.md");
  expect(format({ root: "//server/share/", name: "x", ext: ".md" })).to.equal(
    "//server/share/x.md",
  );
});

// Extends "keeps the UNC prefix of a dir when root is set" with other roots.
it("[happy-6] format keeps the UNC prefix of a dir under a UNC or drive root", () => {
  expect(format({ root: "//server/share/", dir: "//server/share/sub/dir", base: "x.txt" })).to.equal(
    "//server/share/sub/dir/x.txt",
  );
  expect(format({ root: "C:/", dir: "//server/share/dir", base: "x" })).to.equal(
    "//server/share/dir/x",
  );
  expect(format({ root: "/", dir: String.raw`\\server\share\a\..`, base: "b" })).to.equal(
    "//server/share/b",
  );
});

it("[happy-6] format with a UNC root and a bare server root drops the trailing separator", () => {
  expect(format({ root: "//server/" })).to.equal("//server");
  expect(format({ root: "//server/share/", dir: "//server/share" })).to.equal("//server/share");
});

it("[happy-6] format with a UNC root and a root-relative dir uses the dir's single separator", () => {
  expect(format({ root: "//server/share/", base: "y" })).to.equal("//server/share/y");
  expect(format({ root: "//server/share/", dir: "/abs", base: "x" })).to.equal("/abs/x");
  expect(format({ root: "/", dir: "/home", base: "x" })).to.equal("/home/x");
});

it("[happy-6] format of every table row does not depend on a Windows or UNC cwd", () => {
  for (const cwd of [WINDOWS_CWD, UNC_CWD]) {
    withCwd(cwd, () => {
      expect(format({ root: "//server/share/", base: "x.txt" })).to.equal("//server/share/x.txt");
      expect(format({ root: "/", dir: "//server/share/dir", base: "x.txt" })).to.equal(
        "//server/share/dir/x.txt",
      );
      expect(format({ dir: String.raw`\\server\share\dir`, base: "x.txt" })).to.equal(
        "//server/share/dir/x.txt",
      );
      expect(format({ root: "/", base: "file.txt", ext: "ignored" })).to.equal("/file.txt");
    });
  }
});

// Scenario: relative between UNC and non-UNC paths
// Each test first checks that resolve keeps the UNC prefix of an input, then that
// relative still returns what it returned before the change.

// Extends "relative from a root-relative path to a UNC path has no empty segments".
it("[boundary-4] relative between the root and a UNC share has no empty segments", () => {
  expect(resolve("//server/share")).to.equal("//server/share");
  expect(relative("/", "//server/share")).to.equal("server/share");
  expect(relative("//server/share", "/")).to.equal("../..");
});

it("[boundary-4] relative from a root-relative path to a UNC path with the same names", () => {
  expect(resolve("//a/b/c")).to.equal("//a/b/c");
  expect(relative("/a/b", "//a/b/c")).to.equal("c");
});

// Extends "relative between siblings on the same UNC share" with deeper and wider moves.
it("[boundary-4] relative between deeper paths on the same and different UNC shares", () => {
  expect(resolve("//server/share/c/d")).to.equal("//server/share/c/d");
  expect(relative("//server/share/a/b", "//server/share/c/d")).to.equal("../../c/d");
  expect(relative("//server/share/a", "//server/other/a")).to.equal("../../other/a");
  expect(relative("//server/share/a/b/c", "//server/share")).to.equal("../../..");
  expect(relative("//a", "//b")).to.equal("../b");
});

// Extends "relative from a backslash UNC path to its parent" with mixed separators.
it("[boundary-4] relative between backslash and forward-slash spellings of one UNC share", () => {
  expect(resolve(String.raw`\\server\share\a`)).to.equal("//server/share/a");
  expect(relative(String.raw`\\server\share\a`, "//server/share/b")).to.equal("../b");
  expect(relative("//server/share/a", String.raw`\\server\share\a\b`)).to.equal("b");
});

it("[boundary-4] relative from a deep UNC path back to its share", () => {
  const segments = Array.from({ length: 20 }, (_, index) => `s${index}`);
  expect(resolve(`//server/share/${segments.join("/")}`)).to.equal(
    `//server/share/${segments.join("/")}`,
  );
  expect(relative(`//server/share/${segments.join("/")}`, "//server/share")).to.equal(
    segments.map(() => "..").join("/"),
  );
  expect(relative("//server/share", `//server/share/${segments.join("/")}`)).to.equal(
    segments.join("/"),
  );
});

// A UNC cwd makes a relative input UNC; relative keeps its previous outputs.
it("[boundary-4] relative between a relative input under a UNC cwd and a root-relative path", () => {
  withCwd(UNC_CWD, () => {
    expect(resolve("a")).to.equal("//server/share/project/a");
    expect(relative("a", "/x")).to.equal("../../../../x");
    expect(relative("/x", "a")).to.equal("../server/share/project/a");
    expect(relative("a", "b")).to.equal("../b");
    expect(relative("//other/s", "a")).to.equal("../../server/share/project/a");
  });
});

it("[boundary-4] relative of every table row does not depend on a Windows or UNC cwd", () => {
  const rows: [string, string, string][] = [
    ["//server/share/a", "//server/share/b", "../b"],
    ["//server/share/a", "//other/share/b", "../../../other/share/b"],
    ["/a", "//server/share/b", "../server/share/b"],
    ["//server/share/a", "/b", "../../../b"],
    [String.raw`\\server\share\a\b`, String.raw`\\server\share\a`, ".."],
    ["//server/share", "//server/share", ""],
    ["//server/share/a", "//server/share/a/b/c", "b/c"],
  ];
  for (const cwd of [WINDOWS_CWD, UNC_CWD]) {
    withCwd(cwd, () => {
      expect(resolve("//server/share/b")).to.equal("//server/share/b");
      for (const [from, to, output] of rows) {
        expect(relative(from, to), `${from} -> ${to}`).to.equal(output);
      }
    });
  }
});
