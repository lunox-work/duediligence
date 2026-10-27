import { test } from "node:test";
import assert from "node:assert/strict";
import { isIgnored } from "../../src/index.js";

test("[rule-1] blank lines and # comments are skipped; other patterns still apply", () => {
  const gitignore = "# build artifacts\n\n*.log\n\n";
  assert.equal(isIgnored(gitignore, "debug.log"), true);
  assert.equal(isIgnored(gitignore, "notes.txt"), false);
});

test("[rule-1] a # line is a comment even when its text names an existing file", () => {
  const gitignore = "#secret.txt\n\n# only comments here\n";
  assert.equal(isIgnored(gitignore, "#secret.txt"), false);
  assert.equal(isIgnored(gitignore, "secret.txt"), false);
});

test("[rule-2] a ! pattern re-includes a path excluded by an earlier pattern", () => {
  const gitignore = "*.log\n!keep.log\n";
  assert.equal(isIgnored(gitignore, "keep.log"), false);
  assert.equal(isIgnored(gitignore, "other.log"), true);
});

test("[rule-2] a ! pattern does not undo an exclusion that comes after it", () => {
  const gitignore = "!keep.log\n*.log\n";
  assert.equal(isIgnored(gitignore, "keep.log"), true);
});

test("[rule-3] a pattern ending in / matches a directory and ignores its files", () => {
  const gitignore = "build/\n";
  assert.equal(isIgnored(gitignore, "build/app.js"), true);
});

test("[rule-3] a pattern ending in / does not match a file of that name", () => {
  const gitignore = "build/\n";
  assert.equal(isIgnored(gitignore, "build"), false);
  assert.equal(isIgnored(gitignore, "src/build"), false);
});

test("[rule-4] a leading / anchors to the root; a slash-free pattern matches at any level", () => {
  assert.equal(isIgnored("/todo.txt\n", "todo.txt"), true);
  assert.equal(isIgnored("/todo.txt\n", "src/todo.txt"), false);
  assert.equal(isIgnored("debug.log\n", "debug.log"), true);
  assert.equal(isIgnored("debug.log\n", "a/b/debug.log"), true);
});

test("[rule-4] a / in the middle anchors the pattern to the root", () => {
  const gitignore = "doc/frotz\n";
  assert.equal(isIgnored(gitignore, "doc/frotz"), true);
  assert.equal(isIgnored(gitignore, "a/doc/frotz"), false);
});

test("[rule-5] *, ?, [...] and ** wildcards match", () => {
  assert.equal(isIgnored("*.log\n", "debug.log"), true);
  assert.equal(isIgnored("file?.txt\n", "file1.txt"), true);
  assert.equal(isIgnored("file?.txt\n", "file10.txt"), false);
  assert.equal(isIgnored("[ab].txt\n", "a.txt"), true);
  assert.equal(isIgnored("[ab].txt\n", "c.txt"), false);
  assert.equal(isIgnored("src/**/gen.ts\n", "src/x/y/z/gen.ts"), true);
});

test("[rule-5] * does not match across directories where ** does", () => {
  assert.equal(isIgnored("doc/*.txt\n", "doc/notes.txt"), true);
  assert.equal(isIgnored("doc/*.txt\n", "doc/sub/notes.txt"), false);
  assert.equal(isIgnored("doc/**/*.txt\n", "doc/sub/notes.txt"), true);
});

test("[rule-6] a pattern matching a directory ignores everything inside it", () => {
  const gitignore = "logs\n";
  assert.equal(isIgnored(gitignore, "logs/2024/10/app.txt"), true);
  assert.equal(isIgnored(gitignore, "a/b/logs/app.txt"), true);
});

test("[rule-6] a directory pattern must match the whole directory name", () => {
  const gitignore = "logs\n";
  assert.equal(isIgnored(gitignore, "catalogs/app.txt"), false);
  assert.equal(isIgnored(gitignore, "logs2/app.txt"), false);
  assert.equal(isIgnored(gitignore, "app.logs.txt"), false);
});
