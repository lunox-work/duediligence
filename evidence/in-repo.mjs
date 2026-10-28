#!/usr/bin/env node
// The evidence arm for repository targets (RESULTS.md, "In an existing
// repository"). Each case in evidence/in-repo/cases.json is one historical
// commit of a repository and the package files it changed: base is the
// parent commit, the ticket is the commit message, quoted, and the spec is
// drafted from it at base by a blind session that never sees the diff.
// Its specs live in evidence/in-repo/specs/ (DUEDILIGENCE_SPECS), its
// graded runs in evidence/in-repo/results.jsonl, and every step's record in
// evidence/in-repo.jsonl, one line per case and step, newest wins.
//
//   node evidence/in-repo.mjs check [slug...]    no model: the real commit at base builds and keeps the suite
//   node evidence/in-repo.mjs prepare [slug...]  per arm: repo.mjs, the spec, prepare.mjs --accept-open
//   node evidence/in-repo.mjs commit [slug...]   the real commit against each arm's suites
//   node evidence/in-repo.mjs run [slug...]      Haiku on the confirmed specs, with the public suite and without, 5 runs each;
//                                                 --backend codex-cli: that agent, with the public suite, 5 runs each
//   node evidence/in-repo.mjs ticket [slug...]   print the ticket the drafter is given
//   node evidence/in-repo.mjs report             the tables RESULTS.md quotes
//   node evidence/in-repo.mjs discover --repo <path|url> [--package <dir>] [--limit 40]
//                                                 no model: candidate commits (below)
//   node evidence/in-repo.mjs add <commit> --slug <slug> --repo <path|url> [--package <dir>] [--seam a,b] [--allowed a,b]
//                                                 a case into the cases file, its message read from git
//
// --arm drafted|confirmed narrows prepare and commit to one arm (`ARMS`).
//
// Any repository: --cases <dir>/cases.json names another case set (default
// evidence/in-repo/cases.json, the sandbox-factory cases). Its specs go to
// <dir>/specs/, its graded runs to <dir>/results.jsonl, its step records to
// <dir>/ledger.jsonl. A case's `repo` is a path (relative to this package)
// or a git URL, cloned once into <dir>/checkout/<name>/. `discover` lists
// the commits a case can come from, as evidence/in-repo/cases.json's were
// chosen: one package, a feat/fix/perf subject, source files changed
// outside tests, a test file changed or added that imports one of them (or
// the package's src/index), and no harness change (package.json, lockfiles,
// configs); `check` then decides, with the build and the suite.
//
// What the drafter is given: the commit's message as written (subject, and
// the paragraphs of its body about this change), and the declarations the
// commit adds or changes in the seam, without bodies or comments: the
// interface a ticket would name. No person confirms these specs; `ARMS`
// says who stands in for one.
//
// The real commit is judged by its changes inside the case's allowed paths
// (`allowed`, or the seam files' folders), the scope an agent gets: its
// other code changes, often in step with other packages, are left out. The
// tests it added are its own tests, and an existing test it edited is left
// out of the regression count.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// The case set: --cases <dir>/cases.json, read before lib.mjs fixes its folders.
const CASES_ARG = (() => {
  const at = process.argv.indexOf("--cases");
  return at === -1 ? null : resolve(process.argv[at + 1]);
})();
const SET = CASES_ARG === null ? join(HERE, "in-repo") : dirname(CASES_ARG);
// Runs stay in this checkout's runs/, beside the evidence they back.
process.env.DUEDILIGENCE_HOME ??= join(HERE, "..");
process.env.DUEDILIGENCE_SPECS ??= join(SET, "specs");
process.env.DUEDILIGENCE_RESULTS ??= join(SET, "results.jsonl");
const { detect } = await import("../bin/fit.mjs");
const lib = await import("../bin/lib.mjs");
const {
  HARNESS_FILES,
  ROOT,
  RESULTS,
  RUNS,
  TEMPLATE,
  args,
  baselineOf,
  session: runSession,
  copy,
  count,
  discard,
  judge,
  log,
  pool,
  prompt,
  readJson,
  regressionsOf,
  repoChain,
  runSuite,
  scenarioOf,
  scopeOf,
  specDir,
  stage,
  testsOf,
  toolchainOf,
  workdir,
  writeJson,
  prepareBase,
} = lib;

const CASES = CASES_ARG ?? join(SET, "cases.json");
const LEDGER = CASES_ARG === null ? join(HERE, "in-repo.jsonl") : join(SET, "ledger.jsonl");
const RUNS_PER_ARM = 5;
const MODEL = "claude-haiku-5-5";

