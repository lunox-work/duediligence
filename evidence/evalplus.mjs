#!/usr/bin/env node
// The HumanEval+ oracle row of RESULTS.md, reproduced on this package's
// pytest runner with no model. The archive's 40 HumanEval+ specs come in
// through bin/import-archive.mjs (not held out); every released EvalPlus
// solution for each task (the archive's cache, written by its
// bin/evalplus-import.py) is judged by `judge` in bin/lib.mjs, public and
// hidden suite on fresh trees, against the tests the canonical solution
// passes, exactly as the archive's bin/evalplus-score.mjs judged them on
// its unittest runner. "Right" is EvalPlus's own label: passing HumanEval's
// base tests and the plus tests.
//
// Writes HOME/runs/_evalplus/<slug>.json (every solution's verdicts) and
// evidence/evalplus.json: the table with and without HumanEval/22 and /60
// (the two tasks the suites and the oracle read differently), and, row by
// row, where the pytest runner's verdict differs from the archive's.
//
//   node evidence/evalplus.mjs [--archive <dir>] [--cache <dir>] [--concurrency 6] [--force] [--out <file>]
//
// --out writes the summary elsewhere: evidence/backends.mjs scores another
// backend's suites (SPECS pointing at them) into evidence/backends/.
//
// Run it with INDEPENDENT_TESTS_HOME set to a scratch folder: it imports
// 40 specs there.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PYTHON, ROOT, RUNS, SPECS, args, discard, judge, log, pool, readJson, specDir, testsOf, workdir, writeJson } from "../bin/lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(RUNS, "_evalplus");
const { options, rest } = args();
const archive = resolve(typeof options.archive === "string" ? options.archive : join(ROOT, "experiments"));
const cache = typeof options.cache === "string" ? options.cache : join(homedir(), ".cache", "double-blind", "evalplus");
const EXCLUDED = ["he-22", "he-60"];

/** Every released solution for a task, in the archive scorer's order: { set, solution, base, plus }. */
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
  return { slug, task: problem.task_id, picked: problem.picked, publicTests: publicIds.length, hiddenTests: hiddenIds.length, rows };
}

/** The FINDINGS.md table over `specs`: right is base and plus. */
function table(specs) {
  const rows = specs.flatMap((spec) => spec.rows);
  const right = (row) => row.base && row.plus;
  const generated = (row) => row.public && row.hidden;
  const wrong = rows.filter((row) => !right(row));
  const correct = rows.filter(right);
  const pct = (n, of) => Math.round((1000 * n) / of) / 10;
  const baseAccepts = wrong.filter((row) => row.base).length;
  const generatedAccepts = wrong.filter(generated).length;
  return {
    tasks: specs.length,
    solutions: rows.length,
    wrong: wrong.length,
    wrongAcceptedByBase: { count: baseAccepts, percent: pct(baseAccepts, wrong.length) },
    wrongAcceptedByGenerated: { count: generatedAccepts, percent: pct(generatedAccepts, wrong.length) },
    rightRejectedByGenerated: { count: correct.filter((row) => !generated(row)).length, of: correct.length },
  };
}

if (options.one === true) {
  const [slug] = rest;
  writeJson(join(OUT, `${slug}.json`), scoreSpec(slug));
  process.exit(0);
}

const archived = readdirSync(join(archive, "runs", "_evalplus"))
  .filter((name) => /^he-\d+\.json$/.test(name))
  .map((name) => name.replace(/\.json$/, ""))
  .sort();
const missing = archived.filter((slug) => !existsSync(join(SPECS, slug, "spec.md")));
if (missing.length > 0) {
  const imported = spawnSync(process.execPath, [join(ROOT, "bin", "import-archive.mjs"), ...missing, "--archive", archive], { stdio: "inherit" });
  if (imported.status !== 0) process.exit(1);
}
const todo = archived.filter((slug) => options.force === true || !existsSync(join(OUT, `${slug}.json`)));
await pool(todo, Number(options.concurrency ?? 6), (slug) => {
  log(slug, "scoring");
  return new Promise((done) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), slug, "--one", "--cache", cache, "--archive", archive], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("close", (code) => {
      log(slug, code === 0 ? "scored" : `failed (exit ${code})`);
      done();
    });
  });
});

const specs = archived.map((slug) => readJson(join(OUT, `${slug}.json`), null)).filter(Boolean);
// Row by row against the archive's verdicts on its unittest runner.
const differences = [];
for (const spec of specs) {
  const before = readJson(join(archive, "runs", "_evalplus", `${spec.slug}.json`)).rows;
  spec.rows.forEach((row, at) => {
    const old = before[at];
    if (old?.set !== row.set || old.public !== row.public || old.hidden !== row.hidden)
      differences.push({ slug: spec.slug, at, set: row.set, archive: old && { public: old.public, hidden: old.hidden }, now: { public: row.public, hidden: row.hidden } });
  });
}
const summary = {
  scoredAt: new Date().toISOString(),
  runner: "bin/runners/pytest.mjs (pytest 8.4.2)",
  python: spawnSync(PYTHON, ["--version"], { encoding: "utf8" }).stdout.trim(),
  all: table(specs),
  without22and60: table(specs.filter((spec) => !EXCLUDED.includes(spec.slug))),
  rowsComparedWithArchive: specs.reduce((sum, spec) => sum + spec.rows.length, 0),
  rowsDifferingFromArchive: differences.length,
  differences,
};
writeJson(typeof options.out === "string" ? resolve(options.out) : join(HERE, "evalplus.json"), summary);
console.log(JSON.stringify({ ...summary, differences: differences.slice(0, 20) }, null, 2));
