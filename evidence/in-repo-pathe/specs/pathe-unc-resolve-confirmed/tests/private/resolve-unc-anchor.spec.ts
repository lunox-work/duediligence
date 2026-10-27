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

// Absolute arguments do not depend on the cwd, whatever it is: Windows, POSIX,
// UNC (which must not leak into the result) or empty.
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

const NULLISH = [undefined, null] as unknown as [string, string];

// Scenario: A single UNC argument keeps both leading separators

// Extends "[happy-1] resolve keeps the // prefix of a single UNC argument"
it("[happy-1] resolve keeps the // prefix for other servers, shares and deeper paths", () => {
  expect(resolve("//fileserver.corp.example/public$/docs/2024/report.final.pdf")).to.equal(
    "//fileserver.corp.example/public$/docs/2024/report.final.pdf",
  );
  expect(resolve("\\\\srv\\data\\a\\b\\c\\d\\e.txt")).to.equal("//srv/data/a/b/c/d/e.txt");
  expect(resolve("//SRV/Share With Space/ü.txt")).to.equal("//SRV/Share With Space/ü.txt");
});

// Extends "[happy-1] resolve keeps the // prefix of a single UNC argument": the other mix order
it("[happy-1] resolve keeps the // prefix when a backslash is followed by a slash", () => {
  expect(resolve("\\/srv/data/x")).to.equal("//srv/data/x");
  expect(resolve("\\/srv\\data\\x")).to.equal("//srv/data/x");
  expect(resolve("/\\srv/data")).to.equal("//srv/data");
});

