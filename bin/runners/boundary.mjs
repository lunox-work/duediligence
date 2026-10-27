#!/usr/bin/env node
// A suite at a black-box seam (toolchain `exec`, or a repository spec with
// `boundary` in toolchain.json): sets up the boundary, runs any suite
// command with it in the environment, and takes it down. Self-contained
// (node builtins only): bin/lib.mjs `stage` copies it into every exec tree
// as sandbox/boundary.mjs beside sandbox/boundary.json, so sessions run the
// same file the judge runs.
//
//   node boundary.mjs [<boundary.json> | '<json>'] -- <command> [args...]
//
// Default config: boundary.json beside this file. Fields:
//   command   argv of a command boundary, relative to the folder this runs
//             in; given to the suite as BOUNDARY_COMMAND (JSON argv). The
//             suite spawns it per call, inside its test process's guarded
//             group (shared.mjs `guardedSync`).
//   service   { start: argv or shell string, healthcheck: "/path",
//             readyTimeoutMs (default 20000) }: started once per suite run
//             with PORT and HOST=127.0.0.1, ready when `GET <healthcheck>`
//             answers with any HTTP status (a stub answering 501 is ready
//             and fails its tests; one that never answers fails them all),
//             given to the suite as BOUNDARY_URL.
//   build     argv or shell string run before the service starts (the
//             service runs built code); a failed build starts nothing and
//             the suite's own build reports it.
//
// The service never outlives the run. It starts under a tether: a node
// process leading its own process group, which holds the service in that
// group and SIGKILLs the whole group when (a) its stdin closes, which
// happens when this process exits for any reason, SIGKILL included, (b)
// the group's resident memory passes INDEPENDENT_TESTS_TEST_MAX_RSS_MB
// (default 1024; the service also gets NODE_OPTIONS
// --max-old-space-size=INDEPENDENT_TESTS_TEST_HEAP_MB, default 512), as
// guard.mjs does for test processes, or (c) INDEPENDENT_TESTS_SERVICE_MINUTES
// (default 30) pass. This process also kills the group itself when the
// suite ends, on SIGINT, SIGTERM and SIGHUP, on an uncaught error, and
// when its own caller dies (it is reparented).
//
// The suite command's stdout passes through untouched (a runner's result
// JSON); the service's output is kept in memory, never written into the
// tree, and its tail goes to stderr only when it did not become ready.
// Exit code: the suite command's.
//
// On Windows a shell string runs through cmd.exe, the group is the
// tether's process tree (`taskkill /T`), and there is no resident-memory
// ceiling, only the heap cap.

import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const split = argv.indexOf("--");
if (split === -1 || split === argv.length - 1 || split > 1) {
  console.error("usage: node boundary.mjs [<boundary.json> | '<json>'] -- <command> [args...]");
  process.exit(2);
}
const source = split === 1 ? argv[0] : join(dirname(fileURLToPath(import.meta.url)), "boundary.json");
const config = source.trim().startsWith("{") ? JSON.parse(source) : JSON.parse(readFileSync(source, "utf8"));
const [bin, ...args] = argv.slice(split + 1);
const HEAP_MB = Number(process.env.INDEPENDENT_TESTS_TEST_HEAP_MB ?? 512);
const MAX_RSS_MB = Number(process.env.INDEPENDENT_TESTS_TEST_MAX_RSS_MB ?? 1024);
const LIFETIME_MS = Number(process.env.INDEPENDENT_TESTS_SERVICE_MINUTES ?? 30) * 60_000;
const OUTPUT_CHARS = 4_000;
const WINDOWS = process.platform === "win32";

/** An argv array as given, a string through `sh -c` (cmd.exe on Windows). */
const argvOf = (command) =>
  Array.isArray(command) ? command : WINDOWS ? [process.env.ComSpec || "cmd.exe", "/d", "/s", "/c", command] : ["sh", "-c", command];
/** Kills `pid`'s group (its tree on Windows). */
const killGroup = (pid) => {
  if (WINDOWS) spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else process.kill(-pid, "SIGKILL");
};

