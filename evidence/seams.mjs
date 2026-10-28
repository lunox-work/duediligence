#!/usr/bin/env node
// Black-box seams (RESULTS.md "Black-box seams"): a spec
// checked through a command or an HTTP service instead of its exports,
// first on material that exists, with no model. Home: evidence/seams/
// (DUEDILIGENCE_HOME, set here unless given).
//
//   node evidence/seams.mjs selftest [--json <file>]
//       bin/runners/boundary.mjs on a hand-made HTTP fixture in a scratch
//       home: the reference passes; a 501 stub, a service that never
//       answers, one that dies on its first request and one over the
//       memory ceiling are rejected; the judge SIGKILLed mid-suite; a seal
//       judged; the commitment hash over the boundary, by the shell recipe
//       too. After every judge, `pgrep` for the fixture's service.
//   node evidence/seams.mjs repo-selftest
//       fit, repo.mjs and judge --repo (and from a seal) with --seam http on
//       a hand-made TypeScript package whose server gains a route
//   node evidence/seams.mjs import
//       the archive's patch-apply twice, at its module seam (patch-apply)
//       and at a command (patch-apply-cli, import-archive --seam exec)
//   node evidence/seams.mjs calibrate
//       both calibrated by script with the archive's reference
//       (evidence/backends.mjs calibrate), against the archive's kept list
//   node evidence/seams.mjs oracle [--concurrency 4]
//       the archive's git oracle corpus (runs/git-oracle/cases.jsonl, 8,842
//       cases; bin/git-oracle/ in the archive) through the command
//       `node src/cli.js applyPatch` of the reference, one process per
//       case, against `git apply` (git.jsonl) on the judged set (flags.jsonl:
//       unique hunks, inside the grammar) and on all cases, and against
//       the archive's module-seam results case by case
//   node evidence/seams.mjs submissions [--concurrency 2]
//       every stored patch-apply submission in the archive judged at both
//       seams, the command one with the reference's src/cli.ts added; the
//       verdicts and failing tests compared, and the runs the hidden suite
//       passes set against their disagreements with git
//   node evidence/seams.mjs http        the HTTP spec (csv-export-http): its
//       preparation, the 501 stub judged, its graded blind runs; after
//       evidence/seams/queue.sh, which prepares it and runs Haiku blind
//   node evidence/seams.mjs report      evidence/seams.json
//
// Archive files are read in place, never written.

import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = join(HERE, "..");
process.env.DUEDILIGENCE_HOME ??= join(HERE, "seams");
const ARCHIVE = resolve(process.env.DUEDILIGENCE_ARCHIVE ?? join(PACKAGE, "experiments"));
const ORACLE = join(ARCHIVE, "runs", "git-oracle");
const OUT = join(HERE, "seams");
const SUMMARY = join(HERE, "seams.json");

