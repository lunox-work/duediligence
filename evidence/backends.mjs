#!/usr/bin/env node
// The backend table of RESULTS.md ("Writer backends"): the writers on
// another backend beside the Claude baseline, on the archive's material,
// with no agent run. Subcommands:
//
//   sandbox                 the placement sandbox's negative test: from inside
//                           it, a hidden suite in a sibling workdir, a spec's
//                           tests/private, the home and the package are
//                           unreadable and nothing outside the workdir is
//                           writable, while the workdir and the toolchains work.
//   selftest                anthropic-api against a local stand-in for the
//                           Messages API (no key, no spend): tool loop, path
//                           confinement, the sandboxed Bash, transcript shape,
//                           cost, resume; and the exec backend.
//   import <arm>            the archive's specs into SPECS: `claude` as they
//                           are (the baseline: 26 core, 40 HumanEval+, kestrel
//                           ladder levels and condition B); `<backend>` with
//                           their suites removed and toolchain.json `backend`
//                           set, so bin/generate.mjs writes them again there
//                           (skeleton and reference kept: the same references).
//   calibrate [slug...]     calibration without a reference session: hidden
//                           tests that fail on the skeleton and pass the spec's
//                           (archive) reference are kept, as calibrate.mjs keeps
//                           them. --check prints it for specs that already have
//                           a calibration.json (the archive's) without writing.
//   ladder                  the kestrel ladder: each level's public suite run on
//                           the oracle (how many of its tests the oracle
//                           passes), and with --runs the archive's stored agent
//                           runs scored again on the oracle (bin/ladder/score.mjs).
//   report                  evidence/backends.json and the RESULTS.md table:
//                           --claude <home> --other <home> --backend <name>.
//
// Run with DUEDILIGENCE_HOME set to a scratch folder (the claude arm)
// or to evidence/backends (the other backend's suites, kept as evidence);
// evidence/backends/queue.sh runs the whole other-backend arm and resumes.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { placement, stateFiles } from "../bin/backends.mjs";
import {
  HOME,
  PYTHON,
  ROOT,
  RUNS,
  SPECS,
  WORK_ROOT,
  args,
  audit,
  copy,
  count,
  discard,
  judge,
  listFiles,
  log,
  peeks,
  readJson,
  runSuite,
  session,
  specDir,
  specSlugs,
  stage,
  testsOf,
  toolchainOf,
  workdir,
  writeJson,
} from "../bin/lib.mjs";

