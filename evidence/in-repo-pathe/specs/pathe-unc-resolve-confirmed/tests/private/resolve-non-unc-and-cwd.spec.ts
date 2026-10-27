import { expect, it, vi } from "vitest";

import { resolve } from "../../src/_path";

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

// Scenario: Non-UNC anchors keep the single leading separator or drive letter
// Each test pairs the non-UNC outcome with the UNC result it must not borrow from.

// Extends "[happy-5] resolve drops the UNC prefix when a later non-UNC absolute argument is the anchor"
// Shortcut: deciding UNC-ness from the first argument or from any argument
it("[happy-5] a later root-relative or drive argument replaces a UNC anchor after relative segments", () => {
  eachCwd(() => {
    expect(resolve("//server/share", "dir", "bar")).to.equal("//server/share/dir/bar");
    expect(resolve("//server/share", "dir", "/foo", "bar")).to.equal("/foo/bar");
    expect(resolve("\\\\server\\share\\dir", "D:\\x", "y")).to.equal("D:/x/y");
    expect(resolve("//a/b", "//c/d", "\\e", "f")).to.equal("/e/f");
  });
});

// Shortcut: deciding UNC-ness from any argument after the anchor that starts with two separators
it("[happy-5] a //. argument after a non-UNC anchor does not add the UNC prefix", () => {
  eachCwd(() => {
    expect(resolve("//server/share", "//./x")).to.equal("//server/share/x");
    expect(resolve("/foo", "//./x")).to.equal("/foo/x");
    expect(resolve("C:/foo", "\\\\.\\x")).to.equal("C:/foo/x");
  });
});

// Extends "[happy-5] resolve keeps a single leading separator or drive letter for non-UNC anchors"
// Shortcut: deciding UNC-ness from the working directory instead of the anchor
it("[happy-5] non-UNC absolute arguments ignore a UNC working directory", () => {
  withCwd("\\\\server\\share\\project", () => {
    expect(resolve("baz")).to.equal("//server/share/project/baz");
    expect(resolve("/foo/bar", "./baz")).to.equal("/foo/bar/baz");
    expect(resolve("\\foo\\bar", "..", ".", ".\\baz")).to.equal("/foo/baz");
    expect(resolve("C:\\foo\\bar", ".\\baz")).to.equal("C:/foo/bar/baz");
    expect(resolve("/foo", "bar//baz")).to.equal("/foo/bar/baz");
    expect(resolve("\\foo")).to.equal("/foo");
  });
});

it("[happy-5] a non-UNC anchor climbing to an empty body returns / where a UNC anchor returns //", () => {
  eachCwd(() => {
    expect(resolve("//foo", "..")).to.equal("//");
    expect(resolve("/foo", "..")).to.equal("/");
    expect(resolve("/foo/..")).to.equal("/");
    expect(resolve("/", "..", "..")).to.equal("/");
  });
});

// Scenario: A "//." device path is not absolute, so it resolves against the working directory as today

// Extends "[unhappy-1] resolve treats a //. device path as relative to the working directory"
it("[unhappy-1] resolve treats a //. device path as relative to POSIX and UNC working directories", () => {
  withCwd("/home/user", () => {
    expect(resolve("//./foo/bar")).to.equal("/home/user/foo/bar");
  });
  withCwd("\\\\srv\\sh\\p", () => {
    expect(resolve("//./foo/bar")).to.equal("//srv/sh/p/foo/bar");
    expect(resolve("//./foo", "..", "..", "bar")).to.equal("//srv/sh/bar");
  });
});

// Extends "[unhappy-1] resolve treats a backslash \\\\. device path with a drive as relative"
it("[unhappy-1] resolve treats mixed-separator and //.. device-like paths as relative", () => {
  withCwd(String.raw`C:\Windows\path\only`, () => {
    expect(resolve("\\/./foo")).to.equal("C:/Windows/path/only/foo");
    expect(resolve("/\\.\\x")).to.equal("C:/Windows/path/only/x");
    expect(resolve("//./foo", "../bar")).to.equal("C:/Windows/path/only/bar");
  });
  withCwd("\\\\srv\\sh\\p", () => {
    expect(resolve("\\\\.\\c:\\temp")).to.equal("//srv/sh/p/c:/temp");
    expect(resolve("//../x")).to.equal("//srv/sh/x");
  });
});

// Scenario: Without a working directory, a leftmost argument starting with two separators keeps the prefix

// Extends "[unhappy-2] resolve without a working directory keeps the prefix of a //. argument"
it("[unhappy-2] resolve without a working directory keeps the prefix with later relative arguments", () => {
  withCwd("", () => {
    expect(resolve("//./x", "y", "z")).to.equal("//x/y/z");
    expect(resolve("\\/./a\\b")).to.equal("//a/b");
    expect(resolve("//./x/y", "..")).to.equal("//x");
  });
});

// Shortcut: checking the first raw argument rather than the leftmost non-empty one
it("[unhappy-2] resolve without a working directory skips empty arguments before a //. argument", () => {
  withCwd("", () => {
    expect(resolve("", "//./x")).to.equal("//x");
    expect(resolve(undefined as unknown as string, null as unknown as string, "\\\\.\\x")).to.equal(
      "//x",
    );
  });
});

// Shortcut: checking any argument, or the rightmost one, for two leading separators
it("[unhappy-2] resolve without a working directory stays relative when only a later argument has //", () => {
  withCwd("", () => {
    expect(resolve("//./x", "a")).to.equal("//x/a");
    expect(resolve("a", "//./x")).to.equal("a/x");
  });
});

// Extends "[unhappy-2] resolve without a working directory climbing out of //. returns //"
it("[unhappy-2] resolve without a working directory climbing out of a deeper //. path returns //", () => {
  withCwd("", () => {
    expect(resolve("//./x/y", "../..")).to.equal("//");
    expect(resolve("\\\\.\\x", "..")).to.equal("//");
  });
});
