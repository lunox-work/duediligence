import { expect, it } from "vitest";

import { parse } from "../../src";
import { filename } from "../../src/utils";

const prefixes = [
  "",
  "/",
  "./",
  "../",
  "C:\\",
  "c:/",
  "a.b/",
  "a.b\\",
  "/x.y/z.w\\",
  "\\\\srv.x\\share\\",
];

const lastSegments = [
  "file",
  "file.txt",
  ".gitignore",
  ".env.local",
  "a.b.c",
  "foo.",
  "..",
  ".",
  "...",
  "..foo",
  "a..b",
  "a..",
  ".a.",
  " sp ace .md",
  "C:",
  "日本.md",
];

// Extends public "[boundary-4] filename equals parse(path).name": every
// combination of these prefixes and last segments, which the public list of
// six paths does not cover.
for (const prefix of prefixes) {
  it(`[boundary-4] extends public boundary-4, filename equals parse(path).name after prefix ${JSON.stringify(prefix)}`, () => {
    for (const segment of lastSegments) {
      const path = prefix + segment;
      const result = filename(path);
      expect(typeof result, path).toBe("string");
      expect(result, path).toBe(parse(path).name);
    }
  });
}

// Extends public "[boundary-4]": a long path with periods in every directory.
it("[boundary-4] extends public boundary-4, filename equals parse(path).name for a long dotted path", () => {
  const path = Array.from({ length: 300 }, (_, i) => `v${i}.${i}`).join("\\") + "/run";
  expect(filename(path)).toBe(parse(path).name);
  expect(filename(path)).toBe("run");
});

// Extends public "[unhappy-1] empty path or path ending in a separator gives
// undefined": other trailing separators, parent and dotted directories before
// the trailing separator, and repeated separators of both kinds.
const undefinedPaths = [
  "../",
  "..\\",
  ".../",
  "a./",
  "x.d\\",
  "/x.y/z/",
  "a.b/c.d/",
  "C:/",
  "c:\\",
  "\\\\",
  "//",
  "/\\",
  "\\/",
  "foo/bar\\",
  "foo\\bar/",
  ".gitignore/",
  "/temp/.env.local/",
  "file.txt\\",
  "//server.x/share/",
  " /",
];

for (const path of undefinedPaths) {
  it(`[unhappy-1] extends public unhappy-1, path ending in a separator gives undefined: ${JSON.stringify(path)}`, () => {
    expect(filename(path)).toBeUndefined();
  });
}

// Extends public "[unhappy-1]": long runs of separators.
it("[unhappy-1] extends public unhappy-1, 1000 separators give undefined", () => {
  expect(filename("/".repeat(1000))).toBeUndefined();
  expect(filename("\\".repeat(1000))).toBeUndefined();
  expect(filename("/\\".repeat(500))).toBeUndefined();
});

// Extends public "[unhappy-1]": a long dotted path ending in a separator.
it("[unhappy-1] extends public unhappy-1, 100 dotted directories ending in a separator give undefined", () => {
  expect(filename("a.b/".repeat(100))).toBeUndefined();
  expect(filename("C:\\" + "x.y\\".repeat(100))).toBeUndefined();
});

// Extends public "[boundary-6] repeated and interleaved calls return the same
// results": more paths, including undefined results, in several orders. A
// global-flag regex that keeps lastIndex, or any cached state, breaks this.
it("[boundary-6] extends public boundary-6, many interleaved calls in several orders", () => {
  const expected: Record<string, string | undefined> = {
    "/a.b/c/d/e/f/g/h/i/longname": "longname",
    x: "x",
    "": undefined,
    "a.b/": undefined,
    "../run": "run",
    ".env.local": ".env",
    "C:\\dir.v2\\file": "file",
    "..foo": ".",
    "foo.": "foo.",
    "archive.tar.gz": "archive.tar",
  };
  const paths = Object.keys(expected);
  const orders = [paths, [...paths].reverse(), [...paths, ...paths, ...paths]];
  for (const order of orders) {
    for (const path of order) {
      expect(filename(path), JSON.stringify(path)).toBe(expected[path]);
    }
  }
});

// Extends public "[boundary-6]": a long path, then a much shorter one, then the
// long one again.
it("[boundary-6] extends public boundary-6, a short path after a long one", () => {
  const long = "/" + "dir.v1/".repeat(50) + "myFile";
  const results = [
    filename(long),
    filename("a"),
    filename("x.y/z"),
    filename(long),
    filename("a"),
  ];
  expect(results).toEqual(["myFile", "a", "z", "myFile", "a"]);
});
