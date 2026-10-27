#!/usr/bin/env node
// A blind referee for every disagreement behind acceptance.jsonl, on
// another model than the one that wrote the spec's suites and reference:
//
// - `suite`: a run's own tests pass, and a test of a suite it never ran
//   (hidden; public too for an arm that never saw it) fails on its code.
//   One case per distinct test, however many runs it failed.
// - `own`: a run's own test fails on the reference. One case per test,
//   sampled per spec (--own-sample, seeded by the case id).
//
// The referee gets spec.md, the implementation that fails, and the one
// test, cut out of its file with comments and the `[kind-n]` key removed,
// so nothing says which suite it came from or who wrote either side
// (prompts/referee.md). It answers whether the spec requires what the test
// asserts, and how likely the input is. One line per case goes to
// referee.jsonl.
//
//   node bin/referee.mjs [slug...] [--model claude-fable-5-1] [--own-sample 6] [--concurrency 2] [--min-free 25] [--dry]
//   node bin/referee.mjs --report

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  RESULTS,
  ROOT,
  RUNS,
  args,
  briefOfVariant,
  claude,
  copy,
  discard,
  listFiles,
  log,
  pool,
  prompt,
  readJson,
  sha256,
  specDir,
  variantArm,
  workdir,
} from "./lib.mjs";

const ts = createRequire(join(ROOT, "template", "package.json"))("typescript");
const ACCEPTANCE = join(ROOT, "acceptance.jsonl");
const OUT = join(ROOT, "referee.jsonl");
const readLines = (path) =>
  existsSync(path)
    ? readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
    : [];
const ownGreen = (line) => line.own !== null && line.own.compiled && line.own.total > 0 && line.own.passed === line.own.total;
const runDir = (line) => join(RUNS, line.spec, line.variant, String(line.run));
const stripKey = (name) => name.replace(/^\[[a-z]+-\d+\]\s*/, "");

/**
 * `source` with only the test named `name`: other test calls dropped,
 * comments removed, a `[kind-n]` key taken off its name. A test inside a
 * describe block keeps its whole top-level block. Null when not found.
 */
export function oneTest(source, fullName) {
  // The runner names a test inside describe blocks `outer > inner`.
  const name = fullName.split(" > ").at(-1);
  const file = ts.createSourceFile("test.ts", source, ts.ScriptTarget.Latest, true);
  const isTest = (node) =>
    ts.isExpressionStatement(node) &&
    ts.isCallExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    ["test", "it"].includes(node.expression.expression.text);
  const titleOf = (node) => {
    const first = node.expression.arguments[0];
    return first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) ? first.text : null;
  };
  const contains = (node) => {
    let found = false;
    const visit = (child) => {
      if (found) return;
      if (isTest(child) && titleOf(child) === name) found = true;
      else ts.forEachChild(child, visit);
    };
    visit(node);
    return found;
  };
  let kept = false;
  const statements = file.statements.filter((statement) => {
    if (isTest(statement)) {
      const match = titleOf(statement) === name;
      kept ||= match;
      return match;
    }
    if (contains(statement)) {
      kept = true;
      return true;
    }
    return !(ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression));
  });
  if (!kept) return null;
  const rename = (context) => (root) => {
    const visit = (node) =>
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.text === name
        ? ts.factory.createStringLiteral(stripKey(name))
        : ts.visitEachChild(node, visit, context);
    return ts.visitNode(root, visit);
  };
  const cut = ts.factory.updateSourceFile(file, statements);
  const [renamed] = ts.transform(cut, [rename]).transformed;
  return ts.createPrinter({ removeComments: true }).printFile(renamed);
}

/** A run's tests/own/<file>, recovered from its diff, or null. */
function ownFile(line, file) {
  const dir = workdir("referee-own");
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    spawnSync("git", ["apply", "--include=tests/own/*", join(runDir(line), "diff.patch")], { cwd: dir });
    const path = join(dir, "tests", "own", file);
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  } finally {
    discard(dir);
  }
}