const ARCHIVE = join(ROOT, "experiments");
/** The archive's specs the table uses: the 26 core specs (mutation.jsonl), the 40 HumanEval+ tasks, the kestrel ladder. */
const archiveLines = (file) => readFileSync(join(ARCHIVE, file), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
const CORE = () => archiveLines("mutation.jsonl").map((line) => line.spec).sort();
const HUMANEVAL = () => readdirSync(join(ARCHIVE, "runs", "_evalplus")).filter((name) => /^he-\d+\.json$/.test(name)).map((name) => name.slice(0, -5)).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
const LEVELS = [0, 1, 2, 3, 4];
const LADDER_A = LEVELS.map((level) => `ladder-kestrel-l${level}`);
const LADDER_B = LEVELS.slice(1).map((level) => `ladder-kestrel-l${level}-b`);
/** The mutation baseline's 25 specs: frame-codec was rescored after FINDINGS.md's 1,442 were counted. */
const MUTATION_BASELINE_SKIP = ["frame-codec"];

const { options, rest } = args();
const [command] = rest;

/** What the home really holds, but the folders the sandbox mounts its own paths under. */
function homeEntries() {
  const own = [HOME, SPECS, WORK_ROOT].map((path) => relative(homedir(), path).split("/")[0]).filter((name) => name !== "" && !name.startsWith(".."));
  return readdirSync(homedir()).filter((name) => !own.includes(name));
}

/** Each probe run inside the sandbox, with what it should do. */
function sandbox() {
  const own = workdir("sandbox-own");
  const other = workdir("sandbox-other");
  const state = workdir("sandbox-state");
  try {
    writeFileSync(join(own, "mine.txt"), "mine\n");
    mkdirSync(join(other, "tests", "private"), { recursive: true });
    writeFileSync(join(other, "tests", "private", "hidden.test.ts"), "// a hidden test\n");
    const specHidden = join(SPECS, "_sandbox-probe", "tests", "private", "hidden.test.ts");
    mkdirSync(join(SPECS, "_sandbox-probe", "tests", "private"), { recursive: true });
    writeFileSync(specHidden, "// a hidden test at rest\n");
    const probes = [
      { name: "read own workdir", argv: ["/bin/cat", join(own, "mine.txt")], allowed: true },
      { name: "write own workdir", argv: ["/bin/sh", "-c", `echo x > ${join(own, "new.txt")}`], allowed: true },
      { name: "node runs", argv: [process.execPath, "-e", "console.log(1)"], allowed: true },
      { name: "python runs", argv: [PYTHON, "-c", "print(1)"], allowed: true },
      { name: "git runs", argv: ["/usr/bin/git", "--version"], allowed: true },
      { name: "read a sibling workdir's hidden suite", argv: ["/bin/cat", join(other, "tests", "private", "hidden.test.ts")], allowed: false },
      // A listing counts as read when it names what is really there: on Linux
      // a blanked folder lists as empty, or with the sandbox's own mount points.
      { name: "list WORK_ROOT", argv: ["/bin/ls", join(own, "..")], allowed: false, reveals: [basename(other)] },
      { name: "read a spec's tests/private", argv: ["/bin/cat", specHidden], allowed: false },
      { name: "list the home", argv: ["/bin/ls", "-a", homedir()], allowed: false, reveals: homeEntries() },
      { name: "read ~/.codex/auth.json", argv: ["/bin/cat", join(homedir(), ".codex", "auth.json")], allowed: false },
      { name: "read the package", argv: ["/bin/cat", join(ROOT, "package.json")], allowed: false },
      { name: "write outside the workdir", argv: ["/bin/sh", "-c", `echo x > ${join(other, "planted.txt")}`], allowed: false },
      { name: "network (sandbox with network)", argv: [process.execPath, "-e", "fetch('https://example.com').then(()=>process.exit(0),()=>process.exit(1))"], allowed: true },
      { name: "network (sandbox without network)", argv: [process.execPath, "-e", "fetch('https://example.com').then(()=>process.exit(0),()=>process.exit(1))"], allowed: false, network: false },
    ];
    let wrong = 0;
    const rows = probes.map((probe) => {
      const [bin, argv] = placement(probe.argv[0], probe.argv.slice(1), { cwd: own, state, network: probe.network ?? true });
      const out = spawnSync(bin, argv, { cwd: own, encoding: "utf8", env: { PATH: process.env.PATH, HOME: join(state, "home") }, timeout: 30_000 });
      const ran = out.status === 0 && (probe.reveals === undefined || probe.reveals.some((name) => out.stdout.split("\n").includes(name)));
      const ok = ran === probe.allowed;
      if (!ok) wrong += 1;
      return { probe: probe.name, expected: probe.allowed ? "allowed" : "denied", got: ran ? "allowed" : "denied", ok, detail: `${out.stdout}${out.stderr}`.trim().split("\n")[0]?.slice(0, 160) ?? "" };
    });
    if (existsSync(join(other, "planted.txt"))) wrong += 1;
    for (const row of rows) console.log(`${row.ok ? "ok  " : "FAIL"} ${row.probe}: ${row.got} (${row.detail})`);
    return { platform: process.platform, probes: rows, wrong };
  } finally {
    for (const dir of [own, other, state]) discard(dir);
    spawnSync("rm", ["-rf", join(SPECS, "_sandbox-probe")]);
  }
}

/**
 * A stand-in for POST /v1/messages that answers by how far the
 * conversation got, and records every request it saw.
 */
function mockApi(script) {
  const requests = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const parsed = JSON.parse(body || "{}");
      requests.push({ url: req.url, headers: req.headers, body: parsed });
      const reply = script(parsed.messages ?? []);
      res.writeHead(200, { "content-type": "application/json", "request-id": `req_${requests.length}` });
      res.end(
        JSON.stringify({
          id: `msg_${requests.length}`,
          type: "message",
          role: "assistant",
          model: parsed.model,
          stop_details: null,
          stop_sequence: null,
          usage: { input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          ...reply,
        }),
      );
    });
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done({ server, requests, url: `http://127.0.0.1:${server.address().port}` })));
}

