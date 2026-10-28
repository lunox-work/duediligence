#!/usr/bin/env node
// A seal: everything a judge needs of one spec, in one file, so CI judges
// where the hidden suite is and nowhere else (CI mode: the implementer's
// machine and repository never hold it). `judge --seal <file>` and
// `ci --seal <file>` read it with the package alone, no specs/ folder.
//
//   node bin/seal.mjs <slug> [--out <file>]     default ./<slug>.seal.gz
//
// The file is gzipped JSON, readable with `gunzip -c <file> | jq`:
//   { "seal.json": { format, slug, sealedAt, package, hiddenSha256,
//                    committed, toolchain, counts, files: { <path>: sha256 } },
//     "files": { <path>: <base64> } }
// `files` is a specs/<slug>/-shaped folder: spec.md, toolchain.json,
// calibration.json (slug, status, publicIds, kept only), baseline.json,
// imported.json when present, skeleton/, tests/public/, tests/private/.
// Never the reference, generation.json, transcripts or runs. Unsealed, the
// folder has the layout bin/commitment.mjs hashes, so `hiddenSha256` in
// seal.json is the hash prepare recorded and handout showed; `committed`
// is prepared.json's record of it, null for a spec that has none (an
// import, or a spec never handed out). Sealing refuses a spec whose hidden
// suite no longer matches its recorded commitment. toolchain.json's `repo`
// (a path on the sealing machine) is dropped: the judge sets it to the
// checkout it is given. A black-box spec's `boundary` (the command or
// service the suites call) stays in toolchain.json, is repeated in
// seal.json's `toolchain`, and is inside hiddenSha256 (bin/commitment.mjs).
//
// The seal holds the hidden suite in the clear. Keep it where the
// implementer cannot read: a private repository, a private artifact, a
// secret URL (action.yml, .github/workflows/judge.yml).

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

const FORMAT = 1;
const sha = (data) => createHash("sha256").update(data).digest("hex");
/** What a seal may hold, by path: the judge reads nothing else. */
const SEALED = /^(spec\.md|toolchain\.json|calibration\.json|baseline\.json|imported\.json|skeleton\/.+|tests\/(public|private)\/.+)$/;
const safe = (path) => SEALED.test(path) && !path.split("/").some((part) => part === ".." || part === "." || part === "") && !path.endsWith(".DS_Store");

function walk(dir, prefix = "") {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (name === ".DS_Store") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, `${prefix}${name}/`));
    else out.push(`${prefix}${name}`);
  }
  return out;
}

/**
 * Unpacks a seal into a fresh folder `<tmp>/specs/<slug>/` and checks it:
 * every file in seal.json's list, with its hash, and nothing else. Throws
 * on any mismatch. Imports nothing from lib.mjs, so a caller can point
 * DUEDILIGENCE_SPECS at `specs` before lib.mjs is first loaded.
 */