/** A git URL (or owner/name on GitHub) cloned once into SET/checkout/<name>/, with its whole history; a path as it is. */
function checkoutOf(repo) {
  const url = /^(https?:|git@|ssh:)/.test(repo) ? repo : /^\w[\w.-]*\/[\w.-]+$/.test(repo) && !existsSync(resolve(ROOT, repo)) ? `https://github.com/${repo}.git` : null;
  if (url === null) return resolve(ROOT, repo);
  const dir = join(SET, "checkout", basename(url).replace(/\.git$/, ""));
  if (!existsSync(join(dir, ".git"))) {
    mkdirSync(dirname(dir), { recursive: true });
    const cloned = spawnSync("git", ["clone", "-q", url, dir], { encoding: "utf8" });
    if (cloned.status !== 0) throw new Error(`git clone ${url} failed:\n${cloned.stderr}`);
  }
  return dir;
}
const cases = readJson(CASES, []).map((item) => ({ ...item, source: item.repo, repo: checkoutOf(item.repo) }));
const git = (repo, ...argv) => spawnSync("git", ["-C", repo, ...argv], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const show = (repo, ref, path) => {
  const out = spawnSync("git", ["-C", repo, "show", `${ref}:${path}`], { maxBuffer: 256 * 1024 * 1024 });
  return out.status === 0 ? out.stdout : null;
};

/** Appends one record to the ledger. */
function record(slug, step, fields) {
  const line = { slug, step, ...fields, at: new Date().toISOString() };
  writeFileSync(LEDGER, `${JSON.stringify(line)}\n`, { flag: "a" });
  return line;
}
/** The newest ledger record of each slug and step. */
function ledger() {
  const out = new Map();
  if (!existsSync(LEDGER)) return out;
  for (const line of readFileSync(LEDGER, "utf8").split("\n").filter(Boolean)) {
    const item = JSON.parse(line);
    out.set(`${item.slug}/${item.step}`, item);
  }
  return out;
}

/** The case's allowed paths: `allowed`, or the seam files' folders. */
const allowedOf = (item) => item.allowed ?? [...new Set(item.seam.map((path) => `${dirname(path)}/`))];
const within = (path, allowed) => allowed.some((entry) => (entry.endsWith("/") ? path.startsWith(entry) : path === entry));

/**
 * What the commit changed inside the package, split: `code` (the files a
 * submission would hold: changes in the case's allowed paths), `elsewhere`
 * (its other code changes, which the real commit is judged without),
 * `tests` (its test files: added are its own tests, changed or removed are
 * existing tests it edited) and `harness` (package.json, lockfiles,
 * configs).
 */
function commitChanges(item, chain) {
  const parent = `${item.commit}^`;
  const listed = git(item.repo, "diff", "--name-status", "--no-renames", parent, item.commit, "--", `${item.package}/`);
  const out = { code: [], elsewhere: [], tests: [], harness: [] };
  for (const line of listed.stdout.split("\n").filter(Boolean)) {
    const [status, path] = line.split("\t");
    const change = status === "A" ? "added" : status === "D" ? "removed" : "changed";
    const entry = { path, change };
    if (chain.isTest(path) || path.startsWith(`${chain.testDir}/`)) out.tests.push(entry);
    else if (HARNESS_FILES.test(basename(path))) out.harness.push(entry);
    else if (within(path, allowedOf(item))) out.code.push(entry);
    else out.elsewhere.push(entry);
  }
  return out;
}
/** Writes `body` at `path` under `dir`. */
function writeAt(dir, path, body) {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), body);
}

// ---- check: no model ------------------------------------------------------

/**
 * Whether the real commit can be judged at all: detect the package at the
 * parent, stage it, run the existing suite, lay the commit's code changes
 * over it, build and run the suite again. A case is usable when both build
 * and no test passing on base fails on the commit, other than in test files
 * the commit edited.
 */