async function selftest() {
  const checks = [];
  const check = (name, ok, detail = "") => {
    checks.push({ name, ok, detail });
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
  };
  const own = workdir("selftest-own");
  const other = workdir("selftest-other");
  const out = workdir("selftest-out");
  const hidden = join(other, "tests", "private", "hidden.test.ts");
  mkdirSync(join(other, "tests", "private"), { recursive: true });
  writeFileSync(hidden, "// SECRET-HIDDEN-MARKER\n");
  const use = (id, name, input) => ({ type: "tool_use", id, name, input });
  const { server, requests, url } = await mockApi((messages) => {
    const turn = messages.filter((message) => message.role === "assistant").length;
    if (turn === 0) return { stop_reason: "tool_use", content: [{ type: "text", text: "Writing." }, use("t1", "Write", { file_path: "src/a.txt", content: "A\n" })] };
    if (turn === 1)
      return {
        stop_reason: "tool_use",
        content: [use("t2", "Read", { file_path: hidden }), use("t3", "Bash", { command: `cat ${hidden}` }), use("t4", "Read", { file_path: "../" })],
      };
    if (turn === 2)
      return {
        stop_reason: "tool_use",
        content: [use("t5", "Edit", { file_path: "src/a.txt", old_string: "A", new_string: "B" }), use("t6", "Glob", { pattern: "**/*.txt" }), use("t7", "Grep", { pattern: "^B" }), use("t8", "Bash", { command: "cat src/a.txt; node -e 'console.log(2+2)'" })],
      };
    return { stop_reason: "end_turn", content: [{ type: "text", text: turn === 3 ? "done" : "resumed" }] };
  });
  const env = { ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
  process.env.ANTHROPIC_BASE_URL = url;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-not-a-key";
  try {
    const transcript = join(out, "api.jsonl");
    const first = await session({ cwd: own, text: "Do the task.", transcript, kind: "generate", backend: "anthropic-api" });
    check("api session ends ok", first.ok && first.finalText === "done", JSON.stringify({ ok: first.ok, subtype: first.subtype, finalText: first.finalText, apiError: first.apiError }));
    check("api writes and edits inside the workdir", existsSync(join(own, "src", "a.txt")) && readFileSync(join(own, "src", "a.txt"), "utf8") === "B\n");
    const results = requests.flatMap((request) => request.body.messages.flatMap((message) => (Array.isArray(message.content) ? message.content : [])).filter((block) => block.type === "tool_result"));
    const resultOf = (id) => results.find((block) => block.tool_use_id === id);
    check("api Read outside the workdir refused", resultOf("t2")?.is_error === true && /outside the working directory/.test(resultOf("t2").content), resultOf("t2")?.content);
    check("api Bash cannot read a sibling workdir", /Operation not permitted/.test(resultOf("t3")?.content ?? "") && !/SECRET-HIDDEN-MARKER/.test(resultOf("t3")?.content ?? ""), resultOf("t3")?.content.split("\n")[0]);
    check("api Read of .. refused", resultOf("t4")?.is_error === true);
    check("api Glob, Grep and Bash work in the workdir", /src\/a.txt/.test(resultOf("t6")?.content ?? "") && /src\/a.txt:1:B/.test(resultOf("t7")?.content ?? "") && /B\n4\n\(exit 0\)/.test(resultOf("t8")?.content ?? ""), JSON.stringify([resultOf("t6")?.content, resultOf("t7")?.content, resultOf("t8")?.content]));
    check("marker never reached the API", !JSON.stringify(requests).includes("SECRET-HIDDEN-MARKER"));
    const head = requests[0];
    check("request: key, version, model, tools, fallback", head.headers["x-api-key"] === "sk-ant-test-not-a-key" && typeof head.headers["anthropic-version"] === "string" && head.body.model === "claude-opus-5-5" && head.body.tools.map((tool) => tool.name).join() === "Bash,Read,Write,Edit,Glob,Grep" && head.body.fallbacks === "default" && /server-side-fallback/.test(head.headers["anthropic-beta"] ?? ""), `${head.url} beta=${head.headers["anthropic-beta"]}`);
    check("api cost from usage", Math.abs(first.costUsd - 4 * (1000 * 4 + 200 * 20) / 1e6) < 1e-9, String(first.costUsd));
    const lines = readFileSync(transcript, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    check("transcript shape: init, assistant tool_use, user tool_result, result", lines[0].type === "system" && lines[0].subtype === "init" && lines.some((line) => line.type === "assistant" && line.message.content.some((block) => block.type === "tool_use")) && lines.some((line) => line.type === "user") && lines.at(-1).type === "result" && lines.every((line) => typeof line.timestamp === "string"));
    const found = peeks(transcript, own, ["tests/private"]);
    check("peeks reads the api transcript (the hidden path twice)", found.length === 2, found.map((item) => `${item.tool}:${item.match}`).join(", "));
    const audited = audit(transcript, { slug: "x", hiddenDir: "tests/private" }, lines[0].timestamp);
    check("audit reads the api transcript", audited.length >= 2, audited.map((item) => `${item.tool}:${item.match}`).join(", "));
    const again = await session({ cwd: own, text: "Again.", transcript, kind: "generate", backend: "anthropic-api", resume: first.sessionId });
    check("api resume continues the conversation", again.ok && again.finalText === "resumed" && requests.at(-1).body.messages.length === 9, `${requests.at(-1).body.messages.length} messages`);

    const execTranscript = join(out, "exec.jsonl");
    const ran = await session({ cwd: own, text: "the prompt\n", transcript: execTranscript, kind: "generate", backend: "exec", command: `cat > prompt.txt; cat ${hidden} || echo denied` });
    check("exec gets the prompt on stdin and runs in the workdir", ran.ok && readFileSync(join(own, "prompt.txt"), "utf8") === "the prompt\n" && /denied/.test(ran.finalText) && !/SECRET/.test(ran.finalText), ran.finalText);
    check("no login copy left in session state", !stateFiles(transcript).some((path) => path.endsWith("auth.json")));
  } finally {
    server.close();
    for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    for (const dir of [own, other, out]) discard(dir);
  }
  return { checks, wrong: checks.filter((item) => !item.ok).length };
}

/** Imports the archive's specs; for another backend, strips what its writers will write again. */
function importArm(arm) {
  const slugs = arm === "claude" ? [...CORE(), ...HUMANEVAL(), ...LADDER_A, ...LADDER_B] : [...CORE(), ...HUMANEVAL(), ...LADDER_A];
  const missing = slugs.filter((slug) => !existsSync(join(SPECS, slug, "spec.md")));
  if (missing.length > 0) {
    const out = spawnSync(process.execPath, [join(ROOT, "bin", "import-archive.mjs"), ...missing, "--archive", ARCHIVE], { stdio: "inherit" });
    if (out.status !== 0) process.exit(1);
    if (arm !== "claude")
      for (const slug of missing) {
        const dir = specDir(slug);
        // The ladder's hidden suite is the oracle's cases: only its public suite is written again.
        const ladder = slug.startsWith("ladder-");
        for (const part of ladder ? ["tests/public", "calibration.json", "generation.json"] : ["tests", "calibration.json", "generation.json"])
          spawnSync("rm", ["-rf", join(dir, part)]);
        writeJson(join(dir, "toolchain.json"), { ...readJson(join(dir, "toolchain.json"), {}), backend: arm });
      }
  }
  log(`${slugs.length} spec(s) in ${SPECS} for the ${arm} arm`);
}

const failingIds = (result) => testsOf(result).filter((test) => !test.ok).map((test) => test.id);
/**
 * calibrate.mjs without its reference session: the spec's reference (the
 * archive's, written against the Claude suites) stands in for it.
 */
function calibrateScripted(slug) {
  const chain = toolchainOf(slug);
  const dir = stage(workdir(`${slug}-calibrate`), slug, { skeleton: true, publicTests: true, hiddenTests: true });
  let onSkeleton;
  try {
    onSkeleton = runSuite(dir, "private", chain);
  } finally {
    discard(dir);
  }
  if (!onSkeleton.compiled) return { slug, status: "dropped", reason: "The hidden suite does not compile against the skeleton.", scripted: true };
  const dropped = [];
  const crashed = new Set(onSkeleton.files.filter((file) => file.crashed).map((file) => file.file));
  for (const file of crashed) dropped.push({ id: `${file} :: *`, reason: "The file crashes on the skeleton instead of failing a test." });
  for (const test of testsOf(onSkeleton)) if (test.ok || test.skipped) dropped.push({ id: test.id, reason: test.skipped ? "Skipped." : "Passes on the skeleton." });
  const judged = judge(slug, join(specDir(slug), "reference", "src"));
  const onReference = new Map(testsOf(judged.hidden).map((test) => [test.id, test]));
  const hiddenIds = testsOf(onSkeleton).map((test) => test.id);
  const droppedIds = new Set(dropped.map((item) => item.id));
  for (const id of hiddenIds)
    if (!droppedIds.has(id) && onReference.get(id)?.ok !== true)
      dropped.push({ id, reason: `The reference cannot satisfy it: ${onReference.get(id)?.error?.message.split("\n")[0] ?? "it did not run"}` });
  const finalDropped = new Set(dropped.map((item) => item.id));
  const kept = hiddenIds.filter((id) => !finalDropped.has(id) && !crashed.has(id.split(" :: ")[0]));
  const publicIds = testsOf(judged.public).map((test) => test.id);
  return {
    slug,
    status: kept.length > 0 ? "ok" : "dropped",
    reason: kept.length > 0 ? null : "No hidden test survived calibration.",
    scripted: true,
    publicIds,
    publicFailingOnReference: failingIds(judged.public),
    hiddenWritten: hiddenIds.length,
    kept,
    dropped,
    reference: { source: "the spec's reference/ (archive), no session", public: count(judged.public, publicIds), hidden: count(judged.hidden, kept) },
  };
}

/** The kestrel oracle as a submission: ladder/tasks/kestrel/reference.mjs as src/index.ts. */
function oracleSrc() {
  const dir = workdir("kestrel-oracle");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "index.ts"), `// @ts-nocheck\n${readFileSync(join(ARCHIVE, "ladder", "tasks", "kestrel", "reference.mjs"), "utf8")}`);
  return dir;
}

