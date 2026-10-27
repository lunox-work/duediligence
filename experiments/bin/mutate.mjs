#!/usr/bin/env node
// Suite strength without an agent. Each spec's reference src/ passes both
// suites (calibrate.mjs); a mutant of it is the same code with one small
// plausible bug: a flipped comparison, an off-by-one literal, a negated
// condition, a dropped call. Every mutant that still compiles is judged by
// the public suite and the hidden suite, as grading judges a submission.
//
// A mutant the public suite passes is a submission an implementer would
// stop at, green, with a bug in it. The share of those the hidden suite
// kills is the number this script exists for. Mutants neither suite kills
// include equivalent ones (same behaviour, different code), so the
// survivor count is an upper bound on what both suites miss.
//
//   node bin/mutate.mjs [slug...] [--max 150] [--concurrency 6] [--force]
//
// Per spec, every mutant and which suite killed it goes to
// runs/_mutation/<slug>.json; one summary line per spec to mutation.jsonl.

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  ROOT,
  RUNS,
  args,
  copy,
  count,
  discard,
  judge,
  listFiles,
  log,
  pool,
  readJson,
  specDir,
  specSlugs,
  workdir,
  writeJson,
} from "./lib.mjs";

const ts = createRequire(join(ROOT, "template", "package.json"))("typescript");
const OUT = join(RUNS, "_mutation");
const SUMMARY = join(ROOT, "mutation.jsonl");

const SWAPS = {
  "<": "<=", "<=": "<", ">": ">=", ">=": ">",
  "===": "!==", "!==": "===", "==": "!=", "!=": "==",
  "&&": "||", "||": "&&", "??": "||",
  "+": "-", "-": "+", "*": "/", "/": "*", "%": "*",
};

/** Inside a type annotation, an import or an export's module name: never mutated. */
function inType(node) {
  for (let at = node.parent; at !== undefined; at = at.parent) {
    if (ts.isTypeNode(at) || ts.isImportDeclaration(at) || ts.isExportDeclaration(at)) return true;
    if (ts.isTypeAliasDeclaration(at) || ts.isInterfaceDeclaration(at)) return true;
  }
  return false;
}

/** Every single-edit mutant of one file: `{ file, start, end, text, op, line }`. */
function mutantsOf(file, source) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const out = [];
  const add = (node, start, end, text, op) =>
    out.push({ file, start, end, text, op, line: sf.getLineAndCharacterOfPosition(start).line + 1 });
  const visit = (node) => {
    if (!inType(node)) {
      if (ts.isBinaryExpression(node)) {
        const token = node.operatorToken;
        const swap = SWAPS[token.getText(sf)];
        if (swap !== undefined) add(node, token.getStart(sf), token.getEnd(), swap, `${token.getText(sf)} → ${swap}`);
      } else if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
        add(node, node.getStart(sf), node.operand.getStart(sf), "", "drop !");
      } else if (ts.isNumericLiteral(node)) {
        const value = Number(node.text);
        if (Number.isFinite(value)) add(node, node.getStart(sf), node.getEnd(), String(value + 1), `${node.text} → ${value + 1}`);
      } else if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
        const flip = node.kind === ts.SyntaxKind.TrueKeyword ? "false" : "true";
        add(node, node.getStart(sf), node.getEnd(), flip, `→ ${flip}`);
      } else if (ts.isIfStatement(node)) {
        const condition = node.expression;
        add(node, condition.getStart(sf), condition.getEnd(), `!(${condition.getText(sf)})`, "negate if");
      } else if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
        add(node, node.getStart(sf), node.getEnd(), ";", "drop call");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** At most `max` mutants, evenly spaced over the sorted list, so a rerun picks the same ones. */
function sample(all, max) {
  if (all.length <= max) return all;
  return Array.from({ length: max }, (_, at) => all[Math.floor((at * all.length) / max)]);
}

