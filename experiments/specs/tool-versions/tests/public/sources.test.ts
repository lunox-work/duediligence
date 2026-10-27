import { test } from "node:test";
import assert from "node:assert/strict";
import { detectToolchain } from "../../src/index.js";
import type { RepoFile } from "../../src/index.js";

function pkg(fields: object): RepoFile {
  return { path: "package.json", text: JSON.stringify({ name: "app", ...fields }) };
}

// happy-1: Node comes from .nvmrc, then .node-version, then package.json

test("[happy-1] nodejs is pinned from .nvmrc", () => {
  const result = detectToolchain([{ path: ".nvmrc", text: "22.12.0" }]);
  assert.deepEqual(result.pins, { nodejs: "22.12.0" });
});

test("[happy-1] .nvmrc is tried before .node-version and package.json", () => {
  const result = detectToolchain([
    pkg({ volta: { node: "22.12.0" }, engines: { node: "22.12.0" } }),
    { path: ".node-version", text: "22.12.0" },
    { path: ".nvmrc", text: "22.12.0" },
  ]);
  assert.equal(result.pins.nodejs, "22.12.0");
});

test("[happy-1] nodejs is pinned from .node-version when there is no .nvmrc", () => {
  const result = detectToolchain([{ path: ".node-version", text: "20.11.1" }]);
  assert.deepEqual(result.pins, { nodejs: "20.11.1" });
});

test("[happy-1] volta.node of package.json is tried before engines.node", () => {
  const result = detectToolchain([
    pkg({ volta: { node: "22.12.0" }, engines: { node: "20.11.1" } }),
  ]);
  assert.equal(result.pins.nodejs, "22.12.0");
});

test("[happy-1] engines.node of package.json is used when it is the only source", () => {
  const result = detectToolchain([pkg({ engines: { node: "22.12.0" } })]);
  assert.deepEqual(result.pins, { nodejs: "22.12.0" });
});

test("[happy-1] one leading v is dropped in .nvmrc", () => {
  const result = detectToolchain([{ path: ".nvmrc", text: "v20.11.1" }]);
  assert.equal(result.pins.nodejs, "20.11.1");
});

test("[happy-1] one leading v is dropped in .node-version", () => {
  const result = detectToolchain([{ path: ".node-version", text: "v20.11.1" }]);
  assert.equal(result.pins.nodejs, "20.11.1");
});

test("[happy-1] only one leading v is dropped, so vv20.11.1 is not a version", () => {
  const result = detectToolchain([{ path: ".nvmrc", text: "vv20.11.1" }]);
  assert.equal("nodejs" in result.pins, false);
});

test("[happy-1] a leading v is not dropped in package.json", () => {
  const result = detectToolchain([
    pkg({ volta: { node: "v20.11.1" }, engines: { node: "v20.11.1" } }),
  ]);
  assert.equal("nodejs" in result.pins, false);
});

// happy-2: Python comes from .python-version, then runtime.txt, then pyproject.toml

test("[happy-2] python is pinned from runtime.txt", () => {
  const result = detectToolchain([{ path: "runtime.txt", text: "python-3.11.4" }]);
  assert.deepEqual(result.pins, { python: "3.11.4" });
});

test("[happy-2] .python-version is tried before runtime.txt and pyproject.toml", () => {
  const result = detectToolchain([
    { path: "pyproject.toml", text: '[project]\nname = "app"\nrequires-python = "==3.12.1"\n' },
    { path: "runtime.txt", text: "python-3.12.1" },
    { path: ".python-version", text: "3.12.1" },
  ]);
  assert.equal(result.pins.python, "3.12.1");
});

test("[happy-2] python is pinned from requires-python == in double quotes", () => {
  const result = detectToolchain([
    { path: "pyproject.toml", text: '[project]\nname = "app"\nrequires-python = "==3.12.1"\n' },
  ]);
  assert.deepEqual(result.pins, { python: "3.12.1" });
});

test("[happy-2] python is pinned from requires-python == in single quotes", () => {
  const result = detectToolchain([
    { path: "pyproject.toml", text: "[project]\nname = 'app'\nrequires-python = '==3.12.1'\n" },
  ]);
  assert.deepEqual(result.pins, { python: "3.12.1" });
});

test("[happy-2] requires-python >=3.12 is not a version", () => {
  const result = detectToolchain([
    { path: "pyproject.toml", text: '[project]\nname = "app"\nrequires-python = ">=3.12"\n' },
  ]);
  assert.equal("python" in result.pins, false);
});

test("[happy-2] requires-python ~=3.12 is not a version", () => {
  const result = detectToolchain([
    { path: "pyproject.toml", text: '[project]\nname = "app"\nrequires-python = "~=3.12"\n' },
  ]);
  assert.equal("python" in result.pins, false);
});

// happy-3: Go comes from the toolchain line of go.mod, then its go line

test("[happy-3] golang is pinned from the toolchain line of go.mod", () => {
  const result = detectToolchain([
    { path: "go.mod", text: "module example.com/app\n\ngo 1.22\n\ntoolchain go1.22.3\n" },
  ]);
  assert.deepEqual(result.pins, { golang: "1.22.3" });
});

test("[happy-3] without a toolchain line golang is pinned from the go line", () => {
  const result = detectToolchain([
    { path: "go.mod", text: "module example.com/app\n\ngo 1.22\n" },
  ]);
  assert.deepEqual(result.pins, { golang: "1.22" });
});

// boundary-1: A source that names no exact version does not stop the search

test("[boundary-1] an alias in .nvmrc falls through to engines.node", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "lts/iron" },
    pkg({ engines: { node: "22.12.0" } }),
  ]);
  assert.equal(result.pins.nodejs, "22.12.0");
});

test("[boundary-1] an empty .nvmrc falls through to .node-version", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "" },
    { path: ".node-version", text: "20.11.1" },
  ]);
  assert.equal(result.pins.nodejs, "20.11.1");
});

test("[boundary-1] a range in .python-version falls through to runtime.txt", () => {
  const result = detectToolchain([
    { path: ".python-version", text: "^3.11" },
    { path: "runtime.txt", text: "python-3.11.4" },
  ]);
  assert.equal(result.pins.python, "3.11.4");
});

// unhappy-1: A tool no source states exactly is left out

test("[unhappy-1] nodejs is left out when no source states it exactly", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "lts/*" },
    pkg({ engines: { node: ">=20" } }),
  ]);
  assert.equal("nodejs" in result.pins, false);
  assert.deepEqual(result.pins, {});
});

test("[unhappy-1] no version is taken from part of a range", () => {
  const result = detectToolchain([pkg({ engines: { node: ">=22.12.0" } })]);
  assert.equal("nodejs" in result.pins, false);
});

test("[unhappy-1] four numbers joined by . are not an exact version", () => {
  const result = detectToolchain([{ path: ".nvmrc", text: "22.12.0.1" }]);
  assert.equal("nodejs" in result.pins, false);
});

test("[unhappy-1] aliases are never pinned", () => {
  for (const alias of ["latest", "stable", "node", "system", "lts/iron"]) {
    const result = detectToolchain([{ path: ".nvmrc", text: alias }]);
    assert.equal("nodejs" in result.pins, false, alias);
  }
});
