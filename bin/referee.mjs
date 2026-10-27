#!/usr/bin/env node
// A blind referee for rejected runs, on any backend (lib.mjs `session`,
// `--backend`). Ported from the archive's bin/referee.mjs.
//
// A case is one test that fails on one implementation. The referee gets
// spec.md, that implementation's src/ and the one test, cut out of its
// file with comments and the `[kind-n]` key removed (TypeScript; a Python
// test file is given whole), so nothing says which suite it came from or
// who wrote either side (prompts/referee.md). It answers whether the spec
// requires what the test asserts, and how likely the input is. One line per
// case goes to the --out file (default HOME/referee.jsonl).
//
// Cases come from:
// - this home's graded runs (default): every `overfit` run's failing
//   hidden tests (grade.json), one case per distinct test, `kind: suite`;
// - --cases <jsonl>: a case file written before, such as the archive's
//   referee.jsonl, refereed again on another backend; its spec, test and
//   implementation are read from --archive (default ../double-blind-
//   experiment): `suite` cases from the spec's suite and the run's
//   submission, `own` cases from the run's diff and the reference.
//
// --report prints the archive's table for the --out (or --cases) file: per
// run, rejected rightly when any suite test it fails is one the spec
// requires. --compare <jsonl> adds per-case agreement with another file.
//
//   node bin/referee.mjs [slug...] [--cases <jsonl>] [--kinds suite,own] [--backend codex-cli] [--model <id>] [--out <jsonl>] [--concurrency 2] [--dry]
//   node bin/referee.mjs --report [--out <jsonl>] [--compare <jsonl>]
//
// Exit 2 when the backend's usage limit halted the batch; rerun the same
// command after it resets (cases already in --out are skipped).

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import {
  HOME,
  PROMPTS,
  RESULTS,
  ROOT,
  RUNS,
  args,
  backendOf,
  copy,
  discard,
  ensureTemplate,
  listFiles,
  log,
  pool,
  readJson,
  session,
  sha256,
  specDir,
  workdir,
} from "./lib.mjs";

const readLines = (path) =>
  existsSync(path)
    ? readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
    : [];
const stripKey = (name) => name.replace(/^\[[a-z]+-\d+\]\s*/, "");
let ts = null;
const typescript = () => (ts ??= createRequire(join(ensureTemplate(), "package.json"))("typescript"));

/**
 * `source` with only the test named `name`: other test calls dropped,
 * comments removed, a `[kind-n]` key taken off its name. A test inside a
 * describe block keeps its whole top-level block. Null when not found.
 */
export function oneTest(source, fullName) {
  const ts = typescript();
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

/** A run's own test file, recovered from its diff, or null. */
function ownFile(diff, file) {
  const dir = workdir("referee-own");
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    spawnSync("git", ["apply", "--include=tests/own/*", diff], { cwd: dir });
    const path = join(dir, "tests", "own", file);
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  } finally {
    discard(dir);
  }
}

/** Suite cases from this home's graded runs: each overfit run's failing hidden tests. */
function homeCases(slugs) {
  const cases = new Map();
  for (const line of readLines(RESULTS)) {
    if ((slugs.length > 0 && !slugs.includes(line.spec)) || line.verdict !== "overfit") continue;
    const out = join(RUNS, line.spec, line.variant, String(line.run));
    const grade = readJson(join(out, "grade.json"), null);
    if (grade === null || !grade.hiddenCompiled) continue;
    for (const failure of grade.hiddenFailures) {
      const [path, name] = failure.id.split(" :: ");
      const id = `suite:${line.spec}:${failure.id}`;
      if (!cases.has(id))
        cases.set(id, {
          id,
          kind: "suite",
          spec: line.spec,
          suite: "hidden",
          name,
          specMd: join(specDir(line.spec), "spec.md"),
          testPath: path,
          source: () => readFileSync(join(specDir(line.spec), path), "utf8"),
          src: join(out, "submission", "src"),
          message: failure.error?.message ?? "",
          runs: [],
          ownGreenRuns: [],
        });
      cases.get(id).runs.push(`${line.variant}/${line.run}`);
    }
  }
  return [...cases.values()];
}

