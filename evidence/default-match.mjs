#!/usr/bin/env node
// How often a drafted spec's decision is the one the person confirms
// (RESULTS.md, "Confirmation"). No model: the labels are data,
// evidence/default-match.json, one item per drafted `Decided:` line of 18
// pairs, each with its kind, the drafted default, the confirmed decision,
// the match and a one-line reason (the file's `about` gives the rule).
//
//   - archive: the 7 `<slug>-gen` specs of ../experiments/specs/,
//     drafted from ticket.md alone, against the person-written <slug>/spec.md;
//   - in-repo: the 11 evidence/in-repo/specs/<slug> drafts against
//     <slug>-confirmed, edited by a session playing the commit's developer
//     (evidence/in-repo/developer.md).
//
//   node evidence/default-match.mjs                   per pair, per kind of decision, totals
//   node evidence/default-match.mjs --json            the same counts as JSON
//   node evidence/default-match.mjs confirmations [<specs dir>...]
//       real confirmations recorded by bin/confirm.mjs (default: the home's
//       specs/): count, median person minutes, decisions changed
//
// Before counting, every label's drafted text is checked against the spec
// it came from (the archive's only when that folder is beside this one), so
// an edited spec cannot leave a stale label counted. Exit 1 on a mismatch.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decisions } from "../bin/decisions.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARCHIVE = join(HERE, "..", "experiments", "specs");
const IN_REPO = join(HERE, "in-repo", "specs");
const argv = process.argv.slice(2);

const pct = (part, whole) => (whole === 0 ? "-" : `${Math.round((100 * part) / whole)}%`);
const table = (head, rows) => {
  const all = [head, ...rows].map((row) => row.map(String));
  const width = head.map((_, i) => Math.max(...all.map((row) => row[i].length)));
  const line = (row) => `| ${row.map((cell, i) => (i === 0 ? cell.padEnd(width[i]) : cell.padStart(width[i]))).join(" | ")} |`;
  return [line(all[0]), `| ${width.map((w, i) => (i === 0 ? "-".repeat(w) : `${"-".repeat(w - 1)}:`)).join(" | ")} |`, ...all.slice(1).map(line)].join("\n");
};
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

if (argv[0] === "confirmations") {
  // A real confirmation: confirmed.json with a duration (`minutes`, from the
  // first listing of the decisions to --by), on a spec that is not a bundled
  // example (bundled.json beside the specs folder, and duration-parse).
  const dirs = argv.slice(1).length > 0 ? argv.slice(1).map((dir) => resolve(dir)) : [join(process.env.DUEDILIGENCE_HOME ?? join(homedir(), ".duediligence"), "specs")];
  const rows = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const bundled = new Set(["duration-parse", ...(existsSync(join(dir, "..", "bundled.json")) ? JSON.parse(readFileSync(join(dir, "..", "bundled.json"), "utf8")) : [])]);
    for (const slug of readdirSync(dir).sort()) {
      const path = join(dir, slug, "confirmed.json");
      if (bundled.has(slug) || !existsSync(path)) continue;
      const record = JSON.parse(readFileSync(path, "utf8"));
      if (typeof record.minutes !== "number") continue;
      const changes = record.changes ?? null;
      rows.push({ slug, by: record.by, minutes: record.minutes, shown: record.drafted?.length ?? null, changed: changes === null ? null : changes.edited.length + changes.added.length + changes.removed.length, kept: changes?.kept ?? null });
    }
  }
  console.log(rows.length === 0 ? "No real confirmations with a duration." : table(["spec", "by", "minutes", "decisions shown", "kept as drafted", "changed"], rows.map((r) => [r.slug, r.by, r.minutes, r.shown ?? "-", r.kept ?? "-", r.changed ?? "-"])));
  if (rows.length > 0) {
    const shown = rows.reduce((sum, r) => sum + (r.shown ?? 0), 0);
    const kept = rows.reduce((sum, r) => sum + (r.kept ?? 0), 0);
    console.log(`\n${rows.length} confirmation(s); median ${median(rows.map((r) => r.minutes))} person minutes; ${kept} of ${shown} drafted decisions kept as drafted (${pct(kept, shown)}).`);
  }
  process.exit(0);
}

