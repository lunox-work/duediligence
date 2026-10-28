#!/usr/bin/env node
// `independent-test` was renamed to `duediligence`; this runs it with the same arguments
// and exit codes. INDEPENDENT_TESTS_* still work (a DUEDILIGENCE_* value set
// alongside wins), and a data folder from before the rename stays in use.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

for (const [key, value] of Object.entries(process.env)) {
  if (!key.startsWith("INDEPENDENT_TESTS_")) continue;
  const name = `DUEDILIGENCE_${key.slice("INDEPENDENT_TESTS_".length)}`;
  if (process.env[name] === undefined) process.env[name] = value;
}
const before = join(homedir(), ".independent-tests");
if (process.env.DUEDILIGENCE_HOME === undefined && existsSync(before) && !existsSync(join(homedir(), ".duediligence")))
  process.env.DUEDILIGENCE_HOME = before;
await import("duediligence/bin/cli.mjs");