function check(item) {
  const found = detect({ repo: item.repo, pkg: item.package, ref: `${item.commit}^` });
  if (!found.supported) return { usable: false, reason: `unsupported: ${found.reason}` };
  prepareBase(found.config);
  const chain = repoChain(found.config, null);
  const changes = commitChanges(item, chain);
  const missingSeam = item.seam.filter((path) => !changes.code.some((entry) => entry.path === path));
  if (missingSeam.length > 0) return { usable: false, reason: `the commit does not change ${missingSeam.join(", ")}` };
  const onBase = runIn(chain, () => {});
  const onCommit = runIn(chain, (dir) => {
    for (const entry of changes.code) {
      if (entry.change === "removed") rmSync(join(dir, entry.path), { force: true });
      else writeAt(dir, entry.path, show(item.repo, item.commit, entry.path));
    }
  });
  const edited = new Set(changes.tests.filter((entry) => entry.change !== "added").map((entry) => entry.path));
  const inEdited = (id) => [...edited].some((path) => id.startsWith(`${relative(chain.package, path)} ::`) || id.startsWith(`${path} ::`));
  const base = baselineOf(onBase.result, "base");
  const lost = regressionsOf(base, onCommit.result);
  const regressions = lost.filter((id) => !inEdited(id));
  const reason = !onBase.result.compiled
    ? "base does not build"
    : !onCommit.result.compiled
      ? `the commit's package changes alone do not build: ${onCommit.result.compileOutput.split("\n")[0]}`
      : regressions.length > 0
        ? `${regressions.length} existing test(s) fail on the commit's package changes alone`
        : changes.harness.length > 0
          ? `the commit changes harness: ${changes.harness.map((entry) => entry.path).join(", ")}`
          : null;
  return {
    usable: reason === null,
    reason,
    config: found.config,
    code: changes.code,
    elsewhere: changes.elsewhere,
    tests: changes.tests,
    harness: changes.harness,
    existingOnBase: { passing: base.passing.length, failing: base.failing.length },
    editedTestsLost: lost.length - regressions.length,
    regressions: regressions.slice(0, 20),
  };
}
function runIn(chain, overlay) {
  const dir = stage(workdir("in-repo-check"), null, { chain, spec: false });
  try {
    overlay(dir);
    return { result: runSuite(dir, "existing", chain) };
  } finally {
    discard(dir);
  }
}

// ---- prepare --------------------------------------------------------------

/**
 * The declarations the commit adds or changes in a seam file, as a ticket
 * would name them: functions and methods without bodies, types,
 * interfaces and enums whole, constants with a literal value whole and the
 * rest by name and declared type. No comments.
 */
function interfaceOf(item, path) {
  const ts = createRequire(join(TEMPLATE, "package.json"))("typescript");
  const { factory } = ts;
  const printer = ts.createPrinter({ removeComments: true });
  const declarations = (text) => {
    if (text === null) return new Map();
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const print = (node) => printer.printNode(ts.EmitHint.Unspecified, node, source);
    const exported = (node) => node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    const literal = (expr) =>
      expr !== undefined &&
      (ts.isLiteralExpression(expr) ||
        [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(expr.kind) ||
        (ts.isPrefixUnaryExpression(expr) && ts.isNumericLiteral(expr.operand)) ||
        (ts.isAsExpression(expr) && literal(expr.expression)) ||
        (ts.isArrayLiteralExpression(expr) && expr.elements.every(literal)));
    /** A class member without its body, or its initializer unless that is a literal. */
    const bare = (member) => {
      if (ts.isMethodDeclaration(member))
        return factory.updateMethodDeclaration(member, member.modifiers, member.asteriskToken, member.name, member.questionToken, member.typeParameters, member.parameters, member.type, undefined);
      if (ts.isConstructorDeclaration(member)) return factory.updateConstructorDeclaration(member, member.modifiers, member.parameters, undefined);
      if (ts.isGetAccessorDeclaration(member))
        return factory.updateGetAccessorDeclaration(member, member.modifiers, member.name, member.parameters, member.type, undefined);
      if (ts.isSetAccessorDeclaration(member)) return factory.updateSetAccessorDeclaration(member, member.modifiers, member.name, member.parameters, undefined);
      if (ts.isPropertyDeclaration(member) && !literal(member.initializer))
        return factory.updatePropertyDeclaration(member, member.modifiers, member.name, member.questionToken ?? member.exclamationToken, member.type, undefined);
      return member;
    };
    const out = new Map();
    for (const node of source.statements) {
      if (!exported(node)) continue;
      if (ts.isFunctionDeclaration(node))
        out.set(node.name.text, print(factory.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, undefined)));
      else if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) out.set(node.name.text, print(node));
      else if (ts.isClassDeclaration(node))
        out.set(node.name.text, print(factory.updateClassDeclaration(node, node.modifiers, node.name, node.typeParameters, node.heritageClauses, node.members.map(bare))));
      else if (ts.isVariableStatement(node))
        for (const decl of node.declarationList.declarations) {
          const name = decl.name.getText(source);
          const init = decl.initializer;
          const kind = node.declarationList.flags & ts.NodeFlags.Const ? "const" : "let";
          if (init !== undefined && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
            const signature = factory.createFunctionTypeNode(init.typeParameters, init.parameters, init.type ?? factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword));
            out.set(name, `export ${kind} ${name}: ${print(signature)};`);
          } else if (literal(init)) out.set(name, `export ${kind} ${name}${decl.type ? `: ${print(decl.type)}` : ""} = ${print(init)};`);
          else out.set(name, `export ${kind} ${name}${decl.type ? `: ${print(decl.type)}` : ""} = …;`);
        }
    }
    return out;
  };
  const before = declarations(show(item.repo, `${item.commit}^`, path)?.toString("utf8") ?? null);
  const after = declarations(show(item.repo, item.commit, path).toString("utf8"));
  return [...after].filter(([name, text]) => before.get(name) !== text).map(([, text]) => text);
}

