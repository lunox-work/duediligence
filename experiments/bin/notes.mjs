#!/usr/bin/env node
// The public suite in words (FINDINGS.md, "Tests or the same words"): for a spec
// with a ticket.md, one session reads the ticket, the skeleton and
// tests/public/ and writes specs/<slug>/notes.md, every behaviour the
// public tests check stated as prose with their example values, and
// nothing they leave open. `--brief ticket-notes` on bin/run.mjs gives an
// arm the ticket plus these notes, so a spec-only run gets what the public
// suite says without a test to run. The writer never sees spec.md or the
// hidden suite.
//
//   node bin/notes.mjs [slug...] [--force] [--concurrency 3]

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RUNS,
  args,
  changes,
  claude,
  copy,
  discard,
  log,
  manifest,
  pool,
  prompt,
  readJson,
  specDir,
  specSlugs,
  stage,
  workdir,
  writeJson,
} from "./lib.mjs";

async function notes(slug, force) {
  const out = join(specDir(slug), "notes.md");
  if (!force && existsSync(out)) return log(slug, "skipped: notes.md exists");
  const dir = stage(workdir(`${slug}-notes`), slug, { spec: false, skeleton: true, publicTests: true });
  copy(join(specDir(slug), "ticket.md"), join(dir, "ticket.md"));
  const before = manifest(dir);
  const transcript = join(RUNS, slug, "generate", "notes.jsonl");
  log(slug, "notes started");
  const session = await claude({ cwd: dir, text: prompt("notes"), transcript, kind: "generate" });
  const stray = changes(before, manifest(dir)).filter((item) => item.path !== "notes.md");
  const text = existsSync(join(dir, "notes.md")) ? readFileSync(join(dir, "notes.md"), "utf8") : "";
  // The notes must read as notes on the ticket: a test path or a test's
  // key would tell the reader there is a suite and where.
  const problem = text === ""
    ? "no notes.md"
    : stray.length > 0
      ? `also touched ${stray.map((item) => item.path).join(", ")}`
      : /tests\/public|\[[a-z]+-\d+\]/.test(text)
        ? "names a test file or a test key"
        : null;
  if (problem === null) copy(join(dir, "notes.md"), out);
  const record = readJson(join(specDir(slug), "generation.json"), {});
  record.notes = { ...(({ finalText, stderr, ...rest }) => rest)(session), finalText: session.finalText, problem };
  writeJson(join(specDir(slug), "generation.json"), record);
  discard(dir);
  log(slug, problem === null ? "done" : `FAILED: ${problem}`, `$${(session.costUsd ?? 0).toFixed(2)}`);
}

const { options, rest } = args();
const slugs = specSlugs(rest).filter((slug) => existsSync(join(specDir(slug), "ticket.md")) && !slug.endsWith("-gen"));
await pool(slugs, Number(options.concurrency ?? 3), (slug) => notes(slug, options.force === true));
