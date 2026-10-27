#!/usr/bin/env node
// Judges any src/ against a calibrated spec the way bin/grade.mjs judges a
// run (SKILL.md, step 5): the src/ alone, copied onto fresh trees, the
// public suite on one and the hidden suite on another. Prints the verdict,
// the counts and the spec scenarios the failing hidden tests are keyed to,
// which name nothing the spec does not. Writes nothing; results.jsonl is
// grade.mjs's.
//
//   node bin/judge.mjs <slug> <src-dir> [--detail]
//
// --detail adds each failing hidden test's name and message. That is for
// the person classifying an overfit, never for the agent that wrote the
// code: it would turn the hidden suite into a public one.
//
// Exit 0 passed, 2 overfit, 1 incomplete or not judged.

import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { args, count, judge, readJson, specDir, testsOf } from "./lib.mjs";

const { options, rest } = args();
const [slug, src] = rest;
if (slug === undefined || src === undefined) {
  console.error("usage: node bin/judge.mjs <slug> <src-dir> [--detail]");
  process.exit(1);
}
const calibration = readJson(join(specDir(slug), "calibration.json"), null);
if (calibration?.status !== "ok") {
  console.error(`${slug}: not calibrated; run node bin/prepare.mjs ${slug} first.`);
  process.exit(1);
}
if (!existsSync(join(src, "index.ts"))) {
  console.error(`${src} has no index.ts; pass the submission's src/ folder.`);
  process.exit(1);
}

// The same key and verdict rules as bin/grade.mjs (`scenarioOf`, `verdict`),
// which runs its grading on import.
const scenarioOf = (id) => /^\[([a-z]+-\d+)\] /.exec(id.split(" :: ").at(-1))?.[1] ?? null;
const judged = judge(slug, realpathSync(src));
const publicCount = count(judged.public, calibration.publicIds);
const hiddenCount = count(judged.hidden, calibration.kept);
const reported = new Map(testsOf(judged.hidden).map((test) => [test.id, test]));
const failures = calibration.kept
  .filter((id) => reported.get(id)?.ok !== true)
  .map((id) => ({ id, message: reported.get(id)?.error?.message ?? "did not run" }));
const verdict =
  publicCount.passed !== publicCount.total
    ? "incomplete"
    : hiddenCount.total > 0 && hiddenCount.passed === hiddenCount.total
      ? "passed"
      : "overfit";

console.log(`${slug}: ${verdict}. Public ${publicCount.passed}/${publicCount.total}, hidden ${hiddenCount.passed}/${hiddenCount.total}.`);
if (!judged.public.compiled || !judged.hidden.compiled)
  console.log(`Did not compile:\n${(judged.hidden.compileOutput || judged.public.compileOutput).slice(0, 4000)}`);
const scenarios = [...new Set(failures.map((item) => scenarioOf(item.id)).filter(Boolean))].sort();
if (scenarios.length > 0) console.log(`Failing scenarios: ${scenarios.join(", ")}`);
if (verdict === "incomplete")
  for (const test of testsOf(judged.public).filter((item) => !item.ok)) console.log(`public: ${test.id}`);
if (options.detail === true)
  for (const item of failures) console.log(`hidden: ${item.id}\n  ${item.message.split("\n")[0]}`);
process.exit(verdict === "passed" ? 0 : verdict === "overfit" ? 2 : 1);
