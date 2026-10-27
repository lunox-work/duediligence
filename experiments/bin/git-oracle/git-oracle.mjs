// Apply every case with `git apply` (no fuzz, atomic by default) in a scratch
// tree outside any repository, and record { id, ok, hash } of the result.
// Usage: node git-oracle.mjs <cases.jsonl> <out.jsonl>
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import { dirname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { hashFiles } from "./hash.mjs";

const [casesPath, outPath] = process.argv.slice(2);
const root = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "oracle-"));
const out = [];

function walk(dir, base = dir, acc = {}) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, base, acc);
    else acc[relative(base, p)] = readFileSync(p, "utf8");
  }
  return acc;
}

for await (const line of createInterface({
  input: createReadStream(casesPath),
})) {
  if (!line) continue;
  const c = JSON.parse(line);
  const tree = join(root, "t");
  rmSync(tree, { recursive: true, force: true });
  mkdirSync(tree, { recursive: true });
  for (const [p, s] of Object.entries(c.files)) {
    mkdirSync(dirname(join(tree, p)), { recursive: true });
    writeFileSync(join(tree, p), s);
  }
  writeFileSync(join(root, "p.diff"), c.diff);
  const r = spawnSync(
    "git",
    ["apply", "--whitespace=nowarn", join(root, "p.diff")],
    {
      cwd: tree,
      encoding: "utf8",
      env: { ...process.env, GIT_CEILING_DIRECTORIES: root },
    },
  );
  const files = walk(tree);
  out.push(
    JSON.stringify({
      id: c.id,
      ok: r.status === 0,
      hash: hashFiles(files),
      err: r.status === 0 ? undefined : r.stderr.split("\n")[0],
    }),
  );
}
writeFileSync(outPath, out.join("\n") + "\n");
rmSync(root, { recursive: true, force: true });
console.log(out.length, "oracle results");
