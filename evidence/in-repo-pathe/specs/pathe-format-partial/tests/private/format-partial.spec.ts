import { expect, it } from "vitest";

import { format } from "../../src/_path";
import pathe, { posix, win32 } from "../../src";

// Rule: Missing name or ext contribute an empty string, never "undefined"

// extends '[happy-1] format({ name: "file" }) should be "file"'
it('[happy-1] format({ name: "README" }) has no "undefined" suffix', () => {
  const result = format({ name: "README" });
  expect(result).to.equal("README");
  expect(result).not.to.contain("undefined");
});

// extends '[happy-1] format({ ext: ".txt" }) should be ".txt"'
it('[happy-1] format({ ext: ".json" }) should be ".json"', () => {
  expect(format({ ext: ".json" })).to.equal(".json");
});

// extends '[happy-1] format({ name: "file", ext: ".txt" }) should be "file.txt"'
it('[happy-1] format({ dir: "a/b", name: "index", ext: ".d.ts" }) should be "a/b/index.d.ts"', () => {
  expect(format({ dir: "a/b", name: "index", ext: ".d.ts" })).to.equal(
    "a/b/index.d.ts",
  );
});

// extends '[happy-1] format({ name: "file", ext: "" }) should be "file"'
it('[happy-1] format({ dir: "/srv", name: "app", ext: "" }) should be "/srv/app"', () => {
  expect(format({ dir: "/srv", name: "app", ext: "" })).to.equal("/srv/app");
});

// extends '[happy-1] format({ dir: "/home", name: "file" }) should be "/home/file"'
it('[happy-1] format({ dir: "/a/b/c/d/e", name: "deep" }) should be "/a/b/c/d/e/deep"', () => {
  expect(format({ dir: "/a/b/c/d/e", name: "deep" })).to.equal(
    "/a/b/c/d/e/deep",
  );
});

// extends '[happy-1] format({ dir: "/home", name: "file" }) should be "/home/file"'
// without root the segments are joined with "/" and nothing else is normalised
it('[happy-1] format({ dir: "a/../b", name: "c" }) keeps the dir unnormalised', () => {
  expect(format({ dir: "a/../b", name: "c" })).to.equal("a/../b/c");
});

// extends '[happy-1] format({ dir: "/home", name: "file" }) should be "/home/file"'
it('[happy-1] format({ dir: "/home/", name: "file" }) joins with "/" without collapsing', () => {
  expect(format({ dir: "/home/", name: "file" })).to.equal("/home//file");
});

// extends '[happy-1] format({ dir: "/home", ext: ".txt" }) should be "/home/.txt"'
it('[happy-1] format({ dir: "/var/log", ext: ".log" }) should be "/var/log/.log"', () => {
  expect(format({ dir: "/var/log", ext: ".log" })).to.equal("/var/log/.log");
});

// extends '[happy-1] format({ dir: "a", ext: ".txt" }) should be "a/.txt"'
it('[happy-1] format({ dir: "x/y/z", ext: ".md" }) should be "x/y/z/.md"', () => {
  expect(format({ dir: "x/y/z", ext: ".md" })).to.equal("x/y/z/.md");
});

// extends '[happy-1] format({ root: "/", name: "file" }) should be "/file"'
// root is resolved together with the file part, not concatenated to it
it('[happy-1] format({ root: "/srv", name: "file" }) should be "/srv/file"', () => {
  expect(format({ root: "/srv", name: "file" })).to.equal("/srv/file");
});

// extends '[happy-1] format({ root: "/", ext: ".txt" }) should be "/.txt"'
it('[happy-1] format({ root: "/", dir: "/a", ext: ".txt" }) should be "/a/.txt"', () => {
  expect(format({ root: "/", dir: "/a", ext: ".txt" })).to.equal("/a/.txt");
});

// extends '[boundary-1] format({}) should be the empty string'
it("[boundary-1] format({}) through posix, win32 and the default export is the empty string", () => {
  expect(posix.format({})).to.equal("");
  expect(win32.format({})).to.equal("");
  expect(pathe.format({})).to.equal("");
});

// extends '[boundary-2] format with fields explicitly undefined treats them as missing'
it('[boundary-2] explicit undefined name with ext "txt" gives ".txt"', () => {
  expect(
    format({
      root: undefined,
      dir: undefined,
      base: undefined,
      name: undefined,
      ext: "txt",
    }),
  ).to.equal(".txt");
});

