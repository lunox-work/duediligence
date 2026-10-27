#!/usr/bin/env node
// What a change request broke (FINDINGS.md, "A change to code in use"). For each
// change spec (bin/change.mjs), the code before the change is judged by the
// hidden suite once: a kept hidden test it passes is behaviour the change
// keeps, one it fails is the change itself. A graded run's hidden failures
// then split into regressions (behaviour that worked before the run and
// fails after it) and misses on the change. No model calls.
//
//   node bin/change-report.mjs [slug-change...]

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { RESULTS, RUNS, args, count, judge, readJson, specDir, specSlugs, startSrc, testsOf } from "./lib.mjs";

const { rest } = args();
const slugs = specSlugs(rest).filter((slug) => startSrc(slug) !== undefined);
const results = readFileSync(RESULTS, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));

const rows = [];
for (const slug of slugs) {
  const calibration = readJson(join(specDir(slug), "calibration.json"), null);
  if (calibration?.status !== "ok") continue;
  const before = judge(slug, startSrc(slug));
  const ok = new Set(testsOf(before.hidden).filter((test) => test.ok).map((test) => test.id));
  const kept = calibration.kept.filter((id) => ok.has(id));
  const changed = calibration.kept.filter((id) => !ok.has(id));
  const publicBefore = count(before.public, calibration.publicIds);
  console.log(
    `${slug}: ${kept.length} hidden tests the code before the change passes, ${changed.length} it fails; public ${publicBefore.passed}/${publicBefore.total} before`,
  );
  const keptSet = new Set(kept);
  for (const line of results.filter((line) => line.spec === slug)) {
    const grade = readJson(join(RUNS, slug, line.variant, String(line.run), "grade.json"), null);
    const failures = (grade?.hiddenFailures ?? []).map((item) => item.id);
    rows.push({
      slug,
      variant: line.variant,
      verdict: line.verdict,
      regressions: failures.filter((id) => keptSet.has(id)).length,
      changeMisses: failures.filter((id) => !keptSet.has(id)).length,
      graded: grade !== null,
    });
  }
}

const variants = [...new Set(rows.map((row) => row.variant))].sort();
const table = (title, of) => {
  console.log(`\n${title}\n`);
  console.log(`| spec | ${variants.join(" | ")} |`);
  console.log(`| --- | ${variants.map(() => "---:").join(" | ")} |`);
  for (const slug of [...slugs, "all"]) {
    const cells = variants.map((variant) => {
      const mine = rows.filter((row) => row.variant === variant && (slug === "all" || row.slug === slug));
      return mine.length === 0 ? "-" : `${mine.filter(of).length} / ${mine.length}`;
    });
    console.log(`| ${slug} | ${cells.join(" | ")} |`);
  }
};
table("Runs passing every test of both suites", (row) => row.verdict === "passed");
table("Runs with no regression (every hidden test the old code passed still passes)", (row) => row.graded && row.regressions === 0);
table("Runs that made the change (no hidden test the old code failed still fails)", (row) => row.graded && row.changeMisses === 0);
