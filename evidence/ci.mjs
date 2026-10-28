#!/usr/bin/env node
// CI mode on the repository arm's 11 cases (RESULTS.md "In CI"), run
// locally with the script the workflow runs (bin/ci.mjs), against a scratch
// clone of sandbox-factory: the fixture the plan puts on a fork with one
// pull request per case. evidence/ci/fork-and-open-prs.sh is that fork,
// waiting on approval.
//
//   node evidence/ci.mjs branches --clone <dir>                 per case: base/<slug>, case/<slug>
//   node evidence/ci.mjs seal [slug...] --seals <dir>           both arms' seals (bin/seal.mjs)
//   node evidence/ci.mjs judge [slug...] --clone <dir> --seals <dir> --home <dir> [--work <dir>] [--concurrency n]
//   node evidence/ci.mjs leaks                                  hidden names and lines in every log and check
//   node evidence/ci.mjs report                                 the table RESULTS.md quotes
//
// `case/<slug>` is the case's commit parent plus the commit's code changes
// inside the case's allowed paths, the scope evidence/in-repo.mjs judged the
// real commit by (its tests, harness and other code left out), so the
// pull request's diff is exactly what was judged there. `base/<slug>` is the
// parent with .github/workflows/ holding only evidence/ci/workflow.yml, the
// pull request's base: the merge ref runs that workflow alone, and the
// judge, given the head commit, sees no workflow change.
//
// `judge` runs bin/ci.mjs per case and arm in a fresh DUEDILIGENCE_HOME
// with no DUEDILIGENCE_SPECS, the package and the seal only, as a CI
// box would, writing the Checks API body to evidence/ci/checks/<slug>.json,
// the log to evidence/ci/logs/<slug>.log and a ledger line to
// evidence/ci/ledger.jsonl (newest per slug wins). `leaks` greps every log,
// check body and step summary for the slug's hidden test names (full, and
// without the `[kind-n]` prefix when 12 characters or more), hidden file
// paths, and every hidden test line of 30 characters or more that the
// public suite, the stub and the spec do not also hold.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
process.env.DUEDILIGENCE_HOME ??= ROOT;
process.env.DUEDILIGENCE_SPECS ??= join(HERE, "in-repo", "specs");
const { HARNESS_FILES, args, log, pool, readJson, specDir, toolchainOf } = await import("../bin/lib.mjs");

const OUT = join(HERE, "ci");
const LEDGER = join(OUT, "ledger.jsonl");
const WORKFLOW = join(OUT, "workflow.yml");
const IN_REPO_LEDGER = join(HERE, "in-repo.jsonl");
const ARMS = { confirmed: (slug) => `${slug}-confirmed`, drafted: (slug) => slug };
const cases = readJson(join(HERE, "in-repo", "cases.json"), []);

const run = (bin, argv, options = {}) => spawnSync(bin, argv, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...options });
const git = (repo, argv, options = {}) => {
  const out = run("git", ["-C", repo, ...argv], options);
  if (out.status !== 0) throw new Error(`git ${argv.join(" ")}: ${out.stderr}`);
  return out.stdout.trim();
};
const allowedOf = (item) => item.allowed ?? [...new Set(item.seam.map((path) => `${dirname(path)}/`))];
const within = (path, allowed) => allowed.some((entry) => (entry.endsWith("/") ? path.startsWith(entry) : path === entry));
const newest = (file, step) => {
  const out = new Map();
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split("\n").filter(Boolean)) {
    const item = JSON.parse(line);
    if (step === undefined || item.step === step) out.set(item.slug, item);
  }
  return out;
};
const record = (fields) => writeFileSync(LEDGER, `${JSON.stringify({ ...fields, at: new Date().toISOString() })}\n`, { flag: "a" });

/** The commit's code changes in the case's allowed paths, as evidence/in-repo.mjs `commitChanges` splits them. */
function codeChanges(repo, item) {
  const chain = toolchainOf(ARMS.confirmed(item.slug));
  const listed = git(repo, ["diff", "--name-status", "--no-renames", `${item.commit}^`, item.commit, "--", `${item.package}/`]);
  return listed
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"))
    .map(([status, path]) => ({ path, removed: status === "D" }))
    .filter(({ path }) => !(chain.isTest(path) || path.startsWith(`${chain.testDir}/`)) && !HARNESS_FILES.test(basename(path)) && within(path, allowedOf(item)));
}

