#!/usr/bin/env node
// Points a spec at a package of an existing repository (SKILL.md, step 1).
// Runs bin/fit.mjs's detection at the base commit, then writes
// specs/<slug>/toolchain.json: the runner and build fit found, plus
//
// - `seam`: the files the stub may write, which the suites import;
// - `allowedPaths`: what the implementer may change (default: the seam's
//   folders); with the seam, a decision the person confirms
//   (bin/confirm.mjs);
// - `hiddenDir`: where the hidden suite is staged, inside the test folder
//   so the repository's runner and tsconfig pick it up;
// - `examples`: the two or three existing test files nearest the seam, whose
//   idiom the test writers follow.
//
// Then prepares the base tree (TARGETS/<slug>/<sha>/, lib.mjs
// `ensureTarget`) and writes specs/<slug>/baseline.json from the existing
// suite on it. bin/generate.mjs replaces it with the run on base plus stub.
//
//   node bin/repo.mjs <slug> --repo <path> --package <dir> --seam <file>[,<file>]
//     [--base <ref>] [--allowed <path>[,<path>]] [--hidden-dir <dir>] [--examples <file>[,<file>]]
//   node bin/repo.mjs <slug> --repo <path> --package <dir> --allowed <path>[,<path>]
//     --seam exec --command "<argv>" | --seam http --start "<cmd>" [--healthcheck <path>] [--boundary-build "<cmd>"] [...]
//
// With --seam exec or http (bin/fit.mjs `boundaryOption`) the suites call a
// command or a service instead of importing seam files: toolchain.json
// records `boundary` and no seam (`seam: []`), --allowed is required, the
// stub is base itself (whatever the change adds is not there yet), so
// baseline.json is written as the run on base plus stub, and the boundary
// is checked once on base as fit does.
//
// Paths are relative to the repository root; a folder in --allowed ends
// in `/`. Exit 0 ready for spec.md and confirmation, 2 unsupported, 1 an
// error.

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, posix } from "node:path";
import { boundaryOption, detect, reader, runBoundary } from "./fit.mjs";
import {
  args,
  baselineOf,
  discard,
  ensureTarget,
  log,
  readJson,
  runSuite,
  specDir,
  stage,
  toolchainOf,
  workdir,
  writeJson,
} from "./lib.mjs";

/** What a seam file may be, by runner: the suites import it. */
const SEAM_SOURCE = { vitest: /\.tsx?$/, "node-test": /\.tsx?$/, jest: /\.[cm]?[jt]sx?$/ };
const list = (value) => (typeof value === "string" ? value.split(",").map((item) => item.trim()).filter(Boolean) : []);
const within = (path, allowed) => (allowed.endsWith("/") ? path.startsWith(allowed) : path === allowed);

/**
 * The existing test files nearest the seam, best first: a test that imports
 * a seam file, then one named after it, then one importing from its folder.
 */
function nearest(tree, config, seam, limit = 3) {
  if (config.runner === "pytest") return nearestPython(tree, config, seam, limit);
  const stem = (path) => path.replace(/\.[cm]?[jt]sx?$/, "").replace(/\/index$/, "");
  const seams = seam.map(stem);
  const folders = seam.map((path) => posix.dirname(path));
  const pattern = new RegExp(`^${config.testPattern.replace(/\./g, "\\.").replace(/\*/g, "[^/]*").replace(/\{([^}]*)\}/g, (_, alts) => `(?:${alts.split(",").join("|")})`)}$`);
  const scored = tree.files
    .filter((path) => path.startsWith(`${config.testDir}/`) && pattern.test(posix.basename(path)))
    .map((path) => {
      const imports = [...(tree.text(path) ?? "").matchAll(/from\s+["'](\.[^"']+)["']/g)].map((match) =>
        stem(posix.normalize(posix.join(posix.dirname(path), match[1]))),
      );
      const name = posix.basename(path).replace(/\.(test|spec)\.[cm]?tsx?$/, "");
      const score = imports.some((item) => seams.includes(item))
        ? 3
        : seams.some((item) => posix.basename(item) === name)
          ? 2
          : imports.some((item) => folders.includes(posix.dirname(item)))
            ? 1
            : 0;
      return { path, score };
    })
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const ranked = scored.filter((item) => item.score > 0);
  return (ranked.length > 0 ? ranked : scored).slice(0, ranked.length > 0 ? limit : 2).map((item) => item.path);
}

/**
 * The same for pytest: a test that imports the seam's module, then one
 * named after it (`test_<module>.py`), then one importing from its package.
 */
