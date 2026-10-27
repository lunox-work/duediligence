import { expect, it } from "vitest";

import { format } from "../src/_path";
import { posix, win32 } from "../src";

// Rule: Missing name or ext contribute an empty string, never "undefined"

it('[happy-1] format({ name: "file" }) should be "file"', () => {
  expect(format({ name: "file" })).to.equal("file");
});

it('[happy-1] format({ ext: ".txt" }) should be ".txt"', () => {
  expect(format({ ext: ".txt" })).to.equal(".txt");
});

it('[happy-1] format({ name: "file", ext: ".txt" }) should be "file.txt"', () => {
  expect(format({ name: "file", ext: ".txt" })).to.equal("file.txt");
});

it('[happy-1] format({ name: "file", ext: "" }) should be "file"', () => {
  expect(format({ name: "file", ext: "" })).to.equal("file");
});

it('[happy-1] format({ dir: "/home", name: "file" }) should be "/home/file"', () => {
  expect(format({ dir: "/home", name: "file" })).to.equal("/home/file");
});

it('[happy-1] format({ dir: "/home", ext: ".txt" }) should be "/home/.txt"', () => {
  expect(format({ dir: "/home", ext: ".txt" })).to.equal("/home/.txt");
});

it('[happy-1] format({ dir: "a", ext: ".txt" }) should be "a/.txt"', () => {
  expect(format({ dir: "a", ext: ".txt" })).to.equal("a/.txt");
});

it('[happy-1] format({ root: "/", name: "file" }) should be "/file"', () => {
  expect(format({ root: "/", name: "file" })).to.equal("/file");
});

it('[happy-1] format({ root: "/", ext: ".txt" }) should be "/.txt"', () => {
  expect(format({ root: "/", ext: ".txt" })).to.equal("/.txt");
});

it("[boundary-1] format({}) should be the empty string", () => {
  expect(format({})).to.equal("");
});

it("[boundary-2] format with fields explicitly undefined treats them as missing", () => {
  expect(
    format({
      root: undefined,
      dir: undefined,
      base: undefined,
      name: "file",
      ext: undefined,
    }),
  ).to.equal("file");
});

it("[boundary-3] format with every field null should be the empty string", () => {
  expect(
    format({ root: null, dir: null, base: null, name: null, ext: null } as any),
  ).to.equal("");
});

// Rule: ext without a leading dot gets one; ext with a leading dot is used as given

it('[happy-2] format({ name: "file", ext: "txt" }) should be "file.txt"', () => {
  expect(format({ name: "file", ext: "txt" })).to.equal("file.txt");
});

it('[happy-2] format({ ext: "txt" }) should be ".txt"', () => {
  expect(format({ ext: "txt" })).to.equal(".txt");
});

it('[happy-2] format({ name: "file", ext: "tar.gz" }) should be "file.tar.gz"', () => {
  expect(format({ name: "file", ext: "tar.gz" })).to.equal("file.tar.gz");
});

it('[happy-2] format({ root: "/", name: "file", ext: "txt" }) should be "/file.txt"', () => {
  expect(format({ root: "/", name: "file", ext: "txt" })).to.equal(
    "/file.txt",
  );
});

it('[happy-2] format({ dir: "/home", ext: "txt" }) should be "/home/.txt"', () => {
  expect(format({ dir: "/home", ext: "txt" })).to.equal("/home/.txt");
});

it('[boundary-4] format({ name: "file", ext: "." }) should be "file."', () => {
  expect(format({ name: "file", ext: "." })).to.equal("file.");
});

it('[boundary-4] format({ name: "file", ext: "..txt" }) should be "file..txt"', () => {
  expect(format({ name: "file", ext: "..txt" })).to.equal("file..txt");
});

it('[boundary-5] format({ name: ".env" }) should be ".env"', () => {
  expect(format({ name: ".env" })).to.equal(".env");
});

// Rule: base, when given, wins over name and ext

