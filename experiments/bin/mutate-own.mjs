#!/usr/bin/env node
// The agents' own tests on the same mutants as bin/mutate.mjs: how strong
// a judge "my tests pass" is, next to the public and hidden suites. Each
// self-tested run's tests/own/ is recovered from its diff.patch and run
// against the reference first; a test the reference fails encodes the
// agent's misreading of the spec and is dropped, as calibration drops a
// hidden test. A mutant is killed when any kept test fails on it.
//
//   node bin/mutate-own.mjs [slug...] [--variant self-tested-haiku] [--suites 5] [--concurrency 6]
//
// Needs runs/_mutation/<slug>.json. Writes runs/_mutation/<slug>.own.json
// and one line per spec to mutation-own.jsonl.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ROOT,
  RUNS,
  args,
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
  workdir,
  writeJson,
} from "./lib.mjs";

const OUT = join(RUNS, "_mutation");
const SUMMARY = join(ROOT, "mutation-own.jsonl");

/** A run's tests/own/, applied from its diff onto an empty workdir; null when it wrote none. */
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

/** `src` (a directory) with the own tests staged as the public suite: the passing test ids, null when it does not compile. */
function passing(slug, src, own, all) {
  const dir = stage(workdir(`own-${slug}`), slug, { spec: false, src });
  try {
    for (const file of own.files) copy(join(own.dir, "tests", "own", file), join(dir, "tests", "public", file));
    const result = runSuite(dir, "public");
    if (!result.compiled) return null;
    if (all !== undefined) for (const test of testsOf(result)) all.add(test.id);
    return new Set(testsOf(result).filter((test) => test.ok && !test.skipped).map((test) => test.id));
  } finally {
    discard(dir);
  }
}

function scoreSpec(slug, variant, limit) {
  const mutation = readJson(join(OUT, `${slug}.json`), null);
  const reference = join(specDir(slug), "reference", "src");
  const runsDir = join(RUNS, slug, variant);
  const runs = existsSync(runsDir)
    ? readdirSync(runsDir).filter((name) => /^\d+$/.test(name)).sort((a, b) => a - b)
    : [];
  const mutants = mutation.results.filter((item) => item.status === "judged");
  const sources = {};
  const suites = [];
  for (const n of runs) {
    if (suites.length >= limit) break;
    const own = ownTests(join(runsDir, n));
    if (own === null) continue;
    try {
      const written = new Set();
      const kept = passing(slug, reference, own, written);
      if (kept === null || kept.size === 0) continue;
      const killed = mutants.map((mutant) => {
        const dir = workdir(`own-mutant-${slug}`);
        try {
          copy(reference, join(dir, "src"));
          const path = join(reference, mutant.file);
          const source = (sources[path] ??= readFileSync(path, "utf8"));
          writeFileSync(join(dir, "src", mutant.file), source.slice(0, mutant.start) + mutant.text + source.slice(mutant.end));
          const ok = passing(slug, join(dir, "src"), own);
          return ok === null || [...kept].some((id) => !ok.has(id));
        } finally {
          discard(dir);
        }
      });
      suites.push({ run: Number(n), written: written.size, kept: kept.size, killed });
    } finally {
      discard(own.dir);
    }
  }
  return { mutants, suites };
}

function summarise(slug, variant, { mutants, suites }) {
  const survivors = mutants.map((mutant, at) => ({ mutant, at })).filter(({ mutant }) => !mutant.publicKilled);
  const rate = (pick) =>
    suites.length === 0 ? null : suites.reduce((sum, suite) => sum + pick(suite), 0) / suites.length;
  return {
    spec: slug,
    variant,
    judged: mutants.length,
    ownSuites: suites.length,
    publicKilled: mutants.filter((mutant) => mutant.publicKilled).length,
    hiddenKilled: mutants.filter((mutant) => mutant.hiddenKilled).length,
    eitherKilled: mutants.filter((mutant) => mutant.publicKilled || mutant.hiddenKilled).length,
    ownTestsWritten: suites.reduce((sum, suite) => sum + suite.written, 0),
    ownTestsReferenceFails: suites.reduce((sum, suite) => sum + suite.written - suite.kept, 0),
    suitesWithMisreading: suites.filter((suite) => suite.kept < suite.written).length,
    meanOwnKilled: rate((suite) => suite.killed.filter(Boolean).length),
    meanOwnKilledOfPublicSurvivors: rate((suite) => survivors.filter(({ at }) => suite.killed[at]).length),
    publicSurvivors: survivors.length,
    gradedAt: new Date().toISOString(),
  };
}

const { options, rest } = args();
const variant = typeof options.variant === "string" ? options.variant : "self-tested-haiku";
const limit = Number(options.suites ?? 5);

if (options.one === true) {
  const [slug] = rest;
  const scored = scoreSpec(slug, variant, limit);
  writeJson(join(OUT, `${slug}.own.json`), { variant, suites: scored.suites });
  console.log(JSON.stringify(summarise(slug, variant, scored)));
  process.exit(0);
}

const slugs = specSlugs(rest).filter((slug) => existsSync(join(OUT, `${slug}.json`)) && existsSync(join(RUNS, slug, variant)));
const previous = existsSync(SUMMARY)
  ? readFileSync(SUMMARY, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
  : [];
const summaries = new Map(previous.map((line) => [`${line.spec}/${line.variant}`, line]));
await pool(slugs, Number(options.concurrency ?? 6), (slug) => {
  log(slug, "scoring own tests");
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [new URL(import.meta.url).pathname, slug, "--one", "--variant", variant, "--suites", String(limit)],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("close", (code) => {
      if (code !== 0) {
        log(slug, `failed (exit ${code})`);
        return resolve();
      }
      const line = JSON.parse(out.trim().split("\n").at(-1));
      summaries.set(`${slug}/${variant}`, line);
      log(slug, `own suites ${line.ownSuites}, mean own kills ${line.meanOwnKilled?.toFixed(1)}/${line.judged}, public ${line.publicKilled}, hidden ${line.hiddenKilled}`);
      resolve();
    });
  });
});
const lines = [...summaries.values()].sort((a, b) => a.spec.localeCompare(b.spec) || a.variant.localeCompare(b.variant));
writeFileSync(SUMMARY, lines.map((line) => JSON.stringify(line)).join("\n") + (lines.length > 0 ? "\n" : ""));
console.log(`${lines.length} line(s) in mutation-own.jsonl`);
