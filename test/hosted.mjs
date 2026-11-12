#!/usr/bin/env node
// `push` and `ci --platform` (bin/hosted.mjs) against a fake platform on
// node:http, never the real one: a confirmed spec posted once as a bounty
// and named again after, an unconfirmed one refused; a pull request's
// changed files sent with the run's OIDC token, polled to a verdict on a
// virtual clock, and the exit code and step summary from the verdict.
//
//   node test/hosted.mjs

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "duediligence-hosted-"));
process.env.DUEDILIGENCE_SPECS = join(scratch, "specs");
const { run, titleOf } = await import("../bin/hosted.mjs");
const { confirmation } = await import("../bin/confirm.mjs");
const { writeCredentials } = await import("../bin/platform-client.mjs");

const CLIENT = { client: "duediligence", version: "9.9.9" };
const SECRET = "lnx_s3cr3t-never-printed";
const OIDC = "oidc.header.signature";

async function fakePlatform({ verdicts = ["running", "passed"] } = {}) {
  const state = { requests: [], verdicts: [...verdicts], bounties: 0 };
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw === "" ? undefined : JSON.parse(raw);
    const url = new URL(req.url, "http://x");
    state.requests.push({ method: req.method, path: url.pathname, auth: req.headers.authorization, body });
    const send = (status, json) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    };
    const route = `${req.method} ${url.pathname}`;
    if (route === "GET /oidc") {
      if (req.headers.authorization !== "Bearer actions-request-token" || url.searchParams.get("audience") !== state.url)
        return send(403, {});
      return send(200, { value: OIDC });
    }
    if (route === "POST /api/v1/orgs/org_acme/bounties") {
      if (req.headers.authorization !== `Bearer ${SECRET}`) return send(401, { error: "This API token is not valid." });
      state.bounties += 1;
      return send(201, { bounty: { id: `bty_${state.bounties}`, title: body.title } });
    }
    const submission = (status) => ({
      id: "sbm_1",
      sandboxVersionId: "sbv_1",
      status: status === "running" || status === "queued" ? status : status === "passed" ? "passed" : "failed",
      verdict: ["passed", "overfit", "refused", "incomplete"].includes(status) ? status : null,
      public: status === "running" ? null : { passed: 1, total: 1 },
      hidden: status === "running" ? null : { passed: status === "passed" ? 2 : 1, total: 2 },
      failedScenarios: status === "overfit" ? ["s2"] : [],
      refused: status === "refused" ? [{ path: "src/a.ts", reason: "It adds a way to pass the tests without the code." }] : [],
      runId: "arn_grade",
      retryOf: null,
      merge: null,
      createdAt: "2026-11-12T00:00:00.000Z",
      updatedAt: "2026-11-12T00:00:00.000Z",
    });
    if (req.headers.authorization !== `Bearer ${OIDC}` && url.pathname.startsWith("/api/judge"))
      return send(401, { error: "A GitHub OIDC token is needed.", code: "oidc_required" });
    if (route === "POST /api/judge") return send(202, { submission: submission("queued") });
    if (route === "GET /api/judge/sbm_1") return send(200, { submission: submission(state.verdicts.shift() ?? "passed") });
    return send(404, { error: "Not found" });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  state.url = `http://127.0.0.1:${server.address().port}`;
  return { state, close: () => new Promise((resolve) => server.close(resolve)) };
}

function deps({ env = {}, files = {}, changed = Object.keys(files) } = {}) {
  const out = [];
  const err = [];
  let clock = Date.parse("2026-11-12T00:00:00.000Z");
  return {
    out,
    err,
    deps: {
      env: { LUNOX_CREDENTIALS: join(scratch, "credentials"), ...env },
      out: (text) => out.push(text),
      err: (text) => err.push(text),
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
      fetchImpl: fetch,
      git: (args) => {
        assert.deepEqual(args.slice(0, 4), ["diff", "--name-only", "--diff-filter=AM", "-z"]);
        return `${changed.join("\0")}\0`;
      },
      readFile: (path) => {
        const name = Object.keys(files).find((each) => path.endsWith(each));
        return Buffer.from(files[name]);
      },
    },
  };
}

const specs = join(scratch, "specs");
function spec(slug, { confirm = true } = {}) {
  const dir = join(specs, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "ticket.md"), "# Accept duration strings\n\nPeople keep getting timeouts wrong.\n");
  writeFileSync(join(dir, "spec.md"), "# Duration strings\n\n```gherkin\nFeature: Durations\n```\n");
  if (confirm) {
    const { hash } = confirmation(slug);
    writeFileSync(join(dir, "confirmed.json"), JSON.stringify({ sha256: hash, by: "Ada", at: "2026-11-12T00:00:00.000Z" }));
  }
}

