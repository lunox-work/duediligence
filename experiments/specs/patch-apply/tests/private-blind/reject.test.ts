import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPatch } from "../../src/index.js";
import type { Applied, ApplyResult, Files, Rejected } from "../../src/index.js";

function text(...ls: string[]): string {
  return ls.map((l) => l + "\n").join("");
}

function hunk(oldStart: number, newStart: number, body: string[]): string {
  let o = 0;
  let n = 0;
  for (const l of body) {
    if (l.startsWith(" ")) {
      o++;
      n++;
    } else if (l.startsWith("-")) o++;
    else if (l.startsWith("+")) n++;
  }
  return `@@ -${oldStart},${o} +${newStart},${n} @@\n` + text(...body);
}

function modify(path: string, ...hunks: string[]): string {
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n` + hunks.join("");
}

function applied(r: ApplyResult): Applied {
  if (!r.ok) throw new Error("expected the patch to apply, got rejected: " + JSON.stringify(r.rejected));
  return r;
}

function rejected(r: ApplyResult): Rejected {
  if (r.ok) throw new Error("expected the patch to be rejected, got applied: " + JSON.stringify(r.files));
  return r;
}

function hunksOf(r: Applied) {
  return r.hunks
    .map((h) => ({ path: h.path, hunk: h.hunk, offset: h.offset }))
    .sort((a, b) => (a.path === b.path ? a.hunk - b.hunk : a.path < b.path ? -1 : 1));
}

function rejectsOf(r: Rejected) {
  return r.rejected
    .map((h) => ({ path: h.path, hunk: h.hunk, reason: h.reason }))
    .sort((a, b) => (a.path === b.path ? a.hunk - b.hunk : a.path < b.path ? -1 : 1));
}

function plain(f: Files): Files {
  return { ...f };
}

/** "k1".."kn" style line names. */
function seq(prefix: string, from: number, to: number): string[] {
  const out: string[] = [];
  for (let i = from; i <= to; i++) out.push(prefix + i);
  return out;
}

function create(path: string, ...hunks: string[]): string {
  return `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n` + hunks.join("");
}

// --- Every failing hunk is reported and nothing changes --------------------

test("a failing second hunk of one file and failing first hunk of another are both rejected and no file changes", () => {
  const files: Files = {
    "src/a.ts": text(...seq("a", 1, 10)),
    "src/b.ts": text(...seq("b", 1, 6)),
    "src/c.ts": text("c1", "c2"),
  };
  const before = { ...files };
  const diff =
    modify("src/a.ts", hunk(2, 2, [" a2", "-a3", "+A3", " a4"]), hunk(7, 7, [" a7", "-a8x", "+A8", " a9"])) +
    modify("src/b.ts", hunk(1, 1, ["-bX", "+B1", " b2"]), hunk(5, 5, [" b5", "-b6", "+B6"])) +
    modify("src/c.ts", hunk(1, 1, ["-c1", "+C1", " c2"]));
  const r = rejected(applyPatch(files, diff));
  assert.deepEqual(rejectsOf(r), [
    { path: "src/a.ts", hunk: 2, reason: "no match" },
    { path: "src/b.ts", hunk: 1, reason: "no match" },
  ]);
  assert.deepEqual(plain(r.files), before);
  assert.deepEqual(plain(files), before);
});

test("failures in a middle hunk and a third hunk are listed alone, while hunks around them that match are not", () => {
  const files: Files = {
    "x.txt": text(...seq("x", 1, 12)),
    "y.txt": text(...seq("y", 1, 9)),
  };
  const diff =
    modify(
      "x.txt",
      hunk(2, 2, [" x2", "-x3", "+X3", " x4"]),
      hunk(6, 6, [" x6", "-nope", "+X7", " x8"]),
      hunk(10, 10, [" x10", "-x11", "+X11", " x12"]),
    ) +
    modify(
      "y.txt",
      hunk(1, 1, ["-y1", "+Y1", " y2"]),
      hunk(4, 4, [" y4", "-y5", "+Y5", " y6"]),
      hunk(8, 8, [" y8", "-y9", "-y10", "+Y9"]),
    );
  const r = rejected(applyPatch(files, diff));
  assert.deepEqual(rejectsOf(r), [
    { path: "x.txt", hunk: 2, reason: "no match" },
    { path: "y.txt", hunk: 3, reason: "no match" },
  ]);
  assert.deepEqual(plain(r.files), files);
});

test("a single non-matching hunk rejects the whole patch, leaving the other files as they were", () => {
  const files: Files = { "ok.txt": text("o1", "o2"), "bad.txt": text("b1", "b2") };
  const diff =
    modify("ok.txt", hunk(1, 1, ["-o1", "+O1", " o2"])) + modify("bad.txt", hunk(2, 2, ["-zz", "+ZZ"]));
  const r = rejected(applyPatch(files, diff));
  assert.deepEqual(rejectsOf(r), [{ path: "bad.txt", hunk: 1, reason: "no match" }]);
  assert.deepEqual(plain(r.files), { "ok.txt": text("o1", "o2"), "bad.txt": text("b1", "b2") });
});

// --- A missing file is rejected --------------------------------------------

test("every hunk for a path not in the set of files is rejected with reason missing", () => {
  const files: Files = { "lib/present.ts": text("p1", "p2") };
  const diff =
    modify("lib/present.ts", hunk(1, 1, ["-p1", "+P1", " p2"])) +
    modify("lib/absent.ts", hunk(1, 1, ["-q1", "+Q1"]), hunk(5, 5, ["-q5", "+Q5"]));
  const r = rejected(applyPatch(files, diff));
  assert.deepEqual(rejectsOf(r), [
    { path: "lib/absent.ts", hunk: 1, reason: "missing" },
    { path: "lib/absent.ts", hunk: 2, reason: "missing" },
  ]);
  assert.deepEqual(plain(r.files), files);
});

test("missing, exists and no match rejections are all listed together", () => {
  const files: Files = { "keep.txt": "k\n", "made.txt": "already\n", "edit.txt": text("e1", "e2") };
  const diff =
    create("made.txt", hunk(0, 1, ["+again"])) +
    modify("gone.txt", hunk(3, 3, [" g3", "-g4", "+G4"])) +
    modify("edit.txt", hunk(1, 1, ["-e0", "+E0", " e2"])) +
    modify("keep.txt", hunk(1, 1, ["-k", "+K"]));
  const r = rejected(applyPatch(files, diff));
  assert.deepEqual(rejectsOf(r), [
    { path: "edit.txt", hunk: 1, reason: "no match" },
    { path: "gone.txt", hunk: 1, reason: "missing" },
    { path: "made.txt", hunk: 1, reason: "exists" },
  ]);
  assert.deepEqual(plain(r.files), files);
});

// --- A malformed diff is refused outright ----------------------------------

function assertMalformed(run: () => unknown): void {
  assert.throws(run, (e: unknown) => {
    if (!(e instanceof Error)) throw new Error("expected an Error to be thrown");
    assert.doesNotMatch(e.message, /not implemented/);
    return true;
  });
}

test("a hunk with fewer old lines than its header counts, at the end of the diff, throws", () => {
  const files: Files = { "f.txt": text("a", "b", "c", "d", "e") };
  const diff = modify("f.txt") + "@@ -1,4 +1,4 @@\n a\n-b\n+B\n";
  assertMalformed(() => applyPatch(files, diff));
});

test("a short hunk followed by another file's section throws", () => {
  const files: Files = { "f.txt": text("a", "b", "c", "d", "e"), "g.txt": text("g1", "g2") };
  const diff = modify("f.txt") + "@@ -2,4 +2,4 @@\n b\n-c\n+C\n" + modify("g.txt", hunk(1, 1, ["-g1", "+G1", " g2"]));
  assertMalformed(() => applyPatch(files, diff));
});

test("a short hunk followed by another hunk header throws", () => {
  const files: Files = { "f.txt": text(...seq("f", 1, 12)) };
  const diff = modify("f.txt") + "@@ -1,5 +1,5 @@\n f1\n-f2\n+F2\n" + hunk(10, 10, [" f10", "-f11", "+F11"]);
  assertMalformed(() => applyPatch(files, diff));
});

test("a hunk with fewer new lines than its header counts throws", () => {
  const files: Files = { "n.txt": text("a", "b") };
  const diff = modify("n.txt") + "@@ -1,1 +1,4 @@\n-a\n+A\n";
  assertMalformed(() => applyPatch(files, diff));
});

test("a hunk short of a header count given explicitly while the other count is missing throws", () => {
  const files: Files = { "m.txt": text("a", "b", "c", "d") };
  const diff = modify("m.txt") + "@@ -1,3 +1 @@\n-a\n";
  assertMalformed(() => applyPatch(files, diff));
});

test("a hunk before any file header throws", () => {
  const files: Files = { "h.txt": text("a", "b") };
  const diff = "@@ -1 +1 @@\n-a\n+A\n";
  assertMalformed(() => applyPatch(files, diff));
});

test("a hunk before the first file header throws even when valid file sections follow it", () => {
  const files: Files = { "h.txt": text("a", "b"), "i.txt": text("i1") };
  const diff = "@@ -2,1 +2,1 @@\n-b\n+B\n" + modify("i.txt", hunk(1, 1, ["-i1", "+I1"]));
  assertMalformed(() => applyPatch(files, diff));
});

test("a malformed diff throws rather than returning a rejection for its missing file", () => {
  const files: Files = { "here.txt": text("h1", "h2", "h3") };
  const diff = modify("not-here.txt", hunk(1, 1, ["-z", "+Z"])) + modify("here.txt") + "@@ -1,3 +1,3 @@\n-h1\n";
  assertMalformed(() => applyPatch(files, diff));
});
