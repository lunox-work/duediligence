import { test } from "node:test";
import assert from "node:assert/strict";
import { isIgnored } from "../../src/index.js";

// Rule 1: blank lines and comments match nothing.

test("[rule-1] a comment line matches nothing, while an escaped # is a pattern", () => {
  assert.equal(isIgnored("#foo", "#foo"), false);
  assert.equal(isIgnored("# foo\nfoo", "foo"), true);
  assert.equal(isIgnored("\\#foo", "#foo"), true);
});

test("[rule-1] blank lines match nothing", () => {
  assert.equal(isIgnored("\n\n", "a"), false);
  assert.equal(isIgnored("\nfoo\n\n", "foo"), true);
});

test("[rule-1] only a # in the first column starts a comment", () => {
  assert.equal(isIgnored(" #foo", " #foo"), true);
  assert.equal(isIgnored(" #foo", "#foo"), false);
});

test("[rule-1] a line of spaces only is blank", () => {
  assert.equal(isIgnored("   ", "   "), false);
  assert.equal(isIgnored("   ", " "), false);
});

// Rule 2: trailing spaces are dropped unless escaped.

test("[rule-2] trailing spaces are removed from a pattern", () => {
  assert.equal(isIgnored("foo   ", "foo"), true);
  assert.equal(isIgnored("foo   ", "foo "), false);
});

test("[rule-2] an escaped trailing space is kept along with the spaces before it", () => {
  assert.equal(isIgnored("foo\\ ", "foo "), true);
  assert.equal(isIgnored("foo\\ ", "foo"), false);
  assert.equal(isIgnored("foo  \\ ", "foo   "), true);
  assert.equal(isIgnored("foo  \\ ", "foo "), false);
  assert.equal(isIgnored("foo\\  ", "foo "), true);
});

test("[rule-2] spaces inside a pattern are part of it", () => {
  assert.equal(isIgnored("a b", "a b"), true);
  assert.equal(isIgnored("a b", "ab"), false);
});

// Rule 3: a leading ! negates a pattern.

test("[rule-3] a negated pattern re-includes a path excluded earlier", () => {
  const gitignore = "*.log\n!keep.log";
  assert.equal(isIgnored(gitignore, "a.log"), true);
  assert.equal(isIgnored(gitignore, "keep.log"), false);
});

test("[rule-3] a negated pattern that nothing earlier excluded changes nothing", () => {
  assert.equal(isIgnored("!foo", "foo"), false);
  assert.equal(isIgnored("!foo", "bar"), false);
});

test("[rule-3] an escaped ! is a literal !", () => {
  assert.equal(isIgnored("\\!important", "!important"), true);
  assert.equal(isIgnored("\\!important", "important"), false);
});

// Rule 4: a file in an excluded directory cannot be re-included.

test("[rule-4] a file in an ignored directory stays ignored despite a negated pattern", () => {
  assert.equal(isIgnored("build/\n!build/keep.txt", "build/keep.txt"), true);
  assert.equal(isIgnored("build\n!build/keep.txt", "build/keep.txt"), true);
});

test("[rule-4] a directory inside an ignored directory is ignored", () => {
  assert.equal(isIgnored("a/b\n!a/b/c", "a/b/c/d"), true);
  assert.equal(isIgnored("a/b\n!a/b/c/", "a/b/c/d"), true);
});

test("[rule-4] when no parent directory is ignored, the patterns decide the file", () => {
  const gitignore = "build/*\n!build/keep.txt";
  assert.equal(isIgnored(gitignore, "build/keep.txt"), false);
  assert.equal(isIgnored(gitignore, "build/other.txt"), true);
});

test("[rule-4] a re-included directory does not ignore its contents", () => {
  const gitignore = "build/*\n!build/sub";
  assert.equal(isIgnored(gitignore, "build/sub/a"), false);
  assert.equal(isIgnored(gitignore, "build/other/a"), true);
});

// Rule 5: a trailing slash matches directories only.

test("[rule-5] a pattern with a trailing slash matches a directory", () => {
  assert.equal(isIgnored("logs/", "logs/a.txt"), true);
  assert.equal(isIgnored("logs/", "logs/x/a.txt"), true);
});

test("[rule-5] a pattern with a trailing slash does not match a file", () => {
  assert.equal(isIgnored("logs/", "logs"), false);
  assert.equal(isIgnored("logs/", "src/logs"), false);
  assert.equal(isIgnored("logs", "logs"), true);
});

test("[rule-5] the trailing slash is removed before anchoring is decided", () => {
  assert.equal(isIgnored("logs/", "src/logs/a.txt"), true);
  assert.equal(isIgnored("*/", "a/b"), true);
  assert.equal(isIgnored("*/", "b"), false);
});

// Rule 6: a slash at the start or in the middle anchors a pattern.

test("[rule-6] a pattern with a slash in the middle matches from the root", () => {
  assert.equal(isIgnored("doc/frotz", "doc/frotz"), true);
  assert.equal(isIgnored("doc/frotz", "a/doc/frotz"), false);
});

test("[rule-6] a leading slash anchors the pattern and is dropped", () => {
  assert.equal(isIgnored("/foo", "foo"), true);
  assert.equal(isIgnored("/foo", "a/foo"), false);
  assert.equal(isIgnored("/doc/frotz", "doc/frotz"), true);
});

test("[rule-6] a pattern without a slash matches the last component at any depth", () => {
  assert.equal(isIgnored("foo", "foo"), true);
  assert.equal(isIgnored("foo", "a/b/foo"), true);
  assert.equal(isIgnored("foo", "a/b/foobar"), false);
});

