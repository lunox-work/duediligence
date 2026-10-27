import { expect, it, vi } from "vitest";

import { format, normalize, relative, resolve } from "../src/_path";

const WINDOWS_CWD = String.raw`C:\Windows\path\only`;

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

it("[happy-1] resolve keeps both leading separators of a forward-slash UNC path", () => {
  expect(resolve("//server/share/file")).to.equal("//server/share/file");
});

it("[happy-1] resolve writes backslash and mixed-separator UNC paths with a // prefix", () => {
  expect(resolve(String.raw`\\server\share\file`)).to.equal("//server/share/file");
  expect(resolve(String.raw`\\server/share/file`)).to.equal("//server/share/file");
  expect(resolve(String.raw`/\server\share\file`)).to.equal("//server/share/file");
});

it("[happy-1] resolve normalizes dot segments and repeated separators beneath a UNC prefix", () => {
  expect(resolve("//server/share/x/./y/../z")).to.equal("//server/share/x/z");
  expect(resolve("//server//share//x//")).to.equal("//server/share/x");
});

it("[happy-1] resolve keeps the prefix of namespace and drive-like UNC paths", () => {
  expect(resolve("//?/C:/foo")).to.equal("//?/C:/foo");
  expect(resolve(String.raw`\\?\C:\foo`)).to.equal("//?/C:/foo");
  expect(resolve("//C:/foo/bar")).to.equal("//C:/foo/bar");
});

it("[happy-1] resolve strips the trailing separator of a bare UNC share or server", () => {
  expect(resolve("//server/share/")).to.equal("//server/share");
  expect(resolve("//server/share")).to.equal("//server/share");
  expect(resolve("//server")).to.equal("//server");
  expect(resolve("//server/")).to.equal("//server");
});

it("[happy-1] resolve of a single UNC argument does not depend on a Windows cwd", () => {
  withCwd(WINDOWS_CWD, () => {
    expect(resolve("//server/share/file")).to.equal("//server/share/file");
    expect(resolve(String.raw`\\server\share\file`)).to.equal("//server/share/file");
    expect(resolve("//server/")).to.equal("//server");
  });
});

// Scenario: Relative arguments after a UNC anchor resolve beneath it

it("[happy-2] resolve places relative arguments beneath a UNC anchor", () => {
  expect(resolve("//server/share/file", "../path")).to.equal("//server/share/path");
  expect(resolve("//server/share", "dir", "./file.txt")).to.equal("//server/share/dir/file.txt");
});

it("[happy-2] resolve places backslash relative arguments beneath a backslash UNC anchor", () => {
  expect(resolve(String.raw`\\server\share\file`, String.raw`..\path`)).to.equal(
    "//server/share/path",
  );
});

it("[happy-2] resolve skips undefined, null and empty arguments after a UNC anchor", () => {
  expect(
    resolve("//server/share", undefined as unknown as string, null as unknown as string, "", "a"),
  ).to.equal("//server/share/a");
});

it("[happy-2] resolve drops trailing separators of relative arguments after a UNC anchor", () => {
  expect(resolve("//server/share/a", "b/", "c\\")).to.equal("//server/share/a/b/c");
});

it("[happy-2] resolve beneath a UNC anchor does not depend on a Windows cwd", () => {
  withCwd(WINDOWS_CWD, () => {
    expect(resolve("//server/share/file", "../path")).to.equal("//server/share/path");
    expect(resolve("//server/share", "dir", "./file.txt")).to.equal(
      "//server/share/dir/file.txt",
    );
  });
});

// Scenario: A UNC argument after a non-UNC absolute argument becomes the anchor

it("[happy-3] resolve anchors at a UNC argument that follows a root-relative argument", () => {
  expect(resolve("/foo", "//server/share", "x")).to.equal("//server/share/x");
});

it("[happy-3] resolve anchors at a UNC argument that follows a drive argument", () => {
  expect(resolve("C:/foo", "//server/share/x")).to.equal("//server/share/x");
  expect(resolve(String.raw`C:\foo`, String.raw`\\server\share\x`)).to.equal("//server/share/x");
});

it("[happy-3] resolve anchors at the rightmost of two UNC arguments", () => {
  expect(resolve("//old/share", "//server/share/x")).to.equal("//server/share/x");
});