function ticketOf(item) {
  const sections = item.seam.map((path) => {
    const lines = interfaceOf(item, path);
    return lines.length === 0 ? null : `In \`${path}\`:\n\n\`\`\`ts\n${lines.join("\n\n")}\n\`\`\``;
  });
  return [
    `# ${item.subject}`,
    "",
    item.message.trim(),
    "",
    "## Interface",
    "",
    ...(sections.some(Boolean)
      ? ["The change adds or changes these exports (`…` is a value the ticket does not give):", "", ...sections.filter(Boolean).flatMap((section) => [section, ""])]
      : ["The change keeps the exports' names and signatures.", ""]),
  ].join("\n");
}

/** A bin script, without blocking the other cases: its exit status and output. */
const node = (script, argv) =>
  new Promise((done) => {
    const child = spawn(process.execPath, [join(ROOT, "bin", script), ...argv], { cwd: ROOT, env: process.env });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (status) => done({ status, output }));
  });

/**
 * Each arm's spec, its slug and who confirms it. `drafted` is the spec as
 * the blind drafter wrote it. `confirmed` is that spec after a session
 * playing the commit's developer, who sees the real diff of the allowed
 * paths, answers its decisions the way the code does
 * (evidence/in-repo/developer.md): the person's confirmation in step 2 of
 * the skill, made by the one person who knows what the code was meant to do.
 */
const ARMS = {
  drafted: { slug: (item) => item.slug, by: "in-repo evidence arm: drafted, no person" },
  confirmed: { slug: (item) => `${item.slug}-confirmed`, by: "in-repo evidence arm: the commit's developer, simulated" },
};

async function prepare(item, arm) {
  const slug = ARMS[arm].slug(item);
  const dir = specDir(slug);
  if (readJson(join(dir, "calibration.json"), null)?.status === "ok") return { skipped: "calibrated already" };
  if (arm === "confirmed" && !existsSync(join(specDir(item.slug), "spec.md"))) return { skipped: "no drafted spec yet" };
  if (!existsSync(join(dir, "toolchain.json"))) {
    const argv = [slug, "--repo", item.repo, "--base", `${item.commit}^`, "--package", item.package, "--seam", item.seam.join(",")];
    argv.push("--allowed", allowedOf(item).join(","));
    const out = await node("repo.mjs", argv);
    if (out.status !== 0) return { failed: "repo.mjs", output: out.output.slice(-3000) };
    const config = readJson(join(dir, "toolchain.json"));
    writeJson(join(dir, "toolchain.json"), { ...config, repo: relative(ROOT, config.repo) });
  }
  const chain = toolchainOf(slug);
  writeFileSync(join(dir, "ticket.md"), ticketOf(item));
  if (!existsSync(join(dir, "spec.md"))) {
    const work = stage(workdir(`${slug}-spec`), slug, { spec: false });
    copy(join(dir, "ticket.md"), join(work, "ticket.md"));
    let text = prompt("spec-from-ticket", chain);
    if (arm === "confirmed") {
      copy(join(specDir(item.slug), "spec.md"), join(work, "spec.md"));
      const parent = `${item.commit}^`;
      writeFileSync(join(work, "change.diff"), git(item.repo, "diff", parent, item.commit, "--", ...allowedOf(item)).stdout);
      text = readFileSync(join(HERE, "in-repo", "developer.md"), "utf8");
    }
    const transcript = join(RUNS, slug, "spec", `${arm}.jsonl`);
    log(slug, arm === "drafted" ? "drafting spec.md" : "the developer confirms spec.md");
    const session = await runSession({ cwd: work, text, transcript, kind: "generate", chain });
    const record = { arm, costUsd: session.costUsd, minutes: Math.round(session.durationMs / 6000) / 10, ok: session.ok, summary: session.finalText.trim().slice(-3000) };
    const written = existsSync(join(work, "spec.md")) ? readFileSync(join(work, "spec.md"), "utf8") : null;
    discard(work);
    if (written === null) return { failed: "spec", ...record };
    writeFileSync(join(dir, "spec.md"), written);
    writeJson(join(RUNS, slug, "spec", "spec.json"), record);
  }
  await node("confirm.mjs", [slug, "--by", ARMS[arm].by]);
  const prepared = await node("prepare.mjs", [slug, "--accept-open"]);
  const calibration = readJson(join(dir, "calibration.json"), null);
  const generation = readJson(join(dir, "generation.json"), {});
  const cost =
    (readJson(join(RUNS, slug, "spec", "spec.json"), {}).costUsd ?? 0) +
    ["skeleton", "public", "private"].reduce((sum, name) => sum + (generation[name]?.costUsd ?? 0), 0) +
    (calibration?.reference?.costUsd ?? 0);
  return {
    case: item.slug,
    arm,
    exit: prepared.status,
    output: prepared.status === 0 ? undefined : prepared.output.slice(-3000),
    status: calibration?.status ?? null,
    public: calibration?.publicIds?.length ?? null,
    hiddenWritten: calibration?.hiddenWritten ?? null,
    hiddenKept: calibration?.kept?.length ?? null,
    open: generation.private?.open?.length ?? null,
    referenceRegressions: calibration?.referenceRegressions?.length ?? null,
    publicFailingOnReference: calibration?.publicFailingOnReference?.length ?? null,
    costUsd: Math.round(cost * 100) / 100,
  };
}

