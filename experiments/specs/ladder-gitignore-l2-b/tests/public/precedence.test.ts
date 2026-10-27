import { test } from "node:test";
import assert from "node:assert/strict";
import { isIgnored } from "../../src/index.js";

const lines = (...ls: string[]): string => ls.join("\n");

// R9. The last matching pattern decides

test("[happy-10] later patterns override earlier ones", () => {
  const gitignore = lines("*.txt", "!a*.txt", "a1*.txt");
  assert.equal(isIgnored(gitignore, "a1.txt"), true);
  assert.equal(isIgnored(gitignore, "a2.txt"), false);
  assert.equal(isIgnored(gitignore, "b.txt"), true);
});

test("[happy-10] a path no pattern matches is not ignored", () => {
  assert.equal(isIgnored(lines("*.txt", "!a*.txt", "a1*.txt"), "x.c"), false);
  assert.equal(isIgnored("", "a.txt"), false);
});

// R10. A pattern that matches a directory ignores its contents

test("[happy-11] a bare name ignores a directory anywhere, and its contents", () => {
  const gitignore = "cache";
  assert.equal(isIgnored(gitignore, "cache/data.json"), true);
  assert.equal(isIgnored(gitignore, "src/lib/cache/x/data.json"), true);
  assert.equal(isIgnored(gitignore, "src/cachex/data.json"), false);
});

test("[happy-11] a file inside a directory matched by a bare name cannot be re-included", () => {
  const gitignore = lines("cache", "!data.json");
  assert.equal(isIgnored(gitignore, "cache/data.json"), true);
});
