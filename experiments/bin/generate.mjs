#!/usr/bin/env node
// Step 2. For each spec, three `claude -p` sessions in order: the skeleton,
// the public suite, then the hidden suite. Each runs in its own workdir
// that cannot read this folder or any other workdir. The hidden writer is
// staged with the public suite present and writes what it does not
// exercise; only the implementing agent is kept blind. Writes
// specs/<slug>/skeleton/src/index.ts, specs/<slug>/tests/{public,private}/
// and specs/<slug>/generation.json.
//
//   node bin/generate.mjs [slug...] [--force] [--concurrency 3]
//
// A step whose output exists is skipped unless --force; deleting
// specs/<slug>/tests/private/ regenerates the hidden suite alone.
// DOUBLE_BLIND_HIDDEN_MODEL picks the hidden writer's model; unset, it
// uses the same model as every other session.

import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  RUNS,
  args,
  build,
  changes,
  claude,
  copy,
  discard,
  log,
  manifest,
  pool,
  prompt,
  readJson,
  sha256,
  skeletonFile,
  specDir,
  specSlugs,
  stage,
  toolchainOf,
  workdir,
  writeJson,
} from "./lib.mjs";

/**
 * The two suites in the order they are written. The hidden writer's
 * workdir holds the public suite; its write check still allows only
 * tests/private/*.test.ts, so an edit to a public file fails it.
 */
const SUITES = [
  { name: "public", dir: "tests/public", prompt: "public-tests", parts: { skeleton: true } },
  {
    name: "private",
    dir: "tests/private",
    prompt: "hidden-tests",
    parts: { skeleton: true, publicTests: true },
    model: () => process.env.DOUBLE_BLIND_HIDDEN_MODEL,
  },
];
const SUITE_DIRS = Object.fromEntries(SUITES.map((suite) => [suite.name, suite.dir]));

/**
 * Runs one party's session and its one fix turn: `check` says what is
 * wrong with the workdir afterwards, or null.
 */
async function party({ slug, name, dir, text, check, model }) {
  const transcript = join(RUNS, slug, "generate", `${name}.jsonl`);
  rmSync(transcript, { force: true });
  const before = manifest(dir);
  log(slug, name, "started");
  const first = await claude({ cwd: dir, text, transcript, kind: "generate", model });
  let problem = check(before);
  let session = first;
  const sessions = [first];
  if (problem !== null && first.sessionId !== null) {
    log(slug, name, "fix turn:", problem.split("\n")[0]);
    session = await claude({
      cwd: dir,
      text: `This is not done yet:\n\n${problem}\n\nFix it, following the original instructions.`,
      transcript,
      kind: "generate",
      resume: first.sessionId,
      model,
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
  log(slug, name, problem === null ? "done" : `FAILED: ${problem.split("\n")[0]}`, `$${record.costUsd.toFixed(2)}`);
  return record;
}

/** Why a workdir's changes are not what a party may write, or null. */
function wrote(before, dir, allowed, required) {
  const changed = changes(before, manifest(dir));
  const stray = changed.filter((item) => !allowed(item.path));
  if (stray.length > 0)
    return `Only ${required} may be written; also touched: ${stray.map((item) => `${item.path} (${item.change})`).join(", ")}. Undo those.`;
  const compiled = build(dir);
  if (!compiled.ok) return `\`npm run build\` reports errors:\n\n${compiled.output.slice(0, 4000)}`;
  return null;
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

async function generate(slug, force) {
  const out = specDir(slug);
  const record = readJson(join(out, "generation.json"), {});
  const chain = toolchainOf(slug);
  // Which suites a session writes here; a benchmark's own hidden suite,
  // imported with the spec, is never generated or deleted (toolchain.json
  // `generate: ["public"]`).
  const generates = chain.generate ?? ["public", "private"];
  const skeletonPath = join(out, "skeleton", skeletonFile(slug, join(out, "skeleton")) ?? chain.skeleton[0]);
  if (chain.name !== "node" && !existsSync(skeletonPath))
    throw new Error(`${slug}: no skeleton at ${skeletonPath}; a ${chain.name} spec brings its own.`);

  if (chain.name === "node" && (force || !existsSync(skeletonPath))) {
    const dir = stage(workdir(`${slug}-skeleton`), slug);
    record.skeleton = await party({
      slug,
      name: "skeleton",
      dir,
      text: prompt("skeleton"),
      check: (before) =>
        existsSync(join(dir, "src", "index.ts"))
          ? wrote(before, dir, (path) => path === "src/index.ts", "src/index.ts")
          : "src/index.ts does not exist.",
    });
    if (record.skeleton.problem === null) {
      rmSync(join(out, "skeleton"), { recursive: true, force: true });
      copy(join(dir, "src", "index.ts"), skeletonPath);
      record.skeleton.sha256 = sha256(readFileSync(skeletonPath));
      // Suites written against an older skeleton are stale.
      for (const suite of Object.values(SUITE_DIRS))
        rmSync(join(out, suite), { recursive: true, force: true });
    }
    discard(dir);
    writeJson(join(out, "generation.json"), record);
    if (record.skeleton.problem !== null) return record;
  }

  // In order: the hidden writer reads the public suite, so the public
  // suite is final before the hidden session starts.
  for (const suite of SUITES) {
    const target = suite.dir;
    if (!generates.includes(suite.name)) continue;
    if (!force && existsSync(join(out, target))) continue;
    const dir = stage(workdir(`${slug}-${suite.name}`), slug, suite.parts);
    const inSuite = (path) => path.startsWith(`${target}/`) && chain.isTest(path);
    record[suite.name] = await party({
      slug,
      name: suite.name,
      dir,
      text: prompt(suite.prompt, chain),
      model: suite.model?.(),
      check: (before) => {
        const after = manifest(dir);
        if (!Object.keys(after).some(inSuite))
          return `No test files under ${target}/.`;
        return wrote(before, dir, inSuite, `${target}/${chain.testPattern}`);
      },
    });
    if (record[suite.name].problem === null) {
      rmSync(join(out, target), { recursive: true, force: true });
      const files = Object.keys(manifest(dir)).filter(inSuite);
      for (const path of files) copy(join(dir, path), join(out, path));
      record[suite.name].files = files;
      // A hidden suite written against an older public suite is stale.
      if (suite.name === "public" && generates.includes("private"))
        rmSync(join(out, SUITE_DIRS.private), { recursive: true, force: true });
      if (suite.name === "private")
        record.private.open = openList(record.private.finalText);
    }
    discard(dir);
    writeJson(join(out, "generation.json"), record);
    if (record[suite.name].problem !== null) return record;
  }
  return record;
}

const { options, rest } = args();
const slugs = specSlugs(rest);
const results = await pool(slugs, Number(options.concurrency ?? 3), (slug) =>
  generate(slug, options.force === true),
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
