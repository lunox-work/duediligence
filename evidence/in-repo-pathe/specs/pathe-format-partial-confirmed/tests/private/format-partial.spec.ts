import type path from "node:path";

import { expect, it } from "vitest";

import { format } from "../../src/_path";
import pathe, { posix, win32 } from "../../src";

type FormatInput = path.FormatInputPathObject;

const asInput = (input: Record<string, unknown>) =>
  input as unknown as FormatInput;

// Partial objects without base

// Extends "[happy-1] name only formats to the name"
it("[happy-1] other names alone format to the name", () => {
  expect(format({ name: "README" })).toBe("README");
  expect(format({ name: "a" })).toBe("a");
  expect(format({ name: "archive.tar" })).toBe("archive.tar");
});

// Extends "[happy-1] ext only formats to the ext"
it("[happy-1] other dotted exts alone format to the ext", () => {
  expect(format({ ext: ".md" })).toBe(".md");
  expect(format({ ext: ".tar.gz" })).toBe(".tar.gz");
});

// Extends "[happy-1] name and ext are concatenated"
it("[happy-1] dir, name and dotted ext without base", () => {
  expect(format({ dir: "/home/user", name: "notes", ext: ".md" })).toBe(
    "/home/user/notes.md",
  );
  expect(format({ dir: "src", name: "index", ext: ".ts" })).toBe(
    "src/index.ts",
  );
});

// Extends "[happy-1] empty ext adds nothing to the name"
it("[happy-1] empty ext adds nothing under a dir or root", () => {
  expect(format({ dir: "/home", name: "file", ext: "" })).toBe("/home/file");
  expect(format({ root: "/", name: "file", ext: "" })).toBe("/file");
});

// Extends "[happy-1] dir and name without ext": no normalisation without root
it("[happy-1] dir and name without root are joined with no normalisation", () => {
  expect(format({ dir: "a/../b", name: "c" })).toBe("a/../b/c");
  expect(format({ dir: "./a", name: "b" })).toBe("./a/b");
  expect(format({ dir: "a/", name: "b" })).toBe("a//b");
});

// Extends "[happy-1] relative dir and ext without name"
it("[happy-1] deep relative dir and ext without name", () => {
  const dir = Array.from({ length: 40 }, (_, i) => `d${i}`).join("/");
  expect(format({ dir, ext: ".txt" })).toBe(`${dir}/.txt`);
  expect(format({ dir, name: "f" })).toBe(`${dir}/f`);
});

// Extends "[happy-1] root and name without ext": root goes through resolve
it("[happy-1] root with a relative dir and name is resolved", () => {
  expect(format({ root: "/", dir: "a/b", name: "c" })).toBe("/a/b/c");
  expect(format({ root: "/", dir: "/a/b/../c", name: "f" })).toBe("/a/c/f");
});

// Extends "[happy-1] root and ext without name"
it("[happy-1] root with dir and ext without name", () => {
  expect(format({ root: "/", dir: "/srv", ext: ".log" })).toBe("/srv/.log");
});

// Extends "[happy-1] result never contains the string undefined"
it("[happy-1] more partial objects never produce undefined or NaN", () => {
  for (const [input, output] of [
    [{ dir: "/x", ext: ".y" }, "/x/.y"],
    [{ root: "/", dir: "/x" }, "/x"],
    [{ name: "n", ext: ".e" }, "n.e"],
    [{ dir: "undefinedx", name: "y" }, "undefinedx/y"],
  ] as [FormatInput, string][]) {
    const result = format(input);
    expect(result).toBe(output);
    expect(result).not.toContain("NaN");
  }
});

// Extends "[boundary-1] an empty object formats to the empty string"
it("[boundary-1] empty object through every namespace formats to the empty string", () => {
  expect(format({})).toBe("");
  expect(pathe.format({})).toBe("");
  expect(posix.format({})).toBe("");
  expect(win32.format({})).toBe("");
});

// Extends "[boundary-2] fields set to undefined explicitly are treated as missing"
it("[boundary-2] explicit undefined base does not hide name and ext", () => {
  expect(format({ base: undefined, name: "a", ext: "b" })).toBe("a.b");
  expect(
    format({ dir: "/home", base: undefined, name: "f", ext: undefined }),
  ).toBe("/home/f");
  expect(format({ base: undefined, name: undefined, ext: "md" })).toBe(".md");
});

it("[boundary-2] every field undefined formats to the empty string", () => {
  expect(
    format({
      root: undefined,
      dir: undefined,
      base: undefined,
      name: undefined,
      ext: undefined,
    }),
  ).toBe("");
});

// Extends "[boundary-3] fields set to null are treated as missing"
it("[boundary-3] null base does not hide name and ext", () => {
  expect(format(asInput({ base: null, name: "file", ext: "txt" }))).toBe(
    "file.txt",
  );
  expect(
    format(asInput({ root: null, dir: null, base: null, name: "file", ext: ".md" })),
  ).toBe("file.md");
});