// extends '[boundary-2] format with fields explicitly undefined treats them as missing'
it("[boundary-2] explicit undefined base and ext with a dir gives dir/name", () => {
  expect(
    format({ dir: "/x", base: undefined, name: "f", ext: undefined }),
  ).to.equal("/x/f");
});

// extends '[boundary-2] format with fields explicitly undefined treats them as missing'
it("[boundary-2] every field explicitly undefined gives the empty string", () => {
  expect(
    format({
      root: undefined,
      dir: undefined,
      base: undefined,
      name: undefined,
      ext: undefined,
    }),
  ).to.equal("");
});

// extends '[boundary-3] format with every field null should be the empty string'
// a null base must fall through to name + ext, not be treated as given
it('[boundary-3] null base falls back to name and ext: "file.txt"', () => {
  expect(format({ base: null, name: "file", ext: "txt" } as any)).to.equal(
    "file.txt",
  );
});

// extends '[boundary-3] format with every field null should be the empty string'
it('[boundary-3] null ext with a name gives just the name, never "null"', () => {
  const result = format({ name: "file", ext: null } as any);
  expect(result).to.equal("file");
  expect(result).not.to.contain("null");
});

// extends '[boundary-3] format with every field null should be the empty string'
it('[boundary-3] null name with ext ".txt" gives ".txt"', () => {
  expect(format({ name: null, ext: ".txt" } as any)).to.equal(".txt");
});

// extends '[boundary-3] format with every field null should be the empty string'
it('[boundary-3] null root and dir with name and ext gives "a.b"', () => {
  expect(
    format({ root: null, dir: null, base: null, name: "a", ext: "b" } as any),
  ).to.equal("a.b");
});

// extends '[boundary-3] format with every field null should be the empty string'
it('[boundary-3] null root with a dir is joined, not resolved: "rel/f"', () => {
  expect(
    format({ root: null, dir: "rel", base: null, name: "f", ext: null } as any),
  ).to.equal("rel/f");
});

// Rule: ext without a leading dot gets one; ext with a leading dot is used as given

// extends '[happy-2] format({ name: "file", ext: "txt" }) should be "file.txt"'
it('[happy-2] format({ name: "photo", ext: "jpeg" }) should be "photo.jpeg"', () => {
  expect(format({ name: "photo", ext: "jpeg" })).to.equal("photo.jpeg");
});

// extends '[happy-2] format({ ext: "txt" }) should be ".txt"'
it('[happy-2] format({ ext: "c" }) should be ".c"', () => {
  expect(format({ ext: "c" })).to.equal(".c");
});

// extends '[happy-2] format({ name: "file", ext: "tar.gz" }) should be "file.tar.gz"'
// a dot elsewhere than at the start does not count as a leading dot
it('[happy-2] format({ name: "file", ext: "txt." }) should be "file.txt."', () => {
  expect(format({ name: "file", ext: "txt." })).to.equal("file.txt.");
});

// extends '[happy-2] format({ name: "file", ext: "tar.gz" }) should be "file.tar.gz"'
it('[happy-2] format({ name: "archive.tar", ext: "gz" }) should be "archive.tar.gz"', () => {
  expect(format({ name: "archive.tar", ext: "gz" })).to.equal(
    "archive.tar.gz",
  );
});

// extends '[happy-2] format({ name: "file", ext: "tar.gz" }) should be "file.tar.gz"'
it('[happy-2] format({ name: "bundle", ext: "min.js.map" }) should be "bundle.min.js.map"', () => {
  expect(format({ name: "bundle", ext: "min.js.map" })).to.equal(
    "bundle.min.js.map",
  );
});

// extends '[happy-2] format({ root: "/", name: "file", ext: "txt" }) should be "/file.txt"'
it('[happy-2] format({ root: "/", dir: "/etc", name: "hosts", ext: "bak" }) should be "/etc/hosts.bak"', () => {
  expect(
    format({ root: "/", dir: "/etc", name: "hosts", ext: "bak" }),
  ).to.equal("/etc/hosts.bak");
});

// extends '[happy-2] format({ dir: "/home", ext: "txt" }) should be "/home/.txt"'
it('[happy-2] format({ dir: "a/b", ext: "md" }) should be "a/b/.md"', () => {
  expect(format({ dir: "a/b", ext: "md" })).to.equal("a/b/.md");
});