const lib = await import("../bin/lib.mjs");
const { args, copy, count, discard, judge, log, pool, readJson, specDir, stage, testsOf, verdict, workdir, writeJson } = lib;
const { hashFiles } = await import(pathToFileURL(join(ARCHIVE, "bin", "git-oracle", "hash.mjs")).href);
const { options, rest } = args();
const command = rest[0];
const summary = readJson(SUMMARY, {});
const save = (key, value) => {
  summary[key] = { at: new Date().toISOString(), ...value };
  writeJson(SUMMARY, summary);
};
const node = (script, argv, env = {}) =>
  spawnSync(process.execPath, [join(PACKAGE, script), ...argv], {
    cwd: PACKAGE,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
const lines = (path) =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

// --- selftest ---------------------------------------------------------------

const FIXTURE_SERVER = (handler) => `import { createServer } from "node:http";
createServer(async (req: any, res: any) => {
  let body = "";
  for await (const chunk of req) body += chunk;
${handler}
}).listen(Number(process.env.PORT), process.env.HOST ?? "127.0.0.1");
`;
const ECHO = `  if (req.method === "POST" && req.url === "/echo") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(body.toUpperCase());
    return;
  }
  res.writeHead(404);
  res.end();`;
const VARIANTS = {
  reference: { server: FIXTURE_SERVER(ECHO), expect: "passed" },
  stub: { server: FIXTURE_SERVER("  res.writeHead(501);\n  res.end();"), expect: "incomplete" },
  "never answers": { server: "setInterval(() => {}, 1000);\n", expect: "incomplete" },
  "dies on its first request": { server: FIXTURE_SERVER("  process.exit(3);"), expect: "incomplete" },
  "over the memory ceiling": {
    server: FIXTURE_SERVER("  const keep: any[] = [];\n  setInterval(() => keep.push(Buffer.alloc(16 * 1024 * 1024, 1)), 10);"),
    expect: "incomplete",
  },
};
/** Processes still running in a judge tree of the fixture (lib.mjs JUDGE_ROOT/http-echo-*), by working directory. */
function leftovers() {
  const listed = spawnSync("lsof", ["-d", "cwd", "-Fpn"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).stdout ?? "";
  const found = new Set();
  let pid = null;
  for (const line of listed.split("\n")) {
    if (line.startsWith("p")) pid = line.slice(1);
    else if (line.startsWith("n") && line.includes(`${lib.JUDGE_ROOT}/http-echo-`)) found.add(pid);
  }
  return found.size;
}

function selftest() {
  const home = mkdtempSync(join(tmpdir(), "seams-selftest-"));
  const env = { DUEDILIGENCE_HOME: home };
  const spec = join(home, "specs", "http-echo");
  const write = (path, text) => {
    mkdirSync(dirname(join(spec, path)), { recursive: true });
    writeFileSync(join(spec, path), text);
  };
  write("toolchain.json", `${JSON.stringify({ name: "exec", boundary: { service: { start: ["node", "src/server.js"], healthcheck: "/", readyTimeoutMs: 5000 } } })}\n`);
  write("spec.md", "# Echo\n\n```gherkin\nFeature: Echo\n  @happy\n  Scenario: Echo\n    Then POST /echo answers its body upper-cased, and any other path 404\n```\n");
  write("skeleton/src/server.ts", VARIANTS.stub.server);
  write("reference/src/server.ts", VARIANTS.reference.server);
  const test = (name, body) => `  test(${JSON.stringify(name)}, async () => {\n${body}\n  });`;
  const suite = (...tests) =>
    `import { test } from "node:test";\nimport assert from "node:assert/strict";\nconst at = (path: string) => new URL(path, process.env.BOUNDARY_URL);\n${tests.join("\n")}\n`;
  write("tests/public/echo.test.ts", suite(test("[happy-1] echoes abc", '    const res = await fetch(at("/echo"), { method: "POST", body: "abc" });\n    assert.equal(res.status, 200);\n    assert.equal(await res.text(), "ABC");')));
  write(
    "tests/private/echo.test.ts",
    suite(
      test("[happy-1] echoes a longer text", '    const res = await fetch(at("/echo"), { method: "POST", body: "hello world" });\n    assert.equal(await res.text(), "HELLO WORLD");'),
      test("[happy-1] another path is 404", '    const res = await fetch(at("/other"));\n    assert.equal(res.status, 404);'),
    ),
  );
  const checks = [];
  const check = (name, ok, detail = {}) => {
    checks.push({ name, ok, ...detail });
    log(`selftest: ${ok ? "ok  " : "WRONG"} ${name}`);
  };
  const calibrated = node("evidence/backends.mjs", ["calibrate", "http-echo", "--force"], env);
  const calibration = readJson(join(spec, "calibration.json"), {});
  check("scripted calibration keeps both hidden tests", calibrated.status === 0 && calibration.kept?.length === 2, { kept: calibration.kept?.length ?? 0 });

  const judged = (src, extra = []) => {
    const record = join(home, "judged.json");
    rmSync(record, { force: true });
    const started = Date.now();
    const run = node("bin/judge.mjs", [...extra, ...(extra.includes("--seal") ? [] : ["http-echo"]), src, "--json", record], env);
    return { status: run.status, seconds: Math.round((Date.now() - started) / 100) / 10, ...readJson(record, {}) };
  };
  for (const [name, variant] of Object.entries(VARIANTS)) {
    const src = join(home, "variants", name.replace(/\W+/g, "-"), "src");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "server.ts"), variant.server);
    const result = judged(src);
    const left = leftovers();
    check(`${name}: ${variant.expect}, no service left`, result.verdict === variant.expect && left === 0, {
      verdict: result.verdict ?? null,
      public: result.public,
      hidden: result.hidden,
      seconds: result.seconds,
      leftover: left,
    });
  }

  // The judge killed outright while the service is up.
  const slow = join(home, "variants", "slow", "src");
  mkdirSync(slow, { recursive: true });
  writeFileSync(join(slow, "server.ts"), FIXTURE_SERVER(ECHO.replace("res.end(body.toUpperCase());", "await new Promise((done: any) => setTimeout(done, 5000));\n    res.end(body.toUpperCase());")));
  const child = spawn(process.execPath, [join(PACKAGE, "bin", "judge.mjs"), "http-echo", slow], { cwd: PACKAGE, env: { ...process.env, ...env }, stdio: "ignore" });
  let up = 0;
  for (let i = 0; i < 120 && up === 0; i += 1) {
    spawnSync("sleep", ["0.25"]);
    up = leftovers();
  }
  child.kill("SIGKILL");
  spawnSync("sleep", ["2.5"]);
  const afterKill = leftovers();
  const stray = (spawnSync("pgrep", ["-f", "runners/boundary.mjs"], { encoding: "utf8" }).stdout ?? "").split("\n").filter(Boolean).length;
  check("judge SIGKILLed while the service is up: service and boundary gone", up > 0 && afterKill === 0 && stray === 0, { serviceWasUp: up > 0, leftover: afterKill, boundaryLeft: stray });

  // A seal carries the boundary; judged from it.
  const sealFile = join(home, "http-echo.seal.gz");
  node("bin/seal.mjs", ["http-echo", "--out", sealFile], env);
  const sealed = judged(join(spec, "reference", "src"), ["--seal", sealFile]);
  check("judge --seal on the reference: passed", sealed.verdict === "passed" && leftovers() === 0, { verdict: sealed.verdict ?? null });

  // The commitment covers the boundary, and the shell recipe agrees.
  const hash = () => spawnSync(process.execPath, ["--input-type=module", "-e", `import { hiddenSha256 } from ${JSON.stringify(pathToFileURL(join(PACKAGE, "bin", "commitment.mjs")).href)}; console.log(hiddenSha256(${JSON.stringify(spec)}));`], { encoding: "utf8", env: { ...process.env, ...env } }).stdout.trim();
  const before = hash();
  const recipe = spawnSync(
    "sh",
    ["-c", `(find tests/private -type f ! -name .DS_Store | LC_ALL=C sort | xargs shasum -a 256 && printf '%s  calibration.kept\\n' "$(jq -cj '.kept | sort' calibration.json | shasum -a 256 | cut -c1-64)" && printf '%s  toolchain.boundary\\n' "$(jq -cjS '.boundary' toolchain.json | shasum -a 256 | cut -c1-64)") | shasum -a 256 | cut -c1-64`],
    { cwd: spec, encoding: "utf8" },
  ).stdout.trim();
  const toolchain = readJson(join(spec, "toolchain.json"));
  writeJson(join(spec, "toolchain.json"), { ...toolchain, boundary: { service: { ...toolchain.boundary.service, healthcheck: "/other" } } });
  const changed = hash();
  writeJson(join(spec, "toolchain.json"), toolchain);
  check("hiddenSha256 equals the shell recipe and changes with the boundary", before === recipe && changed !== before && hash() === before, { hiddenSha256: before, recipe, changed });

  rmSync(home, { recursive: true, force: true });
  const wrong = checks.filter((item) => !item.ok).length;
  return { checks, wrong };
}

// --- sessions leave nothing running -------------------------------------------

/**
 * A fake `claude` CLI (CLAUDE_BIN) that leaves three processes behind and
 * exits: one in its own process group, one detached whose command line
 * names the workdir as Claude Code encodes it in its scratch folders (the
 * `scratchpad/ref.mjs` server a writer left for seven hours), one detached
 * with its working directory in the workdir. After `session()` returns,
 * `pgrep` must find none of them. No model.
 */
async function reapSelftest() {
  const dir = workdir("seams-reap");
  const scratch = join(tmpdir(), `seams-reap-${process.pid}`, dir.replace(/[^A-Za-z0-9]/g, "-"), "scratchpad");
  mkdirSync(scratch, { recursive: true });
  const marker = `seams-reap-${process.pid}`;
  writeFileSync(join(scratch, "ref.mjs"), `setInterval(() => {}, 1000); // ${marker}\n`);
  const fake = join(scratch, "..", "fake-claude.mjs");
  writeFileSync(
    fake,
    `#!${process.execPath}
import { spawn } from "node:child_process";
const keep = (argv, options) => spawn(process.execPath, argv, { stdio: "ignore", ...options }).unref();
keep(["-e", "setInterval(() => {}, 1000) // ${marker} group"], {});
keep([${JSON.stringify(join(scratch, "ref.mjs"))}], { detached: true, cwd: ${JSON.stringify(tmpdir())} });
keep(["-e", "setInterval(() => {}, 1000) // ${marker} cwd"], { detached: true, cwd: ${JSON.stringify(dir)} });
setTimeout(() => {
  console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "done", session_id: "fake", num_turns: 1 }));
}, 500);
`,
  );
  spawnSync("chmod", ["+x", fake]);
  const count = () => (spawnSync("pgrep", ["-f", marker], { encoding: "utf8" }).stdout ?? "").split("\n").filter(Boolean).length;
  // A concurrent session's CLI names every sibling workdir in its argv (deny rules): it must survive.
  const bystander = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)", "--", `--settings=${dir}/** bystander-${marker}`], { detached: true, stdio: "ignore" });
  bystander.unref();
  const previous = process.env.CLAUDE_BIN;
  process.env.CLAUDE_BIN = fake;
  let result;
  try {
    result = await lib.session({ cwd: dir, text: "x", transcript: join(scratch, "..", "t.jsonl"), kind: "generate" });
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_BIN;
    else process.env.CLAUDE_BIN = previous;
  }
  spawnSync("sleep", ["0.5"]);
  const bystanderAlive = (() => {
    try {
      process.kill(bystander.pid, 0);
      return true;
    } catch {
      return false;
    }
  })();
  try {
    process.kill(bystander.pid, "SIGKILL");
  } catch {}
  spawnSync("sleep", ["0.2"]);
  const left = count();
  spawnSync("pkill", ["-9", "-f", marker]);
  rmSync(join(tmpdir(), `seams-reap-${process.pid}`), { recursive: true, force: true });
  discard(dir);
  return {
    name: "a session's leftovers (its group, a scratch-path server, a process in its workdir) are gone after it ends; a concurrent session naming its workdir is not",
    ok: result.ok && left === 0 && bystanderAlive,
    leftover: left,
    bystanderAlive,
  };
}

