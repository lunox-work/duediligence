#!/usr/bin/env node
// CI mode (README "In CI"): judges a commit from a seal and reports it as a
// check. The same script runs in GitHub Actions (action.yml), any other CI,
// or a terminal; only the last step needs GitHub.
//
//   node bin/ci.mjs --seal <file|https-url> [--repo <checkout>] [--ref <rev>]
//                   [--name <check name>] [--out <payload.json>] [--record <file>]
//                   [--no-post] [--exit-zero]
//
// 1. A URL seal is fetched with DUEDILIGENCE_SEAL_AUTH as the
//    Authorization header, if set, into a temporary file.
// 2. bin/judge.mjs --seal <file> --repo <checkout> --ref <rev> --json <tmp>
//    runs with an environment stripped of tokens, secrets and the Actions
//    files ($GITHUB_STEP_SUMMARY, $GITHUB_OUTPUT, ...): the submission's
//    code runs inside it. Its output, already free of hidden test names,
//    is passed through to the log. A seal for a new module takes the
//    folder to judge as `--src <dir>` instead of --repo.
// 3. The check is built from judge's JSON record alone, never from its
//    printed output: verdict, counts, failing scenario keys, regressions
//    (tests of the repository's own suite: public), and the paths of the
//    change that were refused or outside the allowed paths. passed →
//    success, anything else → failure. --out writes the Checks API body;
//    $GITHUB_STEP_SUMMARY, when set, gets the summary.
// 4. With a token (DUEDILIGENCE_GITHUB_TOKEN or GITHUB_TOKEN) and
//    GITHUB_REPOSITORY, and without --no-post, it POSTs the check run to
//    $GITHUB_API_URL (default https://api.github.com); the job needs
//    `checks: write`.
//
// Exit: judge's code (0 passed, 2 overfit, 3 regressed, 1 otherwise), or 0
// with --exit-zero; 1 if the check could not be posted.

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BIN = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const options = {};
for (let i = 0; i < argv.length; i += 1) {
  if (!argv[i].startsWith("--")) {
    console.error(`unexpected argument ${argv[i]}`);
    process.exit(1);
  }
  if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) options[argv[i].slice(2)] = argv[(i += 1)];
  else options[argv[i].slice(2)] = true;
}
if (typeof options.seal !== "string") {
  console.error("usage: node bin/ci.mjs --seal <file|https-url> [--repo <checkout>] [--ref <rev>] [--src <dir>] [--name <check>] [--out <file>] [--record <file>] [--no-post] [--exit-zero]");
  process.exit(1);
}

const scratch = mkdtempSync(join(realpathSync(tmpdir()), "duediligence-ci-"));
process.on("exit", () => rmSync(scratch, { recursive: true, force: true }));

// 1. The seal.
let seal = options.seal;
if (/^https:\/\//.test(seal)) {
  const auth = process.env.DUEDILIGENCE_SEAL_AUTH;
  const response = await fetch(seal, { headers: auth ? { Authorization: auth } : {} });
  if (!response.ok) {
    console.error(`fetching the seal: HTTP ${response.status}`);
    process.exit(1);
  }
  seal = join(scratch, "fetched.seal.gz");
  writeFileSync(seal, Buffer.from(await response.arrayBuffer()));
} else seal = resolve(seal);

// 2. The judge, in a scrubbed environment.
const checkout = resolve(typeof options.repo === "string" ? options.repo : ".");
const repoMode = typeof options.src !== "string";
const git = (...args) => spawnSync("git", ["-C", checkout, ...args], { encoding: "utf8" });
const ref = typeof options.ref === "string" ? options.ref : undefined;
const headSha = repoMode ? git("rev-parse", `${ref ?? "HEAD"}^{commit}`).stdout?.trim() || null : null;
const recordFile = join(scratch, "record.json");
const SCRUB = /TOKEN|SECRET|PASSWORD|CREDENTIAL|^ACTIONS_|^INPUT_|^GITHUB_(STEP_SUMMARY|OUTPUT|ENV|PATH|STATE)$|^DUEDILIGENCE_(SPECS|SEAL_AUTH)$/i;
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !SCRUB.test(key)));
const judgeArgs = [
  join(BIN, "judge.mjs"),
  "--seal",
  seal,
  ...(repoMode ? ["--repo", checkout, ...(ref === undefined ? [] : ["--ref", ref])] : [resolve(options.src)]),
  ...(options["strict-scope"] === true ? ["--strict-scope"] : []),
  "--json",
  recordFile,
];
const judged = spawnSync(process.execPath, judgeArgs, { env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
process.stdout.write(judged.stdout ?? "");
process.stderr.write(judged.stderr ?? "");
const exit = judged.status ?? 1;
const record = existsSync(recordFile) ? JSON.parse(readFileSync(recordFile, "utf8")) : null;
if (typeof options.record === "string" && record !== null) writeFileSync(resolve(options.record), `${JSON.stringify(record, null, 2)}\n`);

// 3. The check, from the record alone.
const name = typeof options.name === "string" ? options.name : "duediligence";
const fraction = (count) => (count ? `${count.passed}/${count.total}` : "-");
const list = (items, limit = 50) =>
  [...items.slice(0, limit).map((item) => `- \`${String(item).replace(/`/g, "'")}\``), ...(items.length > limit ? [`- … ${items.length - limit} more`] : [])].join("\n");
