#!/usr/bin/env node
// "My tests pass" as an acceptance check, measured instead of read from
// the agent's summary. For every run that wrote tests/own/, its own tests
// are recovered from diff.patch and run twice on fresh trees:
//
// - on the run's own src/: the agent's acceptance signal, mechanically;
// - on the reference src/: an own test the reference fails encodes the
//   agent's reading of the spec against the reference's, which is what a
//   check would reject correct work on.
//
// Paired with the run's line in results.jsonl (the independent suites),
// one line per run goes to acceptance.jsonl. Own test names are the
// agent's and may be stored; hidden test names stay in grade.json.
//
//   node bin/acceptance.mjs [slug...] [--concurrency 3] [--force]
//   node bin/acceptance.mjs --report

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  RESULTS,
  ROOT,
  RUNS,
  args,
  briefOfVariant,
  copy,
  discard,
  listFiles,
  log,
  pool,
  readJson,
  runSuite,
  specDir,
  specSlugs,
  stage,
  testsOf,
  variantArm,
  workdir,
} from "./lib.mjs";

const OUT = join(ROOT, "acceptance.jsonl");
const readLines = (path) =>
  existsSync(path)
    ? readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
    : [];
const keyOf = (line) => `${line.spec}/${line.variant}/${line.run}`;

/** Same as mutate-own.mjs's, which cannot be imported without running it. */
function ownTests(run) {
  const patch = join(run, "diff.patch");
  if (!existsSync(patch)) return null;
  const dir = workdir("own");
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["apply", "--include=tests/own/*", patch], { cwd: dir });
  const files = listFiles(join(dir, "tests", "own")).filter((path) => path.endsWith(".test.ts"));
  if (files.length === 0) {
    discard(dir);
    return null;
  }
  return { dir, files };
}

/** The own tests staged as the public suite over `src`: what compiled, and each failing test with its message. */
function runOwn(slug, src, own) {
  const dir = stage(workdir(`accept-${slug}`), slug, { spec: false, src });
  try {
    for (const file of own.files) copy(join(own.dir, "tests", "own", file), join(dir, "tests", "public", file));
    const result = runSuite(dir, "public");
    const tests = testsOf(result).filter((test) => !test.skipped);
    return {
      compiled: result.compiled,
      passed: tests.filter((test) => test.ok).length,
      total: tests.length,
      failing: tests
        .filter((test) => !test.ok)
        .map((test) => ({ id: test.id.replace(/^tests\/public\//, ""), message: (test.error?.message ?? "").slice(0, 600) })),
      compileOutput: result.compiled ? undefined : (result.compileOutput ?? "").slice(0, 600),
    };
  } finally {
    discard(dir);
  }
}

/** Every run of `slug` with own tests, as acceptance lines. */
function scoreSpec(slug, done) {
  const reference = join(specDir(slug), "reference", "src");
  if (!existsSync(reference)) return [];
  const graded = new Map(readLines(RESULTS).filter((line) => line.spec === slug).map((line) => [keyOf(line), line]));
  const out = [];
  for (const variant of readdirSync(join(RUNS, slug)).sort()) {
    const arm = variantArm(variant);
    if (arm === null || !arm.own.includes("tests/own/")) continue;
    const dir = join(RUNS, slug, variant);
    for (const n of readdirSync(dir).filter((name) => /^\d+$/.test(name)).sort((a, b) => a - b)) {
      const key = `${slug}/${variant}/${n}`;
      const result = graded.get(key);
      if (done.has(key) || result === undefined) continue;
      const submission = join(dir, n, "submission", "src");
      const own = ownTests(join(dir, n));
      const line = {
        spec: slug,
        variant,
        arm: arm.name,
        brief: briefOfVariant(variant),
        run: Number(n),
        verdict: result.verdict,
        public: result.public,
        hidden: result.hidden,
        own: null,
        ownOnReference: null,
      };
      if (own !== null) {
        try {
          if (existsSync(submission)) line.own = runOwn(slug, submission, own);
          line.ownOnReference = runOwn(slug, reference, own);
        } finally {
          discard(own.dir);
        }
      }
      log(key, result.verdict, line.own ? `own ${line.own.passed}/${line.own.total}` : "no own tests",
        line.ownOnReference ? `on reference ${line.ownOnReference.passed}/${line.ownOnReference.total}` : "");
      out.push(line);
    }
  }
  return out;
}

/** Lines that pass every own test they wrote: the agent's "my tests pass", checked. */
const ownGreen = (line) => line.own !== null && line.own.compiled && line.own.total > 0 && line.own.passed === line.own.total;
const independentAccepts = (line) => line.verdict === "passed";

function report() {
  const lines = readLines(OUT);
  const groups = new Map();
  for (const line of lines) {
    const group = `${line.arm} / ${line.brief}`;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(line);
  }
  const pct = (a, b) => (b === 0 ? "-" : `${((100 * a) / b).toFixed(1)}%`);
  console.log("| arm / brief | runs | own green | own green, independent rejects | own suite fails the reference |");
  console.log("| --- | ---: | ---: | ---: | ---: |");
  for (const [group, rows] of [...groups].sort()) {
    const green = rows.filter(ownGreen);
    const wrong = green.filter((line) => !independentAccepts(line));
    const withRef = rows.filter((line) => line.ownOnReference?.compiled && line.ownOnReference.total > 0);
    const refFails = withRef.filter((line) => line.ownOnReference.passed < line.ownOnReference.total);
    console.log(
      `| ${group} | ${rows.length} | ${green.length} | ${wrong.length} (${pct(wrong.length, green.length)}) | ${refFails.length} of ${withRef.length} (${pct(refFails.length, withRef.length)}) |`,
    );
  }
}

const { options, rest } = args();
if (options.report === true) {
  report();
  process.exit(0);
}

if (options.one === true) {
  const done = new Set(options.force === true ? [] : readLines(OUT).map(keyOf));
  console.log(JSON.stringify(scoreSpec(rest[0], done)));
  process.exit(0);
}

const slugs = specSlugs(rest).filter((slug) => existsSync(join(RUNS, slug)) && existsSync(join(specDir(slug), "reference", "src")));
const lines = new Map(readLines(OUT).map((line) => [keyOf(line), line]));
await pool(slugs, Number(options.concurrency ?? 3), (slug) =>
  new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [new URL(import.meta.url).pathname, slug, "--one", ...(options.force === true ? ["--force"] : [])],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("close", (code) => {
      if (code !== 0) log(slug, `failed (exit ${code})`);
      else for (const line of JSON.parse(out.trim().split("\n").at(-1))) lines.set(keyOf(line), line);
      resolve();
    });
  }),
);
const sorted = [...lines.values()].sort((a, b) => keyOf(a).localeCompare(keyOf(b), undefined, { numeric: true }));
writeFileSync(OUT, sorted.map((line) => JSON.stringify(line)).join("\n") + (sorted.length > 0 ? "\n" : ""));
console.log(`${sorted.length} line(s) in acceptance.jsonl`);
report();
