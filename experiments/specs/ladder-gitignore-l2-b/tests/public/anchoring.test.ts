import { test } from "node:test";
import assert from "node:assert/strict";
import { isIgnored } from "../../src/index.js";

// R5. A trailing slash matches directories only

test("[happy-5] a directory pattern ignores the directory's files", () => {
  const gitignore = "logs/";
  assert.equal(isIgnored(gitignore, "logs/app.log"), true);
  assert.equal(isIgnored(gitignore, "src/logs/app.log"), true);
});

test("[happy-5] a directory pattern does not match directories with other names", () => {
  const gitignore = "logs/";
  assert.equal(isIgnored(gitignore, "logsx/app.log"), false);
  assert.equal(isIgnored(gitignore, "src/mylogs/app.log"), false);
});

test("[boundary-7] a directory pattern does not match a file of that name", () => {
  const gitignore = "logs/";
  assert.equal(isIgnored(gitignore, "logs"), false);
  assert.equal(isIgnored(gitignore, "src/logs"), false);
});

test("[boundary-7] without a trailing slash the pattern matches a file of that name", () => {
  const gitignore = "logs";
  assert.equal(isIgnored(gitignore, "logs"), true);
  assert.equal(isIgnored(gitignore, "src/logs"), true);
});

// R6. A slash at the start or in the middle anchors a pattern

test("[happy-6] a leading slash anchors to the root", () => {
  const gitignore = "/main.c";
  assert.equal(isIgnored(gitignore, "main.c"), true);
  assert.equal(isIgnored(gitignore, "src/main.c"), false);
});

test("[happy-6] a leading slash anchors a directory name to the root", () => {
  const gitignore = "/src";
  assert.equal(isIgnored(gitignore, "src/a.c"), true);
  assert.equal(isIgnored(gitignore, "lib/src/a.c"), false);
});

test("[boundary-8] a slash in the middle also anchors", () => {
  const gitignore = "src/main.c";
  assert.equal(isIgnored(gitignore, "src/main.c"), true);
  assert.equal(isIgnored(gitignore, "lib/src/main.c"), false);
});

test("[boundary-8] a trailing slash alone does not anchor", () => {
  const gitignore = "src/";
  assert.equal(isIgnored(gitignore, "src/a.c"), true);
  assert.equal(isIgnored(gitignore, "lib/src/a.c"), true);
});

test("[happy-7] a pattern without a slash matches at any depth", () => {
  const gitignore = "main.c";
  assert.equal(isIgnored(gitignore, "main.c"), true);
  assert.equal(isIgnored(gitignore, "lib/src/main.c"), true);
});

test("[happy-7] a pattern without a slash must match the whole last component, case-sensitively", () => {
  const gitignore = "main.c";
  assert.equal(isIgnored(gitignore, "src/xmain.c"), false);
  assert.equal(isIgnored(gitignore, "Main.c"), false);
});