it('[happy-3] format({ name: "file", base: "file.txt" }) should be "file.txt"', () => {
  expect(format({ name: "file", base: "file.txt" })).to.equal("file.txt");
});

it('[happy-3] format({ base: "file.md", ext: "txt" }) should be "file.md"', () => {
  expect(format({ base: "file.md", ext: "txt" })).to.equal("file.md");
});

it('[happy-3] format({ root: "/", base: "file.txt", ext: "ignored" }) should be "/file.txt"', () => {
  expect(format({ root: "/", base: "file.txt", ext: "ignored" })).to.equal(
    "/file.txt",
  );
});

it('[boundary-6] format({ base: "", name: "file", ext: ".txt" }) should be the empty string', () => {
  expect(format({ base: "", name: "file", ext: ".txt" })).to.equal("");
});

// Rule: dir without a file part is returned without an added separator

it('[boundary-7] format({ dir: "/home/user" }) should be "/home/user"', () => {
  expect(format({ dir: "/home/user" })).to.equal("/home/user");
});

it('[boundary-7] format({ dir: "home" }) should be "home"', () => {
  expect(format({ dir: "home" })).to.equal("home");
});

it('[boundary-7] format({ dir: "/home/user/" }) should be "/home/user/"', () => {
  expect(format({ dir: "/home/user/" })).to.equal("/home/user/");
});

it('[boundary-7] format({ root: "/" }) should be "/"', () => {
  expect(format({ root: "/" })).to.equal("/");
});

it('[boundary-7] format({ root: "/", dir: "/" }) should be "/"', () => {
  expect(format({ root: "/", dir: "/" })).to.equal("/");
});

// Rule: Existing root, dir and Windows handling is unchanged

it('[happy-4] format({ root: "/ignored", dir: "/home/user/dir", base: "file.txt" }) should be "/home/user/dir/file.txt"', () => {
  expect(
    format({ root: "/ignored", dir: "/home/user/dir", base: "file.txt" }),
  ).to.equal("/home/user/dir/file.txt");
});

it('[happy-4] format({ root: "/", dir: "/a/b", name: "f" }) should be "/a/b/f"', () => {
  expect(format({ root: "/", dir: "/a/b", name: "f" })).to.equal("/a/b/f");
});

it('[happy-4] format({ root: "/", name: "file", ext: ".txt" }) should be "/file.txt"', () => {
  expect(format({ root: "/", name: "file", ext: ".txt" })).to.equal(
    "/file.txt",
  );
});

it('[happy-4] format({ dir: "C:\\\\path\\\\dir", base: "file.txt" }) should be "C:/path/dir/file.txt"', () => {
  expect(format({ dir: String.raw`C:\path\dir`, base: "file.txt" })).to.equal(
    "C:/path/dir/file.txt",
  );
});

it('[happy-4] format({ dir: "C:\\\\a", name: "file" }) should be "C:/a/file"', () => {
  expect(format({ dir: String.raw`C:\a`, name: "file" })).to.equal(
    "C:/a/file",
  );
});

it('[happy-4] format({ dir: "C:\\\\a\\\\b", ext: "txt" }) should be "C:/a/b/.txt"', () => {
  expect(format({ dir: String.raw`C:\a\b`, ext: "txt" })).to.equal(
    "C:/a/b/.txt",
  );
});

it('[happy-4] format({ root: "C:\\\\", name: "file", ext: "txt" }) should be "C:/file.txt"', () => {
  expect(format({ root: "C:\\", name: "file", ext: "txt" })).to.equal(
    "C:/file.txt",
  );
});

it('[happy-5] posix.format and win32.format both give "file.txt" for { name: "file", ext: "txt" }', () => {
  expect(posix.format({ name: "file", ext: "txt" })).to.equal("file.txt");
  expect(win32.format({ name: "file", ext: "txt" })).to.equal("file.txt");
});

// Rule: The argument itself must be an object

it("[unhappy-1] format(undefined) throws a TypeError", () => {
  expect(() => format(undefined as any)).to.throw(TypeError);
});
