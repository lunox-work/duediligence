#!/usr/bin/env node
// `login`, `whoami` and `logout` (bin/account.mjs) against a fake platform on
// node:http, never the real one: the device flow's polling (pending,
// slow_down, approval, denial, expiry) on a virtual clock, the workspace
// choice, the credentials file (contents, mode 600, the other CLI's entry
// kept), the token never printed, a 401 and a 426, and the CLI wiring in a
// child process.
//
//   node test/platform.mjs

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { run } from "../bin/account.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT = { client: "duediligence", version: "9.9.9" };
const SECRET = "lnx_s3cr3t-never-printed-0123456789";
const SESSION = "devsession0123456789abcdef";
const scratch = mkdtempSync(join(tmpdir(), "duediligence-platform-"));

const ORGS = {
  acme: { id: "org_acme", name: "Acme", slug: "acme", kind: "team", role: "owner" },
  beta: { id: "org_beta", name: "Beta Labs", slug: "beta", kind: "team", role: "member,admin" },
  gamma: { id: "org_gamma", name: "Gamma", slug: "gamma", kind: "team", role: "member" },
};
const USER = { id: "usr_1", email: "ada@example.com", name: "Ada", username: "ada" };

/** A platform with just the routes the CLI calls. `polls` scripts the token endpoint's answers in order. */
async function fakePlatform({ polls = ["ok"], orgs = [ORGS.acme], expiresIn = 900, interval = 5, minimum } = {}) {
  const state = { requests: [], polls: [...polls], orgs, sessions: new Set(), tokens: new Map(), signOuts: 0, minted: [] };
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw === "" ? undefined : JSON.parse(raw);
    const url = new URL(req.url, "http://x");
    state.requests.push({ method: req.method, path: url.pathname, headers: req.headers, body });
    const send = (status, json) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    };
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
    const session = bearer !== undefined && state.sessions.has(bearer);
    const token = bearer === undefined ? undefined : state.tokens.get(bearer);
    if (minimum !== undefined) return send(426, { error: `This client is too old; ${minimum} or later is needed.`, minimumVersion: minimum });
    const route = `${req.method} ${url.pathname}`;
    if (route === "POST /api/auth/device/code") {
      if (!["duediligence", "carveout"].includes(body?.client_id)) return send(400, { error: "invalid_client", error_description: "Invalid client ID" });
      return send(200, {
        device_code: "dc_1",
        user_code: "WXYZ2345",
        verification_uri: `${state.url}/device`,
        verification_uri_complete: `${state.url}/device?user_code=WXYZ2345`,
        expires_in: expiresIn,
        interval,
      });
    }
    if (route === "POST /api/auth/device/token") {
      if (body?.grant_type !== "urn:ietf:params:oauth:grant-type:device_code" || body?.device_code !== "dc_1" || body?.client_id !== "duediligence") {
        return send(400, { error: "invalid_grant", error_description: "Invalid device code" });
      }
      const next = state.polls.shift() ?? "pending";
      const errors = { pending: "authorization_pending", slow_down: "slow_down", expired: "expired_token", denied: "access_denied" };
      if (next !== "ok") return send(400, { error: errors[next], error_description: next });
      state.sessions.add(SESSION);
      return send(200, { access_token: SESSION, token_type: "Bearer", expires_in: 604800, scope: "" });
    }
    if (route === "POST /api/auth/sign-out") {
      state.signOuts += 1;
      state.sessions.delete(bearer);
      return send(200, { success: true });
    }
    if (route === "GET /api/v1/me") {
      if (!session && (token === undefined || token.revoked)) return send(401, { error: "This API token is not valid.", code: "invalid_token" });
      return send(200, { user: USER });
    }
    if (route === "GET /api/v1/me/orgs") {
      if (!session) return send(401, { error: "Authentication required." });
      return send(200, { organizations: state.orgs });
    }
    const org = /^\/api\/v1\/orgs\/([^/]+)(\/tokens\/cli)?$/.exec(url.pathname);
    if (org && req.method === "GET" && !org[2]) {
      if (token === undefined || token.revoked) return send(401, { error: "This API token is not valid.", code: "invalid_token" });
      const found = Object.values(ORGS).find((each) => each.id === org[1]);
      if (found === undefined || token.organizationId !== found.id) return send(404, { error: "Not found" });
      const { role, ...organization } = found;
      return send(200, { organization, role });
    }
    if (org && req.method === "POST" && org[2]) {
      if (!session) return send(403, { error: "Mint a CLI token with the session a device sign-in returned.", code: "device_session_required" });
      const found = state.orgs.find((each) => each.id === org[1]);
      if (found === undefined) return send(404, { error: "Not found" });
      if (!/owner|admin/.test(found.role)) return send(403, { error: "Only owners and admins can manage API tokens." });
      if (body?.client !== "duediligence") return send(403, { error: "This sign-in was approved for another client.", code: "client_mismatch" });
      state.sessions.delete(bearer);
      state.tokens.set(SECRET, { organizationId: found.id, revoked: false });
      state.minted.push({ org: found.id, body });
      return send(201, {
        token: {
          id: "tok_1",
          name: `duediligence CLI on ${body.label}`,
          prefix: "lnx_s3cr",
          scopes: ["workspace:read"],
          createdBy: { id: USER.id, name: USER.name },
          createdAt: "2026-11-12T01:00:00.000Z",
          expiresAt: "2027-02-10T01:00:00.000Z",
          lastUsedAt: null,
          revokedAt: null,
        },
        secret: SECRET,
      });
    }
    send(404, { error: "Not found" });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  state.url = `http://127.0.0.1:${server.address().port}`;
  return { url: state.url, state, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** The outside world for one run: a virtual clock, captured output, scripted answers. */
function world(url, credentials, { isTTY = false, answers = [] } = {}) {
  let clock = 1_000_000;
  const w = {
    env: { LUNOX_PLATFORM_URL: url, LUNOX_CREDENTIALS: credentials },
    output: "",
    errors: "",
    slept: [],
    opened: [],
    asked: [],
    out: (text) => (w.output += text),
    err: (text) => (w.errors += text),
    isTTY,
    ask: async (question) => (w.asked.push(question), answers.shift() ?? ""),
    sleep: async (ms) => (w.slept.push(ms), (clock += ms)),
    now: () => clock,
    fetchImpl: fetch,
    openUrl: (page) => w.opened.push(page),
    hostname: () => "build-box",
  };
  return w;
}

let n = 0;
const fresh = () => join(scratch, `case-${++n}`, "lunox", "credentials");
const step = async (name, fn) => {
  await fn();
  console.log(`ok ${name}`);
};

try {
  await step("login: pending, slow_down, approval; file written 600, other entries kept, token never printed", async () => {
    const platform = await fakePlatform({ polls: ["pending", "slow_down", "pending", "ok"] });
    const credentials = fresh();
    const other = {
      [platform.url]: { carveout: { token: "lnx_carveout", organizationId: "org_acme", organizationHandle: "acme", client: "carveout" } },
      "https://elsewhere.example": { duediligence: { token: "lnx_elsewhere", organizationId: "o", organizationHandle: "o", client: "duediligence" } },
    };
    const w = world(platform.url, credentials);
    // Written by the other CLI first: login must keep it.
    await import("../bin/platform-client.mjs").then(({ writeCredentials }) => writeCredentials(credentials, other));
    assert.equal(await run("login", ["--open"], CLIENT, w), 0, w.errors);
    assert.deepEqual(w.slept, [5000, 5000, 10000, 10000], "interval 5 s, plus 5 s after slow_down");
    assert.match(w.output, new RegExp(`${platform.url}/device\\?user_code=WXYZ2345`));
    assert.match(w.output, /Code: WXYZ2345/);
    assert.match(w.output, /Signed in as Ada <ada@example\.com>, workspace Acme \(@acme\)/);
    assert.deepEqual(w.opened, [`${platform.url}/device?user_code=WXYZ2345`]);
    assert.ok(!w.output.includes(SECRET) && !w.errors.includes(SECRET), "the token is never printed");
    assert.ok(!w.output.includes(SESSION) && !w.errors.includes(SESSION), "the session is never printed");
    const saved = JSON.parse(readFileSync(credentials, "utf8"));
    assert.deepEqual(saved[platform.url].duediligence, {
      token: SECRET,
      organizationId: "org_acme",
      organizationHandle: "acme",
      client: "duediligence",
      createdAt: "2026-11-12T01:00:00.000Z",
      expiresAt: "2027-02-10T01:00:00.000Z",
    });
    assert.deepEqual(saved[platform.url].carveout, other[platform.url].carveout);
    assert.deepEqual(saved["https://elsewhere.example"], other["https://elsewhere.example"]);
    if (process.platform !== "win32") {
      assert.equal(statSync(credentials).mode & 0o777, 0o600);
      assert.equal(statSync(dirname(credentials)).mode & 0o777, 0o700);
    }
    const mint = platform.state.requests.find((r) => r.path.endsWith("/tokens/cli"));
    assert.deepEqual(mint.body, { client: "duediligence", label: "build-box" });
    assert.equal(mint.headers.authorization, `Bearer ${SESSION}`);
    for (const r of platform.state.requests) {
      assert.equal(r.headers["user-agent"], "duediligence/9.9.9");
      assert.equal(r.headers["lunox-client-version"], "duediligence/9.9.9");
    }
    const code = platform.state.requests.find((r) => r.path === "/api/auth/device/code");
    assert.deepEqual(code.body, { client_id: "duediligence" });
    assert.equal(platform.state.signOuts, 0, "minting ends the session; no sign-out needed");
    await platform.close();
  });

  await step("login: denied in the browser, nothing saved", async () => {
    const platform = await fakePlatform({ polls: ["pending", "denied"] });
    const credentials = fresh();
    const w = world(platform.url, credentials);
    assert.equal(await run("login", [], CLIENT, w), 1);
    assert.match(w.errors, /denied in the browser/);
    assert.ok(!existsSync(credentials));
    await platform.close();
  });

  await step("login: expired_token from the platform, and the code's own lifetime running out", async () => {
    const platform = await fakePlatform({ polls: ["pending", "expired"] });
    const w = world(platform.url, fresh());
    assert.equal(await run("login", [], CLIENT, w), 1);
    assert.match(w.errors, /expired before it was approved/);
    await platform.close();
    const slow = await fakePlatform({ polls: [], expiresIn: 12, interval: 5 });
    const w2 = world(slow.url, fresh());
    assert.equal(await run("login", [], CLIENT, w2), 1);
    assert.match(w2.errors, /expired before it was approved/);
    assert.deepEqual(w2.slept, [5000, 5000, 5000], "stops at the deadline without another poll");
    assert.equal(slow.state.requests.filter((r) => r.path === "/api/auth/device/token").length, 2);
    await slow.close();
  });

  await step("login: workspace choice (only admin one, --org, member refused, non-TTY with several, TTY prompt)", async () => {
    let platform = await fakePlatform({ orgs: [ORGS.gamma, ORGS.beta] });
    let w = world(platform.url, fresh());
    assert.equal(await run("login", [], CLIENT, w), 0, w.errors);
    assert.equal(platform.state.minted[0].org, "org_beta", "the only workspace it may mint in");
    await platform.close();

    platform = await fakePlatform({ orgs: [ORGS.acme, ORGS.beta] });
    w = world(platform.url, fresh());
    assert.equal(await run("login", [], CLIENT, w), 1);
    assert.match(w.errors, /2 workspaces; name one with --org/);
    assert.match(w.errors, /acme \(Acme, owner\) org_acme/);
    assert.match(w.errors, /beta \(Beta Labs, member,admin\) org_beta/);
    assert.equal(platform.state.signOuts, 1, "the unused session is ended");
    await platform.close();

    platform = await fakePlatform({ orgs: [ORGS.acme, ORGS.beta] });
    w = world(platform.url, fresh());
    assert.equal(await run("login", ["--org", "@beta"], CLIENT, w), 0, w.errors);
    assert.equal(platform.state.minted[0].org, "org_beta");
    await platform.close();

    platform = await fakePlatform({ orgs: [ORGS.acme, ORGS.gamma] });
    w = world(platform.url, fresh());
    assert.equal(await run("login", ["--org", "gamma"], CLIENT, w), 1);
    assert.match(w.errors, /You are member in gamma; only its owners and admins/);
    await platform.close();

    platform = await fakePlatform({ orgs: [ORGS.acme, ORGS.beta] });
    w = world(platform.url, fresh(), { isTTY: true, answers: ["7", "2"] });
    assert.equal(await run("login", [], CLIENT, w), 0, w.errors);
    assert.equal(w.asked.length, 2, "asks again after an answer out of range");
    assert.equal(platform.state.minted[0].org, "org_beta");
    await platform.close();
  });

  await step("whoami, then 401 once the token is revoked", async () => {
    const platform = await fakePlatform();
    const credentials = fresh();
    assert.equal(await run("login", [], CLIENT, world(platform.url, credentials)), 0);
    const w = world(platform.url, credentials);
    assert.equal(await run("whoami", [], CLIENT, w), 0, w.errors);
    assert.match(w.output, /user {7}Ada <ada@example\.com> \(@ada\)/);
    assert.match(w.output, /workspace {2}Acme \(@acme\), owner/);
    assert.match(w.output, /token {6}duediligence, expires 2027-02-10/);
    assert.equal(platform.state.requests.at(-1).headers.authorization, `Bearer ${SECRET}`);
    assert.ok(!w.output.includes(SECRET));
    platform.state.tokens.get(SECRET).revoked = true;
    const after = world(platform.url, credentials);
    assert.equal(await run("whoami", [], CLIENT, after), 1);
    assert.match(after.errors, /no longer valid \(expired or revoked\)\. Run `duediligence login` again\./);
    const none = world(platform.url, fresh());
    assert.equal(await run("whoami", [], CLIENT, none), 1);
    assert.match(none.errors, /Not signed in to .*Run `duediligence login`/);
    await platform.close();
  });

  await step("logout removes this CLI's entry only, and says the token is not revoked", async () => {
    const platform = await fakePlatform();
    const credentials = fresh();
    assert.equal(await run("login", [], CLIENT, world(platform.url, credentials)), 0);
    const all = JSON.parse(readFileSync(credentials, "utf8"));
    all[platform.url].carveout = { token: "lnx_carveout", organizationId: "org_acme", organizationHandle: "acme", client: "carveout" };
    writeFileSync(credentials, JSON.stringify(all));
    const w = world(platform.url, credentials);
    assert.equal(await run("logout", [], CLIENT, w), 0, w.errors);
    assert.match(w.output, /stays valid until 2027-02-10/);
    const left = JSON.parse(readFileSync(credentials, "utf8"));
    assert.equal(left[platform.url].duediligence, undefined);
    assert.equal(left[platform.url].carveout.token, "lnx_carveout");
    const again = world(platform.url, credentials);
    assert.equal(await run("logout", [], CLIENT, again), 0);
    assert.match(again.output, /Not signed in/);
    await platform.close();
  });

  await step("426 names the minimum version; a broken credentials file is left alone", async () => {
    const platform = await fakePlatform({ minimum: "0.4.0" });
    const w = world(platform.url, fresh());
    assert.equal(await run("login", [], CLIENT, w), 1);
    assert.match(w.errors, /upgrade to at least 0\.4\.0 \(this is 9\.9\.9\)/);
    await platform.close();
    const ok = await fakePlatform();
    const credentials = fresh();
    await import("node:fs").then(({ mkdirSync }) => mkdirSync(dirname(credentials), { recursive: true }));
    writeFileSync(credentials, "{ not json");
    const w2 = world(ok.url, credentials);
    assert.equal(await run("login", [], CLIENT, w2), 1);
    assert.match(w2.errors, /not valid JSON/);
    assert.equal(readFileSync(credentials, "utf8"), "{ not json");
    await ok.close();
  });

  await step("the CLI: help lists them, whoami's 401 and logout in a child process, http refused off loopback", async () => {
    const exec = promisify(execFile);
    const cli = (args, env) =>
      exec(process.execPath, [join(ROOT, "bin", "cli.mjs"), ...args], { env: { ...process.env, ...env } }).then(
        (r) => ({ code: 0, ...r }),
        (e) => ({ code: e.code, stdout: e.stdout, stderr: e.stderr }),
      );
    const help = await cli(["help"], {});
    assert.match(help.stderr, /login +sign in to the Lunox platform/);
    assert.match(help.stderr, /whoami/);
    assert.match(help.stderr, /logout/);
    const platform = await fakePlatform();
    const credentials = fresh();
    assert.equal(await run("login", [], CLIENT, world(platform.url, credentials)), 0);
    platform.state.tokens.get(SECRET).revoked = true;
    const env = { LUNOX_PLATFORM_URL: platform.url, LUNOX_CREDENTIALS: credentials };
    const who = await cli(["whoami"], env);
    assert.equal(who.code, 1);
    assert.match(who.stderr, /duediligence whoami: The saved sign-in .* Run `duediligence login` again\./);
    const out = await cli(["logout"], env);
    assert.equal(out.code, 0, out.stderr);
    assert.ok(!existsSync(credentials), "the last entry gone, the file goes too");
    const plain = await cli(["whoami", "--platform", "http://platform.example"], env);
    assert.equal(plain.code, 1);
    assert.match(plain.stderr, /must be https/);
    await platform.close();
  });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
