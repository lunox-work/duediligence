// The commands that hand work to the hosted platform (sandbox-factory)
// instead of running it here, over platform-client.mjs:
//
//   push <slug>       a spec confirmed here becomes a bounty in the signed-in
//                     workspace: POST /api/v1/orgs/:org/bounties with the
//                     ticket's title and the confirmed spec.md as its text.
//                     Recorded in specs/<slug>/platform.json, so pushing
//                     again names the bounty already made.
//   ci --platform     a pull request judged by the platform against a
//                     published version's hidden suite, which never reaches
//                     the runner: the PR's changed files go to
//                     POST /api/judge with the run's GitHub OIDC token (no
//                     secret on either side; the platform checks the token
//                     names the repository the version was sliced from),
//                     then GET /api/judge/:id?workspace= until a verdict. The job's own
//                     pass or fail is the check.
//
// Each takes its argv and the outside world as `deps` (account.mjs's, plus
// `git` and `readFile`), so test/hosted.mjs drives them against a fake
// platform.

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { defaultDeps as accountDeps } from "./account.mjs";
import { confirmation } from "./confirm.mjs";
import { specDir } from "./lib.mjs";
import { credentialFor, credentialsPath, platformUrl, PlatformError, request } from "./platform-client.mjs";

/** The platform's limits on one submission (sandbox-factory SUBMISSION_LIMITS). */
const MAX_FILES = 200;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_BYTES = 4_000_000;
/** How often a verdict is asked for, and for how long. */
const POLL_MS = 10_000;
const POLL_LIMIT_MS = 45 * 60_000;
const TITLE_MAX = 255;
const DESCRIPTION_MAX = 20_000;

export function defaultDeps() {
  return {
    ...accountDeps(),
    git: (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }),
    readFile: (path) => readFileSync(path),
  };
}

function options(argv, spec, usage, positionals = false) {
  try {
    return parseArgs({ args: argv, options: { ...spec, help: { type: "boolean", short: "h" } }, allowPositionals: positionals });
  } catch (error) {
    throw new PlatformError(`${error.message}\n${usage}`);
  }
}

/** The first `# ` heading of a markdown text, else its first line. */
export function titleOf(text) {
  const heading = /^#\s+(.+)$/m.exec(text)?.[1];
  const line = heading ?? text.split("\n").find((each) => each.trim() !== "") ?? "";
  return line.trim().slice(0, TITLE_MAX);
}