// --- a repository spec at a service boundary --------------------------------

/**
 * fit --seam http, repo.mjs --seam http and judge --repo (from the spec and
 * from a seal) on a hand-made TypeScript package whose server gains a
 * route, in a scratch home: base is incomplete, the change passes, the
 * existing suite still runs, and no service is left. No model; npm once.
 */
function repoSelftest() {
  const home = mkdtempSync(join(tmpdir(), "seams-repo-"));
  const env = { DUEDILIGENCE_HOME: home };
  const repo = join(home, "fixture");
  const put = (path, text) => {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  };
  const git = (...argv) => spawnSync("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@localhost", ...argv], { cwd: repo, encoding: "utf8" });
  const SERVER = (route) => `import { createServer } from "node:http";
createServer(async (req: any, res: any) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (req.url === "/health") return void res.end("ok");
${route}  res.writeHead(404);
  res.end();
}).listen(Number(process.env.PORT), process.env.HOST ?? "127.0.0.1");
`;
  put("package.json", `${JSON.stringify({ name: "fixture-svc", private: true, type: "module", scripts: { build: "tsc -p tsconfig.json", test: "tsc -p tsconfig.test.json && node --test dist/test/" }, devDependencies: { typescript: "5.9.3" } }, null, 2)}\n`);
  put("tsconfig.json", `${JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", rootDir: ".", outDir: "dist", strict: false, skipLibCheck: true, types: [] }, include: ["src", "test"] }, null, 2)}\n`);
  put("tsconfig.test.json", `${JSON.stringify({ extends: "./tsconfig.json" }, null, 2)}\n`);
  put(".gitignore", "node_modules/\ndist/\n");
  put("src/ambient.d.ts", 'declare module "node:*";\ndeclare var process: any;\ndeclare function fetch(input: any, init?: any): Promise<any>;\ndeclare var URL: any;\n');
  put("src/util.ts", "export const upper = (text: string): string => text.toUpperCase();\n");
  put("src/server.ts", SERVER(""));
  put("test/util.test.ts", 'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { upper } from "../src/util.js";\ntest("upper", () => assert.equal(upper("a"), "A"));\n');
  const locked = spawnSync("npx", ["-y", "npm@10.9.2", "install", "--package-lock-only", "--no-audit", "--no-fund"], { cwd: repo, encoding: "utf8", env: lib.installEnv() });
  if (locked.status !== 0) throw new Error(`npm lock failed: ${locked.stderr}`);
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  const flags = ["--seam", "http", "--start", "node dist/src/server.js", "--healthcheck", "/health", "--boundary-build", "npx tsc -p tsconfig.json"];
  const checks = [];
  const check = (name, ok, detail = {}) => {
    checks.push({ name, ok, ...detail });
    log(`repo-selftest: ${ok ? "ok  " : "WRONG"} ${name}`);
  };
  const fit = node("bin/fit.mjs", ["--repo", repo, ...flags], env);
  const fitFacts = JSON.parse(fit.stdout.slice(fit.stdout.indexOf("{")));
  check("fit --seam http: supported, the service answered on base", fit.status === 0 && fitFacts.boundary?.ready === true, { boundary: fitFacts.boundary, existing: fitFacts.suite?.passed });
  const slug = "svc-upper";
  const repoRun = node("bin/repo.mjs", [slug, "--repo", repo, "--package", ".", "--allowed", "src/", ...flags], env);
  const spec = join(home, "specs", slug);
  const toolchain = readJson(join(spec, "toolchain.json"), {});
  const baseline = readJson(join(spec, "baseline.json"), {});
  check("repo.mjs --seam http: boundary recorded, no seam files, base is the stub", repoRun.status === 0 && toolchain.boundary?.service?.start === "node dist/src/server.js" && toolchain.seam?.length === 0 && baseline.stage === "stub", { hiddenDir: toolchain.hiddenDir });
  const suite = (...tests) => `import { test } from "node:test";\nimport assert from "node:assert/strict";\nconst at = (path: string) => new URL(path, process.env.BOUNDARY_URL);\n${tests.join("\n")}\n`;
  const post = (name, body, expect) => `test(${JSON.stringify(name)}, async () => {\n  const res = await fetch(at("/upper"), { method: "POST", body: ${JSON.stringify(body)} });\n  assert.equal(res.status, 200);\n  assert.equal(await res.text(), ${JSON.stringify(expect)});\n});`;
  writeFileSync(join(spec, "spec.md"), "# Upper\n\n```gherkin\nFeature: Upper\n  @happy\n  Scenario: POST /upper\n    Then it answers the body upper-cased\n```\n");
  mkdirSync(join(spec, "tests", "public"), { recursive: true });
  mkdirSync(join(spec, "tests", "private"), { recursive: true });
  writeFileSync(join(spec, "tests", "public", `${slug}.test.ts`), suite(post("[happy-1] upper-cases abc", "abc", "ABC")));
  writeFileSync(join(spec, "tests", "private", "upper.test.ts"), suite(post("[happy-1] upper-cases a sentence", "a b c", "A B C"), post("[happy-1] keeps digits", "a1", "A1")));
  const change = SERVER('  if (req.method === "POST" && req.url === "/upper") return void res.end(body.toUpperCase());\n');
  // The ids as this home's runners name them, from a child with the scratch home (this process's lib is evidence/seams').
  const listed = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "repo-ids", slug], { cwd: PACKAGE, encoding: "utf8", env: { ...process.env, ...env, SEAMS_CHANGE: change } });
  const { publicIds, kept } = JSON.parse(listed.stdout.trim().split("\n").at(-1) || "{}");
  writeFileSync(join(spec, "calibration.json"), `${JSON.stringify({ slug, status: "ok", publicIds, kept, hiddenWritten: kept?.length ?? 0, dropped: [] }, null, 2)}\n`);
  check("the suites list 1 public and 2 hidden tests on the change", publicIds?.length === 1 && kept?.length === 2, { publicIds, kept });
  git("checkout", "-q", "-b", "change");
  put("src/server.ts", change);
  git("commit", "-q", "-am", "POST /upper");
  const judgeAt = (ref, extra = []) => {
    const record = join(home, "judged.json");
    rmSync(record, { force: true });
    const run = node("bin/judge.mjs", [...extra, ...(extra.includes("--seal") ? [] : [slug]), "--repo", repo, "--ref", ref, "--json", record], env);
    return { status: run.status, ...readJson(record, {}) };
  };
  const onBase = judgeAt("main");
  check("judge --repo at base: incomplete, no service left", onBase.verdict === "incomplete" && repoLeftovers(slug) === 0, { verdict: onBase.verdict, public: onBase.public, hidden: onBase.hidden });
  const onChange = judgeAt("change");
  check("judge --repo at the change: passed, existing suite kept, no service left", onChange.verdict === "passed" && onChange.existing?.passed === onChange.existing?.total && repoLeftovers(slug) === 0, { verdict: onChange.verdict, public: onChange.public, hidden: onChange.hidden, existing: onChange.existing });
  const sealFile = join(home, `${slug}.seal.gz`);
  node("bin/seal.mjs", [slug, "--out", sealFile], env);
  const sealed = judgeAt("change", ["--seal", sealFile]);
  check("judge --seal --repo at the change: passed", sealed.verdict === "passed" && repoLeftovers(slug) === 0, { verdict: sealed.verdict });
  rmSync(home, { recursive: true, force: true });
  return { checks, wrong: checks.filter((item) => !item.ok).length };
}
/** Processes still running in a judge tree of a slug, by working directory. */
function repoLeftovers(slug) {
  const listed = spawnSync("lsof", ["-d", "cwd", "-Fpn"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).stdout ?? "";
  const found = new Set();
  let pid = null;
  for (const line of listed.split("\n")) {
    if (line.startsWith("p")) pid = line.slice(1);
    else if (line.startsWith("n") && line.includes(`${lib.JUDGE_ROOT}/${slug}-`)) found.add(pid);
  }
  return found.size;
}
/** Child of repoSelftest, in its scratch home: the test ids of both suites on the change. */
function repoIds(slug) {
  const dir = stage(workdir("seams-repo-ids"), slug, { skeleton: true, publicTests: true, hiddenTests: true });
  const chain = lib.toolchainOf(slug);
  try {
    writeFileSync(join(dir, "src", "server.ts"), process.env.SEAMS_CHANGE);
    const ids = (name) => testsOf(lib.runSuite(dir, name, chain)).map((test) => test.id);
    console.log(JSON.stringify({ publicIds: ids("public"), kept: ids("private") }));
  } finally {
    discard(dir);
  }
}

// --- patch-apply at a command ---------------------------------------------

function importBoth() {
  for (const argv of [["patch-apply"], ["patch-apply", "--seam", "exec"]]) {
    const run = node("bin/import-archive.mjs", [...argv, "--force", "--archive", ARCHIVE]);
    process.stdout.write(run.stdout);
    process.stderr.write(run.stderr);
    if (run.status !== 0) process.exit(1);
  }
}

function calibrateBoth() {
  const archive = readJson(join(ARCHIVE, "specs", "patch-apply", "calibration.json"));
  const out = {};
  for (const slug of ["patch-apply", "patch-apply-cli"]) {
    const run = node("evidence/backends.mjs", ["calibrate", slug, "--force"]);
    if (run.status !== 0) throw new Error(`${slug}: calibration failed\n${run.stderr}`);
    const record = readJson(join(specDir(slug), "calibration.json"));
    out[slug] = {
      written: record.hiddenWritten,
      kept: record.kept.length,
      sameKeptAsArchive: JSON.stringify([...record.kept].sort()) === JSON.stringify([...archive.kept].sort()),
      public: record.publicIds.length,
      referencePublic: record.reference.public,
      referenceHidden: record.reference.hidden,
      dropped: record.dropped.length,
    };
    log(`${slug}: kept ${record.kept.length}/${record.hiddenWritten}, the archive's kept list ${out[slug].sameKeptAsArchive ? "exactly" : "NOT"}`);
  }
  save("calibration", { archive: { kept: archive.kept.length, public: archive.publicIds.length }, ...out });
}

/** The reference's command, built once in a staged tree: `node src/cli.js` there. */
function buildReference() {
  const dir = stage(workdir("seams-oracle"), "patch-apply-cli", { spec: false, src: join(specDir("patch-apply-cli"), "reference", "src") });
  const built = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], { cwd: dir, encoding: "utf8" });
  if (built.status !== 0) throw new Error(`the reference does not build:\n${built.stdout}${built.stderr}`);
  return dir;
}

