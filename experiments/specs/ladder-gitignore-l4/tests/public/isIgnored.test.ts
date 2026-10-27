import { test } from "node:test";
import assert from "node:assert/strict";
import { isIgnored } from "../../src/index.js";

// The spec has a single, untagged scenario: git's own `.gitignore` rules
// decide the answer. Every test below asserts that scenario.

test("[happy-1] a pattern without a slash matches a file name at any depth", () => {
  assert.equal(isIgnored("*.log\n", "debug.log"), true);
  assert.equal(isIgnored("*.log\n", "a/b/debug.log"), true);
  assert.equal(isIgnored("*.log\n", "debug.txt"), false);
});

test("[happy-1] an empty .gitignore ignores nothing", () => {
  assert.equal(isIgnored("", "a.txt"), false);
  assert.equal(isIgnored("", "a/b/c.txt"), false);
});

test("[happy-1] blank lines and # comments match nothing", () => {
  assert.equal(isIgnored("\n# notes\n\n", "# notes"), false);
  assert.equal(isIgnored("#notes\n", "#notes"), false);
});

test("[happy-1] a backslash escapes a leading # or !", () => {
  assert.equal(isIgnored("\\#notes\n", "#notes"), true);
  assert.equal(isIgnored("\\!important\n", "!important"), true);
});

test("[happy-1] a pattern without a slash matches a directory at any depth", () => {
  assert.equal(isIgnored("tmp\n", "tmp/x.txt"), true);
  assert.equal(isIgnored("tmp\n", "a/tmp/b/x.txt"), true);
  assert.equal(isIgnored("tmp\n", "a/tmpx/x.txt"), false);
});

test("[happy-1] a trailing slash matches directories only", () => {
  assert.equal(isIgnored("build/\n", "build/out.txt"), true);
  assert.equal(isIgnored("build/\n", "src/build/out.txt"), true);
  assert.equal(isIgnored("build/\n", "build"), false);
  assert.equal(isIgnored("build/\n", "src/build"), false);
});

test("[happy-1] a leading slash anchors the pattern to the root", () => {
  assert.equal(isIgnored("/todo.txt\n", "todo.txt"), true);
  assert.equal(isIgnored("/todo.txt\n", "sub/todo.txt"), false);
});

test("[happy-1] a slash in the middle anchors the pattern to the root", () => {
  assert.equal(isIgnored("doc/frotz\n", "doc/frotz"), true);
  assert.equal(isIgnored("doc/frotz\n", "doc/frotz/x.txt"), true);
  assert.equal(isIgnored("doc/frotz\n", "a/doc/frotz"), false);
});

test("[happy-1] * and ? do not match a slash", () => {
  assert.equal(isIgnored("doc/*.html\n", "doc/git.html"), true);
  assert.equal(isIgnored("doc/*.html\n", "doc/ppc/ppc.html"), false);
  assert.equal(isIgnored("a?c\n", "abc"), true);
  assert.equal(isIgnored("a?c\n", "ac"), false);
  assert.equal(isIgnored("x/a?c\n", "x/a/c"), false);
});

test("[happy-1] a bracket expression matches one character from the set", () => {
  assert.equal(isIgnored("file[0-9].txt\n", "file7.txt"), true);
  assert.equal(isIgnored("file[0-9].txt\n", "filex.txt"), false);
  assert.equal(isIgnored("file[0-9].txt\n", "file12.txt"), false);
});

test("[happy-1] a leading **/ matches in every directory, including the root", () => {
  assert.equal(isIgnored("**/foo\n", "foo"), true);
  assert.equal(isIgnored("**/foo\n", "a/b/foo"), true);
  assert.equal(isIgnored("**/foo/bar\n", "x/foo/bar"), true);
  assert.equal(isIgnored("**/foo/bar\n", "foo/bar"), true);
});

test("[happy-1] a trailing /** matches everything inside", () => {
  assert.equal(isIgnored("abc/**\n", "abc/x.txt"), true);
  assert.equal(isIgnored("abc/**\n", "abc/d/e/x.txt"), true);
  assert.equal(isIgnored("abc/**\n", "x/abc/y.txt"), false);
});

test("[happy-1] /**/ matches zero or more directories", () => {
  assert.equal(isIgnored("a/**/b\n", "a/b"), true);
  assert.equal(isIgnored("a/**/b\n", "a/x/b"), true);
  assert.equal(isIgnored("a/**/b\n", "a/x/y/b"), true);
  assert.equal(isIgnored("a/**/b\n", "c/a/b"), false);
});

test("[happy-1] ! re-includes a file an earlier pattern excluded", () => {
  const gitignore = "*.log\n!keep.log\n";
  assert.equal(isIgnored(gitignore, "debug.log"), true);
  assert.equal(isIgnored(gitignore, "keep.log"), false);
  assert.equal(isIgnored(gitignore, "a/keep.log"), false);
});

test("[happy-1] the last matching pattern wins", () => {
  assert.equal(isIgnored("!keep.log\n*.log\n", "keep.log"), true);
});

test("[happy-1] a file cannot be re-included if its parent directory is excluded", () => {
  assert.equal(isIgnored("logs/\n!logs/keep.log\n", "logs/keep.log"), true);
  assert.equal(isIgnored("logs\n!keep.log\n", "logs/keep.log"), true);
});

test("[happy-1] excluding a directory's contents lets a file in it be re-included", () => {
  const gitignore = "logs/*\n!logs/keep.log\n";
  assert.equal(isIgnored(gitignore, "logs/keep.log"), false);
  assert.equal(isIgnored(gitignore, "logs/other.log"), true);
});

test("[happy-1] everything except foo/bar is excluded", () => {
  const gitignore = "/*\n!/foo\n/foo/*\n!/foo/bar\n";
  assert.equal(isIgnored(gitignore, "foo/bar/x.txt"), false);
  assert.equal(isIgnored(gitignore, "foo/baz/x.txt"), true);
  assert.equal(isIgnored(gitignore, "top.txt"), true);
});

test("[happy-1] unescaped trailing spaces are ignored", () => {
  assert.equal(isIgnored("*.log   \n", "a.log"), true);
});
