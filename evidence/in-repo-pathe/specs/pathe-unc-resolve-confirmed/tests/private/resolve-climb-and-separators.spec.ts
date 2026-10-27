import { expect, it, vi } from "vitest";

import { normalize, relative, resolve } from "../../src/_path";

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

// Scenario: Climbing out of the share while segments remain

// Extends "[boundary-1] resolve climbs out of the share and agrees with normalize"
it("[boundary-1] resolve climbs out of deeper UNC paths and agrees with normalize", () => {
  const table: Array<[string, string]> = [
    ["//server/share/a/../..", "//server"],
    ["//a/b/c/../../d", "//a/d"],
    ["\\\\server\\share\\..", "//server"],
    ["\\\\server\\..\\share\\x", "//share/x"],
  ];
  eachCwd(() => {
    for (const [input, output] of table) {
      expect(resolve(input)).to.equal(output);
      expect(normalize(input)).to.equal(output);
    }
  });
});

// Extends "[boundary-1] resolve climbs past the share across arguments and agrees with normalize"
// Shortcut: clamping at //server/share as Node win32 does
it("[boundary-1] resolve climbs past the server across arguments without clamping", () => {
  const table: Array<[string[], string]> = [
    [["//server/share", "..", "x"], "//server/x"],
    [["//server/share", "..", "..", "x"], "//x"],
    [["//server/share", "../../x/y"], "//x/y"],
    [["\\\\server\\share\\a", "..\\..\\..\\b\\c"], "//b/c"],
    [["//server/share", "a", "b", "..", "..", "..", "c", "d"], "//server/c/d"],
  ];
  eachCwd(() => {
    for (const [args, output] of table) {
      expect(resolve(...args)).to.equal(output);
      expect(normalize(args.join("/"))).to.equal(output);
    }
  });
});

it("[boundary-1] resolve climbs out of a UNC working directory while segments remain", () => {
  withCwd("\\\\server\\share\\project", () => {
    expect(resolve("..", "..", "y")).to.equal("//server/y");
    expect(resolve("../../..", "z")).to.equal("//z");
  });
});

// Scenario: Climbing until no segment remains leaves the bare prefix

// Extends "[boundary-2] resolve climbing above the server returns the bare // prefix"
// Shortcut: returning normalize's "/" or clamping at the share
it("[boundary-2] resolve climbing to an empty body from other UNC paths returns //", () => {
  const table: string[][] = [
    ["//a", ".."],
    ["//server/share/a/b/c/d", "../../../../../.."],
    ["//server/share/../../"],
    ["\\\\server\\share", "..\\.."],
    ["//server/share", "..", "..", "..", "..", "..", "..", "..", ".."],
    ["//server/share", "a", "..", "..", ".."],
  ];
  eachCwd(() => {
    for (const args of table) {
      expect(resolve(...args)).to.equal("//");
      expect(normalize(args.join("/"))).to.equal("/");
    }
  });
});

it("[boundary-2] resolve climbing above a UNC working directory returns //", () => {
  withCwd("\\\\server\\share\\project", () => {
    expect(resolve("../../..")).to.equal("//");
    expect(resolve("..", "..", "..", "..", "..")).to.equal("//");
  });
});

// Scenario: Separators only, or three or more leading separators

// Extends "[boundary-3] resolve of separators only returns //"
it("[boundary-3] resolve of longer and mixed separator-only inputs returns //", () => {
  eachCwd(() => {
    expect(resolve("////")).to.equal("//");
    expect(resolve("/\\/\\")).to.equal("//");
    expect(resolve("\\/")).to.equal("//");
    expect(resolve("//", ".")).to.equal("//");
    expect(resolve("///foo", "..")).to.equal("//");
  });
});

// Extends "[boundary-3] resolve collapses three leading separators to //"
// Shortcut: collapsing to a single "/" as path.posix.resolve does
it("[boundary-3] resolve collapses four or more and mixed leading separators to //", () => {
  eachCwd(() => {
    expect(resolve("////foo//bar/")).to.equal("//foo/bar");
    expect(resolve("\\/\\foo")).to.equal("//foo");
    expect(resolve("/\\\\foo\\bar")).to.equal("//foo/bar");
    expect(resolve("///", "x")).to.equal("//x");
    expect(resolve("//", "a", "b")).to.equal("//a/b");
  });
});

// Scenario: A UNC call does not affect the next call

// Extends "[boundary-4] resolve keeps no UNC state between calls": more calls, other orders
// Shortcut: a module-level UNC flag that is set and never reset
it("[boundary-4] resolve keeps no state across a long interleaving of UNC and non-UNC calls", () => {
  const calls: Array<[string[], string]> = [
    [["/foo/bar"], "/foo/bar"],
    [["\\\\server\\share\\a"], "//server/share/a"],
    [["C:\\foo", "bar"], "C:/foo/bar"],
    [["//"], "//"],
    [["/"], "/"],
    [["//server/share", ".."], "//server"],
    [["/foo/.."], "/"],
    [["//server/share", "/x"], "/x"],
    [["/x", "//server/share"], "//server/share"],
  ];
  const results: string[] = [];
  for (let round = 0; round < 5; round++) {
    for (const [args] of calls) {
      results.push(resolve(...args));
    }
  }
  const expected = Array.from({ length: 5 }, () => calls.map(([, output]) => output)).flat();
  expect(results).to.deep.equal(expected);
});

// Shortcut: caching whether the working directory is UNC
it("[boundary-4] resolve does not carry a UNC working directory into a later call", () => {
  const results = [
    withCwd("\\\\server\\share", () => resolve("a")),
    withCwd("/home/user", () => resolve("a")),
    withCwd("\\\\server\\share", () => resolve("a")),
    withCwd("C:\\Users", () => resolve("a")),
  ];
  expect(results).to.deep.equal(["//server/share/a", "/home/user/a", "//server/share/a", "C:/Users/a"]);
});

it("[boundary-4] resolve keeps no state between UNC calls and relative calls without a cwd", () => {
  withCwd("", () => {
    const results = [
      resolve("//server/share/a"),
      resolve("a", "b"),
      resolve("//./x"),
      resolve("..", ".."),
    ];
    expect(results).to.deep.equal(["//server/share/a", "a/b", "//x", "../.."]);
  });
});

it("[boundary-4] relative after a UNC resolve call is unaffected by it", () => {
  const results = [resolve("//server/share/a"), relative("/a/b", "/a/c"), resolve("/a/b")];
  expect(results).to.deep.equal(["//server/share/a", "../c", "/a/b"]);
});
