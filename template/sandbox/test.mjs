// What `npm test` runs after the build: node:test over every compiled
// tests/public/**/*.test.js, with sandbox.env loaded, its output as
// node:test prints it. The files are listed here rather than globbed on
// the command line: Node 20 takes no glob there, and Windows' shell
// expands none.
//
//   node sandbox/test.mjs [folder]     default tests/public

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const folder = process.argv[2] ?? join("tests", "public");

function listTests(at) {
  if (!existsSync(at)) return [];
  return readdirSync(at, { withFileTypes: true }).flatMap((entry) => {
    const path = join(at, entry.name);
    if (entry.isDirectory()) return listTests(path);
    return entry.name.endsWith(".test.js") ? [path] : [];
  });
}

const files = listTests(folder).sort();
if (files.length === 0) {
  console.error(`No compiled tests under ${folder}/ (run the build first).`);
  process.exit(1);
}
const run = spawnSync(process.execPath, ["--env-file=sandbox.env", "--test", ...files], { stdio: "inherit" });
process.exitCode = run.status ?? 1;
