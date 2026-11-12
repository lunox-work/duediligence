#!/usr/bin/env node
// `duediligence login`: see account.mjs.
import { readFileSync } from "node:fs";
import { run } from "./account.mjs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
process.exitCode = await run("login", process.argv.slice(2), { client: "duediligence", version });