it("[boundary-3] null name or ext contributes nothing", () => {
  expect(format(asInput({ name: "file", ext: null }))).toBe("file");
  expect(format(asInput({ name: null, ext: "txt" }))).toBe(".txt");
  expect(format(asInput({ dir: "/home", name: null, ext: ".txt" }))).toBe(
    "/home/.txt",
  );
});

it("[boundary-3] null root or dir contributes nothing", () => {
  expect(format(asInput({ root: null, dir: "/a", name: "f" }))).toBe("/a/f");
  expect(format(asInput({ root: null, dir: "a/../b", name: "f" }))).toBe(
    "a/../b/f",
  );
  expect(format(asInput({ dir: null, name: "f" }))).toBe("f");
  expect(format(asInput({ root: "/", dir: null, name: "f" }))).toBe("/f");
});

// Normalising ext

// Extends "[happy-2] ext without a dot gets one after the name"
it("[happy-2] other exts without a dot get exactly one", () => {
  expect(format({ name: "index", ext: "html" })).toBe("index.html");
  expect(format({ name: "archive.tar", ext: "gz" })).toBe("archive.tar.gz");
  expect(format({ name: "x", ext: "Md" })).toBe("x.Md");
  expect(format({ name: "x", ext: "e" })).toBe("x.e");
});

// Extends "[happy-2] multi-part ext without a leading dot gets one dot"
it("[happy-2] ext containing dots but not leading gets one leading dot", () => {
  expect(format({ name: "file", ext: "txt." })).toBe("file.txt.");
  expect(format({ name: "file", ext: "a.b.c" })).toBe("file.a.b.c");
  expect(format({ ext: "tar.gz" })).toBe(".tar.gz");
});

// Extends "[happy-2] ext without a dot under a dir and no name"
it("[happy-2] ext without a dot with dir and name", () => {
  expect(format({ dir: "/home", name: "file", ext: "txt" })).toBe(
    "/home/file.txt",
  );
  expect(format({ dir: "a", ext: "txt" })).toBe("a/.txt");
});

// Extends "[happy-2] ext without a dot under a root": the decided root + ext case
it("[happy-2] root with ext without a dot and no name", () => {
  expect(format({ root: "/", ext: "txt" })).toBe("/.txt");
  expect(format({ root: "/", dir: "/srv", ext: "log" })).toBe("/srv/.log");
});

it("[happy-2] dotfile name with an ext without a dot", () => {
  expect(format({ name: ".env", ext: "local" })).toBe(".env.local");
});

// Extends "[boundary-4] a lone dot ext is not given another dot"
it("[boundary-4] a lone dot ext without a name or under a dir", () => {
  expect(format({ ext: "." })).toBe(".");
  expect(format({ dir: "/home", name: "f", ext: "." })).toBe("/home/f.");
});

// Extends "[boundary-4] an ext starting with two dots is used as given"
it("[boundary-4] exts with several leading dots are used as given", () => {
  expect(format({ name: "file", ext: ".." })).toBe("file..");
  expect(format({ name: "file", ext: "...md" })).toBe("file...md");
  expect(format({ ext: "..txt" })).toBe("..txt");
  expect(format({ name: "file", ext: ".tar.gz" })).toBe("file.tar.gz");
});

// Extends "[boundary-5] a name that starts with a dot and no ext is kept as is"
it("[boundary-5] dotfile names under a dir or root are kept as is", () => {
  expect(format({ dir: "/app", name: ".env" })).toBe("/app/.env");
  expect(format({ root: "/", name: ".gitignore" })).toBe("/.gitignore");
  expect(format({ name: ".bashrc", ext: "" })).toBe(".bashrc");
  expect(format({ name: "..." })).toBe("...");
});

// base takes precedence

// Extends "[happy-3] base wins over name"
it("[happy-3] base wins over name and ext together", () => {
  expect(format({ base: "index.html", name: "other", ext: "md" })).toBe(
    "index.html",
  );
  expect(format({ dir: "/x", base: "a.b", name: "c", ext: ".d" })).toBe(
    "/x/a.b",
  );
});

// Extends "[happy-3] base wins over an ext without a dot": no suffix appended to base
it("[happy-3] base without an extension is not given ext", () => {
  expect(format({ base: "noext", ext: "txt" })).toBe("noext");
  expect(format({ base: "noext", ext: ".txt" })).toBe("noext");
  expect(format({ base: ".bashrc", ext: "sh" })).toBe(".bashrc");
});

// Extends "[happy-3] base wins over ext under a root"
it("[happy-3] base wins under root and dir", () => {
  expect(
    format({ root: "/", dir: "/a/b/../c", base: "f.txt", name: "g", ext: "h" }),
  ).toBe("/a/c/f.txt");
  expect(format({ dir: "rel", base: "f.txt", name: "g" })).toBe("rel/f.txt");
});

