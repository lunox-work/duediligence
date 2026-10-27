// Agreed set = cases where the reference matches git (ok and file hash).
// Per submission: disagreements with git on the agreed set, by case kind.
// Usage: node compare.mjs [--strict] [--ref]
//   --strict  only cases flagged unique and inside the grammar (flags.mjs)
//   --ref     print reference-vs-git only
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DB, WORK as here } from "./paths.mjs";

const load = (p) =>
  readFileSync(p, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
const byId = (xs) => new Map(xs.map((x) => [x.id, x]));
const kinds = new Map();
for (const l of readFileSync(join(here, "cases.jsonl"), "utf8").split("\n")) {
  if (!l) continue;
  const m = l.match(
    /^\{"id":(\d+),"repo":"[^"]*","commit":"[^"]*","U":\d+,"kind":"([^"]+)"/,
  );
  kinds.set(+m[1], m[2]);
}
const git = byId(load(join(here, "git.jsonl")));
const ref = byId(load(join(here, "results/reference.jsonl")));
const same = (a, b) =>
  a && b && a.ok === b.ok && a.hash === b.hash && !a.threw && !a.timeout;
const what = (x) =>
  x.timeout
    ? "timeout"
    : x.threw
      ? "threw"
      : x.bad
        ? "bad"
        : x.ok
          ? "ok"
          : "rej";

const flags = byId(load(join(here, "flags.jsonl")));
const strict = process.argv.includes("--strict");
const agreed = new Set();
const refOff = {};
for (const [id, g] of git) {
  const r = ref.get(id);
  if (strict && (flags.get(id).outside || !flags.get(id).unique)) continue;
  if (same(r, g)) agreed.add(id);
  else {
    const k = `${kinds.get(id)} git:${g.ok ? "ok" : "rej"} ref:${what(r)}${r.ok === g.ok && !r.threw ? " (files differ)" : ""}`;
    refOff[k] = (refOff[k] ?? 0) + 1;
  }
}
console.log(
  `agreed ${agreed.size}/${git.size}; reference vs git disagreements:`,
  refOff,
);
if (process.argv.includes("--ref")) process.exit(0);

const results = load(join(DB, "results.jsonl")).filter(
  (r) => r.spec === "patch-apply",
);
const rows = [];
for (const r of results) {
  const name = `${r.variant}/${r.run}`;
  const p = join(here, "results", `${name}.jsonl`);
  if (!existsSync(p)) continue;
  const sub = byId(load(p));
  const off = {};
  let n = 0;
  for (const id of agreed) {
    const s = sub.get(id);
    if (same(s, git.get(id))) continue;
    n++;
    const k = `${kinds.get(id)}:${what(s)}`;
    off[k] = (off[k] ?? 0) + 1;
  }
  rows.push({
    arm: r.arm,
    run: r.run,
    verdict: r.verdict,
    failedScenarios: r.failedScenarios,
    disagree: n,
    rate: n / agreed.size,
    off,
  });
}
console.log(JSON.stringify(rows));
