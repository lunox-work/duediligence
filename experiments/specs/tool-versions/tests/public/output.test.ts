import { test } from "node:test";
import assert from "node:assert/strict";
import { detectToolchain } from "../../src/index.js";
import type { RepoFile } from "../../src/index.js";

function pkg(fields: object): RepoFile {
  return { path: "package.json", text: JSON.stringify({ name: "app", ...fields }) };
}

// boundary-3: The first source wins and a disagreement is reported

test("[boundary-3] the first source wins and the disagreement is reported", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "22.12.0" },
    pkg({ engines: { node: "20.11.1" } }),
  ]);
  assert.equal(result.pins.nodejs, "22.12.0");
  assert.deepEqual(result.conflicts, [
    {
      tool: "nodejs",
      chosen: { version: "22.12.0", source: ".nvmrc" },
      ignored: [{ version: "20.11.1", source: "package.json" }],
    },
  ]);
});

test("[boundary-3] a source with no exact version is not part of a conflict", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "22.12.0" },
    { path: ".node-version", text: "lts/iron" },
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

test("[boundary-3] a skipped source followed by one exact source is no conflict", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "lts/iron" },
    pkg({ engines: { node: "22.12.0" } }),
  ]);
  assert.deepEqual(result.conflicts, []);
});

test("[boundary-3] sources that agree are no conflict", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "22.12.0" },
    { path: ".node-version", text: "22.12.0" },
  ]);
  assert.equal(result.pins.nodejs, "22.12.0");
  assert.deepEqual(result.conflicts, []);
});

// happy-4: The file lists each pinned tool on its own line

test("[happy-4] the file lists nodejs, python and golang in that order", () => {
  const result = detectToolchain([
    { path: "go.mod", text: "module example.com/app\n\ngo 1.22\n\ntoolchain go1.22.3\n" },
    { path: ".python-version", text: "3.12.1\n" },
    { path: ".nvmrc", text: "22.12.0\n" },
  ]);
  assert.deepEqual(result.pins, { nodejs: "22.12.0", python: "3.12.1", golang: "1.22.3" });
  assert.equal(result.toolVersions, "nodejs 22.12.0\npython 3.12.1\ngolang 1.22.3\n");
});

test("[happy-4] a tool that is not pinned has no line", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "lts/*" },
    { path: "go.mod", text: "module example.com/app\n\ngo 1.22\n" },
    { path: "runtime.txt", text: "python-3.11.4" },
  ]);
  assert.equal(result.toolVersions, "python 3.11.4\ngolang 1.22\n");
});

test("[happy-4] a single pinned tool gives a single line", () => {
  const result = detectToolchain([{ path: ".nvmrc", text: "22" }]);
  assert.equal(result.toolVersions, "nodejs 22\n");
});

// boundary-4: Nothing pinned means no file

test("[boundary-4] no files means no file text at all", () => {
  const result = detectToolchain([]);
  assert.deepEqual(result.pins, {});
  assert.equal("toolVersions" in result, false);
});

test("[boundary-4] sources with no exact version mean no file text at all", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "lts/*" },
    { path: ".python-version", text: "system" },
    pkg({ engines: { node: ">=20" } }),
  ]);
  assert.deepEqual(result.pins, {});
  assert.equal("toolVersions" in result, false);
});

test("[boundary-4] version files below the root pin nothing and give no file text", () => {
  const result = detectToolchain([
    { path: "app/.nvmrc", text: "22.12.0" },
    { path: "svc/go.mod", text: "module example.com/svc\n\ngo 1.22\n" },
  ]);
  assert.deepEqual(result.pins, {});
  assert.equal("toolVersions" in result, false);
});