// The tether: leader of its own group, the service a child in it. Its
// argv[1] is the service's argv as JSON; its stdin is a pipe from this
// process, and its end is the signal to take the group down.
const TETHER = `
const { spawn, spawnSync } = require("node:child_process");
const [bin, ...argv] = JSON.parse(process.argv[1]);
const maxMb = Number(process.argv[2]);
const lifetime = Number(process.argv[3]);
const windows = process.platform === "win32";
const down = (why) => {
  if (why) process.stderr.write("\\n@@boundary " + why + "\\n");
  try {
    if (windows) spawnSync("taskkill", ["/pid", String(process.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    else process.kill(-process.pid, "SIGKILL");
  } catch {}
  process.exit(137);
};
const child = spawn(bin, argv, { stdio: ["ignore", "inherit", "inherit"], windowsHide: true });
child.on("error", (error) => down("service did not start: " + error.message));
child.on("exit", (code, signal) => down("service exited " + (signal ?? code)));
process.stdin.on("end", () => down(null));
process.stdin.on("close", () => down(null));
process.stdin.resume();
setTimeout(() => down("service killed after its time limit"), lifetime);
if (!windows) setInterval(() => {
  const pids = (spawnSync("pgrep", ["-g", String(process.pid)], { encoding: "utf8" }).stdout || "").split("\\n").filter(Boolean);
  if (pids.length === 0) return;
  const rss = (spawnSync("ps", ["-o", "rss=", "-p", pids.join(",")], { encoding: "utf8" }).stdout || "").split(/\\s+/).filter(Boolean);
  const mb = rss.reduce((sum, kb) => sum + Number(kb), 0) / 1024;
  if (mb > maxMb) down("service killed over " + maxMb + " MB resident");
}, 250);
`;

let tether = null;
let output = "";
let inner = null;
const takeDown = () => {
  if (tether === null) return;
  try {
    killGroup(tether.pid);
  } catch {}
  tether = null;
};
process.on("exit", takeDown);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(signal, () => {
    takeDown();
    try {
      inner?.kill("SIGKILL");
    } catch {}
    process.exit(128 + ({ SIGINT: 2, SIGTERM: 15, SIGHUP: 1 })[signal]);
  });
// A caller killed outright (the judge's process SIGKILLed) leaves this one
// orphaned: it notices within a second and takes the service and the
// suite down with it, rather than finishing the suite for nobody.
const parent = process.ppid;
setInterval(() => {
  if (process.ppid === parent) return;
  takeDown();
  try {
    inner?.kill("SIGKILL");
  } catch {}
  process.exit(137);
}, 1_000).unref();
process.on("uncaughtException", (error) => {
  takeDown();
  console.error(`boundary: ${error.stack ?? error}`);
  process.exit(1);
});

/** A free port on 127.0.0.1. */
const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

const env = { ...process.env };
if (config.command !== undefined) env.BOUNDARY_COMMAND = JSON.stringify(argvOf(config.command));

if (config.service !== undefined) {
  const { start, healthcheck = "/", readyTimeoutMs = 20_000 } = config.service;
  const built =
    config.build === undefined || config.build === null
      ? { status: 0 }
      : spawnSync(argvOf(config.build)[0], argvOf(config.build).slice(1), { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  env.BOUNDARY_URL = url;
  if (built.status !== 0) console.error("boundary: the build failed; the service was not started");
  else {
    const serviceEnv = {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=${HEAP_MB}`.trim(),
    };
    tether = spawn(process.execPath, ["-e", TETHER, JSON.stringify(argvOf(start)), String(MAX_RSS_MB), String(LIFETIME_MS)], {
      detached: !WINDOWS,
      windowsHide: true,
      env: serviceEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const keep = (chunk) => (output = `${output}${chunk}`.slice(-OUTPUT_CHARS));
    tether.stdout.on("data", keep);
    tether.stderr.on("data", keep);
    tether.stdin.on("error", () => {});
    let exited = false;
    tether.on("exit", () => (exited = true));
    const started = Date.now();
    let ready = false;
    while (!ready && !exited && Date.now() - started < readyTimeoutMs) {
      try {
        await fetch(new URL(healthcheck, url), { signal: AbortSignal.timeout(1_000) });
        ready = true;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    if (!ready)
      console.error(
        `boundary: the service did not answer ${new URL(healthcheck, url)} within ${readyTimeoutMs} ms${exited ? " (it exited)" : ""}; the suite runs against nothing.\n${output.trim()}`,
      );
  }
}

// On Windows a bare name (npm, npx) is often a .cmd shim, which only cmd.exe runs.
inner = WINDOWS && !/[\\/]|\.exe$/i.test(bin)
  ? spawn([bin, ...args].map((arg) => (/^[\w@.:/\\=,+-]+$/.test(arg) ? arg : `"${arg.replaceAll('"', '""')}"`)).join(" "), { env, stdio: ["ignore", "inherit", "inherit"], shell: true, windowsHide: true })
  : spawn(bin, args, { env, stdio: ["ignore", "inherit", "inherit"] });
const code = await new Promise((resolve) => {
  inner.on("error", (error) => {
    console.error(`boundary: ${bin}: ${error.message}`);
    resolve(127);
  });
  inner.on("close", (status, signal) => resolve(status ?? (signal ? 128 : 1)));
});
takeDown();
process.exitCode = code;
