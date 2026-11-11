#!/usr/bin/env node
// Judges any src/ against a calibrated spec the way bin/grade.mjs judges a
// blind run (SKILL.md, step 5): the src/ alone, copied onto fresh trees,
// the public suite on one and the hidden suite on another. Prints the
// verdict, the counts and the spec scenarios the failing hidden tests are
// keyed to, which name nothing the spec does not. Writes nothing.
//
//   node bin/judge.mjs <slug> <src-dir> [--detail]
//
// --detail adds each failing hidden test's name and message. That is for
// the person classifying an overfit, never for the agent that wrote the
// code: it would turn the hidden suite into a public one.
//
// A repository target is judged from a checkout with --repo (the
// toolchain's own by default): its working tree, or the commit --ref,
// against base plus stub plus public suite. Harness changes are `refused`
// (lib.mjs `scopeOf`); the rest is laid over a fresh base plus stub and
// run with the public suite and the existing suite on one tree and the
// hidden suite on another. A test baseline.json says passed on base plus
// stub that fails now is a regression, printed by name: the repository's
// own tests are public. Changes outside allowedPaths are `outsideScope`,
// refused only with --strict-scope. --audit scans the implementing
// session's transcript (`audit`), by default the newest one for the
// checkout's project folder, from the handout's time on. The verdict goes
// to runs/<slug>/judged.json, which bin/promote.mjs reads.
//
//   node bin/judge.mjs <slug> --repo [<checkout>] [--ref <rev>] [--strict-scope] [--audit [<transcript>]] [--detail]
//
// Before judging it recomputes the hidden suite's commitment hash
// (bin/commitment.mjs) and refuses, exit 1 with "hidden suite changed since
// <at>", when it differs from the one prepared.json records or, on a
// repository target, the one the handout showed (runs/<slug>/handout/
// handout.json). The hash is printed with the verdict; with no commitment
// recorded (a spec prepared before the hash, never handed out) it is
// printed and checked against nothing.
//
// --seal <file> judges from a seal (bin/seal.mjs) instead of specs/: the
// package and the seal are all a CI box needs. The seal is unpacked into a
// temporary folder that DUEDILIGENCE_SPECS points at before lib.mjs
// loads, checked file by file and against its hiddenSha256, and removed on
// exit. A repository seal is judged against the checkout --repo names
// (default the current folder), which must hold the base commit. Its
// output is for the implementer: verdict, counts, failing scenario keys,
// regressions and paths of their own change, never a hidden test's name,
// body or compiler output (any line naming a hidden test is redacted), so
// --detail and --audit are refused with it. --json <file> writes the same
// as a record, which bin/ci.mjs turns into a check.
//
//   node bin/judge.mjs --seal <file> <src-dir> | --seal <file> --repo [<checkout>] [--ref <rev>] [--strict-scope] [--json <file>]
//
// Exit 0 passed, 2 overfit, 3 regressed, 1 incomplete, refused or not judged.

import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { judgement } from "./rules.mjs";
import { unseal } from "./seal.mjs";

const sealed = openSeal(process.argv.slice(2));
const { commitment, commitmentLine, hiddenSha256 } = await import("./commitment.mjs");
const {
  RUNS,
  args,
  audit,
  checkoutChanges,
  discard,
  judge,
  newestTranscript,
  pathsOf,
  promotedOf,
  readJson,
  scopeOf,
  sha256,
  specDir,
  toolchainOf,
  workdir,
  writeJson,
  writeSnapshot,
} = await import("./lib.mjs");

const { options, rest } = args();
if (sealed !== null && rest[0] === sealed.slug) rest.shift();
const [slug, src] = sealed === null ? rest : [sealed.slug, rest[0]];
if (slug === undefined || (src === undefined && options.repo === undefined)) {
  console.error("usage: node bin/judge.mjs <slug> <src-dir> [--detail] | <slug> --repo [<checkout>] [--ref <rev>] [--strict-scope] [--audit [<transcript>]] [--detail] | --seal <file> <src-dir> | --seal <file> --repo [<checkout>] [--ref <rev>] [--json <file>]");
  process.exit(1);
}
if (sealed !== null) guardOutput();
const calibration = readJson(join(specDir(slug), "calibration.json"), null);
if (calibration?.status !== "ok") {
  console.error(`${slug}: not calibrated; run node bin/prepare.mjs ${slug} first.`);
  process.exit(1);
}
if (promotedOf(slug) !== null) {
  console.error(`${slug}: promoted on ${promotedOf(slug).at}; its hidden suite is in the repository now and judges nothing.`);
  process.exit(1);
}
const committed = sealed === null ? commitment(slug) : sealCommitment();
const handedOut = options.repo === undefined ? null : readJson(join(RUNS, slug, "handout", "handout.json"), null);
const changedSince = !committed.ok
  ? committed.at ?? "it was committed"
  : handedOut?.hiddenSha256 !== undefined && handedOut.hiddenSha256 !== committed.current
    ? `the handout (${handedOut.at})`
    : null;
