import { expect, it, vi } from "vitest";

import { normalize, resolve } from "../../src/_path";

const WINDOWS_CWD = String.raw`C:\Windows\path\only`;
const POSIX_CWD = "/srv/app";
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

// Runs `function_` with the real cwd and with each mocked cwd in `values`.
function forEachCwd(values: string[], function_: () => void) {
  function_();
  for (const value of values) {
    withCwd(value, function_);
  }
}

const skip = (value: null | undefined) => value as unknown as string;

// Scenario: A single UNC argument keeps both leading separators

const HAPPY_1_TABLE: [string, string][] = [
  ["//server/share/file", "//server/share/file"],
  ["\\\\server\\share\\file", "//server/share/file"],
  ["\\\\server/share/file", "//server/share/file"],
  ["/\\server\\share\\file", "//server/share/file"],
  ["//server/share/x/./y/../z", "//server/share/x/z"],
  ["//server//share//x//", "//server/share/x"],
  ["//server/share/", "//server/share"],
  ["//server/share", "//server/share"],
  ["//server", "//server"],
  ["//server/", "//server"],
  ["//?/C:/foo", "//?/C:/foo"],
  ["\\\\?\\C:\\foo", "//?/C:/foo"],
  ["//C:/foo/bar", "//C:/foo/bar"],
];

// Extends the public "does not depend on a Windows cwd" test: every row, under every cwd.
it("[happy-1] resolve returns every row of the single UNC argument table under real, Windows, POSIX and UNC cwds", () => {
  forEachCwd([WINDOWS_CWD, POSIX_CWD, String.raw`\\other\elsewhere`, ""], () => {
    for (const [input, output] of HAPPY_1_TABLE) {
      expect(resolve(input), input).to.equal(output);
    }
  });
});

// Extends "normalizes dot segments and repeated separators" with backslash input.
it("[happy-1] resolve normalizes dot segments and repeated backslashes beneath a backslash UNC prefix", () => {
  expect(resolve(String.raw`\\server\share\x\.\y\..\z`)).to.equal("//server/share/x/z");
  expect(resolve(String.raw`\\server\\share\\x\\`)).to.equal("//server/share/x");
  expect(resolve(String.raw`\/server\share/`)).to.equal("//server/share");
});

// Extends "strips the trailing separator of a bare UNC share or server".
it("[happy-1] resolve strips a trailing backslash or dot segment from a bare UNC share", () => {
  expect(resolve("\\\\server\\share\\")).to.equal("//server/share");
  expect(resolve("//server/share/./")).to.equal("//server/share");
  expect(resolve("//server/share/a/..")).to.equal("//server/share");
  expect(resolve("//server/share/a/../")).to.equal("//server/share");
});

// Extends "keeps the prefix of namespace and drive-like UNC paths": a bare drive
// segment gets no trailing separator, unlike normalize("//C:") which gives "//C:/".
it("[happy-1] resolve of a UNC path whose body is a bare drive adds no trailing separator", () => {
  expect(resolve("//C:")).to.equal("//C:");
  expect(resolve("//C:/")).to.equal("//C:");
  expect(resolve("\\\\C:\\")).to.equal("//C:");
  expect(resolve("//C:/foo/..")).to.equal("//C:");
});

// Extends "keeps the prefix of namespace and drive-like UNC paths" with longer namespace paths.
it("[happy-1] resolve keeps the prefix of a //?/UNC namespace path", () => {
  expect(resolve("//?/UNC/server/share/dir")).to.equal("//?/UNC/server/share/dir");
  expect(resolve("\\\\?\\UNC\\server\\share\\dir\\")).to.equal("//?/UNC/server/share/dir");
});

it("[happy-1] resolve keeps dot-prefixed and triple-dot segments beneath a UNC prefix", () => {
  expect(resolve("//server/share/.hidden/...")).to.equal("//server/share/.hidden/...");
  expect(resolve("//server/.share/file")).to.equal("//server/.share/file");
});

