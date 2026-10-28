#!/usr/bin/env node
// The `duediligence` command: one entry point over the bin scripts,
// which it runs unchanged, in the caller's folder, with their own exit
// codes. Paths the scripts print as `node bin/<script>.mjs` are these
// subcommands. Specs, runs and results live under DUEDILIGENCE_HOME
// (default ~/.duediligence/, lib.mjs `HOME`); `where` prints them.
//
//   duediligence <command> [args...]
//   duediligence where | help | --version

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BIN = dirname(fileURLToPath(import.meta.url));
const COMMANDS = {
  fit: "whether a repository's package can be a target",
  repo: "point a spec at a package: seam, allowed paths, base tree, baseline",
  confirm: "a spec's decisions in context; record a confirmation (--by); --from <issue>, --export",
  prepare: "confirmed spec -> skeleton, both suites, calibration (Opus sessions)",
  handout: "what an outside agent may see, in a folder of your choice",
  judge: "a src/, or a checkout or commit -> passed | overfit | incomplete | regressed | refused",
  promote: "a passed repository spec's hidden suite into the repository",
  run: "a blind agent session",
  grade: "grade blind runs into results.jsonl",
  retry: "one retry of a blind run, told its failing scenarios",
  "import-archive": "a calibrated spec from the experiment archive, marked not held out",
  seal: "one spec's suites in one file, for a judge that has no specs/ (CI)",
  ci: "judge a commit from a seal and report it as a check (GitHub Actions or anywhere)",
  referee: "a blind referee of rejected runs' failing tests, on any backend (--backend)",
  "red-team-audit": "red-team passes (run --brief red-team) audited: literals, a second suite, a session",
};

const [command, ...rest] = process.argv.slice(2);
if (command === "--version" || command === "-v") {
  console.log(JSON.parse(readFileSync(join(BIN, "..", "package.json"), "utf8")).version);
  process.exit(0);
}
if (command === "where") {
  const { HOME, SPECS, RUNS, RESULTS, TEMPLATE, ROOT } = await import("./lib.mjs");
  console.log(JSON.stringify({ home: HOME, specs: SPECS, runs: RUNS, results: RESULTS, template: TEMPLATE, package: ROOT }, null, 2));
  process.exit(0);
}
if (!Object.hasOwn(COMMANDS, command ?? "")) {
  const width = Math.max(...Object.keys(COMMANDS).map((name) => name.length));
  console.error(
    [
      "usage: duediligence <command> [args...]",
      "",
      ...Object.entries(COMMANDS).map(([name, what]) => `  ${name.padEnd(width)}  ${what}`),
      `  ${"where".padEnd(width)}  the folders it reads and writes`,
      "",
      "Each command prints its own usage when called without arguments.",
      "Data: DUEDILIGENCE_HOME (default ~/.duediligence/).",
    ].join("\n"),
  );
  process.exit(command === undefined || command === "help" || command === "--help" ? 0 : 1);
}
const child = spawnSync(process.execPath, [join(BIN, `${command}.mjs`), ...rest], { stdio: "inherit" });
if (child.signal) process.kill(process.pid, child.signal);
process.exit(child.status ?? 1);
