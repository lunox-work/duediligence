import { test } from "node:test";
import assert from "node:assert/strict";
import { detectToolchain } from "../../src/index.js";
import type { RepoFile } from "../../src/index.js";

function pkg(fields: object): RepoFile {
  return { path: "package.json", text: JSON.stringify({ name: "app", version: "1.0.0", ...fields }, null, 2) };
}

function pyproject(requiresLine: string): RepoFile {
  return {
    path: "pyproject.toml",
    text: [
      "[build-system]",
      'requires = ["setuptools>=61"]',
      'build-backend = "setuptools.build_meta"',
      "",
      "[project]",
      'name = "app"',
      'version = "0.1.0"',
      'description = "An app"',
      requiresLine,
      'dependencies = ["requests>=2"]',
      "",
    ].join("\n"),
  };
}

// happy-1: Node comes from .nvmrc, then .node-version, then package.json

// Extends "[happy-1] .nvmrc is tried before .node-version and package.json":
// there every source held the same version, so any source passed.
test("[happy-1] .nvmrc wins over every other node source when all differ", () => {
  const result = detectToolchain([
    pkg({ volta: { node: "20.18.1" }, engines: { node: "23.4.0" } }),
    { path: ".node-version", text: "21.7.3" },
    { path: ".nvmrc", text: "18.19.0" },
  ]);
  assert.equal(result.pins.nodejs, "18.19.0");
});

// Extends "[happy-1] nodejs is pinned from .node-version when there is no .nvmrc".
test("[happy-1] .node-version wins over both package.json fields", () => {
  const result = detectToolchain([
    pkg({ volta: { node: "22.12.0" }, engines: { node: "23.4.0" } }),
    { path: ".node-version", text: "18.20.5" },
  ]);
  assert.equal(result.pins.nodejs, "18.20.5");
});

// Extends "[happy-1] volta.node of package.json is tried before engines.node",
// with the older version in volta so a "highest version" shortcut fails.
test("[happy-1] volta.node wins over engines.node even when it is lower", () => {
  const result = detectToolchain([
    pkg({ engines: { node: "22.12.0" }, volta: { node: "18.19.0" } }),
  ]);
  assert.equal(result.pins.nodejs, "18.19.0");
});

// Extends "[happy-1] engines.node of package.json is used when it is the only source".
test("[happy-1] volta.node alone pins nodejs", () => {
  const result = detectToolchain([pkg({ volta: { node: "20.11.1", npm: "10.2.4" } })]);
  assert.deepEqual(result.pins, { nodejs: "20.11.1" });
});

test("[happy-1] engines.node with one or two numbers is pinned as written", () => {
  const two = detectToolchain([pkg({ engines: { node: "22.12" } })]);
  assert.deepEqual(two.pins, { nodejs: "22.12" });
  const one = detectToolchain([pkg({ engines: { node: "22", npm: ">=10" } })]);
  assert.deepEqual(one.pins, { nodejs: "22" });
});

// Extends "[happy-1] one leading v is dropped in .nvmrc".
test("[happy-1] a leading v is dropped from a one- and two-number version", () => {
  assert.equal(detectToolchain([{ path: ".nvmrc", text: "v22" }]).pins.nodejs, "22");
  assert.equal(detectToolchain([{ path: ".node-version", text: "v18.19" }]).pins.nodejs, "18.19");
});

// Extends "[happy-1] a leading v is not dropped in package.json": engines alone.
test("[happy-1] a leading v in engines.node alone is not a version", () => {
  const result = detectToolchain([pkg({ engines: { node: "v22.12.0" } })]);
  assert.deepEqual(result.pins, {});
});

test("[happy-1] a leading v in .python-version is not dropped", () => {
  const result = detectToolchain([{ path: ".python-version", text: "v3.12.1" }]);
  assert.equal("python" in result.pins, false);
});

test("[happy-1] a v alone in .nvmrc is not a version", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "v" },
    { path: ".node-version", text: "20.11.1" },
  ]);
  assert.equal(result.pins.nodejs, "20.11.1");
});

test("[happy-1] a node pin from the root ignores node files below it", () => {
  const result = detectToolchain([
    { path: "web/.nvmrc", text: "18.19.0" },
    { path: "./.nvmrc", text: "16.20.2" },
    { path: "api/package.json", text: JSON.stringify({ volta: { node: "16.20.2" } }) },
    { path: ".node-version", text: "22.12.0" },
  ]);
  assert.deepEqual(result.pins, { nodejs: "22.12.0" });
});

// happy-2: Python comes from .python-version, then runtime.txt, then pyproject.toml

