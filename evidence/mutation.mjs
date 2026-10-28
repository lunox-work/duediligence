#!/usr/bin/env node
// Suite strength without an agent, ported from the archive's
// bin/mutate.mjs. Each spec's reference src/ passes both suites; a mutant
// of it is the same code with one small plausible bug: a flipped
// comparison, an off-by-one literal, a negated condition, a dropped call.
// Every mutant that still compiles is judged by the public suite and the
// hidden suite, as grading judges a submission (lib.mjs `judge`).
//
// The mutants depend only on the reference, so two suites for the same
// spec (the archive's Claude-written ones, another backend's) are scored on
// the same mutants. A suite is counted over its tests the unmutated
// reference passes (`baseline`): a test the reference fails would "kill"
// every mutant. For the archive's suites that is every public and kept
// hidden test, as its mutate.mjs counted.
//
//   node evidence/mutation.mjs [slug...] [--out <dir>] [--max 150] [--max-from <dir>] [--concurrency 1] [--min-free 40] [--force] [--compare <archive runs/_mutation>]
//
// Memory: a mutant can allocate without bound. Every test process runs
// under the runners' caps (bin/runners/guard.mjs: 512 MB V8 heap, 1 GB
// resident per process group, killed group = crashed file = mutant killed);
// specs run one at a time by default, and none starts below --min-free
// percent of free memory (default 40). Two specs at once without the caps
// rebooted a 16 GB machine on 2026-10-26.
//
// Specs come from SPECS (DUEDILIGENCE_SPECS); per spec every mutant and
// which suite killed it goes to <out>/<slug>.json (default
// RUNS/_mutation/), one summary per spec to <out>/summary.jsonl. --compare
// checks the mutants and kills against the archive's per-spec files;
// --max-from takes each spec's sample size from them (the archive scored
// patch-apply with --max 400).

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RUNS, args, copy, count, discard, ensureTemplate, freeMemoryPercent, judge, listFiles, log, pool, readJson, specDir, specSlugs, testsOf, workdir, writeJson } from "../bin/lib.mjs";

const ts = createRequire(join(ensureTemplate(), "package.json"))("typescript");
const { options, rest } = args();
const OUT = resolve(typeof options.out === "string" ? options.out : join(RUNS, "_mutation"));

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

const passingOf = (result, ids) => {
  const ok = new Set(testsOf(result).filter((test) => test.ok && !test.skipped).map((test) => test.id));
  return ids.filter((id) => ok.has(id));
};

function mutateSpec(slug, max) {
  const reference = join(specDir(slug), "reference", "src");
  const calibration = readJson(join(specDir(slug), "calibration.json"), null);
  const unmutated = judge(slug, reference);
  const publicIds = passingOf(unmutated.public, calibration.publicIds);
  const hiddenIds = passingOf(unmutated.hidden, calibration.kept);
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
        // A runner that prints no parsable result (a very long assertion
        // diff cut at its size cap): left out and counted.
        results.push({ ...mutant, status: "harness-error", error: String(error).slice(0, 200) });
        continue;
      }
      if (!judged.public.compiled) {
        results.push({ ...mutant, status: "invalid" });
        continue;
      }
      const pub = count(judged.public, publicIds);
      const hid = count(judged.hidden, hiddenIds);
      results.push({ ...mutant, status: "judged", publicKilled: pub.passed < pub.total, hiddenKilled: hid.passed < hid.total });
    } finally {
      discard(dir);
    }
  }
  return {
    baseline: {
      public: publicIds.length,
      publicFailingOnReference: calibration.publicIds.length - publicIds.length,
      hidden: hiddenIds.length,
      hiddenFailingOnReference: calibration.kept.length - hiddenIds.length,
    },
    results,
  };
}

