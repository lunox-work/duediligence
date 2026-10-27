import { expect, it } from "vitest";

import { extname } from "../../src/_path";

function expectExtnames(cases: Record<string, string>) {
  for (const [input, expected] of Object.entries(cases)) {
    expect(extname(input), `extname(${JSON.stringify(input)})`).to.equal(
      expected,
    );
  }
}

// Extends "[happy-1] a name ending with a dot has the extension '.'" with other names.
it("[happy-1] other bare names ending with a dot have the extension '.'", () => {
  expectExtnames({
    "README.": ".",
    "a.": ".",
    "Z.": ".",
    "1.": ".",
    "my file.": ".",
    "über.": ".",
    "foo.bar.baz.qux.": ".",
    "archive.tar.gz.": ".",
    "-.": ".",
  });
});

// Extends "[happy-1] a name ending with a dot after directories has the extension '.'".
it("[happy-1] deeper paths and dotted directories ending with a dot have the extension '.'", () => {
  expectExtnames({
    "a/b/c/d/e/f.": ".",
    "/usr/local/lib/node.": ".",
    "a.b.c/d.e.f/g.": ".",
    "dir.js/file.": ".",
    "../x.": ".",
    "../../up/file.txt.": ".",
    "a//b.": ".",
    "//server/share/file.": ".",
  });
});

// Shortcut: a lookup of the visible names. A long generated name still gives ".".
it("[happy-1] a long name ending with a dot has the extension '.'", () => {
  expect(extname(`${"a".repeat(5000)}.`)).to.equal(".");
  expect(extname(`${"dir/".repeat(500)}${"b.".repeat(200)}`)).to.equal(".");
});

// Shortcut: searching for the last dot across segments. A dot in a directory
// does not give an extension to a file without one, but the trailing dot does.
it("[happy-1] a trailing dot gives '.' where the same path without it has no extension", () => {
  expectExtnames({
    "a.b/c": "",
    "a.b/c.": ".",
    "a.b./c": "",
    "a.b./c.": ".",
    "dir.d/file": "",
    "dir.d/file.": ".",
  });
});

// Extends "[happy-2] a Windows absolute path ending with a dot has the extension '.'".
it("[happy-2] other Windows absolute paths ending with a dot have the extension '.'", () => {
  expectExtnames({
    [String.raw`D:\projects\app\index.`]: ".",
    [String.raw`c:\temp\myfile.`]: ".",
    [String.raw`C:\a.b\c.d.`]: ".",
    "C:/temp/myfile.": ".",
  });
});

// Extends "[happy-2] Windows rooted and relative paths ending with a dot have the extension '.'".
it("[happy-2] Windows relative and mixed-separator paths ending with a dot have the extension '.'", () => {
  expectExtnames({
    [String.raw`..\myfile.`]: ".",
    [String.raw`a\b\c.`]: ".",
    [String.raw`a/b\c.`]: ".",
    [String.raw`a\b/c.`]: ".",
    [String.raw`\\server\share\file.txt.`]: ".",
    [String.raw`dir.d\file.`]: ".",
  });
});

// Shortcut: only treating "/" as a separator. A backslash before the dot
// is normalised, so "\." and "\.." are a last segment of dots, giving ".".
it("[happy-2] a backslash directly before the trailing dots is normalised", () => {
  expectExtnames({
    [String.raw`a\.`]: ".",
    [String.raw`a\..`]: ".",
    [String.raw`\.`]: ".",
  });
});

// Extends "[happy-3] paths with an ordinary extension keep it": each unchanged
// result is checked next to the same path with a trailing dot added.
it("[happy-3] ordinary extensions are kept while the same path with a trailing dot gives '.'", () => {
  expectExtnames({
    "/temp/myfile.html": ".html",
    "/temp/myfile.html.": ".",
    "a/b/c.json": ".json",
    "a/b/c.json.": ".",
    "x.y.z": ".z",
    "x.y.z.": ".",
    "file.a": ".a",
    "file.a.": ".",
    [String.raw`D:\dir\file.TXT`]: ".TXT",
    [String.raw`D:\dir\file.TXT.`]: ".",
    "a.b.c.d.e.f.g.h": ".h",
    "a.b.c.d.e.f.g.h.": ".",
  });
});

// Extends "[happy-3] dotfiles, leading double dots and extensionless names keep
// their current results". Shortcut: Node's own rule, which gives "" for a
// dotfile after a separator. Rule 3 only excludes a dot that is the first
// character of the whole path.
it("[happy-3] a leading-dot name after a separator keeps its current extension", () => {
  expectExtnames({
    ".bashrc": "",
    "a/.foo": ".foo",
    "/.foo": ".foo",
    [String.raw`a\.foo`]: ".foo",
    "...foo": ".foo",
    "a/..foo": ".foo",
    "noext": "",
    "/a/b/noext": "",
    "a./b": "",
    "a/.foo.": ".",
    "noext.": ".",
  });
});

