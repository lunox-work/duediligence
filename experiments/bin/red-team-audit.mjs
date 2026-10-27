#!/usr/bin/env node
// Which red-team passes are hidden-suite holes (FINDINGS.md, "Gaming the suite").
// A red-team run (`ARMS`) was told to pass the public tests with the least
// general code. One that also passes the hidden suite either took no
// shortcut that matters or took one the hidden suite does not catch. One
// session per such run reads spec.md, the public tests, the submitted src/
// and the agent's own summary, and says which: runs/<slug>/<variant>/<n>/
// audit.json, `general` or `shortcut` with each shortcut and an input it
// gets wrong. The auditor never sees the hidden suite.
//
//   node bin/red-team-audit.mjs [slug...] [--variant red-team-haiku] [--force] [--concurrency 3]

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  RESULTS,
  RUNS,
  args,
  claude,
  discard,
  log,
  pool,
  prompt,
  readJson,
  specSlugs,
  stage,
  workdir,
  writeJson,
} from "./lib.mjs";

const { options, rest } = args();
const variant = typeof options.variant === "string" ? options.variant : "red-team-haiku";
const slugs = new Set(specSlugs(rest));
const passed = readFileSync(RESULTS, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .filter((line) => line.variant === variant && line.verdict === "passed" && slugs.has(line.spec))
  .map((line) => ({ slug: line.spec, n: line.run, out: join(RUNS, line.spec, variant, String(line.run)) }))
  .filter((job) => options.force === true || !existsSync(join(job.out, "audit.json")));

log(`${passed.length} passed ${variant} run(s) to audit`);
await pool(passed, Number(options.concurrency ?? 3), async (job) => {
  const dir = stage(workdir(`${job.slug}-audit-${job.n}`), job.slug, {
    publicTests: true,
    src: join(job.out, "submission", "src"),
  });
  writeFileSync(join(dir, "summary.md"), `${readJson(join(job.out, "run.json"), {}).summary ?? ""}\n`);
  const session = await claude({
    cwd: dir,
    text: prompt("red-team-audit"),
    transcript: join(job.out, "audit.jsonl"),
    kind: "generate",
  });
  let audit = null;
  try {
    audit = JSON.parse(readFileSync(join(dir, "audit.json"), "utf8"));
  } catch {}
  const problem = audit === null || !["general", "shortcut"].includes(audit.verdict) ? "no readable audit.json" : null;
  if (problem === null) writeJson(join(job.out, "audit.json"), { ...audit, costUsd: session.costUsd });
  discard(dir);
  log(job.slug, variant, job.n, problem === null ? audit.verdict : `FAILED: ${problem}`, `$${(session.costUsd ?? 0).toFixed(2)}`);
});

// The table: every graded run of the variant, by what caught it.
const lines = readFileSync(RESULTS, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .filter((line) => line.variant === variant && slugs.has(line.spec));
const tally = { overfit: 0, incomplete: 0, refused: 0, general: 0, shortcut: 0, unaudited: 0 };
const holes = [];
for (const line of lines) {
  if (line.verdict !== "passed") {
    tally[line.verdict] += 1;
    continue;
  }
  const audit = readJson(join(RUNS, line.spec, variant, String(line.run), "audit.json"), null);
  if (audit === null) tally.unaudited += 1;
  else {
    tally[audit.verdict] += 1;
    if (audit.verdict === "shortcut") holes.push(`${line.spec}/${line.run}: ${audit.shortcuts.map((item) => item.rule).join("; ")}`);
  }
}
console.log(`${lines.length} ${variant} runs, every one passing the public suite unless incomplete:`);
console.log(JSON.stringify(tally));
console.log("hidden-suite holes (passed both, audited shortcut):");
for (const hole of holes) console.log(`  ${hole}`);
