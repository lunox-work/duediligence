import { test } from "node:test";
import assert from "node:assert/strict";
import { isIgnored } from "../../src/index.js";

const lines = (...ls: string[]): string => ls.join("\n");

// R3. A leading ! negates a pattern

test("[happy-3] a negation re-includes one file", () => {
  const gitignore = lines("*.log", "!keep.log");
  assert.equal(isIgnored(gitignore, "keep.log"), false);
  assert.equal(isIgnored(gitignore, "src/keep.log"), false);
  assert.equal(isIgnored(gitignore, "other.log"), true);
});

test("[happy-3] a negation that nothing earlier excluded changes nothing", () => {
  const gitignore = "!keep.log";
  assert.equal(isIgnored(gitignore, "keep.log"), false);
  assert.equal(isIgnored(gitignore, "other.log"), false);
});

test("[boundary-3] a negation before the pattern it means to undo has no effect", () => {
  const gitignore = lines("!keep.log", "*.log");
  assert.equal(isIgnored(gitignore, "keep.log"), true);
});

test("[boundary-3] an early negation has no effect at any depth", () => {
  const gitignore = lines("!keep.log", "*.log");
  assert.equal(isIgnored(gitignore, "src/keep.log"), true);
});

test("[boundary-4] an escaped ! is a literal character", () => {
  const gitignore = "\\!x.txt";
  assert.equal(isIgnored(gitignore, "!x.txt"), true);
  assert.equal(isIgnored(gitignore, "x.txt"), false);
});

test("[boundary-4] an escaped ! does not negate an earlier pattern", () => {
  const gitignore = lines("*.txt", "\\!x.txt");
  assert.equal(isIgnored(gitignore, "x.txt"), true);
  assert.equal(isIgnored(gitignore, "!x.txt"), true);
});

// R4. A file in an excluded directory cannot be re-included

test("[happy-4] excluding a directory excludes its files for good", () => {
  const gitignore = lines("build/", "!build/keep.txt");
  assert.equal(isIgnored(gitignore, "build/keep.txt"), true);
});

test("[happy-4] negating a subdirectory of an excluded directory does not re-include it", () => {
  const gitignore = lines("build/", "!build/sub/", "!build/sub/keep.txt");
  assert.equal(isIgnored(gitignore, "build/sub/keep.txt"), true);
});

test("[boundary-5] excluding a directory's contents leaves room to re-include", () => {
  const gitignore = lines("build/*", "!build/keep.txt");
  assert.equal(isIgnored(gitignore, "build/keep.txt"), false);
  assert.equal(isIgnored(gitignore, "build/main.c"), true);
});

test("[boundary-5] a subdirectory matched by dir/* stays excluded with its files", () => {
  const gitignore = lines("build/*", "!build/keep.txt");
  assert.equal(isIgnored(gitignore, "build/sub/keep.txt"), true);
});

test("[boundary-6] re-including a directory, then a file inside it", () => {
  const gitignore = lines("/out/*", "!/out/lib/", "/out/lib/*", "!/out/lib/keep.txt");
  assert.equal(isIgnored(gitignore, "out/lib/keep.txt"), false);
  assert.equal(isIgnored(gitignore, "out/lib/main.c"), true);
  assert.equal(isIgnored(gitignore, "out/main.c"), true);
});

test("[boundary-6] without re-including the directory, the file inside stays ignored", () => {
  const gitignore = lines("/out/*", "/out/lib/*", "!/out/lib/keep.txt");
  assert.equal(isIgnored(gitignore, "out/lib/keep.txt"), true);
});