/** Every case behind acceptance.jsonl, `suite` ones whole and `own` ones sampled. */
function cases(slugs, ownSample) {
  const suite = new Map();
  const own = new Map();
  const notCompiled = [];
  const accepted = new Map(readLines(ACCEPTANCE).map((line) => [`${line.spec}/${line.variant}/${line.run}`, line]));
  // Suite cases come from every arm's rejected runs, so the hidden suite's
  // precision is measured on all it rejected; `ownGreen` marks the runs
  // whose own tests passed. Both sides are refereed against spec.md, so
  // only runs that were given it. A red-team run games on purpose, and a
  // run failing most of the hidden suite crashed or did not finish; neither
  // is a disagreement about the spec.
  for (const line of readLines(RESULTS)) {
    if (slugs.length > 0 && !slugs.includes(line.spec)) continue;
    const arm = variantArm(line.variant);
    if (arm === null || arm.name === "red-team" || briefOfVariant(line.variant) !== "spec" || /-retry-/.test(line.variant)) continue;
    if (line.hidden.passed < line.hidden.total / 2) continue;
    if (line.verdict === "overfit" || (line.verdict === "incomplete" && !arm.publicTests)) {
      const grade = readJson(join(runDir(line), "grade.json"), null);
      if (grade === null || !existsSync(join(specDir(line.spec), "reference", "src"))) continue;
      const compiled = grade.hiddenCompiled && (arm.publicTests || grade.publicCompiled);
      if (!compiled) {
        notCompiled.push(`${line.spec}/${line.variant}/${line.run}`);
        continue;
      }
      const failures = [...grade.hiddenFailures, ...(arm.publicTests ? [] : grade.publicFailures)];
      for (const failure of failures) {
        const [path, name] = failure.id.split(" :: ");
        const id = `suite:${line.spec}:${failure.id}`;
        if (!suite.has(id))
          suite.set(id, {
            id,
            kind: "suite",
            spec: line.spec,
            suite: path.startsWith("tests/private/") ? "hidden" : "public",
            name,
            source: () => readFileSync(join(specDir(line.spec), path), "utf8"),
            src: join(runDir(line), "submission", "src"),
            message: failure.error?.message ?? "",
            runs: [],
            ownGreenRuns: [],
          });
        suite.get(id).runs.push(`${line.variant}/${line.run}`);
        const own = accepted.get(`${line.spec}/${line.variant}/${line.run}`);
        if (own !== undefined && ownGreen(own)) suite.get(id).ownGreenRuns.push(`${line.variant}/${line.run}`);
      }
    }
  }
  for (const line of readLines(ACCEPTANCE)) {
    if (slugs.length > 0 && !slugs.includes(line.spec)) continue;
    if (line.brief !== "spec") continue;
    for (const failure of line.ownOnReference?.compiled ? line.ownOnReference.failing : []) {
      const [file, name] = failure.id.split(" :: ");
      const id = `own:${line.spec}/${line.variant}/${line.run}:${failure.id}`;
      own.set(id, {
        id,
        kind: "own",
        spec: line.spec,
        suite: "own",
        name,
        source: () => ownFile(line, file),
        src: join(specDir(line.spec), "reference", "src"),
        message: failure.message,
        runs: [`${line.variant}/${line.run}`],
        ownGreen: ownGreen(line),
      });
    }
  }
  const sampled = [];
  const bySpec = Map.groupBy([...own.values()], (item) => item.spec);
  for (const items of bySpec.values())
    sampled.push(...items.sort((a, b) => sha256(a.id).localeCompare(sha256(b.id))).slice(0, ownSample));
  return { suite: [...suite.values()], own: sampled, ownTotal: own.size, notCompiled };
}

/** The referee's last line of JSON, or null. */
function verdictOf(text) {
  const line = text.trim().split("\n").reverse().find((row) => row.trim().startsWith("{"));
  try {
    const parsed = JSON.parse(line);
    return ["yes", "no", "open"].includes(parsed.requires) ? parsed : null;
  } catch {
    return null;
  }
}

