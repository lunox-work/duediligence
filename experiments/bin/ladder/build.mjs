#!/usr/bin/env node
// Step 1 of the spec ladder (ladder/README.md). For each task: draws the
// rule-tagged cases (ladder/tasks/<task>/task.mjs, seeded), asks the
// oracle for every answer, and requires the task's reference, written from
// L0.md, to agree on every case, so L0 states what the oracle does. Then
// writes one spec per level, specs/ladder-<task>-l<n>/:
//
//   spec.md            ladder/tasks/<task>/L<n>.md
//   skeleton/src/      the task's fixed interface, the same at every level
//   tests/private/     oracle.test.ts and cases.json: the oracle's answers
//                      are the hidden suite, as with LiveCodeBench
//   toolchain.json     node, no reference session, public suite generated
//
// Every level shares one cases.json, so levels differ only in the spec.
// An existing level keeps its hidden suite unless --force, since its
// stored runs were judged by it.
//
//   node bin/ladder/build.mjs <task...> [--seed 1] [--force]

import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { ROOT, SPECS, args, copy, log, writeJson } from "../lib.mjs";

export const TASKS = join(ROOT, "ladder", "tasks");
export const levelsOf = (task) =>
  readdirSync(join(TASKS, task))
    .map((name) => /^L(\d)\.md$/.exec(name)?.[1])
    .filter((n) => n !== undefined)
    .map(Number)
    .sort();
export const levelSlug = (task, level, condition = "a") =>
  `ladder-${task}-l${level}${condition === "b" ? "-b" : ""}`;

/** mulberry32: the same seed draws the same cases on every machine. */
function rng(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (items) => items[Math.floor(next() * items.length)];
  const pickN = (items, n) => {
    const pool = [...items];
    return Array.from({ length: n }, () => pool.splice(Math.floor(next() * pool.length), 1)[0]);
  };
  return { next, pick, pickN, bool: () => next() < 0.5, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)) };
}

/** What a call returned or threw, in the shape cases.json stores. */
export function outcome(call) {
  try {
    return { value: call() };
  } catch (error) {
    return { threw: error instanceof Error ? error.message : String(error) };
  }
}
export const agrees = (got, expected) =>
  expected !== null && typeof expected === "object" && "throws" in expected
    ? got.threw !== undefined && got.threw.toLowerCase().includes(expected.throws)
    : got.threw === undefined && isDeepStrictEqual(got.value, expected);

async function build(task, seed, force) {
  const dir = join(TASKS, task);
  const spec = await import(join(dir, "task.mjs"));
  const drawn = spec.cases(rng(seed)).map((item, at) => ({ id: `c${String(at + 1).padStart(4, "0")}`, ...item }));
  const expected = await spec.oracle(drawn);
  const cases = drawn.map((item, at) => ({ ...item, expected: expected[at] }));

  const reference = await import(join(dir, "reference.mjs"));
  const disagreements = cases.filter((item) => !agrees(outcome(() => reference[spec.fn](...item.args)), item.expected));
  for (const item of disagreements.slice(0, 20))
    log(task, `reference disagrees on ${item.id} (${item.rule}): ${JSON.stringify(item.args)} → oracle ${JSON.stringify(item.expected)}`);
  if (disagreements.length > 0) {
    log(task, `FAILED: reference disagrees with the oracle on ${disagreements.length} of ${cases.length}; fix L0.md and the reference, or the case generator`);
    return false;
  }

  const perRule = {};
  for (const item of cases) {
    const tally = (perRule[item.rule] ??= { cases: 0, positive: 0 });
    tally.cases += 1;
    if (item.expected === true || (typeof item.expected === "object" && item.expected !== null)) tally.positive += 1;
  }
  const record = { task, seed, fn: spec.fn, oracle: spec.oracleVersion?.() ?? "reference", builtAt: new Date().toISOString(), perRule, cases };
  writeJson(join(dir, "cases.json"), record);

  for (const level of levelsOf(task)) {
    const out = join(SPECS, levelSlug(task, level));
    const hidden = join(out, "tests", "private");
    copy(join(dir, `L${level}.md`), join(out, "spec.md"));
    copy(join(dir, "skeleton.ts"), join(out, "skeleton", "src", "index.ts"));
    writeJson(join(out, "toolchain.json"), { name: "node", reference: false, generate: ["public"] });
    if (existsSync(hidden) && !force) {
      const stored = JSON.parse(readFileSync(join(hidden, "cases.json"), "utf8"));
      if (!isDeepStrictEqual(stored.cases, cases.map(({ id, rule, args, expected }) => ({ id, rule, args, expected }))))
        log(task, `L${level}: hidden suite differs from the new cases; kept the stored one (--force replaces it and stales its runs)`);
      continue;
    }
    rmSync(hidden, { recursive: true, force: true });
    copy(join(ROOT, "ladder", "oracle.test.ts"), join(hidden, "oracle.test.ts"));
    writeJson(join(hidden, "cases.json"), { fn: spec.fn, cases: cases.map(({ id, rule, args, expected }) => ({ id, rule, args, expected })) });
  }
  log(task, `${cases.length} cases over ${Object.keys(perRule).length} rules, reference agrees on all; levels ${levelsOf(task).map((n) => `L${n}`).join(" ")}`);
  return true;
}

const isMain = process.argv[1]?.endsWith("bin/ladder/build.mjs");
if (isMain) {
  const { options, rest } = args();
  if (rest.length === 0) {
    console.error("usage: node bin/ladder/build.mjs <task...> [--seed 1] [--force]");
    process.exit(1);
  }
  let ok = true;
  for (const task of rest) ok = (await build(task, Number(options.seed ?? 1), options.force === true)) && ok;
  process.exit(ok ? 0 : 1);
}
