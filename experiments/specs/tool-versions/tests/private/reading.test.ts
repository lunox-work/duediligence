import { test } from "node:test";
import assert from "node:assert/strict";
import { detectToolchain } from "../../src/index.js";

// boundary-2: Version files are read line by line

// Extends "[boundary-2] the first non-empty, non-comment line is the value, trimmed":
// several comments and blank lines, and a v to drop after trimming.
test("[boundary-2] .nvmrc skips several comments and blank lines and drops a v after trimming", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "# one\n# two\n\n\n# three\r\n\t v18.19.0 \t\r\n# four\n" },
  ]);
  assert.equal(result.pins.nodejs, "18.19.0");
});

// Extends "[boundary-2] .python-version is read line by line": pyenv lists several versions, one per line.
test("[boundary-2] .python-version with one version per line uses the first", () => {
  const result = detectToolchain([{ path: ".python-version", text: "3.12.1\n3.11.8\n3.10.13\n" }]);
  assert.deepEqual(result.pins, { python: "3.12.1" });
});

test("[boundary-2] .python-version drops a trailing carriage return and surrounding tabs", () => {
  const result = detectToolchain([{ path: ".python-version", text: "\t3.11.9\t\r\n" }]);
  assert.deepEqual(result.pins, { python: "3.11.9" });
});

// Extends "[boundary-2] .node-version is read line by line".
test("[boundary-2] .node-version with CRLF lines and leading spaces", () => {
  const result = detectToolchain([
    { path: ".node-version", text: "\r\n# managed by nodenv\r\n\r\n   20.18.1\r\n" },
  ]);
  assert.deepEqual(result.pins, { nodejs: "20.18.1" });
});

test("[boundary-2] a value line with no trailing newline is read", () => {
  const result = detectToolchain([{ path: ".nvmrc", text: "# node\n\n22.12.0" }]);
  assert.equal(result.pins.nodejs, "22.12.0");
});

// Extends "[boundary-2] a value with anything after the version on its line is not a version".
test("[boundary-2] .nvmrc with a second version after a space is not a version", () => {
  const result = detectToolchain([{ path: ".nvmrc", text: "22.12.0 20.11.1\n" }]);
  assert.equal("nodejs" in result.pins, false);
});

test("[boundary-2] .node-version with a trailing comment on the value line is not a version", () => {
  const result = detectToolchain([{ path: ".node-version", text: "20.11.1 # LTS\n" }]);
  assert.equal("nodejs" in result.pins, false);
});

test("[boundary-2] .python-version with a tab between two versions is not a version", () => {
  const result = detectToolchain([{ path: ".python-version", text: "3.12.1\t3.11.8\n" }]);
  assert.equal("python" in result.pins, false);
});

test("[boundary-2] a value line with trailing text falls through to the next source", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "22.12.0 20.11.1\n" },
    { path: ".node-version", text: "20.18.1\n" },
  ]);
  assert.equal(result.pins.nodejs, "20.18.1");
});

// Extends "[boundary-2] only the first value line counts, not a later one", for .python-version.
test("[boundary-2] a later exact line in .python-version does not rescue an inexact first line", () => {
  const result = detectToolchain([
    { path: ".python-version", text: "# py\nsystem\n3.12.1\n" },
    { path: "runtime.txt", text: "python-3.11.4" },
  ]);
  assert.equal(result.pins.python, "3.11.4");
});

test("[boundary-2] a version file of only comments and blank lines holds no version", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "# 22.12.0\n\n#20.11.1\n" },
    { path: ".node-version", text: "18.19.0\n" },
  ]);
  assert.equal(result.pins.nodejs, "18.19.0");
});

// unhappy-2: A file that cannot be read as its format is skipped

// Extends "[unhappy-2] invalid package.json is noted as unreadable": JSON with a trailing comma.
test("[unhappy-2] package.json with a trailing comma is unreadable and pins nothing", () => {
  const result = detectToolchain([
    { path: "package.json", text: '{ "volta": { "node": "22.12.0" }, }' },
  ]);
  assert.deepEqual(result.unreadable, ["package.json"]);
  assert.deepEqual(result.pins, {});
  assert.equal("toolVersions" in result, false);
});

test("[unhappy-2] package.json with comments is unreadable", () => {
  const result = detectToolchain([
    { path: "package.json", text: '{\n  // node\n  "engines": { "node": "22.12.0" }\n}\n' },
  ]);
  assert.ok(result.unreadable.includes("package.json"));
  assert.equal("nodejs" in result.pins, false);
});

test("[unhappy-2] an empty package.json is unreadable", () => {
  const result = detectToolchain([{ path: "package.json", text: "" }]);
  assert.ok(result.unreadable.includes("package.json"));
  assert.deepEqual(result.pins, {});
});

// Extends "[unhappy-2] other sources are still tried when package.json is invalid": the later
// .node-version and an earlier inexact .nvmrc.
test("[unhappy-2] node falls through an inexact .nvmrc to .node-version past an invalid package.json", () => {
  const result = detectToolchain([
    { path: "package.json", text: "{ name: 'app' }" },
    { path: ".nvmrc", text: "lts/iron" },
    { path: ".node-version", text: "20.11.1" },
    { path: "go.mod", text: "module example.com/app\n\ngo 1.22\n" },
  ]);
  assert.deepEqual(result.pins, { nodejs: "20.11.1", golang: "1.22" });
  assert.ok(result.unreadable.includes("package.json"));
});

test("[unhappy-2] an invalid package.json is noted even when .nvmrc already pins node", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "22.12.0" },
    { path: "package.json", text: '{"engines":{"node":"20.11.1"}' },
  ]);
  assert.equal(result.pins.nodejs, "22.12.0");
  assert.ok(result.unreadable.includes("package.json"));
  assert.deepEqual(result.conflicts, []);
});

test("[unhappy-2] an invalid package.json still leaves the file text for other tools", () => {
  const result = detectToolchain([
    { path: "package.json", text: "not json" },
    { path: "runtime.txt", text: "python-3.11.4" },
  ]);
  assert.equal(result.toolVersions, "python 3.11.4\n");
});

// Extends "[unhappy-2] a valid package.json without node fields is not unreadable".
test("[unhappy-2] valid files are never noted as unreadable", () => {
  const result = detectToolchain([
    { path: "package.json", text: JSON.stringify({ name: "app", engines: { node: ">=20" } }) },
    { path: ".nvmrc", text: "lts/*" },
    { path: ".python-version", text: "3.12.1" },
    { path: "go.mod", text: "module example.com/app\n\ngo 1.22\n" },
  ]);
  assert.deepEqual(result.unreadable, []);
});

// Extends "[unhappy-2] an invalid package.json below the root is ignored, not unreadable".
test("[unhappy-2] a nested invalid package.json is ignored while the root one is read", () => {
  const result = detectToolchain([
    { path: "packages/a/package.json", text: "{" },
    { path: "./package.json", text: "{" },
    { path: "package.json", text: JSON.stringify({ volta: { node: "20.11.1" } }) },
  ]);
  assert.deepEqual(result.unreadable, []);
  assert.deepEqual(result.pins, { nodejs: "20.11.1" });
});