/** One case through the command: what git-oracle.mjs records for git, or how it failed. */
function runCase(dir, item) {
  return new Promise((done) => {
    const child = spawn(process.execPath, ["--max-old-space-size=512", "src/cli.js", "applyPatch"], { cwd: dir, stdio: ["pipe", "pipe", "pipe"] });
    const out = [];
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify([item.files, item.diff]));
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (signal) return done({ id: item.id, timeout: true });
      if (code === 1) return done({ id: item.id, threw: err.slice(0, 120) });
      try {
        const result = JSON.parse(Buffer.concat(out).toString("utf8"));
        done(result && typeof result === "object" && result.files ? { id: item.id, ok: result.ok === true, hash: hashFiles(result.files) } : { id: item.id, bad: true });
      } catch {
        done({ id: item.id, bad: true, exit: code });
      }
    });
  });
}

async function oracle() {
  const limit = Number(options.concurrency ?? 4);
  const dir = buildReference();
  const target = join(OUT, "oracle", "reference-cli.jsonl");
  mkdirSync(dirname(target), { recursive: true });
  const kinds = new Map();
  const results = [];
  const started = Date.now();
  const running = new Set();
  try {
    for await (const line of createInterface({ input: createReadStream(join(ORACLE, "cases.jsonl")) })) {
      if (!line) continue;
      const item = JSON.parse(line);
      kinds.set(item.id, item.kind);
      while (running.size >= limit) await Promise.race(running);
      const job = runCase(dir, item).then((result) => {
        results.push(result);
        running.delete(job);
        if (results.length % 1000 === 0) log(`oracle: ${results.length} cases`);
      });
      running.add(job);
    }
    await Promise.all(running);
  } finally {
    discard(dir);
  }
  results.sort((a, b) => a.id - b.id);
  writeFileSync(target, results.map((result) => JSON.stringify(result)).join("\n") + "\n");
  save("oracle", { ...compareOracle(results, kinds), minutes: Math.round((Date.now() - started) / 6000) / 10, concurrency: limit, file: "evidence/seams/oracle/reference-cli.jsonl" });
  log(JSON.stringify(summary.oracle));
}

