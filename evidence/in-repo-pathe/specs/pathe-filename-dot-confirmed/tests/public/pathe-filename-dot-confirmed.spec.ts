import { expect, it } from "vitest";

import { parse } from "../src";
import { filename } from "../src/utils";

it("[happy-1] last segment without extension is returned whole when a directory has a period", () => {
  expect(filename("/Users/john.doe/foo/myFile")).toBe("myFile");
  expect(filename("C:\\Users\\john.doe\\foo\\myFile")).toBe("myFile");
  expect(filename("./v1.2/bin/run")).toBe("run");
  expect(filename("a.b/c.d/e")).toBe("e");
  expect(filename("myfile")).toBe("myfile");
});

it("[happy-1] mixed separators and dotted directories do not affect an extensionless segment", () => {
  expect(filename("C:\\dir.v2/file")).toBe("file");
  expect(filename("./.hidden/myFile")).toBe("myFile");
});

it("[happy-2] last segment with an extension loses only that extension", () => {
  expect(filename("test.html")).toBe("test");
  expect(filename("/temp/myfile.html")).toBe("myfile");
  expect(filename("./myfile.html")).toBe("myfile");
  expect(filename("C:\\temp\\myfile.html")).toBe("myfile");
  expect(filename("\\temp\\myfile.html")).toBe("myfile");
  expect(filename(".\\myfile.html")).toBe("myfile");
  expect(filename("/Users/john.doe/foo/myFile.js")).toBe("myFile");
  expect(filename("C:\\Users\\john.doe\\foo\\myFile.js")).toBe("myFile");
});

it("[happy-2] extension is stripped when every earlier segment also has a period", () => {
  expect(filename("./.hidden/myFile.ts")).toBe("myFile");
  expect(filename(".\\.hidden\\myFile.ts")).toBe("myFile");
  expect(filename("a.b/c.d/e.f")).toBe("e");
});

it("[happy-3] names with several periods keep everything before the last one", () => {
  expect(filename("./foo.bar.baz.js")).toBe("foo.bar.baz");
  expect(filename(".\\foo.bar.baz.js")).toBe("foo.bar.baz");
  expect(filename("/src/app.config.ts")).toBe("app.config");
});

it("[happy-3] bare name with two periods keeps the first one", () => {
  expect(filename("archive.tar.gz")).toBe("archive.tar");
});

it("[boundary-1] dotfile with no further period is returned whole", () => {
  expect(filename("/temp/.gitignore")).toBe(".gitignore");
  expect(filename("foo\\.gitignore")).toBe(".gitignore");
  expect(filename("/Users/john.doe/.config")).toBe(".config");
  expect(filename("C:\\Users\\john.doe\\.npmrc")).toBe(".npmrc");
  expect(filename("./.hidden")).toBe(".hidden");
});

it("[boundary-1] bare dotfile with no directory is returned whole", () => {
  expect(filename(".gitignore")).toBe(".gitignore");
});

it("[boundary-2] dotfile with a further period loses only the final extension", () => {
  expect(filename("/temp/.env.local")).toBe(".env");
  expect(filename("./.eslintrc.json")).toBe(".eslintrc");
});

it("[boundary-2] shortest dotfile with a further period keeps its leading period", () => {
  expect(filename(".a.b")).toBe(".a");
});

it("[boundary-3] segments ending in a period lose that trailing period", () => {
  expect(filename("foo.")).toBe("foo");
  expect(filename("/a/foo.")).toBe("foo");
  expect(filename("a.b.")).toBe("a.b");
  expect(filename("a..b")).toBe("a.");
});

it("[boundary-3] segments made of periods keep the leading period", () => {
  expect(filename(".")).toBe(".");
  expect(filename("..")).toBe(".");
  expect(filename("...")).toBe("..");
  expect(filename("foo/..")).toBe(".");
  expect(filename("..foo")).toBe(".");
});

it("[boundary-4] filename equals parse(path).name for ordinary paths", () => {
  for (const path of [
    "/Users/john.doe/foo/myFile",
    "/temp/.env.local",
    "./foo.bar.baz.js",
  ]) {
    expect(filename(path)).toBe(parse(path).name);
  }
});

it("[boundary-4] filename equals parse(path).name for segments with consecutive periods", () => {
  for (const path of ["..foo", "a..b"]) {
    expect(filename(path)).toBe(parse(path).name);
  }
});

it("[unhappy-1] path ending in a separator gives undefined", () => {
  expect(filename("/")).toBeUndefined();
  expect(filename("\\")).toBeUndefined();
  expect(filename("./")).toBeUndefined();
  expect(filename("C:\\temp\\")).toBeUndefined();
  expect(filename("C:\\")).toBeUndefined();
  expect(filename("/foo/bar/")).toBeUndefined();
  expect(filename("foo.d/")).toBeUndefined();
});

it("[unhappy-1] empty path and repeated trailing separators give undefined", () => {
  expect(filename("")).toBeUndefined();
  expect(filename("/foo/bar//")).toBeUndefined();
});

it("[boundary-5] characters other than separators and the extension are kept exactly", () => {
  expect(filename("/tmp/ my file .txt")).toBe(" my file ");
  expect(filename("/tmp/MyFile.TXT")).toBe("MyFile");
  expect(filename("c:\\temp\\Report.pdf")).toBe("Report");
  expect(filename("/tmp/résumé.doc")).toBe("résumé");
});

it("[boundary-5] a lone space and a bare drive are returned as written", () => {
  expect(filename(" ")).toBe(" ");
  expect(filename("C:")).toBe("C:");
});

it("[boundary-6] repeated and interleaved calls return the same results", () => {
  const results = [
    filename("/Users/john.doe/foo/myFile"),
    filename("/Users/john.doe/foo/myFile"),
    filename("/temp/.env.local"),
    filename("/Users/john.doe/foo/myFile"),
  ];
  expect(results).toEqual(["myFile", "myFile", ".env", "myFile"]);
});

it("[boundary-6] a call after an undefined result is unaffected", () => {
  expect(filename("/foo/bar/")).toBeUndefined();
  expect(filename("/Users/john.doe/foo/myFile")).toBe("myFile");
  expect(filename("/foo/bar/")).toBeUndefined();
});
