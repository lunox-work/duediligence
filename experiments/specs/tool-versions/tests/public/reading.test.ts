import { test } from "node:test";
import assert from "node:assert/strict";
import { detectToolchain } from "../../src/index.js";

// boundary-2: Version files are read line by line

test("[boundary-2] the first non-empty, non-comment line is the value, trimmed", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "# pinned for CI\r\n\r\n \t22.12.0\t \r\n20.11.1\r\n" },
  ]);
  assert.equal(result.pins.nodejs, "22.12.0");
});

test("[boundary-2] .python-version is read line by line", () => {
  const result = detectToolchain([
    { path: ".python-version", text: "\n# project python\n  3.12.1\n" },
  ]);
  assert.equal(result.pins.python, "3.12.1");
});

test("[boundary-2] .node-version is read line by line", () => {
  const result = detectToolchain([
    { path: ".node-version", text: "# node\n\nv20.11.1\r\n" },
  ]);
  assert.equal(result.pins.nodejs, "20.11.1");
});

test("[boundary-2] a value with anything after the version on its line is not a version", () => {
  const result = detectToolchain([{ path: ".python-version", text: "3.12.1 3.11.8\n" }]);
  assert.equal("python" in result.pins, false);
});

test("[boundary-2] only the first value line counts, not a later one", () => {
  const result = detectToolchain([{ path: ".nvmrc", text: "lts/iron\n22.12.0\n" }]);
  assert.equal("nodejs" in result.pins, false);
});

// unhappy-2: A file that cannot be read as its format is skipped

test("[unhappy-2] invalid package.json is noted as unreadable", () => {
  const result = detectToolchain([
    { path: "package.json", text: '{ "engines": { "node": "22.12.0" ' },
  ]);
  assert.ok(result.unreadable.includes("package.json"));
  assert.equal("nodejs" in result.pins, false);
});

test("[unhappy-2] other sources are still tried when package.json is invalid", () => {
  const result = detectToolchain([
    { path: "package.json", text: "not json" },
    { path: ".nvmrc", text: "22.12.0" },
    { path: ".python-version", text: "3.12.1" },
  ]);
  assert.deepEqual(result.pins, { nodejs: "22.12.0", python: "3.12.1" });
  assert.ok(result.unreadable.includes("package.json"));
});

test("[unhappy-2] a valid package.json without node fields is not unreadable", () => {
  const result = detectToolchain([
    { path: "package.json", text: '{ "name": "app" }' },
  ]);
  assert.equal(result.unreadable.includes("package.json"), false);
});

test("[unhappy-2] an invalid package.json below the root is ignored, not unreadable", () => {
  const result = detectToolchain([
    { path: "packages/web/package.json", text: "not json" },
    { path: "packages/web/.nvmrc", text: "22.12.0" },
  ]);
  assert.deepEqual(result.unreadable, []);
  assert.deepEqual(result.pins, {});
});