/** compare.mjs's measure over a command's results: agreement with git on the judged set and on every case. */
function compareOracle(results, kinds) {
  const git = new Map(lines(join(ORACLE, "git.jsonl")).map((item) => [item.id, item]));
  const flags = new Map(lines(join(ORACLE, "flags.jsonl")).map((item) => [item.id, item]));
  const moduleSeam = new Map(lines(join(ORACLE, "results", "reference.jsonl")).map((item) => [item.id, item]));
  const same = (a, b) => a && b && a.ok === b.ok && a.hash === b.hash && !a.threw && !a.timeout && !a.bad;
  const byId = new Map(results.map((item) => [item.id, item]));
  const what = (x) => (x.timeout ? "timeout" : x.threw ? "threw" : x.bad ? "bad" : x.ok ? "ok" : "rej");
  const tally = (judged) => {
    let agreed = 0;
    const off = {};
    for (const id of judged) {
      const mine = byId.get(id);
      const theirs = git.get(id);
      if (same(mine, theirs)) agreed += 1;
      else {
        const key = `${kinds.get(id)} git:${theirs.ok ? "ok" : "rej"} command:${mine ? what(mine) : "missing"}${mine && mine.ok === theirs.ok && !mine.threw ? " (files differ)" : ""}`;
        off[key] = (off[key] ?? 0) + 1;
      }
    }
    return { agreed, of: judged.length, disagreements: off };
  };
  const all = [...git.keys()];
  const judged = all.filter((id) => !flags.get(id).outside && flags.get(id).unique);
  const sameAsModule = all.filter((id) => {
    const a = byId.get(id);
    const b = moduleSeam.get(id);
    return a && b && a.ok === b.ok && a.hash === b.hash && Boolean(a.threw) === Boolean(b.threw) && !a.timeout && !b.timeout;
  }).length;
  return {
    cases: results.length,
    judgedSet: tally(judged),
    allCases: tally(all),
    sameAsModuleSeam: { same: sameAsModule, of: all.length },
    archive: "FINDINGS.md \"A git oracle on patch-apply\": the reference agrees with git on all 7,533 judged cases; the 53 others it disagrees on are a hunk matching at several places (compare.mjs --strict --ref: agreed 7533; without --strict 8789 of 8842)",
  };
}