/**
 * The cases of an earlier case file, with their sources in the archive:
 * the test by its id (`suite:<spec>:<path> :: <name>` or
 * `own:<spec>/<variant>/<run>:<file> :: <name>`), the implementation by
 * its recorded path, moved under `archive` (the archive was renamed from
 * public/double-blind/).
 */
function fileCases(file, archive, kinds) {
  const moved = (path) => path.replace(/^.*\/double-blind(-experiment)?\//, `${archive}/`);
  return readLines(file)
    .filter((line) => kinds.includes(line.kind))
    .map((line) => {
      const { requires, severity, reason, model, costUsd, transcript, ...item } = line;
      if (line.kind === "suite") {
        const [path, name] = line.id.slice(`suite:${line.spec}:`.length).split(" :: ");
        return { ...item, name, testPath: path, specMd: join(archive, "specs", line.spec, "spec.md"), source: () => readFileSync(join(archive, "specs", line.spec, path), "utf8"), src: moved(line.src) };
      }
      const [, run, rest] = /^own:([^:]+):(.*)$/.exec(line.id);
      const [testFile, name] = rest.split(" :: ");
      const [spec, variant, n] = run.split("/");
      return { ...item, name, testPath: testFile, specMd: join(archive, "specs", spec, "spec.md"), source: () => ownFile(join(archive, "runs", spec, variant, n, "diff.patch"), testFile), src: moved(line.src) };
    });
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

/** The archive's table and per-run lines, as numbers, for a referee file. */
export function summary(lines) {
  const count = (rows, key, value) => rows.filter((row) => row[key] === value).length;
  const row = (rows) => ({
    n: rows.length,
    yes: count(rows, "requires", "yes"),
    open: count(rows, "requires", "open"),
    no: count(rows, "requires", "no"),
    unanswered: rows.filter((item) => !["yes", "open", "no"].includes(item.requires)).length,
    typical: count(rows, "severity", "typical"),
    edge: count(rows, "severity", "edge"),
    adversarial: count(rows, "severity", "adversarial"),
  });
  const suite = lines.filter((item) => item.kind === "suite");
  const runsOf = (rows, key) => new Set(rows.flatMap((item) => (item[key] ?? []).map((run) => `${item.spec}/${run}`)));
  const required = suite.filter((item) => item.requires === "yes");
  return {
    suite: row(suite),
    hidden: row(suite.filter((item) => item.suite === "hidden")),
    ownGreen: row(suite.filter((item) => (item.ownGreenRuns ?? []).length > 0)),
    own: row(lines.filter((item) => item.kind === "own")),
    runsRejected: runsOf(suite, "runs").size,
    runsUpheld: runsOf(required, "runs").size,
    ownGreenRejected: runsOf(suite, "ownGreenRuns").size,
    ownGreenUpheld: runsOf(required, "ownGreenRuns").size,
  };
}

function report(file, compare) {
  const lines = readLines(file);
  const s = summary(lines);
  const table = (item, label) =>
    console.log(`| ${label} | ${item.n} | ${item.yes} | ${item.open} | ${item.no} | ${item.typical} / ${item.edge} / ${item.adversarial} |`);
  console.log("| cases | n | spec requires the test | open | test wrong | typical / edge / adversarial |");
  console.log("| --- | ---: | ---: | ---: | ---: | --- |");
  table(s.suite, "suite test fails a run, any arm");
  table(s.hidden, "… hidden tests only");
  table(s.ownGreen, "suite test fails a run whose own tests pass");
  table(s.own, "own test fails the reference");
  console.log(`\nruns rejected: ${s.runsRejected}; failing a test the spec requires: ${s.runsUpheld}`);
  console.log(`\nown-green runs rejected: ${s.ownGreenRejected}; failing a test the spec requires: ${s.ownGreenUpheld}`);
  if (compare !== undefined) {
    const other = new Map(readLines(compare).map((item) => [item.id, item]));
    const both = lines.filter((item) => other.has(item.id) && item.requires && other.get(item.id).requires);
    const same = both.filter((item) => item.requires === other.get(item.id).requires).length;
    console.log(`\nagreement with ${compare} on requires: ${same} of ${both.length} cases`);
  }
  return s;
}

const { options, rest } = args();
const out = resolve(typeof options.out === "string" ? options.out : join(HOME, "referee.jsonl"));
if (options.report === true) {
  report(typeof options.cases === "string" && options.out === undefined ? resolve(options.cases) : out, typeof options.compare === "string" ? resolve(options.compare) : undefined);
  process.exit(0);
}

const backend = backendOf({ backend: typeof options.backend === "string" ? options.backend : undefined });
const model = typeof options.model === "string" ? options.model : backend === "claude-cli" ? "claude-fable-5-1" : undefined;
const kinds = (typeof options.kinds === "string" ? options.kinds : "suite,own").split(",");
const archive = resolve(typeof options.archive === "string" ? options.archive : join(ROOT, "experiments"));
const all = typeof options.cases === "string" ? fileCases(resolve(options.cases), archive, kinds) : homeCases(rest);
const cases = all.filter((item) => rest.length === 0 || rest.includes(item.spec));
const done = new Set(readLines(out).map((line) => line.id));
const todo = cases.filter((item) => !done.has(item.id));
log(`${cases.length} case(s), ${todo.length} to referee on ${backend}${model ? ` (${model})` : ""}; out ${out}`);
if (options.dry === true) {
  // Each case's test is cut as it would be, so a missing one shows now.
  for (const item of todo) {
    const source = item.source();
    const found = source !== null && (!item.testPath.endsWith(".ts") || oneTest(source, item.name) !== null);
    console.log(item.kind, item.spec, item.suite, item.runs.length, found ? "" : "TEST NOT FOUND", stripKey(item.name));
  }
  process.exit(0);
}

let halted = null;
await pool(todo, Number(options.concurrency ?? 2), async (item) => {
  if (halted !== null) return;
  const source = item.source();
  const typed = item.testPath.endsWith(".ts");
  const test = source === null ? null : typed ? oneTest(source, item.name) : source;
  if (test === null) {
    log(item.id, "test not found; skipped");
    return;
  }
  const testFile = typed ? "test.ts" : item.testPath.split("/").at(-1);
  const dir = workdir(`referee-${item.spec}`);
  try {
    copy(item.specMd, join(dir, "spec.md"));
    copy(item.src, join(dir, "src"));
    // Compiled output beside the sources is not the implementation.
    for (const path of listFiles(join(dir, "src")).filter((path) => path.endsWith(".js") || path.endsWith(".pyc"))) spawnSync("rm", [join(dir, "src", path)]);
    writeFileSync(join(dir, testFile), test);
    const shown = stripKey(item.name.split(" > ").at(-1));
    writeFileSync(
      join(dir, "case.md"),
      `The test \`${typed ? stripKey(item.name) : shown}\` in \`${testFile}\` fails on the implementation in \`src/\` with:\n\n\`\`\`\n${item.message.replaceAll(item.name, stripKey(item.name))}\n\`\`\`\n`,
    );
    const text = readFileSync(join(PROMPTS, "referee.md"), "utf8").replaceAll("`test.ts`", `\`${testFile}\``);
    const transcript = join(RUNS, "_referee", backend, `${sha256(item.id).slice(0, 16)}.jsonl`);
    const result = await session({ cwd: dir, text, transcript, kind: "generate", model, backend });
    if (result.apiError === "usage_limit_reached") {
      halted = result.finalText || result.apiError;
      log(item.id, "HALTED:", halted.split("\n")[0]);
      return;
    }
    const verdict = verdictOf(result.finalText);
    // A session that failed without a verdict is left for the next run.
    if (verdict === null && !result.ok) {
      log(item.id, `session failed (${result.subtype}${result.apiError ? `, ${result.apiError}` : ""}); not recorded`);
      return;
    }
    const { source: _, specMd, testPath, ...record } = item;
    const line = { ...record, name: stripKey(item.name), ...(verdict ?? { requires: null }), backend, model: result.model, costUsd: result.costUsd, transcript };
    writeFileSync(out, `${JSON.stringify(line)}\n`, { flag: "a" });
    log(item.kind, item.spec, line.requires, line.severity ?? "", line.name.slice(0, 70));
  } finally {
    discard(dir);
  }
});
if (halted !== null) {
  console.log(`halted on the backend's usage limit (${halted.split("\n")[0]}); rerun the same command after it resets`);
  process.exit(2);
}
report(out);
