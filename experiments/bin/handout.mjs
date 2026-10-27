#!/usr/bin/env node
// What an implementing agent outside bin/run.mjs may see (SKILL.md, step 4),
// staged in a new folder: the template, spec.md, the skeleton, the public
// suite, and BRIEF.md, the skill's agent brief (prompts/agent-own.md). Never
// the hidden suite, the reference, calibration.json or generation.json.
// Hand the folder to any agent; judge its src/ with bin/judge.mjs.
//
//   node bin/handout.mjs <slug> <dir>

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ROOT, args, prompt, readJson, specDir, stage } from "./lib.mjs";

const { rest } = args();
const [slug, target] = rest;
if (slug === undefined || target === undefined) {
  console.error("usage: node bin/handout.mjs <slug> <dir>");
  process.exit(1);
}
if (readJson(join(specDir(slug), "calibration.json"), null)?.status !== "ok") {
  console.error(`${slug}: not calibrated; run node bin/prepare.mjs ${slug} first.`);
  process.exit(1);
}
const dir = resolve(target);
if (dir === ROOT || dir.startsWith(`${ROOT}/`)) {
  console.error(`${dir} is inside ${ROOT}, beside the hidden suites; pick a folder outside it.`);
  process.exit(1);
}
if (existsSync(dir) && readdirSync(dir).length > 0) {
  console.error(`${dir} is not empty.`);
  process.exit(1);
}
stage(dir, slug, { skeleton: true, publicTests: true });
writeFileSync(join(dir, "BRIEF.md"), prompt("agent-own"));
console.log(`${slug}: handout in ${dir}. Give the agent BRIEF.md; then node bin/judge.mjs ${slug} ${join(dir, "src")}.`);