// Extends "[happy-2] .python-version is tried before runtime.txt and pyproject.toml":
// there all three held the same version.
test("[happy-2] .python-version wins over the other python sources when all differ", () => {
  const result = detectToolchain([
    pyproject('requires-python = "==3.13.1"'),
    { path: "runtime.txt", text: "python-3.12.8" },
    { path: ".python-version", text: "3.10.13" },
  ]);
  assert.equal(result.pins.python, "3.10.13");
});

test("[happy-2] runtime.txt wins over pyproject.toml", () => {
  const result = detectToolchain([
    pyproject('requires-python = "==3.13.1"'),
    { path: "runtime.txt", text: "python-3.9.18" },
  ]);
  assert.equal(result.pins.python, "3.9.18");
});

// Extends "[happy-2] python is pinned from runtime.txt".
test("[happy-2] runtime.txt with a two-number version is pinned as written", () => {
  const result = detectToolchain([{ path: "runtime.txt", text: "python-3.12" }]);
  assert.deepEqual(result.pins, { python: "3.12" });
});

test("[happy-2] runtime.txt without the python- prefix is not a version", () => {
  const result = detectToolchain([{ path: "runtime.txt", text: "3.11.4" }]);
  assert.equal("python" in result.pins, false);
});

test("[happy-2] runtime.txt with a range after python- is not a version", () => {
  const result = detectToolchain([{ path: "runtime.txt", text: "python-3.x" }]);
  assert.equal("python" in result.pins, false);
});

// Extends "[happy-2] python is pinned from requires-python == in double quotes".
test("[happy-2] requires-python == with a two-number version is pinned as written", () => {
  const result = detectToolchain([pyproject('requires-python = "==3.12"')]);
  assert.deepEqual(result.pins, { python: "3.12" });
});

test("[happy-2] requires-python == with a wildcard is not a version", () => {
  const result = detectToolchain([pyproject('requires-python = "==3.12.*"')]);
  assert.equal("python" in result.pins, false);
});

test("[happy-2] requires-python == with a further clause is not a version", () => {
  const result = detectToolchain([pyproject('requires-python = "==3.12.1,<4"')]);
  assert.equal("python" in result.pins, false);
});

// Extends "[happy-2] requires-python >=3.12 is not a version": a full version after a range operator.
test("[happy-2] requires-python with >=, <= or ~= and a full version is not a version", () => {
  for (const spec of [">=3.12.1", "<=3.12.1", "~=3.12.1", "!=3.12.1", "3.12.1"]) {
    const result = detectToolchain([pyproject(`requires-python = "${spec}"`)]);
    assert.equal("python" in result.pins, false, spec);
  }
});

test("[happy-2] a pyproject.toml without requires-python pins no python", () => {
  const result = detectToolchain([pyproject('readme = "README.md"')]);
  assert.deepEqual(result.pins, {});
});

// happy-3: Go comes from the toolchain line of go.mod, then its go line

// Extends "[happy-3] golang is pinned from the toolchain line of go.mod".
test("[happy-3] the toolchain line wins even when it comes before the go line", () => {
  const result = detectToolchain([
    {
      path: "go.mod",
      text: "module example.com/app\n\ntoolchain go1.23.4\n\ngo 1.21.0\n\nrequire golang.org/x/mod v0.14.0\n",
    },
  ]);
  assert.deepEqual(result.pins, { golang: "1.23.4" });
});

test("[happy-3] go.mod with a require block still pins from the toolchain line", () => {
  const result = detectToolchain([
    {
      path: "go.mod",
      text: [
        "module example.com/app",
        "",
        "go 1.21.0",
        "",
        "toolchain go1.21.6",
        "",
        "require (",
        "\tgolang.org/x/sync v0.6.0",
        "\tgolang.org/x/tools v0.17.0",
        ")",
        "",
      ].join("\n"),
    },
  ]);
  assert.deepEqual(result.pins, { golang: "1.21.6" });
});

// Extends "[happy-3] without a toolchain line golang is pinned from the go line".
test("[happy-3] a three-number go line is pinned as written", () => {
  const result = detectToolchain([
    { path: "go.mod", text: "module example.com/app\n\ngo 1.22.0\n\nrequire golang.org/x/mod v0.14.0\n" },
  ]);
  assert.deepEqual(result.pins, { golang: "1.22.0" });
});

test("[happy-3] a toolchain line with no exact version falls back to the go line", () => {
  const result = detectToolchain([
    { path: "go.mod", text: "module example.com/app\n\ngo 1.21.5\n\ntoolchain default\n" },
  ]);
  assert.deepEqual(result.pins, { golang: "1.21.5" });
});

test("[happy-3] a go.mod below the root is ignored when the root has one", () => {
  const result = detectToolchain([
    { path: "tools/go.mod", text: "module example.com/tools\n\ngo 1.20\n\ntoolchain go1.20.14\n" },
    { path: "go.mod", text: "module example.com/app\n\ngo 1.22\n" },
  ]);
  assert.deepEqual(result.pins, { golang: "1.22" });
});