if (changedSince !== null) {
  console.error(
    `${slug}: hidden suite changed since ${changedSince}; not judged. sha256 now ${committed.current}, committed ${committed.ok ? handedOut.hiddenSha256 : committed.recorded}.`,
  );
  process.exit(1);
}
if (sealed !== null && (options.detail !== undefined || options.audit !== undefined)) {
  console.error("--detail and --audit name what the implementer may not see; neither runs with --seal.");
  process.exit(1);
}
if (options.repo !== undefined) {
  process.exit(judgeRepo());
}
// The skeleton's files sit under src/ on every new-module toolchain: one
// of them must be in the folder given.
const entries = toolchainOf(slug).skeleton.map((path) => path.replace(/^src\//, ""));
if (!entries.some((path) => existsSync(join(src, path)))) {
  console.error(`${src} has no ${entries.join(" or ")}; pass the submission's src/ folder.`);
  process.exit(1);
}

const judged = judge(slug, realpathSync(src));
// The rule itself: rules.mjs `judgement`, which bin/api.mjs exports as `verdict`.
const outcome = judgement({ public: judged.public, hidden: judged.hidden, publicIds: calibration.publicIds, kept: calibration.kept });
const { verdict: result, public: publicCount, hidden: hiddenCount, failures, failedScenarios: scenarios } = outcome;

console.log(`${slug}: ${result}. Public ${publicCount.passed}/${publicCount.total}, hidden ${hiddenCount.passed}/${hiddenCount.total}.`);
console.log(hashLine());
const imported = readJson(join(specDir(slug), "imported.json"), null);
if (imported !== null) console.log(`Imported from ${imported.from}: not held out (bin/import-archive.mjs).`);
compileReport(judged);
if (scenarios.length > 0) console.log(`Failing scenarios: ${scenarios.join(", ")}`);
if (result === "incomplete") for (const id of outcome.publicFailing) console.log(`public: ${id}`);
if (options.detail === true)
  for (const item of failures) console.log(`hidden: ${item.id}\n  ${item.message.split("\n")[0]}`);
writeRecord({
  slug,
  verdict: result,
  public: publicCount,
  hidden: hiddenCount,
  compiled: { public: judged.public.compiled, hidden: judged.hidden.compiled },
  failedScenarios: scenarios,
});
process.exit(result === "passed" ? 0 : result === "overfit" ? 2 : 1);

/** A repository target judged from a checkout; returns the exit code. */
function judgeRepo() {
  const chain = toolchainOf(slug);
  if (chain.name !== "repo") {
    console.error(`${slug}: not a repository target; pass its src/ folder.`);
    return 1;
  }
  const checkout = sealed !== null ? chain.repo : resolve(typeof options.repo === "string" ? options.repo : chain.repo);
  const ref = typeof options.ref === "string" ? options.ref : undefined;
  const baseline = readJson(join(specDir(slug), "baseline.json"), null);
  const found = checkoutChanges(chain, checkout, ref);
  const scope = scopeOf(chain, found.items, found.read);
  const strict = options["strict-scope"] === true;
  // The rule (rules.mjs `judgement`) twice: on the scope alone, which says
  // whether the tree is judged at all, then on the suites' results.
  const facts = {
    publicIds: calibration.publicIds,
    kept: calibration.kept,
    baseline,
    refused: scope.refused,
    changed: [...scope.allowed, ...scope.outsideScope],
    allowedPaths: chain.allowedPaths ?? [],
    strictScope: strict,
  };
  const { refused } = judgement(facts);
  const snapshot = workdir(`${slug}-snapshot`);
  let judged;
  try {
    const remove = writeSnapshot(snapshot, scope, found.content);
    judged = refused.length > 0 ? null : judge(slug, snapshot, { existing: true, remove });
  } finally {
    discard(snapshot);
  }
  const outcome = judgement(judged === null ? facts : { ...facts, public: judged.public, hidden: judged.hidden, existing: judged.existing });
  const { verdict: result, public: publicCount, hidden: hiddenCount, regressions, failures, failedScenarios: scenarios } = outcome;
  const handout = readJson(join(RUNS, slug, "handout", "handout.json"), null);
  let peeks = null;
  if (options.audit !== undefined) {
    const transcript = typeof options.audit === "string" ? resolve(options.audit) : newestTranscript(found.root);
    peeks = { transcript, since: handout?.at ?? null, attempts: transcript === null ? [] : audit(transcript, chain, handout?.at) };
  }

  const where = ref === undefined ? `${found.root} (working tree)` : `${found.root} at ${ref}`;
  console.log(`${slug}: ${result}. Public ${publicCount.passed}/${publicCount.total}, hidden ${hiddenCount.passed}/${hiddenCount.total}, existing ${judged === null ? "-" : `${outcome.existing.passed}/${baseline.passing.length}`}; ${where}.`);
  console.log(hashLine());
  if (refused.length > 0) console.log(`Refused:\n${pathsOf(refused).map((line) => `- ${line}`).join("\n")}`);
  if (judged !== null) compileReport(judged);
  if (regressions.length > 0) console.log(`Regressions (passed on base plus stub, fail now):\n${regressions.map((id) => `- ${id}`).join("\n")}`);
  if (!strict && scope.outsideScope.length > 0) console.log(`Outside the allowed paths:\n${pathsOf(scope.outsideScope).map((line) => `- ${line}`).join("\n")}`);
  if (scope.ownTests.length > 0) console.log(`Own tests (not judged): ${scope.ownTests.map((item) => item.path).join(", ")}`);
  if (scenarios.length > 0) console.log(`Failing scenarios: ${scenarios.join(", ")}`);
  if (result === "incomplete") for (const id of outcome.publicFailing) console.log(`public: ${id}`);
  if (options.detail === true)
    for (const item of failures) console.log(`hidden: ${item.id}\n  ${item.message.split("\n")[0]}`);
  if (peeks !== null)
    console.log(
      peeks.transcript === null
        ? "Audit: no transcript found for this checkout's project folder; pass --audit <transcript>."
        : `Audit of ${peeks.transcript}${peeks.since ? ` since the handout (${peeks.since})` : ""}: ${peeks.attempts.length === 0 ? "no attempt to open the hidden suite" : `${peeks.attempts.length} attempt(s):\n${peeks.attempts.map((item) => `- ${item.at ?? ""} ${item.tool}: ${item.match}: ${item.input}`).join("\n")}`}`,
    );

  const existingCount = judged === null ? null : outcome.existing;
  writeRecord({
    slug,
    verdict: result,
    checkout: found.root,
    ref: ref ?? null,
    public: publicCount,
    hidden: hiddenCount,
    existing: existingCount,
    compiled: judged === null ? null : { public: judged.public.compiled, hidden: judged.hidden.compiled },
    regressions,
    refused: pathsOf(refused),
    outsideScope: pathsOf(scope.outsideScope),
    ownTests: scope.ownTests.map((item) => item.path),
    failedScenarios: scenarios,
  });
  writeJson(join(RUNS, slug, "judged.json"), {
    at: new Date().toISOString(),
    verdict: result,
    checkout: found.root,
    ref: ref ?? null,
    strictScope: strict,
    // What was judged, so bin/promote.mjs can tell the tree has not moved since.
    changesSha256: sha256(JSON.stringify(found.items.map((item) => [item.path, item.change, sha256(found.content(item.path) ?? "")]))),
    public: publicCount,
    hidden: hiddenCount,
    regressions,
    refused: pathsOf(refused),
    outsideScope: pathsOf(scope.outsideScope),
    ownTests: scope.ownTests.map((item) => item.path),
    failedScenarios: scenarios,
    peekAttempts: peeks === null ? null : peeks.attempts.length,
    hiddenSha256: committed.current,
  });
  return { passed: 0, overfit: 2, regressed: 3 }[result] ?? 1;
}

/** The hash line printed with a verdict: the seal's, or the spec's commitment. */
function hashLine() {
  if (sealed === null) return commitmentLine(committed);
  const { sealedAt, committed: recorded } = sealed.seal;
  return `Hidden suite sha256 ${committed.current}, sealed ${sealedAt}${recorded ? `, committed ${recorded.at}` : ""}.`;
}

/**
 * Compiler output when a tree did not build. A seal's judge prints the
 * public tree's only: the hidden tree's names hidden files and quotes
 * their lines.
 */
function compileReport(judged) {
  if (judged.public.compiled && judged.hidden.compiled) return;
  if (sealed === null) {
    console.log(`Did not compile:\n${(judged.hidden.compileOutput || judged.public.compileOutput).slice(0, 4000)}`);
    return;
  }
  if (!judged.public.compiled) console.log(`Did not compile with the public suite:\n${judged.public.compileOutput.slice(0, 4000)}`);
  if (!judged.hidden.compiled) console.log("Did not compile with the hidden suite (its output is withheld: it names hidden tests).");
}

/** --json <file>: the verdict as a record, with the hash and the seal's time. */
function writeRecord(fields) {
  if (typeof options.json !== "string") return;
  const record = {
    at: new Date().toISOString(),
    ...fields,
    hiddenSha256: committed.current,
    sealedAt: sealed?.seal.sealedAt ?? null,
    committedAt: sealed === null ? committed.at : (sealed.seal.committed?.at ?? null),
  };
  writeFileSync(resolve(options.json), `${JSON.stringify(sealed === null ? record : JSON.parse(redact(JSON.stringify(record))), null, 2)}\n`);
}

/**
 * Unpacks --seal before lib.mjs loads, pointing DUEDILIGENCE_SPECS at
 * it; a repository seal's toolchain.json gets `repo` = the checkout's top
 * folder. Null without --seal. Exits 1 on a seal that does not check out.
 */
function openSeal(argv) {
  const at = argv.indexOf("--seal");
  if (at === -1) return null;
  const file = argv[at + 1];
  if (file === undefined || file.startsWith("--")) {
    console.error("--seal needs a file (bin/seal.mjs).");
    process.exit(1);
  }
  argv.splice(at, 2);
  process.argv.splice(2, process.argv.length - 2, ...argv);
  let opened;
  try {
    opened = unseal(resolve(file));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  process.on("exit", () => rmSync(opened.root, { recursive: true, force: true }));
  process.env.DUEDILIGENCE_SPECS = opened.specs;
  const toolchainFile = join(opened.dir, "toolchain.json");
  const toolchain = JSON.parse(readFileSync(toolchainFile, "utf8"));
  if (toolchain.name === "repo") {
    const repoAt = argv.indexOf("--repo");
    const given = repoAt !== -1 && argv[repoAt + 1] !== undefined && !argv[repoAt + 1].startsWith("--") ? argv[repoAt + 1] : ".";
    const top = spawnSync("git", ["-C", resolve(given), "rev-parse", "--show-toplevel"], { encoding: "utf8" });
    if (top.status !== 0) {
      console.error(`${resolve(given)} is not a git checkout; a repository seal is judged against one (--repo).`);
      process.exit(1);
    }
    writeFileSync(toolchainFile, `${JSON.stringify({ ...toolchain, repo: realpathSync(top.stdout.trim()) }, null, 2)}\n`);
  }
  return opened;
}

/** The unsealed suite's hash against the one sealed, as `commitment()` reports it. */
function sealCommitment() {
  const current = hiddenSha256(specDir(sealed.slug));
  const { hiddenSha256: recorded, sealedAt, committed: prepared } = sealed.seal;
  return { current, recorded, at: prepared?.at ?? sealedAt, ok: current === recorded };
}

/** `text` with every hidden test name (`redact.names`, set by guardOutput, longest first) replaced. */
function redact(text) {
  let out = String(text);
  for (const name of redact.names ?? []) out = out.split(name).join("[hidden test]");
  return out;
}

/**
 * With a seal, everything judge prints goes through `redact`, and an
 * uncaught error prints its first line only: a runner that printed no
 * result throws with its stderr, which may quote a hidden test.
 */
function guardOutput() {
  const calibration = readJson(join(specDir(sealed.slug), "calibration.json"), {});
  redact.names = [...new Set((calibration.kept ?? []).flatMap((id) => {
    const name = id.split(" :: ").at(-1);
    const bare = name.replace(/^\[[a-z]+-\d+\] /, "");
    return [name, ...(bare.length >= 12 ? [bare] : [])];
  }))].sort((a, b) => b.length - a.length);
  for (const stream of ["log", "error"]) {
    const write = console[stream].bind(console);
    console[stream] = (...parts) => write(...parts.map(redact));
  }
  process.on("uncaughtException", (error) => {
    console.error(`not judged: ${String(error?.message ?? error).split("\n")[0]}`);
    process.exit(1);
  });
}