// ---- commit: the real change against the suites ---------------------------

function judgeCommit(item, arm) {
  const slug = ARMS[arm].slug(item);
  const calibration = readJson(join(specDir(slug), "calibration.json"), null);
  if (calibration?.status !== "ok") return { skipped: "not calibrated" };
  const chain = toolchainOf(slug);
  const baseline = readJson(join(specDir(slug), "baseline.json"));
  const changes = commitChanges(item, chain);
  const snapshot = workdir(`${slug}-commit`);
  let judged;
  try {
    for (const entry of changes.code.filter((entry) => entry.change !== "removed"))
      writeAt(snapshot, entry.path, show(item.repo, item.commit, entry.path));
    const remove = changes.code.filter((entry) => entry.change === "removed").map((entry) => entry.path);
    judged = judge(slug, snapshot, { existing: true, remove });
  } finally {
    discard(snapshot);
  }
  const edited = changes.tests.filter((entry) => entry.change !== "added").map((entry) => entry.path);
  const lost = regressionsOf(baseline, judged.existing);
  const regressions = lost.filter((id) => !edited.some((path) => id.startsWith(`${relative(chain.package, path)} ::`) || id.startsWith(`${path} ::`)));
  const publicCount = count(judged.public, calibration.publicIds);
  const hiddenCount = count(judged.hidden, calibration.kept);
  const ok = new Set(testsOf(judged.hidden).filter((test) => test.ok).map((test) => test.id));
  const failing = calibration.kept.filter((id) => !ok.has(id));
  const publicOk = new Set(testsOf(judged.public).filter((test) => test.ok).map((test) => test.id));
  const scope = scopeOf(chain, changes.code, () => "");
  writeJson(join(RUNS, slug, "commit", "judged.json"), {
    publicFailures: calibration.publicIds.filter((id) => !publicOk.has(id)),
    hiddenFailures: failing,
    regressions,
    compileOutput: judged.hidden.compileOutput || judged.public.compileOutput,
  });
  return {
    case: item.slug,
    arm,
    verdict: lib.verdict({ publicCount, hiddenCount, regressions }),
    compiled: judged.public.compiled && judged.hidden.compiled,
    public: publicCount,
    hidden: hiddenCount,
    // A tree that does not build fails every test, so a count would say nothing.
    regressions: judged.public.compiled ? regressions.length : null,
    editedTestsLost: judged.public.compiled ? lost.length - regressions.length : null,
    outsideScope: scope.outsideScope.map((entry) => entry.path),
    failedScenarios: [...new Set(failing.map(scenarioOf).filter(Boolean))].sort(),
  };
}

// ---- report ---------------------------------------------------------------

