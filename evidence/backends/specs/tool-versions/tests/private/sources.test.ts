import { test } from "node:test";
import assert from "node:assert/strict";
import { detectToolchain } from "../../src/index.js";
import type { RepoFile } from "../../src/index.js";

// Extends public: .nvmrc wins over every later Node source regardless of input order.
test("[happy-1] Node priority survives every permutation and does not select the largest version", () => {
  const files: RepoFile[] = [
    { path: ".nvmrc", text: "18.19.7" },
    { path: ".node-version", text: "25.4.9" },
    { path: "package.json", text: JSON.stringify({ engines: { node: "27.8.1" }, volta: { node: "26.3.2" } }) },
  ];
  for (const order of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
    assert.equal(detectToolchain(order.map((i) => files[i])).pins.nodejs, "18.19.7");
  }
});

// Extends public: .node-version supplies Node and drops one leading v.
test("[happy-1] both Node version files normalize v for every allowed component count", () => {
  for (const path of [".nvmrc", ".node-version"]) {
    for (const version of ["9", "19.7", "24.13.81"]) {
      const result = detectToolchain([
        { path: "package.json", text: '{"engines":{"node":"99.8.7"}}' },
        { path, text: `\t v${version} \r\n` },
      ]);
      assert.equal(result.pins.nodejs, version, `${path}: ${version}`);
    }
  }
});

// Extends public: volta.node precedes engines.node when version files are absent.
test("[happy-1] Volta wins even with fewer components and a smaller major than engines", () => {
  for (const text of [
    '{"volta":{"node":"16"},"engines":{"node":"25.8.9"}}',
    '{"engines":{"node":"25.8.9"},"volta":{"node":"16"}}',
  ]) {
    assert.equal(detectToolchain([{ path: "package.json", text }]).pins.nodejs, "16");
  }
});

// Extends public: engines.node alone accepts a one-number exact version.
test("[happy-1] engines accepts each exact width without semver padding", () => {
  for (const version of ["7", "17.14", "24.121.456"]) {
    const result = detectToolchain([{ path: "package.json", text: JSON.stringify({ engines: { node: version } }) }]);
    assert.deepEqual(result.pins, { nodejs: version });
  }
});

// Extends public: runtime.txt supplies Python ahead of pyproject.toml.
test("[happy-2] runtime priority is independent of file order and version magnitude", () => {
  const files = [
    { path: "runtime.txt", text: "python-2.7.18" },
    { path: "pyproject.toml", text: '[project]\nrequires-python = "==3.14.2"\n' },
  ];
  for (const order of [files, [...files].reverse()]) {
    assert.equal(detectToolchain(order).pins.python, "2.7.18");
  }
});

// Extends public: .python-version precedes both other Python sources.
test("[happy-2] Python version file wins with a shorter older pin in every file order", () => {
  const files = [
    { path: ".python-version", text: "2.7" },
    { path: "runtime.txt", text: "python-3.10.16" },
    { path: "pyproject.toml", text: "[project]\nrequires-python = '==3.14.2'\n" },
  ];
  for (const order of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
    assert.equal(detectToolchain(order.map((i) => files[i])).pins.python, "2.7");
  }
});

// Extends public: pyproject.toml accepts exact equality in either quote style.
test("[happy-2] TOML equality accepts all component counts and ignores unrelated quoted versions", () => {
  for (const quote of ['"', "'"]) {
    for (const version of ["3", "3.14", "3.14.19"]) {
      const result = detectToolchain([{
        path: "pyproject.toml",
        text: `[project]\nname = "example"\nversion = "9.8.7"\nrequires-python = ${quote}==${version}${quote}`,
      }]);
      assert.deepEqual(result.pins, { python: version });
    }
  }
});

// Extends public: pyproject.toml requires equality rather than a range or bare version.
test("[happy-2] TOML rejects compatible arbitrary and multi-clause equality values", () => {
  for (const quote of ['"', "'"]) {
    for (const value of ["===3.14.2", "!=3.14.2", "<=3.14.2", "==3.14.2.*", "==3.14.2 || ==3.13.9", "==3.14.2,!=3.14.3", "==3.14.2rc1"]) {
      const result = detectToolchain([{ path: "pyproject.toml", text: `[project]\nrequires-python = ${quote}${value}${quote}\n` }]);
      assert.equal(Object.hasOwn(result.pins, "python"), false, value);
    }
  }
});

// Extends public: the go.mod toolchain version wins over its go version.
test("[happy-3] Go toolchain priority does not depend on line order or largest version", () => {
  for (const text of [
    "module example.org/private\n\ntoolchain go1.21.13\n\ngo 1.24\n",
    "module example.org/private\n\ngo 1.24\n\ntoolchain go1.21.13\n",
  ]) {
    assert.equal(detectToolchain([{ path: "go.mod", text }]).pins.golang, "1.21.13");
  }
});

// Extends public: go.mod without a toolchain preserves the two-number go version.
test("[happy-3] Go directive preserves patch components and a final line without newline", () => {
  for (const version of ["1.19", "1.23.12", "1.24.101"]) {
    assert.deepEqual(detectToolchain([{ path: "go.mod", text: `module example.org/private\n\ngo ${version}` }]).pins, { golang: version });
  }
});

