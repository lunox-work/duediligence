#!/usr/bin/env node
// Calibration, run by bin/prepare.mjs. Checks a hidden suite two ways and
// writes specs/<slug>/calibration.json with the hidden tests kept and
// dropped:
//
// - on the skeleton, every hidden test must fail and its file must load;
//   a test that passes, or a file that crashes, is dropped;
// - a reference implementation, written in a fourth session that sees both
//   suites, must pass them; a hidden test it cannot satisfy is dropped.
//
// A spec left with no hidden test is dropped. The reference is kept in
// specs/<slug>/reference/src/. A public test the reference fails is listed
// as `publicFailingOnReference`: a test the writer got wrong, or a reading
// the spec leaves open.
//
// On a repository target the reference may change only `allowedPaths`: its
// changes there, at their repository paths, are the reference (kept under
// specs/<slug>/reference/) and are judged over base plus stub, with the
// existing suite too. `referenceRegressions` lists the tests baseline.json
// says passed on base plus stub that fail on the reference; the fix turn
// names them.
//
//   node bin/calibrate.mjs <slug> [--force]

import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  RUNS,
  allowedPath,
  args,
  changes,
  session as runSession,
  copy,
  count,
  discard,
  judge,
  listFiles,
  log,
  manifestOf,
  pool,
  prompt,
  readJson,
  regressionsOf,
  runSuite,
  specDir,
  specSlugs,
  stage,
  testsOf,
  toolchainOf,
  workdir,
  writeJson,
} from "./lib.mjs";
import { calibration } from "./rules.mjs";

const failing = (result) => [
  ...result.files.filter((file) => file.crashed).map((file) => `${file.file} :: (file crashed)`),
  ...testsOf(result)
    .filter((test) => !test.ok)
    .map((test) => `${test.id} :: ${test.error?.message.split("\n")[0] ?? ""}`),
];

