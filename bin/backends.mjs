// The writer backends other than claude-cli, which lib.mjs `session` loads
// on demand: `codex-cli`, `anthropic-api` and `exec`. Each takes the same
// options as lib.mjs `claudeCli`, writes the same transcript shape (Claude
// Code's stream-json: a `system`/`init` line, `assistant` lines whose
// content holds `text` and `tool_use` blocks with Claude Code's tool names
// and inputs, `user` lines with `tool_result` blocks, a final `result`
// line), so `peeks`, `audit` and every report read any backend's transcript
// unchanged, and resolves with the same record plus `backend`.
//
// Blindness by placement. claude-cli is held by Claude Code's deny rules
// (lib.mjs `sessionSettings`); these backends run what the writer does
// under an OS sandbox instead (`placement`): sandbox-exec on macOS, bwrap
// on Linux. Reads and writes are refused in the person's home, the
// package, HOME/SPECS/RUNS/RESULTS wherever they are, the transcripts,
// WORK_ROOT and the temp folders, except the session's own workdir and its
// state folder (WORK_ROOT/sessions/<id>/: CODEX_HOME, HOME, TMPDIR), which
// are the only writable places; the tool's own install and interpreters
// are readable. The staged workdir already holds only what the writer may
// see (lib.mjs `stage`), so a writer cannot reach a hidden suite at rest,
// another workdir, a judge tree or a transcript, whatever it runs.
//
// - codex-cli: the Codex CLI (@openai/codex, pinned, installed once under
//   HOME/backends/ with the pinned npm) on the person's own Codex login,
//   ~/.codex/auth.json copied into the session's CODEX_HOME and written
//   back if Codex refreshed it, then removed. Codex runs on the host under
//   `placement`, not in a container, and with its own sandbox off
//   (`--dangerously-bypass-approvals-and-sandbox`, the mode Codex documents
//   for an externally sandboxed run): the staged trees hold host toolchains
//   (a Python venv linked to the host interpreter, a repository base with
//   node_modules built for this OS) that a Linux container could not run,
//   and one sandbox over the whole process is simpler to check than two.
//   Model: a non-Claude `model`, else INDEPENDENT_TESTS_CODEX_MODEL, else
//   the person's ~/.codex/config.toml `model` and reasoning effort. Billing
//   is the Codex subscription, so costUsd is null. A usage or rate limit is
//   reported as apiError `usage_limit_reached`, which the callers halt on.
// - anthropic-api: Claude through the Messages API (ANTHROPIC_API_KEY,
//   ANTHROPIC_BASE_URL), the official SDK installed once under
//   HOME/backends/, a manual tool loop over Bash, Read, Write, Edit, Glob
//   and Grep. The file tools resolve every path inside the workdir (real
//   paths, so no symlink leaves it); Bash runs under `placement` without
//   network. Cost from usage at list prices, stopped at the kind's budget.
// - exec: any command (`command`, INDEPENDENT_TESTS_EXEC or toolchain.json
//   `exec`) run by sh in the workdir under `placement`, the prompt on its
//   stdin; its output is the transcript's one assistant message.
//
// `placement`'s denial is checked by evidence/backends.mjs `sandbox`, a
// negative test that reads a hidden-suite path and the home from inside.

import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_MODEL,
  HOME,
  PRIVATE,
  PYTHON,
  RESULTS,
  TRANSCRIPTS,
  WORK_ROOT,
  installEnv,
  killGroup,
  limits,
  listFiles,
  log,
  sha256,
  takeSlot,
} from "./lib.mjs";

export const CODEX_VERSION = "0.164.0";
export const SDK_VERSION = "0.137.0";
/** Per session: CODEX_HOME, HOME, TMPDIR, the API backend's messages. */
export const SESSIONS = join(WORK_ROOT, "sessions");

const inside = (path, folder) => path === folder || path.startsWith(`${folder}/`);
/** `path` made real as far as it exists (the sandboxes match real paths). */
export function real(path) {
  let at = resolve(path);
  const rest = [];
  while (!existsSync(at) && dirname(at) !== at) {
    rest.unshift(basename(at));
    at = dirname(at);
  }
  return join(realpathSync(at), ...rest);
}

/**
 * An npm package at an exact version, installed once with the pinned npm
 * under HOME/backends/<name>-<version>/ (a partial folder renamed, as
 * lib.mjs `ensureTemplate` does). Network once.
 */
