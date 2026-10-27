// Build patch-apply cases from real git history, restricted to what the spec
// and `git apply` agree on: LF text files, no mode changes, binaries or copies,
// no "index"/"similarity" lines (the spec's header grammar has none).
// Usage: node corpus.mjs <out.jsonl> <repo>[:maxCommits] ...
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const [out, ...repos] = process.argv.slice(2);
const MAX_FILE = 60_000;
const MAX_SECTIONS = 6;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(20261024);
const pick = (xs) => xs[Math.floor(R() * xs.length)];
const int = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));

const gitBuf = (repo, ...a) => {
  try {
    return execFileSync("git", ["-C", repo, ...a], {
      maxBuffer: 1 << 28,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
};
const git = (repo, ...a) => gitBuf(repo, ...a)?.toString("utf8") ?? "";

function text(repo, rev, path) {
  const b = gitBuf(repo, "show", `${rev}:${path}`);
  if (!b || b.length > MAX_FILE || b.includes(0) || b.includes(13)) return null;
  const s = b.toString("utf8");
  return Buffer.from(s, "utf8").equals(b) ? s : null;
}

const SKIP_LINE =
  /^(Binary files|GIT binary patch|old mode|new mode|copy from|copy to)/;
const SKIP_PATH = /(package-lock\.json|\.lock$|\.min\.|\.svg$|\.snap$)/;

function parseSection(lines) {
  const head = lines[0].match(/^diff --git a\/(\S+) b\/(\S+)$/);
  if (!head || lines.some((l) => SKIP_LINE.test(l))) return null;
  const s = { kind: "modify", oldPath: head[1], newPath: head[2], hunks: [] };
  for (const l of lines) {
    if (l.startsWith("new file mode")) s.kind = "new";
    if (l.startsWith("deleted file mode")) s.kind = "delete";
    if (l.startsWith("rename from")) s.kind = "rename";
  }
  if (SKIP_PATH.test(s.oldPath) || SKIP_PATH.test(s.newPath)) return null;
  let cur = null;
  lines.forEach((l, i) => {
    const m = l.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (m) {
      cur = {
        at: i,
        oldStart: +m[1],
        oldCount: m[2] === undefined ? 1 : +m[2],
        body: [],
      };
      s.hunks.push(cur);
    } else if (cur && /^[ +\-\\]/.test(l)) cur.body.push(l);
  });
  s.text =
    lines
      .filter((l) => !/^(index |similarity index|dissimilarity index)/.test(l))
      .join("\n") + "\n";
  return s;
}

function sections(diff) {
  const out = [];
  let cur = null;
  for (const l of diff.split("\n")) {
    if (l.startsWith("diff --git ")) out.push((cur = [l]));
    else if (cur) cur.push(l);
  }
  return out.map((ls) => {
    while (ls.length && ls[ls.length - 1] === "") ls.pop();
    return ls;
  });
}

// Lines of a file as an array plus whether it ends with "\n".
const split = (s) => {
  const nl = s.endsWith("\n");
  return { nl, lines: (nl ? s.slice(0, -1) : s).split("\n") };
};
const join = ({ nl, lines }) => lines.join("\n") + (nl ? "\n" : "");

// Line indices (0-based) outside every hunk's old range, as [lo, hi) gaps,
// never touching the last line so final-newline handling is not involved.
function gaps(sec, nLines) {
  const out = [];
  let prev = 0;
  for (const h of sec.hunks) {
    const start = h.oldStart - 1;
    if (start > prev && !(prev === 0 && h.oldStart === 1))
      out.push([prev, start]);
    prev = start + h.oldCount;
  }
  if (prev < nLines - 1) out.push([prev, nLines - 1]);
  return out.filter(([lo, hi]) => hi > lo);
}

const oldLinesOf = (h) =>
  h.body.filter((l) => l[0] === " " || l[0] === "-").map((l) => l.slice(1));

function perturbDrift(files, secs, tag) {
  const f = { ...files };
  for (const s of secs) {
    if (s.kind !== "modify" || !s.hunks.length || !(s.oldPath in f)) continue;
    const sp = split(f[s.oldPath]);
    const gs = gaps(s, sp.lines.length);
    if (!gs.length) continue;
    const ops = [];
    for (let n = int(1, 3); n > 0; n--) {
      const [lo, hi] = pick(gs);
      const at = int(lo, hi - 1);
      if (R() < 0.35 && hi - at >= 2)
        ops.push({ at, del: int(1, Math.min(8, hi - at)) });
      else ops.push({ at, ins: int(1, 12) });
    }
    ops.sort((a, b) => b.at - a.at);
    let used = Infinity;
    for (const o of ops) {
      if (o.at + (o.del ?? 0) > used) continue;
      if (o.del) sp.lines.splice(o.at, o.del);
      else
        sp.lines.splice(
          o.at,
          0,
          ...Array.from(
            { length: o.ins },
            (_, i) => `filler ${tag} ${o.at} ${i}`,
          ),
        );
      used = o.at;
    }
    f[s.oldPath] = join(sp);
  }
  return f;
}

function perturbDup(files, secs) {
  const cands = secs.filter(
    (s) =>
      s.kind === "modify" &&
      s.oldPath in files &&
      s.hunks.some((h) => oldLinesOf(h).length >= 2),
  );
  if (!cands.length) return null;
  const s = pick(cands);
  const sp = split(files[s.oldPath]);
  const gs = gaps(s, sp.lines.length);
  if (!gs.length) return null;
  const h = pick(s.hunks.filter((h) => oldLinesOf(h).length >= 2));
  const [lo, hi] = pick(gs);
  sp.lines.splice(int(lo, hi - 1), 0, ...oldLinesOf(h));
  return { ...files, [s.oldPath]: join(sp) };
}

function perturbCorrupt(files, secs) {
  const cands = secs.filter(
    (s) => s.kind === "modify" && s.oldPath in files && s.hunks.length,
  );
  if (!cands.length) return null;
  const s = pick(cands);
  const h = pick(s.hunks);
  const n = oldLinesOf(h).length;
  if (!n) return null;
  const sp = split(files[s.oldPath]);
  const i = h.oldStart - 1 + int(0, n - 1);
  if (i >= sp.lines.length) return null;
  sp.lines[i] += " CORRUPTED";
  return { ...files, [s.oldPath]: join(sp) };
}

const cases = [];
let id = 0;
const add = (meta, files, diff) =>
  cases.push({ id: id++, ...meta, files, diff });

for (const spec of repos) {
  const [repo, max] = spec.split(":");
  let commits = git(repo, "rev-list", "--no-merges", "HEAD")
    .trim()
    .split("\n")
    .filter(Boolean);
  if (max && commits.length > +max)
    commits = commits.filter(() => R() < +max / commits.length);
  const name = repo.split("/").filter(Boolean).pop();
  for (const c of commits) {
    const p = git(repo, "rev-parse", "--verify", "-q", `${c}^`).trim();
    if (!p) continue;
    for (const U of [1, 3, 6]) {
      let secs = sections(
        git(
          repo,
          "diff",
          `-U${U}`,
          "-M",
          "--no-color",
          "--no-ext-diff",
          "--no-relative",
          "--src-prefix=a/",
          "--dst-prefix=b/",
          p,
          c,
        ),
      )
        .map(parseSection)
        .filter(Boolean);
      const files = {};
      secs = secs.filter((s) => {
        const before = s.kind === "new" ? "" : text(repo, p, s.oldPath);
        const after = s.kind === "delete" ? "" : text(repo, c, s.newPath);
        if (before === null || after === null) return false;
        if (s.kind !== "new") files[s.oldPath] = before;
        return true;
      });
      if (!secs.length) continue;
      if (secs.length > MAX_SECTIONS) {
        secs = secs.sort(() => R() - 0.5).slice(0, MAX_SECTIONS);
        for (const k of Object.keys(files))
          if (!secs.some((s) => s.oldPath === k && s.kind !== "new"))
            delete files[k];
      }
      // One untouched file rides along and must come back unchanged.
      const touched = new Set(secs.flatMap((s) => [s.oldPath, s.newPath]));
      const others = git(repo, "ls-tree", "-r", "--name-only", p)
        .split("\n")
        .filter(
          (x) => x && !touched.has(x) && !SKIP_PATH.test(x) && !x.includes(" "),
        );
      for (let t = 0; t < 5 && others.length; t++) {
        const x = pick(others);
        const s = text(repo, p, x);
        if (s !== null) {
          files[x] = s;
          break;
        }
      }
      const diff = secs.map((s) => s.text).join("");
      const meta = { repo: name, commit: c.slice(0, 10), U };
      add({ ...meta, kind: "base" }, files, diff);
      for (let k = 0; k < 3; k++)
        add(
          { ...meta, kind: "drift" },
          perturbDrift(files, secs, `${id}-${k}`),
          diff,
        );
      if (U !== 3) continue;
      for (let k = 0; k < 2; k++) {
        const f = perturbDup(files, secs);
        if (f) add({ ...meta, kind: "dup" }, f, diff);
      }
      const fc = perturbCorrupt(files, secs);
      if (fc) add({ ...meta, kind: "corrupt" }, fc, diff);
      const mod = secs.filter((s) => s.kind === "modify" && s.oldPath in files);
      if (mod.length) {
        const f = { ...files };
        delete f[pick(mod).oldPath];
        add({ ...meta, kind: "missing" }, f, diff);
      }
      const nw = secs.filter((s) => s.kind === "new");
      if (nw.length)
        add(
          { ...meta, kind: "exists" },
          { ...files, [pick(nw).newPath]: "already here\n" },
          diff,
        );
      const dl = secs.filter((s) => s.kind === "delete");
      if (dl.length) {
        const s = pick(dl);
        add(
          { ...meta, kind: "delete-mismatch" },
          { ...files, [s.oldPath]: files[s.oldPath] + "extra line\n" },
          diff,
        );
      }
    }
  }
}

writeFileSync(out, cases.map((x) => JSON.stringify(x)).join("\n") + "\n");
const by = {};
for (const x of cases) by[x.kind] = (by[x.kind] ?? 0) + 1;
console.log(cases.length, "cases", by);
