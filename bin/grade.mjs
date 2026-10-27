#!/usr/bin/env node
// Grades every finished blind run under runs/ and rewrites results.jsonl,
// one line per run, with the verdict and counts only:
//
// - refused: the run changed, added or removed any path outside src/ and
//   tests/own/ (tests, sandbox/, package.json, tsconfig.json, the lockfile,
//   node_modules), or left a symlink under src/;
// - otherwise its src/ alone is judged on fresh trees (`judge`):
//   incomplete when a public test fails, passed when every kept hidden
//   test passes too, overfit when one does not.
//
// Which hidden tests failed, and why, goes to runs/<slug>/<variant>/<n>/
// grade.json, never to results.jsonl. What results.jsonl does carry is
// `failedScenarios`: the spec scenarios the failing hidden tests are keyed
// to, which names nothing the agent did not already have in spec.md.
//
//   node bin/grade.mjs [slug...] [--force]
//
// On a repository target, a run's changes are classed by lib.mjs `scopeOf`:
// harness changes are refused; the rest (submission/, with the removed
// paths) is laid over base plus stub and judged with the existing suite
// too, and a test baseline.json says passed that fails now makes it
// `regressed`. Changes outside allowedPaths are `outsideScope`, refused
// only with --strict-scope. grade.json adds the regressions by name.
//
// Grade with no run of that spec still going and no other grade.mjs
// running: it rewrites all of results.jsonl.

import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AGENT,
  RESULTS,
  RUNS,
  args,
  count,
  judge,
  log,
  pathsOf,
  promotedOf,
  readJson,
  regressionsOf,
  scenarioOf,
  scopeOf,
  specDir,
  specSlugs,
  testsOf,
  toolchainOf,
  verdict,
  writeJson,
} from "./lib.mjs";

const { options, rest } = args();
const previous = existsSync(RESULTS)
  ? readFileSync(RESULTS, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
  : [];
const keyOf = (line) => `${line.spec}/${line.variant}/${line.run}`;
const results = new Map(previous.map((line) => [keyOf(line), line]));
const numbered = (dir) =>
  readdirSync(dir)
    .filter((name) => /^\d+$/.test(name))
    .sort((a, b) => a - b);

for (const slug of specSlugs(rest)) {
  const calibration = readJson(join(specDir(slug), "calibration.json"), null);
  if (calibration?.status !== "ok" || !existsSync(join(RUNS, slug))) continue;
  if (promotedOf(slug) !== null) {
    log(slug, "skipped: promoted, so its hidden suite judges nothing");
    continue;
  }
  const chain = toolchainOf(slug);
  const repo = chain.name === "repo";
  const baseline = repo ? readJson(join(specDir(slug), "baseline.json"), null) : null;
  // A variant is any folder of runs/<slug>/ holding numbered runs;
  // generate/ and calibrate/ hold the writers' transcripts.
  const variants = readdirSync(join(RUNS, slug), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && numbered(join(RUNS, slug, entry.name)).length > 0)
    .map((entry) => entry.name)
    .sort();
  for (const variant of variants) {
    const dir = join(RUNS, slug, variant);
    for (const n of numbered(dir)) {
      const out = join(dir, n);
      const run = readJson(join(out, "run.json"), null);
      const key = `${slug}/${variant}/${n}`;
      if (run === null || (results.has(key) && options.force !== true)) continue;
      const submission = join(out, "submission", ...(repo ? [] : ["src"]));
      const allowed = (path) => path.startsWith("src/") || path.startsWith(AGENT.own);
      const read = (path) => {
        const full = join(submission, path);
        return existsSync(full) && lstatSync(full).isFile() ? readFileSync(full, "utf8") : null;
      };
      const scope = repo ? scopeOf(chain, run.changes, read) : null;
      const refused = repo
        ? [...scope.refused, ...(options["strict-scope"] === true ? scope.outsideScope : [])]
        : run.changes.filter((item) => !allowed(item.path) || item.symlink === true);
      let publicCount = { passed: 0, total: calibration.publicIds.length };
      let hiddenCount = { passed: 0, total: calibration.kept.length };
      let hiddenFailures = [];
      let regressions = [];
      if (refused.length === 0 && existsSync(submission)) {
        // Own tests are not judged: removed again after the overlay, with
        // what the run removed.
        const remove = repo
          ? [
              ...[...scope.allowed, ...scope.outsideScope].filter((item) => item.change === "removed"),
              ...scope.ownTests,
            ].map((item) => item.path)
          : [];
        const judged = judge(slug, submission, { existing: repo, remove });
        if (repo) regressions = regressionsOf(baseline, judged.existing);
        publicCount = count(judged.public, calibration.publicIds);
        hiddenCount = count(judged.hidden, calibration.kept);
        const reported = new Map(testsOf(judged.hidden).map((test) => [test.id, test]));
        hiddenFailures = calibration.kept
          .filter((id) => reported.get(id)?.ok !== true)
          .map((id) => ({ id, error: reported.get(id)?.error ?? { message: "did not run" } }));
        writeJson(join(out, "grade.json"), {
          publicCompiled: judged.public.compiled,
          hiddenCompiled: judged.hidden.compiled,
          compileOutput: judged.hidden.compileOutput || judged.public.compileOutput,
          publicFailures: testsOf(judged.public)
            .filter((test) => !test.ok)
            .map((test) => ({ id: test.id, error: test.error })),
          hiddenFailures,
          ...(repo ? { regressions } : {}),
        });
      }
      const line = {
        spec: slug,
        variant,
        run: Number(n),
        verdict: verdict({ refused, publicCount, hiddenCount, regressions }),
        public: publicCount,
        hidden: hiddenCount,
        refused: repo ? pathsOf(refused) : refused.map((item) => `${item.path} (${item.change})`),
        ...(repo ? { regressions: regressions.length, outsideScope: pathsOf(scope.outsideScope), ownTests: scope.ownTests.length } : {}),
        failedScenarios: [...new Set(hiddenFailures.map((item) => scenarioOf(item.id)).filter(Boolean))].sort(),
        peekAttempts: run.peeks.length,
        agent: {
          model: run.session.model,
          ok: run.session.ok,
          timedOut: run.session.timedOut,
          costUsd: run.session.costUsd,
          turns: run.session.turns,
          minutes: Math.round(run.session.durationMs / 6000) / 10,
        },
        node: process.version,
        gradedAt: new Date().toISOString(),
      };
      results.set(key, line);
      log(
        key,
        line.verdict,
        `public ${publicCount.passed}/${publicCount.total}, hidden ${hiddenCount.passed}/${hiddenCount.total}`,
        line.failedScenarios.length > 0 ? `scenarios ${line.failedScenarios.join(", ")}` : "",
      );
    }
  }
}

const lines = [...results.values()].sort(
  (a, b) => a.spec.localeCompare(b.spec) || a.variant.localeCompare(b.variant) || a.run - b.run,
);
writeFileSync(RESULTS, lines.map((line) => JSON.stringify(line)).join("\n") + (lines.length > 0 ? "\n" : ""));
console.log(`${lines.length} result(s) in results.jsonl`);