function report() {
  const lines = readLines(OUT);
  const table = (rows, label) => {
    const count = (key, value) => rows.filter((row) => row[key] === value).length;
    console.log(
      `| ${label} | ${rows.length} | ${count("requires", "yes")} | ${count("requires", "open")} | ${count("requires", "no")} | ${count("severity", "typical")} / ${count("severity", "edge")} / ${count("severity", "adversarial")} |`,
    );
  };
  console.log("| cases | n | spec requires the test | open | test wrong | typical / edge / adversarial |");
  console.log("| --- | ---: | ---: | ---: | ---: | --- |");
  const suite = lines.filter((row) => row.kind === "suite");
  table(suite, "suite test fails a run, any arm");
  table(suite.filter((row) => row.suite === "hidden"), "… hidden tests only");
  table(suite.filter((row) => row.ownGreenRuns.length > 0), "suite test fails a run whose own tests pass");
  table(lines.filter((row) => row.kind === "own"), "own test fails the reference");
  // Per run: rejected rightly when any suite test it fails is one the spec requires.
  const runsOf = (rows, key) => new Set(rows.flatMap((row) => row[key].map((run) => `${row.spec}/${run}`)));
  const required = suite.filter((row) => row.requires === "yes");
  for (const [key, label] of [["runs", "runs rejected"], ["ownGreenRuns", "own-green runs rejected"]])
    console.log(`\n${label}: ${runsOf(suite, key).size}; failing a test the spec requires: ${runsOf(required, key).size}`);
}

const { options, rest } = args();
if (options.report === true) {
  report();
  process.exit(0);
}

const model = typeof options.model === "string" ? options.model : "claude-fable-5-1";
const { suite, own, ownTotal, notCompiled } = cases(rest, Number(options["own-sample"] ?? 6));
const done = new Set(readLines(OUT).map((line) => line.id));
const todo = [...suite, ...own].filter((item) => !done.has(item.id));
log(`${suite.length} suite case(s), ${own.length} own case(s) sampled of ${ownTotal}; ${todo.length} to referee;`, `${notCompiled.length} run(s) whose suite did not compile, not refereed`);
if (options.dry === true) {
  for (const item of todo) console.log(item.kind, item.spec, item.suite, item.runs.length, stripKey(item.name));
  process.exit(0);
}

const minFree = Number(options["min-free"] ?? 0);
const freePercent = () => {
  const out = spawnSync("memory_pressure", [], { encoding: "utf8" }).stdout ?? "";
  const match = /free percentage:\s*(\d+)%/.exec(out);
  return match === null ? 100 : Number(match[1]);
};
let halted = null;
await pool(todo, Number(options.concurrency ?? 2), async (item) => {
  while (minFree > 0 && freePercent() < minFree) await new Promise((resolve) => setTimeout(resolve, 30_000));
  if (halted !== null) return;
  const source = item.source();
  const test = source === null ? null : oneTest(source, item.name);
  if (test === null) {
    log(item.id, "test not found; skipped");
    return;
  }
  const dir = workdir(`referee-${item.spec}`);
  try {
    copy(join(specDir(item.spec), "spec.md"), join(dir, "spec.md"));
    copy(item.src, join(dir, "src"));
    for (const path of listFiles(join(dir, "src")).filter((path) => path.endsWith(".js"))) spawnSync("rm", [join(dir, "src", path)]);
    writeFileSync(join(dir, "test.ts"), test);
    writeFileSync(
      join(dir, "case.md"),
      `The test \`${stripKey(item.name)}\` in \`test.ts\` fails on the implementation in \`src/\` with:\n\n\`\`\`\n${item.message.replaceAll(item.name, stripKey(item.name))}\n\`\`\`\n`,
    );
    const transcript = join(RUNS, "_referee", `${sha256(item.id).slice(0, 16)}.jsonl`);
    const session = await claude({ cwd: dir, text: prompt("referee"), transcript, kind: "generate", model });
    if (session.apiError === "usage_limit_reached") {
      halted = session.finalText || session.apiError;
      return;
    }
    const verdict = verdictOf(session.finalText);
    const { source: _, ...record } = item;
    const line = { ...record, name: stripKey(item.name), ...(verdict ?? { requires: null }), model: session.model, costUsd: session.costUsd, transcript };
    writeFileSync(OUT, `${JSON.stringify(line)}\n`, { flag: "a" });
    log(item.kind, item.spec, line.requires, line.severity ?? "", `$${(session.costUsd ?? 0).toFixed(2)}`, line.name.slice(0, 70));
  } finally {
    discard(dir);
  }
});
if (halted !== null) {
  console.log(`halted on the account's usage limit (${halted}); rerun the same command after it resets`);
  process.exit(2);
}
report();