export function installTool(name, spec, version) {
  const dest = join(HOME, "backends", `${name}-${version}`);
  if (existsSync(join(dest, ".installed.json"))) return dest;
  const partial = `${dest}.partial-${process.pid}`;
  rmSync(partial, { recursive: true, force: true });
  mkdirSync(partial, { recursive: true });
  writeFileSync(join(partial, "package.json"), `${JSON.stringify({ private: true })}\n`);
  log(`installing ${spec}@${version} into ${dest} (npm@10.9.2, once)`);
  const out = spawnSync("npx", ["-y", "npm@10.9.2", "install", "--no-audit", "--no-fund", "--save-exact", `${spec}@${version}`], {
    cwd: partial,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: installEnv(),
  });
  if (out.status !== 0) {
    rmSync(partial, { recursive: true, force: true });
    throw new Error(`installing ${spec}@${version} failed:\n${`${out.error ?? ""}${out.stdout}${out.stderr}`.slice(-4000)}`);
  }
  writeFileSync(join(partial, ".installed.json"), `${JSON.stringify({ spec, version, at: new Date().toISOString() })}\n`);
  if (existsSync(join(dest, ".installed.json"))) rmSync(partial, { recursive: true, force: true });
  else {
    rmSync(dest, { recursive: true, force: true });
    renameSync(partial, dest);
  }
  return dest;
}

/** The install prefix of a binary (two folders above its real path), for the sandbox's read list. */
function prefixOf(bin) {
  const found = bin.includes("/") ? bin : spawnSync("sh", ["-c", `command -v ${bin}`], { encoding: "utf8" }).stdout.trim();
  if (found === "" || !existsSync(found)) return null;
  return dirname(dirname(realpathSync(found)));
}

/**
 * What a placed process may not read or write, what it may only read, and
 * what it may write. `read` adds the tool's own install. A readable or
 * writable path that holds a private folder is refused outright.
 */
export function placementPaths({ cwd, state, read = [] }) {
  const temp = real(tmpdir());
  const denied = [
    homedir(),
    ...PRIVATE,
    RESULTS,
    TRANSCRIPTS,
    WORK_ROOT,
    temp,
    // macOS: the per-user folder above TMPDIR (T/, C/, 0/).
    ...(process.platform === "darwin" && temp.startsWith("/private/var/folders/") ? [dirname(temp)] : []),
    process.platform === "darwin" ? "/private/tmp" : "/tmp",
    ...(process.platform === "darwin" ? ["/Volumes"] : []),
  ];
  const deny = [...new Set(denied.map(real))].filter((path) => path !== "/").sort();
  const extra = (process.env.INDEPENDENT_TESTS_SANDBOX_READ ?? "").split(":").filter(Boolean);
  // Only what a denied folder would hide needs naming; anything else is readable already.
  const readable = [...new Set([...read, prefixOf(process.execPath), prefixOf(PYTHON), ...extra].filter(Boolean).map(real))]
    .filter((path) => deny.some((folder) => inside(path, folder)))
    .sort();
  const writable = [cwd, state].map(real);
  for (const path of [...readable, ...writable])
    for (const folder of PRIVATE.map(real))
      if (inside(folder, path)) throw new Error(`The sandbox may not open ${path}: it holds ${folder}.`);
  return { deny, readable, writable };
}