// Extends "[boundary-6] an empty-string base still counts as given"
it("[boundary-6] empty base alone or with dir drops name and ext", () => {
  expect(format({ base: "" })).toBe("");
  expect(format({ base: "", ext: "txt" })).toBe("");
  expect(format({ dir: "/home", base: "", name: "file", ext: "txt" })).toBe(
    "/home",
  );
  expect(format({ dir: "a", base: "", ext: ".txt" })).toBe("a");
});

it("[boundary-6] empty base under a root leaves only the root", () => {
  expect(format({ root: "/", base: "", name: "file" })).toBe("/");
  expect(format({ root: "/", dir: "/srv", base: "", name: "f" })).toBe(
    "/srv",
  );
});

// Only dir or only root

// Extends "[boundary-7] absolute dir only is returned without a trailing separator"
it("[boundary-7] other dirs only are returned as given", () => {
  expect(format({ dir: "/a/b/c/d" })).toBe("/a/b/c/d");
  expect(format({ dir: "a/b" })).toBe("a/b");
  expect(format({ dir: "." })).toBe(".");
  expect(format({ dir: "a/../b" })).toBe("a/../b");
});

// Extends "[boundary-7] dir with a trailing separator keeps it"
it("[boundary-7] relative and Windows dirs with a trailing separator keep it", () => {
  expect(format({ dir: "home/" })).toBe("home/");
  expect(format({ dir: "C:\\a\\" })).toBe("C:/a/");
  expect(format({ dir: "a\\b\\" })).toBe("a/b/");
});

// Extends "[boundary-7] root and dir both slash format to a single slash"
it("[boundary-7] root and dir without a file part are resolved", () => {
  expect(format({ root: "/", dir: "/home/user" })).toBe("/home/user");
  expect(format({ root: "/", dir: "/home/user/" })).toBe("/home/user");
  expect(format({ root: "/", dir: "/a/b/.." })).toBe("/a");
});

// Full and Windows-style objects

// Extends "[happy-4] dir takes over from root with a base"
it("[happy-4] absolute dir takes over from another root", () => {
  expect(format({ root: "/ignored", dir: "/srv/app", name: "f", ext: "js" })).toBe(
    "/srv/app/f.js",
  );
});

// Extends "[happy-4] Windows dir with a base uses forward slashes"
it("[happy-4] lower-case drive in dir is upper-cased", () => {
  expect(format({ dir: String.raw`c:\a`, name: "file" })).toBe("C:/a/file");
  expect(format({ dir: String.raw`c:\path\dir`, base: "file.txt" })).toBe(
    "C:/path/dir/file.txt",
  );
});

// Extends "[happy-4] Windows dir with an ext without a dot and no name"
it("[happy-4] Windows dir with name and ext without a dot", () => {
  expect(format({ dir: String.raw`C:\a\b`, name: "f", ext: "txt" })).toBe(
    "C:/a/b/f.txt",
  );
  expect(format({ dir: String.raw`a\b`, name: "f", ext: "txt" })).toBe(
    "a/b/f.txt",
  );
});

// Extends "[happy-4] Windows root with name and ext without a dot"
it("[happy-4] lower-case Windows root with dir, name and ext", () => {
  expect(format({ root: "c:\\", name: "file", ext: "md" })).toBe(
    "C:/file.md",
  );
  expect(
    format({ root: "c:\\", dir: String.raw`c:\x`, name: "f", ext: "md" }),
  ).toBe("C:/x/f.md");
  expect(format({ root: "C:\\", ext: "txt" })).toBe("C:/.txt");
});

// posix and win32 namespaces

// Extends "[happy-5] posix.format and win32.format share the change"
it("[happy-5] every namespace normalises ext and drops missing fields", () => {
  for (const fn of [format, posix.format, win32.format, pathe.format]) {
    expect(fn({ dir: "/home", ext: "txt" })).toBe("/home/.txt");
    expect(fn({ name: "file", ext: "..txt" })).toBe("file..txt");
    expect(fn({ base: "", name: "file", ext: "txt" })).toBe("");
    expect(fn({ dir: "/home/user" })).toBe("/home/user");
  }
});

it("[happy-5] default export format normalises ext", () => {
  expect(pathe.format({ name: "file", ext: "txt" })).toBe("file.txt");
  expect(pathe.format({ root: "/", ext: "txt" })).toBe("/.txt");
});

// The argument itself must be an object

// Extends "[unhappy-1] calling format without a path object throws a TypeError"
it("[unhappy-1] every namespace throws a TypeError without a path object", () => {
  for (const fn of [posix.format, win32.format, pathe.format]) {
    expect(() => fn(undefined as unknown as FormatInput)).toThrow(TypeError);
  }
});

it("[unhappy-1] calling format with no argument at all throws a TypeError", () => {
  expect(() => (format as unknown as () => string)()).toThrow(TypeError);
});