// Extends "[happy-1] resolve keeps the UNC prefix with a Windows working directory"
it("[happy-1] resolve keeps the UNC prefix of every spec example under any working directory", () => {
  const table: Array<[string, string]> = [
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
  eachCwd(() => {
    for (const [input, output] of table) {
      expect(resolve(input)).to.equal(output);
    }
  });
});

// Shortcut: deciding UNC-ness from the first raw argument instead of the anchor
it("[happy-1] resolve keeps the UNC prefix when empty arguments precede the UNC argument", () => {
  eachCwd(() => {
    expect(resolve("", "//server/share/file")).to.equal("//server/share/file");
    expect(resolve(...NULLISH, "\\\\server\\share\\file")).to.equal("//server/share/file");
  });
});

// Extends "[happy-1] resolve normalizes the body of a single UNC argument"
it("[happy-1] resolve normalizes longer UNC bodies with dots and repeated separators", () => {
  expect(resolve("//server/share/a/b/../../c/./d/../e")).to.equal("//server/share/c/e");
  expect(resolve("\\\\server\\\\share\\.\\x\\..\\y")).to.equal("//server/share/y");
  expect(resolve("//server///share////a///b")).to.equal("//server/share/a/b");
});

// Extends "[happy-1] resolve strips the trailing separator of a bare share or server"
it("[happy-1] resolve strips trailing separators and dots after a UNC path", () => {
  expect(resolve("\\\\server\\share\\")).to.equal("//server/share");
  expect(resolve("\\\\server\\")).to.equal("//server");
  expect(resolve("//server/share/x///")).to.equal("//server/share/x");
  expect(resolve("//server/share/x/.")).to.equal("//server/share/x");
  expect(resolve("//server/share/x/./")).to.equal("//server/share/x");
});

// Extends "[happy-1] resolve keeps the prefix of namespaced and drive-like UNC paths"
it("[happy-1] resolve keeps the prefix of other namespaced and drive-like UNC paths", () => {
  expect(resolve("//?/UNC/server/share/x")).to.equal("//?/UNC/server/share/x");
  expect(resolve("\\\\?\\D:\\a\\..\\b")).to.equal("//?/D:/b");
  expect(resolve("\\\\C:\\foo")).to.equal("//C:/foo");
});

// Scenario: Relative arguments after a UNC anchor resolve beneath it

// Extends "[happy-2] resolve places relative arguments beneath a UNC anchor"
it("[happy-2] resolve places many relative arguments beneath a UNC anchor", () => {
  expect(resolve("//server/share", "a", "b", "c", "d", "e", "f.txt")).to.equal(
    "//server/share/a/b/c/d/e/f.txt",
  );
  expect(resolve("//server/share/a/b/c", "../../x", ".\\y", "..\\z")).to.equal(
    "//server/share/a/x/z",
  );
  expect(resolve("//server/share", "a//b", ".//c")).to.equal("//server/share/a/b/c");
});

// Extends "[happy-2] resolve places relative arguments beneath a UNC anchor": every working directory
it("[happy-2] resolve places relative arguments beneath a UNC anchor under any working directory", () => {
  eachCwd(() => {
    expect(resolve("//server/share/file", "../path")).to.equal("//server/share/path");
    expect(resolve("\\\\server\\share\\file", "..\\path")).to.equal("//server/share/path");
    expect(resolve("//server/share", "dir", "./file.txt")).to.equal("//server/share/dir/file.txt");
  });
});

// Extends "[happy-2] resolve skips empty arguments after a UNC anchor": empties everywhere
it("[happy-2] resolve skips empty arguments before, between and after UNC segments", () => {
  eachCwd(() => {
    expect(
      resolve(
        undefined as unknown as string,
        "//server/share",
        "",
        "a",
        null as unknown as string,
        "b",
        undefined as unknown as string,
      ),
    ).to.equal("//server/share/a/b");
  });
});

// Extends "[happy-2] resolve drops trailing separators of relative arguments after a UNC anchor"
it("[happy-2] resolve with dot-only and slash-terminated relative arguments after a UNC anchor", () => {
  expect(resolve("//server/share/a", ".")).to.equal("//server/share/a");
  expect(resolve("//server/share/a", "./")).to.equal("//server/share/a");
  expect(resolve("\\\\server\\share\\a", "b\\\\", "c//", "d\\")).to.equal(
    "//server/share/a/b/c/d",
  );
});

// Scenario: A UNC argument after a non-UNC absolute argument becomes the anchor

// Extends "[happy-3] resolve anchors on a UNC argument that follows a non-UNC absolute one"
it("[happy-3] resolve anchors on a UNC argument after several non-UNC absolute ones", () => {
  eachCwd(() => {
    expect(resolve("/a", "C:\\b", "//server/share", "c", "d")).to.equal("//server/share/c/d");
    expect(resolve("/", "//s/h")).to.equal("//s/h");
    expect(resolve("C:/foo", "", "//server/share", null as unknown as string, "x")).to.equal(
      "//server/share/x",
    );
    expect(resolve("D:\\data", "rel", "\\\\server\\share", "..\\up")).to.equal("//server/up");
  });
});

// Extends "[happy-3] resolve anchors on the rightmost of two UNC arguments"
it("[happy-3] resolve anchors on the rightmost of several UNC arguments", () => {
  expect(resolve("\\\\old\\share\\x", "y", "\\\\new\\share", "..\\z")).to.equal("//new/z");
  expect(resolve("//a/b", "//c/d", "//e/f", "g")).to.equal("//e/f/g");
});

// Scenario: A UNC working directory is the anchor when no argument is absolute

// Extends "[happy-4] resolve keeps the prefix of a UNC working directory": other separators
it("[happy-4] resolve keeps the prefix of forward-slash and mixed UNC working directories", () => {
  withCwd("//server/share/project", () => {
    expect(resolve("src", "index.ts")).to.equal("//server/share/project/src/index.ts");
  });
  withCwd("\\/server\\share/project", () => {
    expect(resolve("src", "index.ts")).to.equal("//server/share/project/src/index.ts");
  });
});

// Extends "[happy-4] resolve keeps the prefix of a UNC working directory": climbing and dots
it("[happy-4] resolve climbs within a UNC working directory", () => {
  withCwd("\\\\server\\share\\project\\packages\\core", () => {
    expect(resolve("..", "other", "./lib")).to.equal("//server/share/project/packages/other/lib");
    expect(resolve(".")).to.equal("//server/share/project/packages/core");
    expect(resolve("..\\..\\docs\\")).to.equal("//server/share/project/docs");
  });
});

// Extends "[happy-4] resolve with no arguments returns the UNC working directory"
it("[happy-4] resolve with only empty arguments or a trailing-separator cwd returns the UNC cwd", () => {
  withCwd("\\\\server\\share\\project", () => {
    expect(resolve("", ...NULLISH)).to.equal("//server/share/project");
  });
  withCwd("\\\\server\\share\\", () => {
    expect(resolve()).to.equal("//server/share");
  });
  withCwd("//server", () => {
    expect(resolve()).to.equal("//server");
  });
});
