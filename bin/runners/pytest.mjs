#!/usr/bin/env node
// A suite on pytest, read through template-python/sandbox/
// independent_tests_reporter.py (one JSON line per test), mapped onto the
// result bin/runners/shared.mjs describes. Run in the tree's (or the
// package's) folder:
//
//   node bin/runners/pytest.mjs '{"suite":"public","files":["tests/public/test_parse.py"],
//     "python":".venv/bin/python","build":[".venv/bin/python","-I","sandbox/compile_check.py"]}'
//
// Optional fields: `python` (default python3; relative to the folder when
// it holds a `/`), `build` (a check run first; a failure crashes every
// file), `args` (more pytest arguments), `perFile` (default true: each file
// in its own process, as the Python template does; false runs every file in
// one process, for a repository's existing suite), `fileTimeoutMs`,
// `timeouts` (per file, overriding it), `timeoutMs` (the one-process run),
// `pythonPath` (folders, relative to the folder, put first on PYTHONPATH:
// a repository's import root, so its tree's source shadows the installed
// package).
//
// A test's name is `Class.method[param]`, with `[<scenario key>] ` in front
// when it carries `@pytest.mark.scenario`. A file that fails to collect, or
// reports no test while pytest exits with an error, is `crashed`; on a
// timeout every file without a reported test is crashed and timed out.

import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { OUTPUT_CHARS, build, config, guardedSync, print } from "./shared.mjs";

export const REPORTER_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "template-python", "sandbox");

const {
  suite,
  files,
  python: pythonOption = "python3",
  build: command = null,
  args: extra = [],
  perFile = true,
  fileTimeoutMs = 120_000,
  timeouts = {},
  timeoutMs = 600_000,
  pythonPath = [],
} = config("node bin/runners/pytest.mjs '<json>'");
const root = realpathSync(process.cwd());
const python = pythonOption.includes("/") && !isAbsolute(pythonOption) ? join(root, pythonOption) : pythonOption;
const env = {
  ...process.env,
  PYTHONDONTWRITEBYTECODE: "1",
  PYTHONHASHSEED: "0",
  PYTHONPATH: [...pythonPath.map((path) => join(root, path)), REPORTER_DIR, process.env.PYTHONPATH].filter(Boolean).join(delimiter),
};

/** One pytest process over `targets`: its reported lines, exit code and output. */
function pytest(targets, timeout, many = false) {
  const scratch = mkdtempSync(join(realpathSync(tmpdir()), "independent-tests-pytest-"));
  const report = join(scratch, "report.jsonl");
  try {
    // Under guard.mjs: an untrusted solution over the memory ceiling loses the file, as a timeout does.
    const run = guardedSync(
      python,
      [
        "-m",
        "pytest",
        "-p",
        "independent_tests_reporter",
        "-p",
        "no:cacheprovider",
        "-q",
        "--no-header",
        // One file that fails to import must not stop the others.
        ...(many ? ["--continue-on-collection-errors"] : []),
        ...extra,
        ...targets,
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...env, INDEPENDENT_TESTS_REPORT: report },
        timeout,
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    const lines = existsSync(report)
      ? readFileSync(report, "utf8")
          .split("\n")
          .filter((line) => line.startsWith("{"))
          .map((line) => JSON.parse(line))
      : [];
    return {
      lines,
      status: run.status,
      timedOut: run.error?.code === "ETIMEDOUT" || run.memoryKilled,
      output: `${run.error ?? ""}${run.stdout ?? ""}${run.stderr ?? ""}`.slice(-OUTPUT_CHARS),
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** A file's entry from the lines that name it. Exit 5 is "no tests collected": an empty file, not a crash. */
function entry(file, lines, { status, timedOut }) {
  const own = lines.filter((line) => relative(root, join(root, line.file)) === relative(root, join(root, file)));
  const tests = own.filter((line) => line.collectError === undefined);
  const collectError = own.some((line) => line.collectError !== undefined);
  const crashed = collectError || (tests.length === 0 && (timedOut || ![0, 1, 5].includes(status)));
  return {
    file,
    crashed,
    timedOut: timedOut && tests.length === 0 && !collectError,
    tests: crashed ? [] : tests.map(({ name, ok, skipped, error }) => ({ name, ok, skipped, error })),
  };
}

const built = build(command, root);
let output = "";
// Runs where pytest itself failed: no line reported, an error exit, no timeout.
const broken = [];
const note = (run) => {
  broken.push(run.lines.length === 0 && !run.timedOut && ![0, 1, 5].includes(run.status));
  return run;
};
const results = !built.compiled
  ? files.map((file) => ({ file, crashed: true, timedOut: false, tests: [] }))
  : perFile
    ? files.map((file) => {
        const run = note(pytest([file], timeouts[file] ?? fileTimeoutMs));
        const out = entry(file, run.lines, run);
        // A per-file timeout loses the file, as the template's run.py does.
        if (run.timedOut) return { file, crashed: true, timedOut: true, tests: [] };
        if (out.crashed) output ||= run.output;
        return out;
      })
    : (() => {
        if (files.length === 0) return [];
        const run = note(pytest(files, timeoutMs, true));
        output = run.status === 0 || run.status === 1 ? "" : run.output;
        return files.map((file) => entry(file, run.lines, run));
      })();
// pytest that never got to collect (a broken install, a config error) reads
// as not compiled, as vitest with no report does, with its output.
const nothing = broken.length > 0 && broken.every(Boolean);
print({
  suite,
  compiled: built.compiled && !nothing,
  compileOutput: built.compiled ? (nothing ? output : "") : built.compileOutput,
  files: results,
});
