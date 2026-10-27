import { test } from "node:test";
import assert from "node:assert/strict";
import { detectToolchain } from "../../src/index.js";

test("[boundary-3] a conflict reports the chosen and ignored versions with their source files", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "22.12.0" },
    { path: "package.json", text: '{"engines":{"node":"20.11.1"}}' },
  ]);

  assert.equal(result.pins.nodejs, "22.12.0");
  assert.deepEqual(result.conflicts, [{
    tool: "nodejs",
    chosen: { version: "22.12.0", source: ".nvmrc" },
    ignored: [{ version: "20.11.1", source: "package.json" }],
  }]);
});

test("[boundary-3] matching versions including a normalized v do not conflict", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "v22.12.0" },
    { path: ".node-version", text: "22.12.0" },
    { path: "package.json", text: '{"volta":{"node":"22.12.0"},"engines":{"node":"22.12.0"}}' },
    { path: ".python-version", text: "3.12.1" },
    { path: "runtime.txt", text: "python-3.12.1" },
    { path: "pyproject.toml", text: '[project]\nrequires-python = "==3.12.1"\n' },
    { path: "go.mod", text: "go 1.22.3\ntoolchain go1.22.3\n" },
  ]);

  assert.deepEqual(result.pins, { nodejs: "22.12.0", python: "3.12.1", golang: "1.22.3" });
  assert.deepEqual(result.conflicts, []);
});

test("[boundary-3] sources without exact versions are excluded from a conflict", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "22.12.0" },
    { path: ".node-version", text: "lts/*" },
    { path: "package.json", text: '{"volta":{"node":"^21"},"engines":{"node":"20.11.1"}}' },
  ]);

  assert.deepEqual(result.conflicts, [{
    tool: "nodejs",
    chosen: { version: "22.12.0", source: ".nvmrc" },
    ignored: [{ version: "20.11.1", source: "package.json" }],
  }]);
});

test("[boundary-3] all differing later versions are grouped in one conflict per tool", () => {
  const result = detectToolchain([
    { path: "package.json", text: '{"engines":{"node":"18.20.0"}}' },
    { path: ".node-version", text: "20.11.1" },
    { path: ".nvmrc", text: "22.12.0" },
    { path: "runtime.txt", text: "python-3.11.4" },
    { path: ".python-version", text: "3.12.1" },
    { path: "go.mod", text: "go 1.22\ntoolchain go1.22.3\n" },
  ]);

  assert.equal(result.conflicts.length, 3);
  const node = result.conflicts.find((conflict) => conflict.tool === "nodejs");
  const python = result.conflicts.find((conflict) => conflict.tool === "python");
  const go = result.conflicts.find((conflict) => conflict.tool === "golang");
  assert.ok(node);
  assert.ok(python);
  assert.ok(go);
  if (!node || !python || !go) throw new Error("Expected one conflict for each tool");

  assert.deepEqual(node.chosen, { version: "22.12.0", source: ".nvmrc" });
  assert.deepEqual([...node.ignored].sort((a, b) => a.source < b.source ? -1 : a.source > b.source ? 1 : 0), [
    { version: "20.11.1", source: ".node-version" },
    { version: "18.20.0", source: "package.json" },
  ]);
  assert.deepEqual(python, {
    tool: "python",
    chosen: { version: "3.12.1", source: ".python-version" },
    ignored: [{ version: "3.11.4", source: "runtime.txt" }],
  });
  assert.deepEqual(go, {
    tool: "golang",
    chosen: { version: "1.22.3", source: "go.mod" },
    ignored: [{ version: "1.22", source: "go.mod" }],
  });
});

test("[happy-4] file text lists all tools in the specified order with final newlines", () => {
  const result = detectToolchain([
    { path: "go.mod", text: "go 1.22\ntoolchain go1.22.3\n" },
    { path: ".python-version", text: "3.12.1" },
    { path: ".nvmrc", text: "22.12.0" },
  ]);

  assert.equal(result.toolVersions, "nodejs 22.12.0\npython 3.12.1\ngolang 1.22.3\n");
});

test("[happy-4] each subset emits only its pinned tools in the specified order", () => {
  const files = [
    { path: ".nvmrc", text: "22.12.0" },
    { path: ".python-version", text: "3.12.1" },
    { path: "go.mod", text: "go 1.22\n" },
  ];
  const lines = ["nodejs 22.12.0\n", "python 3.12.1\n", "golang 1.22\n"];

  for (let mask = 1; mask < 8; mask++) {
    const subset = files.filter((_, index) => (mask & (1 << index)) !== 0).reverse();
    const expected = lines.filter((_, index) => (mask & (1 << index)) !== 0).join("");

    assert.equal(detectToolchain(subset).toolVersions, expected, `subset ${mask}`);
  }
});

test("[happy-4] one- and two-number versions are written without adding components", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "22" },
    { path: ".python-version", text: "3.12" },
    { path: "go.mod", text: "go 1.22\n" },
  ]);

  assert.deepEqual(result.pins, { nodejs: "22", python: "3.12", golang: "1.22" });
  assert.equal(result.toolVersions, "nodejs 22\npython 3.12\ngolang 1.22\n");
});

test("[boundary-4] an empty repository omits the file-text property entirely", () => {
  const result = detectToolchain([]);

  assert.deepEqual(result.pins, {});
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.unreadable, []);
  assert.equal(Object.hasOwn(result, "toolVersions"), false);
});

test("[boundary-4] nonexact declarations omit the file-text property entirely", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "latest" },
    { path: ".python-version", text: "system" },
    { path: "go.mod", text: "module example.com/demo\n" },
  ]);

  assert.deepEqual(result.pins, {});
  assert.equal(Object.hasOwn(result, "toolVersions"), false);
});

test("[boundary-4] nested files and unrelated root files cannot produce a file or diagnostics", () => {
  const result = detectToolchain([
    { path: "nested/.nvmrc", text: "22.12.0" },
    { path: "nested/.python-version", text: "3.12.1" },
    { path: "nested/go.mod", text: "go 1.22\n" },
    { path: "nested/package.json", text: "{invalid json" },
    { path: "README.md", text: "nodejs 22.12.0\npython 3.12.1\ngolang 1.22\n" },
  ]);

  assert.deepEqual(result.pins, {});
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.unreadable, []);
  assert.equal(Object.hasOwn(result, "toolVersions"), false);
});
