import { expect, it, vi } from "vitest";

import { format, relative } from "../../src/_path";

function withCwd<T>(value: string, function_: () => T): T {
  const cwd = process.cwd;
  process.cwd = vi.fn(() => value);
  try {
    return function_();
  } finally {
    process.cwd = cwd;
  }
}

const CWDS = [
  String.raw`C:\Windows\path\only`,
  "/home/user/project",
  String.raw`\\cwdserver\cwdshare\dir`,
  "",
];

function eachCwd(function_: () => void) {
  for (const cwd of CWDS) {
    withCwd(cwd, function_);
  }
}

// Scenario: format over UNC segments

// Extends "[happy-6] format with a root keeps the UNC prefix"
it("[happy-6] format with a backslash UNC root or a UNC dir with name and ext keeps //", () => {
  eachCwd(() => {
    expect(format({ root: "\\\\server\\share\\", base: "x.txt" })).to.equal("//server/share/x.txt");
    expect(format({ root: "/", dir: "//server/share/dir/sub", name: "x", ext: "txt" })).to.equal(
      "//server/share/dir/sub/x.txt",
    );
    expect(format({ root: "/", dir: "//server/share/dir/sub", name: "x", ext: ".txt" })).to.equal(
      "//server/share/dir/sub/x.txt",
    );
    expect(format({ root: "C:\\", dir: "\\\\srv\\sh", base: "f" })).to.equal("//srv/sh/f");
  });
});

it("[happy-6] format with a UNC root and other parts follows resolve", () => {
  expect(format({ root: "//server/share/", dir: "//server/share/dir", base: "x" })).to.equal(
    "//server/share/dir/x",
  );
  expect(format({ root: "//server/share/", name: "x" })).to.equal("//server/share/x");
  expect(format({ root: "//server/share/" })).to.equal("//server/share");
  expect(format({ root: "//server/share/", dir: "..", base: "x" })).to.equal("//server/x");
  expect(format({ root: "//", base: "x" })).to.equal("//x");
});

// Extends "[happy-6] format with a non-UNC root keeps a single leading separator"
it("[happy-6] format with a UNC root and a non-UNC dir follows the dir", () => {
  expect(format({ root: "//server/share/", base: "f" })).to.equal("//server/share/f");
  expect(format({ root: "//server/share/", dir: "/home", base: "f" })).to.equal("/home/f");
  expect(format({ root: "/", dir: "/home/user", base: "f.txt" })).to.equal("/home/user/f.txt");
});

// Extends "[happy-6] format without a root keeps a backslash UNC dir as //"
it("[happy-6] format without a root and with a root agree on a UNC dir", () => {
  const dir = "\\\\server\\share\\a\\b";
  expect(format({ dir, base: "x.txt" })).to.equal("//server/share/a/b/x.txt");
  expect(format({ root: "/", dir, base: "x.txt" })).to.equal("//server/share/a/b/x.txt");
});

// Scenario: relative between UNC and non-UNC paths

// Extends "[boundary-5] relative between a UNC path and a non-UNC absolute path"
it("[boundary-5] relative from a deeper UNC path to a non-UNC absolute path", () => {
  eachCwd(() => {
    expect(relative("//server/share/a/b", "/x/y")).to.equal("../../../../../x/y");
    expect(relative("\\\\server\\share\\a", "\\b")).to.equal("../../../../b");
    expect(relative("//server/share/a", "C:/b")).to.equal("../../../../../C:/b");
  });
});

it("[boundary-5] relative from a non-UNC absolute path to a UNC path", () => {
  eachCwd(() => {
    expect(relative("/x", "\\\\server\\share")).to.equal("..//server/share");
    expect(relative("/a", "//server/share/b/c")).to.equal("..//server/share/b/c");
    expect(relative("/a/b", "//server/share/b")).to.equal("../..//server/share/b");
  });
});

// Extends "[boundary-5] relative between paths on UNC shares"
it("[boundary-5] relative between UNC paths in other directions and depths", () => {
  eachCwd(() => {
    expect(relative("//server/share/x/y", "//server/share")).to.equal("../..");
    expect(relative("//server/share", "//server/share/x/y")).to.equal("x/y");
    expect(relative("\\\\server\\share\\a", "//server/share/a/b")).to.equal("b");
    expect(relative("//server/share/a/b/c", "//server/share/d/e")).to.equal("../../../d/e");
    expect(relative("/a", "//server/share/b")).to.equal("..//server/share/b");
  });
});

// Extends "[boundary-5] relative between identical UNC shares is empty"
it("[boundary-5] relative between identical or equivalent UNC paths is empty", () => {
  expect(relative("//server/share/a/b", "\\\\server\\share\\a\\b\\")).to.equal("");
  expect(relative("//server/share/x/..", "//server/share")).to.equal("");
  expect(relative("/a", "//server/share")).to.equal("..//server/share");
});

// Relative arguments resolve against the cwd, so a UNC cwd makes them UNC
it("[boundary-5] relative with a UNC working directory pairs relative and non-UNC paths", () => {
  withCwd("\\\\srv\\sh", () => {
    expect(relative("a", "b")).to.equal("../b");
    expect(relative("a", "/b")).to.equal("../../../../b");
    expect(relative("/a", "b")).to.equal("..//srv/sh/b");
  });
});
