#!/usr/bin/env node
// Generation, run by bin/prepare.mjs. For a spec, three `claude -p`
// sessions in order: the skeleton, the public suite, then the hidden suite.
// Each runs in its own workdir that cannot read this folder or any other
// workdir. The hidden writer is staged with the public suite present and
// writes what it does not exercise; only the implementing agent is kept
// blind. Writes specs/<slug>/skeleton/src/<the toolchain's interface file>,
// specs/<slug>/tests/{public,private}/ and specs/<slug>/generation.json
// (sessions and cost per party; the hidden writer's `Open in the spec:`
// list as `private.open`).
//
// On a repository target (toolchain.json, bin/repo.mjs) the skeleton is the
// seam files, kept at their repository paths under skeleton/; the stub must
// build and keep every existing test that passed on base, and the existing
// suite's run on base plus stub replaces specs/<slug>/baseline.json. The
// suites are written at `publicDir/<slug>.*` and in `hiddenDir`, and kept
// under tests/public/ and tests/private/ relative to those folders.
//
//   node bin/generate.mjs <slug> [--force] [--only public]
//
// A step whose output exists is skipped unless --force; deleting
// specs/<slug>/tests/private/ regenerates the hidden suite alone. --only
// public writes the public suite and no other step (a spec whose hidden
// suite is an oracle's cases, evidence/backends.mjs `ladder`); a hidden
// suite there is still removed as stale once the public suite is new. The
// writers' backend is lib.mjs `backendOf` (INDEPENDENT_TESTS_BACKEND, or
// toolchain.json `backend`).
// INDEPENDENT_TESTS_HIDDEN_MODEL picks the hidden writer's model; unset, it
// uses the same model as every other session.

import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, posix } from "node:path";
import {
  RUNS,
  args,
  baselineOf,
  build,
  changes,
  checkCommand,
  session as runSession,
  copy,
  discard,
  log,
  manifestOf,
  pool,
  prompt,
  readJson,
  regressionsOf,
  runSuite,
  sha256,
  specDir,
  specSlugs,
  stage,
  toolchainOf,
  workdir,
  writeJson,
} from "./lib.mjs";

/**
 * The two suites in the order they are written: `dir` is where a suite is
 * kept under specs/<slug>/, `folder` where it sits in a staged tree, `own`
 * which of the tree's files are its tests. The hidden writer's workdir
 * holds the public suite; its write check still allows only its own
 * folder's tests, so an edit to a public file fails it.
 */
function suitesOf(chain) {
  const repo = chain.name === "repo";
  const publicFolder = repo ? chain.publicDir : "tests/public";
  const hiddenFolder = repo ? chain.hiddenDir : "tests/private";
  const test = chain.isTest;
  return [
    {
      name: "public",
      dir: "tests/public",
      folder: publicFolder,
      own: repo
        ? (path) => posix.dirname(path) === publicFolder && chain.isPublicName(posix.basename(path)) && test(path)
        : (path) => path.startsWith(`${publicFolder}/`) && test(path),
      required: repo ? `${publicFolder}/${chain.publicName} (${chain.testPattern})` : `${publicFolder}/${chain.testPattern}`,
      prompt: "public-tests",
      parts: { skeleton: true },
    },
    {
      name: "private",
      dir: "tests/private",
      folder: hiddenFolder,
      own: (path) => path.startsWith(`${hiddenFolder}/`) && test(path),
      required: `${hiddenFolder}/${chain.testPattern}`,
      prompt: "hidden-tests",
      parts: { skeleton: true, publicTests: true },
      model: () => process.env.INDEPENDENT_TESTS_HIDDEN_MODEL,
    },
  ];
}

/**
 * Runs one party's session and its one fix turn: `check` says what is
 * wrong with the workdir afterwards, or null.
 */