/** Each level's public suite on the oracle: how many of the writer's tests the oracle passes. */
function ladderAgreement() {
  // generate.mjs --only public drops a hidden suite as stale; the ladder's is the oracle's cases, put back as they were.
  for (const slug of LADDER_A)
    if (existsSync(join(specDir(slug), "spec.md")) && !existsSync(join(specDir(slug), "tests", "private")))
      copy(join(ARCHIVE, "specs", slug, "tests", "private"), join(specDir(slug), "tests", "private"));
  const oracle = oracleSrc();
  try {
    return LADDER_A.filter((slug) => existsSync(join(specDir(slug), "tests", "public"))).map((slug) => {
      const dir = stage(workdir(`${slug}-oracle`), slug, { spec: false, publicTests: true, src: join(oracle, "src") });
      try {
        const result = runSuite(dir, "public", toolchainOf(slug));
        const tests = testsOf(result);
        return { slug, level: Number(/-l(\d)/.exec(slug)[1]), compiled: result.compiled, passed: tests.filter((test) => test.ok).length, total: tests.length, failing: failingIds(result) };
      } finally {
        discard(dir);
      }
    });
  } finally {
    discard(oracle);
  }
}

/**
 * The archive's stored kestrel agent runs scored again on the oracle, as
 * bin/ladder/score.mjs scores them: the submission's src/ alone, the macro
 * oracle match over rules; a run that changed anything but src/ or
 * tests/own/ is refused and scores 0. Compared run by run with the
 * archive's ladder/results.jsonl.
 */