let title;
let summary;
if (record === null) {
  // Not judged: judge refused before judging (a changed suite, a bad seal, no base commit). Its first line says why.
  const why = `${judged.stderr ?? ""}${judged.stdout ?? ""}`.trim().split("\n").find(Boolean) ?? `judge exited ${exit}`;
  title = "not judged";
  summary = `**not judged.** ${why.slice(0, 1000)}`;
} else {
  title = `${record.verdict}: public ${fraction(record.public)}, hidden ${fraction(record.hidden)}${record.existing ? `, existing ${fraction(record.existing)}` : ""}`;
  const rows = [
    "| verdict | public | hidden | existing |",
    "| --- | ---: | ---: | ---: |",
    `| **${record.verdict}** | ${fraction(record.public)} | ${fraction(record.hidden)} | ${fraction(record.existing)} |`,
  ];
  const parts = [rows.join("\n")];
  if (record.failedScenarios?.length > 0)
    parts.push(`Failing scenarios (keys from the spec; the hidden tests stay hidden): ${record.failedScenarios.map((key) => `\`${key}\``).join(", ")}`);
  if (record.compiled && !record.compiled.public) parts.push("The change does not compile with the public suite.");
  if (record.compiled && record.compiled.public && !record.compiled.hidden) parts.push("The change does not compile with the hidden suite.");
  if (record.regressions?.length > 0) parts.push(`Regressions (passed on base plus stub, fail now):\n${list(record.regressions)}`);
  if (record.refused?.length > 0) parts.push(`Refused (tests, harness or the hidden suite's folder):\n${list(record.refused)}`);
  if (record.outsideScope?.length > 0) parts.push(`Outside the allowed paths:\n${list(record.outsideScope)}`);
  if (record.ownTests?.length > 0) parts.push(`Own tests (not judged): ${record.ownTests.map((path) => `\`${path}\``).join(", ")}`);
  parts.push(
    `Hidden suite sha256 \`${record.hiddenSha256}\`, sealed ${record.sealedAt}${record.committedAt ? `, committed ${record.committedAt}` : ""}.${headSha ? ` Commit \`${headSha}\`.` : ""}`,
  );
  summary = parts.join("\n\n");
}
const payload = {
  name,
  ...(headSha ? { head_sha: headSha } : {}),
  status: "completed",
  conclusion: record?.verdict === "passed" ? "success" : "failure",
  completed_at: new Date().toISOString(),
  output: { title, summary: summary.slice(0, 65000) },
};
if (typeof options.out === "string") writeFileSync(resolve(options.out), `${JSON.stringify(payload, null, 2)}\n`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${name}: ${title}\n\n${summary}\n\n`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `conclusion=${payload.conclusion}\ntitle=${title.replace(/\n/g, " ")}\n`);

// 4. The Checks API, only with a token.
const token = process.env.DUEDILIGENCE_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
let postFailed = false;
if (options["no-post"] !== true && token && repository && headSha) {
  const api = process.env.GITHUB_API_URL || "https://api.github.com";
  const response = await fetch(`${api}/repos/${repository}/check-runs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify(payload),
  });
  if (response.ok) console.log(`Check "${name}" posted: ${(await response.json()).html_url ?? ""}`);
  else {
    postFailed = true;
    console.error(`posting the check failed: HTTP ${response.status} ${(await response.text()).slice(0, 500)}`);
  }
} else console.log(`Check "${name}": ${payload.conclusion}, ${title}${typeof options.out === "string" ? ` (payload in ${resolve(options.out)})` : ""}; not posted${token ? "" : " (no token)"}.`);

process.exit(postFailed ? 1 : options["exit-zero"] === true ? 0 : exit);
