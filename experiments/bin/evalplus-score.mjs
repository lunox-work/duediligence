#!/usr/bin/env node
// The generator against an outside oracle. Every released EvalPlus solution
// for an imported HumanEval+ task (bin/evalplus-import.py) is judged by the
// public and hidden suites the generator wrote from the prompt alone, and
// compared with EvalPlus's own verdicts: `base` (HumanEval's original
// tests, the benchmark's visible suite) and `plus` (base plus about 80
// times more generated tests, the oracle).
//
// A test the canonical solution fails asserts something the docstring
// does not, and is left out of both suites, as calibration drops a hidden
// test the reference cannot satisfy; how many is reported.
//
//   node bin/evalplus-score.mjs [he-...] [--cache DIR] [--concurrency 6] [--force]
//
// Per task, every solution's verdicts to runs/_evalplus/<slug>.json; the
// pooled table to evalplus-results.json.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  ROOT,
  RUNS,
  args,
  discard,
  judge,
  log,
  pool,
  readJson,
  specDir,
  specSlugs,
  testsOf,
  workdir,
  writeJson,
} from "./lib.mjs";

const OUT = join(RUNS, "_evalplus");
const { options, rest } = args();
const cache = typeof options.cache === "string" ? options.cache : join(homedir(), ".cache", "double-blind", "evalplus");

/** Every released solution for a task: { set, solution, base, plus }. */
function solutions(task) {
  const out = [];
  const samples = join(cache, "samples");
  for (const set of readdirSync(samples).sort()) {
    const results = readJson(join(samples, set, "eval_results.json"), null);
    for (const row of results?.eval?.[task] ?? [])
      out.push({ set, solution: row.solution, base: row.base_status === "pass", plus: row.plus_status === "pass" });
  }
  return out;
}

/** The ids of `ids` that passed in a suite result. */
const passing = (result, ids) => {
  const ok = new Set(testsOf(result).filter((test) => test.ok && !test.skipped).map((test) => test.id));
  return ids.filter((id) => ok.has(id));
};

function judgeText(slug, text) {
  const dir = workdir(`he-${slug}`);
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "solution.py"), text);
    return judge(slug, join(dir, "src"));
  } finally {
    discard(dir);
  }
}

function scoreSpec(slug) {
  const problem = readJson(join(specDir(slug), "problem.json"));
  const calibration = readJson(join(specDir(slug), "calibration.json"));
  const reference = judgeText(slug, readFileSync(join(specDir(slug), "reference", "src", "solution.py"), "utf8"));
  const publicIds = passing(reference.public, calibration.publicIds);
  const hiddenIds = passing(reference.hidden, calibration.kept);
  const rows = solutions(problem.task_id).map((item) => {
    const judged = judgeText(slug, item.solution);
    return {
      set: item.set,
      base: item.base,
      plus: item.plus,
      public: passing(judged.public, publicIds).length === publicIds.length,
      hidden: passing(judged.hidden, hiddenIds).length === hiddenIds.length,
    };
  });
  return {
    slug,
    task: problem.task_id,
    picked: problem.picked,
    publicTests: publicIds.length,
    publicDroppedByReference: calibration.publicIds.length - publicIds.length,
    hiddenTests: hiddenIds.length,
    hiddenDroppedByReference: calibration.kept.length - hiddenIds.length,
    rows,
  };
}

/** Accept/reject counts for one judge against the plus oracle. */
function confusion(rows, accepts) {
  const out = { acceptedWrong: 0, rejectedWrong: 0, acceptedRight: 0, rejectedRight: 0 };
  for (const row of rows) {
    const accepted = accepts(row);
    if (row.plus) out[accepted ? "acceptedRight" : "rejectedRight"] += 1;
    else out[accepted ? "acceptedWrong" : "rejectedWrong"] += 1;
  }
  return out;
}

function pooled(specs) {
  const rows = specs.flatMap((spec) => spec.rows.map((row) => ({ ...row, picked: spec.picked })));
  const judges = {
    "HumanEval base tests": (row) => row.base,
    "generated public suite": (row) => row.public,
    "generated hidden suite": (row) => row.hidden,
    "generated public + hidden": (row) => row.public && row.hidden,
  };
  const table = (subset) =>
    Object.fromEntries(Object.entries(judges).map(([name, accepts]) => [name, confusion(subset, accepts)]));
  // The question the experiment exists for: solutions the visible suite
  // accepts that the oracle rejects. How many does the hidden suite catch?
  const overfitBase = rows.filter((row) => row.base && !row.plus);
  const overfitPublic = rows.filter((row) => row.public && !row.plus);
  return {
    tasks: specs.length,
    solutions: rows.length,
    wrongByPlus: rows.filter((row) => !row.plus).length,
    all: table(rows),
    top: table(rows.filter((row) => row.picked === "top")),
    random: table(rows.filter((row) => row.picked === "random")),
    passBaseFailPlus: { count: overfitBase.length, generatedRejects: overfitBase.filter((row) => !(row.public && row.hidden)).length },
    passPublicFailPlus: { count: overfitPublic.length, hiddenRejects: overfitPublic.filter((row) => !row.hidden).length },
    rightButHiddenRejects: rows.filter((row) => row.plus && row.public && !row.hidden).length,
    testsDroppedByReference: specs.reduce((sum, spec) => sum + spec.publicDroppedByReference + spec.hiddenDroppedByReference, 0),
    testsKept: specs.reduce((sum, spec) => sum + spec.publicTests + spec.hiddenTests, 0),
  };
}

if (options.one === true) {
  const [slug] = rest;
  writeJson(join(OUT, `${slug}.json`), scoreSpec(slug));
  process.exit(0);
}

const slugs = specSlugs(rest.length > 0 ? rest : [])
  .filter((slug) => slug.startsWith("he-"))
  .filter((slug) => readJson(join(specDir(slug), "calibration.json"), null)?.status === "ok");
const todo = slugs.filter((slug) => options.force === true || !existsSync(join(OUT, `${slug}.json`)));
await pool(todo, Number(options.concurrency ?? 6), (slug) => {
  log(slug, "scoring");
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [new URL(import.meta.url).pathname, slug, "--one", "--cache", cache], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("close", (code) => {
      log(slug, code === 0 ? "scored" : `failed (exit ${code})`);
      resolve();
    });
  });
});
const specs = slugs.map((slug) => readJson(join(OUT, `${slug}.json`), null)).filter(Boolean);
const summary = { scoredAt: new Date().toISOString(), ...pooled(specs) };
writeJson(join(ROOT, "evalplus-results.json"), summary);
console.log(JSON.stringify(summary, null, 2));