try {
  // titleOf: the first heading, else the first line.
  assert.equal(titleOf("intro\n# Heading\n"), "Heading");
  assert.equal(titleOf("\n  just a line\nmore"), "just a line");

  // push: posted once as a bounty, named again after; --again posts anew.
  {
    const platform = await fakePlatform();
    writeCredentials(join(scratch, "credentials"), {
      [platform.state.url]: { duediligence: { token: SECRET, organizationId: "org_acme", organizationHandle: "acme" } },
    });
    spec("durations");
    const first = deps({ env: { LUNOX_PLATFORM_URL: platform.state.url } });
    assert.equal(await run("push", ["durations"], CLIENT, first.deps), 0);
    const posted = platform.state.requests.at(-1);
    assert.equal(posted.path, "/api/v1/orgs/org_acme/bounties");
    assert.equal(posted.body.title, "Accept duration strings");
    assert.match(posted.body.description, /Feature: Durations/);
    assert.match(first.out.join(""), /bounty bty_1 in @acme/);
    assert.equal(first.out.join("").includes(SECRET), false);
    const record = JSON.parse(readFileSync(join(specs, "durations", "platform.json"), "utf8"));
    assert.equal(record.bountyId, "bty_1");
    assert.equal(record.confirmedBy, "Ada");

    const again = deps({ env: { LUNOX_PLATFORM_URL: platform.state.url } });
    assert.equal(await run("push", ["durations"], CLIENT, again.deps), 0);
    assert.equal(platform.state.bounties, 1);
    assert.match(again.out.join(""), /is bounty bty_1/);
    assert.equal(await run("push", ["durations", "--again"], CLIENT, again.deps), 0);
    assert.equal(platform.state.bounties, 2);

    // Not confirmed, or not signed in: refused before anything is sent.
    spec("draft", { confirm: false });
    const draft = deps({ env: { LUNOX_PLATFORM_URL: platform.state.url } });
    assert.equal(await run("push", ["draft"], CLIENT, draft.deps), 1);
    assert.match(draft.err.join(""), /never been confirmed/);
    const anonymous = deps({ env: { LUNOX_PLATFORM_URL: platform.state.url, LUNOX_CREDENTIALS: join(scratch, "none") } });
    assert.equal(await run("push", ["durations", "--again"], CLIENT, anonymous.deps), 1);
    assert.match(anonymous.err.join(""), /Not signed in/);
    assert.equal(platform.state.bounties, 2);
    const usage = deps();
    assert.equal(await run("push", [], CLIENT, usage.deps), 1);
    assert.match(usage.out.join(""), /usage: duediligence push <slug>/);
    await platform.close();
  }

  // ci --platform: the PR's files with the OIDC token, polled to a verdict.
  for (const [verdict, code] of [
    ["passed", 0],
    ["overfit", 2],
    ["refused", 1],
  ]) {
    const platform = await fakePlatform({ verdicts: ["running", verdict] });
    const summary = join(scratch, `summary-${verdict}.md`);
    const world = deps({
      env: {
        ACTIONS_ID_TOKEN_REQUEST_URL: `${platform.state.url}/oidc?api-version=2.0`,
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "actions-request-token",
        GITHUB_BASE_REF: "main",
        GITHUB_STEP_SUMMARY: summary,
      },
      files: { "src/a.ts": "export const a = 1;\n", "logo.png": "\u0000binary" },
    });
    const exit = await run(
      "ci",
      ["--platform=", "--version", "sbv_1", "--workspace", "org_acme", "--platform", platform.state.url],
      CLIENT,
      world.deps,
    );
    assert.equal(exit, code, verdict);
    const sent = platform.state.requests.find((each) => each.path === "/api/judge");
    assert.deepEqual(sent.body, { workspace: "org_acme", versionId: "sbv_1", files: [{ path: "src/a.ts", text: "export const a = 1;\n" }] });
    assert.equal(sent.auth, `Bearer ${OIDC}`);
    // A fresh token for each call, as one lasts minutes.
    assert.equal(platform.state.requests.filter((each) => each.path === "/oidc").length, 3);
    assert.match(world.err.join(""), /skipped logo.png/);
    const printed = world.out.join("");
    assert.match(printed, new RegExp(`duediligence \\(platform\\): ${verdict}`));
    if (verdict === "overfit") assert.match(printed, /failing scenarios: s2/);
    if (verdict === "refused") assert.match(printed, /refused src\/a.ts/);
    assert.match(readFileSync(summary, "utf8"), new RegExp(`### duediligence \\(platform\\): ${verdict}`));
    await platform.close();
  }

  // Without an OIDC token, without arguments, or with nothing changed.
  {
    const bare = deps({ files: { "src/a.ts": "a" } });
    assert.equal(await run("ci", ["--platform=", "--version", "sbv_1", "--workspace", "org_acme"], CLIENT, bare.deps), 1);
    assert.match(bare.err.join(""), /id-token: write/);
    const usage = deps();
    assert.equal(await run("ci", ["--platform="], CLIENT, usage.deps), 1);
    assert.match(usage.out.join(""), /usage: duediligence ci --platform/);
    const quiet = deps({ files: {} });
    assert.equal(await run("ci", ["--platform=", "--version", "sbv_1", "--workspace", "org_acme"], CLIENT, quiet.deps), 0);
    assert.match(quiet.out.join(""), /nothing to judge/);
    const zero = deps({
      env: {},
      files: { "src/a.ts": "a" },
    });
    // --exit-zero still needs a token to submit.
    assert.equal(await run("ci", ["--platform=", "--version", "v", "--workspace", "w", "--exit-zero"], CLIENT, zero.deps), 1);
  }
  console.log("hosted: push and ci --platform ok");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