async function calibrate(slug) {
  const out = specDir(slug);
  const chain = toolchainOf(slug);
  const repo = chain.name === "repo";
  if (repo) {
    for (const path of chain.seam)
      if (!existsSync(join(out, "skeleton", path))) throw new Error(`${slug}: no skeleton/${path}; run generate first.`);
  } else if (!chain.skeleton.some((path) => existsSync(join(out, "skeleton", path))))
    throw new Error(`${slug}: no skeleton/${chain.skeleton[0]}; run generate first.`);
  const baseline = repo ? readJson(join(out, "baseline.json"), null) : null;
  if (repo && baseline?.stage !== "stub")
    throw new Error(`${slug}: baseline.json is not the run on base plus stub; run generate first.`);
  for (const part of ["tests/public", "tests/private"])
    if (!existsSync(join(out, part))) throw new Error(`${slug}: no ${part}; run generate first.`);

  // The skeleton: every hidden test fails, and fails inside its test (the rule: rules.mjs `calibration`).
  const skeletonDir = stage(workdir(`${slug}-calibrate`), slug, {
    skeleton: true,
    publicTests: true,
    hiddenTests: true,
  });
  const onSkeleton = runSuite(skeletonDir, "private", chain);
  const publicOnSkeleton = runSuite(skeletonDir, "public", chain);
  discard(skeletonDir);
  if (!onSkeleton.compiled) {
    const { status, reason, compileOutput } = calibration({ skeleton: onSkeleton });
    return { slug, status, reason, compileOutput };
  }

  // The reference: a fourth session that sees both suites.
  const dir = stage(workdir(`${slug}-reference`), slug, {
    skeleton: true,
    publicTests: true,
    hiddenTests: true,
  });
  const transcript = join(RUNS, slug, "calibrate", "reference.jsonl");
  rmSync(transcript, { force: true });
  const before = manifestOf(dir, chain);
  const mine = repo ? (path) => allowedPath(chain, path) : (path) => path.startsWith("src/");
  /**
   * What the reference wrote, judged on fresh trees: its src/, or on a
   * repository target its changes in allowedPaths, copied to a snapshot.
   */
  const snapshot = workdir(`${slug}-reference-snapshot`);
  const judgeReference = () => {
    if (!repo) return { judged: judge(slug, join(dir, "src")), regressions: [] };
    rmSync(snapshot, { recursive: true, force: true });
    for (const item of changes(before, manifestOf(dir, chain), chain))
      if (mine(item.path) && item.change !== "removed") copy(join(dir, item.path), join(snapshot, item.path));
    const judged = judge(slug, snapshot, { existing: true });
    return { judged, regressions: regressionsOf(baseline, judged.existing) };
  };
  log(slug, "reference started");
  const sessions = [await runSession({ cwd: dir, text: prompt("reference", chain), transcript, kind: "reference", chain })];
  let { judged, regressions } = judgeReference();
  const stillFailing = [...failing(judged.public), ...failing(judged.hidden)];
  if ((stillFailing.length > 0 || regressions.length > 0) && sessions[0].sessionId !== null) {
    log(slug, `reference fix turn: ${stillFailing.length} failing, ${regressions.length} regression(s)`);
    const fresh = repo ? "with only your changes in the allowed paths" : "with only your src/";
    const parts = [
      stillFailing.length > 0 ? `these still fail:\n\n${stillFailing.join("\n")}` : null,
      regressions.length > 0
        ? `these tests of the existing suite passed before your change and fail now:\n\n${regressions.join("\n")}`
        : null,
    ].filter(Boolean);
    sessions.push(
      await runSession({
        cwd: dir,
        text: `Run on a fresh copy ${fresh}, ${parts.join("\n\nAnd ")}\n\nFix the code where the spec supports the test. Where it does not, leave it failing and say why, as instructed.`,
        transcript,
        kind: "reference",
        resume: sessions[0].sessionId,
        chain,
      }),
    );
    ({ judged, regressions } = judgeReference());
  }
  const touched = changes(before, manifestOf(dir, chain), chain).filter((item) => !mine(item.path));
  const removed = changes(before, manifestOf(dir, chain), chain).filter(
    (item) => mine(item.path) && item.change === "removed",
  );
  rmSync(join(out, "reference"), { recursive: true, force: true });
  if (repo) copy(snapshot, join(out, "reference"));
  else {
    // What the toolchain emits beside a source (compiled .js, __pycache__) is not the reference.
    const written = Object.fromEntries(listFiles(join(dir, "src")).map((path) => [`src/${path}`, true]));
    for (const path of Object.keys(written).filter((path) => !chain.generated(path, written)))
      copy(join(dir, path), join(out, "reference", path));
  }
  discard(snapshot);
  discard(dir);

  const { status, reason, hiddenWritten, kept, dropped } = calibration({ skeleton: onSkeleton, reference: judged.hidden });
  const publicIds = testsOf(judged.public).map((test) => test.id);
  const publicFailing = failing(judged.public);
  const notes = sessions.at(-1).finalText.trim().split("\n").slice(-20).join("\n");
  const record = {
    slug,
    status,
    reason,
    publicIds,
    publicOnSkeleton: count(publicOnSkeleton, publicIds),
    publicFailingOnReference: publicFailing,
    ...(repo ? { referenceRegressions: regressions } : {}),
    hiddenWritten,
    kept,
    dropped,
    reference: {
      public: count(judged.public, publicIds),
      hidden: count(judged.hidden, kept),
      touchedOutsideSrc: touched,
      ...(repo ? { removed, existing: count(judged.existing, baseline.passing) } : {}),
      notes,
      sessions: sessions.map(({ finalText, stderr, ...rest }) => rest),
      costUsd: sessions.reduce((sum, s) => sum + (s.costUsd ?? 0), 0),
    },
  };
  log(
    slug,
    `kept ${kept.length}/${hiddenWritten} hidden, dropped ${dropped.length}; reference public ${record.reference.public.passed}/${record.reference.public.total}`,
    publicFailing.length > 0 ? `, ${publicFailing.length} PUBLIC FAILING ON REFERENCE` : "",
    regressions.length > 0 ? `, ${regressions.length} REFERENCE REGRESSION(S)` : "",
  );
  return record;
}

const { options, rest } = args();
const slugs = specSlugs(rest).filter(
  (slug) => options.force === true || !existsSync(join(specDir(slug), "calibration.json")),
);
const records = await pool(slugs, Number(options.concurrency ?? 2), async (slug) => {
  const record = await calibrate(slug);
  writeJson(join(specDir(slug), "calibration.json"), record);
  return record;
});
for (const record of records)
  console.log(
    `${record.slug}: ${record.status}${record.reason ? ` (${record.reason})` : ""}, kept ${record.kept?.length ?? 0}/${record.hiddenWritten ?? 0} hidden, public failing on reference: ${record.publicFailingOnReference?.length ?? "-"}${record.referenceRegressions === undefined ? "" : `, reference regressions: ${record.referenceRegressions.length}`}`,
  );
if (records.length === 0) console.log("nothing to calibrate");