// Extends public: a toolchain without an exact version falls back to the go line.
test("[happy-3] many nonexact toolchains fall back without extracting a numeric prefix", () => {
  for (const value of ["go1.25rc2", "go1.25.1-custom", "go1.25.1.9", "go1.25.x", "go>=1.25", "golatest", "default"]) {
    const result = detectToolchain([{ path: "go.mod", text: `module example.org/private\n\ntoolchain ${value}\ngo 1.23.9\n` }]);
    assert.equal(result.pins.golang, "1.23.9", value);
    assert.deepEqual(result.conflicts, [], value);
  }
});

test("[happy-3] an exact toolchain remains usable when the go directive is nonexact", () => {
  for (const value of ["1.25rc2", ">=1.24", "1.24.x"]) {
    const result = detectToolchain([{ path: "go.mod", text: `go ${value}\ntoolchain go1.23.12\n` }]);
    assert.equal(result.pins.golang, "1.23.12", value);
    assert.deepEqual(result.conflicts, [], value);
  }
});

test("[happy-3] a one-component Go declaration is exact under the shared version grammar", () => {
  for (const text of ["go 2\n", "toolchain go2\n"]) {
    const result = detectToolchain([{ path: "go.mod", text }]);
    assert.deepEqual(result.pins, { golang: "2" });
  }
});

// Extends public: an alias in .nvmrc falls through to engines.node.
test("[boundary-1] an unusable nvmrc stops falling through at the exact node-version", () => {
  for (const alias of ["stable", "system", "lts/jod", "^24.8"]) {
    const result = detectToolchain([
      { path: "package.json", text: '{"volta":{"node":"26.2.1"},"engines":{"node":"27.1.0"}}' },
      { path: ".node-version", text: "v19.17" },
      { path: ".nvmrc", text: alias },
    ]);
    assert.equal(result.pins.nodejs, "19.17", alias);
  }
});

test("[boundary-1] invalid Node version files fall through to Volta before engines", () => {
  const result = detectToolchain([
    { path: ".nvmrc", text: "24.8.1-beta" },
    { path: ".node-version", text: "24.8.1 23.9.0" },
    { path: "package.json", text: '{"engines":{"node":"26.7.3"},"volta":{"node":"18.19.8"}}' },
  ]);
  assert.equal(result.pins.nodejs, "18.19.8");
});

// Extends public: multiple unusable sources are skipped for each tool.
test("[boundary-1] simultaneous fallback reaches different source depths for different tools", () => {
  const result = detectToolchain([
    { path: "go.mod", text: "module example.org/private\n\ngo 1.24.8\ntoolchain go1.25beta2\n" },
    { path: "pyproject.toml", text: "[project]\nrequires-python = '==3.14'\n" },
    { path: "runtime.txt", text: "python-3.13.x" },
    { path: ".python-version", text: "3.14.2 3.13.9" },
    { path: "package.json", text: '{"volta":{"node":"19.7"},"engines":{"node":">=24"}}' },
    { path: ".node-version", text: "node" },
    { path: ".nvmrc", text: "v24.1.2.3" },
  ]);
  assert.deepEqual(result.pins, { nodejs: "19.7", python: "3.14", golang: "1.24.8" });
  assert.deepEqual(result.conflicts, []);
});

// Extends public: nested higher-priority files do not override root sources.
test("[boundary-1] slash paths for every source are ignored even when they contain invalid formats", () => {
  const names = [".nvmrc", ".node-version", "package.json", ".python-version", "runtime.txt", "pyproject.toml", "go.mod"];
  const nested = names.flatMap((path) => [
    { path: `a/b/c/${path}`, text: "not valid JSON or TOML" },
    { path: `/${path}`, text: "99.99.99" },
    { path: `./${path}`, text: "99.99.99" },
  ]);
  const result = detectToolchain([
    ...nested,
    { path: "package.json", text: '{"volta":{"node":"23.7.4"}}' },
    { path: "pyproject.toml", text: '[project]\nrequires-python = "==3.10.16"\n' },
    { path: "go.mod", text: "go 1.23.6\n" },
  ]);
  assert.deepEqual(result.pins, { nodejs: "23.7.4", python: "3.10.16", golang: "1.23.6" });
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.unreadable, []);
});

test("[happy-2] runtime accepts one two and three component versions", () => {
  for (const version of ["3", "3.9", "3.13.11"]) {
    assert.deepEqual(detectToolchain([{ path: "runtime.txt", text: `python-${version}` }]).pins, { python: version });
  }
});

test("[boundary-1] runtime needs its python prefix and cannot salvage an embedded version", () => {
  for (const value of ["3.13.11", "ruby-3.13.11", "python-python-3.13.11", "python-3.13.11rc1"]) {
    const result = detectToolchain([
      { path: "runtime.txt", text: value },
      { path: "pyproject.toml", text: '[project]\nrequires-python = "==3.10.16"\n' },
    ]);
    assert.equal(result.pins.python, "3.10.16", value);
  }
});
