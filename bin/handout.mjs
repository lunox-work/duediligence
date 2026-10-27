#!/usr/bin/env node
// What an implementing agent outside bin/run.mjs may see (SKILL.md, step 4),
// staged in a new folder: the template, spec.md, the skeleton, the public
// suite, and BRIEF.md, the agent's brief (prompts/agent.md). Never the
// hidden suite, the reference, calibration.json or generation.json. Hand
// the folder to any agent; judge its src/ with bin/judge.mjs.
//
// On a repository target, --repo writes into a checkout of the repository
// instead (the toolchain's own by default): the stub at the seam paths and
// the public suite in publicDir, uncommitted, and nothing hidden. It
// refuses when a seam file is dirty or differs from base, or a public
// file exists. runs/<slug>/handout/ gets BRIEF.md (prompts/repo/agent.md,
// plus the audit rule), spec.md and handout.json, whose time is where
// `judge --audit` starts reading the implementing session. --remove takes
// out what the handout wrote while it is still unchanged.
//
// Both kinds show the hidden suite's commitment hash (bin/commitment.mjs)
// in BRIEF.md and handout.json (in the folder; in runs/<slug>/handout/ for
// --repo), and refuse when the hidden suite no longer matches the one
// prepared.json records. A spec prepared before the hash existed gets its
// commitment recorded here, at its first handout.
//
//   node bin/handout.mjs <slug> <dir>
//   node bin/handout.mjs <slug> --repo [<checkout>] [--remove]

import { spawnSync } from "node:child_process";
import { commitment, recordCommitment } from "./commitment.mjs";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  AGENT,
  PRIVATE,
  RUNS,
  args,
  copy,
  listFiles,
  promotedOf,
  prompt,
  readJson,
  specDir,
  stage,
  toolchainOf,
  writeJson,
} from "./lib.mjs";

const { options, rest } = args();
const [slug, target] = rest;
if (slug === undefined || (target === undefined && options.repo === undefined)) {
  console.error("usage: node bin/handout.mjs <slug> <dir> | <slug> --repo [<checkout>] [--remove]");
  process.exit(1);
}
if (readJson(join(specDir(slug), "calibration.json"), null)?.status !== "ok") {
  console.error(`${slug}: not calibrated; run node bin/prepare.mjs ${slug} first.`);
  process.exit(1);
}
if (options.repo !== undefined) {
  repoHandout(typeof options.repo === "string" ? options.repo : undefined, options.remove === true);
  process.exit(0);
}
const dir = resolve(target);
const beside = PRIVATE.find((folder) => dir === folder || dir.startsWith(`${folder}/`));
if (beside !== undefined) {
  console.error(`${dir} is inside ${beside}, beside the hidden suites; pick a folder outside it.`);
  process.exit(1);
}
if (existsSync(dir) && readdirSync(dir).length > 0) {
  console.error(`${dir} is not empty.`);
  process.exit(1);
}
const committed = commit();
stage(dir, slug, { skeleton: true, publicTests: true });
writeFileSync(join(dir, "BRIEF.md"), `${prompt(AGENT.prompt, toolchainOf(slug))}${commitmentNote(committed)}`);
writeJson(join(dir, "handout.json"), { at: new Date().toISOString(), slug, ...committed });
console.log(`${slug}: handout in ${dir}. Give the agent BRIEF.md; then node bin/judge.mjs ${slug} ${join(dir, "src")}.`);

/**
 * The commitment the handout shows: refused when the hidden suite changed
 * since prepared.json recorded it; recorded now when it never was.
 */
function commit() {
  const found = commitment(slug);
  if (!found.ok) {
    console.error(`${slug}: hidden suite changed since ${found.at} (sha256 ${found.current}, committed ${found.recorded}); rerun node bin/prepare.mjs ${slug} to commit to it as it is.`);
    process.exit(1);
  }
  if (found.recorded !== null) return { hiddenSha256: found.recorded, hiddenAt: found.at };
  if (found.prepared === null) return { hiddenSha256: found.current, hiddenAt: null };
  const recorded = recordCommitment(slug, "handout");
  return { hiddenSha256: recorded.hiddenSha256, hiddenAt: recorded.hiddenAt };
}
/** The brief's closing paragraph: the hash the graded party can check the verdict against. */
function commitmentNote({ hiddenSha256, hiddenAt }) {
  return `
The hidden suite was fixed before this handout: sha256 \`${hiddenSha256}\`${hiddenAt === null ? "" : `, committed ${hiddenAt}`}. The judge prints the hash it checked with every verdict; a different one means the suite changed after this handout.
`;
}

