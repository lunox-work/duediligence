import { test } from "node:test";
import assert from "node:assert/strict";
import { isIgnored } from "../../src/index.js";

const lines = (...ls: string[]): string => ls.join("\n");

// R1. Blank lines and comments match nothing

test("[happy-1] a comment line ignores nothing", () => {
  const gitignore = "#notes.txt";
  assert.equal(isIgnored(gitignore, "#notes.txt"), false);
  assert.equal(isIgnored(gitignore, "notes.txt"), false);
});

test("[happy-1] a comment line does not disturb the patterns after it", () => {
  const gitignore = lines("#a.txt", "b.txt");
  assert.equal(isIgnored(gitignore, "a.txt"), false);
  assert.equal(isIgnored(gitignore, "b.txt"), true);
});

test("[boundary-1] an escaped hash and a leading space make patterns, not comments", () => {
  const gitignore = lines("\\#notes.txt", " #app.log");
  assert.equal(isIgnored(gitignore, "#notes.txt"), true);
  assert.equal(isIgnored(gitignore, " #app.log"), true);
  assert.equal(isIgnored(gitignore, "#app.log"), false);
});

test("[boundary-1] a line of spaces only is blank and matches nothing", () => {
  const gitignore = "   ";
  assert.equal(isIgnored(gitignore, "   "), false);
  assert.equal(isIgnored(gitignore, " "), false);
});

// R2. Trailing spaces are dropped unless escaped

test("[happy-2] unescaped trailing spaces are dropped", () => {
  const gitignore = "app.log   ";
  assert.equal(isIgnored(gitignore, "app.log"), true);
  assert.equal(isIgnored(gitignore, "app.log "), false);
});

test("[happy-2] spaces inside a line stay part of the pattern", () => {
  const gitignore = "my file.txt  ";
  assert.equal(isIgnored(gitignore, "my file.txt"), true);
  assert.equal(isIgnored(gitignore, "myfile.txt"), false);
});

test("[boundary-2] an escaped trailing space is kept", () => {
  const gitignore = "keep.txt\\ ";
  assert.equal(isIgnored(gitignore, "keep.txt "), true);
  assert.equal(isIgnored(gitignore, "keep.txt"), false);
});

test("[boundary-2] spaces before an escaped trailing space are kept too", () => {
  const gitignore = "keep.txt \\ ";
  assert.equal(isIgnored(gitignore, "keep.txt  "), true);
  assert.equal(isIgnored(gitignore, "keep.txt "), false);
  assert.equal(isIgnored(gitignore, "keep.txt"), false);
});