function ladderRuns(root = join(ARCHIVE, "runs")) {
  const archived = new Map(archiveLines("ladder/results.jsonl").map((line) => [line.key, line]));
  const rows = [];
  for (const slug of [...LADDER_A, ...LADDER_B]) {
    const runs = join(root, slug);
    if (!existsSync(runs) || !existsSync(join(specDir(slug), "spec.md"))) continue;
    const calibration = readJson(join(specDir(slug), "calibration.json"));
    const cases = readJson(join(specDir(slug), "tests", "private", "cases.json")).cases;
    const ruleOf = new Map(cases.map((item) => [`tests/private/oracle.test.ts :: ${item.rule} ${item.id}`, item.rule]));
    for (const variant of readdirSync(runs).sort())
      for (const n of readdirSync(join(runs, variant)).filter((name) => /^\d+$/.test(name))) {
        const run = readJson(join(runs, variant, n, "run.json"), null);
        if (run === null) continue;
        const key = `${slug}/${variant}/${n}`;
        const refused = run.changes.filter((item) => !(item.path.startsWith("src/") || item.path.startsWith("tests/own/")) || item.symlink === true);
        const perRule = {};
        for (const item of cases) (perRule[item.rule] ??= { matched: 0, cases: 0 }).cases += 1;
        const submission = join(runs, variant, n, "submission", "src");
        let publicCount = { passed: 0, total: calibration.publicIds.length };
        if (refused.length === 0 && existsSync(submission)) {
          const judged = judge(slug, submission);
          publicCount = count(judged.public, calibration.publicIds);
          for (const test of testsOf(judged.hidden)) if (test.ok && ruleOf.has(test.id)) perRule[ruleOf.get(test.id)].matched += 1;
        }
        const rules = Object.values(perRule);
        const macro = rules.reduce((sum, rule) => sum + rule.matched / rule.cases, 0) / rules.length;
        const before = archived.get(key);
        // This package's agent brief (prompts/agent.md) is the archive's double-blind-own brief.
        const arm = variant === "haiku" ? "own-brief" : variant.replace(/-haiku$/, "");
        const fromArchive = root === join(ARCHIVE, "runs");
        rows.push({ key, level: Number(/-l(\d)/.exec(slug)[1]), condition: slug.endsWith("-b") ? "b" : "a", arm, macro, public: publicCount, archiveMacro: fromArchive ? (before?.oracle.macro ?? null) : undefined });
        log(key, `macro ${(macro * 100).toFixed(1)}%${fromArchive && before && Math.abs(before.oracle.macro - macro) > 1e-9 ? ` (archive ${(before.oracle.macro * 100).toFixed(1)}%)` : ""}`);
      }
  }
  const cells = {};
  for (const row of rows) {
    const cell = (cells[`${row.condition}/${row.arm}/L${row.level}`] ??= { runs: 0, sum: 0 });
    cell.runs += 1;
    cell.sum += row.macro;
  }
  const means = Object.fromEntries(Object.entries(cells).map(([key, cell]) => [key, Math.round((1000 * cell.sum) / cell.runs) / 10]));
  const compared = rows.filter((row) => row.archiveMacro !== undefined);
  return { runs: rows.length, differingFromArchive: compared.filter((row) => row.archiveMacro === null || Math.abs(row.archiveMacro - row.macro) > 1e-9).length, means, rows };
}

const pct = (n, of) => (of === 0 ? null : Math.round((1000 * n) / of) / 10);
const jsonl = (path) => (existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []);

/** The referee's per-run count (bin/referee.mjs `summary`): a run is upheld when a suite test it fails is one the spec requires. */
function upheld(lines) {
  const suite = lines.filter((item) => item.kind === "suite");
  const runsOf = (rows) => new Set(rows.flatMap((item) => item.runs.map((run) => `${item.spec}/${run}`)));
  const answered = suite.filter((item) => ["yes", "no", "open"].includes(item.requires));
  return {
    cases: suite.length,
    answered: answered.length,
    requires: { yes: answered.filter((item) => item.requires === "yes").length, open: answered.filter((item) => item.requires === "open").length, no: answered.filter((item) => item.requires === "no").length },
    runsRejected: runsOf(suite).size,
    runsUpheld: runsOf(suite.filter((item) => item.requires === "yes")).size,
  };
}