/** The stub and public suite written into a checkout of the target repository. */
function repoHandout(checkoutPath, remove) {
  const chain = toolchainOf(slug);
  const fail = (message) => {
    console.error(`${slug}: ${message}`);
    process.exit(1);
  };
  if (chain.name !== "repo") fail("not a repository target; use node bin/handout.mjs <slug> <dir>");
  if (promotedOf(slug) !== null) fail("promoted: its hidden suite is in the repository now, so there is nothing left to hand out");
  const top = spawnSync("git", ["-C", resolve(checkoutPath ?? chain.repo), "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (top.status !== 0) fail(`${checkoutPath ?? chain.repo} is not a git checkout`);
  const root = top.stdout.trim();
  const git = (...argv) => spawnSync("git", ["-C", root, ...argv], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const spec = specDir(slug);
  const files = [
    ...chain.seam.map((path) => ({ path, from: join(spec, "skeleton", path), seam: true })),
    ...listFiles(join(spec, "tests", "public")).map((name) => ({
      path: join(chain.publicDir, name),
      from: join(spec, "tests", "public", name),
      seam: false,
    })),
  ];
  const atBase = (path) => {
    const shown = spawnSync("git", ["-C", root, "show", `${chain.base}:${path}`], { maxBuffer: 64 * 1024 * 1024 });
    return shown.status === 0 ? shown.stdout : null;
  };
  const out = join(RUNS, slug, "handout");

  if (remove) {
    const kept = [];
    for (const file of files) {
      const full = join(root, file.path);
      if (!existsSync(full)) continue;
      if (!readFileSync(full).equals(readFileSync(file.from))) {
        kept.push(file.path);
        continue;
      }
      const base = file.seam ? atBase(file.path) : null;
      if (base === null) rmSync(full);
      else writeFileSync(full, base);
    }
    console.log(
      kept.length === 0
        ? `${slug}: handout removed from ${root}.`
        : `${slug}: removed what was unchanged; left ${kept.join(", ")}, which changed since the handout.`,
    );
    return;
  }

  const problems = [];
  if (git("cat-file", "-e", `${chain.base}^{commit}`).status !== 0) problems.push(`the checkout has no base commit ${chain.base}`);
  for (const file of files) {
    const full = join(root, file.path);
    const dirty = git("status", "--porcelain", "--", file.path).stdout.trim() !== "";
    if (!file.seam && existsSync(full)) problems.push(`${file.path} exists`);
    else if (file.seam && dirty) problems.push(`${file.path} has uncommitted changes`);
    else if (file.seam && existsSync(full) && !readFileSync(full).equals(atBase(file.path) ?? Buffer.alloc(0)))
      problems.push(`${file.path} differs from base ${chain.base.slice(0, 12)}, which the stub was written on`);
    else if (file.seam && !existsSync(full) && atBase(file.path) !== null) problems.push(`${file.path} was removed since base`);
  }
  if (problems.length > 0) fail(`refused:\n${problems.map((item) => `- ${item}`).join("\n")}`);

  const committed = commit();
  for (const file of files) copy(file.from, join(root, file.path));
  copy(join(spec, "spec.md"), join(out, "spec.md"));
  const brief = `${prompt(AGENT.prompt, { ...chain, specPath: join(out, "spec.md") })}
Run this skill's commands as you need them, but never open \`specs/${slug}/\` beyond \`spec.md\`, \`runs/${slug}/\` beyond \`handout/\`, or a judge's staged tree: \`node bin/judge.mjs ${slug} --repo --audit\` scans this session's transcript for any attempt and reports it with the verdict.
${commitmentNote(committed)}`;
  writeFileSync(join(out, "BRIEF.md"), brief);
  writeJson(join(out, "handout.json"), {
    at: new Date().toISOString(),
    checkout: root,
    base: chain.base,
    files: files.map((file) => file.path),
    ...committed,
  });
  console.log(brief);
  console.log(`${slug}: stub and public suite written into ${root} (${files.length} file(s), uncommitted); brief in ${join(out, "BRIEF.md")}.`);
  console.log(`Then: node bin/judge.mjs ${slug} --repo ${root === chain.repo ? "" : root} --audit`.replace(/  +/g, " "));
}
