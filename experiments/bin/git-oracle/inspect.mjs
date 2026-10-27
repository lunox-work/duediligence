// Show where a build and git differ on given case ids.
// Usage: node inspect.mjs <build name, e.g. reference or double-blind-haiku/4> <id>...
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname, relative } from "node:path";
import { WORK as here } from "./paths.mjs";
const ids = new Set(process.argv.slice(3).map(Number));
const { applyPatch } = await import(
  join(here, "build", process.argv[2], "dist/index.js")
);
for (const l of readFileSync(join(here, "cases.jsonl"), "utf8").split("\n")) {
  if (!l) continue;
  const c = JSON.parse(l);
  if (!ids.has(c.id)) continue;
  const root = mkdtempSync(join(process.env.TMPDIR, "insp-"));
  const t = join(root, "t");
  for (const [p, s] of Object.entries(c.files)) {
    mkdirSync(dirname(join(t, p)), { recursive: true });
    writeFileSync(join(t, p), s);
  }
  writeFileSync(join(root, "p.diff"), c.diff);
  spawnSync("git", ["apply", join(root, "p.diff")], { cwd: t });
  let r;
  try {
    r = applyPatch(c.files, c.diff);
  } catch (e) {
    r = { threw: e.message };
  }
  console.log(
    `== case ${c.id} ${c.kind} U${c.U} ${c.repo}@${c.commit} sub.ok=${r.ok} ${r.threw ?? ""}`,
  );
  if (r.rejected) console.log("rejected", JSON.stringify(r.rejected));
  for (const p of Object.keys({ ...c.files, ...(r.files ?? {}) })) {
    let g;
    try {
      g = readFileSync(join(t, p), "utf8");
    } catch {
      g = null;
    }
    const s = r.files?.[p] ?? null;
    if (g === s) continue;
    const gl = (g ?? "").split("\n"),
      sl = (s ?? "").split("\n");
    let i = 0;
    while (gl[i] === sl[i]) i++;
    console.log(
      ` ${p}: first diff at line ${i + 1}; git ${gl.length} lines, sub ${sl.length}`,
    );
    console.log("  git:", JSON.stringify(gl.slice(Math.max(0, i - 1), i + 3)));
    console.log("  sub:", JSON.stringify(sl.slice(Math.max(0, i - 1), i + 3)));
    const ah = r.hunks?.filter((h) => h.path === p);
    if (ah)
      console.log("  sub offsets:", JSON.stringify(ah.map((h) => h.offset)));
  }
  rmSync(root, { recursive: true, force: true });
}