/** Fisher's exact test, two-sided, for successes a of n against b of m. */
function fisher(a, n, b, m) {
  const logFactorial = (k) => {
    let sum = 0;
    for (let i = 2; i <= k; i += 1) sum += Math.log(i);
    return sum;
  };
  const total = n + m;
  const successes = a + b;
  const probability = (x) =>
    Math.exp(
      logFactorial(successes) + logFactorial(total - successes) + logFactorial(n) + logFactorial(m) -
        logFactorial(total) - logFactorial(x) - logFactorial(successes - x) - logFactorial(n - x) - logFactorial(m - successes + x),
    );
  const observed = probability(a);
  let p = 0;
  for (let x = Math.max(0, successes - m); x <= Math.min(n, successes); x += 1) {
    const q = probability(x);
    if (q <= observed * (1 + 1e-7)) p += q;
  }
  return Math.min(1, p);
}

function report() {
  const steps = ledger();
  const results = existsSync(RESULTS)
    ? readFileSync(RESULTS, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
    : [];
  const fraction = (count) => (count?.total === undefined ? "-" : `${count.passed}/${count.total}`);
  const tally = (lines) => lines.reduce((acc, line) => ({ ...acc, [line.verdict]: (acc[line.verdict] ?? 0) + 1 }), {});
  const passed = (lines) => (lines.length === 0 ? "-" : `${lines.filter((line) => line.verdict === "passed").length}/${lines.length}`);
  console.log("| case | package | arm | public | hidden kept | real commit: public | hidden | verdict | Haiku with public | without |");
  console.log("| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |");
  const runs = { with: [], without: [] };
  const others = [];
  const commits = { drafted: [], confirmed: [] };
  for (const item of cases)
    for (const arm of Object.keys(ARMS)) {
      const slug = ARMS[arm].slug(item);
      const prepared = steps.get(`${slug}/prepare`);
      const commit = steps.get(`${slug}/commit`);
      const of = (variant) => results.filter((line) => line.spec === slug && line.variant === variant);
      runs.with.push(...of("haiku"));
      runs.without.push(...of("haiku-no-public"));
      others.push(...results.filter((line) => line.spec === slug && !["haiku", "haiku-no-public"].includes(line.variant)));
      if (commit !== undefined) commits[arm].push(commit);
      console.log(
        `| ${item.slug} | ${item.package} | ${arm} | ${prepared?.public ?? "-"} | ${prepared?.hiddenKept ?? "-"}/${prepared?.hiddenWritten ?? "-"} | ${fraction(commit?.public)} | ${fraction(commit?.hidden)} | ${commit === undefined ? "-" : `${commit.verdict}${commit.compiled ? "" : ", did not compile"}`} | ${passed(of("haiku"))} | ${passed(of("haiku-no-public"))} |`,
      );
    }
  for (const arm of Object.keys(ARMS)) {
    const sum = (key) => commits[arm].reduce((acc, commit) => ({ passed: acc.passed + commit[key].passed, total: acc.total + commit[key].total }), { passed: 0, total: 0 });
    console.log(`\nreal commits, ${arm}: ${JSON.stringify(tally(commits[arm]))}; public ${fraction(sum("public"))}, hidden ${fraction(sum("hidden"))}`);
  }
  // `passed` needs the public suite too, which the arm without it never saw; the hidden suite alone is the like-for-like count.
  const hiddenGreen = (line) => line.hidden.total > 0 && line.hidden.passed === line.hidden.total && line.refused.length === 0;
  const p = (count) => fisher(count(runs.with), runs.with.length, count(runs.without), runs.without.length).toPrecision(2);
  console.log(`Fisher, with against without: passed p = ${p((lines) => lines.filter((line) => line.verdict === "passed").length)}, hidden green p = ${p((lines) => lines.filter(hiddenGreen).length)}`);
  // Other implementers (run --backend): by variant, the same counts.
  const named = Object.fromEntries(Object.entries(runs).map(([name, lines]) => [`Haiku ${name} the public suite`, lines]));
  for (const variant of [...new Set(others.map((line) => line.variant))].sort()) named[`${variant}, with the public suite`] = others.filter((line) => line.variant === variant);
  for (const [name, lines] of Object.entries(named))
    console.log(
      `${name}: ${JSON.stringify(tally(lines))}; hidden suite green ${lines.filter(hiddenGreen).length}; regressed ${lines.filter((line) => (line.regressions ?? 0) > 0).length}, outside scope ${lines.filter((line) => (line.outsideScope ?? []).length > 0).length}, refused ${lines.filter((line) => line.refused.length > 0).length}, of ${lines.length}`,
    );
}

// ---- discover and add: no model ---------------------------------------------

const TEST_PATH = /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[cm]?tsx?$/;
const SOURCE = /\.[cm]?tsx?$/;

/**
 * Candidate commits of `repo` for one package (`pkg`, default the root):
 * see the header. Newest first; each line is a case for `add`, with the
 * test files that import the seam.
 */
function discover(repo, pkg, limit) {
  const prefix = pkg === "." ? "" : `${pkg.replace(/\/$/, "")}/`;
  const shas = git(repo, "log", "--no-merges", "--format=%H", "--", prefix || ".").stdout.split("\n").filter(Boolean);
  const found = [];
  for (const sha of shas) {
    if (found.length >= limit) break;
    const subject = git(repo, "log", "-1", "--format=%s", sha).stdout.trim();
    if (!/^(feat|fix|perf)\b/.test(subject)) continue;
    const listed = git(repo, "diff", "--name-status", "--no-renames", `${sha}^`, sha).stdout.split("\n").filter(Boolean).map((line) => line.split("\t"));
    const paths = listed.map(([, path]) => path);
    if (paths.some((path) => !path.startsWith(prefix) && !path.endsWith(".md"))) continue;
    if (paths.some((path) => HARNESS_FILES.test(basename(path)))) continue;
    const seam = listed.filter(([status, path]) => status !== "D" && SOURCE.test(path) && !TEST_PATH.test(path) && !path.endsWith(".d.ts")).map(([, path]) => path);
    const tests = listed.filter(([status, path]) => status !== "D" && TEST_PATH.test(path) && SOURCE.test(path)).map(([, path]) => path);
    // A test imports the seam when an import specifier ends in the seam's path without its extension, or names the package's src/index.
    const importsSeam = (test) => {
      const body = show(repo, sha, test)?.toString("utf8") ?? "";
      const specifiers = [...body.matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1] ?? match[2]);
      return specifiers.some((specifier) => {
        const target = posix.normalize(posix.join(posix.dirname(test), specifier)).replace(/\.[cm]?[jt]sx?$/, "");
        return seam.some((path) => path.replace(/\.[cm]?tsx?$/, "") === target || path.replace(/\.[cm]?tsx?$/, "") === `${target}/index`) || target === `${prefix}src` || target === `${prefix}src/index`;
      });
    };
    const importing = tests.filter(importsSeam);
    if (seam.length === 0 || importing.length === 0) continue;
    const stat = git(repo, "diff", "--shortstat", `${sha}^`, sha, "--", ...seam).stdout.trim();
    found.push({ commit: sha, date: git(repo, "log", "-1", "--format=%as", sha).stdout.trim(), subject, package: pkg, seam, tests: importing, stat });
  }
  return found;
}

