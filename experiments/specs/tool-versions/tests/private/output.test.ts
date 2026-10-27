import { test } from "node:test";
import assert from "node:assert/strict";
import { detectToolchain } from "../../src/index.js";
import type { RepoFile, SourcedVersion } from "../../src/index.js";

function pkg(fields: object): RepoFile {
  return { path: "package.json", text: JSON.stringify({ name: "app", ...fields }) };
}

function byVersionAndSource(a: SourcedVersion, b: SourcedVersion): number {
  const x = `${a.source} ${a.version}`;
  const y = `${b.source} ${b.version}`;
  return x < y ? -1 : x > y ? 1 : 0;
}

// boundary-3: The first source wins and a disagreement is reported

// Extends "[boundary-3] the first source wins and the disagreement is reported", for python.
test("[boundary-3] python: .python-version wins and runtime.txt is reported as ignored", () => {
  const result = detectToolchain([
    { path: "runtime.txt", text: "python-3.11.4" },
    { path: ".python-version", text: "3.12.1" },
  ]);
  assert.equal(result.pins.python, "3.12.1");
  assert.deepEqual(result.conflicts, [
    {
      tool: "python",
      chosen: { version: "3.12.1", source: ".python-version" },
      ignored: [{ version: "3.11.4", source: "runtime.txt" }],
    },
  ]);
});

test("[boundary-3] python: runtime.txt wins and pyproject.toml is reported as ignored", () => {
  const result = detectToolchain([
    { path: "pyproject.toml", text: '[project]\nname = "app"\nrequires-python = "==3.10.13"\n' },
    { path: "runtime.txt", text: "python-3.11.4" },
  ]);
  assert.deepEqual(result.conflicts, [
    {
      tool: "python",
      chosen: { version: "3.11.4", source: "runtime.txt" },
      ignored: [{ version: "3.10.13", source: "pyproject.toml" }],
    },
  ]);
});

test("[boundary-3] every differing later source is ignored", () => {
  const result = detectToolchain([
    pkg({ engines: { node: "18.19.0" } }),
    { path: ".node-version", text: "20.11.1" },
    { path: ".nvmrc", text: "22.12.0" },
  ]);
  assert.equal(result.conflicts.length, 1);
  const [conflict] = result.conflicts;
  assert.equal(conflict.tool, "nodejs");
  assert.deepEqual(conflict.chosen, { version: "22.12.0", source: ".nvmrc" });
  assert.deepEqual(
    [...conflict.ignored].sort(byVersionAndSource),
    [
      { version: "20.11.1", source: ".node-version" },
      { version: "18.19.0", source: "package.json" },
    ].sort(byVersionAndSource),
  );
});

test("[boundary-3] a later source that agrees with the chosen version is not ignored", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "22.12.0" },
    { path: ".node-version", text: "22.12.0" },
    pkg({ engines: { node: "20.11.1" } }),
  ]);
  assert.deepEqual(result.conflicts, [
    {
      tool: "nodejs",
      chosen: { version: "22.12.0", source: ".nvmrc" },
      ignored: [{ version: "20.11.1", source: "package.json" }],
    },
  ]);
});

// Extends "[boundary-3] a source with no exact version is not part of a conflict":
// the chosen source is not the first one.
test("[boundary-3] the chosen source is the first exact one, past a skipped first source", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "lts/iron" },
    { path: ".node-version", text: "20.11.1" },
    pkg({ volta: { node: "^22" }, engines: { node: "18.19.0" } }),
  ]);
  assert.equal(result.pins.nodejs, "20.11.1");
  assert.deepEqual(result.conflicts, [
    {
      tool: "nodejs",
      chosen: { version: "20.11.1", source: ".node-version" },
      ignored: [{ version: "18.19.0", source: "package.json" }],
    },
  ]);
});

test("[boundary-3] volta.node wins over engines.node and the disagreement is reported", () => {
  const result = detectToolchain([pkg({ volta: { node: "22.12.0" }, engines: { node: "20.11.1" } })]);
  assert.deepEqual(result.conflicts, [
    {
      tool: "nodejs",
      chosen: { version: "22.12.0", source: "package.json" },
      ignored: [{ version: "20.11.1", source: "package.json" }],
    },
  ]);
});

// Extends "[boundary-3] sources that agree are no conflict": agreement once the v is dropped.
test("[boundary-3] versions that agree once a leading v is dropped are no conflict", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "v22.12.0" },
    { path: ".node-version", text: "22.12.0" },
    pkg({ volta: { node: "22.12.0" } }),
  ]);
  assert.equal(result.pins.nodejs, "22.12.0");
  assert.deepEqual(result.conflicts, []);
});

// Extends "[boundary-3] a skipped source followed by one exact source is no conflict".
test("[boundary-3] inexact and unreadable sources are never part of a conflict", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "lts/*" },
    { path: ".node-version", text: "20.11.1" },
    { path: "package.json", text: '{"engines":{"node":"18.19.0"}' },
    { path: ".python-version", text: "3.12.1" },
    { path: "runtime.txt", text: "python-3.x" },
    { path: "pyproject.toml", text: '[project]\nrequires-python = ">=3.10"\n' },
  ]);
  assert.deepEqual(result.conflicts, []);
});

test("[boundary-3] a differing file below the root is no conflict", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "22.12.0" },
    { path: "legacy/.nvmrc", text: "16.20.2" },
    { path: "legacy/package.json", text: JSON.stringify({ engines: { node: "16.20.2" } }) },
  ]);
  assert.deepEqual(result.conflicts, []);
});