/** One arm's numbers from its home: calibration, mutation, EvalPlus, ladder, referee. */
function armNumbers({ specs, runs, evalplus, ladder, referee, mutationLines }) {
  const core = CORE().filter((slug) => existsSync(join(specs, slug, "calibration.json")) && existsSync(join(specs, slug, "tests", "private")));
  const calibrations = core.map((slug) => readJson(join(specs, slug, "calibration.json")));
  const written = calibrations.reduce((sum, item) => sum + (item.hiddenWritten ?? 0), 0);
  const kept = calibrations.reduce((sum, item) => sum + (item.kept?.length ?? 0), 0);
  const publicTests = calibrations.reduce((sum, item) => sum + (item.publicIds?.length ?? 0), 0);
  const publicFailing = calibrations.reduce((sum, item) => sum + (item.publicFailingOnReference?.length ?? 0), 0);
  const mutation = Object.fromEntries((mutationLines ?? jsonl(join(runs, "_mutation", "summary.jsonl"))).map((line) => [line.spec, line]));
  return {
    calibrated: core.length,
    hidden: { written, kept, percent: pct(kept, written) },
    public: { tests: publicTests, failingOnReference: publicFailing },
    mutation,
    evalplus: existsSync(evalplus) ? readJson(evalplus) : null,
    ladder: existsSync(ladder) ? readJson(ladder) : null,
    referee: existsSync(referee) ? upheld(jsonl(referee)) : null,
  };
}

/**
 * evidence/evalplus.mjs's table (right = EvalPlus base and plus) over the
 * per-task files in `dir`, for the tasks named: both arms on the same tasks.
 */
function evalplusTable(dir, slugs) {
  const specs = slugs.map((slug) => readJson(join(dir, `${slug}.json`), null)).filter(Boolean);
  const rows = specs.flatMap((spec) => spec.rows);
  const right = (row) => row.base && row.plus;
  const generated = (row) => row.public && row.hidden;
  const wrong = rows.filter((row) => !right(row));
  const correct = rows.filter(right);
  const accepted = wrong.filter(generated).length;
  const base = wrong.filter((row) => row.base).length;
  return {
    tasks: specs.length,
    solutions: rows.length,
    wrong: wrong.length,
    wrongAcceptedByBase: { count: base, percent: pct(base, wrong.length) },
    wrongAcceptedByGenerated: { count: accepted, percent: pct(accepted, wrong.length) },
    rightRejectedByGenerated: { count: correct.filter((row) => !generated(row)).length, of: correct.length },
  };
}

/** Whether the other arm's mutants of a spec are the archive's, one for one (same file, place and edit). */
function sameMutants(slug, runs) {
  const mine = readJson(join(runs, "_mutation", `${slug}.json`), null)?.results;
  const theirs = readJson(join(ARCHIVE, "runs", "_mutation", `${slug}.json`), null)?.results;
  return Boolean(mine && theirs && mine.length === theirs.length && mine.every((m, at) => m.file === theirs[at].file && m.start === theirs[at].start && m.text === theirs[at].text));
}

/** Mutation totals over the baseline's specs both arms scored on the same mutants. */
function mutationTotals(arms, runs) {
  const specs = CORE().filter((slug) => !MUTATION_BASELINE_SKIP.includes(slug) && arms.every((arm) => arm.mutation[slug] !== undefined) && sameMutants(slug, runs));
  return arms.map((arm) => {
    const sum = (key) => specs.reduce((total, slug) => total + arm.mutation[slug][key], 0);
    return { specs: specs.length, judged: sum("judged"), publicKilled: sum("publicKilled"), eitherKilled: sum("eitherKilled"), publicPercent: pct(sum("publicKilled"), sum("judged")), eitherPercent: pct(sum("eitherKilled"), sum("judged")) };
  });
}