// Scenario: A UNC working directory is the anchor when no argument is absolute

it("[happy-4] resolve keeps the prefix of a UNC cwd when no argument is absolute", () => {
  withCwd(String.raw`\\server\share\project`, () => {
    expect(resolve("src", "index.ts")).to.equal("//server/share/project/src/index.ts");
  });
});

it("[happy-4] resolve with no arguments returns the UNC cwd with its prefix", () => {
  withCwd(String.raw`\\server\share\project`, () => {
    expect(resolve()).to.equal("//server/share/project");
  });
});

// Scenario: Climbing out of the share

it("[boundary-1] resolve climbs out of the share with .. and keeps the prefix", () => {
  expect(resolve("//server/share/..")).to.equal("//server");
  expect(normalize("//server/share/..")).to.equal("//server");
});

it("[boundary-1] resolve climbs out of the server with .. and keeps the prefix", () => {
  expect(resolve("//server/../share")).to.equal("//share");
  expect(normalize("//server/../share")).to.equal("//share");
});

it("[boundary-1] resolve climbs above the share across several arguments without clamping", () => {
  expect(resolve("//server/share", "a", "..", "..", "b")).to.equal("//server/b");
  expect(normalize("//server/share/a/../../b")).to.equal("//server/b");
});

it("[boundary-1] resolve returns / once .. segments empty the UNC body", () => {
  expect(resolve("//server/share", "..", "..")).to.equal("/");
  expect(normalize("//server/share/../..")).to.equal("/");
  expect(resolve("//server/share/a", "../../..")).to.equal("/");
  expect(normalize("//server/share/a/../../..")).to.equal("/");
});

it("[boundary-1] resolve stays at / when .. segments go beyond an empty UNC body", () => {
  expect(resolve("//server/share", "..", "..", "..")).to.equal("/");
  expect(normalize("//server/share/../../..")).to.equal("/");
});

it("[boundary-1] resolve climbing out of the share does not depend on a Windows cwd", () => {
  withCwd(WINDOWS_CWD, () => {
    expect(resolve("//server/share", "a", "..", "..", "b")).to.equal("//server/b");
    expect(resolve("//server/share", "..", "..")).to.equal("/");
  });
});

// Scenario: Separators only, or three or more leading separators

it("[boundary-2] resolve of two separators only returns /", () => {
  expect(resolve("//")).to.equal("/");
  expect(resolve("\\\\")).to.equal("/");
});

it("[boundary-2] resolve of three separators only returns /", () => {
  expect(resolve("///")).to.equal("/");
});

it("[boundary-2] resolve collapses three leading separators before a name to //", () => {
  expect(resolve("///foo")).to.equal("//foo");
  expect(resolve("\\\\\\foo")).to.equal("//foo");
});

// Scenario: Non-UNC anchors keep the single leading separator or drive letter

it("[happy-5] resolve keeps a single leading separator for a root-relative anchor", () => {
  expect(resolve("/foo/bar", "./baz")).to.equal("/foo/bar/baz");
  expect(resolve(String.raw`\foo\bar`, "..", ".", String.raw`.\baz`)).to.equal("/foo/baz");
  expect(resolve("/foo", "bar//baz")).to.equal("/foo/bar/baz");
});

it("[happy-5] resolve keeps the drive letter for a drive anchor", () => {
  expect(resolve(String.raw`C:\foo\bar`, String.raw`.\baz`)).to.equal("C:/foo/bar/baz");
});

it("[happy-5] resolve drops the UNC prefix when a later root-relative or drive argument is the anchor", () => {
  expect(resolve("//server/share", "/foo")).to.equal("/foo");
  expect(resolve("//server/share", "C:/foo")).to.equal("C:/foo");
  expect(resolve("//server/share", "\\foo")).to.equal("/foo");
});

it("[happy-5] resolve with a non-UNC anchor does not depend on a Windows cwd", () => {
  withCwd(WINDOWS_CWD, () => {
    expect(resolve("/foo/bar", "./baz")).to.equal("/foo/bar/baz");
    expect(resolve("//server/share", "/foo")).to.equal("/foo");
  });
});

// Scenario: A "//." device path is not absolute, so it resolves against the working directory as today