test("[boundary-3] a conflict is reported for each tool whose sources disagree", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "22.12.0" },
    pkg({ engines: { node: "20.11.1" } }),
    { path: ".python-version", text: "3.12.1" },
    { path: "runtime.txt", text: "python-3.11.4" },
  ]);
  assert.equal(result.conflicts.length, 2);
  const node = result.conflicts.find((c) => c.tool === "nodejs");
  const python = result.conflicts.find((c) => c.tool === "python");
  assert.deepEqual(node, {
    tool: "nodejs",
    chosen: { version: "22.12.0", source: ".nvmrc" },
    ignored: [{ version: "20.11.1", source: "package.json" }],
  });
  assert.deepEqual(python, {
    tool: "python",
    chosen: { version: "3.12.1", source: ".python-version" },
    ignored: [{ version: "3.11.4", source: "runtime.txt" }],
  });
});

test("[boundary-3] a single source per tool gives no conflicts", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "22.12.0" },
    { path: "runtime.txt", text: "python-3.11.4" },
  ]);
  assert.deepEqual(result.conflicts, []);
});

// happy-4: The file lists each pinned tool on its own line

// Extends "[happy-4] the file lists nodejs, python and golang in that order":
// pins taken from package.json and pyproject.toml, files in another order.
test("[happy-4] the order of lines does not follow the order of files", () => {
  const result = detectToolchain([
    { path: "pyproject.toml", text: '[project]\nname = "app"\nrequires-python = "==3.11.9"\n' },
    { path: "go.mod", text: "module example.com/app\n\ngo 1.21.0\n" },
    pkg({ volta: { node: "20.18.1" } }),
  ]);
  assert.deepEqual(result.pins, { nodejs: "20.18.1", python: "3.11.9", golang: "1.21.0" });
  assert.equal(result.toolVersions, "nodejs 20.18.1\npython 3.11.9\ngolang 1.21.0\n");
});

// Extends "[happy-4] a tool that is not pinned has no line": the middle tool is the one missing.
test("[happy-4] nodejs and golang without python give two lines", () => {
  const result = detectToolchain([
    { path: "go.mod", text: "module example.com/app\n\ngo 1.22\n\ntoolchain go1.22.3\n" },
    { path: ".python-version", text: "system" },
    { path: ".node-version", text: "v18.19.0" },
  ]);
  assert.equal(result.toolVersions, "nodejs 18.19.0\ngolang 1.22.3\n");
});

// Extends "[happy-4] a single pinned tool gives a single line".
test("[happy-4] a single golang pin gives a single line", () => {
  const result = detectToolchain([{ path: "go.mod", text: "module example.com/app\n\ngo 1.23.0\n" }]);
  assert.equal(result.toolVersions, "golang 1.23.0\n");
});

test("[happy-4] a single python pin gives a single line", () => {
  const result = detectToolchain([{ path: ".python-version", text: "3.13\n" }]);
  assert.equal(result.toolVersions, "python 3.13\n");
});

test("[happy-4] the file holds the chosen version when sources disagree", () => {
  const result = detectToolchain([
    pkg({ engines: { node: "20.11.1" } }),
    { path: ".nvmrc", text: "v22.12.0" },
  ]);
  assert.equal(result.toolVersions, "nodejs 22.12.0\n");
});

// boundary-4: Nothing pinned means no file

// Extends "[boundary-4] sources with no exact version mean no file text at all", for every tool.
test("[boundary-4] inexact sources for all three tools give no file text", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "lts/iron" },
    { path: ".node-version", text: "node" },
    pkg({ volta: { node: "latest" }, engines: { node: "^22" } }),
    { path: ".python-version", text: "3.12.1 3.11.8" },
    { path: "runtime.txt", text: "python-3.x" },
    { path: "pyproject.toml", text: '[project]\nrequires-python = "~=3.12"\n' },
    { path: "go.mod", text: "module example.com/app\n\ntoolchain default\n" },
  ]);
  assert.deepEqual(result.pins, {});
  assert.equal("toolVersions" in result, false);
  assert.equal(result.toolVersions, undefined);
});

test("[boundary-4] only an invalid package.json gives no file text", () => {
  const result = detectToolchain([{ path: "package.json", text: "{" }]);
  assert.equal("toolVersions" in result, false);
  assert.ok(result.unreadable.includes("package.json"));
});

// Extends "[boundary-4] version files below the root pin nothing and give no file text":
// more files, deeper, and a "./" path.
test("[boundary-4] many version files below the root give no file text", () => {
  const result = detectToolchain([
    { path: "./.nvmrc", text: "22.12.0" },
    { path: "a/b/.node-version", text: "20.11.1" },
    { path: "py/.python-version", text: "3.12.1" },
    { path: "py/runtime.txt", text: "python-3.11.4" },
    { path: "py/pyproject.toml", text: '[project]\nrequires-python = "==3.12.1"\n' },
    { path: "web/package.json", text: JSON.stringify({ volta: { node: "22.12.0" } }) },
    { path: "cmd/tool/go.mod", text: "module example.com/tool\n\ngo 1.22\n" },
  ]);
  assert.deepEqual(result.pins, {});
  assert.deepEqual(result.conflicts, []);
  assert.equal("toolVersions" in result, false);
});

test("[boundary-4] files that name no tool give no file text", () => {
  const result = detectToolchain([
    { path: "README.md", text: "Requires node 22.12.0 and python 3.12.1\n" },
    { path: ".tool-versions", text: "nodejs 22.12.0\n" },
    { path: "Dockerfile", text: "FROM node:22.12.0\n" },
  ]);
  assert.deepEqual(result.pins, {});
  assert.equal("toolVersions" in result, false);
});