test("[rule-6] a pattern still anchored after its trailing slash is removed", () => {
  assert.equal(isIgnored("doc/frotz/", "doc/frotz/x"), true);
  assert.equal(isIgnored("doc/frotz/", "a/doc/frotz/x"), false);
});

// Rule 7: wildcards never cross a slash.

test("[rule-7] * matches any run of characters, empty included", () => {
  assert.equal(isIgnored("*.txt", "a.txt"), true);
  assert.equal(isIgnored("*.txt", ".txt"), true);
  assert.equal(isIgnored("*.txt", "a.txt.bak"), false);
});

test("[rule-7] * does not cross a slash", () => {
  assert.equal(isIgnored("a/*.txt", "a/b.txt"), true);
  assert.equal(isIgnored("a/*.txt", "a/b/c.txt"), false);
});

test("[rule-7] ? matches exactly one character but not a slash", () => {
  assert.equal(isIgnored("?.c", "a.c"), true);
  assert.equal(isIgnored("?.c", ".c"), false);
  assert.equal(isIgnored("?.c", "ab.c"), false);
  assert.equal(isIgnored("x/a?b", "x/a/b"), false);
});

test("[rule-7] brackets match one character from a set or range", () => {
  assert.equal(isIgnored("[abc].c", "b.c"), true);
  assert.equal(isIgnored("[abc].c", "d.c"), false);
  assert.equal(isIgnored("[a-c]x", "bx"), true);
  assert.equal(isIgnored("[a-c]x", "dx"), false);
});

test("[rule-7] negated brackets match one character not in the set, and never a slash", () => {
  assert.equal(isIgnored("[!a]x", "bx"), true);
  assert.equal(isIgnored("[!a]x", "ax"), false);
  assert.equal(isIgnored("[^a]x", "bx"), true);
  assert.equal(isIgnored("[^a]x", "ax"), false);
  assert.equal(isIgnored("x/a[!b]c", "x/a/c"), false);
});

test("[rule-7] an unclosed [ is a literal [", () => {
  assert.equal(isIgnored("a[b", "a[b"), true);
  assert.equal(isIgnored("a[b", "ab"), false);
});

test("[rule-7] a backslash makes the next character literal", () => {
  assert.equal(isIgnored("\\*.txt", "*.txt"), true);
  assert.equal(isIgnored("\\*.txt", "a.txt"), false);
  assert.equal(isIgnored("\\?", "?"), true);
  assert.equal(isIgnored("\\?", "a"), false);
});

test("[rule-7] matching is case-sensitive", () => {
  assert.equal(isIgnored("*.TXT", "a.txt"), false);
  assert.equal(isIgnored("Foo", "foo"), false);
});

// Rule 8: two asterisks span directories only between slashes.

test("[rule-8] a leading **/ matches in every directory, the root included", () => {
  assert.equal(isIgnored("**/foo", "foo"), true);
  assert.equal(isIgnored("**/foo", "a/foo"), true);
  assert.equal(isIgnored("**/foo", "a/b/foo"), true);
  assert.equal(isIgnored("**/foo", "a/b/foobar"), false);
});

test("[rule-8] a trailing /** matches everything inside but not the directory name itself", () => {
  assert.equal(isIgnored("abc/**", "abc/x"), true);
  assert.equal(isIgnored("abc/**", "abc/d/x"), true);
  assert.equal(isIgnored("abc/**", "abc"), false);
  assert.equal(isIgnored("abc/**", "x/abc/y"), false);
});

test("[rule-8] /**/ in the middle matches zero or more directories", () => {
  assert.equal(isIgnored("a/**/b", "a/b"), true);
  assert.equal(isIgnored("a/**/b", "a/x/b"), true);
  assert.equal(isIgnored("a/**/b", "a/x/y/b"), true);
  assert.equal(isIgnored("a/**/b", "x/a/b"), false);
});

test("[rule-8] a pattern of only ** matches every path", () => {
  assert.equal(isIgnored("**", "x"), true);
  assert.equal(isIgnored("**", "a/b/c"), true);
});

test("[rule-8] any other run of asterisks is a single * that does not cross a slash", () => {
  assert.equal(isIgnored("foo/a**b", "foo/axyb"), true);
  assert.equal(isIgnored("foo/a**b", "foo/ab"), true);
  assert.equal(isIgnored("foo/a**b", "foo/a/b"), false);
});

// Rule 9: the last matching pattern decides.

test("[rule-9] the last matching pattern decides the path", () => {
  assert.equal(isIgnored("foo\n!foo", "foo"), false);
  assert.equal(isIgnored("!foo\nfoo", "foo"), true);
  assert.equal(isIgnored("*.log\n!a.log\na.log", "a.log"), true);
});

test("[rule-9] a path no pattern matches is not ignored", () => {
  assert.equal(isIgnored("", "foo"), false);
  assert.equal(isIgnored("bar\n*.log", "foo"), false);
});

// Rule 10: a pattern that matches a directory ignores its contents.

test("[rule-10] a pattern matching a directory's name ignores everything inside", () => {
  assert.equal(isIgnored("node_modules", "node_modules/x/y.js"), true);
  assert.equal(isIgnored("node_modules", "a/node_modules/z.js"), true);
});

test("[rule-10] a directory is matched by its whole name, not a prefix", () => {
  assert.equal(isIgnored("foo", "foobar/x"), false);
  assert.equal(isIgnored("foo", "a/foobar/x"), false);
  assert.equal(isIgnored("*.d", "a/x.d/y"), true);
});
