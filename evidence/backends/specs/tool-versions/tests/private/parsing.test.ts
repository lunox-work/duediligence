import { test } from "node:test";
import assert from "node:assert/strict";
import { detectToolchain } from "../../src/index.js";
import type { RepoFile } from "../../src/index.js";

function declarations(value: string): RepoFile[] {
  return [
    { path: ".nvmrc", text: value },
    { path: ".node-version", text: value },
    { path: "package.json", text: JSON.stringify({ volta: { node: value }, engines: { node: value } }) },
    { path: ".python-version", text: value },
    { path: "runtime.txt", text: `python-${value}` },
    { path: "pyproject.toml", text: `[project]\nrequires-python = "==${value}"\n` },
    { path: "go.mod", text: `go ${value}\ntoolchain go${value}\n` },
  ];
}

// Extends public: version files use the first nonempty noncomment line and trim whitespace.
test("[boundary-2] hundreds of comments and blank lines precede a trimmed final value", () => {
  for (const path of [".nvmrc", ".node-version", ".python-version"]) {
    const tool = path === ".python-version" ? "python" : "nodejs";
    const prefix = Array.from({ length: 260 }, (_, i) => `\t# comment ${i} 91.92.93\r\n \t\r\n`).join("");
    const result = detectToolchain([{ path, text: `${prefix}\t 7.123.456 \t\r` }]);
    assert.equal(result.pins[tool], "7.123.456", path);
  }
});

// Extends public: an invalid first value is not replaced by a later exact line.
test("[boundary-2] invalid first lines force another source rather than a later line in the same file", () => {
  for (const path of [".nvmrc", ".node-version", ".python-version"]) {
    const python = path === ".python-version";
    const fallback = python
      ? { path: "runtime.txt", text: "python-3.9.21" }
      : { path: "package.json", text: '{"engines":{"node":"18.19.9"}}' };
    for (const first of [">=7.123.456", "7.123.456 # pin", "vv7.123.456"]) {
      const result = detectToolchain([{ path, text: `# header\r\n${first}\r\n7.123.456\r\n8.9.10\r\n` }, fallback]);
      assert.equal(result.pins[python ? "python" : "nodejs"], python ? "3.9.21" : "18.19.9", `${path}: ${first}`);
      assert.deepEqual(result.conflicts, []);
    }
  }
});

// Extends public: extra text on the version line invalidates the whole value.
test("[boundary-2] same-line suffixes and prefixes never become version-file pins", () => {
  for (const path of [".nvmrc", ".node-version", ".python-version"]) {
    for (const value of ["7.123.456#note", "7.123.456;", "7.123.456 / 8.9.10", "version=7.123.456", "7.123.456\t# note", '"7.123.456"']) {
      const result = detectToolchain([{ path, text: `${value}\n9.8.7\n` }]);
      assert.deepEqual(result.pins, {}, `${path}: ${value}`);
    }
  }
});

// Extends public: empty and comment-only version files fall through to other sources.
test("[boundary-2] long comment-only files permit Volta and TOML fallbacks", () => {
  const empty = " \t\r\n\t# deliberately unpinned\r\n".repeat(180);
  const result = detectToolchain([
    { path: ".nvmrc", text: empty },
    { path: ".node-version", text: empty },
    { path: "package.json", text: '{"volta":{"node":"23.14"}}' },
    { path: ".python-version", text: empty },
    { path: "pyproject.toml", text: "[project]\nrequires-python = '==3.13.11'\n" },
  ]);
  assert.deepEqual(result.pins, { nodejs: "23.14", python: "3.13.11" });
  assert.deepEqual(result.conflicts, []);
});

// Extends public: aliases and ranges leave an undeclared Node pin absent.
test("[unhappy-1] four unusable Node sources do not extract digits from an LTS alias", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "lts/24" },
    { path: ".node-version", text: "23.x" },
    { path: "package.json", text: '{"volta":{"node":"^25.2.1"},"engines":{"node":"24.1.0 - 26.0.0"}}' },
  ]);
  assert.equal(Object.hasOwn(result.pins, "nodejs"), false);
  assert.deepEqual(result.conflicts, []);
  assert.equal(Object.hasOwn(result, "toolVersions"), false);
});

// Extends public: no exact version is extracted from aliases ranges or malformed versions.
test("[unhappy-1] exact grammar rejects exponents nondecimal digits punctuation and extra components everywhere", () => {
  for (const value of [
    "+24", "24e1", "0x18", "NaN", "Infinity", "24/1", "24,1", "24_1", "24..1",
    "24.1.2.3.4", "24.1.2-rc9", "24.1.2+sha.123", "24.1.2foo", "foo24.1.2",
    "２４.１.２", "٢٤.١.٢", "24.1.*", "24.1.X", "24|25", "(24.1.2)",
  ]) {
    const result = detectToolchain(declarations(value));
    assert.deepEqual(result.pins, {}, value);
    assert.deepEqual(result.conflicts, [], value);
    assert.equal(Object.hasOwn(result, "toolVersions"), false, value);
  }
});

// Extends public: the leading-v exception applies only to Node version files and only once.
test("[unhappy-1] uppercase and repeated v are not stripped in any source", () => {
  for (const value of ["V24.13.7", "vvv24.13.7", "vV24.13.7"]) {
    assert.deepEqual(detectToolchain(declarations(value)).pins, {}, value);
  }
});

