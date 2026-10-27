import { test } from "node:test";
import assert from "node:assert/strict";
import { detectToolchain } from "../../src/index.js";

test("[boundary-2] version files use the first nonempty noncomment line and trim whitespace", () => {
  for (const path of [".nvmrc", ".node-version", ".python-version"]) {
    const tool = path === ".python-version" ? "python" : "nodejs";
    const result = detectToolchain([
      { path, text: "\r\n \t\r\n# comment\r\n\t # another comment\r\n \t22.12.0\t \r\n20.11.1\r\n" },
    ]);

    assert.equal(result.pins[tool], "22.12.0", path);
  }
});

test("[boundary-2] an invalid first value is not replaced by a later exact line", () => {
  for (const path of [".nvmrc", ".node-version", ".python-version"]) {
    const tool = path === ".python-version" ? "python" : "nodejs";
    const result = detectToolchain([
      { path, text: "\n# comment\nlts/*\n22.12.0\n" },
    ]);

    assert.equal(Object.hasOwn(result.pins, tool), false, path);
  }
});

test("[boundary-2] extra text on the version line invalidates the whole value", () => {
  for (const path of [".nvmrc", ".node-version", ".python-version"]) {
    const tool = path === ".python-version" ? "python" : "nodejs";
    for (const text of ["3.12.1 3.11.8", "3.12.1\t3.11.8", "3.12.1 # comment"]) {
      const result = detectToolchain([{ path, text }]);

      assert.equal(Object.hasOwn(result.pins, tool), false, `${path}: ${text}`);
    }
  }
});

test("[boundary-2] empty and comment-only version files fall through to other sources", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: " \t\r\n# no pin\r\n" },
    { path: ".node-version", text: "" },
    { path: "package.json", text: '{"engines":{"node":"22.12.0"}}' },
    { path: ".python-version", text: "# no pin\n\n" },
    { path: "runtime.txt", text: "python-3.11.4" },
  ]);

  assert.deepEqual(result.pins, { nodejs: "22.12.0", python: "3.11.4" });
});

test("[unhappy-1] aliases and ranges leave an undeclared Node pin absent", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "lts/*" },
    { path: "package.json", text: '{"engines":{"node":">=20"}}' },
  ]);

  assert.equal(Object.hasOwn(result.pins, "nodejs"), false);
  assert.deepEqual(result.conflicts, []);
});

test("[unhappy-1] no exact version is extracted from aliases ranges or malformed versions", () => {
  const invalid = [
    "", ">=22", "^3.11", "~22.12.0", "lts/*", "lts/iron", "latest", "stable", "node", "system",
    "22.x", "22.*", "22.12.0-beta.1", "22.12.0+build", "22.12.0.1", "-22", "22..12", ".22", "22.",
    "22 || 20", "20 - 22",
  ];

  for (const value of invalid) {
    const result = detectToolchain([
      { path: ".nvmrc", text: value },
      { path: ".node-version", text: value },
      { path: "package.json", text: JSON.stringify({ volta: { node: value }, engines: { node: value } }) },
      { path: ".python-version", text: value },
      { path: "runtime.txt", text: `python-${value}` },
      { path: "pyproject.toml", text: `[project]\nrequires-python = "==${value}"\n` },
      { path: "go.mod", text: `go ${value}\ntoolchain go${value}\n` },
    ]);

    assert.deepEqual(result.pins, {}, value);
    assert.deepEqual(result.conflicts, [], value);
  }
});

test("[unhappy-1] the leading-v exception applies only to Node version files and only once", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "vv22.12.0" },
    { path: ".node-version", text: "vv20.11.1" },
    { path: "package.json", text: '{"volta":{"node":"v22.12.0"},"engines":{"node":"v20.11.1"}}' },
    { path: ".python-version", text: "v3.12.1" },
    { path: "runtime.txt", text: "python-v3.11.4" },
    { path: "pyproject.toml", text: '[project]\nrequires-python = "==v3.12.1"\n' },
    { path: "go.mod", text: "go v1.22\ntoolchain gov1.22.3\n" },
  ]);

  assert.deepEqual(result.pins, {});
});

test("[unhappy-1] an unpinned tool does not suppress exact versions of other tools", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "lts/*" },
    { path: "package.json", text: '{"engines":{"node":">=20"}}' },
    { path: ".python-version", text: "3.12.1" },
    { path: "go.mod", text: "go 1.22\n" },
  ]);

  assert.deepEqual(result.pins, { python: "3.12.1", golang: "1.22" });
});

test("[unhappy-2] malformed package.json is reported while valid sources still provide pins", () => {
  const result = detectToolchain([
    { path: "package.json", text: '{"volta":{"node":"24.0.0"},' },
    { path: ".nvmrc", text: "22.12.0" },
    { path: "runtime.txt", text: "python-3.11.4" },
    { path: "go.mod", text: "go 1.22\n" },
  ]);

  assert.deepEqual(result.pins, { nodejs: "22.12.0", python: "3.11.4", golang: "1.22" });
  assert.ok(result.unreadable.includes("package.json"));
  assert.deepEqual(result.conflicts, []);
});

test("[unhappy-2] malformed JSON alone supplies no partial pin and no file text", () => {
  const result = detectToolchain([
    { path: "package.json", text: '{"engines":{"node":"22.12.0"},}' },
  ]);

  assert.deepEqual(result.pins, {});
  assert.ok(result.unreadable.includes("package.json"));
  assert.equal(Object.hasOwn(result, "toolVersions"), false);
});

test("[unhappy-2] valid JSON with no version fields is readable and supplies no pin", () => {
  const result = detectToolchain([
    { path: "package.json", text: '{"name":"example","volta":{},"engines":{}}' },
  ]);

  assert.deepEqual(result.pins, {});
  assert.deepEqual(result.unreadable, []);
});