it("[unhappy-1] resolve treats a //. device path as relative to the cwd", () => {
  withCwd(WINDOWS_CWD, () => {
    expect(resolve("//./foo/bar")).to.equal("C:/Windows/path/only/foo/bar");
  });
});

it("[unhappy-1] resolve treats a backslash \\\\. device path with a drive segment as relative to the cwd", () => {
  withCwd(WINDOWS_CWD, () => {
    expect(resolve(String.raw`\\.\c:\temp`)).to.equal("C:/Windows/path/only/c:/temp");
  });
});

// Scenario: Without a working directory, a relative result never gains a UNC prefix

it("[unhappy-2] resolve without a cwd returns a //. device path without any prefix", () => {
  withCwd("", () => {
    expect(resolve("//./x")).to.equal("x");
  });
});

it("[unhappy-2] resolve without a cwd returns . or a relative .. path for relative arguments", () => {
  withCwd("", () => {
    expect(resolve(".", "./")).to.equal(".");
    expect(resolve("..", "..")).to.equal("../..");
  });
});

// Scenario: A UNC call does not affect the next call

it("[boundary-3] resolve keeps no UNC state between consecutive calls", () => {
  const first = resolve("//server/share/a");
  const second = resolve("/foo/bar");
  const third = resolve("//server/share/b");
  expect([first, second, third]).to.deep.equal(["//server/share/a", "/foo/bar", "//server/share/b"]);
});

it("[boundary-3] resolve of a non-UNC path right after a UNC call keeps a single separator", () => {
  expect(resolve("//server/share/a")).to.equal("//server/share/a");
  expect(resolve("/foo/bar")).to.equal("/foo/bar");
  expect(resolve("//server/share/a")).to.equal("//server/share/a");
  expect(resolve("/foo/bar")).to.equal("/foo/bar");
});

// Scenario: format over UNC segments

it("[happy-6] format keeps the UNC prefix of a root", () => {
  expect(format({ root: "//server/share/", base: "x.txt" })).to.equal("//server/share/x.txt");
});

it("[happy-6] format keeps the UNC prefix of a dir when root is set", () => {
  expect(format({ root: "/", dir: "//server/share/dir", base: "x.txt" })).to.equal(
    "//server/share/dir/x.txt",
  );
});

it("[happy-6] format keeps the UNC prefix of a backslash dir without a root", () => {
  expect(format({ dir: String.raw`\\server\share\dir`, base: "x.txt" })).to.equal(
    "//server/share/dir/x.txt",
  );
});

it("[happy-6] format with a / root and a base ignores ext and keeps one separator", () => {
  expect(format({ root: "/", base: "file.txt", ext: "ignored" })).to.equal("/file.txt");
});

// Scenario: relative between UNC and non-UNC paths

it("[boundary-4] relative between siblings on the same UNC share", () => {
  expect(relative("//server/share/a", "//server/share/b")).to.equal("../b");
});

it("[boundary-4] relative between different UNC servers", () => {
  expect(relative("//server/share/a", "//other/share/b")).to.equal("../../../other/share/b");
});

it("[boundary-4] relative from a root-relative path to a UNC path has no empty segments", () => {
  expect(relative("/a", "//server/share/b")).to.equal("../server/share/b");
});

it("[boundary-4] relative from a UNC path to a root-relative path", () => {
  expect(relative("//server/share/a", "/b")).to.equal("../../../b");
});

it("[boundary-4] relative from a backslash UNC path to its parent", () => {
  expect(relative(String.raw`\\server\share\a\b`, String.raw`\\server\share\a`)).to.equal("..");
});

it("[boundary-4] relative between identical UNC shares is empty", () => {
  expect(relative("//server/share", "//server/share")).to.equal("");
});

it("[boundary-4] relative from a UNC path to a descendant", () => {
  expect(relative("//server/share/a", "//server/share/a/b/c")).to.equal("b/c");
});

it("[boundary-4] relative between UNC paths does not depend on a Windows cwd", () => {
  withCwd(WINDOWS_CWD, () => {
    expect(relative("/a", "//server/share/b")).to.equal("../server/share/b");
    expect(relative("//server/share/a", "/b")).to.equal("../../../b");
  });
});
