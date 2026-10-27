#!/usr/bin/env node
// Step 3. Checks each hidden suite two ways and writes
// specs/<slug>/calibration.json with the hidden tests kept and dropped:
//
// - on the skeleton, every hidden test must fail and its file must load;
//   a test that passes, or a file that crashes, is dropped;
// - a reference implementation, written in a fourth session that sees both
//   suites, must pass them; a hidden test it cannot satisfy is dropped.
//
// A spec left with no hidden test is dropped. The reference is kept in
// specs/<slug>/reference/src/.
//
//   node bin/calibrate.mjs [slug...] [--force] [--concurrency 3]

import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  RUNS,
  args,
  changes,
  claude,
  copy,
  count,
  discard,
  judge,
  listFiles,
  log,
  manifest,
  pool,
  prompt,
  readJson,
  runSuite,
  skeletonFile,
  specDir,
  specSlugs,
  stage,
  testsOf,
  toolchainOf,
  workdir,
  writeJson,
} from "./lib.mjs";

const failing = (result) =>
  [
    ...result.files.filter((file) => file.crashed).map((file) => `${file.file} :: (file crashed)`),
    ...testsOf(result).filter((test) => !test.ok).map((test) => `${test.id} :: ${test.error?.message.split("\n")[0] ?? ""}`),
  ];

