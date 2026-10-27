import { expect, it, vi } from "vitest";

import { format, normalize, relative, resolve } from "../src/_path";

function withCwd<T>(value: string, function_: () => T): T {
  const cwd = process.cwd;
  process.cwd = vi.fn(() => value);
  try {
    return function_();
  } finally {
    process.cwd = cwd;
  }
}

// Scenario: A single UNC argument keeps both leading separators

it("[happy-1] resolve keeps the // prefix of a single UNC argument", () => {
  expect(resolve("//server/share/file")).to.equal("//server/share/file");
  expect(resolve("\\\\server\\share\\file")).to.equal("//server/share/file");
  expect(resolve("\\\\server/share/file")).to.equal("//server/share/file");
  expect(resolve("/\\server\\share\\file")).to.equal("//server/share/file");
});

it("[happy-1] resolve normalizes the body of a single UNC argument", () => {
  expect(resolve("//server/share/x/./y/../z")).to.equal("//server/share/x/z");
  expect(resolve("//server//share//x//")).to.equal("//server/share/x");
});

it("[happy-1] resolve keeps the UNC prefix with a Windows working directory", () => {
  withCwd(String.raw`C:\Windows\path\only`, () => {
    expect(resolve("//server/share/file")).to.equal("//server/share/file");
    expect(resolve("\\\\server\\share\\file")).to.equal("//server/share/file");
  });
});

it("[happy-1] resolve strips the trailing separator of a bare share or server", () => {
  expect(resolve("//server/share/")).to.equal("//server/share");
  expect(resolve("//server/share")).to.equal("//server/share");
  expect(resolve("//server")).to.equal("//server");
  expect(resolve("//server/")).to.equal("//server");
});

it("[happy-1] resolve keeps the prefix of namespaced and drive-like UNC paths", () => {
  expect(resolve("//?/C:/foo")).to.equal("//?/C:/foo");
  expect(resolve("\\\\?\\C:\\foo")).to.equal("//?/C:/foo");
  expect(resolve("//C:/foo/bar")).to.equal("//C:/foo/bar");
});

// Scenario: Relative arguments after a UNC anchor resolve beneath it

it("[happy-2] resolve places relative arguments beneath a UNC anchor", () => {
  expect(resolve("//server/share/file", "../path")).to.equal("//server/share/path");
  expect(resolve("\\\\server\\share\\file", "..\\path")).to.equal("//server/share/path");
  expect(resolve("//server/share", "dir", "./file.txt")).to.equal("//server/share/dir/file.txt");
});

it("[happy-2] resolve skips empty arguments after a UNC anchor", () => {
  expect(
    resolve("//server/share", undefined as unknown as string, null as unknown as string, "", "a"),
  ).to.equal("//server/share/a");
});

it("[happy-2] resolve drops trailing separators of relative arguments after a UNC anchor", () => {
  expect(resolve("//server/share/a", "b/", "c\\")).to.equal("//server/share/a/b/c");
});

// Scenario: A UNC argument after a non-UNC absolute argument becomes the anchor

it("[happy-3] resolve anchors on a UNC argument that follows a non-UNC absolute one", () => {
  expect(resolve("/foo", "//server/share", "x")).to.equal("//server/share/x");
  expect(resolve("C:/foo", "//server/share/x")).to.equal("//server/share/x");
  expect(resolve("C:\\foo", "\\\\server\\share\\x")).to.equal("//server/share/x");
});

it("[happy-3] resolve anchors on the rightmost of two UNC arguments", () => {
  expect(resolve("//old/share", "//server/share/x")).to.equal("//server/share/x");
});

// Scenario: A UNC working directory is the anchor when no argument is absolute

it("[happy-4] resolve keeps the prefix of a UNC working directory", () => {
  withCwd("\\\\server\\share\\project", () => {
    expect(resolve("src", "index.ts")).to.equal("//server/share/project/src/index.ts");
  });
});

it("[happy-4] resolve with no arguments returns the UNC working directory", () => {
  withCwd("\\\\server\\share\\project", () => {
    expect(resolve()).to.equal("//server/share/project");
  });
});

// Scenario: Non-UNC anchors keep the single leading separator or drive letter

it("[happy-5] resolve keeps a single leading separator or drive letter for non-UNC anchors", () => {
  expect(resolve("/foo/bar", "./baz")).to.equal("/foo/bar/baz");
  expect(resolve("\\foo\\bar", "..", ".", ".\\baz")).to.equal("/foo/baz");
  expect(resolve("C:\\foo\\bar", ".\\baz")).to.equal("C:/foo/bar/baz");
  expect(resolve("/foo", "bar//baz")).to.equal("/foo/bar/baz");
});

it("[happy-5] resolve drops the UNC prefix when a later non-UNC absolute argument is the anchor", () => {
  expect(resolve("//server/share", "/foo")).to.equal("/foo");
  expect(resolve("//server/share", "C:/foo")).to.equal("C:/foo");
  expect(resolve("//server/share", "\\foo")).to.equal("/foo");
});

// Scenario: format over UNC segments

