#!/usr/bin/env node
// One bounded retry for a blind run that was not accepted (SKILL.md, step
// 5): a fresh session on the run's own submitted src/, with the public
// suite and the brief, told it was not accepted. `--feedback keyed` names
// the spec scenarios whose hidden tests failed, and the keys of any failing
// public tests; `plain` says only that it failed. A key names a scenario
// the agent already has in spec.md, so neither message leaks a test, and
// one retry stops an agent searching the hidden suite scenario by scenario.
//
//   node bin/retry.mjs <slug> <variant> [--feedback keyed|plain] [--force]
//
// Runs go to runs/<slug>/<variant>-retry-<feedback>/<n>/, beside the first
// attempt, in run.mjs's format, so grade.mjs grades them the same way and
// the first attempt stays on record. The retry runs on the first attempt's
// model and keeps its src/ only; own tests are not restored.
//
// On a repository target the retry starts from base plus stub plus public
// suite with the first attempt's changes laid over it (own tests and harness
// changes left out), and a `regressed` run is retried too: keyed feedback
// names the existing tests it broke, which are the repository's own and
// public.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AGENT,
  RESULTS,
  RUNS,
  args,
  changes,
  session as runSession,
  copy,
  discard,
  emitted,
  log,
  manifest,
  manifestOf,
  peeks,
  pool,
  prompt,
  readJson,
  scenarioOf,
  scopeOf,
  specSlugs,
  stage,
  toolchainOf,
  workdir,
  writeJson,
} from "./lib.mjs";

