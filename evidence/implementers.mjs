#!/usr/bin/env node
// Other implementers (RESULTS.md, "Other implementers"): an agent that is not
// Claude implements the archive's calibrated specs from handout folders, the
// way a person hands work to Codex, Aider or Cursor, and each run is judged
// into results.jsonl by bin/grade.mjs, beside the archive's Haiku numbers on
// the same specs. No suite is generated: the specs are the archive's,
// imported (bin/import-archive.mjs), so they are not held out.
//
//   node evidence/implementers.mjs import                 the SPECS below into this home
//   node evidence/implementers.mjs run <agent> [slug...] [--runs 5] [--model m] [--command "<sh>"] [--variant v] [--concurrency 2] [--force]
//   node evidence/implementers.mjs grade [slug...]        bin/grade.mjs --force over this home
//   node evidence/implementers.mjs report                 the table, and evidence/implementers.json
//   node evidence/implementers.mjs selftest               no model: fake agents on the exec backend
//
// Home: DUEDILIGENCE_HOME=evidence/implementers (set here unless given):
// specs/ (imports, not kept), runs/, results.jsonl. queue.sh beside it
// resumes the whole cell; a run with a run.json is skipped.
//
// One run: `bin/handout.mjs <slug> <dir>` into a fresh folder under
// WORK_ROOT (the public handout, nothing hidden in it), a git baseline, the
// agent given BRIEF.md (prompts/agent.md plus the commitment hash) on
// lib.mjs `session`, then the run folder bin/run.mjs writes: transcript,
// diff.patch, submission/src, run.json (changes, peeks, the handout's hash).
// Agents:
//
// - codex-cli: Codex CLI on the person's Codex login (bin/backends.mjs:
//   pinned install, its own CODEX_HOME, placed under sandbox-exec or bwrap
//   over the handout folder). A usage limit or "out of credits" halts the
//   batch with exit 2 and records nothing for the run it stopped.
// - exec: any command (--command or DUEDILIGENCE_EXEC), BRIEF.md on
//   stdin, placed the same way. The self test uses it with fake agents.
// - aider, cursor: exec adapters for Aider (`aider`, its own model keys) and
//   Cursor's agent (`cursor-agent`), when installed. Their install is made
//   readable to the sandbox; DUEDILIGENCE_EXEC_ENV names the API key
//   variables to pass (e.g. OPENAI_API_KEY). Network stays on.
//
// The variant is the agent's name (or --variant): runs/<slug>/<variant>/<n>/.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
process.env.DUEDILIGENCE_HOME ??= join(HERE, "implementers");
const lib = await import("../bin/lib.mjs");
const { HOME, RESULTS, ROOT, RUNS, WORK_ROOT, args, changes, copy, discard, emitted, log, manifest, peeks, pool, readJson, session, specDir, writeJson } = lib;

const ARCHIVE = join(ROOT, "experiments");
/**
 * Ten of the archive's 26 core specs: the four where the archive has Haiku
 * on this package's brief (public suite plus own tests, `double-blind-own`),
 * the two others where plain Haiku runs overfit, and four more categories
 * (concurrency, invented protocol, unhappy paths, compliance).
 */
export const SPECS = [
  "csv-export",
  "licence-scan",
  "patch-apply",
  "tool-versions",
  "retention-sweep",
  "escrow-split",
  "keyed-queue",
  "frame-codec",
  "statement-import",
  "shift-compliance",
];
const RUNS_PER_SPEC = 5;
const TRANSIENT = /at capacity|overloaded|temporarily unavailable|try again later/i;
/** Whether a failed session's error events (Codex's raw events beside the transcript, or its stderr) say the provider refused it. */
const providerRefused = (out, result) => {
  const raw = join(out, "transcript.codex.jsonl");
  const errors = existsSync(raw)
    ? readFileSync(raw, "utf8").split("\n").filter((line) => /"type":"(error|turn\.failed)"/.test(line)).join("\n")
    : "";
  return TRANSIENT.test(`${errors}\n${result.stderr ?? ""}`);
};
const AGENTS = ["codex-cli", "exec", "aider", "cursor"];
const which = (bin) => spawnSync("sh", ["-c", `command -v ${bin}`], { encoding: "utf8" }).stdout.trim();