// extends '[happy-2] format({ dir: "/home", ext: "txt" }) should be "/home/.txt"'
it('[happy-2] format({ dir: "/home", name: "notes", ext: "md" }) should be "/home/notes.md"', () => {
  expect(format({ dir: "/home", name: "notes", ext: "md" })).to.equal(
    "/home/notes.md",
  );
});

// extends '[boundary-4] format({ name: "file", ext: "." }) should be "file."'
it('[boundary-4] format({ ext: "." }) should be "."', () => {
  expect(format({ ext: "." })).to.equal(".");
});

// extends '[boundary-4] format({ name: "file", ext: "." }) should be "file."'
it('[boundary-4] format({ dir: "/a", name: "f", ext: "." }) should be "/a/f."', () => {
  expect(format({ dir: "/a", name: "f", ext: "." })).to.equal("/a/f.");
});

// extends '[boundary-4] format({ name: "file", ext: "..txt" }) should be "file..txt"'
it('[boundary-4] format({ name: "file", ext: "..." }) should be "file..."', () => {
  expect(format({ name: "file", ext: "..." })).to.equal("file...");
});

// extends '[boundary-4] format({ name: "file", ext: "..txt" }) should be "file..txt"'
it('[boundary-4] format({ ext: "..txt" }) should be "..txt"', () => {
  expect(format({ ext: "..txt" })).to.equal("..txt");
});

// extends '[boundary-4] format({ name: "file", ext: "..txt" }) should be "file..txt"'
it('[boundary-4] format({ root: "/", name: "file", ext: ".." }) should be "/file.."', () => {
  expect(format({ root: "/", name: "file", ext: ".." })).to.equal("/file..");
});

// extends '[boundary-5] format({ name: ".env" }) should be ".env"'
it('[boundary-5] format({ name: ".env", ext: "" }) should be ".env"', () => {
  expect(format({ name: ".env", ext: "" })).to.equal(".env");
});

// extends '[boundary-5] format({ name: ".env" }) should be ".env"'
it('[boundary-5] format({ dir: "/app", name: ".gitignore" }) should be "/app/.gitignore"', () => {
  expect(format({ dir: "/app", name: ".gitignore" })).to.equal(
    "/app/.gitignore",
  );
});

// extends '[boundary-5] format({ name: ".env" }) should be ".env"'
it('[boundary-5] format({ root: "/", name: ".bashrc" }) should be "/.bashrc"', () => {
  expect(format({ root: "/", name: ".bashrc" })).to.equal("/.bashrc");
});

// extends '[boundary-5] format({ name: ".env" }) should be ".env"'
it('[boundary-5] format({ name: "..env" }) should be "..env"', () => {
  expect(format({ name: "..env" })).to.equal("..env");
});

// Rule: base, when given, wins over name and ext

// extends '[happy-3] format({ name: "file", base: "file.txt" }) should be "file.txt"'
it('[happy-3] base wins over both name and ext: "real.js"', () => {
  expect(format({ base: "real.js", name: "fake", ext: "ts" })).to.equal(
    "real.js",
  );
});

// extends '[happy-3] format({ base: "file.md", ext: "txt" }) should be "file.md"'
// base is used as given, no dot is added to it
it('[happy-3] format({ base: "Makefile", ext: "txt" }) should be "Makefile"', () => {
  expect(format({ base: "Makefile", ext: "txt" })).to.equal("Makefile");
});

// extends '[happy-3] format({ root: "/", base: "file.txt", ext: "ignored" }) should be "/file.txt"'
it('[happy-3] format({ dir: "/home/u", base: "a.txt", name: "b", ext: "md" }) should be "/home/u/a.txt"', () => {
  expect(
    format({ dir: "/home/u", base: "a.txt", name: "b", ext: "md" }),
  ).to.equal("/home/u/a.txt");
});

// extends '[happy-3] format({ root: "/", base: "file.txt", ext: "ignored" }) should be "/file.txt"'
it('[happy-3] format({ root: "/", dir: "/x", base: "y.z", name: "n", ext: ".e" }) should be "/x/y.z"', () => {
  expect(
    format({ root: "/", dir: "/x", base: "y.z", name: "n", ext: ".e" }),
  ).to.equal("/x/y.z");
});

