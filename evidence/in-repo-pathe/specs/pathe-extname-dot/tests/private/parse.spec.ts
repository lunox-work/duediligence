import { expect, it } from "vitest";

import { extname, parse } from "../../src/_path";
import { posix, win32 } from "../../src";

// [happy-4] extends public [happy-4]: other bases ending with dots, in
// other directories and with other roots
for (const [path, expected] of [
  ["a.b.c.", { root: "", dir: ".", base: "a.b.c.", ext: ".", name: "a.b.c" }],
  [".index.", { root: "", dir: ".", base: ".index.", ext: ".", name: ".index" }],
  ["....", { root: "", dir: ".", base: "....", ext: ".", name: "..." }],
  ["/...", { root: "/", dir: "/", base: "...", ext: ".", name: ".." }],
  ["dir/foo...", { root: "", dir: "dir", base: "foo...", ext: ".", name: "foo.." }],
  [
    "/home/user/.bashrc.",
    { root: "/", dir: "/home/user", base: ".bashrc.", ext: ".", name: ".bashrc" },
  ],
  [
    String.raw`C:\dir\file.txt.`,
    { root: "C:/", dir: "C:/dir", base: "file.txt.", ext: ".", name: "file.txt" },
  ],
  [
    String.raw`\temp\myfile.`,
    { root: "/", dir: "/temp", base: "myfile.", ext: ".", name: "myfile" },
  ],
  [
    String.raw`a\b\index.html.`,
    { root: "", dir: "a/b", base: "index.html.", ext: ".", name: "index.html" },
  ],
  ["C:.", { root: "", dir: ".", base: "C:.", ext: ".", name: "C:" }],
] as const) {
  it(`[happy-4] hidden parse(${JSON.stringify(path)})`, () => {
    expect(parse(path)).to.deep.equal(expected);
  });
}

// [happy-4] extends public [happy-4]: parse takes ext from extname of base,
// and base drops the trailing separator, so "index./" has ext "." in parse
// even though extname("index./") is ""
it(`[happy-4] hidden parse("index./") takes ext from extname of its base`, () => {
  expect(parse("index./")).to.deep.equal({
    root: "",
    dir: ".",
    base: "index.",
    ext: ".",
    name: "index",
  });
});

// [happy-4] extends public [happy-4]: "." and ".." give no ext, while a run
// of three or more dots gives "." in the same call sequence
it(`[happy-4] hidden parse of "." and "a/.." keep name, "a/...." gives ext "."`, () => {
  expect(parse(".")).to.deep.equal({
    root: "",
    dir: ".",
    base: ".",
    ext: "",
    name: ".",
  });
  expect(parse("a/..")).to.deep.equal({
    root: "",
    dir: "a",
    base: "..",
    ext: "",
    name: "..",
  });
  expect(parse("a/....")).to.deep.equal({
    root: "",
    dir: "a",
    base: "....",
    ext: ".",
    name: "...",
  });
});

// [happy-4] extends public [happy-4]: ext always equals extname(base) and
// name + ext always equals base, across many inputs ending with dots
it(`[happy-4] hidden parse ext matches extname(base) and name + ext is base`, () => {
  const cases = [
    ["x.", "x"],
    ["foo..", "foo."],
    [`${"n".repeat(300)}.`, "n".repeat(300)],
    ["a/b/c/d.e.f.", "d.e.f"],
    [".a.", ".a"],
    ["...foo.", "...foo"],
  ] as const;
  for (const [path, name] of cases) {
    const parsed = parse(path);
    expect(parsed.ext).to.equal(".");
    expect(parsed.ext).to.equal(extname(parsed.base));
    expect(parsed.name).to.equal(name);
    expect(parsed.name + parsed.ext).to.equal(parsed.base);
  }
});

// [happy-4] extends public [happy-4]: posix.parse and win32.parse delegate to
// the same parse
for (const [ns, nsParse] of [
  ["posix", posix.parse],
  ["win32", win32.parse],
] as const) {
  it(`[happy-4] hidden ${ns}.parse on paths ending with a dot`, () => {
    expect(nsParse("index.")).to.deep.equal({
      root: "",
      dir: ".",
      base: "index.",
      ext: ".",
      name: "index",
    });
    expect(nsParse(String.raw`C:\temp\myfile.`)).to.deep.equal({
      root: "C:/",
      dir: "C:/temp",
      base: "myfile.",
      ext: ".",
      name: "myfile",
    });
    expect(nsParse("...")).to.deep.equal({
      root: "",
      dir: ".",
      base: "...",
      ext: ".",
      name: "..",
    });
  });
}

// [unhappy-2] extends public [unhappy-2]: parse of the empty path has an
// empty ext and name, and a later trailing-dot call is unaffected
it(`[unhappy-2] hidden parse("") has empty ext and name`, () => {
  expect(parse("")).to.deep.equal({
    root: "",
    dir: ".",
    base: "",
    ext: "",
    name: "",
  });
});
