#!/usr/bin/env node
// Step 6. Prints, from results.jsonl and the hand classification of each
// overfit in classifications.json:
//
//   { "<slug>/<arm>/<n>": { "class": "real" | "spec-gap" | "judge-defect", "note": "..." } }
//
// `judge-defect` is a hidden test that is wrong on its own terms (a
// benchmark case whose expected output breaks the statement, or an exact
// comparison on a problem that accepts any valid answer); it says nothing
// about the submission.
//
// the sentence and per-spec table for the double-blind arm, then every
// arm side by side on the same suites.
//
//   node bin/report.mjs

import { existsSync, readFileSync } from "node:fs";
import {
  ARMS,
  CLASSIFICATIONS,
  RESULTS,
  readJson,
  variantArm,
} from "./lib.mjs";

if (!existsSync(RESULTS)) {
  console.log("No results.jsonl yet; run bin/grade.mjs.");
  process.exit(1);
}
const results = readFileSync(RESULTS, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .map((line) => ({ ...line, variant: line.variant ?? line.arm }));
const classes = readJson(CLASSIFICATIONS, {});
const classOf = (line) =>
  classes[`${line.spec}/${line.variant}/${line.run}`]?.class ?? "unclassified";
const whole = (suite) => suite.total > 0 && suite.passed === suite.total;
const percent = (part, all) =>
  all === 0 ? "-" : `${Math.round((100 * part) / all)}%`;
const money = (lines) =>
  `$${lines.reduce((sum, line) => sum + (line.agent.costUsd ?? 0), 0).toFixed(2)}`;

const tally = (lines) => {
  const overfit = lines.filter((line) => line.verdict === "overfit");
  return {
    runs: lines.length,
    passed: lines.filter((line) => line.verdict === "passed").length,
    overfit: overfit.length,
    real: overfit.filter((line) => classOf(line) === "real").length,
    specGap: overfit.filter((line) => classOf(line) === "spec-gap").length,
    judgeDefect: overfit.filter((line) => classOf(line) === "judge-defect").length,
    unclassified: overfit.filter((line) => classOf(line) === "unclassified")
      .length,
    refused: lines.filter((line) => line.verdict === "refused").length,
    incomplete: lines.filter((line) => line.verdict === "incomplete").length,
    peeks: lines.reduce((sum, line) => sum + line.peekAttempts, 0),
  };
};

const blind = results.filter((line) => line.variant === "double-blind");
const all = tally(blind);
console.log("## Double-blind\n");
console.log(
  `${all.overfit} of ${all.passed + all.overfit} agent submissions passed their own tests and failed the independent ones` +
    ` (${all.real} real, ${all.specGap} spec-gap${all.judgeDefect > 0 ? `, ${all.judgeDefect} judge-defect` : ""}${all.unclassified > 0 ? `, ${all.unclassified} not yet classified` : ""}).` +
    ` ${all.refused} were refused for touching tests or the harness.` +
    (all.incomplete > 0
      ? ` ${all.incomplete} did not pass their own tests and are not counted.`
      : ""),
);
console.log("");
console.log(
  "| spec | runs | passed | overfit (real / spec-gap / judge-defect) | refused | incomplete | hidden passed | agent cost |",
);
console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
const specs = [...new Set(results.map((line) => line.spec))].sort();
for (const spec of specs) {
  const lines = blind.filter((line) => line.spec === spec);
  if (lines.length === 0) continue;
  const t = tally(lines);
  const hidden = lines
    .filter((line) => line.verdict === "passed" || line.verdict === "overfit")
    .map((line) => `${line.hidden.passed}/${line.hidden.total}`)
    .join(", ");
  console.log(
    `| ${spec} | ${t.runs} | ${t.passed} | ${t.overfit} (${t.real} / ${t.specGap} / ${t.judgeDefect}) | ${t.refused} | ${t.incomplete} | ${hidden || "-"} | ${money(lines)} |`,
  );
}

// Arms in ARMS order, the default model's run before any other model's.
const order = Object.keys(ARMS);
const rank = (variant) => order.indexOf(variantArm(variant).name);
const arms = [...new Set(results.map((line) => line.variant))].sort(
  (a, b) =>
    (variantArm(a).name === a ? 0 : 1) - (variantArm(b).name === b ? 0 : 1) ||
    rank(a) - rank(b) ||
    a.localeCompare(b),
);
console.log("\n## Arms on the same suites\n");
console.log(
  "Only double-blind saw the public suite; spec-only saw no tests; self-tested wrote its own. Refused runs count as failing both.\n",
);
console.log(
  "| arm | agent model | runs | all public pass | all hidden pass | public tests passed | hidden tests passed | refused | mean minutes | agent cost |",
);
console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const arm of arms) {
  const lines = results.filter((line) => line.variant === arm);
  const sum = (key, field) =>
    lines.reduce((total, line) => total + line[key][field], 0);
  const minutes =
    lines.reduce((total, line) => total + line.agent.minutes, 0) / lines.length;
  console.log(
    `| ${arm} | ${[...new Set(lines.map((line) => line.agent.model))].join(", ")} | ${lines.length} | ${lines.filter((line) => whole(line.public)).length} | ${lines.filter((line) => whole(line.hidden)).length} | ${percent(sum("public", "passed"), sum("public", "total"))} | ${percent(sum("hidden", "passed"), sum("hidden", "total"))} | ${lines.filter((line) => line.verdict === "refused").length} | ${minutes.toFixed(1)} | ${money(lines)} |`,
  );
}
// The comparison's measure: a run that passes every test of both suites,
// which for the control arms are both unseen.
console.log(
  "\nRuns passing both suites, and the share of all their tests passed:\n",
);
console.log(`| spec | ${arms.join(" | ")} |`);
console.log(`| --- | ${arms.map(() => "---:").join(" | ")} |`);
for (const spec of specs) {
  const cells = arms.map((arm) => {
    const lines = results.filter(
      (line) => line.spec === spec && line.variant === arm,
    );
    if (lines.length === 0) return "-";
    const both = lines.filter(
      (line) => whole(line.public) && whole(line.hidden),
    ).length;
    const passed = lines.reduce(
      (sum, line) => sum + line.public.passed + line.hidden.passed,
      0,
    );
    const total = lines.reduce(
      (sum, line) => sum + line.public.total + line.hidden.total,
      0,
    );
    return `${both} / ${lines.length} (${percent(passed, total)})`;
  });
  console.log(`| ${spec} | ${cells.join(" | ")} |`);
}

const peeks = results.reduce((sum, line) => sum + line.peekAttempts, 0);
if (peeks > 0)
  console.log(
    `\n${peeks} attempt(s) to read outside the workdir; see runs/*/*/*/run.json.`,
  );