async function party({ slug, name, dir, text, check, model, chain }) {
  const transcript = join(RUNS, slug, "generate", `${name}.jsonl`);
  rmSync(transcript, { force: true });
  const before = manifestOf(dir, chain);
  log(slug, name, "started");
  const first = await runSession({ cwd: dir, text, transcript, kind: "generate", model, chain });
  let problem = check(before);
  let session = first;
  const sessions = [first];
  if (problem !== null && first.sessionId !== null) {
    log(slug, name, "fix turn:", problem.split("\n")[0]);
    session = await runSession({
      cwd: dir,
      text: `This is not done yet:\n\n${problem}\n\nFix it, following the original instructions.`,
      transcript,
      kind: "generate",
      resume: first.sessionId,
      model,
      chain,
    });
    sessions.push(session);
    problem = check(before);
  }
  const record = {
    sessions: sessions.map(({ finalText, stderr, ...rest }) => rest),
    costUsd: sessions.reduce((sum, s) => sum + (s.costUsd ?? 0), 0),
    finalText: session.finalText,
    problem,
  };
  log(
    slug,
    name,
    problem === null ? "done" : `FAILED: ${problem.split("\n")[0]}`,
    `$${record.costUsd.toFixed(2)}`,
  );
  return record;
}

/** Why a workdir's changes are not what a party may write, or null. */
function wrote(before, dir, allowed, required, chain) {
  const changed = changes(before, manifestOf(dir, chain), chain);
  const stray = changed.filter((item) => !allowed(item.path));
  if (stray.length > 0)
    return `Only ${required} may be written; also touched: ${stray.map((item) => `${item.path} (${item.change})`).join(", ")}. Undo those.`;
  const compiled = build(dir, chain);
  const command = checkCommand(chain);
  if (!compiled.ok) return `\`${command}\` reports errors:\n\n${compiled.output.slice(0, 4000)}`;
  return null;
}

/**
 * On a repository target, why the stub is not done when the existing suite
 * lost a test that passed on base, or null; `runs` keeps the suite's
 * result for baseline.json.
 */
function keptExisting(dir, chain, onBase, runs) {
  const result = runSuite(dir, "existing", chain);
  runs.push(result);
  const lost = regressionsOf(onBase, result);
  if (lost.length === 0) return null;
  return `These existing tests passed before your change and fail now:\n\n${lost
    .slice(0, 40)
    .map((id) => `- ${id}`)
    .join("\n")}${lost.length > 40 ? `\n- and ${lost.length - 40} more` : ""}\n\nKeep every existing export and its behaviour.`;
}

/**
 * The `Open in the spec:` list the hidden writer ends with: one item per
 * public test that asserts something the spec leaves open, with the open
 * question. Empty when the writer wrote `none` or no list at all.
 */
export function openList(finalText) {
  const headings = [...finalText.matchAll(/open in the spec:?/gi)];
  if (headings.length === 0) return [];
  const last = headings.at(-1);
  const items = [];
  for (const raw of finalText.slice(last.index + last[0].length).split("\n")) {
    const line = raw.replace(/\*\*/g, "").trim();
    if (line === "") continue;
    const item = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (item) items.push(item[1].trim());
    else if (items.length > 0) items[items.length - 1] += ` ${line}`;
    else if (!/^none\b/i.test(line)) items.push(line);
  }
  return items;
}

