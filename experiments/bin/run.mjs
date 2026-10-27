#!/usr/bin/env node
// Step 4. N agent runs per calibrated spec, each in a fresh copy of the
// template and skeleton, plus the public tests in the double-blind arm
// (`ARMS`). Keeps, per run, under runs/<slug>/<arm>/<n>/: the transcript,
// the diff, the submitted src/ and run.json (session, every path the run
// changed, peek attempts).
//
//   node bin/run.mjs [slug...] [--arm double-blind] [--model haiku] [--brief ticket|ticket-notes] [--runs 3] [--concurrency 3] [--min-free 25] [--force]
//
// --model sets the agent's model only, and files the runs under
// runs/<slug>/<arm>-<model>/; the suites stay the ones generated.
//
// Every workdir is staged before the first session starts, so each
// session's deny rules name all the others. Grade only after every run
// has finished: grading stages the hidden suite.

import { spawnSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BRIEFS,
  RUNS,
  args,
  armOf,
  hasBrief,
  stageBrief,
  startSrc,
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
  specDir,
  specSlugs,
  stage,
  toolchainOf,
  workdir,
  writeJson,
} from "./lib.mjs";

const git = (dir, ...argv) =>
  spawnSync("git", ["-c", "user.name=double-blind", "-c", "user.email=double-blind@localhost", ...argv], {
    cwd: dir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

const { options, rest } = args();
const runs = Number(options.runs ?? 3);
const arm = armOf(options.arm);
const model = typeof options.model === "string" ? options.model : undefined;
// --brief ticket gives the agent specs/<slug>/ticket.md, the loose ticket as
// written, in place of spec.md; --brief ticket-notes adds notes.md (`BRIEFS`).
// The suites stay the ones the spec gave.
const brief = typeof options.brief === "string" ? options.brief : "spec";
if (BRIEFS[brief] === undefined) throw new Error(`No brief ${brief}; one of ${Object.keys(BRIEFS).join(", ")}.`);
const variant = `${model === undefined ? arm.name : `${arm.name}-${model}`}${brief === "spec" ? "" : `-${brief}`}`;
const jobs = specSlugs(rest)
  .filter((slug) => {
    const calibration = readJson(join(specDir(slug), "calibration.json"), null);
    if (calibration?.status !== "ok") log(slug, "skipped: not calibrated, or dropped");
    if (!hasBrief(slug, brief)) {
      log(slug, `skipped: no ${BRIEFS[brief].join(" or ")}`);
      return false;
    }
    return calibration?.status === "ok";
  })
  .flatMap((slug) =>
    Array.from({ length: runs }, (_, at) => ({ slug, n: at + 1, out: join(RUNS, slug, variant, String(at + 1)) })),
  )
  .filter((job) => options.force === true || !existsSync(join(job.out, "run.json")));

for (const job of jobs) {
  job.dir = stage(workdir(`${job.slug}-${variant}-${job.n}`), job.slug, {
    skeleton: true,
    publicTests: arm.publicTests,
    spec: brief === "spec",
    src: startSrc(job.slug),
  });
  if (brief !== "spec") stageBrief(job.dir, job.slug, brief);
  git(job.dir, "init", "-q");
  git(job.dir, "add", "-A");
  git(job.dir, "commit", "-qm", "baseline");
  job.before = manifest(job.dir);
}
log(`${jobs.length} ${variant} run(s) staged`);

// A session the API refused for the account's usage limit did no work: it
// leaves no run.json, so the next invocation redoes it, and no further
// session starts, since each would be refused the same way (the Max plan's
// five-hour window did this to 55 runs on 2026-10-24).
let halted = null;
// --min-free <percent>: a session starts only while the system has that
// share of memory free, as macOS's memory_pressure reports it, so a batch
// beside other sessions' never drives the machine out of memory.
const minFree = Number(options["min-free"] ?? 0);
const freePercent = () => {
  const out = spawnSync("memory_pressure", [], { encoding: "utf8" }).stdout ?? "";
  const match = /free percentage:\s*(\d+)%/.exec(out);
  return match === null ? 100 : Number(match[1]);
};
async function roomForSession() {
  while (minFree > 0 && freePercent() < minFree) {
    log(`memory free below ${minFree}%; waiting`);
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }
}

await pool(jobs, Number(options.concurrency ?? 3), async (job) => {
  await roomForSession();
  if (halted !== null) {
    discard(job.dir);
    return;
  }
  rmSync(job.out, { recursive: true, force: true });
  const transcript = join(job.out, "transcript.jsonl");
  const startedAt = new Date().toISOString();
  log(job.slug, variant, job.n, "agent started");
  const session = await claude({ cwd: job.dir, text: prompt(arm.prompt, toolchainOf(job.slug)), transcript, kind: "agent", model, maxTurns: arm.maxTurns });
  if (session.apiError === "usage_limit_reached") {
    halted = session.finalText || session.apiError;
    log(job.slug, variant, job.n, "HALTED, no run recorded:", halted);
    rmSync(job.out, { recursive: true, force: true });
    discard(job.dir);
    return;
  }
  const changed = changes(job.before, manifest(job.dir));
  git(job.dir, "add", "-A");
  writeFileSync(join(job.out, "diff.patch"), git(job.dir, "diff", "--cached", "--binary", "HEAD").stdout);
  const srcFiles = manifest(join(job.dir, "src"));
  for (const path of Object.keys(srcFiles).filter((path) => !emitted(path, srcFiles)))
    copy(join(job.dir, "src", path), join(job.out, "submission", "src", path));
  const record = {
    slug: job.slug,
    arm: arm.name,
    variant,
    n: job.n,
    startedAt,
    session: (({ finalText, stderr, ...rest }) => rest)(session),
    summary: session.finalText.trim().slice(-2000),
    changes: changed,
    peeks: peeks(transcript, job.dir, arm.publicTests ? ["tests/private"] : ["tests/private", "tests/public"]),
  };
  writeJson(join(job.out, "run.json"), record);
  discard(job.dir);
  log(
    job.slug,
    variant,
    job.n,
    `agent ${session.ok ? "done" : session.timedOut ? "TIMED OUT" : "ended with an error"}`,
    `$${(session.costUsd ?? 0).toFixed(2)}, ${changed.length} path(s) changed${record.peeks.length > 0 ? `, ${record.peeks.length} PEEK ATTEMPT(S)` : ""}`,
  );
});
if (halted !== null) {
  console.log(`halted on the account's usage limit (${halted}); rerun the same command after it resets`);
  process.exit(2);
}
console.log(`${jobs.length} run(s) finished`);