export function unseal(file, base = tmpdir()) {
  let bundle;
  try {
    bundle = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8"));
  } catch (error) {
    throw new Error(`${file}: not a seal (${error.message.split("\n")[0]})`);
  }
  const seal = bundle?.["seal.json"];
  if (seal?.format !== FORMAT || typeof seal.slug !== "string" || !/^[a-z0-9][a-z0-9._-]*$/i.test(seal.slug))
    throw new Error(`${file}: not a seal of format ${FORMAT}`);
  const listed = Object.keys(seal.files ?? {}).sort();
  const held = Object.keys(bundle.files ?? {}).sort();
  if (JSON.stringify(listed) !== JSON.stringify(held)) throw new Error(`${file}: its files differ from seal.json's list`);
  const root = mkdtempSync(join(realpathSync(base), "duediligence-seal-"));
  const dir = join(root, "specs", seal.slug);
  for (const path of held) {
    if (!safe(path)) throw new Error(`${file}: ${path} is not a sealed path`);
    const body = Buffer.from(bundle.files[path], "base64");
    if (sha(body) !== seal.files[path]) throw new Error(`${file}: ${path} does not match its hash in seal.json`);
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  writeFileSync(join(dir, "seal.json"), `${JSON.stringify(seal, null, 2)}\n`);
  return { root, specs: join(root, "specs"), dir, slug: seal.slug, seal };
}

async function main() {
  const { args, readJson, specDir, toolchainOf } = await import("./lib.mjs");
  const { commitment, hiddenSha256 } = await import("./commitment.mjs");
  const { options, rest } = args();
  const [slug] = rest;
  if (slug === undefined) {
    console.error("usage: node bin/seal.mjs <slug> [--out <file>]");
    process.exit(1);
  }
  const dir = specDir(slug);
  const calibration = readJson(join(dir, "calibration.json"), null);
  if (calibration?.status !== "ok") {
    console.error(`${slug}: not calibrated; run node bin/prepare.mjs ${slug} first.`);
    process.exit(1);
  }
  const committed = commitment(slug);
  if (!committed.ok) {
    console.error(`${slug}: hidden suite changed since ${committed.at ?? "it was committed"}; not sealed. sha256 now ${committed.current}, committed ${committed.recorded}.`);
    process.exit(1);
  }
  const chain = toolchainOf(slug);
  const files = {};
  const add = (path, body) => (files[path] = Buffer.isBuffer(body) ? body : Buffer.from(body));
  add("spec.md", readFileSync(join(dir, "spec.md")));
  const { repo, ...toolchain } = readJson(join(dir, "toolchain.json"), {});
  add("toolchain.json", `${JSON.stringify(toolchain, null, 2)}\n`);
  const { status, publicIds, kept } = calibration;
  add("calibration.json", `${JSON.stringify({ slug, status, publicIds, kept }, null, 2)}\n`);
  for (const name of ["baseline.json", "imported.json"]) if (existsSync(join(dir, name))) add(name, readFileSync(join(dir, name)));
  for (const folder of ["skeleton", "tests/public", "tests/private"])
    if (existsSync(join(dir, folder))) for (const rel of walk(join(dir, folder))) add(`${folder}/${rel}`, readFileSync(join(dir, folder, rel)));
  if (chain.name === "repo" && !files["baseline.json"]) {
    console.error(`${slug}: a repository spec without baseline.json; run node bin/repo.mjs first.`);
    process.exit(1);
  }
  const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"));
  const seal = {
    format: FORMAT,
    slug,
    sealedAt: new Date().toISOString(),
    package: `${pkg.name}@${pkg.version}`,
    hiddenSha256: committed.current,
    committed: committed.recorded === null ? null : { hiddenSha256: committed.recorded, at: committed.at },
    toolchain: {
      name: chain.name,
      ...(chain.name === "repo" ? { runner: chain.runner, base: chain.base, package: chain.package } : {}),
      ...(chain.boundary ? { boundary: chain.boundary } : {}),
    },
    counts: { public: publicIds.length, hidden: kept.length },
    files: Object.fromEntries(Object.entries(files).map(([path, body]) => [path, sha(body)]).sort(([a], [b]) => (a < b ? -1 : 1))),
  };
  const out = resolve(typeof options.out === "string" ? options.out : `${slug}.seal.gz`);
  const bundle = { "seal.json": seal, files: Object.fromEntries(Object.entries(files).map(([path, body]) => [path, body.toString("base64")])) };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, gzipSync(JSON.stringify(bundle)));
  // The same hash from the unpacked folder, or the seal is not what judge will check.
  const check = unseal(out);
  try {
    if (hiddenSha256(check.dir) !== seal.hiddenSha256) throw new Error(`${slug}: the unsealed suite hashes differently; seal not usable.`);
  } finally {
    rmSync(check.root, { recursive: true, force: true });
  }
  console.log(`${slug}: sealed to ${out}. Public ${seal.counts.public}, hidden ${seal.counts.hidden}, ${Object.keys(files).length} files.`);
  console.log(`Hidden suite sha256 ${seal.hiddenSha256}${seal.committed ? `, committed ${seal.committed.at}` : " (no commitment recorded; the seal's own time stands for it)"}.`);
  console.log("The seal holds the hidden suite: keep it where the implementer cannot read it.");
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) await main();