function nearestPython(tree, config, seam, limit) {
  const root = posix.join(config.package, config.pythonPath[0]);
  const moduleOf = (path) => posix.relative(root, path).replace(/(\/__init__)?\.py$/, "").split("/").join(".");
  const modules = seam.map(moduleOf);
  const packages = modules.map((name) => name.split(".").slice(0, -1).join(".")).filter(Boolean);
  const scored = tree.files
    .filter((path) => path.startsWith(`${config.testDir}/`) && /^test_[^/]*\.py$/.test(posix.basename(path)))
    .map((path) => {
      const text = tree.text(path) ?? "";
      const imports = [...text.matchAll(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm)].map((match) => match[1] ?? match[2]);
      const name = posix.basename(path).replace(/^test_|\.py$/g, "");
      const score = imports.some((item) => modules.includes(item))
        ? 3
        : modules.some((item) => item.split(".").at(-1) === name)
          ? 2
          : imports.some((item) => packages.some((pkg) => item === pkg || item.startsWith(`${pkg}.`)))
            ? 1
            : 0;
      return { path, score };
    })
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const ranked = scored.filter((item) => item.score > 0);
  return (ranked.length > 0 ? ranked : scored).slice(0, ranked.length > 0 ? limit : 2).map((item) => item.path);
}

/**
 * Whether a vitest include glob (relative to the package) takes a file:
 * the hidden suite must sit inside it, since vitest only finds files its
 * config includes.
 */
function included(globs, file) {
  const toRegex = (glob) =>
    new RegExp(
      `^${glob
        .replace(/^\.\//, "")
        .replace(/[.+^$()|[\]\\]/g, "\\$&")
        .replace(/\*\*\//g, "(?:.*/)?")
        .replace(/\*/g, "[^/]*")
        .replace(/\{([^}]*)\}/g, (_, alts) => `(?:${alts.split(",").join("|")})`)}$`,
    );
  return globs.some((glob) => toRegex(glob).test(file));
}

const { options, rest } = args();
const [slug] = rest;
let boundary;
try {
  boundary = boundaryOption(options);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const seam = boundary === null ? list(options.seam) : [];
if (boundary !== null && list(options.allowed).length === 0) {
  console.error(`${slug}: --seam ${options.seam} has no seam files to take the allowed paths from; pass --allowed.`);
  process.exit(1);
}
if (slug === undefined || typeof options.repo !== "string" || typeof options.package !== "string" || (seam.length === 0 && boundary === null)) {
  console.error(
    "usage: node bin/repo.mjs <slug> --repo <path> --package <dir> --seam <file>[,<file>] | --seam exec --command <argv> | --seam http --start <cmd> [--healthcheck <path>] [--base <ref>] [--allowed <path>,...] [--hidden-dir <dir>] [--examples <file>,...]",
  );
  process.exit(1);
}
const fail = (message, code = 1) => {
  console.error(`${slug}: ${message}`);
  process.exit(code);
};

const found = detect({ repo: options.repo, pkg: options.package, ref: options.base ?? "HEAD" });
if (!found.supported) fail(`unsupported: ${found.reason}`, 2);
const { config } = found;
/** Whether a repository path is inside the package (any path, for a package at the root). */
const inPackage = (path) => config.package === "." || path.startsWith(`${config.package}/`);
const tree = reader(config.repo, config.base);

for (const path of seam) {
  if (!inPackage(path)) fail(`seam file ${path} is outside ${config.package}/`);
  if (path.startsWith(`${config.testDir}/`)) fail(`seam file ${path} is in the test folder ${config.testDir}/`);
  if (config.runner === "pytest" ? !/\.py$/.test(path) : !SEAM_SOURCE[config.runner].test(path))
    fail(`seam file ${path} is not ${config.runner === "pytest" ? "Python" : config.runner === "jest" ? "TypeScript or JavaScript" : "TypeScript"}`);
}
const allowedPaths = list(options.allowed);
if (allowedPaths.length === 0) allowedPaths.push(...new Set(seam.map((path) => `${posix.dirname(path)}/`)));
for (const path of seam)
  if (!allowedPaths.some((allowed) => within(path, allowed))) fail(`seam file ${path} is outside --allowed`);
const harness = [
  "package.json",
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
  ...tree.files.filter((path) => /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|uv\.lock|poetry\.lock|requirements[^/]*\.txt)$/.test(path)),
];
for (const allowed of allowedPaths) {
  if (within(`${config.testDir}/`, allowed) || allowed.startsWith(`${config.testDir}/`))
    fail(`allowed path ${allowed} covers the test folder ${config.testDir}/, which is harness`);
  if (harness.some((path) => path !== undefined && (within(path, allowed) || within(posix.join(config.package, path), allowed))))
    fail(`allowed path ${allowed} covers the project manifest or the lockfile, which are harness`);
}
// A Python folder name is an identifier, so the folder imports as a package where tests/ is one.
const hiddenName = config.runner === "pytest" ? `hidden_${slug.replace(/[^A-Za-z0-9]+/g, "_")}` : `hidden-${slug}`;
const hiddenDir = typeof options["hidden-dir"] === "string" ? options["hidden-dir"].replace(/\/$/, "") : `${config.testDir}/${hiddenName}`;
if (!inPackage(hiddenDir)) fail(`hidden dir ${hiddenDir} is outside ${config.package}/`);
const sample = (folder, name) => posix.relative(config.package, `${folder}/${name}`);
const testName =
  config.runner === "pytest" ? `test_${slug.replace(/[^A-Za-z0-9]+/g, "_")}.py` : config.testPattern.replace(/\{([^,}]*)[^}]*\}/, "$1").replace("*", slug);
