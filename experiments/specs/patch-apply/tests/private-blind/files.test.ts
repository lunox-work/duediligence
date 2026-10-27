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

function remove(path: string, ...hunks: string[]): string {
  return `diff --git a/${path} b/${path}\ndeleted file mode 100644\n--- a/${path}\n+++ /dev/null\n` + hunks.join("");
}

// --- A new file is created -------------------------------------------------

test("a diff from /dev/null creates the file with the hunk's added lines and keeps the other files", () => {
  const files: Files = { "README.md": "# project\n" };
  const diff = create("docs/guide.md", hunk(0, 1, ["+# Guide", "+step one", "+step two"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), {
    "README.md": "# project\n",
    "docs/guide.md": text("# Guide", "step one", "step two"),
  });
  assert.ok(r.hunks.some((h) => h.path === "docs/guide.md" && h.hunk === 1));
});

test("a created file whose last added line carries the no-newline marker has no final newline", () => {
  const files: Files = {};
  const diff = create("bin/run.sh", hunk(0, 1, ["+#!/bin/sh", "+exec node .", "\\ No newline at end of file"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), { "bin/run.sh": "#!/bin/sh\nexec node ." });
});

test("creating a file at a path that already exists is rejected with reason exists", () => {
  const files: Files = { "src/new.ts": "export const taken = true;\n", "other.txt": text("o1", "o2") };
  const diff =
    modify("other.txt", hunk(1, 1, ["-o1", "+O1", " o2"])) +
    create("src/new.ts", hunk(0, 1, ["+export const fresh = 1;"]));
  const r = rejected(applyPatch(files, diff));
  assert.deepEqual(rejectsOf(r), [{ path: "src/new.ts", hunk: 1, reason: "exists" }]);
  assert.deepEqual(plain(r.files), files);
});

// --- A file is deleted -----------------------------------------------------

test("a diff to /dev/null removes the file and reports the hunk under the --- path", () => {
  const files: Files = {
    "old/legacy.js": text("var x = 1;", "var y = 2;", "module.exports = x + y;"),
    "keep.js": "ok\n",
  };
  const diff = remove("old/legacy.js", hunk(1, 0, ["-var x = 1;", "-var y = 2;", "-module.exports = x + y;"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), { "keep.js": "ok\n" });
  assert.equal("old/legacy.js" in r.files, false);
  assert.ok(r.hunks.some((h) => h.path === "old/legacy.js" && h.hunk === 1));
});

test("deleting a file whose text has a line beyond the removed lines is rejected with no match", () => {
  const files: Files = { "gone.txt": text("g1", "g2", "g3") };
  const diff = remove("gone.txt", hunk(1, 0, ["-g1", "-g2"]));
  const r = rejected(applyPatch(files, diff));
  assert.deepEqual(rejectsOf(r), [{ path: "gone.txt", hunk: 1, reason: "no match" }]);
  assert.deepEqual(plain(r.files), files);
});

test("deleting a file whose removed lines match only after an extra leading line is rejected with no match", () => {
  const files: Files = { "lib/dead.rb": text("# header", "def a; end", "def b; end") };
  const diff = remove("lib/dead.rb", hunk(1, 0, ["-def a; end", "-def b; end"]));
  const r = rejected(applyPatch(files, diff));
  assert.deepEqual(rejectsOf(r), [{ path: "lib/dead.rb", hunk: 1, reason: "no match" }]);
  assert.deepEqual(plain(r.files), files);
});

test("deleting a file that lacks a final newline, with the marker after its last line, removes it", () => {
  const files: Files = { "tmp/note": "first\nlast", "x": "x\n" };
  const diff = remove("tmp/note", hunk(1, 0, ["-first", "-last", "\\ No newline at end of file"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), { "x": "x\n" });
});

// --- A file is renamed -----------------------------------------------------

test("a rename with no hunks, in git's form without --- and +++ headers, moves the text unchanged", () => {
  const files: Files = { "lib/util.ts": "export const u = 1;\r\nexport const v = 2;", "index.ts": "import './lib/util';\n" };
  const diff = "diff --git a/lib/util.ts b/src/util.ts\nrename from lib/util.ts\nrename to src/util.ts\n";
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), {
    "src/util.ts": "export const u = 1;\r\nexport const v = 2;",
    "index.ts": "import './lib/util';\n",
  });
});

test("a rename with --- and +++ headers but no hunks moves the text unchanged", () => {
  const files: Files = { "old/a.ts": text("alpha", "beta") };
  const diff =
    "diff --git a/old/a.ts b/new/a.ts\nrename from old/a.ts\nrename to new/a.ts\n--- a/old/a.ts\n+++ b/new/a.ts\n";
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), { "new/a.ts": text("alpha", "beta") });
});

test("hunks for a renamed file apply to its text as without the rename, reported under the new path", () => {
  const files: Files = { "lib/helpers.js": text("// moved", "h1", "h2", "h3", "h4", "h5") };
  const diff =
    "diff --git a/lib/helpers.js b/src/shared/helpers.js\n" +
    "rename from lib/helpers.js\nrename to src/shared/helpers.js\n" +
    "--- a/lib/helpers.js\n+++ b/src/shared/helpers.js\n" +
    hunk(2, 2, [" h2", "-h3", "+H3", "+H3b", " h4"]);
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), {
    "src/shared/helpers.js": text("// moved", "h1", "h2", "H3", "H3b", "h4", "h5"),
  });
  assert.equal("lib/helpers.js" in r.files, false);
  assert.deepEqual(hunksOf(r), [{ path: "src/shared/helpers.js", hunk: 1, offset: 1 }]);
});

test("a renamed file whose hunk does not match is rejected under the new path and stays at the old path", () => {
  const files: Files = { "pkg/a.go": text("package a", "func A() {}") };
  const diff =
    "diff --git a/pkg/a.go b/pkg/b/a.go\nrename from pkg/a.go\nrename to pkg/b/a.go\n" +
    "--- a/pkg/a.go\n+++ b/pkg/b/a.go\n" +
    hunk(1, 1, ["-package b", "+package bb", " func A() {}"]);
  const r = rejected(applyPatch(files, diff));
  assert.deepEqual(rejectsOf(r), [{ path: "pkg/b/a.go", hunk: 1, reason: "no match" }]);
  assert.deepEqual(plain(r.files), files);
});
