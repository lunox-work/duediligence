import { test } from "node:test";
import assert from "node:assert/strict";
import { isIgnored } from "../../src/index.js";

// spec.md tags no scenarios, so each rule it lists is keyed as one
// scenario, in the order the spec lists them: glob patterns, `#` comments,
// `!` re-includes, a trailing `/`, a leading `/`.

test("[happy-1] a glob without a slash matches a file at any depth", () => {
  const gitignore = "*.log\n";
  assert.equal(isIgnored(gitignore, "debug.log"), true);
  assert.equal(isIgnored(gitignore, "logs/app/debug.log"), true);
  assert.equal(isIgnored(gitignore, "debug.txt"), false);
});

test("[happy-1] a `*` in a pattern with a slash does not match across `/`", () => {
  const gitignore = "doc/*.txt\n";
  assert.equal(isIgnored(gitignore, "doc/notes.txt"), true);
  assert.equal(isIgnored(gitignore, "doc/server/arch.txt"), false);
});

test("[happy-2] a line starting with `#` is a comment, not a pattern", () => {
  const gitignore = "#notes.txt\n*.log\n";
  assert.equal(isIgnored(gitignore, "#notes.txt"), false);
  assert.equal(isIgnored(gitignore, "notes.txt"), false);
  assert.equal(isIgnored(gitignore, "debug.log"), true);
});

test("[happy-2] a backslash before a leading `#` makes it a pattern", () => {
  const gitignore = "\\#notes.txt\n";
  assert.equal(isIgnored(gitignore, "#notes.txt"), true);
  assert.equal(isIgnored(gitignore, "notes.txt"), false);
});

test("[happy-3] a `!` pattern re-includes a file an earlier pattern excluded", () => {
  const gitignore = "*.log\n!keep.log\n";
  assert.equal(isIgnored(gitignore, "keep.log"), false);
  assert.equal(isIgnored(gitignore, "debug.log"), true);
});

test("[happy-3] a `!` pattern cannot re-include a file whose parent directory is excluded", () => {
  const gitignore = "logs/\n!logs/keep.log\n";
  assert.equal(isIgnored(gitignore, "logs/keep.log"), true);
});

test("[happy-4] a pattern with a trailing `/` ignores everything in a matching directory", () => {
  const gitignore = "build/\n";
  assert.equal(isIgnored(gitignore, "build/out.js"), true);
  assert.equal(isIgnored(gitignore, "packages/app/build/lib/out.js"), true);
  assert.equal(isIgnored(gitignore, "src/out.js"), false);
});

test("[happy-4] a pattern with a trailing `/` does not match a file of that name", () => {
  const gitignore = "build/\n";
  assert.equal(isIgnored(gitignore, "build"), false);
  assert.equal(isIgnored(gitignore, "src/build"), false);
});

test("[happy-5] a pattern with a leading `/` matches only at the root", () => {
  const gitignore = "/todo.txt\n";
  assert.equal(isIgnored(gitignore, "todo.txt"), true);
  assert.equal(isIgnored(gitignore, "docs/todo.txt"), false);
});

test("[happy-5] a slash in the middle of a pattern anchors it to the root as a leading `/` does", () => {
  const gitignore = "doc/frotz\n";
  assert.equal(isIgnored(gitignore, "doc/frotz"), true);
  assert.equal(isIgnored(gitignore, "a/doc/frotz"), false);
});