it("[happy-6] format with a root keeps the UNC prefix", () => {
  expect(format({ root: "//server/share/", base: "x.txt" })).to.equal("//server/share/x.txt");
  expect(format({ root: "/", dir: "//server/share/dir", base: "x.txt" })).to.equal(
    "//server/share/dir/x.txt",
  );
});

it("[happy-6] format without a root keeps a backslash UNC dir as //", () => {
  expect(format({ dir: "\\\\server\\share\\dir", base: "x.txt" })).to.equal(
    "//server/share/dir/x.txt",
  );
});

it("[happy-6] format with a non-UNC root keeps a single leading separator", () => {
  expect(format({ root: "/", base: "file.txt", ext: "ignored" })).to.equal("/file.txt");
});

// Scenario: Climbing out of the share while segments remain

it("[boundary-1] resolve climbs out of the share and agrees with normalize", () => {
  expect(resolve("//server/share/..")).to.equal("//server");
  expect(normalize("//server/share/..")).to.equal("//server");
  expect(resolve("//server/../share")).to.equal("//share");
  expect(normalize("//server/../share")).to.equal("//share");
});

it("[boundary-1] resolve climbs past the share across arguments and agrees with normalize", () => {
  const args = ["//server/share", "a", "..", "..", "b"];
  expect(resolve(...args)).to.equal("//server/b");
  expect(normalize(args.join("/"))).to.equal("//server/b");
});

// Scenario: Climbing until no segment remains leaves the bare prefix

it("[boundary-2] resolve climbing above the server returns the bare // prefix", () => {
  const args = ["//server/share", "..", ".."];
  expect(resolve(...args)).to.equal("//");
  expect(normalize(args.join("/"))).to.equal("/");
});

it("[boundary-2] resolve climbing further than the path depth still returns //", () => {
  expect(resolve("//server/share/a", "../../..")).to.equal("//");
  expect(normalize(["//server/share/a", "../../.."].join("/"))).to.equal("/");
  const args = ["//server/share", "..", "..", ".."];
  expect(resolve(...args)).to.equal("//");
  expect(normalize(args.join("/"))).to.equal("/");
});

// Scenario: Separators only, or three or more leading separators

it("[boundary-3] resolve of separators only returns //", () => {
  expect(resolve("//")).to.equal("//");
  expect(resolve("\\\\")).to.equal("//");
  expect(resolve("///")).to.equal("//");
});

it("[boundary-3] resolve collapses three leading separators to //", () => {
  expect(resolve("///foo")).to.equal("//foo");
  expect(resolve("\\\\\\foo")).to.equal("//foo");
});

// Scenario: A UNC call does not affect the next call

it("[boundary-4] resolve keeps no UNC state between calls", () => {
  const first = resolve("//server/share/a");
  const second = resolve("/foo/bar");
  const third = resolve("//server/share/b");
  expect([first, second, third]).to.deep.equal(["//server/share/a", "/foo/bar", "//server/share/b"]);
});

// Scenario: relative between UNC and non-UNC paths

it("[boundary-5] relative between paths on UNC shares", () => {
  expect(relative("//server/share/a", "//server/share/b")).to.equal("../b");
  expect(relative("//server/share/a", "//other/share/b")).to.equal("../../../other/share/b");
  expect(relative("\\\\server\\share\\a\\b", "\\\\server\\share\\a")).to.equal("..");
  expect(relative("//server/share/a", "//server/share/a/b/c")).to.equal("b/c");
});

it("[boundary-5] relative between a UNC path and a non-UNC absolute path", () => {
  expect(relative("/a", "//server/share/b")).to.equal("..//server/share/b");
  expect(relative("//server/share/a", "/b")).to.equal("../../../../b");
});

it("[boundary-5] relative between identical UNC shares is empty", () => {
  expect(relative("//server/share", "//server/share")).to.equal("");
});

// Scenario: A "//." device path is not absolute

it("[unhappy-1] resolve treats a //. device path as relative to the working directory", () => {
  withCwd(String.raw`C:\Windows\path\only`, () => {
    expect(resolve("//./foo/bar")).to.equal("C:/Windows/path/only/foo/bar");
  });
});

it("[unhappy-1] resolve treats a backslash \\\\. device path with a drive as relative", () => {
  withCwd(String.raw`C:\Windows\path\only`, () => {
    expect(resolve("\\\\.\\c:\\temp")).to.equal("C:/Windows/path/only/c:/temp");
  });
});

// Scenario: Without a working directory, a leftmost argument starting with two separators keeps the prefix

it("[unhappy-2] resolve without a working directory keeps the prefix of a //. argument", () => {
  withCwd("", () => {
    expect(resolve("//./x")).to.equal("//x");
    expect(resolve("\\\\.\\x")).to.equal("//x");
  });
});

it("[unhappy-2] resolve without a working directory climbing out of //. returns //", () => {
  withCwd("", () => {
    expect(resolve("//./x", "..")).to.equal("//");
  });
});

it("[unhappy-2] resolve without a working directory leaves plain relative arguments relative", () => {
  withCwd("", () => {
    expect(resolve(".", "./")).to.equal(".");
    expect(resolve("..", "..")).to.equal("../..");
  });
});
