// Child process: load one compiled submission and print one result line per
// case from <start> on. The parent kills and restarts it past a hung case.
// Usage: node run-sub.mjs <dist/index.js> <cases.jsonl> <start>
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { hashFiles } from "./hash.mjs";

const [mod, casesPath, start] = process.argv.slice(2);
const { applyPatch } = await import(pathToFileURL(mod).href);
let i = 0;
for await (const line of createInterface({
  input: createReadStream(casesPath),
})) {
  if (!line) continue;
  if (i++ < +start) continue;
  const c = JSON.parse(line);
  let r;
  try {
    const res = applyPatch(c.files, c.diff);
    r =
      res && typeof res === "object" && res.files
        ? { ok: res.ok === true, hash: hashFiles(res.files) }
        : { bad: true };
  } catch (e) {
    r = { threw: String(e?.message ?? e).slice(0, 120) };
  }
  process.stdout.write(JSON.stringify({ id: c.id, ...r }) + "\n");
}
