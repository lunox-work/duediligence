// The hosted platform (sandbox-factory, platform.lunox.work) as this CLI
// talks to it: the base URL, the shared credentials file, and one request
// function on `fetch`, so duediligence keeps no runtime dependency. Nothing
// here runs unless a platform command (`login`, `whoami`, `logout`) is
// called; every other command stays local. Not named platform.mjs, which is
// the host-OS layer.
//
// Credentials: `~/.lunox/credentials` (LUNOX_CREDENTIALS moves it), JSON,
// mode 600 in a 700 folder, written whole through a rename. carveout shares
// the file, so each CLI keeps its own entry under the platform's URL:
//
//   { "https://platform.lunox.work": {
//       "duediligence": { token, organizationId, organizationHandle, client, createdAt, expiresAt },
//       "carveout": { ... } } }
//
// A token is minted for one client with that client's scopes, so the two
// CLIs never share one; writing an entry keeps every other.

import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const DEFAULT_PLATFORM = "https://platform.lunox.work";
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export class PlatformError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = "PlatformError";
    this.status = status;
    this.code = code;
  }
}

/** `--platform`, else LUNOX_PLATFORM_URL, else production; no trailing slash. HTTPS, or plain HTTP to this machine only. */
export function platformUrl(given, env = process.env) {
  const raw = given ?? env.LUNOX_PLATFORM_URL ?? DEFAULT_PLATFORM;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new PlatformError(`${raw} is not a URL.`);
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.has(url.hostname))) {
    throw new PlatformError(`${raw}: the platform must be https:// (plain http only on localhost).`);
  }
  url.search = "";
  url.hash = "";
  return url.href.replace(/\/+$/, "");
}

export function credentialsPath(env = process.env) {
  return env.LUNOX_CREDENTIALS ?? join(homedir(), ".lunox", "credentials");
}

/** The whole file, `{}` when there is none. A file that is not a JSON object is refused, never overwritten. */
export function readCredentials(path) {
  if (!existsSync(path)) return {};
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new PlatformError(`${path} is not valid JSON (${error.message}); fix or remove it.`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PlatformError(`${path} does not hold a JSON object; fix or remove it.`);
  }
  return parsed;
}

/** Writes the file whole: a 600 temp file beside it, renamed over it. Removes it when nothing is left. */
export function writeCredentials(path, all) {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
  }
  if (Object.keys(all).length === 0) {
    rmSync(path, { force: true });
    return;
  }
  const temp = join(dir, `.credentials-${process.pid}-${randomBytes(6).toString("hex")}.tmp`);
  try {
    writeFileSync(temp, `${JSON.stringify(all, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    chmodSync(temp, 0o600);
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

/** This client's entry for a platform, or undefined. */
export function credentialFor(path, base, client) {
  const entry = readCredentials(path)[base]?.[client];
  return entry && typeof entry.token === "string" ? entry : undefined;
}

/** Sets (or, with `entry` undefined, removes) this client's entry, keeping every other. */
export function saveCredential(path, base, client, entry) {
  const all = readCredentials(path);
  const forBase = { ...(all[base] ?? {}) };
  if (entry === undefined) delete forBase[client];
  else forBase[client] = entry;
  if (Object.keys(forBase).length === 0) delete all[base];
  else all[base] = forBase;
  writeCredentials(path, all);
}

/** The minimum version a 426 names, wherever the body puts it. */
function minimumOf(body) {
  const named = body?.minimumVersion ?? body?.minimum_version ?? body?.minimum;
  if (typeof named === "string") return named;
  return /\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/.exec(body?.error ?? "")?.[0];
}

/**
 * One call to the platform's API. Sends the token as a bearer, the client
 * and its version as `User-Agent` and `Lunox-Client-Version`
 * (`<client>/<version>`), and JSON. Answers the parsed body; throws a
 * PlatformError whose message says what to do: 401 → sign in again, 426 →
 * upgrade, otherwise the API's own `{ error, code }`. `session` marks the
 * token as a device sign-in's session rather than a saved API token.
 */
export async function request({ base, token, session = false, method = "GET", path, body, client, version, fetchImpl = fetch }) {
  const headers = {
    Accept: "application/json",
    "User-Agent": `${client}/${version}`,
    "Lunox-Client-Version": `${client}/${version}`,
  };
  if (token !== undefined) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetchImpl(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new PlatformError(`Could not reach ${base}: ${error.cause?.message ?? error.message}`);
  }
  const text = await response.text();
  let parsed;
  try {
    parsed = text === "" ? undefined : JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  if (response.ok) return parsed ?? {};
  const status = response.status;
  const code = typeof parsed?.code === "string" ? parsed.code : typeof parsed?.error === "string" && !parsed.error.includes(" ") ? parsed.error : undefined;
  if (status === 426) {
    const minimum = minimumOf(parsed);
    throw new PlatformError(
      `${base} needs a newer ${client}${minimum ? `: upgrade to at least ${minimum}` : ""} (this is ${version}). npm i -g ${client}@latest`,
      { status, code },
    );
  }
  if (status === 401 && token !== undefined) {
    const what = session ? "The browser sign-in" : "The saved sign-in";
    throw new PlatformError(`${what} for ${base} is no longer valid (expired or revoked). Run \`${client} login\` again.`, {
      status,
      code,
    });
  }
  const said = parsed?.error_description ?? parsed?.error ?? parsed?.message;
  throw new PlatformError(
    typeof said === "string" ? `${said}${code && code !== said ? ` (${code})` : ""}` : `${method} ${path}: HTTP ${status}`,
    { status, code },
  );
}