/** The session options for an agent, or a reason it cannot run here. */
function agentOf(name, options) {
  if (name === "codex-cli") return { backend: "codex-cli", model: options.model };
  const adapters = {
    exec: { bin: null, command: options.command ?? process.env.DUEDILIGENCE_EXEC },
    // Aider edits the named files and runs the tests itself (--auto-test).
    aider: {
      bin: "aider",
      command: `f="$TMPDIR/brief.md"; cat > "$f"; aider --yes-always --no-git --no-auto-commits --no-check-update --no-analytics --no-show-model-warnings ${options.model ? `--model ${options.model} ` : ""}--read spec.md --read tests/public --auto-test --test-cmd "npm test" --message-file "$f" src/index.ts`,
    },
    cursor: { bin: "cursor-agent", command: `cursor-agent -p --force --output-format text ${options.model ? `--model ${options.model} ` : ""}"$(cat)"` },
  };
  const adapter = adapters[name];
  if (adapter === undefined) return { error: `No agent ${name} (${AGENTS.join(", ")})` };
  if (adapter.bin !== null) {
    const found = which(adapter.bin);
    if (found === "") return { error: `${adapter.bin} is not installed here` };
    // Its install (two folders above the real binary) must be readable inside the sandbox.
    const prefix = dirname(dirname(realpathSync(found)));
    process.env.DUEDILIGENCE_SANDBOX_READ = [process.env.DUEDILIGENCE_SANDBOX_READ, prefix].filter(Boolean).join(":");
  }
  if (typeof adapter.command !== "string" || adapter.command === "") return { error: "exec needs --command or DUEDILIGENCE_EXEC" };
  return { backend: "exec", command: adapter.command };
}