test("[unhappy-1] a single v in non-Node-file sources cannot supply any tool", () => {
  const result = detectToolchain(declarations("v7.123.456").filter((file) => file.path !== ".nvmrc" && file.path !== ".node-version"));
  assert.deepEqual(result.pins, {});
  assert.deepEqual(result.conflicts, []);
});

// Extends public: an unpinned tool does not suppress exact versions of other tools.
test("[unhappy-1] Python and Go can independently be absent while other tools remain pinned", () => {
  const noPython = detectToolchain([
    { path: ".nvmrc", text: "v24.13.7" },
    { path: ".python-version", text: "3.13.x" },
    { path: "runtime.txt", text: "python-latest" },
    { path: "pyproject.toml", text: '[project]\nrequires-python = ">=3.13"\n' },
    { path: "go.mod", text: "go 1.24.8\n" },
  ]);
  assert.deepEqual(noPython.pins, { nodejs: "24.13.7", golang: "1.24.8" });
  assert.equal(Object.hasOwn(noPython.pins, "python"), false);
  const noGo = detectToolchain([
    { path: "package.json", text: '{"volta":{"node":"23.14"}}' },
    { path: "runtime.txt", text: "python-3.13.11" },
    { path: "go.mod", text: "go 1.25rc2\ntoolchain go1.25.1-custom\n" },
  ]);
  assert.deepEqual(noGo.pins, { nodejs: "23.14", python: "3.13.11" });
  assert.equal(Object.hasOwn(noGo.pins, "golang"), false);
});

// Extends public: malformed package.json is reported while valid sources still provide pins.
test("[unhappy-2] invalid JSON is diagnosed even after the preferred Node pin has been found", () => {
  for (const text of [
    '{"engines":{"node":"99.1.2"}} trailing',
    '{/* comment */"volta":{"node":"99.1.2"}}',
    "{'engines':{'node':'99.1.2'}}",
    '{"engines":{"node":"99.1.2"},"missing":}',
  ]) {
    const result = detectToolchain([
      { path: ".node-version", text: "v19.17.9" },
      { path: "package.json", text },
      { path: "pyproject.toml", text: '[project]\nrequires-python = "==3.9.21"\n' },
      { path: "go.mod", text: "toolchain go1.23.12\n" },
    ]);
    assert.deepEqual(result.pins, { nodejs: "19.17.9", python: "3.9.21", golang: "1.23.12" });
    assert.ok(result.unreadable.includes("package.json"), text);
    assert.deepEqual(result.conflicts, []);
  }
});

// Extends public: malformed JSON alone supplies no partial pin and no file text.
test("[unhappy-2] truncated and empty JSON never yield a pin from otherwise recognizable fields", () => {
  for (const text of ["", "{", '{"volta":{"node":"24.13.7"}', '{"engines":{"node":"19.17.9"}}\n{}']) {
    const result = detectToolchain([{ path: "package.json", text }]);
    assert.deepEqual(result.pins, {}, text);
    assert.deepEqual(result.conflicts, [], text);
    assert.ok(result.unreadable.includes("package.json"), text);
    assert.equal(Object.hasOwn(result, "toolVersions"), false, text);
  }
});

// Extends public: valid JSON with no version fields is readable and supplies no pin.
test("[unhappy-2] unrelated JSON version fields and nested package objects do not declare Node", () => {
  const text = JSON.stringify({
    version: "24.13.7", node: "23.14.1", volta: { npm: "10.8.9" }, engines: { npm: "10.9.1" },
    dependencies: { node: "22.14.8" }, nested: { volta: { node: "21.9.7" }, engines: { node: "20.9.7" } },
  });
  const result = detectToolchain([{ path: "package.json", text }]);
  assert.deepEqual(result.pins, {});
  assert.deepEqual(result.unreadable, []);
  assert.equal(Object.hasOwn(result, "toolVersions"), false);
});

test("[happy-1] JSON escapes are decoded before looking up fields and validating versions", () => {
  const result = detectToolchain([{
    path: "package.json",
    text: '{"volta":{"n\\u006fde":"1\\u0039.17.9"},"engines":{"node":"24.13.7"}}',
  }]);
  assert.equal(result.pins.nodejs, "19.17.9");
  assert.deepEqual(result.unreadable, []);
});

test("[happy-4] exact versions have no component-width or machine-integer limit", () => {
  const version = "123456789012345678901234567890.98765432109876543210.42";
  for (const file of declarations(version)) {
    const tool = [".nvmrc", ".node-version", "package.json"].includes(file.path)
      ? "nodejs" : file.path === "go.mod" ? "golang" : "python";
    const result = detectToolchain([file]);
    assert.deepEqual(result.pins, { [tool]: version }, file.path);
    assert.equal(result.toolVersions, `${tool} ${version}\n`, file.path);
  }
});

test("[happy-4] zero is a whole-number version and does not become a missing value", () => {
  const result = detectToolchain([
    { path: "package.json", text: '{"volta":{"node":"0"}}' },
    { path: "pyproject.toml", text: '[project]\nrequires-python = "==0.0"\n' },
    { path: "go.mod", text: "go 0.0.0\n" },
  ]);
  assert.deepEqual(result.pins, { nodejs: "0", python: "0.0", golang: "0.0.0" });
  assert.equal(result.toolVersions, "nodejs 0\npython 0.0\ngolang 0.0.0\n");
});