/** A commit of `tree` edits over `parent`, made with a scratch index: the clone's working tree is never touched. */
function commitOver(repo, parent, edits, message) {
  const index = join(repo, ".git", `ci-index-${process.pid}`);
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    git(repo, ["read-tree", parent], { env });
    const lines = edits.map((edit) => edit.line).join("\n");
    if (lines !== "") git(repo, ["update-index", "--index-info"], { env, input: `${lines}\n` });
    const tree = git(repo, ["write-tree"], { env });
    const fixed = { GIT_AUTHOR_NAME: "duediligence", GIT_AUTHOR_EMAIL: "duediligence@localhost", GIT_AUTHOR_DATE: "2026-10-26T00:00:00Z" };
    return git(repo, ["commit-tree", tree, "-p", parent, "-m", message], {
      env: { ...process.env, ...fixed, GIT_COMMITTER_NAME: fixed.GIT_AUTHOR_NAME, GIT_COMMITTER_EMAIL: fixed.GIT_AUTHOR_EMAIL, GIT_COMMITTER_DATE: fixed.GIT_AUTHOR_DATE },
    });
  } finally {
    rmSync(index, { force: true });
  }
}

function branches(repo) {
  const workflowBlob = git(repo, ["hash-object", "-w", WORKFLOW]);
  for (const item of cases) {
    const parent = git(repo, ["rev-parse", `${item.commit}^`]);
    const code = codeChanges(repo, item).map(({ path, removed }) => ({
      line: removed ? `0 ${"0".repeat(40)}\t${path}` : git(repo, ["ls-tree", item.commit, "--", path]),
    }));
    const head = commitOver(repo, parent, code, `${item.subject}\n\nThe change to ${allowedOf(item).join(", ")} only (duediligence CI fixture).`);
    const workflows = git(repo, ["ls-tree", "--name-only", parent, ".github/workflows/"]).split("\n").filter(Boolean);
    const base = commitOver(
      repo,
      parent,
      [...workflows.map((path) => ({ line: `0 ${"0".repeat(40)}\t${path}` })), { line: `100644 blob ${workflowBlob}\t.github/workflows/duediligence.yml` }],
      "ci: judge pull requests with duediligence only",
    );
    git(repo, ["update-ref", `refs/heads/case/${item.slug}`, head]);
    git(repo, ["update-ref", `refs/heads/base/${item.slug}`, base]);
    log(item.slug, `case/${item.slug} ${head.slice(0, 12)} (${code.length} file(s)), base/${item.slug} ${base.slice(0, 12)}`);
  }
}

function seal(chosen, seals) {
  mkdirSync(seals, { recursive: true });
  for (const item of chosen)
    for (const arm of Object.keys(ARMS)) {
      const slug = ARMS[arm](item.slug);
      const out = run(process.execPath, [join(ROOT, "bin", "cli.mjs"), "seal", slug, "--out", join(seals, `${slug}.seal.gz`)], { env: process.env });
      if (out.status !== 0) throw new Error(`${slug}: ${out.stderr}${out.stdout}`);
      log(slug, out.stdout.split("\n")[0]);
    }
}

