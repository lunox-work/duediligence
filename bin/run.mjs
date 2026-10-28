#!/usr/bin/env node
// A blind session (SKILL.md, step 4). N agent runs for a calibrated spec,
// each in a fresh copy of the template, the skeleton and the public suite,
// briefed by prompts/agent.md. Per run, under runs/<slug>/<variant>/<n>/:
// the transcript, the diff, the submitted src/ and run.json (session, every
// path the run changed, peek attempts). <variant> is the model's family
// (opus, sonnet, haiku), from --model or the default.
//
//   node bin/run.mjs <slug> [--runs 1] [--model haiku] [--backend codex-cli] [--concurrency 2] [--no-public] [--brief red-team] [--force]
//
// --no-public is the control arm of the evidence (RESULTS.md): the agent
// gets the spec and the stub but no public suite, briefed by
// prompts/repo/agent-no-public.md, and its variant is `<family>-no-public`.
// Repository targets only.
//
// Every workdir is staged before the first session starts, so each
// session's deny rules name all the others. Grade only after every run has
// finished: grading stages the hidden suite. A session the account's usage
// limit refused leaves no run.json; rerun the same command after it resets.
//
// On a repository target the workdir is a clone of base plus stub plus
// public suite, briefed by prompts/repo/agent.md, and submission/ holds the
// files the run added or changed at their repository paths; run.json's
// `changes` also names what it removed.

import { spawnSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AGENT,
  backendOf,
  DEFAULT_MODEL,
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
  specDir,
  specSlugs,
  stage,
  toolchainOf,
  variantOf,
  workdir,
  writeJson,
} from "./lib.mjs";

const git = (dir, ...argv) =>
  spawnSync(
    "git",
    ["-c", "user.name=duediligence", "-c", "user.email=duediligence@localhost", ...argv],
    { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );

const { options, rest } = args();
const runs = Number(options.runs ?? 1);
// --backend runs the agent on another backend (lib.mjs `backendOf`, by
// default whichever agent the person has); its variant is the backend's
// name unless --model names a model.
const backend = backendOf({ backend: typeof options.backend === "string" ? options.backend : undefined, kind: "agent" });
const model =
  typeof options.model === "string" ? options.model : backend === "claude-cli" ? DEFAULT_MODEL : undefined;
const noPublic = options["no-public"] === true;
// --brief red-team briefs the agent with prompts/agent-red-team.md (pass the
// public suite with the least general code; bin/red-team-audit.mjs), and its
// variant is `red-team-<family>`. New-module specs only.
const brief = typeof options.brief === "string" ? options.brief : null;
if (brief !== null && brief !== "red-team") throw new Error(`No brief ${brief} (red-team)`);
const variant = `${brief === null ? "" : `${brief}-`}${model === undefined ? backend : variantOf(model)}${noPublic ? "-no-public" : ""}`;
const jobs = specSlugs(rest)
  .filter((slug) => {
    const ok = readJson(join(specDir(slug), "calibration.json"), null)?.status === "ok";
    if (!ok) log(slug, "skipped: not calibrated (node bin/prepare.mjs first)");
    if (ok && noPublic && toolchainOf(slug).name !== "repo") throw new Error(`${slug}: --no-public takes a repository target`);
    if (ok && brief !== null && toolchainOf(slug).name === "repo") throw new Error(`${slug}: --brief ${brief} takes a new-module spec`);
    return ok;
  })
  .flatMap((slug) =>
    Array.from({ length: runs }, (_, at) => ({
      slug,
      n: at + 1,
      out: join(RUNS, slug, variant, String(at + 1)),
    })),
  )
  .filter((job) => options.force === true || !existsSync(join(job.out, "run.json")));

for (const job of jobs) {
  job.dir = stage(workdir(`${job.slug}-${variant}-${job.n}`), job.slug, {
    skeleton: true,
    publicTests: !noPublic,
  });
  git(job.dir, "init", "-q");
  git(job.dir, "add", "-A");
  git(job.dir, "commit", "-qm", "baseline");
  job.chain = toolchainOf(job.slug);
  job.before = manifestOf(job.dir, job.chain);
}
log(`${jobs.length} ${variant} run(s) staged`);

let halted = null;
await pool(jobs, Number(options.concurrency ?? 2), async (job) => {
  if (halted !== null) return discard(job.dir);
  rmSync(job.out, { recursive: true, force: true });
  const transcript = join(job.out, "transcript.jsonl");
  const startedAt = new Date().toISOString();
  log(job.slug, variant, job.n, "agent started");
  const session = await runSession({
    cwd: job.dir,
    text: prompt(brief !== null ? `agent-${brief}` : noPublic ? "agent-no-public" : AGENT.prompt, job.chain),
    transcript,
    kind: "agent",
    model,
    chain: job.chain,
    backend,
  });
  if (session.apiError === "usage_limit_reached") {
    halted = session.finalText || session.apiError;
    log(job.slug, variant, job.n, "HALTED, no run recorded:", halted);
    rmSync(job.out, { recursive: true, force: true });
    return discard(job.dir);
  }
  const repo = job.chain.name === "repo";
  const changed = repo
    ? changes(job.before, manifestOf(job.dir, job.chain), job.chain)
    : changes(job.before, manifestOf(job.dir));
  git(job.dir, "add", "-A");
  writeFileSync(join(job.out, "diff.patch"), git(job.dir, "diff", "--cached", "--binary", "HEAD").stdout);
  if (repo)
    for (const item of changed.filter((item) => item.change !== "removed" && item.symlink !== true))
      copy(join(job.dir, item.path), join(job.out, "submission", item.path));
  else {
    const srcFiles = manifest(join(job.dir, "src"));
    for (const path of Object.keys(srcFiles).filter((path) => !emitted(path, srcFiles)))
      copy(join(job.dir, "src", path), join(job.out, "submission", "src", path));
  }
  const record = {
    slug: job.slug,
    variant,
    n: job.n,
    startedAt,
    session: (({ finalText, stderr, ...rest }) => rest)(session),
    summary: session.finalText.trim().slice(-2000),
    changes: changed,
    peeks: peeks(transcript, job.dir, ["tests/private", ...(repo ? [job.chain.hiddenDir.split("/").at(-1)] : [])]),
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
console.log(
  `${jobs.length} run(s) finished${jobs.length > 0 ? `; next: node bin/grade.mjs ${[...new Set(jobs.map((job) => job.slug))].join(" ")}` : ""}`,
);
