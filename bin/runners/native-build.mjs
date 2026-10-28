#!/usr/bin/env node
// The build of a command or service written in another language than the
// suites (toolchain `exec` with `boundary.language`): the TypeScript suites
// compile, then the code under src/ does. Self-contained (node builtins
// only): bin/lib.mjs `stage` copies it into the tree as sandbox/build.mjs,
// and the tree's `npm run build`, the judge's suite runner and a service's
// boundary build all run it, so sessions and the judge build alike.
//
//   node sandbox/build.mjs [--check]
//
// The language is sandbox/boundary.json's `language`:
//   python  every src/**/*.py parsed by python3 (`python` on Windows),
//           writing nothing; the boundary runs src/ as it is
//   go      `go build -o .bin/task ./src`, the standard library only, the
//           build cache in the temp folder
//   rust    `cargo build --offline`: target/debug/task
// --check compiles the suites with --noEmit, and runs `go vet ./src` in
// place of the Go build. Exit 0 when everything builds; otherwise the
// compiler's output on stderr and exit 1.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const check = process.argv.includes("--check");
const WINDOWS = process.platform === "win32";
const { language } = JSON.parse(readFileSync(join("sandbox", "boundary.json"), "utf8"));

const PYTHON_CHECK = [
  "import ast, pathlib, sys",
  "bad = []",
  "for path in sorted(pathlib.Path('src').rglob('*.py')):",
  "    try: ast.parse(path.read_text(encoding='utf-8'), str(path))",
  "    except SyntaxError as error: bad.append(f'{path}:{error.lineno}: {error.msg}')",
  "print('\\n'.join(bad), file=sys.stderr)",
  "sys.exit(1 if bad else 0)",
].join("\n");

const steps = [
  [process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json", ...(check ? ["--noEmit"] : [])]],
  ...({
    python: [[WINDOWS ? "python" : "python3", ["-I", "-c", PYTHON_CHECK]]],
    go: [check ? ["go", ["vet", "./src"]] : ["go", ["build", "-o", `.bin/task${WINDOWS ? ".exe" : ""}`, "./src"]]],
    rust: [["cargo", ["build", "--offline", "--quiet"]]],
  }[language] ?? []),
];
if (!["python", "go", "rust"].includes(language)) {
  console.error(`sandbox/build.mjs: no language ${JSON.stringify(language)} in sandbox/boundary.json`);
  process.exit(1);
}
const env = {
  ...process.env,
  GOCACHE: process.env.GOCACHE ?? join(tmpdir(), "duediligence-go-cache"),
  GOFLAGS: "-mod=mod",
  GOTOOLCHAIN: "local",
};
for (const [bin, argv] of steps) {
  const run = spawnSync(bin, argv, { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  if (run.status === 0) continue;
  process.stderr.write(run.error ? `${bin}: ${run.error.message}\n` : `${run.stdout}${run.stderr}`);
  process.exit(1);
}
