import { test } from "node:test";
import assert from "node:assert/strict";
import { detectToolchain } from "../../src/index.js";

test("[happy-1] .nvmrc wins over every later Node source regardless of input order", () => {
  const result = detectToolchain([
    { path: "package.json", text: '{"volta":{"node":"21.7.3"},"engines":{"node":"20.11.1"}}' },
    { path: ".node-version", text: "23.1.0" },
    { path: ".nvmrc", text: "22.12.0" },
  ]);

  assert.equal(result.pins.nodejs, "22.12.0");
});

test("[happy-1] .node-version supplies Node and drops one leading v", () => {
  const result = detectToolchain([
    { path: "package.json", text: '{"volta":{"node":"18.20.0"},"engines":{"node":"16.20.2"}}' },
    { path: ".node-version", text: "v20.11.1" },
  ]);

  assert.equal(result.pins.nodejs, "20.11.1");
  assert.equal(
    detectToolchain([{ path: ".nvmrc", text: "v22.12.0" }]).pins.nodejs,
    "22.12.0",
  );
});

test("[happy-1] volta.node precedes engines.node when version files are absent", () => {
  const result = detectToolchain([
    { path: "package.json", text: '{"engines":{"node":"20.11.1"},"volta":{"node":"22.12.0"}}' },
  ]);

  assert.equal(result.pins.nodejs, "22.12.0");
});

test("[happy-1] engines.node alone accepts a one-number exact version", () => {
  const result = detectToolchain([
    { path: "package.json", text: '{"engines":{"node":"22"}}' },
  ]);

  assert.deepEqual(result.pins, { nodejs: "22" });
});

test("[happy-2] runtime.txt supplies Python ahead of pyproject.toml", () => {
  const result = detectToolchain([
    { path: "pyproject.toml", text: '[project]\nrequires-python = "==3.12.1"\n' },
    { path: "runtime.txt", text: "python-3.11.4" },
  ]);

  assert.equal(result.pins.python, "3.11.4");
});

test("[happy-2] .python-version precedes both other Python sources", () => {
  const result = detectToolchain([
    { path: "runtime.txt", text: "python-3.11.4" },
    { path: "pyproject.toml", text: '[project]\nrequires-python = "==3.12.1"\n' },
    { path: ".python-version", text: "3.13.0" },
  ]);

  assert.equal(result.pins.python, "3.13.0");
});

test("[happy-2] pyproject.toml accepts exact equality in either quote style", () => {
  for (const quote of ['"', "'"]) {
    const result = detectToolchain([
      { path: "pyproject.toml", text: `[project]\nrequires-python = ${quote}==3.12.1${quote}\n` },
    ]);

    assert.deepEqual(result.pins, { python: "3.12.1" });
  }
});

test("[happy-2] pyproject.toml requires equality rather than a range or bare version", () => {
  for (const value of [">=3.12", "~=3.12", "3.12.1", "==3.12.*", "==3.12.1, <4"]) {
    const result = detectToolchain([
      { path: "pyproject.toml", text: `[project]\nrequires-python = "${value}"\n` },
    ]);

    assert.equal(Object.hasOwn(result.pins, "python"), false, value);
  }
});

test("[happy-3] the go.mod toolchain version wins over its go version", () => {
  const result = detectToolchain([
    { path: "go.mod", text: "module example.com/demo\n\ngo 1.22\n\ntoolchain go1.22.3\n" },
  ]);

  assert.equal(result.pins.golang, "1.22.3");
});

test("[happy-3] go.mod without a toolchain preserves the two-number go version", () => {
  const result = detectToolchain([
    { path: "go.mod", text: "module example.com/demo\n\ngo 1.22\n" },
  ]);

  assert.deepEqual(result.pins, { golang: "1.22" });
});

test("[happy-3] a toolchain without an exact version falls back to the go line", () => {
  const result = detectToolchain([
    { path: "go.mod", text: "module example.com/demo\n\ngo 1.22\ntoolchain default\n" },
  ]);

  assert.equal(result.pins.golang, "1.22");
});

test("[boundary-1] an alias in .nvmrc falls through to engines.node", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "lts/iron" },
    { path: "package.json", text: '{"engines":{"node":"22.12.0"}}' },
  ]);

  assert.equal(result.pins.nodejs, "22.12.0");
  assert.deepEqual(result.conflicts, []);
});

test("[boundary-1] multiple unusable sources are skipped for each tool", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "latest" },
    { path: ".node-version", text: ">=20" },
    { path: "package.json", text: '{"volta":{"node":"lts/*"},"engines":{"node":"22.12.0"}}' },
    { path: ".python-version", text: "system" },
    { path: "runtime.txt", text: "python->=3.11" },
    { path: "pyproject.toml", text: '[project]\nrequires-python = "==3.12.1"\n' },
    { path: "go.mod", text: "go 1.22\ntoolchain go1.22rc1\n" },
  ]);

  assert.deepEqual(result.pins, { nodejs: "22.12.0", python: "3.12.1", golang: "1.22" });
  assert.deepEqual(result.conflicts, []);
});

test("[boundary-1] nested higher-priority files do not override root sources", () => {
  const result = detectToolchain([
    { path: "nested/.nvmrc", text: "24.0.0" },
    { path: "./.node-version", text: "23.0.0" },
    { path: "package.json", text: '{"engines":{"node":"22.12.0"}}' },
    { path: "nested/.python-version", text: "3.13.0" },
    { path: "runtime.txt", text: "python-3.11.4" },
    { path: "nested/go.mod", text: "go 1.24\n" },
    { path: "go.mod", text: "go 1.22\n" },
  ]);

  assert.deepEqual(result.pins, { nodejs: "22.12.0", python: "3.11.4", golang: "1.22" });
  assert.deepEqual(result.conflicts, []);
});