// extends '[boundary-6] format({ base: "", name: "file", ext: ".txt" }) should be the empty string'
it('[boundary-6] an empty base with a dir leaves only the dir: "/home"', () => {
  expect(
    format({ dir: "/home", base: "", name: "file", ext: "txt" }),
  ).to.equal("/home");
});

// extends '[boundary-6] format({ base: "", name: "file", ext: ".txt" }) should be the empty string'
it('[boundary-6] an empty base with ext only gives the empty string', () => {
  expect(format({ base: "", ext: "txt" })).to.equal("");
});

// extends '[boundary-6] format({ base: "", name: "file", ext: ".txt" }) should be the empty string'
it('[boundary-6] an empty base with root "/" gives "/"', () => {
  expect(format({ root: "/", base: "", name: "file", ext: ".txt" })).to.equal(
    "/",
  );
});

// Rule: dir without a file part is returned without an added separator

// extends '[boundary-7] format({ dir: "/home/user" }) should be "/home/user"'
it('[boundary-7] format({ dir: "/a/b/c/d" }) should be "/a/b/c/d"', () => {
  expect(format({ dir: "/a/b/c/d" })).to.equal("/a/b/c/d");
});

// extends '[boundary-7] format({ dir: "home" }) should be "home"'
it('[boundary-7] format({ dir: "a/b" }) should be "a/b"', () => {
  expect(format({ dir: "a/b" })).to.equal("a/b");
});

// extends '[boundary-7] format({ dir: "/home/user/" }) should be "/home/user/"'
it('[boundary-7] format({ dir: "rel/dir/" }) keeps its trailing "/"', () => {
  expect(format({ dir: "rel/dir/" })).to.equal("rel/dir/");
});

// extends '[boundary-7] format({ dir: "/home/user/" }) should be "/home/user/"'
it('[boundary-7] format({ dir: "/" }) should be "/"', () => {
  expect(format({ dir: "/" })).to.equal("/");
});

// extends '[boundary-7] format({ dir: "/home/user/" }) should be "/home/user/"'
it('[boundary-7] format({ dir: "/home/user", name: "", ext: "" }) adds no separator', () => {
  expect(format({ dir: "/home/user", name: "", ext: "" })).to.equal(
    "/home/user",
  );
});

// extends '[boundary-7] format({ root: "/" }) should be "/"'
it('[boundary-7] format({ root: "/srv" }) should be "/srv"', () => {
  expect(format({ root: "/srv" })).to.equal("/srv");
});

// extends '[boundary-7] format({ root: "/", dir: "/" }) should be "/"'
it('[boundary-7] format({ root: "/", dir: "/home/user" }) should be "/home/user"', () => {
  expect(format({ root: "/", dir: "/home/user" })).to.equal("/home/user");
});

// Rule: Existing root, dir and Windows handling is unchanged

// extends '[happy-4] format({ root: "/ignored", dir: "/home/user/dir", base: "file.txt" }) should be "/home/user/dir/file.txt"'
it('[happy-4] format({ root: "/ignored", dir: "/a/b", name: "c", ext: "d" }) should be "/a/b/c.d"', () => {
  expect(format({ root: "/ignored", dir: "/a/b", name: "c", ext: "d" })).to.equal(
    "/a/b/c.d",
  );
});

// extends '[happy-4] format({ root: "/", dir: "/a/b", name: "f" }) should be "/a/b/f"'
// with a root the segments go through resolve, which normalises them
it('[happy-4] format({ root: "/", dir: "/a/../b", name: "f" }) should be "/b/f"', () => {
  expect(format({ root: "/", dir: "/a/../b", name: "f" })).to.equal("/b/f");
});

// extends '[happy-4] format({ root: "/", dir: "/a/b", name: "f" }) should be "/a/b/f"'
it('[happy-4] format({ root: "/", dir: "rel", name: "f" }) resolves dir against root: "/rel/f"', () => {
  expect(format({ root: "/", dir: "rel", name: "f" })).to.equal("/rel/f");
});

// extends '[happy-4] format({ root: "/", name: "file", ext: ".txt" }) should be "/file.txt"'
it('[happy-4] format({ root: "/opt", name: "tool", ext: ".sh" }) should be "/opt/tool.sh"', () => {
  expect(format({ root: "/opt", name: "tool", ext: ".sh" })).to.equal(
    "/opt/tool.sh",
  );
});