/** The commit's message for the ticket: its body as written, without trailers (Co-authored-by and the like). */
function messageOf(repo, sha) {
  const body = git(repo, "log", "-1", "--format=%b", sha).stdout;
  return body
    .split("\n")
    .filter((line) => !/^[A-Z][\w-]+-by: /.test(line))
    .join("\n")
    .trim();
}

// ---- main -----------------------------------------------------------------

const { options, rest } = args();
const [command, ...named] = rest;
const chosen = named.length === 0 ? cases : cases.filter((item) => named.includes(item.slug));
if (!["discover", "add"].includes(command) && named.length > 0 && chosen.length !== named.length) throw new Error(`No case: ${named.filter((slug) => !cases.some((item) => item.slug === slug)).join(", ")}`);
const usable = (item) => ledger().get(`${item.slug}/check`)?.usable === true;
const arms = typeof options.arm === "string" ? [options.arm] : Object.keys(ARMS);
for (const arm of arms) if (ARMS[arm] === undefined) throw new Error(`No arm ${arm}: ${Object.keys(ARMS).join(", ")}`);

if (command === "check") {
  // A case checked already is skipped unless named or --force.
  for (const item of chosen.filter((item) => named.length > 0 || options.force === true || ledger().get(`${item.slug}/check`) === undefined)) {
    log(item.slug, "check");
    const result = check(item);
    const { config, code, elsewhere, tests, harness, ...kept } = result;
    const paths = (entries) => entries?.map((entry) => entry.path);
    record(item.slug, "check", { ...kept, allowed: allowedOf(item), code: paths(code), elsewhere: paths(elsewhere), tests: tests?.length, harness: paths(harness) });
    log(item.slug, result.usable ? "usable" : `not usable: ${result.reason}`);
  }
} else if (command === "prepare") {
  // Each case's arms in order: the confirmed spec starts from the drafted one.
  await pool(chosen.filter(usable), Number(options.concurrency ?? 2), async (item) => {
    for (const arm of arms) {
      const slug = ARMS[arm].slug(item);
      log(slug, "prepare");
      const result = await prepare(item, arm);
      if (result.skipped === undefined) record(slug, "prepare", result);
      log(slug, "prepare:", JSON.stringify(result).slice(0, 300));
    }
  });
} else if (command === "commit") {
  for (const item of chosen.filter(usable))
    for (const arm of arms) {
      const slug = ARMS[arm].slug(item);
      const result = judgeCommit(item, arm);
      if (result.skipped === undefined) record(slug, "commit", result);
      log(slug, "real commit:", JSON.stringify(result));
    }
} else if (command === "run") {
  // Haiku runs on the confirmed specs by default: the skill's own flow.
  const arm = typeof options.arm === "string" ? options.arm : "confirmed";
  // A commit that changed what existing tests expect, and edited them to
  // match (`check`'s editedTestsLost), would make every faithful run
  // `regressed` against the baseline: such a case is judged as a commit only.
  const changesTests = (item) => (ledger().get(`${item.slug}/check`)?.editedTestsLost ?? 0) > 0;
  for (const item of chosen.filter(changesTests)) log(item.slug, "no runs: the commit changes what existing tests expect");
  const slugs = chosen
    .filter((item) => !changesTests(item))
    .map((item) => ARMS[arm].slug(item))
    .filter((slug) => readJson(join(specDir(slug), "calibration.json"), null)?.status === "ok");
  if (slugs.length === 0) throw new Error("No calibrated case.");
  const concurrency = String(options.concurrency ?? 2);
  // --backend codex-cli (or another, lib.mjs BACKENDS): that agent instead of Haiku, with the public suite only; its variant is the backend's name.
  const agent = typeof options.backend === "string" ? ["--backend", options.backend] : ["--model", MODEL];
  for (const flags of typeof options.backend === "string" ? [[]] : [[], ["--no-public"]]) {
    const out = spawnSync(process.execPath, [join(ROOT, "bin", "run.mjs"), ...slugs, "--runs", String(RUNS_PER_ARM), ...agent, "--concurrency", concurrency, ...flags], {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
    });
    if (out.status !== 0) process.exit(out.status ?? 1);
  }
  const graded = spawnSync(process.execPath, [join(ROOT, "bin", "grade.mjs"), ...slugs], { cwd: ROOT, stdio: "inherit", env: process.env });
  process.exit(graded.status ?? 1);
} else if (command === "ticket") {
  for (const item of chosen) console.log(`===== ${item.slug}\n${ticketOf(item)}`);
} else if (command === "report") {
  report();
} else if (command === "discover") {
  if (typeof options.repo !== "string") throw new Error("discover needs --repo <path|url>");
  const repo = checkoutOf(options.repo);
  for (const item of discover(repo, typeof options.package === "string" ? options.package : ".", Number(options.limit ?? 40))) console.log(JSON.stringify(item));
} else if (command === "add") {
  const [commit] = named.length > 0 ? named : rest.slice(1);
  if (commit === undefined || typeof options.slug !== "string" || typeof options.repo !== "string") throw new Error("add <commit> --slug <slug> --repo <path|url> [--package <dir>] [--seam a,b] [--allowed a,b]");
  const repo = checkoutOf(options.repo);
  const sha = git(repo, "rev-parse", "--verify", `${commit}^{commit}`).stdout.trim();
  const pkg = typeof options.package === "string" ? options.package : ".";
  const listed = readJson(CASES, []);
  if (listed.some((item) => item.slug === options.slug)) throw new Error(`${CASES} has a case ${options.slug} already`);
  const seam = typeof options.seam === "string" ? options.seam.split(",") : (discover(repo, pkg, 10_000).find((item) => item.commit === sha)?.seam ?? []);
  if (seam.length === 0) throw new Error(`${sha.slice(0, 12)}: no seam (pass --seam)`);
  const item = {
    slug: options.slug,
    repo: options.repo,
    commit: sha,
    package: pkg,
    seam,
    ...(typeof options.allowed === "string" ? { allowed: options.allowed.split(",") } : {}),
    subject: git(repo, "log", "-1", "--format=%s", sha).stdout.trim(),
    message: messageOf(repo, sha),
  };
  mkdirSync(dirname(CASES), { recursive: true });
  writeJson(CASES, [...listed, item]);
  log(item.slug, `added to ${relative(ROOT, CASES)}: ${item.subject}`);
} else {
  console.error("usage: node evidence/in-repo.mjs check|prepare|commit|run|ticket|report [slug...] [--arm drafted|confirmed] [--cases <file>] | discover --repo <r> | add <commit> --slug <s> --repo <r>");
  process.exit(1);
}