async function generate(slug, force, only = null) {
  const out = specDir(slug);
  const chain = toolchainOf(slug);
  const repo = chain.name === "repo";
  const suites = suitesOf(chain);
  const record = readJson(join(out, "generation.json"), {});
  const skeletonFiles = repo ? chain.seam : [chain.skeleton[0]];
  const baselinePath = join(out, "baseline.json");
  const baseline = readJson(baselinePath, null);
  if (repo && baseline === null) throw new Error(`${slug}: no baseline.json; run node bin/repo.mjs first.`);
  // The run on base, which a stub is checked against even after
  // baseline.json holds the run on an older stub.
  const onBase = baseline?.onBase ?? baseline;

  if (only === null && (force || !skeletonFiles.every((path) => existsSync(join(out, "skeleton", path))))) {
    const dir = stage(workdir(`${slug}-skeleton`), slug);
    const runs = [];
    record.skeleton = await party({
      slug,
      name: "skeleton",
      dir,
      text: prompt("skeleton", chain),
      chain,
      check: (before) => {
        const absent = skeletonFiles.filter((path) => !existsSync(join(dir, path)));
        if (absent.length > 0) return `${absent.join(", ")} does not exist.`;
        const problem = wrote(before, dir, (path) => skeletonFiles.includes(path), skeletonFiles.join(", "), chain);
        return problem ?? (repo ? keptExisting(dir, chain, onBase, runs) : null);
      },
    });
    if (record.skeleton.problem === null) {
      rmSync(join(out, "skeleton"), { recursive: true, force: true });
      for (const path of skeletonFiles) copy(join(dir, path), join(out, "skeleton", path));
      const hashes = skeletonFiles.map((path) => sha256(readFileSync(join(out, "skeleton", path))));
      record.skeleton.sha256 = repo ? sha256(JSON.stringify(hashes)) : hashes[0];
      if (repo) {
        const { stage: _, ...base } = onBase;
        writeJson(baselinePath, { base: chain.base, ...baselineOf(runs.at(-1), "stub"), onBase: base });
      }
      // Suites written against an older skeleton are stale.
      for (const suite of suites) rmSync(join(out, suite.dir), { recursive: true, force: true });
    }
    discard(dir);
    writeJson(join(out, "generation.json"), record);
    if (record.skeleton.problem !== null) return record;
  }

  // In order: the hidden writer reads the public suite, so the public
  // suite is final before the hidden session starts.
  for (const suite of suites) {
    const target = suite.dir;
    if (only !== null && !only.includes(suite.name)) continue;
    if (!force && existsSync(join(out, target))) continue;
    const dir = stage(workdir(`${slug}-${suite.name}`), slug, suite.parts);
    const inSuite = suite.own;
    record[suite.name] = await party({
      slug,
      name: suite.name,
      dir,
      text: prompt(suite.prompt, chain),
      model: suite.model?.(),
      chain,
      check: (before) => {
        const after = manifestOf(dir, chain);
        if (!Object.keys(after).some(inSuite)) return `No test files at ${suite.required}.`;
        return wrote(before, dir, inSuite, suite.required, chain);
      },
    });
    if (record[suite.name].problem === null) {
      rmSync(join(out, target), { recursive: true, force: true });
      const files = Object.keys(manifestOf(dir, chain)).filter(inSuite);
      for (const path of files) copy(join(dir, path), join(out, target, posix.relative(suite.folder, path)));
      record[suite.name].files = files;
      // A hidden suite written against an older public suite is stale.
      if (suite.name === "public")
        rmSync(join(out, "tests", "private"), { recursive: true, force: true });
      if (suite.name === "private") record.private.open = openList(record.private.finalText);
    }
    discard(dir);
    writeJson(join(out, "generation.json"), record);
    if (record[suite.name].problem !== null) return record;
  }
  return record;
}

const { options, rest } = args();
const slugs = specSlugs(rest);
const results = await pool(slugs, Number(options.concurrency ?? 2), (slug) =>
  generate(slug, options.force === true, typeof options.only === "string" ? options.only.split(",") : null),
);
let failed = 0;
for (const [at, record] of results.entries())
  for (const name of ["skeleton", "public", "private"]) {
    const problem = record[name]?.problem;
    if (problem) {
      failed += 1;
      console.log(`${slugs[at]} ${name}: ${problem.split("\n")[0]}`);
    }
  }
console.log(failed === 0 ? `generated ${slugs.join(", ")}` : `${failed} step(s) failed`);
process.exit(failed === 0 ? 0 : 1);