const git = (dir, ...argv) =>
  spawnSync(
    "git",
    ["-c", "user.name=independent-tests", "-c", "user.email=independent-tests@localhost", ...argv],
    { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );

const { options, rest } = args();
const [slug, from] = rest;
if (slug === undefined || from === undefined || from.includes("-retry-")) {
  console.error("usage: node bin/retry.mjs <slug> <variant> [--feedback keyed|plain]; <variant> is a first attempt");
  process.exit(1);
}
specSlugs([slug]);
const chain = toolchainOf(slug);
const repo = chain.name === "repo";
const feedback = options.feedback === "plain" ? "plain" : "keyed";
const variant = `${from}-retry-${feedback}`;

const results = existsSync(RESULTS)
  ? readFileSync(RESULTS, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
  : [];
const jobs = results
  .filter((line) => line.spec === slug && line.variant === from)
  .filter((line) => ["overfit", "incomplete", "regressed"].includes(line.verdict))
  .map((line) => {
    const first = join(RUNS, slug, from, String(line.run));
    const grade = readJson(join(first, "grade.json"), { publicFailures: [] });
    const firstRun = readJson(join(first, "run.json"), {});
    // What a repository retry starts from beyond base plus stub plus public:
    // the first attempt's judged changes, never its own tests or harness edits.
    const scope = repo ? scopeOf(chain, firstRun.changes ?? [], () => null) : null;
    const keys = new Set([
      ...line.failedScenarios,
      ...grade.publicFailures.map((test) => scenarioOf(test.id)).filter(Boolean),
    ]);
    return {
      n: line.run,
      first,
      model: firstRun.session?.model ?? undefined,
      // A first attempt on another backend retries on it (lib.mjs `backendOf`).
      backend: firstRun.session?.backend,
      keys: [...keys].sort(),
      regressions: grade.regressions ?? [],
      remove: repo
        ? [...scope.refused, ...scope.ownTests, ...[...scope.allowed, ...scope.outsideScope].filter((item) => item.change === "removed")].map(
            (item) => item.path,
          )
        : [],
      out: join(RUNS, slug, variant, String(line.run)),
    };
  })
  .filter(
    (job) =>
      existsSync(join(job.first, "submission", ...(repo ? [] : ["src"]))) &&
      (feedback === "plain" || job.keys.length > 0 || job.regressions.length > 0),
  )
  .filter((job) => options.force === true || !existsSync(join(job.out, "run.json")));
if (jobs.length === 0) {
  console.log(`${slug}: no ${from} run to retry (graded overfit or incomplete, with a submission${feedback === "keyed" ? " and failing scenarios" : ""}).`);
  process.exit(0);
}

const where = repo ? "in place" : "in `src/`";
const publicTests = repo ? `\`${chain.publicDir}/${chain.publicName}\`` : "`tests/public/`";
const message = (job) => {
  if (feedback !== "keyed")
    return `Your previous submission is already ${where}. It was not accepted: the separate acceptance run found failures. Re-read \`spec.md\`, fix the implementation, and stop when you consider the spec implemented.`;
  const parts = [];
  if (job.keys.length > 0)
    parts.push(
      `the separate acceptance run failed on these scenarios of \`spec.md\`, each keyed by its kind tag and its position among scenarios of that kind, in spec order: ${job.keys.join(", ")}. Tests in ${publicTests} whose names start with one of those keys test the same scenario`,
    );
  if (job.regressions.length > 0)
    parts.push(`these tests of the existing suite passed before your change and fail after it: ${job.regressions.join("; ")}`);
  return `Your previous submission is already ${where}. It was not accepted: ${parts.join(". And ")}. Re-read \`spec.md\`, fix the implementation, and stop when you consider the spec implemented.`;
};

for (const job of jobs) {
  if (repo) {
    // Measured from base plus stub plus public, as a first run's changes are.
    job.dir = stage(workdir(`${slug}-${variant}-${job.n}`), slug, { skeleton: true, publicTests: true });
    job.start = manifestOf(job.dir, chain);
    copy(join(job.first, "submission"), job.dir);
    for (const path of job.remove) rmSync(join(job.dir, path), { force: true });
  } else
    job.dir = stage(workdir(`${slug}-${variant}-${job.n}`), slug, {
      skeleton: true,
      publicTests: true,
      src: join(job.first, "submission", "src"),
    });
  git(job.dir, "init", "-q");
  git(job.dir, "add", "-A");
  git(job.dir, "commit", "-qm", "first attempt");
  job.before = manifestOf(job.dir, chain);
}
log(`${jobs.length} ${variant} run(s) staged`);

let halted = null;
await pool(jobs, Number(options.concurrency ?? 2), async (job) => {
  if (halted !== null) return discard(job.dir);
  rmSync(job.out, { recursive: true, force: true });
  const transcript = join(job.out, "transcript.jsonl");
  const startedAt = new Date().toISOString();
  log(slug, variant, job.n, "retry started", feedback === "keyed" ? job.keys.join(",") : "");
  const session = await runSession({
    cwd: job.dir,
    text: `${prompt(AGENT.prompt, chain)}\n${message(job)}\n`,
    transcript,
    kind: "agent",
    model: job.model,
    backend: job.backend,
    chain,
  });
  if (session.apiError === "usage_limit_reached") {
    halted = session.finalText || session.apiError;
    log(slug, variant, job.n, "HALTED, no run recorded:", halted);
    rmSync(job.out, { recursive: true, force: true });
    return discard(job.dir);
  }
  const changed = repo
    ? changes(job.start, manifestOf(job.dir, chain), chain)
    : changes(job.before, manifestOf(job.dir));
  git(job.dir, "add", "-A");
  writeFileSync(join(job.out, "diff.patch"), git(job.dir, "diff", "--cached", "--binary", "HEAD").stdout);
  if (repo) {
    for (const item of changed.filter((item) => item.change !== "removed" && item.symlink !== true))
      copy(join(job.dir, item.path), join(job.out, "submission", item.path));
  } else {
    const srcFiles = manifest(join(job.dir, "src"));
    for (const path of Object.keys(srcFiles).filter((path) => !emitted(path, srcFiles)))
      copy(join(job.dir, "src", path), join(job.out, "submission", "src", path));
  }
  writeJson(join(job.out, "run.json"), {
    slug,
    variant,
    n: job.n,
    attempt: 2,
    feedback,
    keys: feedback === "keyed" ? job.keys : [],
    startedAt,
    session: (({ finalText, stderr, ...rest }) => rest)(session),
    summary: session.finalText.trim().slice(-2000),
    changes: changed,
    peeks: peeks(transcript, job.dir, ["tests/private", ...(repo ? [chain.hiddenDir.split("/").at(-1)] : [])]),
  });
  discard(job.dir);
  log(slug, variant, job.n, `retry ${session.ok ? "done" : "ended with an error"}`, `$${(session.costUsd ?? 0).toFixed(2)}`);
});
if (halted !== null) {
  console.log(`halted on the account's usage limit (${halted}); rerun the same command after it resets`);
  process.exit(2);
}
console.log(`${jobs.length} retr${jobs.length === 1 ? "y" : "ies"} finished; next: node bin/grade.mjs ${slug}`);