it("[happy-1] resolve keeps the prefix of UNC paths with spaces and non-ASCII names", () => {
  expect(resolve("//my server/共有/ファイル.txt")).to.equal("//my server/共有/ファイル.txt");
  expect(resolve(String.raw`\\my server\a b\c.txt`)).to.equal("//my server/a b/c.txt");
});

it("[happy-1] resolve keeps the prefix of a deep UNC path with many dot segments", () => {
  const segments = Array.from({ length: 200 }, (_, index) => `seg${index}`);
  const input = `//server/share/${segments.map((segment) => `${segment}/./drop/..`).join("/")}`;
  expect(resolve(input)).to.equal(`//server/share/${segments.join("/")}`);
  expect(resolve(input.replace(/\//g, "\\"))).to.equal(`//server/share/${segments.join("/")}`);
});

// Scenario: Relative arguments after a UNC anchor resolve beneath it

// Extends "places relative arguments beneath a UNC anchor" with more arguments.
it("[happy-2] resolve places many relative arguments beneath a UNC anchor", () => {
  expect(resolve("//server/share", "a", "b", "c", "d", "e")).to.equal("//server/share/a/b/c/d/e");
  const segments = Array.from({ length: 100 }, (_, index) => `part${index}`);
  expect(resolve("//server/share", ...segments)).to.equal(`//server/share/${segments.join("/")}`);
});

// Extends "places backslash relative arguments beneath a backslash UNC anchor" with mixed combinations.
it("[happy-2] resolve mixes backslash and forward-slash anchors and relative arguments", () => {
  expect(resolve(String.raw`\\server\share`, "a/b", String.raw`c\d`)).to.equal(
    "//server/share/a/b/c/d",
  );
  expect(resolve("//server/share", String.raw`..\other\.\x`)).to.equal("//server/other/x");
  expect(resolve(String.raw`/\server/share`, "dir")).to.equal("//server/share/dir");
});

it("[happy-2] resolve with dot and dot-dot arguments beneath a UNC anchor", () => {
  expect(resolve("//server/share/a/b", "..", "c")).to.equal("//server/share/a/c");
  expect(resolve("//server/share", ".")).to.equal("//server/share");
  expect(resolve("//server/share/", "./")).to.equal("//server/share");
  expect(resolve("//server/share/a", "b", "..", "c", ".", "d")).to.equal("//server/share/a/c/d");
});

// Extends "skips undefined, null and empty arguments" with skipped values before, between and after.
it("[happy-2] resolve skips undefined, null and empty arguments in every position around a UNC anchor", () => {
  expect(
    resolve("", skip(undefined), "//server/share", "", skip(null), "x", "", skip(undefined), "y", ""),
  ).to.equal("//server/share/x/y");
  expect(resolve("//server/share", skip(null))).to.equal("//server/share");
});

// Extends "drops trailing separators of relative arguments" with doubled separators.
it("[happy-2] resolve drops doubled trailing separators of relative arguments after a UNC anchor", () => {
  expect(resolve("//server/share", "a//", "b\\\\", "c/")).to.equal("//server/share/a/b/c");
});

// A "//." argument is relative, so it does not replace the UNC anchor before it.
it("[happy-2] resolve places a //. argument beneath an earlier UNC anchor", () => {
  expect(resolve("//server/share", "//./x")).to.equal("//server/share/x");
  expect(resolve(String.raw`\\server\share`, String.raw`\\.\x`, "y")).to.equal(
    "//server/share/x/y",
  );
});

it("[happy-2] resolve beneath a UNC anchor ignores a different UNC or POSIX cwd", () => {
  forEachCwd([String.raw`\\other\place\deep`, POSIX_CWD, ""], () => {
    expect(resolve("//server/share", "x")).to.equal("//server/share/x");
    expect(resolve(String.raw`\\server\share\file`, String.raw`..\path`)).to.equal(
      "//server/share/path",
    );
  });
});

// Scenario: A UNC argument after a non-UNC absolute argument becomes the anchor

// Extends "anchors at a UNC argument that follows a root-relative argument".
it("[happy-3] resolve anchors at a UNC argument after a root-relative and a drive argument", () => {
  expect(resolve("/foo", "C:/bar", "//server/share", "x")).to.equal("//server/share/x");
  expect(resolve(String.raw`\foo`, String.raw`\\server\share`, "x")).to.equal("//server/share/x");
});

it("[happy-3] resolve ignores relative arguments before a UNC anchor", () => {
  expect(resolve("a", "b", "//server/share", "c")).to.equal("//server/share/c");
  expect(resolve("../..", "//server/share")).to.equal("//server/share");
});

// Extends "anchors at the rightmost of two UNC arguments" with more anchors.
it("[happy-3] resolve anchors at the rightmost of several UNC arguments", () => {
  expect(resolve("//a/b", "c", "//d/e", "f", "//server/share", "g")).to.equal("//server/share/g");
  expect(resolve("//server/share", "/foo", "//other/share", "x")).to.equal("//other/share/x");
});

it("[happy-3] resolve climbs beneath a UNC anchor that follows a root-relative argument", () => {
  expect(resolve("/foo", "//server/share", "..", "x")).to.equal("//server/x");
});

it("[happy-3] resolve anchors at a later UNC argument under every cwd", () => {
  forEachCwd([WINDOWS_CWD, POSIX_CWD, ""], () => {
    expect(resolve("/foo", "//server/share", "x")).to.equal("//server/share/x");
    expect(resolve(String.raw`C:\foo`, String.raw`\\server\share\x`)).to.equal("//server/share/x");
  });
});

// Scenario: A UNC working directory is the anchor when no argument is absolute

// Extends "keeps the prefix of a UNC cwd" with other cwd spellings.
it("[happy-4] resolve keeps the prefix of a forward-slash and a mixed-separator UNC cwd", () => {
  withCwd("//server/share/project", () => {
    expect(resolve("a")).to.equal("//server/share/project/a");
  });
  withCwd(String.raw`\\server/share\project`, () => {
    expect(resolve("a", "b")).to.equal("//server/share/project/a/b");
  });
});

it("[happy-4] resolve strips the trailing separator of a UNC cwd", () => {
  withCwd("\\\\server\\share\\", () => {
    expect(resolve()).to.equal("//server/share");
    expect(resolve("x")).to.equal("//server/share/x");
  });
});

it("[happy-4] resolve keeps the prefix of a bare-server and a namespace cwd", () => {
  withCwd(String.raw`\\server`, () => {
    expect(resolve("a", "b")).to.equal("//server/a/b");
  });
  withCwd(String.raw`\\?\C:\proj`, () => {
    expect(resolve("a")).to.equal("//?/C:/proj/a");
  });
});

it("[happy-4] resolve applies dot, dot-dot and skipped arguments beneath a UNC cwd", () => {
  withCwd(UNC_CWD, () => {
    expect(resolve("../other", "./f.txt")).to.equal("//server/share/other/f.txt");
    expect(resolve(".")).to.equal("//server/share/project");
    expect(resolve("", skip(undefined), skip(null))).to.equal("//server/share/project");
    expect(resolve("a/", "b\\")).to.equal("//server/share/project/a/b");
  });
});

it("[happy-4] resolve places many relative arguments beneath a UNC cwd", () => {
  const segments = Array.from({ length: 60 }, (_, index) => `d${index}`);
  withCwd(UNC_CWD, () => {
    expect(resolve(...segments)).to.equal(`//server/share/project/${segments.join("/")}`);
  });
});

// Scenario: Climbing out of the share

const BOUNDARY_1_TABLE: [string[], string][] = [
  [["//server/share/.."], "//server"],
  [["//server/../share"], "//share"],
  [["//server/share", "a", "..", "..", "b"], "//server/b"],
  [["//server/share", "..", ".."], "/"],
  [["//server/share/a", "../../.."], "/"],
  [["//server/share", "..", "..", ".."], "/"],
];

// Extends the public climbing tests: every row under every cwd, with the normalize check.
it("[boundary-1] resolve returns every row of the climbing table and agrees with normalize under every cwd", () => {
  forEachCwd([WINDOWS_CWD, POSIX_CWD, UNC_CWD], () => {
    for (const [arguments_, output] of BOUNDARY_1_TABLE) {
      expect(resolve(...arguments_), arguments_.join(",")).to.equal(output);
      expect(normalize(arguments_.join("/")), arguments_.join(",")).to.equal(output);
    }
  });
});

it("[boundary-1] resolve climbs out of a backslash UNC share", () => {
  expect(resolve(String.raw`\\server\share\..`)).to.equal("//server");
  expect(resolve(String.raw`\\server\share`, String.raw`..\..`)).to.equal("/");
  expect(resolve(String.raw`\\server\share`, String.raw`..\other`)).to.equal("//server/other");
});

// The body becomes empty, then a later name makes it non-empty again: the prefix comes back.
it("[boundary-1] resolve keeps the prefix when a name follows .. segments that emptied the body", () => {
  expect(resolve("//server/share", "..", "..", "..", "x")).to.equal("//x");
  expect(normalize("//server/share/../../../x")).to.equal("//x");
  expect(resolve("//a/b/c/../../../../d")).to.equal("//d");
  expect(normalize("//a/b/c/../../../../d")).to.equal("//d");
});

it("[boundary-1] resolve climbs a deep UNC path one segment at a time without clamping", () => {
  const segments = Array.from({ length: 50 }, (_, index) => `s${index}`);
  const ups = (count: number) => Array.from({ length: count }, () => "..");
  expect(resolve("//server/share", ...segments, ...ups(50))).to.equal("//server/share");
  expect(resolve("//server/share", ...segments, ...ups(51))).to.equal("//server");
  expect(resolve("//server/share", ...segments, ...ups(52))).to.equal("/");
  expect(resolve("//server/share", ...segments, ...ups(53))).to.equal("/");
  expect(normalize(["//server/share", ...segments, ...ups(51)].join("/"))).to.equal("//server");
});

it("[boundary-1] resolve climbs out of a UNC cwd", () => {
  withCwd(UNC_CWD, () => {
    expect(resolve("../..")).to.equal("//server");
    expect(normalize("//server/share/project/../..")).to.equal("//server");
    expect(resolve("..", "..", "..")).to.equal("/");
    expect(resolve("..", "..", "..", "y")).to.equal("//y");
  });
});

// Scenario: Separators only, or three or more leading separators

it("[boundary-2] resolve of four leading separators before a name collapses to //", () => {
  expect(resolve("////foo")).to.equal("//foo");
  expect(normalize("////foo")).to.equal("//foo");
  expect(resolve("/\\/foo")).to.equal("//foo");
  expect(resolve("////")).to.equal("/");
});

it("[boundary-2] resolve of three leading separators with repeated inner separators", () => {
  expect(resolve("///foo///bar///")).to.equal("//foo/bar");
  expect(normalize("///foo///bar")).to.equal("//foo/bar");
});

// Extends "two separators only returns /": "//" is a UNC anchor whose body a later name fills.
it("[boundary-2] resolve places relative arguments beneath a separators-only anchor", () => {
  expect(resolve("//", "a")).to.equal("//a");
  expect(resolve("\\\\", "a", "b")).to.equal("//a/b");
  expect(resolve("///", "a")).to.equal("//a");
  expect(resolve("//", "..")).to.equal("/");
  expect(resolve("//", ".")).to.equal("/");
});

it("[boundary-2] resolve anchors at a separators-only argument after a drive argument", () => {
  expect(resolve("C:/x", "//", "y")).to.equal("//y");
  expect(resolve("C:/x", "//")).to.equal("/");
});

it("[boundary-2] resolve of separators-only and triple-separator inputs does not depend on the cwd", () => {
  forEachCwd([WINDOWS_CWD, UNC_CWD, ""], () => {
    expect(resolve("//")).to.equal("/");
    expect(resolve("\\\\")).to.equal("/");
    expect(resolve("///")).to.equal("/");
    expect(resolve("///foo")).to.equal("//foo");
    expect(resolve("\\\\\\foo")).to.equal("//foo");
  });
});

// Scenario: Non-UNC anchors keep the single leading separator or drive letter
// Each test first checks a UNC result in the same setting, then the unchanged non-UNC result.

// Extends "drops the UNC prefix when a later root-relative or drive argument is the anchor".
it("[happy-5] resolve with a root-relative anchor after a UNC argument keeps one separator", () => {
  expect(resolve("//server/share", "bar")).to.equal("//server/share/bar");
  expect(resolve("//server/share", "/foo", "bar")).to.equal("/foo/bar");
  expect(resolve("//server/share", "/")).to.equal("/");
  expect(resolve("/foo", "//server/share", "/bar")).to.equal("/bar");
});

it("[happy-5] resolve with a backslash drive anchor after a UNC argument keeps the drive letter", () => {
  expect(resolve(String.raw`\\server\share`, "y")).to.equal("//server/share/y");
  expect(resolve("//server/share", String.raw`D:\x`, String.raw`..\y`)).to.equal("D:/y");
});

// A UNC cwd is not the anchor when an argument is absolute.
it("[happy-5] resolve with a root-relative or drive anchor ignores a UNC cwd", () => {
  withCwd(UNC_CWD, () => {
    expect(resolve("bar")).to.equal("//server/share/project/bar");
    expect(resolve("/foo", "bar")).to.equal("/foo/bar");
    expect(resolve("C:/foo")).to.equal("C:/foo");
    expect(resolve(String.raw`\foo\bar`, "..", ".", String.raw`.\baz`)).to.equal("/foo/baz");
    expect(resolve(String.raw`C:\foo\bar`, String.raw`.\baz`)).to.equal("C:/foo/bar/baz");
  });
});

it("[happy-5] resolve of a root-relative path with repeated separators keeps one leading separator", () => {
  expect(resolve("//server/share//x")).to.equal("//server/share/x");
  expect(resolve("/a//b///c")).to.equal("/a/b/c");
  expect(resolve("/foo", "bar//baz", "//./q")).to.equal("/foo/bar/baz/q");
});

// Scenario: A "//." device path is not absolute, so it resolves against the working directory as today

// Extends the public Windows-cwd cases with more arguments.
it("[unhappy-1] resolve places a //. path and later arguments beneath a Windows cwd", () => {
  withCwd(WINDOWS_CWD, () => {
    expect(resolve("//server/share")).to.equal("//server/share");
    expect(resolve("//./foo", "bar")).to.equal("C:/Windows/path/only/foo/bar");
    expect(resolve(String.raw`\\.\foo\bar`)).to.equal("C:/Windows/path/only/foo/bar");
  });
});

it("[unhappy-1] resolve places a //. path beneath a POSIX cwd with a single leading separator", () => {
  withCwd(POSIX_CWD, () => {
    expect(resolve("//server/share")).to.equal("//server/share");
    expect(resolve("//./foo/bar")).to.equal("/srv/app/foo/bar");
    expect(resolve(String.raw`\\.\c:\temp`)).to.equal("/srv/app/c:/temp");
  });
});

it("[unhappy-1] resolve places a //. path beneath a UNC cwd", () => {
  withCwd(UNC_CWD, () => {
    expect(resolve("//./foo/bar")).to.equal("//server/share/project/foo/bar");
    expect(resolve(String.raw`\\.\c:\temp`)).to.equal("//server/share/project/c:/temp");
  });
});

// Any two separators followed by "." are relative, not only "//./".
it("[unhappy-1] resolve treats //.name and //.. paths as relative to the cwd", () => {
  withCwd(UNC_CWD, () => {
    expect(resolve("//.hidden/x")).to.equal("//server/share/project/.hidden/x");
  });
  withCwd(WINDOWS_CWD, () => {
    expect(resolve("//server/share/x")).to.equal("//server/share/x");
    expect(resolve("//.hidden/x")).to.equal("C:/Windows/path/only/.hidden/x");
    expect(resolve("//../x")).to.equal("C:/Windows/path/x");
  });
});

it("[unhappy-1] resolve places a //. path beneath an earlier root-relative anchor", () => {
  withCwd(WINDOWS_CWD, () => {
    expect(resolve("//server/share", "//./foo")).to.equal("//server/share/foo");
    expect(resolve("/base", "//./foo")).to.equal("/base/foo");
  });
});

// Scenario: Without a working directory, a relative result never gains a UNC prefix

it("[unhappy-2] resolve without a cwd still keeps the prefix of an explicit UNC anchor", () => {
  withCwd("", () => {
    expect(resolve("//server/share", "x")).to.equal("//server/share/x");
    expect(resolve("//server/share", "..", "..")).to.equal("/");
  });
});

// Extends "returns a //. device path without any prefix" with other //. spellings and arguments.
it("[unhappy-2] resolve without a cwd returns backslash and multi-argument //. paths without a prefix", () => {
  withCwd("", () => {
    expect(resolve("//server/share")).to.equal("//server/share");
    expect(resolve(String.raw`\\.\x`)).to.equal("x");
    expect(resolve("\\\\.\\x\\", "y\\")).to.equal("x/y");
    expect(resolve("//./a", "b")).to.equal("a/b");
    expect(resolve("a", "//./x")).to.equal("a/x");
  });
});

// Extends "returns . or a relative .. path" with //. paths that climb.
it("[unhappy-2] resolve without a cwd climbs a //. path into a relative result without a prefix", () => {
  withCwd("", () => {
    expect(resolve("//server/share/a")).to.equal("//server/share/a");
    expect(resolve("//./x", "..")).to.equal(".");
    expect(resolve("//./x", "../..")).to.equal("..");
    expect(resolve("//./x/../../y")).to.equal("../y");
  });
});

// Scenario: A UNC call does not affect the next call

// Extends "keeps no UNC state between consecutive calls" with the other order.
it("[boundary-3] resolve of a UNC path right after a non-UNC call keeps both separators", () => {
  const results = [
    resolve("/foo/bar"),
    resolve("//server/share/b"),
    resolve("C:/x"),
    resolve("//server/share/a"),
  ];
  expect(results).to.deep.equal(["/foo/bar", "//server/share/b", "C:/x", "//server/share/a"]);
});

it("[boundary-3] resolve alternates UNC and non-UNC calls many times without drift", () => {
  const results: string[] = [];
  const expected: string[] = [];
  for (let index = 0; index < 50; index++) {
    results.push(resolve(`//server/share/${index}`), resolve(`/foo/${index}`), resolve(`C:/d/${index}`));
    expected.push(`//server/share/${index}`, `/foo/${index}`, `C:/d/${index}`);
  }
  expect(results).to.deep.equal(expected);
});

it("[boundary-3] resolve with a UNC cwd does not affect a later call with a Windows or empty cwd", () => {
  const first = withCwd(UNC_CWD, () => resolve("a"));
  const second = withCwd(WINDOWS_CWD, () => resolve("a"));
  const third = withCwd("", () => resolve("a"));
  const fourth = withCwd(UNC_CWD, () => resolve("a"));
  expect([first, second, third, fourth]).to.deep.equal([
    "//server/share/project/a",
    "C:/Windows/path/only/a",
    "a",
    "//server/share/project/a",
  ]);
});

it("[boundary-3] resolve of a //. path without a cwd right after a UNC call gains no prefix", () => {
  withCwd("", () => {
    expect(resolve("//server/share/a")).to.equal("//server/share/a");
    expect(resolve("//./x")).to.equal("x");
    expect(resolve("//server/share/a", "..")).to.equal("//server/share");
    expect(resolve("x")).to.equal("x");
  });
});
