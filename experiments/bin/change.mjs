#!/usr/bin/env node
// Change requests on code in use (FINDINGS.md, "A change to code in use"). For a
// calibrated spec with a reference, one session reads spec.md and the
// reference src/ and writes a change: the ticket as a product owner files
// it, describing the change only, and the whole spec after it. The derived
// spec, specs/<slug>-change/, keeps the original's skeleton (the interface
// does not change), starts every agent run from the reference src/
// (`startSrc`), and gives agents the change briefs in prompts/change/.
// Its suites are generated and calibrated from the new spec as usual, so
// the hidden suite judges the old behaviour that stays and the new one.
//
//   node bin/change.mjs [slug...] [--force] [--concurrency 3]
//   node bin/generate.mjs <slug>-change... && node bin/calibrate.mjs <slug>-change...
//   node bin/run.mjs <slug>-change... --brief ticket --arm <arm> --model haiku
//   node bin/change-report.mjs

import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  RUNS,
  SPECS,
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

async function change(slug, force) {
  const out = join(SPECS, `${slug}-change`);
  if (!force && existsSync(join(out, "spec.md"))) return log(slug, "skipped: change spec exists");
  const reference = join(specDir(slug), "reference", "src");
  const dir = stage(workdir(`${slug}-change`), slug, { src: reference });
  const before = manifest(dir);
  const transcript = join(RUNS, `${slug}-change`, "generate", "change.jsonl");
  log(slug, "change request started");
  const session = await claude({ cwd: dir, text: prompt("change-request"), transcript, kind: "generate" });
  const wanted = ["change/spec.md", "change/ticket.md"];
  const stray = changes(before, manifest(dir)).filter((item) => !wanted.includes(item.path));
  const missing = wanted.filter((path) => !existsSync(join(dir, path)));
  const problem =
    missing.length > 0
      ? `missing ${missing.join(", ")}`
      : stray.length > 0
        ? `also touched ${stray.map((item) => item.path).join(", ")}`
        : readFileSync(join(dir, "change/spec.md"), "utf8") === readFileSync(join(dir, "spec.md"), "utf8")
          ? "the spec did not change"
          : null;
  if (problem === null) {
    rmSync(out, { recursive: true, force: true });
    copy(join(dir, "change", "spec.md"), join(out, "spec.md"));
    copy(join(dir, "change", "ticket.md"), join(out, "ticket.md"));
    copy(join(specDir(slug), "skeleton"), join(out, "skeleton"));
    copy(reference, join(out, "start", "src"));
    writeJson(join(out, "toolchain.json"), { name: "node", prompts: "change" });
    writeJson(join(out, "generation.json"), {
      from: slug,
      change: { ...(({ finalText, stderr, ...rest }) => rest)(session), finalText: session.finalText },
    });
  }
  discard(dir);
  log(slug, problem === null ? "done" : `FAILED: ${problem}`, `$${(session.costUsd ?? 0).toFixed(2)}`);
}

const { options, rest } = args();
const slugs = specSlugs(rest).filter(
  (slug) => readJson(join(specDir(slug), "calibration.json"), null)?.reference != null && existsSync(join(specDir(slug), "reference", "src")),
);
await pool(slugs, Number(options.concurrency ?? 3), (slug) => change(slug, options.force === true));
