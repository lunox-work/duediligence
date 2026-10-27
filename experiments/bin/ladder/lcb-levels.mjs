#!/usr/bin/env node
// The spec ladder on LiveCodeBench (ladder/README.md, "LiveCodeBench"). For
// each imported problem, specs/lcb-<platform>-<id>/, cuts its statement
// into five levels by the statement's own section headings, never by hand:
//
//   L0  the statement as the benchmark prompts it
//   L1  without the samples (AtCoder `Sample Input/Output n`, LeetCode `Example n:`)
//   L2  without the constraints as well
//   L3  the title, a short summary of the statement (one Opus session,
//       prompts/ladder-summary.md), and the input/output format
//   L4  the title and the input/output format
//
// The input/output format (AtCoder `Input` and `Output`, the `## Format`
// line and LeetCode's starter code) is kept at every level: it is the
// interface, like a skeleton. Writes ladder/tasks/lcb_<id>/L<n>.md and
// specs/ladder-lcb_<id>-l<n>/ with the problem's toolchain, skeleton and
// hidden suite (the benchmark's private cases); L0 also takes the public
// suite the LiveCodeBench pilot generated from the same statement.
//
//   node bin/ladder/lcb-levels.mjs [lcb-slug...] [--exclude a,b] [--concurrency 3] [--dry]
//
// --dry prints each problem's word counts and section kinds and writes nothing.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RUNS, SPECS, args, claude, copy, discard, log, pool, prompt, readJson, workdir, writeJson } from "../lib.mjs";
import { TASKS, levelSlug } from "./build.mjs";

const ATCODER = /^(Input|Output|Constraints|Sample Input \d+|Sample Output \d+)$/;
const LEETCODE = /^(Example \d+:|Constraints:)$/;
const kindOf = (head) =>
  head === null ? "statement" : /^Sample|^Example/.test(head) ? "sample" : /^Constraints/.test(head) ? "constraints" : head === "## Format" ? "format" : "io";

/** The statement as sections: the title, then runs of lines under each heading. */
function sections(text, platform) {
  const lines = text.split("\n");
  const title = lines[0];
  const heading = platform === "leetcode" ? LEETCODE : ATCODER;
  const out = [{ head: null, lines: [] }];
  for (const line of lines.slice(1)) {
    const bare = line.replace(/ /g, " ").trim();
    if (heading.test(bare) || bare === "## Format") out.push({ head: bare, lines: [line] });
    else out.at(-1).lines.push(line);
  }
  return { title, parts: out.map((part) => ({ ...part, kind: kindOf(part.head) })) };
}

const render = (title, parts) =>
  `${[title, ...parts.map((part) => part.lines.join("\n").trim())].filter(Boolean).join("\n\n")}\n`;

async function summarize(task, statement) {
  const dir = workdir(`${task}-summary`);
  writeFileSync(join(dir, "statement.md"), statement);
  const session = await claude({ cwd: dir, text: prompt("ladder-summary"), transcript: join(RUNS, `ladder-${task}-l3`, "generate", "summary.jsonl"), kind: "generate" });
  const path = join(dir, "summary.md");
  const text = existsSync(path) ? readFileSync(path, "utf8").trim() : null;
  discard(dir);
  return { text, costUsd: session.costUsd ?? 0 };
}

async function build(slug) {
  const source = join(SPECS, slug);
  const problem = readJson(join(source, "problem.json"));
  const task = `lcb_${problem.platform === "leetcode" ? `lc${problem.question_id}` : problem.question_id}`.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const dir = join(TASKS, task);
  const { title, parts } = sections(readFileSync(join(source, "spec.md"), "utf8"), problem.platform);
  const keep = (...kinds) => parts.filter((part) => kinds.includes(part.kind));
  const levels = {
    0: readFileSync(join(source, "spec.md"), "utf8"),
    1: render(title, keep("statement", "io", "constraints", "format")),
    2: render(title, keep("statement", "io", "format")),
    4: render(title, keep("io", "format")),
  };
  if (!keep("sample").length) log(task, "warning: no samples found to remove");
  if (dry) {
    const count = (text) => text.split(/\s+/).filter(Boolean).length;
    console.log(task, [0, 1, 2, 4].map((n) => `L${n} ${count(levels[n])}`).join(", "), parts.map((part) => part.kind[0]).join(""));
    return null;
  }
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, "L3.md"))) {
    const summary = await summarize(task, render(title, keep("statement")));
    if (summary.text === null || summary.text.split(/\s+/).length > 120) {
      log(task, `FAILED: summary ${summary.text === null ? "missing" : "too long"}`);
      return null;
    }
    writeFileSync(join(dir, "L3.md"), render(title, [{ lines: [summary.text] }, ...keep("io", "format")]));
    log(task, `summary $${summary.costUsd.toFixed(2)}`);
  }
  for (const [level, text] of Object.entries(levels)) writeFileSync(join(dir, `L${level}.md`), text);
  writeJson(join(dir, "source.json"), { from: slug, ...problem });
  for (const level of [0, 1, 2, 3, 4]) {
    const out = join(SPECS, levelSlug(task, level));
    copy(join(dir, `L${level}.md`), join(out, "spec.md"));
    for (const part of ["toolchain.json", "problem.json", "skeleton", "tests/private"]) copy(join(source, part), join(out, part));
    if (level === 0) copy(join(source, "tests", "public"), join(out, "tests", "public"));
  }
  return task;
}

const { options, rest } = args();
const dry = options.dry === true;
const exclude = new Set(String(options.exclude ?? "").split(",").filter(Boolean));
const slugs = (rest.length ? rest : readdirSync(SPECS).filter((name) => /^lcb-/.test(name)))
  .filter((slug) => !exclude.has(slug.replace(/^lcb-[a-z]+-/, "")))
  .filter((slug) => readJson(join(SPECS, slug, "calibration.json"), {}).status === "ok")
  .sort();
const tasks = (await pool(slugs, Number(options.concurrency ?? 3), build)).filter(Boolean);
for (const task of tasks) {
  const words = [0, 1, 2, 3, 4].map((n) => readFileSync(join(TASKS, task, `L${n}.md`), "utf8").split(/\s+/).filter(Boolean).length);
  console.log(`${task} ${words.join(" ")}`);
}
console.log(`${tasks.length} of ${slugs.length} problems laddered`);
process.exit(tasks.length === slugs.length ? 0 : 1);