/** bin/ci.mjs on one case and arm, as a CI box would run it. */
function judgeOne(item, arm, { clone, seals, home, work }) {
  const slug = ARMS[arm](item.slug);
  const head = git(clone, ["rev-parse", `case/${item.slug}`]);
  for (const folder of ["checks", "logs", "records", "summaries"]) mkdirSync(join(OUT, folder), { recursive: true });
  const summary = join(OUT, "summaries", `${slug}.md`);
  rmSync(summary, { force: true });
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("DUEDILIGENCE_") && !key.startsWith("GITHUB_") && !/TOKEN/i.test(key)));
  Object.assign(env, { DUEDILIGENCE_HOME: home, ...(work ? { DUEDILIGENCE_WORK: work } : {}), GITHUB_STEP_SUMMARY: summary });
  const argv = [join(ROOT, "bin", "cli.mjs"), "ci", "--seal", join(seals, `${slug}.seal.gz`), "--repo", clone, "--ref", head];
  argv.push("--name", `duediligence (${arm})`, "--out", join(OUT, "checks", `${slug}.json`), "--record", join(OUT, "records", `${slug}.json`));
  return new Promise((done) => {
    const started = Date.now();
    const child = spawn(process.execPath, argv, { env, cwd: clone });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (status) => {
      writeFileSync(join(OUT, "logs", `${slug}.log`), output);
      const judged = readJson(join(OUT, "records", `${slug}.json`), null);
      const check = readJson(join(OUT, "checks", `${slug}.json`), null);
      const line = {
        slug,
        case: item.slug,
        arm,
        step: "judge",
        head,
        exit: status,
        conclusion: check?.conclusion ?? null,
        title: check?.output.title ?? null,
        verdict: judged?.verdict ?? null,
        public: judged?.public ?? null,
        hidden: judged?.hidden ?? null,
        existing: judged?.existing ?? null,
        failedScenarios: judged?.failedScenarios ?? null,
        refused: judged?.refused ?? null,
        outsideScope: judged?.outsideScope ?? null,
        hiddenSha256: judged?.hiddenSha256 ?? null,
        seconds: Math.round((Date.now() - started) / 1000),
      };
      record(line);
      log(slug, `${line.conclusion}: ${line.title} (${line.seconds}s)`);
      done(line);
    });
  });
}

/** Strings a check or log must never hold for `slug`: hidden names, hidden paths, hidden lines. */
function secretsOf(slug) {
  const dir = specDir(slug);
  const chain = toolchainOf(slug);
  const kept = readJson(join(dir, "calibration.json")).kept;
  const names = new Set();
  for (const id of kept) {
    const name = id.split(" :: ").at(-1);
    names.add(name);
    const bare = name.replace(/^\[[a-z]+-\d+\] /, "");
    if (bare.length >= 12) names.add(bare);
  }
  const files = (folder) => (existsSync(folder) ? walk(folder) : []);
  const hiddenFiles = files(join(dir, "tests", "private"));
  const paths = new Set(hiddenFiles.map((rel) => `${chain.hiddenDir}/${rel}`));
  const known = new Set(
    [...files(join(dir, "tests", "public")).map((rel) => join(dir, "tests", "public", rel)), ...files(join(dir, "skeleton")).map((rel) => join(dir, "skeleton", rel)), join(dir, "spec.md")]
      .flatMap((file) => readFileSync(file, "utf8").split("\n").map((line) => line.trim())),
  );
  const lines = new Set(
    hiddenFiles.flatMap((rel) => readFileSync(join(dir, "tests", "private", rel), "utf8").split("\n").map((line) => line.trim())).filter((line) => line.length >= 30 && !known.has(line)),
  );
  return { names: [...names], paths: [...paths], lines: [...lines] };
}
function walk(dir, prefix = "") {
  return readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name), `${prefix}${name}/`) : [`${prefix}${name}`]));
}

function leaks() {
  const judged = newest(LEDGER, "judge");
  const totals = { files: 0, names: 0, paths: 0, lines: 0, checked: { names: 0, paths: 0, lines: 0 } };
  const found = [];
  for (const slug of judged.keys()) {
    const secrets = secretsOf(slug);
    totals.checked.names += secrets.names.length;
    totals.checked.paths += secrets.paths.length;
    totals.checked.lines += secrets.lines.length;
    for (const file of [join(OUT, "logs", `${slug}.log`), join(OUT, "checks", `${slug}.json`), join(OUT, "summaries", `${slug}.md`)]) {
      if (!existsSync(file)) continue;
      totals.files += 1;
      // The check body as posted, JSON-decoded, so an escaped quote cannot hide a match.
      const text = file.endsWith(".json") ? JSON.stringify(JSON.parse(readFileSync(file, "utf8"))) + JSON.parse(readFileSync(file, "utf8")).output.summary : readFileSync(file, "utf8");
      for (const kind of ["names", "paths", "lines"])
        for (const secret of secrets[kind])
          if (text.includes(secret)) {
            totals[kind] += 1;
            found.push({ slug, file: basename(file), kind, secret: secret.slice(0, 80) });
          }
    }
  }
  record({ slug: "_all", step: "leaks", ...totals, found: found.slice(0, 50) });
  console.log(JSON.stringify({ ...totals, found: found.slice(0, 20) }, null, 2));
}