/** Every stored patch-apply submission in the archive: its folder and its name. */
function archiveSubmissions() {
  const runs = join(ARCHIVE, "runs", "patch-apply");
  const out = [];
  for (const variant of readdirSync(runs).sort())
    for (const run of existsSync(join(runs, variant)) ? readdirSync(join(runs, variant)).sort((a, b) => Number(a) - Number(b)) : [])
      if (existsSync(join(runs, variant, run, "submission", "src", "index.ts"))) out.push({ variant, run, src: join(runs, variant, run, "submission", "src") });
  return out;
}

/** A judged pair's counts and verdict against the spec's calibration. */
function scored(slug, judged) {
  const calibration = readJson(join(specDir(slug), "calibration.json"));
  const publicCount = count(judged.public, calibration.publicIds);
  const hiddenCount = count(judged.hidden, calibration.kept);
  const ok = new Set(testsOf(judged.hidden).filter((test) => test.ok).map((test) => test.id));
  return {
    verdict: verdict({ publicCount, hiddenCount }),
    public: publicCount,
    hidden: hiddenCount,
    failingHidden: calibration.kept.filter((id) => !ok.has(id)).sort(),
  };
}

async function submissions() {
  const ledger = join(OUT, "submissions.jsonl");
  const done = new Set(existsSync(ledger) ? lines(ledger).map((row) => `${row.variant}/${row.run}`) : []);
  const todo = archiveSubmissions().filter((item) => !done.has(`${item.variant}/${item.run}`));
  const dispatcher = join(specDir("patch-apply-cli"), "reference", "src", "cli.ts");
  log(`submissions: ${todo.length} to judge at both seams (${done.size} done)`);
  await pool(todo, Number(options.concurrency ?? 2), async (item) => {
    while (lib.freeMemoryPercent() < 40) await new Promise((wait) => setTimeout(wait, 5_000));
    const moduleSeam = scored("patch-apply", judge("patch-apply", item.src));
    const src = join(workdir("seams-submission"), "src");
    copy(item.src, src);
    copy(dispatcher, join(src, "cli.ts"));
    let commandSeam;
    try {
      commandSeam = scored("patch-apply-cli", judge("patch-apply-cli", src));
    } finally {
      discard(dirname(src));
    }
    const row = {
      variant: item.variant,
      run: item.run,
      module: moduleSeam,
      command: commandSeam,
      sameVerdict: moduleSeam.verdict === commandSeam.verdict,
      sameFailingHidden: JSON.stringify(moduleSeam.failingHidden) === JSON.stringify(commandSeam.failingHidden),
      samePublic: moduleSeam.public.passed === commandSeam.public.passed,
    };
    appendFileSync(ledger, `${JSON.stringify(row)}\n`);
    log(`${item.variant}/${item.run}: module ${moduleSeam.verdict}, command ${commandSeam.verdict}${row.sameVerdict && row.sameFailingHidden ? "" : "  DIFFERENT"}`);
  });
}

