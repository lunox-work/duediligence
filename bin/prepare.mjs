#!/usr/bin/env node
// From a confirmed spec to calibrated suites (SKILL.md, step 3). In order:
//
// - refuses a spec.md no person has confirmed as it stands (bin/confirm.mjs);
// - runs bin/generate.mjs, with --force when spec.md changed since the
//   suites were written, so no suite outlives the spec it was written from;
// - stops on the hidden writer's `Open in the spec:` list: public tests that
//   assert what the spec leaves open, which the person decides in spec.md
//   (and confirms again) or leaves open with --accept-open;
// - runs bin/calibrate.mjs and prints what it kept.
//
// specs/<slug>/prepared.json holds the hash of the spec.md the suites were
// written from and, on a repository target, the confirmation's hash, which
// also covers the seam and the allowed paths. Suites that predate it are
// regenerated only with --force, which makes the spec's stored runs stale.
// Once calibration keeps the spec it also holds hiddenSha256 and hiddenAt,
// the commitment hash over the hidden suite (bin/commitment.mjs); a rerun
// on a ready spec skips both sessions and records it again, which is how a
// confirmed spec prepared before the hash existed gets one.
//
//   node bin/prepare.mjs <slug> [--accept-open] [--force]
//
// Exit 0 ready to implement, 3 not confirmed, 4 open questions, 1 a step
// failed or, on a repository target, the reference broke existing tests.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { recordCommitment } from "./commitment.mjs";
import { confirmation } from "./confirm.mjs";
import { ROOT, args, readJson, specDir, writeJson } from "./lib.mjs";

const { options, rest } = args();
const [slug] = rest;
if (slug === undefined) {
  console.error("usage: node bin/prepare.mjs <slug> [--accept-open] [--force]");
  process.exit(1);
}
const dir = specDir(slug);
const step = (script, ...argv) =>
  spawnSync(process.execPath, [join(ROOT, "bin", script), slug, ...argv], {
    cwd: ROOT,
    stdio: "inherit",
  }).status === 0;

const confirmed = confirmation(slug);
if (!confirmed.ok) {
  console.log(
    `${slug}: ${confirmed.reason}. Show the person its decisions (node bin/confirm.mjs ${slug}), then record their confirmation with --by.`,
  );
  process.exit(3);
}

const preparedPath = join(dir, "prepared.json");
const prepared = readJson(preparedPath, null);
const hasSuites = existsSync(join(dir, "skeleton")) || existsSync(join(dir, "tests", "public"));
if (hasSuites && prepared === null && options.force !== true) {
  console.log(
    `${slug}: its suites were not written by prepare.mjs. Pass --force to regenerate them from the confirmed spec.md; stored runs of this spec are then stale.`,
  );
  process.exit(1);
}
const preparedFrom = prepared?.confirmedSha256 ?? prepared?.specSha256;
const stale = hasSuites && (preparedFrom !== confirmed.hash || options.force === true);
// Written before generating, so a run that fails partway resumes on the
// same spec instead of being refused as foreign.
writeJson(preparedPath, {
  specSha256: confirmed.specHash,
  ...(confirmed.hash === confirmed.specHash ? {} : { confirmedSha256: confirmed.hash }),
  at: new Date().toISOString(),
});
if (!step("generate.mjs", ...(stale ? ["--force"] : []))) process.exit(1);

const open = readJson(join(dir, "generation.json"), {}).private?.open ?? [];
if (open.length > 0 && options["accept-open"] !== true) {
  console.log(`\n${slug}: the public suite asserts ${open.length} thing(s) the spec leaves open:`);
  for (const item of open) console.log(`- ${item}`);
  console.log(
    "\nDecide each in spec.md, confirm it again and rerun this script (the suites are rewritten),",
    "or rerun with --accept-open to leave them open: the hidden suite then tests neither reading.",
  );
  process.exit(4);
}

if (!step("calibrate.mjs", ...(stale ? ["--force"] : []))) process.exit(1);
const calibration = readJson(join(dir, "calibration.json"), {});
if (calibration.status !== "ok") {
  console.log(`\n${slug}: calibration dropped the spec: ${calibration.reason}.`);
  process.exit(1);
}
const regressions = calibration.referenceRegressions ?? [];
if (regressions.length > 0) {
  console.log(`\n${slug}: the reference broke ${regressions.length} existing test(s) that pass on base plus stub:`);
  for (const id of regressions) console.log(`- ${id}`);
  console.log(
    "\nThe spec changes behaviour those tests pin, or the allowed paths are too narrow for it. Decide which in spec.md or toolchain.json, confirm again and rerun with --force.",
  );
  process.exit(1);
}
const committed = recordCommitment(slug);
console.log(
  `\n${slug}: ready. Public ${calibration.publicIds.length} tests;`,
  `hidden ${calibration.kept.length} kept of ${calibration.hiddenWritten}`,
  calibration.dropped.length > 0
    ? `(${calibration.dropped.length} dropped: they passed on the skeleton or the reference could not pass them; calibration.json says which).`
    : "(none dropped).",
);
console.log(`Hidden suite sha256 ${committed.hiddenSha256}: the handout shows it, and the judge refuses once it changes.`);
console.log(
  readJson(join(dir, "toolchain.json"), {}).name === "repo"
    ? `Next: node bin/run.mjs ${slug}, or node bin/handout.mjs ${slug} --repo [<checkout>].`
    : `Next: node bin/run.mjs ${slug}, or node bin/handout.mjs ${slug} <dir>.`,
);
