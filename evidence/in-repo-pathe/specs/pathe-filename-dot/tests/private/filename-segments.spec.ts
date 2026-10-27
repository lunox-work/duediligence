import { expect, it } from "vitest";

import { filename } from "../../src/utils";

function runFilenameCases(
  key: string,
  title: string,
  cases: Record<string, string>,
) {
  for (const path in cases) {
    it(`[${key}] ${title}: ${JSON.stringify(path)}`, () => {
      expect(filename(path)).toBe(cases[path]);
    });
  }
}

// Extends public "[happy-1] last segment without an extension is returned whole":
// parent segments ("..", "x."), other separator orders, UNC roots, doubled
// separators and longer paths, all with a period in an earlier segment.
runFilenameCases(
  "happy-1",
  "extends public happy-1, last segment without an extension is returned whole",
  {
    "../run": "run",
    "..\\run": "run",
    "../../bin/run": "run",
    "x./y": "y",
    "x.\\y": "y",
    "/x.y/z": "z",
    "/a.b/c": "c",
    "a/b.c\\d": "d",
    "a.b\\c.d/e.f\\Makefile": "Makefile",
    "/a.b/c.d/e.f/g": "g",
    "/a//b.c//d": "d",
    "./.hidden.d/run": "run",
    "/home/user.name/.config.d/nvim/init": "init",
    "C:/Program Files (x86)/app.v1.2/bin": "bin",
    "\\\\server.corp\\share\\README": "README",
    "node_modules/@scope/pkg.js/LICENSE": "LICENSE",
    "foo/bar": "bar",
    "/x.y/verylongname_without_any_extension_at_all": "verylongname_without_any_extension_at_all",
  },
);

// Extends public "[happy-1]": many dotted directories before an extensionless name.
it("[happy-1] extends public happy-1, 200 dotted directories with / before an extensionless name", () => {
  const path = Array.from({ length: 200 }, (_, i) => `dir.v${i}`).join("/") + "/file";
  expect(filename(path)).toBe("file");
});

// Extends public "[happy-1]": the same with Windows separators.
it("[happy-1] extends public happy-1, 200 dotted directories with \\ before an extensionless name", () => {
  const path = "C:\\" + Array.from({ length: 200 }, (_, i) => `dir.v${i}`).join("\\") + "\\file";
  expect(filename(path)).toBe("file");
});

// Extends public "[happy-2] last segment with an extension loses only that extension".
runFilenameCases(
  "happy-2",
  "extends public happy-2, last segment with an extension loses only that extension",
  {
    "/x.y/z.js": "z",
    "f.x": "f",
    "../index.d": "index",
    "../../dist/index.mjs": "index",
    "..\\..\\file.min": "file",
    "C:/temp/myfile.html": "myfile",
    "a\\b/c.txt": "c",
    "a/b\\c.txt": "c",
    "/a.b/c.d/e.longextension": "e",
    "\\\\server\\share\\doc.pdf": "doc",
    "x./y.z": "y",
  },
);

// Extends public "[happy-2]": a long path of dotted directories.
it("[happy-2] extends public happy-2, 200 dotted directories before name.ext", () => {
  const path = "/" + Array.from({ length: 200 }, (_, i) => `d.${i}`).join("/") + "/name.ext";
  expect(filename(path)).toBe("name");
});

// Extends public "[happy-3] names with several periods keep everything before the last one".
// An implementation that strips from the first period gets all of these wrong.
runFilenameCases(
  "happy-3",
  "extends public happy-3, several periods keep everything before the last one",
  {
    "foo.bar.baz": "foo.bar",
    "a.b.c": "a.b",
    "/x.y/a.b.c.d.e": "a.b.c.d",
    "C:\\x\\jquery.min.js": "jquery.min",
    "a.b.c/d.e.f": "d.e",
    "../v1.2.3/release.v1.2.3.tar.gz": "release.v1.2.3.tar",
    "x\\y.z/w.v.u": "w.v",
  },
);

// Extends public "[happy-3]": a name with 100 periods.
it("[happy-3] extends public happy-3, a name with 100 periods keeps all but the last extension", () => {
  const stem = Array.from({ length: 100 }, (_, i) => `p${i}`).join(".");
  expect(filename(`/src/${stem}.js`)).toBe(stem);
});

// Extends public "[boundary-1] dotfile with no further period is returned whole".
// Returning "" or undefined for a dotfile, or treating its period as an
// extension separator, fails these.
runFilenameCases(
  "boundary-1",
  "extends public boundary-1, dotfile with no further period is returned whole",
  {
    ".npmrc": ".npmrc",
    ".a": ".a",
    "/x/.a": ".a",
    "\\.env": ".env",
    ".\\.hidden": ".hidden",
    "../.prettierrc": ".prettierrc",
    "C:/x.y/.bashrc": ".bashrc",
    "a.b\\c.d/.editorconfig": ".editorconfig",
    "/x.y/z.w/.gitkeep": ".gitkeep",
  },
);

// Extends public "[boundary-2] dotfile with a further period loses only the final extension".
// Stripping from the first period after the leading one fails the multi-period cases.
runFilenameCases(
  "boundary-2",
  "extends public boundary-2, dotfile with a further period loses only the final extension",
  {
    ".env.local": ".env",
    ".env.production.local": ".env.production",
    ".x.y.z": ".x.y",
    "/a.b/.c.d": ".c",
    "C:\\x\\.eslintrc.cjs": ".eslintrc",
    "../.config.d/.babelrc.js": ".babelrc",
    "a\\b/.c.d.e": ".c.d",
  },
);

// Extends public "[boundary-3] segments made of or ending in periods follow the extname rule".
// "Strip from the last period at index > 0" gets "a..", ".a." and "a.b.." wrong;
// Node's path.parse gets "a..", "foo.bar." and "...." wrong.
runFilenameCases(
  "boundary-3",
  "extends public boundary-3, segments made of or ending in periods follow the extname rule",
  {
    "....": "....",
    "a..": "a..",
    ".a.": ".a.",
    ".foo.": ".foo.",
    "foo.bar.": "foo.bar.",
    "a.b..": "a.b..",
    "...foo": "..",
    "a...b": "a..",
    "..foo.bar": "..foo",
    "x.y/..": "..",
    "C:\\x\\..": "..",
    "\\..": "..",
    "/a.b/.": ".",
    "./.": ".",
    "a\\...": "...",
    "C:\\x.y\\foo.": "foo.",
  },
);

// Extends public "[boundary-5] characters other than separators and the extension are kept exactly".
runFilenameCases(
  "boundary-5",
  "extends public boundary-5, characters other than separators and the extension are kept exactly",
  {
    "/a.b/ my file ": " my file ",
    "/x.y/ ": " ",
    "   ": "   ",
    "\t": "\t",
    "/x.y/\tTab": "\tTab",
    "/x.y/a b\nc": "a b\nc",
    "/tmp/name with spaces.tar .gz": "name with spaces.tar ",
    "C:\\x.y\\MiXeD": "MiXeD",
    "/tmp/UPPER.Ext": "UPPER",
    "c:": "c:",
    "D:": "D:",
    "C:foo.txt": "C:foo",
    "x.y/C:": "C:",
    "/x.y/日本語": "日本語",
    "/tmp/日本語.md": "日本語",
    "/tmp/😀.png": "😀",
    "/a.b/😀": "😀",
    "/a%2Eb/c%2Ed": "c%2Ed",
  },
);