// Extends "[boundary-1] two trailing dots give a single '.'".
it("[boundary-1] many trailing dots after a name give a single '.'", () => {
  expectExtnames({
    "foo....": ".",
    "foo.........": ".",
    [`foo${".".repeat(100)}`]: ".",
    "a/b/foo..": ".",
    [String.raw`C:\dir\foo..`]: ".",
    "foo.bar..": ".",
  });
});

// Extends "[boundary-1] three trailing dots and leading dots still give a single '.'".
it("[boundary-1] leading and trailing runs of dots around a name give a single '.'", () => {
  expectExtnames({
    "..foo..": ".",
    "...foo...": ".",
    "a/..foo.": ".",
    "..a.b.": ".",
  });
});

// Extends "[boundary-2] a dotfile name ending with a dot has the extension '.'".
it("[boundary-2] other dotfile names ending with a dot have the extension '.'", () => {
  expectExtnames({
    ".a.": ".",
    ".bashrc.": ".",
    ".a.b.": ".",
    "a/.index.": ".",
    "/home/.config.": ".",
    [String.raw`C:\Users\.npmrc.`]: ".",
  });
});

// Extends "[boundary-2] a dotfile name ending with two dots has the extension '.'".
it("[boundary-2] dotfile names ending with three or more dots have the extension '.'", () => {
  expectExtnames({
    ".index...": ".",
    ".x....": ".",
    "dir/.index..": ".",
  });
});

// Extends "[boundary-3] a drive-relative name ending with a dot has the extension '.'".
it("[boundary-3] other drives and drive-relative names ending with dots have the extension '.'", () => {
  expectExtnames({
    "c:.": ".",
    "D:.": ".",
    "z:.": ".",
    "C:...": ".",
    "C:foo.": ".",
    "C:foo.txt.": ".",
    [String.raw`C:dir\file.`]: ".",
  });
});

// Extends "[boundary-4] only the whole inputs '.' and '..' have no extension;
// longer runs of dots give '.'".
it("[boundary-4] longer runs of dots on their own give '.'", () => {
  expectExtnames({
    ".....": ".",
    [".".repeat(50)]: ".",
    ".": "",
    "..": "",
  });
});

// Extends "[boundary-4] a last segment of dots after a separator gives '.'".
// Shortcut: special-casing a last segment of "." or "..", as Node does.
it("[boundary-4] other last segments of dots after a separator give '.'", () => {
  expectExtnames({
    "../..": ".",
    "../../..": ".",
    "./.": ".",
    "a/b/..": ".",
    "a/b/.": ".",
    "//..": ".",
    "C:/.": ".",
    "C:/..": ".",
    [String.raw`C:\.`]: ".",
    [String.raw`.\..`]: ".",
    [String.raw`\..`]: ".",
    "/....": ".",
    "a/...": ".",
  });
});

// Extends "[unhappy-1] a trailing '/' or '\\' after dots or a dotted name
// gives ''": each path is checked next to the same path without the separator.
it("[unhappy-1] a trailing separator gives '' where the path without it gives '.'", () => {
  const dotted = [
    "a/b.",
    "foo..",
    "...",
    ".index.",
    "a/..",
    "/.",
    "C:.",
    String.raw`C:\temp\myfile.`,
  ];
  for (const path of dotted) {
    expect(extname(path), `extname(${JSON.stringify(path)})`).to.equal(".");
    for (const separator of ["/", "\\", "//", "\\\\", "/\\"]) {
      const input = path + separator;
      expect(extname(input), `extname(${JSON.stringify(input)})`).to.equal(
        "",
      );
    }
  }
});

// Extends "[unhappy-1] repeated separators, a backslash or a real extension
// before the separator still give ''". Shortcut: stripping trailing
// separators first, as Node does.
it("[unhappy-1] a trailing separator after a real extension gives '' where the path without it keeps the extension", () => {
  expectExtnames({
    "a/b/file.txt": ".txt",
    "a/b/file.txt/": "",
    [String.raw`a\b\file.txt\\`]: "",
    "file.tar.gz//": "",
    "..foo/": "",
    "x.y.": ".",
    "x.y./": "",
  });
});

// Extends "[unhappy-2] an empty path has no extension".
it("[unhappy-2] an empty path gives '' while a one-character name ending with a dot gives '.'", () => {
  expect(extname("")).to.equal("");
  expect(extname("a.")).to.equal(".");
});