export function summarise(slug, { baseline, results }) {
  const judged = results.filter((item) => item.status === "judged");
  const n = (filter) => judged.filter(filter).length;
  return {
    spec: slug,
    mutants: results.length,
    invalid: results.filter((item) => item.status === "invalid").length,
    harnessErrors: results.filter((item) => item.status === "harness-error").length,
    judged: judged.length,
    publicKilled: n((item) => item.publicKilled),
    hiddenKilled: n((item) => item.hiddenKilled),
    eitherKilled: n((item) => item.publicKilled || item.hiddenKilled),
    publicSurvivors: n((item) => !item.publicKilled),
    publicSurvivorsHiddenKilled: n((item) => !item.publicKilled && item.hiddenKilled),
    publicKilledHiddenMissed: n((item) => item.publicKilled && !item.hiddenKilled),
    baseline,
    gradedAt: new Date().toISOString(),
  };
}

const max = Number(options.max ?? 150);
if (options.one === true) {
  // One spec per process: judge() is synchronous, so specs run in parallel as processes.
  const [slug] = rest;
  const scored = mutateSpec(slug, max);
  writeJson(join(OUT, `${slug}.json`), { max, ...scored });
  console.log(JSON.stringify(summarise(slug, scored)));
  process.exit(0);
}

const slugs = specSlugs(rest).filter((slug) => {
  const ok = existsSync(join(specDir(slug), "reference", "src")) && readJson(join(specDir(slug), "calibration.json"), null)?.status === "ok";
  if (!ok) log(slug, "skipped: no reference, or not calibrated");
  return ok && (options.force === true || !existsSync(join(OUT, `${slug}.json`)));
});
const maxOf = (slug) =>
  typeof options["max-from"] === "string" ? (readJson(join(resolve(options["max-from"]), `${slug}.json`), null)?.max ?? max) : max;
const minFree = Number(options["min-free"] ?? 40);
await pool(slugs, Number(options.concurrency ?? 1), async (slug) => {
  for (let waited = 0; freeMemoryPercent() < minFree; waited += 1) {
    if (waited % 12 === 0) log(slug, `waiting for ${minFree}% free memory`);
    await new Promise((resume) => setTimeout(resume, 5_000));
  }
  log(slug, "mutating");
  return new Promise((done) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), slug, "--one", "--max", String(maxOf(slug)), "--out", OUT], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("close", (code) => {
      if (code !== 0) log(slug, `failed (exit ${code})`);
      else {
        const line = JSON.parse(out.trim().split("\n").at(-1));
        log(slug, `public kills ${line.publicKilled}/${line.judged}, hidden kills ${line.publicSurvivorsHiddenKilled} of the ${line.publicSurvivors} public survivors`);
      }
      done();
    });
  });
});

// Every scored spec of OUT (not only those named), and against the archive's per-mutant files if asked.
const lines = specSlugs([])
  .filter((slug) => existsSync(join(OUT, `${slug}.json`)))
  .map((slug) => summarise(slug, readJson(join(OUT, `${slug}.json`))));
writeFileSync(join(OUT, "summary.jsonl"), lines.map((line) => JSON.stringify(line)).join("\n") + (lines.length > 0 ? "\n" : ""));
const total = (key, rows = lines) => rows.reduce((sum, line) => sum + line[key], 0);
console.log(`${lines.length} spec(s): judged ${total("judged")}, public killed ${total("publicKilled")}, public + hidden ${total("eitherKilled")}`);
if (typeof options.compare === "string") {
  let differ = 0;
  let compared = 0;
  for (const line of lines) {
    const archived = readJson(join(resolve(options.compare), `${line.spec}.json`), null);
    if (archived === null) continue;
    const now = readJson(join(OUT, `${line.spec}.json`)).results;
    archived.results.forEach((old, at) => {
      compared += 1;
      const mine = now[at];
      const same = mine && mine.start === old.start && mine.text === old.text && mine.status === old.status && mine.publicKilled === old.publicKilled && mine.hiddenKilled === old.hiddenKilled;
      if (!same) {
        differ += 1;
        if (differ <= 20) console.log(`differs: ${line.spec} #${at} ${old.op} line ${old.line}: archive ${old.status}/${old.publicKilled}/${old.hiddenKilled}, now ${mine?.status}/${mine?.publicKilled}/${mine?.hiddenKilled}`);
      }
    });
  }
  console.log(`compared with the archive: ${compared} mutants, ${differ} differ`);
}