async function calibrate(slug) {
  const out = specDir(slug);
  const chain = toolchainOf(slug);
  if (skeletonFile(slug, join(out, "skeleton")) === null)
    throw new Error(`${slug}: no skeleton under skeleton/; run generate first.`);
  for (const part of ["tests/public", "tests/private"])
    if (!existsSync(join(out, part))) throw new Error(`${slug}: no ${part}; run generate first.`);
  const dropped = [];

  // The skeleton: every hidden test fails, and fails inside its test.
  const skeletonDir = stage(workdir(`${slug}-calibrate`), slug, {
    skeleton: true,
    publicTests: true,
    hiddenTests: true,
  });
  const onSkeleton = runSuite(skeletonDir, "private");
  const publicOnSkeleton = runSuite(skeletonDir, "public");
  discard(skeletonDir);
  if (!onSkeleton.compiled)
    return { slug, status: "dropped", reason: "The hidden suite does not compile against the skeleton.", compileOutput: onSkeleton.compileOutput };
  for (const file of onSkeleton.files)
    if (file.crashed) dropped.push({ id: `${file.file} :: *`, reason: "The file crashes on the skeleton instead of failing a test." });
  for (const test of testsOf(onSkeleton))
    if (test.ok || test.skipped)
      dropped.push({ id: test.id, reason: test.skipped ? "Skipped." : "Passes on the skeleton." });

  // A toolchain whose hidden suite is a benchmark's own test cases needs no
  // reference to vouch for it (`reference: false` in toolchain.json): every
  // hidden test that fails on the skeleton is kept as it is.
  if (chain.reference === false) {
    const droppedIds = new Set(dropped.map((item) => item.id));
    const droppedFiles = new Set(dropped.filter((item) => item.id.endsWith(" :: *")).map((item) => item.id.slice(0, -5)));
    const hiddenIds = testsOf(onSkeleton).map((test) => test.id);
    const kept = hiddenIds.filter((id) => !droppedIds.has(id) && !droppedFiles.has(id.split(" :: ")[0]));
    const publicIds = testsOf(publicOnSkeleton).map((test) => test.id);
    const record = {
      slug,
      status: kept.length > 0 ? "ok" : "dropped",
      reason: kept.length > 0 ? null : "No hidden test survived calibration.",
      publicIds,
      publicOnSkeleton: count(publicOnSkeleton, publicIds),
      publicFailingOnReference: [],
      hiddenWritten: hiddenIds.length,
      kept,
      dropped,
      reference: null,
    };
    log(slug, `kept ${kept.length}/${hiddenIds.length} hidden, dropped ${dropped.length}; no reference (${chain.name} toolchain), public on skeleton ${record.publicOnSkeleton.passed}/${record.publicOnSkeleton.total}`);
    return record;
  }

  // The reference: a fourth session that sees both suites.
  const dir = stage(workdir(`${slug}-reference`), slug, {
    skeleton: true,
    publicTests: true,
    hiddenTests: true,
  });
  const transcript = join(RUNS, slug, "calibrate", "reference.jsonl");
  rmSync(transcript, { force: true });
  const before = manifest(dir);
  log(slug, "reference started");
  const sessions = [await claude({ cwd: dir, text: prompt("reference"), transcript, kind: "reference" })];
  let judged = judge(slug, join(dir, "src"));
  const stillFailing = [...failing(judged.public), ...failing(judged.hidden)];
  if (stillFailing.length > 0 && sessions[0].sessionId !== null) {
    log(slug, `reference fix turn: ${stillFailing.length} failing`);
    sessions.push(
      await claude({
        cwd: dir,
        text: `Run on a fresh copy with only your src/, these still fail:\n\n${stillFailing.join("\n")}\n\nFix the code where the spec supports the test. Where it does not, leave it failing and say why, as instructed.`,
        transcript,
        kind: "reference",
        resume: sessions[0].sessionId,
      }),
    );
    judged = judge(slug, join(dir, "src"));
  }
  const touched = changes(before, manifest(dir)).filter((item) => !item.path.startsWith("src/"));
  rmSync(join(out, "reference"), { recursive: true, force: true });
  for (const path of listFiles(join(dir, "src")).filter((path) => !path.endsWith(".js")))
    copy(join(dir, "src", path), join(out, "reference", "src", path));
  discard(dir);

  const droppedIds = new Set(dropped.map((item) => item.id));
  const droppedFiles = new Set(dropped.filter((item) => item.id.endsWith(" :: *")).map((item) => item.id.slice(0, -5)));
  const referenceTests = new Map(testsOf(judged.hidden).map((test) => [test.id, test]));
  const hiddenIds = testsOf(onSkeleton).map((test) => test.id);
  for (const id of hiddenIds) {
    if (droppedIds.has(id)) continue;
    const test = referenceTests.get(id);
    if (test === undefined || !test.ok)
      dropped.push({
        id,
        reason: `The reference cannot satisfy it: ${test?.error?.message.split("\n")[0] ?? "it did not run"}`,
      });
  }
  const finalDropped = new Set(dropped.map((item) => item.id));
  const kept = hiddenIds.filter((id) => !finalDropped.has(id) && !droppedFiles.has(id.split(" :: ")[0]));
  const publicIds = testsOf(judged.public).map((test) => test.id);
  const publicFailing = failing(judged.public);
  const notes = sessions.at(-1).finalText.trim().split("\n").slice(-20).join("\n");
  const record = {
    slug,
    status: kept.length > 0 ? "ok" : "dropped",
    reason: kept.length > 0 ? null : "No hidden test survived calibration.",
    publicIds,
    publicOnSkeleton: count(publicOnSkeleton, publicIds),
    publicFailingOnReference: publicFailing,
    hiddenWritten: hiddenIds.length,
    kept,
    dropped,
    reference: {
      public: count(judged.public, publicIds),
      hidden: count(judged.hidden, kept),
      touchedOutsideSrc: touched,
      notes,
      sessions: sessions.map(({ finalText, stderr, ...rest }) => rest),
      costUsd: sessions.reduce((sum, s) => sum + (s.costUsd ?? 0), 0),
    },
  };
  log(
    slug,
    `kept ${kept.length}/${hiddenIds.length} hidden, dropped ${dropped.length}; reference public ${record.reference.public.passed}/${record.reference.public.total}`,
    publicFailing.length > 0 ? `, ${publicFailing.length} PUBLIC FAILING ON REFERENCE` : "",
  );
  return record;
}

const { options, rest } = args();
const slugs = specSlugs(rest).filter(
  (slug) => options.force === true || !existsSync(join(specDir(slug), "calibration.json")),
);
const records = await pool(slugs, Number(options.concurrency ?? 3), async (slug) => {
  const record = await calibrate(slug);
  writeJson(join(specDir(slug), "calibration.json"), record);
  return record;
});
for (const record of records)
  console.log(
    `${record.slug}: ${record.status}${record.reason ? ` (${record.reason})` : ""}, kept ${record.kept?.length ?? 0}/${record.hiddenWritten ?? 0} hidden, public failing on reference: ${record.publicFailingOnReference?.length ?? "-"}`,
  );
if (records.length === 0) console.log("nothing to calibrate");
