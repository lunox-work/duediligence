#!/usr/bin/env node
// `duediligence logout`: see account.mjs.
import { readFileSync } from "node:fs";
import { run } from "./account.mjs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
process.exitCode = await run("logout", process.argv.slice(2), { client: "duediligence", version });