function mutateSpec(slug, max) {
  const reference = join(specDir(slug), "reference", "src");
  const calibration = readJson(join(specDir(slug), "calibration.json"), null);
  const files = listFiles(reference).filter((path) => path.endsWith(".ts"));
  const sources = Object.fromEntries(files.map((path) => [path, readFileSync(join(reference, path), "utf8")]));
  const chosen = sample(files.flatMap((path) => mutantsOf(path, sources[path])), max);
  const results = [];
  for (const mutant of chosen) {
    const dir = workdir(`mutant-${slug}`);
    try {
      copy(reference, join(dir, "src"));
      const source = sources[mutant.file];
      writeFileSync(join(dir, "src", mutant.file), source.slice(0, mutant.start) + mutant.text + source.slice(mutant.end));
      let judged;
      try {
        judged = judge(slug, join(dir, "src"));
      } catch (error) {
        // The template's runner cuts a test's output line at its size cap,
        // and a very long assertion diff then fails to parse. Rare; such a
        // mutant is left out and counted.
        results.push({ ...mutant, status: "harness-error", error: String(error).slice(0, 200) });
        continue;
      }
      if (!judged.public.compiled) {
        results.push({ ...mutant, status: "invalid" });
        continue;
      }
      const pub = count(judged.public, calibration.publicIds);
      const hid = count(judged.hidden, calibration.kept);
      results.push({
        ...mutant,
        status: "judged",
        publicKilled: pub.passed < pub.total,
        hiddenKilled: hid.passed < hid.total,
      });
    } finally {
      discard(dir);
    }
  }
  return results;
}

function summarise(slug, results) {
  const judged = results.filter((item) => item.status === "judged");
  const n = (filter) => judged.filter(filter).length;
  const publicSurvivors = n((item) => !item.publicKilled);
  return {
    spec: slug,
    mutants: results.length,
    invalid: results.filter((item) => item.status === "invalid").length,
    harnessErrors: results.filter((item) => item.status === "harness-error").length,
    judged: judged.length,
    publicKilled: n((item) => item.publicKilled),
    hiddenKilled: n((item) => item.hiddenKilled),
    eitherKilled: n((item) => item.publicKilled || item.hiddenKilled),
    publicSurvivors,
    publicSurvivorsHiddenKilled: n((item) => !item.publicKilled && item.hiddenKilled),
    publicKilledHiddenMissed: n((item) => item.publicKilled && !item.hiddenKilled),
    gradedAt: new Date().toISOString(),
  };
}

const { options, rest } = args();
const max = Number(options.max ?? 150);

if (options.one === true) {
  // One spec in this process: judge() is synchronous, so specs run in
  // parallel as separate processes.
  const [slug] = rest;
  const results = mutateSpec(slug, max);
  writeJson(join(OUT, `${slug}.json`), { max, results });
  console.log(JSON.stringify(summarise(slug, results)));
  process.exit(0);
}

const slugs = specSlugs(rest).filter((slug) => {
  const ok =
    existsSync(join(specDir(slug), "reference", "src")) &&
    readJson(join(specDir(slug), "calibration.json"), null)?.status === "ok";
  if (!ok) log(slug, "skipped: no reference, or not calibrated");
  return ok && (options.force === true || !existsSync(join(OUT, `${slug}.json`)));
});
const previous = existsSync(SUMMARY)
  ? readFileSync(SUMMARY, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
  : [];
const summaries = new Map(previous.map((line) => [line.spec, line]));
await pool(slugs, Number(options.concurrency ?? 6), (slug) => {
  log(slug, "mutating");
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [new URL(import.meta.url).pathname, slug, "--one", "--max", String(max)], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("close", (code) => {
      if (code !== 0) {
        log(slug, `failed (exit ${code})`);
        return resolve();
      }
      const line = JSON.parse(out.trim().split("\n").at(-1));
      summaries.set(slug, line);
      log(slug, `public kills ${line.publicKilled}/${line.judged}, hidden kills ${line.publicSurvivorsHiddenKilled} of the ${line.publicSurvivors} public survivors`);
      resolve();
    });
  });
});
const lines = [...summaries.values()].sort((a, b) => a.spec.localeCompare(b.spec));
writeFileSync(SUMMARY, lines.map((line) => JSON.stringify(line)).join("\n") + (lines.length > 0 ? "\n" : ""));
console.log(`${lines.length} spec(s) in mutation.jsonl`);
