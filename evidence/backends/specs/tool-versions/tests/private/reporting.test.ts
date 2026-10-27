import { test } from "node:test";
import assert from "node:assert/strict";
import { detectToolchain } from "../../src/index.js";
import type { Conflict, RepoFile, SourcedVersion } from "../../src/index.js";

// Only compare conflict membership: the spec does not prescribe array ordering.
function canonical(conflicts: Conflict[]): Conflict[] {
  const key = (value: SourcedVersion) => `${value.source}\u0000${value.version}`;
  return conflicts.map((conflict) => ({
    ...conflict,
    ignored: [...conflict.ignored].sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0),
  })).sort((a, b) => a.tool < b.tool ? -1 : a.tool > b.tool ? 1 : 0);
}

// Extends public: a conflict reports the chosen and ignored versions with their source files.
test("[boundary-3] node-version and both package fields retain distinct ignored versions", () => {
  const result = detectToolchain([
    { path: "package.json", text: '{"volta":{"node":"24.13.7"},"engines":{"node":"25.2.9"}}' },
    { path: ".nvmrc", text: "system" },
    { path: ".node-version", text: "v18.19.9" },
  ]);
  assert.equal(result.pins.nodejs, "18.19.9");
  assert.deepEqual(canonical(result.conflicts), canonical([{
    tool: "nodejs", chosen: { version: "18.19.9", source: ".node-version" },
    ignored: [{ version: "24.13.7", source: "package.json" }, { version: "25.2.9", source: "package.json" }],
  }]));
});

// Extends public: matching versions including a normalized v do not conflict.
test("[boundary-3] matching short versions across every source produce no conflicts", () => {
  const result = detectToolchain([
    { path: "go.mod", text: "toolchain go1.24\ngo 1.24\n" },
    { path: "pyproject.toml", text: "[project]\nrequires-python = '==3'\n" },
    { path: "runtime.txt", text: "python-3" },
    { path: ".python-version", text: "3" },
    { path: "package.json", text: '{"engines":{"node":"19.17"},"volta":{"node":"19.17"}}' },
    { path: ".node-version", text: "v19.17" },
    { path: ".nvmrc", text: "v19.17" },
  ]);
  assert.deepEqual(result.pins, { nodejs: "19.17", python: "3", golang: "1.24" });
  assert.deepEqual(result.conflicts, []);
});

// Extends public: sources without exact versions are excluded from a conflict.
test("[boundary-3] invalid declarations are excluded while Python still reports an exact disagreement", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "19.17.9" },
    { path: ".node-version", text: "v19.17.9" },
    { path: "package.json", text: '{"volta":{"node":"24.x"},"engines":{"node":">=25.2.9"}}' },
    { path: ".python-version", text: "3.9.21" },
    { path: "runtime.txt", text: "python-3.14rc1" },
    { path: "pyproject.toml", text: '[project]\nrequires-python = "==3.13.11"\n' },
    { path: "go.mod", text: "go 1.24.8\ntoolchain go1.25rc2\n" },
  ]);
  assert.deepEqual(result.conflicts, [{
    tool: "python", chosen: { version: "3.9.21", source: ".python-version" },
    ignored: [{ version: "3.13.11", source: "pyproject.toml" }],
  }]);
});

// Extends public: all differing later versions are grouped in one conflict per tool.
test("[boundary-3] every exact loser is reported with all sources present in reverse priority order", () => {
  const result = detectToolchain([
    { path: "go.mod", text: "toolchain go1.21.13\ngo 1.24.8\n" },
    { path: "pyproject.toml", text: "[project]\nrequires-python = '==3.14.2'\n" },
    { path: "runtime.txt", text: "python-3.13.11" },
    { path: ".python-version", text: "3.9.21" },
    { path: "package.json", text: '{"engines":{"node":"25.2.9"},"volta":{"node":"24.13.7"}}' },
    { path: ".node-version", text: "v23.14.1" },
    { path: ".nvmrc", text: "v18.19.9" },
  ]);
  assert.deepEqual(result.pins, { nodejs: "18.19.9", python: "3.9.21", golang: "1.21.13" });
  assert.deepEqual(canonical(result.conflicts), canonical([
    {
      tool: "nodejs", chosen: { version: "18.19.9", source: ".nvmrc" },
      ignored: [
        { version: "23.14.1", source: ".node-version" },
        { version: "24.13.7", source: "package.json" },
        { version: "25.2.9", source: "package.json" },
      ],
    },
    {
      tool: "python", chosen: { version: "3.9.21", source: ".python-version" },
      ignored: [{ version: "3.13.11", source: "runtime.txt" }, { version: "3.14.2", source: "pyproject.toml" }],
    },
    {
      tool: "golang", chosen: { version: "1.21.13", source: "go.mod" },
      ignored: [{ version: "1.24.8", source: "go.mod" }],
    },
  ]));
});

