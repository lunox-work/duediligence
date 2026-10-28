#!/usr/bin/env node
// A suite on Jest: `jest --json --runTestsByPath` over the given files in
// one process, mapped onto the result bin/runners/shared.mjs describes.
// Run in the package's folder:
//
//   node bin/runners/jest.mjs '{"suite":"public","files":["test/rubric.test.ts"],"build":"tsc -p tsconfig.json --noEmit"}'
//
// Optional fields: `build` (a check run first, such as `tsc --noEmit`; a
// failure crashes every file, as a failed compile does on node:test),
// `command` (the jest argv, default the nearest node_modules/.bin/jest),
// `testTimeoutMs`, `timeoutMs` (the whole run), `maxWorkers` (default 2,
// null for the runner's own), `maxRssMb` (the run's memory ceiling,
// shared.mjs `SUITE_MAX_RSS_MB`). The run is under guard.mjs: every node
// process gets the heap cap and the group is killed over the ceiling, which
// reads as a run that wrote no report. `memory` in the result is its peak.
//
// --runTestsByPath takes the files as paths, not patterns, so only they
// run. A named file Jest never reported, or reported as failed with no test
// (it did not compile under the transform, or threw on import), is
// `crashed`. When Jest wrote no report at all, the run counts as not
// compiled and its output is `compileOutput`.

import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { OUTPUT_CHARS, SUITE_MAX_RSS_MB, TEST_WORKERS, build, config, guardedSync, print, withBins } from "./shared.mjs";

const {
  suite,
  files,
  build: command = null,
  command: jest = ["jest"],
  testTimeoutMs = 20_000,
  timeoutMs = 120_000 * Math.max(1, files.length),
  maxWorkers = TEST_WORKERS,
  maxRssMb = SUITE_MAX_RSS_MB,
} = config("node bin/runners/jest.mjs '<json>'");
const root = realpathSync(process.cwd());
const SKIPPED = new Set(["skipped", "pending", "todo", "disabled"]);

/** One run over every named file: the report's entries by path relative to the package, or the run's output. */
function report() {
  const scratch = mkdtempSync(join(realpathSync(tmpdir()), "duediligence-jest-"));
  const outputFile = join(scratch, "report.json");
  try {
    // Under guard.mjs (shared.mjs `guardedSync`): the heap cap on every node
    // process the run starts and the resident-memory ceiling on the group.
    const run = guardedSync(
      jest[0],
      [
        ...jest.slice(1),
        "--ci",
        "--json",
        `--outputFile=${outputFile}`,
        `--testTimeout=${testTimeoutMs}`,
        ...(maxWorkers === null ? [] : [`--maxWorkers=${maxWorkers}`]),
        "--watchman=false",
        "--passWithNoTests",
        "--runTestsByPath",
        ...files,
      ],
      { cwd: root, env: { ...withBins(root), CI: "1" }, timeout: timeoutMs, heap: true, maxRssMb },
    );
    const timedOut = run.error?.code === "ETIMEDOUT";
    // A group killed over the memory ceiling wrote no report: not compiled, as a crash before any test.
    if (!existsSync(outputFile) || run.memoryKilled)
      return { output: `${run.error ?? ""}${run.stdout}${run.stderr}`.slice(0, OUTPUT_CHARS), timedOut, memory: { peakMb: run.peakMb, killed: run.memoryKilled } };
    const { testResults } = JSON.parse(readFileSync(outputFile, "utf8"));
    return {
      byFile: new Map(testResults.map((entry) => [relative(root, realpathSync(entry.name)), entry])),
      timedOut,
      memory: { peakMb: run.peakMb, killed: false },
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const built = build(command, root);
const ran = built.compiled && files.length > 0 ? report() : { byFile: new Map(), timedOut: false };
const compiled = built.compiled && ran.byFile !== undefined;
print({
  suite,
  compiled,
  // The guard's peak resident memory over the run's process group, and whether it killed the group.
  ...(ran.memory === undefined ? {} : { memory: ran.memory }),
  compileOutput: built.compiled ? (ran.output ?? "") : built.compileOutput,
  files: files.map((file) => {
    const entry = ran.byFile?.get(relative(root, join(root, file)));
    const tests = (entry?.assertionResults ?? []).map((test) => ({
      name: [...test.ancestorTitles, test.title].join(" > "),
      // node:test reports a skipped test as passed and skipped.
      ok: test.status === "passed" || SKIPPED.has(test.status),
      skipped: SKIPPED.has(test.status),
      error:
        test.status === "failed"
          ? { failureType: null, code: null, message: test.failureMessages.join("\n") }
          : null,
    }));
    const crashed = entry === undefined || (entry.status === "failed" && tests.length === 0);
    return { file, crashed, timedOut: crashed && ran.timedOut, tests: crashed ? [] : tests };
  }),
});
