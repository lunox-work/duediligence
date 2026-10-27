#!/usr/bin/env node
// The spec ladder's tables, from ladder/results.jsonl (bin/ladder/score.mjs).
//
//   node bin/ladder/report.mjs [task...]           the curve: macro oracle match per level and arm
//   node bin/ladder/report.mjs [task...] --rules   the same per rule, with each rule's status at each level
//   node bin/ladder/report.mjs <task> --gate       exit 5 when spec-only at L4 already scores ≥ 95%
//   node bin/ladder/report.mjs [task...] --check   cases most L0 control runs answer otherwise than the oracle
//   node bin/ladder/report.mjs --pool lcb_           pass rate over every task with that prefix, by platform,
//                                                    and per level how many problems each arm wins
//   node bin/ladder/report.mjs --gate-each lcb_      the tasks with that prefix spec-only fails at L4, one per line
//
// Refused runs are counted as runs and score 0, the same as in the table's n.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { args } from "../lib.mjs";
import { TASKS, levelsOf } from "./build.mjs";
import { readResults } from "./score.mjs";

const COLUMNS = [
  ["spec-only", "a"],
  ["self-tested", "a"],
  ["double-blind", "a"],
  ["double-blind-own", "a"],
  ["double-blind", "b"],
  ["double-blind-own", "b"],
];
const label = ([arm, condition]) => (condition === "b" ? `${arm} B` : arm);
const pct = (x) => (x === null ? "" : `${(x * 100).toFixed(1)}`);
const mean = (xs) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);
const words = (task, level) => readFileSync(join(TASKS, task, `L${level}.md`), "utf8").split(/\s+/).filter(Boolean).length;

/** Runs of one cell; condition B at L0 is condition A, since both use the L0 suite. */
const cell = (lines, task, level, [arm, condition]) =>
  lines.filter(
    (line) => line.task === task && line.level === level && line.arm === arm && line.condition === (level === 0 ? "a" : condition),
  );
const score = (line) => (line.refused.length > 0 ? 0 : line.oracle.macro);

function table(head, rows) {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => String(row[i]).length)));
  const fmt = (row) => `| ${row.map((v, i) => String(v).padStart(i === 0 ? 0 : widths[i]).padEnd(widths[i])).join(" | ")} |`;
  return [fmt(head), `| ${widths.map((w) => "-".repeat(w)).join(" | ")} |`, ...rows.map(fmt)].join("\n");
}

const { options, rest } = args();
const lines = readResults();
const tasks = rest.length > 0 ? rest : [...new Set(lines.map((line) => line.task))].sort();

// Per problem, not per run: a problem is the unit, and its runs share it.
if (typeof options["gate-each"] === "string") {
  const prefix = options["gate-each"];
  const all = [...new Set(lines.filter((line) => line.task.startsWith(prefix)).map((line) => line.task))].sort();
  const kept = all.filter((task) => {
    const runs = cell(lines, task, 4, ["spec-only", "a"]);
    return runs.length > 0 && runs.every((line) => score(line) === 0);
  });
  console.error(`${kept.length} of ${all.length} ${prefix} tasks kept: spec-only fails them from the title and format alone`);
  console.log(kept.join("\n"));
  process.exit(0);
}
if (typeof options.pool === "string") {
  const prefix = options.pool;
  const platformOf = (task) => JSON.parse(readFileSync(join(TASKS, task, "source.json"), "utf8")).platform;
  // Only the problems the gate kept (they have L0 runs). Spec-only's first
  // L4 run is the gate itself, which kept exactly the problems it failed,
  // so it is left out of every comparison: a fresh run 2 stands for it.
  const pooled = [...new Set(lines.filter((line) => line.task.startsWith(prefix) && line.level === 0).map((line) => line.task))].sort();
  const isGate = (line) => line.arm === "spec-only" && line.level === 4 && line.condition === "a" && line.run === 1;
  for (const platform of [...new Set(pooled.map(platformOf))].sort()) {
    const group = pooled.filter((task) => platformOf(task) === platform);
    const rate = (task, level, column) => mean(cell(lines, task, level, column).filter((line) => !isGate(line)).map(score));
    const rows = [0, 1, 2, 3, 4].map((level) => [
      `L${level}`,
      ...COLUMNS.map((column) => {
        const rates = group.map((task) => rate(task, level, column)).filter((x) => x !== null);
        return rates.length === 0 ? "" : `${pct(mean(rates))} (${rates.length})`;
      }),
    ]);
    console.log(`\n${platform}: pass rate over ${group.length} problems, % (problems). B: public suite from L0.\n`);
    console.log(table(["level", ...COLUMNS.map(label)], rows));
    const pairs = [
      [["double-blind", "a"], ["spec-only", "a"]],
      [["double-blind", "b"], ["spec-only", "a"]],
      [["double-blind", "b"], ["double-blind", "a"]],
    ];
    const wins = [0, 1, 2, 3, 4].map((level) => [
      `L${level}`,
      ...pairs.map(([x, y]) => {
        let ahead = 0, behind = 0, tied = 0;
        for (const task of group) {
          const a = rate(task, level, x);
          const b = rate(task, level, y);
          if (a === null || b === null) continue;
          if (a > b) ahead += 1;
          else if (a < b) behind += 1;
          else tied += 1;
        }
        return ahead + behind + tied === 0 ? "" : `${ahead} / ${behind} / ${tied}`;
      }),
    ]);
    console.log(`\n${platform}: problems ahead / behind / tied\n`);
    console.log(table(["level", ...pairs.map(([x, y]) => `${label(x)} vs ${label(y)}`)], wins));
  }
  process.exit(0);
}

