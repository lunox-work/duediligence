#!/usr/bin/env node
// The ticket pipeline (FINDINGS.md, "From the ticket alone"): a spec that has a
// ticket.md gets a derived spec, specs/<slug>-gen/, whose spec.md a session
// wrote from the ticket and the skeleton alone, never seeing the precise
// spec or either suite. The derived spec keeps the original's skeleton,
// ticket and hidden suite, so its runs are judged by the same tests; its
// public suite is generated from the generated spec
// (`generate: ["public"]`), and calibration keeps every hidden test that
// fails on the skeleton (`reference: false`).
//
//   node bin/tighten.mjs [slug...] [--force] [--concurrency 3]
//   node bin/generate.mjs <slug>-gen... && node bin/calibrate.mjs <slug>-gen...

import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  SPECS,
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
  specDir,
  specSlugs,
  stage,
  workdir,
  writeJson,
} from "./lib.mjs";

async function tighten(slug, force) {
  const out = join(SPECS, `${slug}-gen`);
  if (!force && existsSync(join(out, "spec.md"))) return log(slug, "skipped: derived spec exists");
  const dir = stage(workdir(`${slug}-tighten`), slug, { spec: false, skeleton: true });
  copy(join(specDir(slug), "ticket.md"), join(dir, "ticket.md"));
  const before = manifest(dir);
  const transcript = join(RUNS, `${slug}-gen`, "generate", "spec.jsonl");
  log(slug, "spec from ticket started");
  const session = await claude({ cwd: dir, text: prompt("spec-from-ticket"), transcript, kind: "generate" });
  const changed = changes(before, manifest(dir));
  const stray = changed.filter((item) => item.path !== "spec.md");
  const problem = !existsSync(join(dir, "spec.md"))
    ? "no spec.md"
    : stray.length > 0
      ? `also touched ${stray.map((item) => item.path).join(", ")}`
      : null;
  if (problem === null) {
    rmSync(out, { recursive: true, force: true });
    copy(join(dir, "spec.md"), join(out, "spec.md"));
    copy(join(specDir(slug), "ticket.md"), join(out, "ticket.md"));
    copy(join(specDir(slug), "skeleton"), join(out, "skeleton"));
    copy(join(specDir(slug), "tests", "private"), join(out, "tests", "private"));
    writeJson(join(out, "toolchain.json"), { name: "node", reference: false, generate: ["public"] });
    writeJson(join(out, "generation.json"), {
      from: slug,
      spec: { ...(({ finalText, stderr, ...rest }) => rest)(session), finalText: session.finalText },
    });
  }
  discard(dir);
  log(slug, problem === null ? "done" : `FAILED: ${problem}`, `$${(session.costUsd ?? 0).toFixed(2)}`);
}

const { options, rest } = args();
const slugs = specSlugs(rest).filter((slug) => existsSync(join(specDir(slug), "ticket.md")) && !slug.endsWith("-gen"));
await pool(slugs, Number(options.concurrency ?? 3), (slug) => tighten(slug, options.force === true));
