// What the suite runners share: the one JSON argument they take, the build
// step, and the result they print. Each runner prints the shape
// template/sandbox/run.mjs prints, which is the contract everything in
// bin/lib.mjs above `runSuite` reads:
//
//   { suite, compiled, compileOutput, files: [{ file, crashed, timedOut, tests: [{ name, ok, skipped, error }] }] }
//
// `file` is each test file as the caller passed it, relative to the
// runner's working directory.

import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const OUTPUT_CHARS = 4_000;

/**
 * The memory caps on every test process the node:test, pytest, vitest and
 * Jest runners start (guard.mjs says why; go and cargo are not capped
 * yet): a V8 heap of INDEPENDENT_TESTS_TEST_HEAP_MB (default 512, through
 * NODE_OPTIONS so node --test's, vitest's and Jest's workers get it too)
 * and a resident-memory ceiling of INDEPENDENT_TESTS_TEST_MAX_RSS_MB
 * (default 1024) over the whole process group.
 */
export const TEST_HEAP_MB = Number(process.env.INDEPENDENT_TESTS_TEST_HEAP_MB ?? 512);
export const TEST_MAX_RSS_MB = Number(process.env.INDEPENDENT_TESTS_TEST_MAX_RSS_MB ?? 1024);
/**
 * Workers a vitest or Jest run may start (`--maxWorkers`, INDEPENDENT_TESTS_TEST_WORKERS,
 * default 2; a runner config's `maxWorkers: null` passes none): their pools
 * size themselves to the cores, and ten workers of a real package's suite
 * went over the group ceiling on their own.
 */
export const TEST_WORKERS = Number(process.env.INDEPENDENT_TESTS_TEST_WORKERS ?? 2);
/**
 * The group ceiling for a whole vitest or Jest run (INDEPENDENT_TESTS_SUITE_MAX_RSS_MB,
 * default 3072): one run holds the runner, its transform cache and its
 * workers, each under the heap cap. sandbox-factory's apps/web suite (813
 * tests, jsdom) peaks at 2.2 GB on two workers and 2.0 GB on one.
 */
export const SUITE_MAX_RSS_MB = Number(process.env.INDEPENDENT_TESTS_SUITE_MAX_RSS_MB ?? 3072);
const GUARD = join(dirname(fileURLToPath(import.meta.url)), "guard.mjs");

/**
 * `spawnSync(bin, argv, options)` under guard.mjs: the same result shape
 * (status, stdout, stderr, and `error.code === "ETIMEDOUT"` past
 * `options.timeout`), plus `memoryKilled` when the group went over the
 * ceiling (`maxRssMb`, default TEST_MAX_RSS_MB). `heap: true` adds the V8
 * heap cap for a node child.
 */
export function guardedSync(bin, argv, { timeout, heap = false, maxRssMb = TEST_MAX_RSS_MB, env = process.env, ...options } = {}) {
  const childEnv = heap ? { ...env, NODE_OPTIONS: `${env.NODE_OPTIONS ?? ""} --max-old-space-size=${TEST_HEAP_MB}`.trim() } : env;
  const run = spawnSync(process.execPath, [GUARD], {
    ...options,
    env: childEnv,
    encoding: "utf8",
    input: JSON.stringify({ bin, argv, timeoutMs: timeout, maxRssMb }),
    maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
  });
  const stderr = run.stderr ?? "";
  const at = stderr.lastIndexOf("\n@@guard ");
  const verdict = at === -1 ? {} : JSON.parse(stderr.slice(at + 9).trim().split("\n")[0]);
  return {
    status: verdict.reason ? null : run.status,
    stdout: run.stdout ?? "",
    stderr: at === -1 ? stderr : stderr.slice(0, at),
    error: verdict.reason === "timeout" ? Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }) : (run.error ?? (verdict.reason === "memory" ? new Error(`over ${maxRssMb} MB resident`) : undefined)),
    memoryKilled: verdict.reason === "memory",
    peakMb: verdict.peakMb ?? null,
  };
}

/** The runner's one argument, parsed: `{ suite, files, build, ... }`. */
export function config(usage) {
  try {
    const parsed = JSON.parse(process.argv[2]);
    if (typeof parsed.suite === "string" && Array.isArray(parsed.files)) return parsed;
  } catch {}
  console.error(`usage: ${usage}`);
  process.exit(2);
}

/** The environment with every node_modules/.bin from `cwd` up on PATH, nearest first, as npm scripts see it. */
export function withBins(cwd) {
  const bins = [];
  for (let at = cwd; ; at = dirname(at)) {
    if (existsSync(join(at, "node_modules", ".bin"))) bins.push(join(at, "node_modules", ".bin"));
    if (dirname(at) === at) break;
  }
  return { ...process.env, PATH: [...bins, process.env.PATH].join(delimiter) };
}

/**
 * Runs the build: an argv array as given, a string through `sh -c` with the
 * repository's binaries on PATH, or nothing when it is null.
 */
export function build(command, cwd) {
  if (command === null || command === undefined) return { compiled: true, compileOutput: "" };
  const run = Array.isArray(command)
    ? spawnSync(command[0], command.slice(1), { cwd, encoding: "utf8" })
    : spawnSync("sh", ["-c", command], { cwd, encoding: "utf8", env: withBins(cwd) });
  const compiled = run.status === 0;
  return {
    compiled,
    compileOutput: compiled ? "" : `${run.stdout}${run.stderr}`.slice(0, OUTPUT_CHARS),
  };
}

/**
 * Prints a suite result: a summary line on stderr, the JSON on stdout. The
 * tree's own folder in a test's name becomes `<root>`: a suite that names
 * its tests after process.cwd() (unjs/pathe's) would otherwise get new test
 * ids in every staged tree, and the baseline would read them as regressions.
 */
export function print(result) {
  const roots = [...new Set([process.cwd(), realpathSync(process.cwd())].flatMap((path) => [path, path.replace(/^\/private\//, "/")]))].sort((a, b) => b.length - a.length);
  for (const file of result.files)
    for (const test of file.tests) for (const root of roots) test.name = test.name.replaceAll(root, "<root>");
  const tests = result.files.flatMap((file) => file.tests);
  const passed = tests.filter((test) => test.ok).length;
  const crashed = result.files.filter((file) => file.crashed).length;
  console.error(
    `${result.suite}: ${passed}/${tests.length} passed${result.compiled ? "" : ", did not compile"}${crashed > 0 ? `, ${crashed} file(s) crashed` : ""}`,
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  // exitCode, not exit(): stdout to a pipe is asynchronous on macOS, and
  // exiting at once cuts a large result off mid-JSON.
  process.exitCode = result.compiled && passed === tests.length ? 0 : 1;
}