/** `push <slug>`: a locally confirmed spec as a bounty in the signed-in workspace. */
export async function push(argv, { client, version }, deps) {
  const usage = `usage: ${client} push <slug> [--platform <url>] [--again]`;
  const { values, positionals } = options(argv, { platform: { type: "string" }, again: { type: "boolean" } }, usage, true);
  if (values.help || positionals.length !== 1) {
    deps.out(
      `${usage}\n\nPosts specs/<slug>/spec.md, as confirmed (${client} confirm <slug> --by <name>), as a bounty in the workspace\n` +
        `${client} login signed in to. The bounty's title is ticket.md's (else spec.md's) heading. Pushing again names\n` +
        `the bounty already made (specs/<slug>/platform.json); --again posts a new one, as after editing the spec.\n`,
    );
    return values.help ? 0 : 1;
  }
  const [slug] = positionals;
  const dir = specDir(slug);
  const confirmed = confirmation(slug);
  if (!confirmed.ok) throw new PlatformError(`specs/${slug}: ${confirmed.reason}. Confirm it first: ${client} confirm ${slug} --by <name>.`);
  const base = platformUrl(values.platform, deps.env);
  const saved = credentialFor(credentialsPath(deps.env), base, client);
  if (saved === undefined) throw new PlatformError(`Not signed in to ${base}. Run \`${client} login\`.`);
  const recordPath = join(dir, "platform.json");
  const recorded = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, "utf8")) : null;
  if (recorded !== null && !values.again && recorded.base === base && recorded.organizationId === saved.organizationId) {
    const stale = recorded.specSha256 !== confirmed.hash;
    deps.out(
      `specs/${slug} is bounty ${recorded.bountyId} in @${saved.organizationHandle} (pushed ${recorded.pushedAt.slice(0, 10)}).\n` +
        (stale ? "spec.md was confirmed again since; --again posts it as a new bounty.\n" : ""),
    );
    return 0;
  }
  const spec = readFileSync(join(dir, "spec.md"), "utf8");
  const ticketPath = join(dir, "ticket.md");
  const title = titleOf(existsSync(ticketPath) ? readFileSync(ticketPath, "utf8") : spec);
  if (title === "") throw new PlatformError(`specs/${slug}: no title in ticket.md or spec.md.`);
  if (spec.length > DESCRIPTION_MAX)
    throw new PlatformError(`specs/${slug}/spec.md is ${spec.length} characters; a bounty takes ${DESCRIPTION_MAX}.`);
  const made = await request({
    base,
    token: saved.token,
    client,
    version,
    fetchImpl: deps.fetchImpl,
    method: "POST",
    path: `/api/v1/orgs/${encodeURIComponent(saved.organizationId)}/bounties`,
    body: { title, description: spec },
  });
  const bountyId = made?.bounty?.id;
  if (typeof bountyId !== "string") throw new PlatformError(`${base} answered without a bounty.`);
  writeFileSync(
    recordPath,
    `${JSON.stringify(
      {
        base,
        organizationId: saved.organizationId,
        bountyId,
        specSha256: confirmed.hash,
        confirmedBy: confirmed.record.by,
        pushedAt: new Date(deps.now()).toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  deps.out(
    `Posted specs/${slug} as bounty ${bountyId} in @${saved.organizationHandle} on ${base}.\n` +
      `Size it there, or with the MCP tool size_bounty; its decisions were confirmed here by ${confirmed.record.by}.\n`,
  );
  return 0;
}

/** A GitHub Actions OIDC token for `audience`; the job needs `permissions: id-token: write`. */
export async function oidcToken(audience, deps) {
  const url = deps.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const bearer = deps.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !bearer)
    throw new PlatformError(
      "No GitHub OIDC token: run in GitHub Actions with `permissions: id-token: write` (ACTIONS_ID_TOKEN_REQUEST_URL is unset).",
    );
  const response = await deps.fetchImpl(`${url}${url.includes("?") ? "&" : "?"}audience=${encodeURIComponent(audience)}`, {
    headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.value !== "string") throw new PlatformError(`GitHub gave no OIDC token (HTTP ${response.status}).`);
  return body.value;
}

/** The PR's added and modified files between `base` and HEAD, whole, as the checkout has them. */
export function changedFiles(repo, base, deps) {
  const names = deps
    .git(["diff", "--name-only", "--diff-filter=AM", "-z", `${base}...HEAD`], repo)
    .split("\0")
    .filter((name) => name !== "");
  if (names.length > MAX_FILES) throw new PlatformError(`The change touches ${names.length} files; the platform judges up to ${MAX_FILES}.`);
  const files = [];
  const skipped = [];
  for (const path of names) {
    const bytes = deps.readFile(resolve(repo, path));
    if (bytes.length > MAX_FILE_BYTES || bytes.includes(0)) skipped.push(path);
    else files.push({ path, text: bytes.toString("utf8") });
  }
  const total = files.reduce((sum, file) => sum + Buffer.byteLength(file.text), 0);
  if (total > MAX_BYTES) throw new PlatformError(`The change is ${total} bytes; the platform judges up to ${MAX_BYTES}.`);
  return { files, skipped };
}

const EXIT = { passed: 0, overfit: 2 };

/** `ci --platform`: the change judged on the platform; answers the exit code. */
export async function ciPlatform(argv, { client, version }, deps) {
  const usage = `usage: ${client} ci --platform [<url>] --version <sandbox version id> --workspace <workspace id> [--repo <checkout>] [--base <rev>] [--exit-zero]`;
  const { values } = options(
    argv,
    {
      platform: { type: "string" },
      version: { type: "string" },
      workspace: { type: "string" },
      repo: { type: "string" },
      base: { type: "string" },
      "exit-zero": { type: "boolean" },
    },
    usage,
  );
  if (values.help || !values.version || !values.workspace) {
    deps.out(
      `${usage}\n\nJudges this pull request on the platform against a published sandbox version's hidden suite, which never\n` +
        `reaches the runner. Sends the files the PR added or changed since --base (default origin/$GITHUB_BASE_REF), with\n` +
        `the run's GitHub OIDC token (the job needs \`permissions: id-token: write\`); the platform accepts it only from the\n` +
        `repository the version was sliced from. Prints the verdict, counts and failing scenario keys.\n` +
        `Exit: 0 passed, 2 overfit, 1 otherwise (0 with --exit-zero).\n`,
    );
    return values.help ? 0 : 1;
  }
  const base = platformUrl(values.platform === "" ? undefined : values.platform, deps.env);
  const repo = resolve(values.repo ?? ".");
  const from = values.base ?? (deps.env.GITHUB_BASE_REF ? `origin/${deps.env.GITHUB_BASE_REF}` : "HEAD~1");
  const { files, skipped } = changedFiles(repo, from, deps);
  for (const path of skipped) deps.err(`skipped ${path}: binary or over ${MAX_FILE_BYTES / 1024} KiB\n`);
  if (files.length === 0) {
    deps.out(`No file changed since ${from}; nothing to judge.\n`);
    return 0;
  }
  const call = async (options) =>
    request({ base, token: await oidcToken(base, deps), client, version, fetchImpl: deps.fetchImpl, ...options });
  let { submission } = await call({
    method: "POST",
    path: "/api/judge",
    body: { workspace: values.workspace, versionId: values.version, files },
  });
  deps.out(`Submitted ${files.length} file${files.length === 1 ? "" : "s"} as ${submission.id}; waiting for the verdict...\n`);
  const started = deps.now();
  while (submission.status === "queued" || submission.status === "running") {
    if (deps.now() - started > POLL_LIMIT_MS) throw new PlatformError(`No verdict for ${submission.id} after ${POLL_LIMIT_MS / 60_000} minutes.`);
    await deps.sleep(POLL_MS);
    ({ submission } = await call({
      path: `/api/judge/${encodeURIComponent(submission.id)}?workspace=${encodeURIComponent(values.workspace)}`,
    }));
  }
  const verdict = submission.status === "errored" ? "errored" : (submission.verdict ?? submission.status);
  const counts =
    submission.public && submission.hidden
      ? `public ${submission.public.passed}/${submission.public.total}, hidden ${submission.hidden.passed}/${submission.hidden.total}`
      : "no tests ran";
  const lines = [
    `duediligence (platform): ${verdict}, ${counts}`,
    ...(submission.failedScenarios.length > 0 ? [`failing scenarios: ${submission.failedScenarios.join(", ")}`] : []),
    ...submission.refused.map((refusal) => `refused ${refusal.path}: ${refusal.reason}`),
  ];
  deps.out(`${lines.join("\n")}\n`);
  if (deps.env.GITHUB_STEP_SUMMARY)
    appendFileSync(deps.env.GITHUB_STEP_SUMMARY, `### ${lines[0]}\n\n${lines.slice(1).map((line) => `- ${line}`).join("\n")}\n`);
  if (values["exit-zero"]) return 0;
  return EXIT[verdict] ?? 1;
}

/** Runs one, printing a PlatformError as one line on stderr. */
export async function run(command, argv, meta, deps = defaultDeps()) {
  try {
    return await (command === "push" ? push : ciPlatform)(argv, meta, deps);
  } catch (error) {
    if (!(error instanceof PlatformError)) throw error;
    deps.err(`${meta.client} ${command}: ${error.message}\n`);
    return 1;
  }
}
