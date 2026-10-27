#!/usr/bin/env node
// The bounded retry under "After the verdict" (README): a run that was not accepted
// gets one more session, fresh, on its own submitted src/ plus what its arm
// was given, and a message saying it was not accepted. `--feedback keyed`
// names the spec scenarios whose tests failed (`failedScenarios`, and the
// keys of failing public tests for an arm that never saw them); `plain`
// says only that it failed, the control. A key names a scenario the agent
// already has in spec.md, so neither message leaks a test. A first attempt
// on another brief (`-ticket`) is retried on that brief; its keys still name
// spec scenarios, which only an arm that sees the keyed public tests can
// map to anything.
//
//   node bin/retry.mjs <variant> [slug...] --feedback keyed|plain [--concurrency 3] [--min-free 25] [--force]
//
// Runs go to runs/<slug>/<variant>-retry-<feedback>/<n>/, beside the
// first attempt, in run.mjs's format, so grade.mjs grades them as the same
// arm. Own tests an arm wrote the first time are not restored: the
// submission keeps src/ only.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  RESULTS,
  briefOfVariant,
  stageBrief,
  RUNS,
  args,
  changes,
  claude,
  copy,
  discard,
  emitted,
  log,
  manifest,
  peeks,
  pool,
  prompt,
  readJson,
  specSlugs,
  stage,
  toolchainOf,
  variantArm,
  workdir,
  writeJson,
} from "./lib.mjs";

const git = (dir, ...argv) =>
  spawnSync("git", ["-c", "user.name=double-blind", "-c", "user.email=double-blind@localhost", ...argv], {
    cwd: dir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
/** Same as grade.mjs's, which cannot be imported without running it. */
const scenarioOf = (id) => /^\[([a-z]+-\d+)\] /.exec(id.split(" :: ").at(-1))?.[1] ?? null;

const { options, rest } = args();
const [from, ...named] = rest;
const feedback = options.feedback === "plain" ? "plain" : "keyed";
const arm = variantArm(from ?? "");
if (arm === null || from.includes("-retry-"))
  throw new Error("usage: retry.mjs <variant> [slug...] --feedback keyed|plain; a first attempt");
const brief = briefOfVariant(from);
const base = brief === "spec" ? from : from.slice(0, -(brief.length + 1));
const model = base.slice(arm.name.length + 1) || undefined;
const variant = `${from}-retry-${feedback}`;

const results = readFileSync(RESULTS, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
const slugs = new Set(specSlugs(named));
const jobs = results
  .filter((line) => line.variant === from && slugs.has(line.spec))
  .filter((line) => line.verdict === "overfit" || line.verdict === "incomplete")
  .map((line) => {
    const first = join(RUNS, line.spec, from, String(line.run));
    const grade = readJson(join(first, "grade.json"), { publicFailures: [] });
    const keys = new Set([...line.failedScenarios, ...grade.publicFailures.map((test) => scenarioOf(test.id)).filter(Boolean)]);
    return { slug: line.spec, n: line.run, first, keys: [...keys].sort(), out: join(RUNS, line.spec, variant, String(line.run)) };
  })
  .filter((job) => existsSync(join(job.first, "submission", "src")) && (feedback === "plain" || job.keys.length > 0))
  .filter((job) => options.force === true || !existsSync(join(job.out, "run.json")));

const scenarios =
  brief === "spec"
    ? "these scenarios of `spec.md`, each keyed by its kind tag and its position among scenarios of that kind, in spec order"
    : "the scenarios keyed";
const publicKeys = arm.publicTests ? " Tests in `tests/public/` whose names start with one of those keys test the same scenario." : "";
const message = (job) =>
  feedback === "keyed"
    ? `Your previous submission is already in \`src/\`. It was not accepted: the separate acceptance run failed on ${scenarios}: ${job.keys.join(", ")}.${publicKeys} Re-read \`spec.md\`, fix the implementation, and stop when you consider the spec implemented.`
    : "Your previous submission is already in `src/`. It was not accepted: the separate acceptance run found failures. Re-read `spec.md`, fix the implementation, and stop when you consider the spec implemented.";

for (const job of jobs) {
  job.dir = stage(workdir(`${job.slug}-${variant}-${job.n}`), job.slug, {
    skeleton: true,
    publicTests: arm.publicTests,
    spec: brief === "spec",
    src: join(job.first, "submission", "src"),
  });
  if (brief !== "spec") stageBrief(job.dir, job.slug, brief);
  git(job.dir, "init", "-q");
  git(job.dir, "add", "-A");
  git(job.dir, "commit", "-qm", "first attempt");
  job.before = manifest(job.dir);
}
log(`${jobs.length} ${variant} run(s) staged`);

let halted = null;
// --min-free <percent>, as in run.mjs: a session starts only while the
// system has that share of memory free.
const minFree = Number(options["min-free"] ?? 0);
const freePercent = () => {
  const out = spawnSync("memory_pressure", [], { encoding: "utf8" }).stdout ?? "";
  const match = /free percentage:\s*(\d+)%/.exec(out);
  return match === null ? 100 : Number(match[1]);
};
await pool(jobs, Number(options.concurrency ?? 3), async (job) => {
  while (minFree > 0 && freePercent() < minFree) {
    log(`memory free below ${minFree}%; waiting`);
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }
  if (halted !== null) return discard(job.dir);
  rmSync(job.out, { recursive: true, force: true });
  const transcript = join(job.out, "transcript.jsonl");
  const startedAt = new Date().toISOString();
  const text = `${prompt(arm.prompt, toolchainOf(job.slug))}\n${message(job)}\n`;
  log(job.slug, variant, job.n, "retry started", feedback === "keyed" ? job.keys.join(",") : "");
  const session = await claude({ cwd: job.dir, text, transcript, kind: "agent", model });
  if (session.apiError === "usage_limit_reached") {
    halted = session.finalText || session.apiError;
    log(job.slug, variant, job.n, "HALTED, no run recorded:", halted);
    rmSync(job.out, { recursive: true, force: true });
    return discard(job.dir);
  }
  const changed = changes(job.before, manifest(job.dir));
  git(job.dir, "add", "-A");
  writeFileSync(join(job.out, "diff.patch"), git(job.dir, "diff", "--cached", "--binary", "HEAD").stdout);
  const srcFiles = manifest(join(job.dir, "src"));
  for (const path of Object.keys(srcFiles).filter((path) => !emitted(path, srcFiles)))
    copy(join(job.dir, "src", path), join(job.out, "submission", "src", path));
  writeJson(join(job.out, "run.json"), {
    slug: job.slug,
    arm: arm.name,
    variant,
    n: job.n,
    attempt: 2,
    feedback,
    keys: feedback === "keyed" ? job.keys : [],
    startedAt,
    session: (({ finalText, stderr, ...rest }) => rest)(session),
    summary: session.finalText.trim().slice(-2000),
    changes: changed,
    peeks: peeks(transcript, job.dir, arm.publicTests ? ["tests/private"] : ["tests/private", "tests/public"]),
  });
  discard(job.dir);
  log(job.slug, variant, job.n, `retry ${session.ok ? "done" : "ended with an error"}`, `$${(session.costUsd ?? 0).toFixed(2)}`);
});
if (halted !== null) {
  console.log(`halted on the account's usage limit (${halted}); rerun the same command after it resets`);
  process.exit(2);
}
console.log(`${jobs.length} retr${jobs.length === 1 ? "y" : "ies"} finished`);
