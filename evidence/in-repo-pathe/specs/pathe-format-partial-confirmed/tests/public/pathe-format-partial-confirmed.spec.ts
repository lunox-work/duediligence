import type path from "node:path";

import { expect, it } from "vitest";

import { format } from "../src/_path";
import pathe, { posix, win32 } from "../src";

type FormatInput = path.FormatInputPathObject;

// Partial objects without base

it("[happy-1] name only formats to the name", () => {
  expect(format({ name: "file" })).toBe("file");
});

it("[happy-1] ext only formats to the ext", () => {
  expect(format({ ext: ".txt" })).toBe(".txt");
});

it("[happy-1] name and ext are concatenated", () => {
  expect(format({ name: "file", ext: ".txt" })).toBe("file.txt");
});

it("[happy-1] empty ext adds nothing to the name", () => {
  expect(format({ name: "file", ext: "" })).toBe("file");
});

it("[happy-1] dir and name without ext", () => {
  expect(format({ dir: "/home", name: "file" })).toBe("/home/file");
});

it("[happy-1] absolute dir and ext without name", () => {
  expect(format({ dir: "/home", ext: ".txt" })).toBe("/home/.txt");
});

it("[happy-1] relative dir and ext without name", () => {
  expect(format({ dir: "a", ext: ".txt" })).toBe("a/.txt");
});

it("[happy-1] root and name without ext", () => {
  expect(format({ root: "/", name: "file" })).toBe("/file");
});

it("[happy-1] root and ext without name", () => {
  expect(format({ root: "/", ext: ".txt" })).toBe("/.txt");
});

it("[happy-1] result never contains the string undefined", () => {
  for (const input of [
    { name: "file" },
    { ext: ".txt" },
    { dir: "/home" },
    { root: "/" },
    { dir: "a", name: "b" },
  ] as FormatInput[]) {
    expect(format(input)).not.toContain("undefined");
  }
});

it("[boundary-1] an empty object formats to the empty string", () => {
  expect(format({})).toBe("");
});

it("[boundary-2] fields set to undefined explicitly are treated as missing", () => {
  expect(
    format({
      root: undefined,
      dir: undefined,
      base: undefined,
      name: "file",
      ext: undefined,
    }),
  ).toBe("file");
});

it("[boundary-3] fields set to null are treated as missing", () => {
  expect(
    format({
      root: null,
      dir: null,
      base: null,
      name: null,
      ext: null,
    } as unknown as FormatInput),
  ).toBe("");
});

// Normalising ext

it("[happy-2] ext without a dot gets one after the name", () => {
  expect(format({ name: "file", ext: "txt" })).toBe("file.txt");
});

it("[happy-2] ext without a dot and no name gets a dot", () => {
  expect(format({ ext: "txt" })).toBe(".txt");
});

it("[happy-2] multi-part ext without a leading dot gets one dot", () => {
  expect(format({ name: "file", ext: "tar.gz" })).toBe("file.tar.gz");
});

it("[happy-2] ext without a dot under a root", () => {
  expect(format({ root: "/", name: "file", ext: "txt" })).toBe("/file.txt");
});

it("[happy-2] ext without a dot under a dir and no name", () => {
  expect(format({ dir: "/home", ext: "txt" })).toBe("/home/.txt");
});

it("[boundary-4] a lone dot ext is not given another dot", () => {
  expect(format({ name: "file", ext: "." })).toBe("file.");
});

it("[boundary-4] an ext starting with two dots is used as given", () => {
  expect(format({ name: "file", ext: "..txt" })).toBe("file..txt");
});

it("[boundary-5] a name that starts with a dot and no ext is kept as is", () => {
  expect(format({ name: ".env" })).toBe(".env");
});

// base takes precedence

it("[happy-3] base wins over name", () => {
  expect(format({ name: "file", base: "file.txt" })).toBe("file.txt");
});

it("[happy-3] base wins over an ext without a dot", () => {
  expect(format({ base: "file.md", ext: "txt" })).toBe("file.md");
});

it("[happy-3] base wins over ext under a root", () => {
  expect(format({ root: "/", base: "file.txt", ext: "ignored" })).toBe(
    "/file.txt",
  );
});

it("[boundary-6] an empty-string base still counts as given", () => {
  expect(format({ base: "", name: "file", ext: ".txt" })).toBe("");
});

// Only dir or only root

it("[boundary-7] absolute dir only is returned without a trailing separator", () => {
  expect(format({ dir: "/home/user" })).toBe("/home/user");
});

it("[boundary-7] relative dir only is returned as given", () => {
  expect(format({ dir: "home" })).toBe("home");
});

it("[boundary-7] dir with a trailing separator keeps it", () => {
  expect(format({ dir: "/home/user/" })).toBe("/home/user/");
});

it("[boundary-7] root only formats to the root", () => {
  expect(format({ root: "/" })).toBe("/");
});

it("[boundary-7] root and dir both slash format to a single slash", () => {
  expect(format({ root: "/", dir: "/" })).toBe("/");
});

// Full and Windows-style objects

it("[happy-4] dir takes over from root with a base", () => {
  expect(
    format({ root: "/ignored", dir: "/home/user/dir", base: "file.txt" }),
  ).toBe("/home/user/dir/file.txt");
});

it("[happy-4] root, dir and name without ext", () => {
  expect(format({ root: "/", dir: "/a/b", name: "f" })).toBe("/a/b/f");
});

it("[happy-4] root, name and dotted ext", () => {
  expect(format({ root: "/", name: "file", ext: ".txt" })).toBe("/file.txt");
});

it("[happy-4] Windows dir with a base uses forward slashes", () => {
  expect(format({ dir: String.raw`C:\path\dir`, base: "file.txt" })).toBe(
    "C:/path/dir/file.txt",
  );
});

it("[happy-4] Windows dir with a name only", () => {
  expect(format({ dir: String.raw`C:\a`, name: "file" })).toBe("C:/a/file");
});

it("[happy-4] Windows dir with an ext without a dot and no name", () => {
  expect(format({ dir: String.raw`C:\a\b`, ext: "txt" })).toBe("C:/a/b/.txt");
});

it("[happy-4] Windows root with name and ext without a dot", () => {
  expect(format({ root: "C:\\", name: "file", ext: "txt" })).toBe(
    "C:/file.txt",
  );
});

// posix and win32 namespaces

it("[happy-5] posix.format and win32.format share the change", () => {
  expect(posix.format({ name: "file", ext: "txt" })).toBe("file.txt");
  expect(win32.format({ name: "file", ext: "txt" })).toBe("file.txt");
});

it("[happy-5] default export format handles an empty object", () => {
  expect(posix.format({})).toBe("");
  expect(win32.format({})).toBe("");
  expect(pathe.format({ name: "file" })).toBe("file");
});

// The argument itself must be an object

it("[unhappy-1] calling format without a path object throws a TypeError", () => {
  expect(() => format(undefined as unknown as FormatInput)).toThrow(
    TypeError,
  );
});