// extends '[happy-4] format({ dir: "C:\\\\path\\\\dir", base: "file.txt" }) should be "C:/path/dir/file.txt"'
it('[happy-4] format({ dir: "c:\\\\x\\\\y", name: "z", ext: "txt" }) upper-cases the drive: "C:/x/y/z.txt"', () => {
  expect(format({ dir: String.raw`c:\x\y`, name: "z", ext: "txt" })).to.equal(
    "C:/x/y/z.txt",
  );
});

// extends '[happy-4] format({ dir: "C:\\\\a", name: "file" }) should be "C:/a/file"'
it('[happy-4] format({ dir: "D:\\\\one\\\\two\\\\three", name: "f" }) should be "D:/one/two/three/f"', () => {
  expect(format({ dir: String.raw`D:\one\two\three`, name: "f" })).to.equal(
    "D:/one/two/three/f",
  );
});

// extends '[happy-4] format({ dir: "C:\\\\a\\\\b", ext: "txt" }) should be "C:/a/b/.txt"'
it('[happy-4] format({ dir: "C:\\\\a\\\\b", ext: ".log" }) should be "C:/a/b/.log"', () => {
  expect(format({ dir: String.raw`C:\a\b`, ext: ".log" })).to.equal(
    "C:/a/b/.log",
  );
});

// extends '[happy-4] format({ dir: "C:\\\\a\\\\b", ext: "txt" }) should be "C:/a/b/.txt"'
it('[happy-4] format({ name: "a\\\\b", ext: "txt" }) turns backslashes into "/": "a/b.txt"', () => {
  expect(format({ name: String.raw`a\b`, ext: "txt" })).to.equal("a/b.txt");
});

// extends '[happy-4] format({ root: "C:\\\\", name: "file", ext: "txt" }) should be "C:/file.txt"'
it('[happy-4] format({ root: "C:\\\\", dir: "C:\\\\data", name: "f", ext: "csv" }) should be "C:/data/f.csv"', () => {
  expect(
    format({ root: "C:\\", dir: String.raw`C:\data`, name: "f", ext: "csv" }),
  ).to.equal("C:/data/f.csv");
});

// extends '[happy-4] format({ root: "C:\\\\", name: "file", ext: "txt" }) should be "C:/file.txt"'
it('[happy-4] format({ root: "C:\\\\", ext: "ini" }) should be "C:/.ini"', () => {
  expect(format({ root: "C:\\", ext: "ini" })).to.equal("C:/.ini");
});

// extends '[happy-5] posix.format and win32.format both give "file.txt" for { name: "file", ext: "txt" }'
it("[happy-5] posix, win32 and the default export give the same result for partial objects", () => {
  for (const input of [
    { ext: "md" },
    { dir: "/home", name: "x" },
    { root: "/", name: "f", ext: "." },
  ]) {
    const expected = format(input);
    expect(posix.format(input)).to.equal(expected);
    expect(win32.format(input)).to.equal(expected);
    expect(pathe.format(input)).to.equal(expected);
  }
  expect(posix.format({ ext: "md" })).to.equal(".md");
  expect(win32.format({ dir: "/home", name: "x" })).to.equal("/home/x");
  expect(pathe.format({ root: "/", name: "f", ext: "." })).to.equal("/f.");
});

// extends '[happy-5] posix.format and win32.format both give "file.txt" for { name: "file", ext: "txt" }'
it('[happy-5] the default export formats { name: "file", ext: "txt" } as "file.txt"', () => {
  expect(pathe.format({ name: "file", ext: "txt" })).to.equal("file.txt");
});

// Rule: The argument itself must be an object

// extends '[unhappy-1] format(undefined) throws a TypeError'
// only the missing argument throws; an empty object does not
it("[unhappy-1] format(undefined) throws a TypeError while format({}) returns the empty string", () => {
  expect(() => format(undefined as any)).to.throw(TypeError);
  expect(format({})).to.equal("");
});

// extends '[unhappy-1] format(undefined) throws a TypeError'
it("[unhappy-1] posix.format(undefined) and win32.format(undefined) throw a TypeError", () => {
  expect(() => posix.format(undefined as any)).to.throw(TypeError);
  expect(() => win32.format(undefined as any)).to.throw(TypeError);
  expect(() => pathe.format(undefined as any)).to.throw(TypeError);
});