function report() {
  const claudeHome = resolve(typeof options.claude === "string" ? options.claude : HOME);
  const backend = typeof options.backend === "string" ? options.backend : "codex-cli";
  const here = join(ROOT, "evidence", "backends");
  const claude = armNumbers({
    specs: join(claudeHome, "specs"),
    runs: join(claudeHome, "runs"),
    evalplus: join(ROOT, "evidence", "evalplus.json"),
    ladder: join(here, "ladder-claude.json"),
    referee: join(ARCHIVE, "referee.jsonl"),
    // The baseline: the archive's own per-spec counts (mutation.jsonl), on the mutants the other arm is scored on.
    mutationLines: archiveLines("mutation.jsonl"),
  });
  const other = armNumbers({
    specs: join(here, "specs"),
    runs: join(here, "runs"),
    evalplus: join(here, `evalplus-${backend}.json`),
    ladder: join(here, `ladder-${backend}.json`),
    referee: join(here, `referee-${backend}.jsonl`),
  });
  const [claudeMutation, otherMutation] = mutationTotals([claude, other], join(here, "runs"));
  // EvalPlus on the tasks the other backend has suites for, both arms (without HumanEval/22 and /60).
  const scored = existsSync(join(here, "runs", "_evalplus"))
    ? readdirSync(join(here, "runs", "_evalplus")).filter((name) => /^he-\d+\.json$/.test(name)).map((name) => name.slice(0, -5)).filter((slug) => !["he-22", "he-60"].includes(slug))
    : [];
  const evalplusSubset = { tasks: scored, claude: evalplusTable(join(ARCHIVE, "runs", "_evalplus"), scored), other: evalplusTable(join(here, "runs", "_evalplus"), scored) };
  const e2eDir = join(here, "specs", "duration-parse");
  const e2e = existsSync(join(e2eDir, "calibration.json"))
    ? { calibration: readJson(join(e2eDir, "calibration.json")), generation: readJson(join(e2eDir, "generation.json")), prepared: readJson(join(e2eDir, "prepared.json"), null) }
    : null;
  const out = { at: new Date().toISOString(), backend, claude: { ...claude, mutationTotals: claudeMutation }, other: { ...other, mutationTotals: otherMutation }, evalplusSubset, e2e };
  writeJson(join(ROOT, "evidence", "backends.json"), out);
  const cell = (value) => value ?? "pending";
  const kept = (arm) => (arm.calibrated === 0 ? null : `${arm.hidden.kept} of ${arm.hidden.written} (${arm.hidden.percent}%), ${arm.calibrated} specs`);
  const mut = (totals, key) => (totals.specs === 0 ? null : `${totals[key === "public" ? "publicKilled" : "eitherKilled"]} of ${totals.judged} (${totals[key === "public" ? "publicPercent" : "eitherPercent"]}%)`);
  const ep = (arm, field) => {
    const table = arm.evalplus?.without22and60;
    if (!table) return null;
    return field === "wrong" ? `${table.wrongAcceptedByGenerated.percent}% (${table.wrongAcceptedByGenerated.count} of ${table.wrong}), ${table.tasks} tasks` : `${table.rightRejectedByGenerated.count} of ${table.rightRejectedByGenerated.of}`;
  };
  const sub = (table, field) =>
    table.tasks === 0 ? null : field === "wrong" ? `${table.wrongAcceptedByGenerated.percent}% (${table.wrongAcceptedByGenerated.count} of ${table.wrong}; HumanEval's own ${table.wrongAcceptedByBase.percent}%)` : `${table.rightRejectedByGenerated.count} of ${table.rightRejectedByGenerated.of}`;
  const ladderB = (arm, key) => {
    const means = arm.ladder?.rescored?.means;
    if (!means) return null;
    const cells = [1, 2, 3, 4].map((level) => means[`b/${key}/L${level}`]);
    return cells.some((cell) => cell === undefined) ? null : `${cells.join(", ")}`;
  };
  const agree = (arm) => (arm.ladder?.agreement?.length ? arm.ladder.agreement.map((row) => `${row.passed}/${row.total}`).join(", ") : null);
  const ref = (arm) => (arm.referee === null ? null : `${arm.referee.runsUpheld} of ${arm.referee.runsRejected} runs (${arm.referee.answered} of ${arm.referee.cases} cases answered)`);
  const rows = [
    ["hidden tests kept by calibration", kept(claude), kept(other)],
    ["mutants killed, public suite", mut(claudeMutation, "public"), mut(otherMutation, "public")],
    ["mutants killed, public + hidden", mut(claudeMutation, "either"), mut(otherMutation, "either")],
    ["EvalPlus wrong solutions accepted, 38 tasks (HumanEval's own tests: 15.0%)", ep(claude, "wrong"), other.evalplus?.without22and60?.tasks === 38 ? ep(other, "wrong") : null],
    ["EvalPlus right solutions rejected, 38 tasks", ep(claude, "right"), other.evalplus?.without22and60?.tasks === 38 ? ep(other, "right") : null],
    [`EvalPlus wrong accepted, the ${evalplusSubset.claude.tasks} tasks both have`, sub(evalplusSubset.claude, "wrong"), sub(evalplusSubset.other, "wrong")],
    [`EvalPlus right rejected, the ${evalplusSubset.claude.tasks} tasks both have`, sub(evalplusSubset.claude, "right"), sub(evalplusSubset.other, "right")],
    ["ladder: public tests the oracle passes, L0–L4", agree(claude), agree(other)],
    ["ladder B: Haiku on the L0 suite, oracle match % at L1–L4 (own-tests brief)", ladderB(claude, "double-blind-own"), ladderB(other, "own-brief")],
    ["referee: rejected runs upheld (same cases)", ref(claude), ref(other)],
  ];
  console.log(`| metric | Claude (archive) | ${backend} |\n| --- | --- | --- |`);
  for (const [name, a, b] of rows) console.log(`| ${name} | ${cell(a)} | ${cell(b)} |`);
  if (claudeMutation.specs > 0) console.log(`\nmutation over ${claudeMutation.specs} specs both arms scored`);
}

