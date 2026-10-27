// Per case: `outside` when a section is neither a rename nor has ---/+++ headers
// (git's empty new/deleted file), `unique` when no hunk's old lines occur more than once in its input
// file, so where a hunk goes is not up for reading.
import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { WORK } from "./paths.mjs";
const out = [];
for await (const line of createInterface({
  input: createReadStream(join(WORK, "cases.jsonl")),
})) {
  if (!line) continue;
  const c = JSON.parse(line);
  const secs = [];
  for (const l of c.diff.split("\n")) {
    if (l.startsWith("diff --git "))
      secs.push({ head: l, lines: [], hunks: [] });
    else if (secs.length) {
      const s = secs[secs.length - 1];
      s.lines.push(l);
      if (l.startsWith("@@")) s.hunks.push([]);
      else if (s.hunks.length && (l[0] === " " || l[0] === "-"))
        s.hunks[s.hunks.length - 1].push(l.slice(1));
    }
  }
  let outside = false,
    unique = true;
  for (const s of secs) {
    const minus = s.lines.find((l) => l.startsWith("--- "));
    if (!minus && !s.lines.some((l) => l.startsWith("rename from")))
      outside = true;
    const path = minus?.startsWith("--- a/")
      ? minus.slice(6)
      : s.lines.find((l) => l.startsWith("rename from"))?.slice(12);
    const text = path && c.files[path];
    if (text === undefined || text === null) continue;
    const fl = text.split("\n");
    for (const h of s.hunks) {
      if (!h.length) continue;
      let n = 0;
      for (let i = 0; i + h.length <= fl.length && n < 2; i++) {
        let ok = true;
        for (let j = 0; j < h.length && ok; j++) ok = fl[i + j] === h[j];
        if (ok) n++;
      }
      if (n > 1) unique = false;
    }
  }
  out.push(JSON.stringify({ id: c.id, outside, unique }));
}
writeFileSync(join(WORK, "flags.jsonl"), out.join("\n") + "\n");
const xs = out.map((l) => JSON.parse(l));
console.log(
  "outside",
  xs.filter((x) => x.outside).length,
  "unique",
  xs.filter((x) => x.unique).length,
  "of",
  xs.length,
);