function report() {
  const judged = newest(LEDGER, "judge");
  const expected = newest(IN_REPO_LEDGER, "commit");
  const fraction = (count) => (count ? `${count.passed}/${count.total}` : "-");
  const same = (a, b) => a !== null && b !== undefined && a.passed === b.passed && a.total === b.total;
  console.log("| case | arm | in-repo arm: verdict, public, hidden | CI check: verdict, public, hidden | conclusion | same |");
  console.log("| --- | --- | --- | --- | --- | --- |");
  const totals = {};
  for (const item of cases)
    for (const arm of Object.keys(ARMS)) {
      const slug = ARMS[arm](item.slug);
      const ci = judged.get(slug);
      const was = expected.get(slug);
      if (ci === undefined) continue;
      const match = ci.verdict === was?.verdict && same(ci.public, was?.public) && same(ci.hidden, was?.hidden);
      const sum = (totals[arm] ??= { cases: 0, passed: 0, public: [0, 0], hidden: [0, 0], same: 0 });
      sum.cases += 1;
      sum.passed += ci.verdict === "passed" ? 1 : 0;
      sum.same += match ? 1 : 0;
      sum.public = [sum.public[0] + (ci.public?.passed ?? 0), sum.public[1] + (ci.public?.total ?? 0)];
      sum.hidden = [sum.hidden[0] + (ci.hidden?.passed ?? 0), sum.hidden[1] + (ci.hidden?.total ?? 0)];
      console.log(
        `| ${item.slug} | ${arm} | ${was?.verdict ?? "-"}, ${fraction(was?.public)}, ${fraction(was?.hidden)} | ${ci.verdict ?? "not judged"}, ${fraction(ci.public)}, ${fraction(ci.hidden)} | ${ci.conclusion} | ${match ? "yes" : "no"} |`,
      );
    }
  for (const [arm, sum] of Object.entries(totals))
    console.log(`\n${arm}: passed ${sum.passed}/${sum.cases}; public ${sum.public[0]}/${sum.public[1]}; hidden ${sum.hidden[0]}/${sum.hidden[1]}; same as the in-repo arm ${sum.same}/${sum.cases}`);
  const leak = newest(LEDGER, "leaks").get("_all");
  if (leak !== undefined)
    console.log(`leaks: ${leak.names} names, ${leak.paths} paths, ${leak.lines} lines in ${leak.files} files (checked ${leak.checked.names} names, ${leak.checked.paths} paths, ${leak.checked.lines} lines)`);
}

const { options, rest } = args();
const [command, ...named] = rest;
const chosen = named.length === 0 ? cases : cases.filter((item) => named.includes(item.slug));
const need = (name) => {
  if (typeof options[name] !== "string") throw new Error(`--${name} <dir> is required`);
  return resolve(options[name]);
};
if (command === "branches") branches(need("clone"));
else if (command === "seal") seal(chosen, need("seals"));
else if (command === "judge") {
  const context = { clone: need("clone"), seals: need("seals"), home: need("home"), work: typeof options.work === "string" ? resolve(options.work) : null };
  const arms = typeof options.arm === "string" ? [options.arm] : Object.keys(ARMS);
  // Arm by arm: the two arms of a case share a base tree, prepared once.
  const jobs = arms.flatMap((arm) => chosen.map((item) => ({ item, arm })));
  await pool(jobs, Number(options.concurrency ?? 2), ({ item, arm }) => judgeOne(item, arm, context));
} else if (command === "leaks") leaks();
else if (command === "report") report();
else {
  console.error("usage: node evidence/ci.mjs branches|seal|judge|leaks|report [slug...] (see the header)");
  process.exit(1);
}