if (options.gate === true) {
  const runs = cell(lines, tasks[0], 4, ["spec-only", "a"]);
  if (runs.length === 0) {
    console.log(`${tasks[0]}: no spec-only L4 runs scored`);
    process.exit(1);
  }
  const m = mean(runs.map(score));
  const memorized = m >= 0.95;
  console.log(`${tasks[0]}: spec-only at L4 scores ${pct(m)}% over ${runs.length} run(s): ${memorized ? "memorized, drop the task" : "kept"}`);
  process.exit(memorized ? 5 : 0);
}

for (const task of tasks) {
  const levels = levelsOf(task);
  if (options.check === true) {
    const cases = JSON.parse(readFileSync(join(TASKS, task, "cases.json"), "utf8")).cases;
    const controls = lines.filter((line) => line.task === task && line.level === 0 && ["spec-only", "self-tested"].includes(line.arm) && line.refused.length === 0);
    const misses = new Map();
    for (const line of controls) for (const id of line.failed) misses.set(id, (misses.get(id) ?? 0) + 1);
    const flagged = cases.filter((item) => controls.length >= 3 && (misses.get(item.id) ?? 0) / controls.length >= 0.6);
    console.log(`\n${task}: ${flagged.length} case(s) at least 60% of ${controls.length} L0 control runs answer otherwise than the oracle`);
    for (const item of flagged) console.log(`- ${item.id} ${item.rule} ${JSON.stringify(item.args)} → ${JSON.stringify(item.expected)} (${misses.get(item.id)}/${controls.length})`);
    continue;
  }
  if (options.rules === true) {
    const statuses = JSON.parse(readFileSync(join(TASKS, task, "rules.json"), "utf8")).rules;
    const mark = { full: "F", rule: "R", partial: "P", absent: "-" };
    for (const level of levels) {
      const rows = Object.entries(statuses).map(([rule, status]) => [
        `${rule} ${mark[status[`L${level}`]]}`,
        ...COLUMNS.map((column) => {
          const runs = cell(lines, task, level, column).filter((line) => line.refused.length === 0);
          return pct(mean(runs.map((line) => line.perRule[rule].matched / line.perRule[rule].cases)));
        }),
      ]);
      console.log(`\n${task} L${level}, oracle match per rule (status F full, R rule, P partial, - absent)\n`);
      console.log(table(["rule", ...COLUMNS.map(label)], rows));
    }
    continue;
  }
  const rows = levels.map((level) => [
    `L${level} (${words(task, level)} words)`,
    ...COLUMNS.map((column) => {
      const runs = cell(lines, task, level, column);
      return runs.length === 0 ? "" : `${pct(mean(runs.map(score)))} (${runs.length})`;
    }),
  ]);
  console.log(`\n${task}: oracle match, macro average over rules, % (runs). B: public suite from L0.\n`);
  console.log(table(["level", ...COLUMNS.map(label)], rows));
}