// boundary-1: A source that names no exact version does not stop the search

// Extends "[boundary-1] an alias in .nvmrc falls through to engines.node":
// every non-exact source before the last one is skipped.
test("[boundary-1] node falls through .nvmrc, .node-version and volta.node to engines.node", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "lts/*" },
    { path: ".node-version", text: "latest" },
    pkg({ volta: { node: "^22" }, engines: { node: "20.11.1" } }),
  ]);
  assert.equal(result.pins.nodejs, "20.11.1");
});

test("[boundary-1] a range in .nvmrc falls through to volta.node, not engines.node", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: ">=22" },
    pkg({ volta: { node: "18.19.0" }, engines: { node: "22.12.0" } }),
  ]);
  assert.equal(result.pins.nodejs, "18.19.0");
});

// Extends "[boundary-1] a range in .python-version falls through to runtime.txt".
test("[boundary-1] python falls through .python-version and runtime.txt to pyproject.toml", () => {
  const result = detectToolchain([
    { path: ".python-version", text: "system" },
    { path: "runtime.txt", text: "python-3.x" },
    pyproject('requires-python = "==3.11.9"'),
  ]);
  assert.equal(result.pins.python, "3.11.9");
});

test("[boundary-1] an empty .python-version falls through to pyproject.toml", () => {
  const result = detectToolchain([
    { path: ".python-version", text: "" },
    pyproject("requires-python = '==3.12.1'"),
  ]);
  assert.equal(result.pins.python, "3.12.1");
});

test("[boundary-1] an alias in .node-version falls through to package.json", () => {
  for (const alias of ["node", "stable", "system", "lts/iron"]) {
    const result = detectToolchain([
      { path: ".node-version", text: alias },
      pkg({ engines: { node: "22.12.0" } }),
    ]);
    assert.equal(result.pins.nodejs, "22.12.0", alias);
  }
});

// unhappy-1: A tool no source states exactly is left out

// Extends "[unhappy-1] nodejs is left out when no source states it exactly": every node source non-exact.
test("[unhappy-1] nodejs is left out when all four node sources are inexact", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "lts/iron" },
    { path: ".node-version", text: "^20" },
    pkg({ volta: { node: "latest" }, engines: { node: ">=20 <23" } }),
  ]);
  assert.deepEqual(result.pins, {});
});

// Extends "[unhappy-1] no version is taken from part of a range".
test("[unhappy-1] no node version is taken from part of any range", () => {
  for (const range of ["^22.12.0", "~22.12.0", "22.x", "22.12.x", "22.12.0 || 20.11.1", "20.11.1 - 22.12.0", "=22.12.0", "<23.0.0", "22.12.0-rc.1", "*"]) {
    const result = detectToolchain([pkg({ engines: { node: range } })]);
    assert.equal("nodejs" in result.pins, false, range);
  }
});

test("[unhappy-1] no node version is guessed from an inexact .nvmrc", () => {
  for (const value of ["22.", ".22", "22..1", "22.x", "lts/jod", "~22.12.0", "22.12.0.1.2"]) {
    const result = detectToolchain([{ path: ".nvmrc", text: value }]);
    assert.equal("nodejs" in result.pins, false, value);
  }
});

test("[unhappy-1] python is left out when no python source states it exactly", () => {
  const result = detectToolchain([
    { path: ".python-version", text: "3.12-dev" },
    { path: "runtime.txt", text: "python-3.12.x" },
    pyproject('requires-python = ">=3.12.1"'),
  ]);
  assert.deepEqual(result.pins, {});
});

test("[unhappy-1] a python version file naming another implementation is not a version", () => {
  const result = detectToolchain([{ path: ".python-version", text: "pypy3.10-7.3.12" }]);
  assert.equal("python" in result.pins, false);
});

test("[unhappy-1] golang is left out when go.mod states no exact version", () => {
  const result = detectToolchain([
    { path: "go.mod", text: "module example.com/app\n\nrequire golang.org/x/mod v0.14.0\n" },
  ]);
  assert.deepEqual(result.pins, {});
});

test("[unhappy-1] golang is left out when the go line is a prerelease", () => {
  const result = detectToolchain([{ path: "go.mod", text: "module example.com/app\n\ngo 1.21rc1\n" }]);
  assert.equal("golang" in result.pins, false);
});

test("[unhappy-1] a tool left out does not stop the others from being pinned", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "lts/*" },
    { path: ".python-version", text: "3.12.1" },
    { path: "go.mod", text: "module example.com/app\n\ngo 1.22\n" },
  ]);
  assert.deepEqual(result.pins, { python: "3.12.1", golang: "1.22" });
});