const labels = JSON.parse(readFileSync(join(HERE, "default-match.json"), "utf8"));
const items = labels.items;

// Integrity: each label's drafted text is still the spec's item n.
const stale = [];
const cache = new Map();
const draftedOf = (item) => {
  const path = item.source === "archive" ? join(ARCHIVE, `${item.pair}-gen`, "spec.md") : join(IN_REPO, item.pair, "spec.md");
  if (!existsSync(path)) return undefined;
  if (!cache.has(path)) cache.set(path, decisions(readFileSync(path, "utf8")));
  return cache.get(path);
};
let unchecked = 0;
for (const item of items.filter((i) => i.drafted !== null)) {
  const list = draftedOf(item);
  if (list === undefined) unchecked += 1;
  else if (list[item.n - 1] !== item.drafted) stale.push(`${item.source} ${item.pair} #${item.n}`);
}
if (stale.length > 0) {
  console.error(`Labels no longer match their spec: ${stale.join(", ")}. Relabel these items.`);
  process.exit(1);
}

const tally = (list) => {
  const yes = list.filter((i) => i.match === "yes").length;
  const no = list.filter((i) => i.match === "no").length;
  return { items: list.filter((i) => i.drafted !== null).length, decided: yes + no, matched: yes, silent: list.filter((i) => i.match === "silent").length, added: list.filter((i) => i.match === "added").length };
};
const pairs = [...new Set(items.map((i) => `${i.source}\t${i.pair}`))].map((key) => {
  const [source, pair] = key.split("\t");
  return { source, pair, ...tally(items.filter((i) => i.source === source && i.pair === pair)) };
});
const kinds = Object.keys(labels.kinds).map((kind) => {
  const of = items.filter((i) => i.kind === kind && i.drafted !== null);
  return { kind, all: tally(of), archive: tally(of.filter((i) => i.source === "archive")), inRepo: tally(of.filter((i) => i.source === "in-repo")) };
});
const totals = { all: tally(items), archive: tally(items.filter((i) => i.source === "archive")), inRepo: tally(items.filter((i) => i.source === "in-repo")) };
const allMatched = pairs.filter((p) => p.decided > 0 && p.matched === p.decided).length;

if (argv.includes("--json")) {
  console.log(JSON.stringify({ pairs, kinds, totals, pairsAllMatched: allMatched }, null, 2));
  process.exit(0);
}
console.log("Per pair: drafted `Decided:` items whose default the confirmed spec kept\n");
console.log(
  table(
    ["pair", "source", "drafted items", "decided by the confirmed spec", "default kept", "rate", "silent", "added"],
    pairs.map((p) => [p.pair, p.source, p.items, p.decided, p.matched, pct(p.matched, p.decided), p.silent, p.added]),
  ),
);
console.log("\nPer kind of decision\n");
console.log(
  table(
    ["kind", "kept / decided", "rate", "archive", "in-repo"],
    kinds
      .filter((k) => k.all.items > 0)
      .sort((a, b) => b.all.decided - a.all.decided)
      .map((k) => [k.kind, `${k.all.matched} / ${k.all.decided}`, pct(k.all.matched, k.all.decided), `${k.archive.matched} / ${k.archive.decided}`, `${k.inRepo.matched} / ${k.inRepo.decided}`]),
  ),
);
const line = (name, t) => `${name}: ${t.matched} of ${t.decided} decided defaults kept (${pct(t.matched, t.decided)}); ${t.silent} silent, ${t.added} added, of ${t.items} drafted items`;
console.log(`\n${line("All 18 pairs", totals.all)}\n${line("Archive, 7", totals.archive)}\n${line("In-repo, 11", totals.inRepo)}`);
console.log(`Pairs with every decided default kept: ${allMatched} of ${pairs.length}.`);
if (unchecked > 0) console.log(`(${unchecked} labels not checked against their spec: ${ARCHIVE} is not here.)`);