const git = (dir, ...argv) =>
  spawnSync("git", ["-c", "user.name=duediligence", "-c", "user.email=duediligence@localhost", ...argv], {
    cwd: dir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

/** One agent run on one handout folder; false when the account's limit stopped it. */
async function runOne(job, agent) {
  const dir = join(WORK_ROOT, "implementers", `${job.slug}-${job.variant}-${job.n}-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dirname(dir), { recursive: true });
  // The handout as a person would make it: the CLI's own command, in its own process.
  const handout = spawnSync(process.execPath, [join(ROOT, "bin", "handout.mjs"), job.slug, dir], { encoding: "utf8", env: process.env });
  if (handout.status !== 0) throw new Error(`${job.slug}: handout failed:\n${handout.stderr}${handout.stdout}`);
  git(dir, "init", "-q");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "handout");
  const before = manifest(dir);
  const brief = readFileSync(join(dir, "BRIEF.md"), "utf8");
  rmSync(job.out, { recursive: true, force: true });
  const transcript = join(job.out, "transcript.jsonl");
  const startedAt = new Date().toISOString();
  log(job.slug, job.variant, job.n, "agent started");
  const result = await session({ cwd: dir, text: brief, transcript, kind: "agent", backend: agent.backend, model: agent.model, command: agent.command });
  if (result.apiError === "usage_limit_reached") {
    log(job.slug, job.variant, job.n, "HALTED, no run recorded:", result.finalText || result.apiError);
    rmSync(job.out, { recursive: true, force: true });
    discard(dir);
    return { halted: result.finalText || result.apiError };
  }
  // The provider refusing the session ("Selected model is at capacity") says nothing about the agent: no run is recorded, and a rerun takes it again.
  if (!result.ok && providerRefused(job.out, result)) {
    log(job.slug, job.variant, job.n, "provider unavailable, no run recorded:", result.finalText);
    rmSync(job.out, { recursive: true, force: true });
    discard(dir);
    return { transient: true };
  }
  const changed = changes(before, manifest(dir));
  git(dir, "add", "-A");
  writeFileSync(join(job.out, "diff.patch"), git(dir, "diff", "--cached", "--binary", "HEAD").stdout);
  const srcFiles = manifest(join(dir, "src"));
  for (const path of Object.keys(srcFiles).filter((path) => !emitted(path, srcFiles))) copy(join(dir, "src", path), join(job.out, "submission", "src", path));
  writeJson(join(job.out, "run.json"), {
    slug: job.slug,
    variant: job.variant,
    n: job.n,
    startedAt,
    implementer: { agent: job.agent, backend: agent.backend, command: agent.command ?? null },
    handout: readJson(join(dir, "handout.json"), null),
    session: (({ finalText, stderr, ...rest }) => rest)(result),
    summary: result.finalText.trim().slice(-2000),
    changes: changed,
    peeks: peeks(transcript, dir, ["tests/private"]),
  });
  discard(dir);
  log(job.slug, job.variant, job.n, `agent ${result.ok ? "done" : result.timedOut ? "TIMED OUT" : "ended with an error"}, ${changed.length} path(s) changed`);
  return {};
}

async function run(agentName, slugs, options) {
  const agent = agentOf(agentName, options);
  if (agent.error !== undefined) {
    console.error(agent.error);
    process.exit(1);
  }
  const variant = typeof options.variant === "string" ? options.variant : agentName;
  const runs = Number(options.runs ?? RUNS_PER_SPEC);
  const jobs = slugs
    .filter((slug) => {
      const ok = readJson(join(specDir(slug), "calibration.json"), null)?.status === "ok";
      if (!ok) log(slug, "skipped: not imported (node evidence/implementers.mjs import)");
      return ok;
    })
    .flatMap((slug) => Array.from({ length: runs }, (_, at) => ({ slug, n: at + 1, variant, agent: agentName, out: join(RUNS, slug, variant, String(at + 1)) })))
    .filter((job) => options.force === true || !existsSync(join(job.out, "run.json")));
  log(`${jobs.length} ${variant} run(s) to go`);
  let halted = null;
  await pool(jobs, Number(options.concurrency ?? 2), async (job) => {
    if (halted !== null) return;
    const outcome = await runOne(job, agent);
    if (outcome.halted !== undefined) halted = outcome.halted;
  });
  if (halted !== null) {
    console.log(`halted on the account's usage limit (${halted}); rerun the same command (or evidence/implementers/queue.sh) after it resets`);
    process.exit(2);
  }
}

// --force: every run judged again, so a run redone after a provider refusal replaces the line of the one it replaced.
const grade = (slugs) => {
  const out = spawnSync(process.execPath, [join(ROOT, "bin", "grade.mjs"), ...slugs, "--force"], { stdio: "inherit", env: process.env });
  if (out.status !== 0) process.exit(out.status ?? 1);
};

/** The table: per implementer and spec, verdicts over runs that ran, beside the archive's Haiku. */
function report() {
  const read = (file) => (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []);
  const ours = read(RESULTS).filter((line) => SPECS.includes(line.spec) && !line.variant.startsWith("selftest"));
  const archive = read(join(ARCHIVE, "results.jsonl")).filter((line) => SPECS.includes(line.spec) && line.agent?.ok === true);
  const cell = (lines) => {
    const ran = lines.filter((line) => line.agent?.ok !== false);
    const by = (verdict) => ran.filter((line) => line.verdict === verdict).length;
    return { runs: ran.length, passed: by("passed"), overfit: by("overfit"), incomplete: by("incomplete"), refused: by("refused"), sessionFailed: lines.length - ran.length, peeks: ran.filter((line) => line.peekAttempts > 0).length };
  };
  const columns = {
    ...Object.fromEntries([...new Set(ours.map((line) => line.variant))].sort().map((variant) => [variant, ours.filter((line) => line.variant === variant)])),
    "haiku, archive, public suite + own tests": archive.filter((line) => line.variant === "double-blind-own-haiku"),
    "haiku, archive, public suite": archive.filter((line) => line.variant === "double-blind-haiku"),
  };
  const table = {};
  for (const [name, lines] of Object.entries(columns)) {
    table[name] = { total: cell(lines), specs: Object.fromEntries(SPECS.map((slug) => [slug, cell(lines.filter((line) => line.spec === slug))])) };
    const total = table[name].total;
    console.log(`${name}: ${total.passed} passed, ${total.overfit} overfit, ${total.incomplete} incomplete, ${total.refused} refused of ${total.runs} (${total.sessionFailed} sessions failed); peek attempts in ${total.peeks}`);
  }
  const planned = SPECS.length * RUNS_PER_SPEC;
  writeJson(join(HERE, "implementers.json"), { at: new Date().toISOString(), specs: SPECS, planned, table });
}

/**
 * No model: the whole path on the exec backend with fake agents in a
 * scratch home, one spec, each fake expected to land on one verdict. The
 * fakes read their code from a fixture folder the sandbox is told to allow.
 */
function selftest() {
  const slug = "keyed-queue";
  // A home of its own, beside WORK_ROOT (a home may not overlap it).
  const home = mkdtempSync(join(realpathSync(tmpdir()), "duediligence-selftest-"));
  const fixtures = join(home, "fixtures");
  const overfit = readJson(join(ARCHIVE, "runs", "_redteam-classes.json"), []).find((item) => item.spec === "statement-import" && item.gamed === "hardcoded");
  copy(join(ARCHIVE, "specs", slug, "reference", "src"), join(fixtures, "reference"));
  const env = { ...process.env, DUEDILIGENCE_HOME: home, DUEDILIGENCE_SPECS: join(home, "specs"), DUEDILIGENCE_RESULTS: join(home, "results.jsonl"), DUEDILIGENCE_SANDBOX_READ: fixtures };
  const self = (...argv) => spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...argv], { encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 });
  const imported = spawnSync(process.execPath, [join(ROOT, "bin", "import-archive.mjs"), slug, "statement-import"], { encoding: "utf8", env });
  if (imported.status !== 0) throw new Error(imported.stderr);
  copy(join(ARCHIVE, "runs", "statement-import", "red-team-haiku", String(overfit.run), "submission", "src"), join(fixtures, "lookup"));
  const hiddenFile = join(home, "specs", slug, "tests", "private", lib.listFiles(join(ARCHIVE, "specs", slug, "tests", "private"))[0]);
  const fakes = [
    // The reference, as an agent that writes correct code: passed.
    { slug, variant: "selftest-reference", command: `cat > /dev/null; cp -R "${fixtures}/reference/." src/; echo copied the reference`, expect: "passed" },
    // An agent that does nothing: incomplete.
    { slug, variant: "selftest-nothing", command: "cat > /dev/null; echo did nothing", expect: "incomplete" },
    // A Haiku red-team lookup table of the public inputs: overfit.
    { slug: "statement-import", variant: "selftest-lookup", command: `cat > /dev/null; cp -R "${fixtures}/lookup/." src/; echo copied a lookup`, expect: "overfit" },
    // An agent that edits a public test: refused.
    { slug, variant: "selftest-tamper", command: `cat > /dev/null; cp -R "${fixtures}/reference/." src/; for f in tests/public/*.ts; do echo "// edited" >> "$f"; done`, expect: "refused" },
    // An agent that reads outside its folder: the sandbox refuses, and the run still grades.
    { slug, variant: "selftest-escape", command: `cat > /dev/null; cat "${hiddenFile}" > src/stolen.txt 2>&1; ls "${dirname(hiddenFile)}" >> src/stolen.txt 2>&1; cp -R "${fixtures}/reference/." src/`, expect: "passed" },
  ];
  const outcomes = [];
  for (const fake of fakes) {
    const ran = self("run", "exec", fake.slug, "--runs", "1", "--variant", fake.variant, "--command", fake.command);
    if (ran.status !== 0) throw new Error(`${fake.variant}: ${ran.stderr}`);
  }
  const graded = self("grade", slug, "statement-import");
  if (graded.status !== 0) throw new Error(graded.stderr);
  const lines = readFileSync(join(home, "results.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  for (const fake of fakes) {
    const line = lines.find((item) => item.spec === fake.slug && item.variant === fake.variant);
    const record = readJson(join(home, "runs", fake.slug, fake.variant, "1", "run.json"), {});
    const stolen = join(home, "runs", fake.slug, fake.variant, "1", "submission", "src", "stolen.txt");
    outcomes.push({
      variant: fake.variant,
      expect: fake.expect,
      verdict: line?.verdict ?? null,
      ok: line?.verdict === fake.expect,
      public: line?.public,
      hidden: line?.hidden,
      refused: line?.refused,
      hiddenSha256: record.handout?.hiddenSha256 ?? null,
      ...(existsSync(stolen) ? { escape: readFileSync(stolen, "utf8").slice(0, 2000) } : {}),
    });
  }
  const escape = outcomes.find((item) => item.variant === "selftest-escape");
  // Both reads refused by the sandbox, not merely missing.
  const sealed = escape?.escape !== undefined && (escape.escape.match(/Operation not permitted|Permission denied/g) ?? []).length === 2;
  writeJson(join(HERE, "implementers", "selftest.json"), { at: new Date().toISOString(), platform: process.platform, outcomes, hiddenUnreadable: sealed });
  rmSync(home, { recursive: true, force: true });
  for (const item of outcomes) console.log(`${item.ok ? "ok  " : "FAIL"} ${item.variant}: ${item.verdict} (expected ${item.expect})`);
  console.log(`hidden suite unreadable from inside: ${sealed}`);
  if (!outcomes.every((item) => item.ok) || !sealed) process.exit(1);
}

const { options, rest } = args();
const [command, ...named] = rest;
const slugs = named.length > 0 && command !== "run" ? named : SPECS;
if (command === "import") {
  const out = spawnSync(process.execPath, [join(ROOT, "bin", "import-archive.mjs"), ...slugs.filter((slug) => !existsSync(join(specDir(slug), "spec.md")))], { stdio: "inherit", env: process.env });
  process.exit(out.status ?? 1);
} else if (command === "run") {
  const [agentName, ...chosen] = named;
  if (agentName === undefined) {
    console.error(`usage: node evidence/implementers.mjs run <${AGENTS.join("|")}> [slug...]`);
    process.exit(1);
  }
  await run(agentName, chosen.length > 0 ? chosen : SPECS, options);
} else if (command === "grade") grade(slugs);
else if (command === "report") report();
else if (command === "selftest") selftest();
else {
  console.error("usage: node evidence/implementers.mjs import | run <agent> [slug...] | grade | report | selftest");
  process.exit(1);
}
