// Builds the project and runs one suite, each test file in its own
// process, and prints what happened as JSON on stdout:
//
//   node sandbox/run.mjs public|private
//
// The grader runs it on trees it staged itself; `npm test` is what a
// developer runs. A file that fails before any test reports is `crashed`:
// it did not compile into a runnable module, threw on import, or timed out.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const SUITES = { public: "tests/public", private: "tests/private" };
const FILE_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 20_000;
const OUTPUT_CHARS = 4_000;

const suite = process.argv[2];
if (!(suite in SUITES)) {
  console.error("usage: node sandbox/run.mjs public|private");
  process.exit(2);
}
const root = process.cwd();
const dir = join(root, SUITES[suite]);

function listTests(at) {
  if (!existsSync(at)) return [];
  return readdirSync(at, { withFileTypes: true }).flatMap((entry) => {
    const path = join(at, entry.name);
    if (entry.isDirectory()) return listTests(path);
    return /\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

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

const compile = spawnSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"],
  { cwd: root, encoding: "utf8" },
);
const compiled = compile.status === 0;
const files = listTests(dir)
  .sort()
  .map((source) => {
    const file = relative(root, source);
    const runtime = file.replace(/\.tsx?$/, ".js");
    if (!compiled) return { file, crashed: true, timedOut: false, tests: [] };
    const run = spawnSync(
      process.execPath,
      [
        "--env-file=sandbox.env",
        "--test",
        `--test-timeout=${TEST_TIMEOUT_MS}`,
        "--test-reporter=./sandbox/reporter.mjs",
        runtime,
      ],
      { cwd: root, encoding: "utf8", timeout: FILE_TIMEOUT_MS },
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
      tests: crashed ? [] : leaves(lines),
    };
  });

const result = {
  suite,
  compiled,
  compileOutput: compiled
    ? ""
    : `${compile.stdout}${compile.stderr}`.slice(0, OUTPUT_CHARS),
  files,
};
const tests = files.flatMap((file) => file.tests);
const passed = tests.filter((test) => test.ok).length;
console.error(
  `${suite}: ${passed}/${tests.length} passed${compiled ? "" : ", did not compile"}${files.some((file) => file.crashed) ? `, ${files.filter((file) => file.crashed).length} file(s) crashed` : ""}`,
);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
// exitCode, not exit(): stdout to a pipe is asynchronous on macOS, and
// exiting at once cuts a large result off mid-JSON.
process.exitCode = compiled && passed === tests.length ? 0 : 1;
