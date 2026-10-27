#!/usr/bin/env node
// Scores every ladder run against its oracle and writes
// ladder/results.jsonl, one line per run. Judged as bin/grade.mjs judges:
// the submission's src/ alone on fresh trees, public suite then hidden
// suite, where the hidden suite is the oracle's cases. A run that touched
// anything outside src/ and its arm's own tests is `refused` and scores
// nothing. Never touches results.jsonl, which is grade.mjs's.
//
// Per run: the oracle match per rule (matched/cases), its macro average
// (each rule weighs the same; the pre-registered score) and the ids of
// the cases it got wrong, for the oracle check in report.mjs. A
// LiveCodeBench task (`lcb_*`) has no rules: its hidden suite stops at the
// first failing case, as the benchmark does, so it scores 1 when every
// case passes and 0 otherwise, as one rule `all`.
//
//   node bin/ladder/score.mjs [--force]

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, RUNS, args, count, judge, log, readJson, specDir, testsOf, variantArm } from "../lib.mjs";

export const RESULTS = join(ROOT, "ladder", "results.jsonl");
const SLUG = /^ladder-([a-z0-9_]+)-l(\d)(-b)?$/;

export const readResults = () =>
  existsSync(RESULTS)
    ? readFileSync(RESULTS, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
    : [];

const isMain = process.argv[1]?.endsWith("bin/ladder/score.mjs");
if (isMain) {
  const { options } = args();
  const results = new Map(readResults().map((line) => [line.key, line]));
  const slugs = existsSync(RUNS) ? readdirSync(RUNS).filter((name) => SLUG.test(name)).sort() : [];
  for (const slug of slugs) {
    const [, task, level, b] = SLUG.exec(slug);
    const calibration = readJson(join(specDir(slug), "calibration.json"), null);
    if (calibration?.status !== "ok") continue;
    const lcb = task.startsWith("lcb_");
    const cases = lcb
      ? [{ id: "all", rule: "all" }]
      : JSON.parse(readFileSync(join(specDir(slug), "tests", "private", "cases.json"), "utf8")).cases;
    const ruleOf = new Map(cases.map((item) => [`tests/private/oracle.test.ts :: ${item.rule} ${item.id}`, item.rule]));
    for (const variant of readdirSync(join(RUNS, slug)).sort()) {
      const arm = variantArm(variant);
      if (arm === null) continue;
      const dir = join(RUNS, slug, variant);
      for (const n of readdirSync(dir).filter((name) => /^\d+$/.test(name)).sort((x, y) => x - y)) {
        const key = `${slug}/${variant}/${n}`;
        const run = readJson(join(dir, n, "run.json"), null);
        if (run === null || (results.has(key) && options.force !== true)) continue;
        const allowed = (path) => path.startsWith("src/") || arm.own.some((own) => path.startsWith(own));
        const refused = run.changes.filter((item) => !allowed(item.path) || item.symlink === true);
        const submission = join(dir, n, "submission", "src");
        const perRule = {};
        for (const item of cases) perRule[item.rule] ??= { matched: 0, cases: 0 };
        for (const item of cases) perRule[item.rule].cases += 1;
        let publicCount = { passed: 0, total: calibration.publicIds.length };
        let failed = cases.map((item) => item.id);
        if (refused.length === 0 && existsSync(submission)) {
          const judged = judge(slug, submission);
          publicCount = count(judged.public, calibration.publicIds);
          const ok = new Set(testsOf(judged.hidden).filter((test) => test.ok).map((test) => test.id));
          if (lcb) {
            const passed = count(judged.hidden, calibration.kept);
            perRule.all.matched = passed.passed === passed.total ? 1 : 0;
            failed = perRule.all.matched === 1 ? [] : ["all"];
          } else {
            for (const id of ok) if (ruleOf.has(id)) perRule[ruleOf.get(id)].matched += 1;
            failed = cases.filter((item) => !ok.has(`tests/private/oracle.test.ts :: ${item.rule} ${item.id}`)).map((item) => item.id);
          }
        }
        const rules = Object.values(perRule);
        const line = {
          key,
          task,
          level: Number(level),
          condition: b ? "b" : "a",
          arm: arm.name,
          variant,
          run: Number(n),
          refused: refused.map((item) => `${item.path} (${item.change})`),
          public: publicCount,
          oracle: {
            matched: rules.reduce((sum, rule) => sum + rule.matched, 0),
            cases: cases.length,
            macro: rules.reduce((sum, rule) => sum + rule.matched / rule.cases, 0) / rules.length,
          },
          perRule,
          failed,
          peekAttempts: run.peeks.length,
          agent: {
            model: run.session.model,
            ok: run.session.ok,
            timedOut: run.session.timedOut,
            costUsd: run.session.costUsd,
            turns: run.session.turns,
            minutes: Math.round(run.session.durationMs / 6000) / 10,
          },
          scoredAt: new Date().toISOString(),
        };
        results.set(key, line);
        log(key, `oracle ${line.oracle.matched}/${line.oracle.cases} (macro ${(line.oracle.macro * 100).toFixed(1)}%), public ${publicCount.passed}/${publicCount.total}`, refused.length ? "REFUSED" : "");
      }
    }
  }
  const lines = [...results.values()].sort((a, b) => a.key.localeCompare(b.key, "en", { numeric: true }));
  writeFileSync(RESULTS, lines.map((line) => JSON.stringify(line)).join("\n") + (lines.length ? "\n" : ""));
  console.log(`${lines.length} ladder run(s) in ladder/results.jsonl`);
}