test("[boundary-3] a package can disagree with itself without a version file", () => {
  const result = detectToolchain([{ path: "package.json", text: '{"engines":{"node":"25.2.9"},"volta":{"node":"18.19.9"}}' }]);
  assert.deepEqual(result.conflicts, [{
    tool: "nodejs", chosen: { version: "18.19.9", source: "package.json" },
    ignored: [{ version: "25.2.9", source: "package.json" }],
  }]);
});

test("[boundary-3] matching intermediate sources do not hide a later disagreement", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "v18.19.9" },
    { path: ".node-version", text: "18.19.9" },
    { path: "package.json", text: '{"volta":{"node":"18.19.9"},"engines":{"node":"25.2.9"}}' },
    { path: ".python-version", text: "3.9.21" },
    { path: "runtime.txt", text: "python-3.9.21" },
    { path: "pyproject.toml", text: '[project]\nrequires-python = "==3.14.2"\n' },
  ]);
  assert.deepEqual(canonical(result.conflicts), canonical([
    { tool: "nodejs", chosen: { version: "18.19.9", source: ".nvmrc" }, ignored: [{ version: "25.2.9", source: "package.json" }] },
    { tool: "python", chosen: { version: "3.9.21", source: ".python-version" }, ignored: [{ version: "3.14.2", source: "pyproject.toml" }] },
  ]));
});

test("[boundary-3] matching sources after a disagreement stay out of the ignored list", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "v19.17.9" },
    { path: ".node-version", text: "25.2.9" },
    { path: "package.json", text: '{"volta":{"node":"19.17.9"},"engines":{"node":"19.17.9"}}' },
    { path: ".python-version", text: "3.9.21" },
    { path: "runtime.txt", text: "python-3.14.2" },
    { path: "pyproject.toml", text: '[project]\nrequires-python = "==3.9.21"\n' },
  ]);
  assert.deepEqual(canonical(result.conflicts), canonical([
    { tool: "nodejs", chosen: { version: "19.17.9", source: ".nvmrc" }, ignored: [{ version: "25.2.9", source: ".node-version" }] },
    { tool: "python", chosen: { version: "3.9.21", source: ".python-version" }, ignored: [{ version: "3.14.2", source: "runtime.txt" }] },
  ]));
});

// Extends public: file text lists all tools in the specified order with final newlines.
test("[happy-4] output uses selected fallback pins even when every tool has losing declarations", () => {
  const result = detectToolchain([
    { path: "go.mod", text: "toolchain go1.23.12\ngo 1.24.8\n" },
    { path: "pyproject.toml", text: '[project]\nrequires-python = "==3.14.2"\n' },
    { path: "runtime.txt", text: "python-3.9.21" },
    { path: ".python-version", text: "system" },
    { path: "package.json", text: '{"volta":{"node":"19.17"},"engines":{"node":"25.2.9"}}' },
    { path: ".nvmrc", text: "stable" },
  ]);
  assert.equal(result.toolVersions, "nodejs 19.17\npython 3.9.21\ngolang 1.23.12\n");
});

// Extends public: each subset emits only its pinned tools in the specified order.
test("[happy-4] every nonempty subset renders fallback-source pins amid unusable and unrelated files", () => {
  const files: RepoFile[] = [
    { path: "package.json", text: '{"volta":{"node":"23.14"}}' },
    { path: "pyproject.toml", text: "[project]\nrequires-python = '==3'\n" },
    { path: "go.mod", text: "toolchain go1.24.8\n" },
  ];
  const lines = ["nodejs 23.14\n", "python 3\n", "golang 1.24.8\n"];
  for (let mask = 1; mask < 8; mask++) {
    const subset = files.filter((_, index) => (mask & (1 << index)) !== 0).reverse();
    const result = detectToolchain([
      { path: ".nvmrc", text: "lts/*" },
      { path: ".python-version", text: "system" },
      { path: "runtime.txt", text: "python->=3.13" },
      { path: "docs/go.mod", text: "go 9.9.9\n" },
      ...subset,
    ]);
    assert.equal(result.toolVersions, lines.filter((_, index) => (mask & (1 << index)) !== 0).join(""), `mask ${mask}`);
  }
});

