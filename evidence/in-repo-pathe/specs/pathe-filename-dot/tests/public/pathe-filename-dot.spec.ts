import { expect, it } from "vitest";

import { parse } from "../src";
import { filename } from "../src/utils";

function runFilenameCases(
  key: string,
  title: string,
  cases: Record<string, string | undefined>,
) {
  for (const path in cases) {
    it(`[${key}] ${title}: ${JSON.stringify(path)}`, () => {
      expect(filename(path)).toBe(cases[path]);
    });
  }
}

runFilenameCases(
  "happy-1",
  "last segment without an extension is returned whole",
  {
    "/Users/john.doe/foo/myFile": "myFile",
    "C:\\Users\\john.doe\\foo\\myFile": "myFile",
    "./v1.2/bin/run": "run",
    "a.b/c.d/e": "e",
    "C:\\dir.v2/file": "file",
    "./.hidden/myFile": "myFile",
    myfile: "myfile",
  },
);

runFilenameCases(
  "happy-2",
  "last segment with an extension loses only that extension",
  {
    "test.html": "test",
    "/temp/myfile.html": "myfile",
    "./myfile.html": "myfile",
    "C:\\temp\\myfile.html": "myfile",
    "\\temp\\myfile.html": "myfile",
    ".\\myfile.html": "myfile",
    "/Users/john.doe/foo/myFile.js": "myFile",
    "C:\\Users\\john.doe\\foo\\myFile.js": "myFile",
    "./.hidden/myFile.ts": "myFile",
    ".\\.hidden\\myFile.ts": "myFile",
    "a.b/c.d/e.f": "e",
  },
);

runFilenameCases(
  "happy-3",
  "names with several periods keep everything before the last one",
  {
    "./foo.bar.baz.js": "foo.bar.baz",
    ".\\foo.bar.baz.js": "foo.bar.baz",
    "/src/app.config.ts": "app.config",
    "archive.tar.gz": "archive.tar",
  },
);

runFilenameCases(
  "boundary-1",
  "dotfile with no further period is returned whole",
  {
    ".gitignore": ".gitignore",
    "/temp/.gitignore": ".gitignore",
    "foo\\.gitignore": ".gitignore",
    "/Users/john.doe/.config": ".config",
    "C:\\Users\\john.doe\\.npmrc": ".npmrc",
    "./.hidden": ".hidden",
  },
);

runFilenameCases(
  "boundary-2",
  "dotfile with a further period loses only the final extension",
  {
    "/temp/.env.local": ".env",
    ".a.b": ".a",
    "./.eslintrc.json": ".eslintrc",
  },
);

runFilenameCases(
  "boundary-3",
  "segments made of or ending in periods follow the extname rule",
  {
    "foo.": "foo.",
    "/a/foo.": "foo.",
    ".": ".",
    "..": "..",
    "...": "...",
    "foo/..": "..",
    "..foo": ".",
    "a..b": "a.",
  },
);

for (const path of [
  "/Users/john.doe/foo/myFile",
  "/temp/.env.local",
  "./foo.bar.baz.js",
  "..foo",
  "a..b",
  "foo.",
]) {
  it(`[boundary-4] filename equals parse(path).name: ${JSON.stringify(path)}`, () => {
    expect(filename(path)).toBe(parse(path).name);
  });
}

runFilenameCases(
  "unhappy-1",
  "empty path or path ending in a separator gives undefined",
  {
    "": undefined,
    "/": undefined,
    "\\": undefined,
    "./": undefined,
    "C:\\temp\\": undefined,
    "C:\\": undefined,
    "/foo/bar/": undefined,
    "/foo/bar//": undefined,
    "foo.d/": undefined,
  },
);

runFilenameCases(
  "boundary-5",
  "characters other than separators and the extension are kept exactly",
  {
    " ": " ",
    "/tmp/ my file .txt": " my file ",
    "/tmp/MyFile.TXT": "MyFile",
    "c:\\temp\\Report.pdf": "Report",
    "C:": "C:",
    "/tmp/résumé.doc": "résumé",
  },
);

it("[boundary-6] repeated and interleaved calls return the same results", () => {
  const results = [
    filename("/Users/john.doe/foo/myFile"),
    filename("/Users/john.doe/foo/myFile"),
    filename("/temp/.env.local"),
    filename("/Users/john.doe/foo/myFile"),
  ];
  expect(results).toEqual(["myFile", "myFile", ".env", "myFile"]);
});
