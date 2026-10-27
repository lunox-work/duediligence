#!/usr/bin/env node
// A suite on `node:test`, as template/sandbox/run.mjs runs one, for any
// tree: build once, then each test file's compiled module in its own
// process with template/sandbox/reporter.mjs, and print the result
// (bin/runners/shared.mjs). Run in the tree's (or package's) folder:
//
//   node bin/runners/node-test.mjs '{"suite":"public","files":["tests/public/parse.test.ts"],
//     "build":["node","node_modules/typescript/bin/tsc","-p","tsconfig.json"]}'
//
// Optional fields: `rootDir` and `outDir` (where the build writes a test
// file's `.js`: `<outDir>/<file relative to rootDir>`, default "." for
// both, beside the source), `envFile`, `reporter` (default
// template/sandbox/reporter.mjs), `fileTimeoutMs`, `testTimeoutMs`.
//
// The bundled template keeps its own sandbox/run.mjs, which sessions run
// and cannot reach this folder from; the two must agree on the shape.
//
// A file that fails before any test reports is `crashed`: it did not
// compile into a runnable module, threw on import, timed out, or went over
// the memory caps (shared.mjs `guardedSync`, guard.mjs).

import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build, config, guardedSync, print } from "./shared.mjs";

const REPORTER = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "template", "sandbox", "reporter.mjs"),
).href;

const {
  suite,
  files,
  build: command = null,
  rootDir = ".",
  outDir = ".",
  envFile = null,
  reporter = REPORTER,
  fileTimeoutMs = 120_000,
  testTimeoutMs = 20_000,
} = config("node bin/runners/node-test.mjs '<json>'");
const root = process.cwd();

/** Leaf tests with full names: a parent's line follows its children's. */
function leaves(lines) {
  const pending = [];
  const out = [];
  for (const line of lines) {
    const children = [];
    while (pending.length > 0 && pending.at(-1).nesting > line.nesting)
      children.unshift(pending.pop());
    if (children.length === 0 && !line.suite) {
      pending.push({ ...line, path: [line.name] });
      continue;
    }
    for (const child of children)
      pending.push({
        ...child,
        nesting: line.nesting,
        path: [line.name, ...child.path],
      });
  }
  for (const item of pending)
    out.push({
      name: item.path.join(" > "),
      ok: item.ok,
      skipped: item.skipped,
      error: item.error,
    });
  return out;
}

const { compiled, compileOutput } = build(command, root);
print({
  suite,
  compiled,
  compileOutput,
  files: files.map((file) => {
    const runtime = join(outDir, relative(rootDir, file)).replace(/\.tsx?$/, ".js");
    if (!compiled) return { file, crashed: true, timedOut: false, tests: [] };
    // Under guard.mjs, with the heap cap: a file over the memory ceiling is crashed, as a timeout is.
    const run = guardedSync(
      process.execPath,
      [
        ...(envFile === null ? [] : [`--env-file=${envFile}`]),
        "--test",
        `--test-timeout=${testTimeoutMs}`,
        `--test-reporter=${reporter}`,
        runtime,
      ],
      { cwd: root, timeout: fileTimeoutMs, heap: true },
    );
    const lines = (run.stdout ?? "")
      .split("\n")
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line));
    // A file that never got to its tests reports one failure named after it.
    const crashed =
      run.error !== undefined ||
      (lines.length === 1 && lines[0].name === runtime && !lines[0].ok);
    return {
      file,
      crashed,
      timedOut: run.error?.code === "ETIMEDOUT",
      ...(run.memoryKilled ? { memoryKilled: true } : {}),
      tests: crashed ? [] : leaves(lines),
    };
  }),
});