/**
 * Condition B on another backend's suite: the archive's level specs
 * L1–L4 (the vaguer spec, the oracle as hidden suite) with this SPECS'
 * L0 public suite in place of the Claude-written one. Haiku agent runs on
 * them (bin/run.mjs) are then scored by `ladder --runs`.
 */
function ladderB() {
  const slugs = LADDER_B.filter((slug) => !existsSync(join(specDir(slug), "spec.md")));
  if (slugs.length > 0) {
    const out = spawnSync(process.execPath, [join(ROOT, "bin", "import-archive.mjs"), ...slugs, "--archive", ARCHIVE], { stdio: "inherit" });
    if (out.status !== 0) process.exit(1);
  }
  const oracle = oracleSrc();
  try {
    for (const slug of LADDER_B) {
      const dir = specDir(slug);
      spawnSync("rm", ["-rf", join(dir, "tests", "public")]);
      copy(join(specDir("ladder-kestrel-l0"), "tests", "public"), join(dir, "tests", "public"));
      const staged = stage(workdir(`${slug}-oracle`), slug, { spec: false, publicTests: true, src: join(oracle, "src") });
      let ids;
      try {
        ids = testsOf(runSuite(staged, "public", toolchainOf(slug))).map((test) => test.id);
      } finally {
        discard(staged);
      }
      const calibration = readJson(join(dir, "calibration.json"));
      writeJson(join(dir, "calibration.json"), { ...calibration, publicIds: ids, publicFrom: `ladder-kestrel-l0 in ${SPECS}` });
      log(slug, `public suite from ladder-kestrel-l0: ${ids.length} tests`);
    }
  } finally {
    discard(oracle);
  }
}

if (command === "ladder-b") {
  ladderB();
} else if (command === "report") {
  report();
} else if (command === "import") {
  importArm(rest[1] ?? "claude");
} else if (command === "calibrate") {
  const named = rest.slice(1);
  const slugs = specSlugs(named).filter((slug) => existsSync(join(specDir(slug), "reference", "src")) && existsSync(join(specDir(slug), "tests", "private")));
  const records = [];
  for (const slug of slugs) {
    const path = join(specDir(slug), "calibration.json");
    const existing = readJson(path, null);
    if (options.check !== true && existing !== null && options.force !== true) continue;
    const record = calibrateScripted(slug);
    records.push({ slug, written: record.hiddenWritten, kept: record.kept?.length ?? 0, publicFailingOnReference: record.publicFailingOnReference?.length ?? 0, ...(existing ? { recorded: { written: existing.hiddenWritten, kept: existing.kept.length } } : {}) });
    if (options.check !== true) writeJson(path, record);
    log(slug, `kept ${record.kept?.length ?? 0}/${record.hiddenWritten ?? 0} hidden${existing && options.check === true ? ` (recorded ${existing.kept.length}/${existing.hiddenWritten})` : ""}, public failing on the reference ${record.publicFailingOnReference?.length ?? "-"}`);
  }
  if (typeof options.json === "string") writeJson(options.json, records);
} else if (command === "ladder") {
  // --runs scores the archive's stored runs; --runs <runs dir> scores that home's (condition B on another backend's suite).
  const result = { agreement: ladderAgreement(), ...(options.runs !== undefined ? { rescored: ladderRuns(options.runs === true ? undefined : resolve(options.runs)) } : {}) };
  for (const row of result.agreement) console.log(`${row.slug}: the oracle passes ${row.passed}/${row.total} public tests`);
  if (result.rescored) console.log(JSON.stringify({ runs: result.rescored.runs, differingFromArchive: result.rescored.differingFromArchive, means: result.rescored.means }, null, 2));
  if (typeof options.json === "string") writeJson(options.json, result);
} else if (command === "selftest") {
  const result = await selftest();
  if (options.json) writeFileSync(options.json, `${JSON.stringify(result, null, 2)}\n`);
  log(result.wrong === 0 ? "selftest: every check passed" : `selftest: ${result.wrong} check(s) failed`);
  process.exit(result.wrong === 0 ? 0 : 1);
} else if (command === "sandbox") {
  const result = sandbox();
  if (options.json) writeFileSync(options.json, `${JSON.stringify(result, null, 2)}\n`);
  log(result.wrong === 0 ? "sandbox: every probe as expected" : `sandbox: ${result.wrong} probe(s) wrong`);
  process.exit(result.wrong === 0 ? 0 : 1);
} else {
  console.error("usage: node evidence/backends.mjs sandbox|selftest|import <arm>|calibrate [slug...] [--check]|ladder [--runs]|report [--json <file>]");
  process.exit(1);
}