/** The ledger summed, and the runs each seam's hidden suite passes set against git (archive results/<variant>/<run>.jsonl). */
function report() {
  const ledger = join(OUT, "submissions.jsonl");
  if (existsSync(ledger)) {
    const rows = lines(ledger);
    const verdicts = (seam) => rows.reduce((acc, row) => ((acc[row[seam].verdict] = (acc[row[seam].verdict] ?? 0) + 1), acc), {});
    // Disagreements with git on the judged set where the module reference agrees, as compare.mjs --strict counts them.
    const git = new Map(lines(join(ORACLE, "git.jsonl")).map((item) => [item.id, item]));
    const flags = new Map(lines(join(ORACLE, "flags.jsonl")).map((item) => [item.id, item]));
    const reference = new Map(lines(join(ORACLE, "results", "reference.jsonl")).map((item) => [item.id, item]));
    const same = (a, b) => a && b && a.ok === b.ok && a.hash === b.hash && !a.threw && !a.timeout;
    const agreed = [...git.keys()].filter((id) => !flags.get(id).outside && flags.get(id).unique && same(reference.get(id), git.get(id)));
    const withOracle = rows
      .map((row) => {
        const path = join(ORACLE, "results", row.variant, `${row.run}.jsonl`);
        if (!existsSync(path)) return null;
        const sub = new Map(lines(path).map((item) => [item.id, item]));
        return { ...row, disagree: agreed.filter((id) => !same(sub.get(id), git.get(id))).length };
      })
      .filter(Boolean);
    const passedButDisagree = (seam) =>
      withOracle.filter((row) => row[seam].verdict === "passed" && row.disagree > 0).map((row) => `${row.variant}/${row.run} (${row.disagree})`);
    save("submissions", {
      runs: rows.length,
      sameVerdict: rows.filter((row) => row.sameVerdict).length,
      sameFailingHidden: rows.filter((row) => row.sameFailingHidden).length,
      samePublic: rows.filter((row) => row.samePublic).length,
      different: rows.filter((row) => !row.sameVerdict || !row.sameFailingHidden || !row.samePublic).map((row) => `${row.variant}/${row.run}`),
      module: verdicts("module"),
      command: verdicts("command"),
      withGitOracle: {
        runs: withOracle.length,
        judgedSet: agreed.length,
        passedHidden: { module: withOracle.filter((row) => row.module.verdict === "passed").length, command: withOracle.filter((row) => row.command.verdict === "passed").length },
        passedButDisagreeWithGit: { module: passedButDisagree("module"), command: passedButDisagree("command") },
      },
    });
  }
  log(JSON.stringify(summary, null, 2));
}