// Extends public: one- and two-number versions are written without adding components.
test("[happy-4] alternate component counts remain verbatim in output from lower priority sources", () => {
  const result = detectToolchain([
    { path: "go.mod", text: "go 1.24.8\n" },
    { path: "runtime.txt", text: "python-3" },
    { path: "package.json", text: '{"engines":{"node":"19.17"}}' },
  ]);
  assert.deepEqual(result.pins, { nodejs: "19.17", python: "3", golang: "1.24.8" });
  assert.equal(result.toolVersions, "nodejs 19.17\npython 3\ngolang 1.24.8\n");
});

// Extends public: an empty repository omits the file-text property entirely.
test("[boundary-4] empty detection after pins and diagnostics retains no earlier results", () => {
  const earlier = detectToolchain([
    { path: ".nvmrc", text: "18.19.9" },
    { path: ".node-version", text: "25.2.9" },
    { path: "package.json", text: "{" },
  ]);
  assert.equal(earlier.pins.nodejs, "18.19.9");
  assert.ok(earlier.unreadable.includes("package.json"));
  const result = detectToolchain([]);
  assert.deepEqual(result.pins, {});
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.unreadable, []);
  assert.equal(Object.hasOwn(result, "toolVersions"), false);
});

// Extends public: nonexact declarations omit the file-text property entirely.
test("[boundary-4] seven present source files still produce no file when all declarations are nonexact", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "^24.13.7" },
    { path: ".node-version", text: "24.x" },
    { path: "package.json", text: '{"volta":{"node":"latest"},"engines":{"node":"24 || 25"}}' },
    { path: ".python-version", text: "3.13.11 3.12.9" },
    { path: "runtime.txt", text: "python-3.14rc1" },
    { path: "pyproject.toml", text: '[project]\nrequires-python = "~=3.14"\n' },
    { path: "go.mod", text: "go 1.25rc1\ntoolchain go1.25.x\n" },
  ]);
  assert.deepEqual(result.pins, {});
  assert.deepEqual(result.conflicts, []);
  assert.equal(Object.hasOwn(result, "toolVersions"), false);
});

// Extends public: nested files and unrelated root files cannot produce a file or diagnostics.
test("[boundary-4] many ignored source files and lookalike root names cannot produce output or diagnostics", () => {
  const files: RepoFile[] = [];
  for (let i = 0; i < 40; i++) {
    files.push(
      { path: `workspace${i}/package.json`, text: "{" },
      { path: `workspace${i}/pyproject.toml`, text: '[project]\nrequires-python = "==3.14.2"\n' },
      { path: `workspace${i}/.node-version`, text: "25.2.9" },
      { path: `workspace${i}/runtime.txt`, text: "python-3.14.2" },
    );
  }
  files.push(
    { path: ".nvmrc.backup", text: "25.2.9" },
    { path: "go.mod.old", text: "go 1.24.8\n" },
    { path: "package.json.bak", text: "{" },
    { path: ".tool-versions", text: "nodejs 25.2.9\npython 3.14.2\ngolang 1.24.8\n" },
  );
  const result = detectToolchain(files);
  assert.deepEqual(result.pins, {});
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.unreadable, []);
  assert.equal(Object.hasOwn(result, "toolVersions"), false);
});

test("[happy-4] successive repositories do not cache versions by filename", () => {
  for (const version of ["17.14.9", "24.13.7", "9.8.6", "17.14.9"]) {
    const result = detectToolchain([
      { path: ".nvmrc", text: version },
      { path: ".python-version", text: version },
      { path: "go.mod", text: `go ${version}\n` },
    ]);
    assert.equal(result.toolVersions, `nodejs ${version}\npython ${version}\ngolang ${version}\n`);
  }
});
