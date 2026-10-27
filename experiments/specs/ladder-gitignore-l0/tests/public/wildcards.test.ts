import { test } from "node:test";
import assert from "node:assert/strict";
import { isIgnored } from "../../src/index.js";

// R7. Wildcards never cross a slash

test("[happy-8] wildcards", () => {
  const examples: [string, string, boolean][] = [
    ["*.log", "src/app.log", true],
    ["*.log", "app.log.bak", false],
    ["src/*.js", "src/util.js", true],
    ["src/*.js", "src/lib/util.js", false],
    ["?.txt", "a.txt", true],
    ["?.txt", "ab.txt", false],
    ["data[0-3]", "data3", true],
    ["data[0-3]", "data4", false],
    ["[!a]x", "bx", true],
    ["[!a]x", "ax", false],
    ["src?lib", "src/lib", false],
  ];
  for (const [pattern, path, expected] of examples) {
    assert.equal(isIgnored(pattern, path), expected, `${pattern} on ${path}`);
  }
});

test("[happy-8] a star matches an empty run", () => {
  assert.equal(isIgnored("app*.log", "app.log"), true);
});

test("[happy-8] a caret also negates a set", () => {
  assert.equal(isIgnored("[^a]x", "bx"), true);
  assert.equal(isIgnored("[^a]x", "ax"), false);
});

test("[happy-8] an unclosed bracket is a literal bracket", () => {
  assert.equal(isIgnored("data[0", "data[0"), true);
  assert.equal(isIgnored("data[0", "data0"), false);
});

test("[boundary-9] a backslash makes a wildcard literal", () => {
  const gitignore = "\\*.txt";
  assert.equal(isIgnored(gitignore, "*.txt"), true);
  assert.equal(isIgnored(gitignore, "a.txt"), false);
});

test("[boundary-9] a backslash makes a question mark literal", () => {
  const gitignore = "\\?.txt";
  assert.equal(isIgnored(gitignore, "?.txt"), true);
  assert.equal(isIgnored(gitignore, "a.txt"), false);
});

// R8. Two asterisks span directories only between slashes

test("[happy-9] double asterisks", () => {
  const examples: [string, string, boolean][] = [
    ["**/main.c", "main.c", true],
    ["**/main.c", "src/lib/main.c", true],
    ["**/src/main.c", "lib/src/main.c", true],
    ["**/src/main.c", "src/lib/main.c", false],
    ["src/**", "src/lib/main.c", true],
    ["src/**/main.c", "src/main.c", true],
    ["src/**/main.c", "src/a/b/main.c", true],
    ["src/**/main.c", "lib/src/main.c", false],
  ];
  for (const [pattern, path, expected] of examples) {
    assert.equal(isIgnored(pattern, path), expected, `${pattern} on ${path}`);
  }
});

test("[happy-9] a pattern of only two asterisks matches every path", () => {
  assert.equal(isIgnored("**", "a.txt"), true);
  assert.equal(isIgnored("**", "x/y/z.c"), true);
});

test("[boundary-10] asterisks not next to slashes are a single star", () => {
  const gitignore = "core**x";
  assert.equal(isIgnored(gitignore, "corex"), true);
  assert.equal(isIgnored(gitignore, "src/coreabx"), true);
  assert.equal(isIgnored(gitignore, "corey"), false);
});

test("[boundary-10] asterisks not next to slashes do not cross a slash", () => {
  assert.equal(isIgnored("core**x", "core/x"), false);
});