/**
 * The HTTP spec, once prepared and run (evidence/seams/queue.sh): its
 * preparation, the stub (the skeleton, 501 everywhere) judged, and every
 * graded blind run of it in this home.
 */
function http(slug = "csv-export-http") {
  const dir = specDir(slug);
  const calibration = readJson(join(dir, "calibration.json"), null);
  if (calibration?.status !== "ok") throw new Error(`${slug}: not calibrated yet; run sh evidence/seams/queue.sh`);
  const generation = readJson(join(dir, "generation.json"), {});
  const stub = judge(slug, join(dir, "skeleton", "src"));
  const scoredStub = scored(slug, stub);
  const runs = existsSync(lib.RESULTS) ? lines(lib.RESULTS).filter((row) => row.spec === slug) : [];
  const cost = ["skeleton", "public", "private"].reduce((sum, step) => sum + (generation[step]?.costUsd ?? 0), 0) + (calibration.reference?.costUsd ?? 0);
  save("http", {
    slug,
    prepare: { public: calibration.publicIds.length, hiddenWritten: calibration.hiddenWritten, kept: calibration.kept.length, reference: calibration.reference?.public && { public: calibration.reference.public, hidden: calibration.reference.hidden }, costUsd: Math.round(cost * 100) / 100 },
    stub: { verdict: scoredStub.verdict, public: scoredStub.public, hidden: scoredStub.hidden },
    runs: runs.map((row) => ({ variant: row.variant, run: row.run, verdict: row.verdict, public: row.public, hidden: row.hidden, costUsd: row.agent?.costUsd ?? row.costUsd ?? null, refused: row.refused })),
  });
  log(JSON.stringify(summary.http));
}

if (command === "selftest") {
  const result = selftest();
  const reaped = await reapSelftest();
  log(`selftest: ${reaped.ok ? "ok  " : "WRONG"} ${reaped.name}`);
  result.checks.push(reaped);
  result.wrong += reaped.ok ? 0 : 1;
  save("selftest", result);
  if (typeof options.json === "string") writeJson(options.json, result);
  log(result.wrong === 0 ? "selftest: every check as expected" : `selftest: ${result.wrong} check(s) wrong`);
  process.exit(result.wrong === 0 ? 0 : 1);
} else if (command === "repo-selftest") {
  const result = repoSelftest();
  save("repoSelftest", result);
  log(result.wrong === 0 ? "repo-selftest: every check as expected" : `repo-selftest: ${result.wrong} check(s) wrong`);
  process.exit(result.wrong === 0 ? 0 : 1);
} else if (command === "repo-ids") repoIds(rest[1]);
else if (command === "import") importBoth();
else if (command === "calibrate") calibrateBoth();
else if (command === "oracle") await oracle();
else if (command === "submissions") await submissions();
else if (command === "report") report();
else if (command === "http") http(rest[1]);
else {
  console.error("usage: node evidence/seams.mjs selftest | repo-selftest | import | calibrate | oracle [--concurrency n] | submissions [--concurrency n] | http | report");
  process.exit(1);
}
