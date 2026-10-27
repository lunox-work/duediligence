#!/usr/bin/env node
// The memory and time guard around one test process (shared.mjs
// `guardedSync`): runs the command in its own process group, passes its
// output through, and every 250 ms sums the group's resident memory
// (`pgrep -g` + `ps -o rss=`, macOS and Linux). Over `maxRssMb` (default
// 1024) or past `timeoutMs` it SIGKILLs the whole group, grandchildren
// included (node --test's per-file workers, pytest's subprocesses).
//
// Why: a mutant (evidence/mutation.mjs) or an untrusted solution
// (evidence/evalplus.mjs) can allocate without bound. On 2026-10-26 one
// mutant's `node --test` child reached 4.8 GB within 2 seconds while two
// mutation runs ran side by side, and the 16 GB machine ran out of memory
// and rebooted twice. A killed group reads as a crashed file, as a timeout
// does, so the mutant counts as killed and the solution as rejected.
//
// Input on stdin: { bin, argv, timeoutMs, maxRssMb }. Output: the child's
// stdout and stderr, then one stderr line `@@guard {"reason", "peakMb"}`;
// exit code the child's, or 137 when the guard killed it.
//
// On Windows the time limit kills the process tree (`taskkill /T`); there
// is no resident-memory ceiling there, only the heap cap the callers set.

import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { GROUP, WINDOWS, commandOf, killTree } from "../platform.mjs";

const { bin, argv, timeoutMs, maxRssMb = 1024 } = JSON.parse(readFileSync(0, "utf8"));
const [file, args, options] = commandOf(bin, argv);
const child = spawn(file, args, { stdio: ["ignore", "pipe", "pipe"], ...GROUP, ...options });
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
let reason = null;
let peakMb = 0;
const killGroup = () => killTree(child.pid);
const groupRssMb = () => {
  if (WINDOWS) return 0;
  const pids = (spawnSync("pgrep", ["-g", String(child.pid)], { encoding: "utf8" }).stdout ?? "").split("\n").filter(Boolean);
  if (pids.length === 0) return 0;
  const rss = (spawnSync("ps", ["-o", "rss=", "-p", pids.join(",")], { encoding: "utf8" }).stdout ?? "").split(/\s+/).filter(Boolean);
  return rss.reduce((sum, kb) => sum + Number(kb), 0) / 1024;
};
const timer = timeoutMs ? setTimeout(() => ((reason ??= "timeout"), killGroup()), timeoutMs) : null;
const poll = setInterval(() => {
  const mb = groupRssMb();
  peakMb = Math.max(peakMb, mb);
  if (mb > maxRssMb) {
    reason ??= "memory";
    killGroup();
  }
}, 250);
child.on("error", (error) => process.stderr.write(String(error)));
child.on("close", (code, signal) => {
  clearInterval(poll);
  if (timer) clearTimeout(timer);
  // Workers a test process left behind go with it.
  killGroup();
  process.stderr.write(`\n@@guard ${JSON.stringify({ reason, peakMb: Math.round(peakMb), signal })}\n`);
  process.exitCode = reason !== null ? 137 : (code ?? 137);
});