const vitestInclude = found.facts.vitestInclude;
if (config.runner === "vitest" && vitestInclude !== null)
  for (const [what, folder] of [
    ["public", config.testDir],
    ["hidden", hiddenDir],
  ])
    if (!included(vitestInclude, sample(folder, testName)))
      fail(`vitest's include (${vitestInclude.join(", ")}) does not take the ${what} suite at ${folder}/; pass --hidden-dir inside it`);

const toolchain = {
  ...config,
  hiddenDir,
  seam,
  allowedPaths,
  examples: list(options.examples).length > 0 ? list(options.examples) : nearest(tree, config, seam),
  ...(boundary === null ? {} : { boundary }),
};
const out = specDir(slug);
mkdirSync(out, { recursive: true });
const previous = readJson(join(out, "toolchain.json"), null);
writeJson(join(out, "toolchain.json"), toolchain);
log(`${slug}: toolchain.json written (${config.runner} in ${config.package} at ${config.base.slice(0, 12)})`);
if (previous !== null && JSON.stringify(previous) !== JSON.stringify(toolchain))
  log(`${slug}: toolchain.json changed; a confirmation of the old seam or allowed paths no longer holds`);

const chain = toolchainOf(slug);
const target = ensureTarget(chain);
for (const folder of [chain.publicDir, hiddenDir]) {
  const ignored = spawnSync("git", ["check-ignore", "-q", `${folder}/${testName}`], { cwd: target });
  if (ignored.status === 0) fail(`${folder}/ is ignored by the repository's .gitignore; pass --hidden-dir elsewhere`);
}
const missing = seam.filter((path) => !tree.has(path));
const dir = stage(workdir(`${slug}-baseline`), slug, { spec: false });
const started = Date.now();
let result;
try {
  result = runSuite(dir, "existing", chain);
  // As bin/fit.mjs does: ts-jest checks each test file itself, so a
  // project-wide tsc that fails on base is dropped rather than kept as a
  // check every tree fails.
  if (!result.compiled && chain.runner === "jest" && toolchain.build !== undefined) {
    log(`${slug}: \`${toolchain.build}\` fails on base; dropped from toolchain.json`);
    delete toolchain.build;
    writeJson(join(out, "toolchain.json"), toolchain);
    result = runSuite(dir, "existing", toolchainOf(slug));
  }
} finally {
  discard(dir);
}
// At a boundary there is no stub to write: base is the stub, and the run on it is both.
const onBase = { base: config.base, seconds: Math.round((Date.now() - started) / 1000), ...baselineOf(result, "base") };
const { stage: _, ...base } = onBase;
const baseline = boundary === null ? onBase : { ...onBase, stage: "stub", onBase: base };
writeJson(join(out, "baseline.json"), baseline);
const boundaryRun = boundary === null ? null : runBoundary({ ...config, boundary });
if (boundaryRun !== null && !boundaryRun.ready) fail(`the boundary did not ${boundary.service ? "answer" : "start"} on base: ${boundaryRun.output ?? ""}`, 2);

console.log(`${slug}: ${config.package} at ${config.base.slice(0, 12)}, ${config.runner}.`);
console.log(
  boundary === null
    ? `Seam: ${seam.join(", ")}${missing.length > 0 ? ` (new: ${missing.join(", ")})` : ""}`
    : `Boundary: ${JSON.stringify(boundary)} (${boundaryRun.seconds} s on base); no seam files, base is the stub`,
);
console.log(`Allowed paths: ${allowedPaths.join(", ")}`);
console.log(`Examples: ${toolchain.examples.join(", ") || "none"}`);
console.log(
  `Existing suite on base: ${baseline.passing.length} passing, ${baseline.failing.length} failing, ${baseline.crashed.length} file(s) crashed, ${baseline.seconds} s${baseline.compiled ? "" : "; it did NOT build"}.`,
);
console.log(
  `Next: specs/${slug}/spec.md, then node bin/confirm.mjs ${slug}: the seam and allowed paths are confirmed with the spec.`,
);