const sbpl = (path) => `"${path.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
/** The macOS sandbox profile: the last matching rule wins, so the allows follow the denies. */
export function seatbeltProfile({ deny, readable, writable }, network) {
  const paths = (list) => list.map((path) => `(subpath ${sbpl(path)})`).join(" ");
  // Resolving a real path stats every folder above it: those folders' own
  // metadata, never their listing or contents.
  const above = new Set();
  for (const path of [...readable, ...writable])
    for (let at = dirname(path); at !== "/" && deny.some((folder) => inside(at, folder)); at = dirname(at)) above.add(at);
  return [
    "(version 1)",
    "(allow default)",
    `(deny file-read* file-write* ${paths(deny)})`,
    ...(above.size > 0 ? [`(allow file-read-metadata ${[...above].sort().map((path) => `(literal ${sbpl(path)})`).join(" ")})`] : []),
    ...(readable.length > 0 ? [`(allow file-read* ${paths(readable)})`] : []),
    "(deny file-write*)",
    '(allow file-write* (literal "/dev/null") (literal "/dev/zero") (literal "/dev/tty") (literal "/dev/dtracehelper") (regex #"^/dev/fd/") (regex #"^/dev/ttys") (literal "/dev/ptmx"))',
    `(allow file-read* file-write* ${paths(writable)})`,
    ...(network ? [] : ["(deny network*)"]),
  ].join("\n");
}

/** The Linux equivalent: bwrap over a read-only root, the denied folders blanked, the workdir and state bound. */
export function bwrapArgs({ deny, readable, writable }, network, cwd) {
  const out = ["--die-with-parent", "--new-session", "--unshare-all", ...(network ? ["--share-net"] : []), "--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc"];
  for (const path of deny) {
    if (!existsSync(path)) continue;
    out.push(...(statSync(path).isDirectory() ? ["--tmpfs", path] : ["--ro-bind", "/dev/null", path]));
  }
  for (const path of readable) if (existsSync(path)) out.push("--ro-bind", path, path);
  for (const path of writable) out.push("--bind", path, path);
  out.push("--chdir", cwd);
  return out;
}

/** `bin argv` wrapped in the platform's sandbox: [bin, argv]. */
export function placement(bin, argv, { cwd, state, read = [], network = true }) {
  const paths = placementPaths({ cwd, state, read });
  if (process.platform === "darwin") return ["/usr/bin/sandbox-exec", ["-p", seatbeltProfile(paths, network), bin, ...argv]];
  if (process.platform === "linux") {
    const found = spawnSync("sh", ["-c", "command -v bwrap"], { encoding: "utf8" }).stdout.trim();
    if (found === "") throw new Error("No bwrap on PATH: a non-Claude backend on Linux needs bubblewrap for its sandbox.");
    return [found, [...bwrapArgs(paths, network, cwd), "--", bin, ...argv]];
  }
  throw new Error(`No sandbox for ${process.platform}: non-Claude backends run on macOS or Linux.`);
}

/** A session's state folder, kept across a resume of the same transcript and cleared on a fresh start. */
function stateOf(transcript, resume) {
  const dir = join(SESSIONS, sha256(transcript).slice(0, 16));
  if (!resume) rmSync(dir, { recursive: true, force: true });
  for (const sub of ["home", "tmp"]) mkdirSync(join(dir, sub), { recursive: true });
  return dir;
}

/** The environment a placed process starts with: nothing of the caller's but the basics. */
function childEnv(state, extra = {}) {
  const keep = ["PATH", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "USER", "LOGNAME", "SHELL"];
  return {
    ...Object.fromEntries(keep.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]])),
    HOME: join(state, "home"),
    TMPDIR: join(state, "tmp"),
    ...extra,
  };
}

/** Appends Claude Code stream-json lines, each stamped with its time. */
function transcriptWriter(path, resume) {
  mkdirSync(dirname(path), { recursive: true });
  if (!resume) writeFileSync(path, "");
  return (event) => appendFileSync(path, `${JSON.stringify({ ...event, timestamp: new Date().toISOString() })}\n`);
}
const toolUse = (id, name, input) => ({ type: "tool_use", id, name, input });
const assistant = (content) => ({ type: "assistant", message: { role: "assistant", content } });
const toolResults = (results) => ({ type: "user", message: { role: "user", content: results } });
const LIMITED = /usage limit|rate.?limit|quota|too many requests|429|out of credits|add credits/i;

/** Runs a placed child to its end or its time limit: { code, timedOut, stderr }, stdout line by line to `onLine`. */
function runChild(bin, argv, { cwd, env, input, minutes, onLine }) {
  return new Promise((done) => {
    // A group leader, its group killed when it closes: nothing it started outlives the session.
    const child = spawn(bin, argv, { cwd, env, stdio: ["pipe", "pipe", "pipe"], detached: true });
    const reap = () => killGroup(child.pid);
    process.once("exit", reap);
    child.on("exit", reap);
    let stderr = "";
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) onLine(line);
    });
    child.stderr.on("data", (chunk) => (stderr = (stderr + chunk).slice(-20_000)));
    child.stdin.on("error", () => {});
    child.stdin.end(input);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 10_000).unref();
    }, minutes * 60_000);
    child.on("error", (error) => (stderr += String(error)));
    child.on("close", (code) => {
      clearTimeout(timer);
      reap();
      process.removeListener("exit", reap);
      if (buffer !== "") onLine(buffer);
      done({ code, timedOut, stderr });
    });
  });
}

/** The person's Codex settings worth keeping: top-level `model` and `model_reasoning_effort`, nothing else (no MCP servers, plugins or notify hooks). */
function codexSettings() {
  const source = join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "config.toml");
  const text = existsSync(source) ? readFileSync(source, "utf8") : "";
  const top = text.split(/^\[/m)[0];
  const pick = (key) => new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m").exec(top)?.[1] ?? null;
  return { model: pick("model"), effort: pick("model_reasoning_effort") };
}

const CODEX_OFF = ["apps", "plugins", "remote_plugin", "browser_use", "browser_use_external", "in_app_browser", "computer_use", "image_generation", "hooks", "multi_agent", "skill_search", "skill_mcp_dependency_install", "tool_suggest"];

async function codexCli({ cwd, text, transcript, kind, resume, model, chain }) {
  const { minutes } = limits(kind, chain);
  const install = installTool("codex", "@openai/codex", CODEX_VERSION);
  const state = stateOf(transcript, resume);
  const codexHome = join(state, "codex");
  mkdirSync(codexHome, { recursive: true });
  const settings = codexSettings();
  const chosen = (model && !/^claude/.test(model) ? model : null) ?? process.env.INDEPENDENT_TESTS_CODEX_MODEL ?? settings.model;
  // A writer gets the shell and file edits only: no web search, ChatGPT
  // apps (the person's connected accounts), plugins, browser, computer use,
  // hooks, sub-agents or image generation.
  writeFileSync(
    join(codexHome, "config.toml"),
    [
      chosen && `model = "${chosen}"`,
      settings.effort && `model_reasoning_effort = "${settings.effort}"`,
      'web_search = "disabled"',
      "",
      "[features]",
      ...CODEX_OFF.map((feature) => `${feature} = false`),
    ]
      .filter((line) => typeof line === "string")
      .join("\n") + "\n",
  );
  const authSource = join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "auth.json");
  const authCopy = join(codexHome, "auth.json");
  const authBefore = existsSync(authSource) ? readFileSync(authSource) : null;
  if (authBefore !== null) writeFileSync(authCopy, authBefore, { mode: 0o600 });
  const flags = ["--json", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox", "--ignore-rules", "--strict-config"];
  const argv = [
    join(install, "node_modules", "@openai", "codex", "bin", "codex.js"),
    "exec",
    ...(resume ? ["resume", resume, ...flags, "-"] : [...flags, "-C", cwd, "-"]),
  ];
  const [bin, wrapped] = placement(process.execPath, argv, { cwd, state, read: [install] });
  const write = transcriptWriter(transcript, resume);
  const raw = transcript.replace(/(\.jsonl)?$/, ".codex.jsonl");
  if (!resume) writeFileSync(raw, "");
  const env = childEnv(state, { CODEX_HOME: codexHome });
  for (const key of ["OPENAI_API_KEY", "CODEX_API_KEY"]) if (process.env[key]) env[key] = process.env[key];

  const slot = await takeSlot();
  const started = Date.now();
  let sessionId = resume ?? null;
  let finalText = "";
  let turns = 0;
  let usage = null;
  let failure = null;
  let completed = false;
  const { code, timedOut, stderr } = await (async () => {
    try {
      return await runChild(bin, wrapped, {
        cwd,
        env,
        input: text,
        minutes,
        onLine: (line) => {
          if (!line.startsWith("{")) return;
          appendFileSync(raw, `${line}\n`);
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            return;
          }
          if (event.type === "thread.started") {
            sessionId = event.thread_id;
            write({ type: "system", subtype: "init", session_id: sessionId, model: chosen, cwd, backend: "codex-cli", resumed: resume ?? null });
          } else if (event.type === "turn.completed") {
            completed = true;
            usage = event.usage ?? null;
          } else if (event.type === "turn.failed") failure = event.error?.message ?? "turn failed";
          else if (event.type === "error") failure = event.message ?? "error";
          else if (event.type === "item.completed") {
            const item = event.item ?? {};
            if (item.type === "agent_message") {
              finalText = item.text ?? "";
              turns += 1;
              write(assistant([{ type: "text", text: finalText }]));
            } else if (item.type === "command_execution") {
              turns += 1;
              write(assistant([toolUse(item.id, "Bash", { command: item.command })]));
              write(toolResults([{ type: "tool_result", tool_use_id: item.id, content: (item.aggregated_output ?? "").slice(-4000), is_error: item.exit_code !== 0 }]));
            } else if (item.type === "file_change") {
              turns += 1;
              const changes = item.changes ?? [];
              write(assistant(changes.map((change, at) => toolUse(`${item.id}-${at}`, change.kind === "add" ? "Write" : "Edit", { file_path: change.path, kind: change.kind }))));
              write(toolResults(changes.map((_, at) => ({ type: "tool_result", tool_use_id: `${item.id}-${at}`, content: item.status ?? "", is_error: item.status === "failed" }))));
            } else if (item.type === "error") failure = item.message ?? "error";
            else if (!["reasoning", "todo_list"].includes(item.type)) {
              turns += 1;
              const { id, type, ...input } = item;
              write(assistant([toolUse(id, type, input)]));
            }
          }
        },
      });
    } finally {
      rmSync(slot, { force: true });
      // A refreshed login goes back to the person's Codex home, unless it changed there meanwhile.
      if (existsSync(authCopy)) {
        const after = readFileSync(authCopy);
        const now = existsSync(authSource) ? readFileSync(authSource) : null;
        if (authBefore !== null && now !== null && now.equals(authBefore) && !after.equals(authBefore)) {
          writeFileSync(`${authSource}.partial-${process.pid}`, after, { mode: 0o600 });
          renameSync(`${authSource}.partial-${process.pid}`, authSource);
        }
        rmSync(authCopy, { force: true });
      }
    }
  })();
  const limitHit = [failure ?? "", completed ? "" : stderr].some((message) => LIMITED.test(message));
  const ok = code === 0 && completed && failure === null && !timedOut;
  const result = {
    sessionId,
    model: chosen,
    ok,
    exitCode: code,
    timedOut,
    costUsd: null,
    turns,
    durationMs: Date.now() - started,
    subtype: ok ? "success" : timedOut ? "error_timeout" : "error_during_execution",
    apiError: ok ? null : limitHit ? "usage_limit_reached" : failure === null ? null : "error",
    finalText: finalText || (failure ?? ""),
    stderr: stderr.slice(-2000),
    backend: "codex-cli",
  };
  write({ type: "result", subtype: result.subtype, is_error: !ok, session_id: sessionId, total_cost_usd: null, num_turns: turns, result: result.finalText, usage, api_error: result.apiError, backend: "codex-cli" });
  return result;
}

async function execBackend({ cwd, text, transcript, kind, resume, chain, command }) {
  const { minutes } = limits(kind, chain);
  const line = command ?? process.env.INDEPENDENT_TESTS_EXEC ?? chain?.exec;
  const write = transcriptWriter(transcript, resume);
  const sessionId = resume ?? randomUUID();
  const base = { sessionId, model: null, costUsd: null, turns: 1, apiError: null, backend: "exec" };
  if (typeof line !== "string" || line === "") {
    const finalText = "No command: set INDEPENDENT_TESTS_EXEC or toolchain.json `exec`.";
    write({ type: "result", subtype: "error_during_execution", is_error: true, session_id: sessionId, result: finalText, backend: "exec" });
    return { ...base, ok: false, exitCode: null, timedOut: false, durationMs: 0, subtype: "error_during_execution", finalText, stderr: "" };
  }
  const state = stateOf(transcript, resume);
  const [bin, argv] = placement("/bin/sh", ["-c", line], { cwd, state });
  const passed = (process.env.INDEPENDENT_TESTS_EXEC_ENV ?? "").split(",").filter((key) => key && process.env[key] !== undefined);
  const env = childEnv(state, Object.fromEntries(passed.map((key) => [key, process.env[key]])));
  write({ type: "system", subtype: "init", session_id: sessionId, model: null, cwd, backend: "exec", command: line });
  const slot = await takeSlot();
  const started = Date.now();
  let stdout = "";
  let outcome;
  try {
    outcome = await runChild(bin, argv, { cwd, env, input: text, minutes, onLine: (out) => (stdout = `${stdout}${out}\n`.slice(-100_000)) });
  } finally {
    rmSync(slot, { force: true });
  }
  const ok = outcome.code === 0 && !outcome.timedOut;
  const finalText = stdout.trim().slice(-20_000);
  write(assistant([{ type: "text", text: finalText }]));
  const subtype = ok ? "success" : outcome.timedOut ? "error_timeout" : "error_during_execution";
  write({ type: "result", subtype, is_error: !ok, session_id: sessionId, total_cost_usd: null, num_turns: 1, result: finalText, backend: "exec" });
  return { ...base, ok, exitCode: outcome.code, timedOut: outcome.timedOut, durationMs: Date.now() - started, subtype, finalText, stderr: outcome.stderr.slice(-2000) };
}

// ---- anthropic-api ----

/** List prices per million tokens (claude-api skill, cached 2026-10-06); a cache write costs 1.25x input. */
const PRICES = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};
/** Models that take the server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_MODELS = ["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"];
const costOf = (model, usage) => {
  const price = PRICES[model];
  if (price === undefined || usage === undefined) return 0;
  return (
    ((usage.input_tokens ?? 0) * price.input +
      (usage.cache_creation_input_tokens ?? 0) * price.input * 1.25 +
      (usage.cache_read_input_tokens ?? 0) * price.cacheRead +
      (usage.output_tokens ?? 0) * price.output) /
    1e6
  );
};

/** The SDK's Anthropic class, from its pinned install under HOME/backends/. */
async function anthropicSdk() {
  const install = installTool("anthropic-sdk", "@anthropic-ai/sdk", SDK_VERSION);
  const entry = createRequire(join(install, "package.json")).resolve("@anthropic-ai/sdk");
  const mod = await import(pathToFileURL(entry).href);
  return mod.default?.default ?? mod.default ?? mod.Anthropic;
}

const TOOL_DEFS = [
  {
    name: "Bash",
    description: "Run a shell command in the working directory (bash -c, no network). Returns its output and exit code.",
    input_schema: { type: "object", properties: { command: { type: "string" }, timeout: { type: "number", description: "milliseconds, at most 600000" } }, required: ["command"] },
  },
  {
    name: "Read",
    description: "Read a file in the working directory, with line numbers.",
    input_schema: { type: "object", properties: { file_path: { type: "string" }, offset: { type: "number" }, limit: { type: "number" } }, required: ["file_path"] },
  },
  {
    name: "Write",
    description: "Write a file in the working directory, replacing it if it exists.",
    input_schema: { type: "object", properties: { file_path: { type: "string" }, content: { type: "string" } }, required: ["file_path", "content"] },
  },
  {
    name: "Edit",
    description: "Replace old_string with new_string in a file; old_string must occur exactly once unless replace_all.",
    input_schema: {
      type: "object",
      properties: { file_path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" }, replace_all: { type: "boolean" } },
      required: ["file_path", "old_string", "new_string"],
    },
  },
  {
    name: "Glob",
    description: "List files in the working directory matching a glob such as **/*.ts.",
    input_schema: { type: "object", properties: { pattern: { type: "string" }, path: { type: "string" } }, required: ["pattern"] },
  },
  {
    name: "Grep",
    description: "Search file contents in the working directory with a regular expression; returns path:line:text.",
    input_schema: { type: "object", properties: { pattern: { type: "string" }, path: { type: "string" }, glob: { type: "string" } }, required: ["pattern"] },
  },
];

/** A glob over relative paths as a RegExp: `**`, `*`, `?`, `{a,b}`. */
export function globRegExp(glob) {
  let out = "";
  for (let at = 0; at < glob.length; at += 1) {
    const char = glob[at];
    if (char === "*" && glob[at + 1] === "*") {
      at += 1;
      if (glob[at + 1] === "/") {
        at += 1;
        out += "(?:.*/)?";
      } else out += ".*";
    } else if (char === "*") out += "[^/]*";
    else if (char === "?") out += "[^/]";
    else if (char === "{") {
      const end = glob.indexOf("}", at);
      out += `(?:${glob.slice(at + 1, end).split(",").map((alt) => alt.replace(/[.+^$()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")).join("|")})`;
      at = end;
    } else out += char.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

/**
 * The file tools, each confined to `root`: a path is resolved against it
 * and refused unless its real path (as far as it exists) is inside it.
 */
function fileTools(root, runBash) {
  const realRoot = real(root);
  const confined = (path = ".") => {
    const full = resolve(root, path);
    if (!inside(real(full), realRoot)) throw new Error(`${path} is outside the working directory ${root}`);
    return full;
  };
  const shown = (full) => relative(root, full) || ".";
  return {
    Bash: (input) => runBash(String(input.command ?? ""), Math.min(Number(input.timeout ?? 120_000), 600_000)),
    Read: (input) => {
      const full = confined(input.file_path);
      const lines = readFileSync(full, "utf8").split("\n");
      const from = Math.max(Number(input.offset ?? 1), 1);
      const count = Number(input.limit ?? 2000);
      return lines
        .slice(from - 1, from - 1 + count)
        .map((line, at) => `${String(from + at).padStart(6)}\t${line.slice(0, 2000)}`)
        .join("\n");
    },
    Write: (input) => {
      const full = confined(input.file_path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, String(input.content ?? ""));
      return `wrote ${shown(full)}`;
    },
    Edit: (input) => {
      const full = confined(input.file_path);
      const source = readFileSync(full, "utf8");
      const old = String(input.old_string ?? "");
      const found = old === "" ? 0 : source.split(old).length - 1;
      if (found === 0) throw new Error("old_string was not found");
      if (found > 1 && input.replace_all !== true) throw new Error(`old_string occurs ${found} times; give more context or replace_all`);
      writeFileSync(full, input.replace_all === true ? source.replaceAll(old, String(input.new_string)) : source.replace(old, () => String(input.new_string)));
      return `edited ${shown(full)}`;
    },
    Glob: (input) => {
      const base = confined(input.path);
      const matches = globRegExp(String(input.pattern));
      const hits = listFiles(base).filter((path) => matches.test(path) || (!String(input.pattern).includes("/") && matches.test(basename(path))));
      return hits.slice(0, 500).map((path) => join(shown(base) === "." ? "" : shown(base), path)).join("\n") || "no files";
    },
    Grep: (input) => {
      const base = confined(input.path);
      const pattern = new RegExp(String(input.pattern));
      const only = input.glob ? globRegExp(String(input.glob)) : null;
      const out = [];
      const files = statSync(base).isDirectory() ? listFiles(base).map((path) => join(base, path)) : [base];
      for (const full of files) {
        if (only !== null && !only.test(relative(base, full)) && !only.test(basename(full))) continue;
        if (statSync(full).size > 1_000_000) continue;
        const lines = readFileSync(full, "utf8").split("\n");
        lines.forEach((line, at) => {
          if (out.length < 250 && pattern.test(line)) out.push(`${shown(full)}:${at + 1}:${line.slice(0, 500)}`);
        });
      }
      return out.join("\n") || "no matches";
    },
  };
}

const systemPrompt = (cwd) =>
  `You are a coding agent working in ${cwd}. It is your working directory and the only folder you can read or write: every tool resolves paths inside it, and Bash runs there without network. Do the task you are given with the tools. When it is done, reply with your final message and no tool call.`;

async function anthropicApi({ cwd, text, transcript, kind, resume, model, maxTurns, chain }) {
  const { minutes, budgetUsd } = limits(kind, chain);
  const chosen = model && /^claude/.test(model) ? model : (process.env.INDEPENDENT_TESTS_MODEL ?? DEFAULT_MODEL);
  const state = stateOf(transcript, resume);
  const write = transcriptWriter(transcript, resume);
  const saved = join(state, "messages.json");
  const sessionId = resume ?? randomUUID();
  const messages = resume && existsSync(saved) ? JSON.parse(readFileSync(saved, "utf8")) : [];
  messages.push({ role: "user", content: text });
  write({ type: "system", subtype: "init", session_id: sessionId, model: chosen, cwd, backend: "anthropic-api", resumed: resume ?? null });
  const started = Date.now();
  const deadline = started + minutes * 60_000;
  const runBash = (command, timeout) => {
    const [bin, argv] = placement("/bin/bash", ["-c", command], { cwd, state, network: false });
    return new Promise((done) => {
      let output = "";
      const child = spawn(bin, argv, { cwd, env: childEnv(state), stdio: ["ignore", "pipe", "pipe"] });
      const take = (chunk) => (output = (output + chunk).slice(-30_000));
      child.stdout.on("data", take);
      child.stderr.on("data", take);
      const timer = setTimeout(() => child.kill("SIGKILL"), Math.max(1000, Math.min(timeout, deadline - Date.now())));
      child.on("close", (code) => {
        clearTimeout(timer);
        done(`${output}${output.endsWith("\n") || output === "" ? "" : "\n"}(exit ${code ?? "killed"})`);
      });
    });
  };
  const tools = fileTools(cwd, runBash);
  const base = { sessionId, model: chosen, backend: "anthropic-api" };
  const finish = (fields) => {
    writeFileSync(saved, JSON.stringify(messages));
    const result = { ...base, costUsd: Math.round(cost * 1e6) / 1e6, turns, durationMs: Date.now() - started, stderr: "", ...fields };
    write({ type: "result", subtype: result.subtype, is_error: !result.ok, session_id: sessionId, total_cost_usd: result.costUsd, num_turns: turns, result: result.finalText, api_error: result.apiError, backend: "anthropic-api" });
    return result;
  };
  let cost = 0;
  let turns = 0;
  let finalText = "";
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN)
    return finish({ ok: false, exitCode: null, timedOut: false, subtype: "error_during_execution", apiError: "authentication_error", finalText: "ANTHROPIC_API_KEY is not set." });
  const Anthropic = await anthropicSdk();
  const client = new Anthropic({ maxRetries: 4 });
  const slot = await takeSlot();
  try {
    for (;;) {
      if (Date.now() >= deadline) return finish({ ok: false, exitCode: null, timedOut: true, subtype: "error_timeout", apiError: null, finalText });
      if (cost >= budgetUsd) return finish({ ok: false, exitCode: null, timedOut: false, subtype: "error_max_budget_usd", apiError: null, finalText });
      if (maxTurns && turns >= maxTurns) return finish({ ok: false, exitCode: null, timedOut: false, subtype: "error_max_turns", apiError: null, finalText });
      const params = {
        model: chosen,
        max_tokens: 16000,
        system: systemPrompt(cwd),
        tools: TOOL_DEFS,
        messages,
        cache_control: { type: "ephemeral" },
        output_config: { effort: "high" },
      };
      const options = { timeout: Math.max(10_000, deadline - Date.now()) };
      let response;
      try {
        response = FALLBACK_MODELS.includes(chosen)
          ? await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }, options)
          : await client.messages.create(params, options);
      } catch (error) {
        if (error instanceof Anthropic.RateLimitError)
          return finish({ ok: false, exitCode: null, timedOut: false, subtype: "error_during_execution", apiError: "usage_limit_reached", finalText: error.message });
        if (error instanceof Anthropic.APIError)
          return finish({ ok: false, exitCode: null, timedOut: false, subtype: "error_during_execution", apiError: error.error?.error?.type ?? `http_${error.status}`, finalText: error.message });
        throw error;
      }
      turns += 1;
      cost += costOf(chosen, response.usage);
      messages.push({ role: "assistant", content: response.content });
      write({ type: "assistant", message: response });
      const said = response.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
      if (said !== "") finalText = said;
      if (response.stop_reason === "pause_turn") continue;
      if (response.stop_reason === "refusal")
        return finish({ ok: false, exitCode: 0, timedOut: false, subtype: "error_refusal", apiError: "refusal", finalText });
      const calls = response.content.filter((block) => block.type === "tool_use");
      if (calls.length === 0) return finish({ ok: true, exitCode: 0, timedOut: false, subtype: "success", apiError: null, finalText });
      const results = [];
      for (const call of calls) {
        // An input cut off at max_tokens may parse as a valid partial object: never run it.
        if (response.stop_reason === "max_tokens") {
          results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: "Your reply hit max_tokens and this call was cut off; write smaller pieces." });
          continue;
        }
        try {
          const tool = tools[call.name];
          if (tool === undefined) throw new Error(`No tool ${call.name}`);
          results.push({ type: "tool_result", tool_use_id: call.id, content: String(await tool(call.input ?? {})) });
        } catch (error) {
          results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: String(error.message ?? error) });
        }
      }
      messages.push({ role: "user", content: results });
      write(toolResults(results));
    }
  } finally {
    rmSync(slot, { force: true });
  }
}

/** lib.mjs `session` for any backend but claude-cli. */
export async function runBackend(backend, options) {
  if (backend === "codex-cli") return codexCli(options);
  if (backend === "anthropic-api") return anthropicApi(options);
  if (backend === "exec") return execBackend(options);
  throw new Error(`No backend ${backend}`);
}

/** A session's state folder's files: what it left behind (evidence/backends.mjs checks no login copy stays). */
export const stateFiles = (transcript) => listFiles(join(SESSIONS, sha256(transcript).slice(0, 16)));
