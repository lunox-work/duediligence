#!/usr/bin/env node
// A suite on vitest: `vitest run --reporter=json` over the given files in
// one process, mapped onto the result template/sandbox/run.mjs prints
// (bin/runners/shared.mjs). Run in the package's folder:
//
//   node bin/runners/vitest.mjs '{"suite":"public","files":["src/pricing/rubric.test.ts"]}'
//
// Optional fields: `build` (a check run first, such as `tsc --noEmit`; a
// failure crashes every file, as a failed compile does on node:test),
// `command` (the vitest argv, default the nearest node_modules/.bin/vitest),
// `testTimeoutMs`, `timeoutMs` (the whole run), `maxWorkers` (default 2,
// null for the runner's own), `maxRssMb` (the run's memory ceiling,
// shared.mjs `SUITE_MAX_RSS_MB`). The run is under guard.mjs: every node
// process gets the heap cap and the group is killed over the ceiling, which
// reads as a run that wrote no report. `memory` in the result is its peak.
//
// vitest takes files as filters, so the run may load more files than were
// named; only the named ones are reported. A named file vitest never
// reported, because its config does not include it or it failed to load,
// is `crashed`. When vitest wrote no report at all, the run counts as not
// compiled and its output is `compileOutput`.

import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { OUTPUT_CHARS, SUITE_MAX_RSS_MB, TEST_WORKERS, build, config, guardedSync, print, withBins } from "./shared.mjs";

const {
  suite,
  files,
  build: command = null,
  command: vitest = ["vitest"],
  testTimeoutMs = 20_000,
  timeoutMs = 120_000 * Math.max(1, files.length),
  maxWorkers = TEST_WORKERS,
  maxRssMb = SUITE_MAX_RSS_MB,
} = config("node bin/runners/vitest.mjs '<json>'");
const root = realpathSync(process.cwd());
const SKIPPED = new Set(["skipped", "pending", "todo", "disabled"]);

/**
 * The installed vitest's major version (99 when it cannot be read): before
 * 4, a --maxWorkers under the default minimum is a pool error unless
 * --minWorkers comes with it; from 4 on --minWorkers is an unknown option.
 */
function major() {
  try {
    const path = createRequire(join(root, "package.json")).resolve("vitest/package.json");
    return Number(JSON.parse(readFileSync(path, "utf8")).version.split(".")[0]);
  } catch {
    return 99;
  }
}

/** One run over every named file: the report's entries by path relative to the package, or the run's output. */
function report() {
  const scratch = mkdtempSync(join(realpathSync(tmpdir()), "duediligence-vitest-"));
  const outputFile = join(scratch, "report.json");
  try {
    // Under guard.mjs (shared.mjs `guardedSync`): the heap cap on every node
    // process the run starts and the resident-memory ceiling on the group.
    const run = guardedSync(
      vitest[0],
      [
        ...vitest.slice(1),
        "run",
        "--reporter=json",
        `--outputFile=${outputFile}`,
        `--testTimeout=${testTimeoutMs}`,
        ...(maxWorkers === null ? [] : [`--maxWorkers=${maxWorkers}`, ...(major() <= 3 ? ["--minWorkers=1"] : [])]),
        ...files,
      ],
      { cwd: root, env: withBins(root), timeout: timeoutMs, heap: true, maxRssMb },
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
// No files means no run: vitest with no filter runs the whole suite.
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
