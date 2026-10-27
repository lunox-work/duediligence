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

// --- A hunk applies at its stated line -------------------------------------

test("hunk matching at its old start line replaces removed lines with added lines and reports offset 0", () => {
  const files: Files = {
    "src/calc.ts": text("const a = 1;", "const b = 2;", "const c = 3;", "const d = 4;", "const e = 5;", "const f = 6;"),
    "README.md": "# calc\n",
  };
  const diff = modify(
    "src/calc.ts",
    hunk(2, 2, [" const b = 2;", "-const c = 3;", "+const c = 30;", "+const cc = 31;", " const d = 4;"]),
  );
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), {
    "src/calc.ts": text("const a = 1;", "const b = 2;", "const c = 30;", "const cc = 31;", "const d = 4;", "const e = 5;", "const f = 6;"),
    "README.md": "# calc\n",
  });
  assert.deepEqual(hunksOf(r), [{ path: "src/calc.ts", hunk: 1, offset: 0 }]);
});

test("hunks at the first line of one file and the last line of another apply in place with offset 0", () => {
  const files: Files = {
    "one.txt": text("first", "second", "third"),
    "two.txt": text("p", "q", "r", "s"),
  };
  const diff =
    modify("one.txt", hunk(1, 1, ["-first", "+FIRST", " second"])) +
    modify("two.txt", hunk(3, 3, [" r", "-s", "+S", "+T"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), {
    "one.txt": text("FIRST", "second", "third"),
    "two.txt": text("p", "q", "r", "S", "T"),
  });
  assert.deepEqual(hunksOf(r), [
    { path: "one.txt", hunk: 1, offset: 0 },
    { path: "two.txt", hunk: 1, offset: 0 },
  ]);
});

test("a hunk header with a missing count reads it as 1, and trailing section text after @@ is allowed", () => {
  const files: Files = {
    "main.c": text("int main() {", "  x();", "  y();", "  z();", "}"),
  };
  const diff =
    modify("main.c") +
    "@@ -3 +3 @@ int main() {\n-  y();\n+  why();\n" +
    "@@ -5 +5,2 @@ int main() {\n }\n+int other;\n";
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), {
    "main.c": text("int main() {", "  x();", "  why();", "  z();", "}", "int other;"),
  });
  assert.deepEqual(hunksOf(r), [
    { path: "main.c", hunk: 1, offset: 0 },
    { path: "main.c", hunk: 2, offset: 0 },
  ]);
});

test("only the a/ and b/ prefixes are stripped from header paths, and the input files are not modified", () => {
  const files: Files = { "a/b/c.txt": text("1", "2", "3") };
  const before = { ...files };
  const diff = modify("a/b/c.txt", hunk(2, 2, ["-2", "+two"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), { "a/b/c.txt": text("1", "two", "3") });
  assert.deepEqual(hunksOf(r), [{ path: "a/b/c.txt", hunk: 1, offset: 0 }]);
  assert.deepEqual(plain(files), before);
});

// --- A hunk whose lines moved applies at the nearest match -----------------

test("a hunk whose lines moved later in the file applies there with a positive offset", () => {
  const files: Files = { "moved.txt": text("n1", "n2", "n3", "n4", ...seq("k", 1, 8)) };
  const diff = modify("moved.txt", hunk(5, 5, [" k5", "-k6", "+K6", " k7"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), {
    "moved.txt": text("n1", "n2", "n3", "n4", "k1", "k2", "k3", "k4", "k5", "K6", "k7", "k8"),
  });
  assert.deepEqual(hunksOf(r), [{ path: "moved.txt", hunk: 1, offset: 4 }]);
});

test("a hunk whose lines moved earlier in the file applies there with a negative offset", () => {
  const files: Files = { "lib/early.py": text(...seq("k", 4, 12)) };
  const diff = modify("lib/early.py", hunk(9, 9, [" k9", "-k10", "+K10", "+K10b", " k11"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), {
    "lib/early.py": text("k4", "k5", "k6", "k7", "k8", "k9", "K10", "K10b", "k11", "k12"),
  });
  assert.deepEqual(hunksOf(r), [{ path: "lib/early.py", hunk: 1, offset: -3 }]);
});

test("of two matches the nearer one is used even when it is later in the file", () => {
  // Stated line 8: matches at line 4 (4 before) and line 11 (3 after).
  const files: Files = {
    "near.txt": text("f1", "f2", "f3", "p", "m", "q", "f7", "f8", "f9", "f10", "p", "m", "q", "f14"),
  };
  const diff = modify("near.txt", hunk(8, 8, [" p", "-m", "+M", " q"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), {
    "near.txt": text("f1", "f2", "f3", "p", "m", "q", "f7", "f8", "f9", "f10", "p", "M", "q", "f14"),
  });
  assert.deepEqual(hunksOf(r), [{ path: "near.txt", hunk: 1, offset: 3 }]);
});

test("of two matches the nearer one is used when it is earlier in the file", () => {
  // Stated line 8: matches at line 6 (2 before) and line 13 (5 after).
  const files: Files = {
    "near2.txt": text("f1", "f2", "f3", "f4", "f5", "p", "m", "q", "f9", "f10", "f11", "f12", "p", "m", "q", "f16"),
  };
  const diff = modify("near2.txt", hunk(8, 8, [" p", "-m", "+M", " q"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), {
    "near2.txt": text("f1", "f2", "f3", "f4", "f5", "p", "M", "q", "f9", "f10", "f11", "f12", "p", "m", "q", "f16"),
  });
  assert.deepEqual(hunksOf(r), [{ path: "near2.txt", hunk: 1, offset: -2 }]);
});

test("of two matches equally near the stated line, the earlier one is used", () => {
  // Stated line 7: matches at line 4 and line 10, both 3 away.
  const files: Files = {
    "tie.txt": text("f1", "f2", "f3", "p", "m", "q", "f7", "f8", "f9", "p", "m", "q", "f13"),
  };
  const diff = modify("tie.txt", hunk(7, 7, [" p", "-m", "+M", " q"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), {
    "tie.txt": text("f1", "f2", "f3", "p", "M", "q", "f7", "f8", "f9", "p", "m", "q", "f13"),
  });
  assert.deepEqual(hunksOf(r), [{ path: "tie.txt", hunk: 1, offset: -3 }]);
});

test("a one-line hunk with matches one line either side of its stated line uses the earlier", () => {
  const files: Files = { "tie1.txt": text("a", "b", "c", "m", "x", "m", "d") };
  const diff = modify("tie1.txt", hunk(5, 5, ["-m", "+M1", "+M2"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), { "tie1.txt": text("a", "b", "c", "M1", "M2", "x", "m", "d") });
  assert.deepEqual(hunksOf(r), [{ path: "tie1.txt", hunk: 1, offset: -1 }]);
});

test("a match at the stated line wins over matches elsewhere", () => {
  const files: Files = {
    "exact.txt": text("f1", "p", "m", "q", "f5", "p", "m", "q", "p", "m", "q", "f12"),
  };
  const diff = modify("exact.txt", hunk(6, 6, [" p", "-m", "+M", " q"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), {
    "exact.txt": text("f1", "p", "m", "q", "f5", "p", "M", "q", "p", "m", "q", "f12"),
  });
  assert.deepEqual(hunksOf(r), [{ path: "exact.txt", hunk: 1, offset: 0 }]);
});

test("there is no fuzz: a nearer place differing in one context line is passed over for an exact match", () => {
  // At the stated line 5 the trailing context differs; the exact match is at line 11.
  const files: Files = {
    "fuzz.txt": text("f1", "f2", "f3", "f4", "p", "m", "X", "f8", "f9", "f10", "p", "m", "q", "f14"),
  };
  const diff = modify("fuzz.txt", hunk(5, 5, [" p", "-m", "+M", " q"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), {
    "fuzz.txt": text("f1", "f2", "f3", "f4", "p", "m", "X", "f8", "f9", "f10", "p", "M", "q", "f14"),
  });
  assert.deepEqual(hunksOf(r), [{ path: "fuzz.txt", hunk: 1, offset: 6 }]);
});

test("there is no fuzz: a hunk whose trailing context line matches nowhere is rejected with no match", () => {
  const files: Files = { "nofuzz.txt": text("f1", "p", "m", "Q", "f5") };
  const diff = modify("nofuzz.txt", hunk(2, 2, [" p", "-m", "+M", " q"]));
  const r = rejected(applyPatch(files, diff));
  assert.deepEqual(rejectsOf(r), [{ path: "nofuzz.txt", hunk: 1, reason: "no match" }]);
  assert.deepEqual(plain(r.files), files);
});

test("a hunk whose leading context or removed line differs, even only in indentation, is rejected with no match", () => {
  const files: Files = {
    "indent.ts": text("function f() {", "    return x;", "}"),
    "removed.txt": text("a", "b", "c"),
  };
  const diff =
    modify("indent.ts", hunk(1, 1, [" function f() {", "-  return x;", "+  return y;", " }"])) +
    modify("removed.txt", hunk(1, 1, [" a", "-B", "+x", " c"]));
  const r = rejected(applyPatch(files, diff));
  assert.deepEqual(rejectsOf(r), [
    { path: "indent.ts", hunk: 1, reason: "no match" },
    { path: "removed.txt", hunk: 1, reason: "no match" },
  ]);
  assert.deepEqual(plain(r.files), files);
});

// --- Several hunks in one file apply in order ------------------------------

test("several hunks that change line counts apply in order to one file", () => {
  const files: Files = { "multi.txt": text(...seq("L", 1, 15)) };
  const diff = modify(
    "multi.txt",
    hunk(2, 2, [" L2", "-L3", "+A3", "+B3", " L4"]),
    hunk(7, 8, [" L7", "-L8", "-L9", " L10"]),
    hunk(13, 12, [" L13", "+N", " L14"]),
  );
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), {
    "multi.txt": text("L1", "L2", "A3", "B3", "L4", "L5", "L6", "L7", "L10", "L11", "L12", "L13", "N", "L14", "L15"),
  });
  assert.deepEqual(
    hunksOf(r).map((h) => [h.path, h.hunk]),
    [
      ["multi.txt", 1],
      ["multi.txt", 2],
      ["multi.txt", 3],
    ],
  );
});

test("several same-size hunks in a file shifted by two lines each report offset 2", () => {
  const files: Files = { "shift.txt": text("h1", "h2", ...seq("k", 1, 12)) };
  const diff = modify(
    "shift.txt",
    hunk(3, 3, [" k3", "-k4", "+K4", " k5"]),
    hunk(9, 9, [" k9", "-k10", "+K10", " k11"]),
  );
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), {
    "shift.txt": text("h1", "h2", "k1", "k2", "k3", "K4", "k5", "k6", "k7", "k8", "k9", "K10", "k11", "k12"),
  });
  assert.deepEqual(hunksOf(r), [
    { path: "shift.txt", hunk: 1, offset: 2 },
    { path: "shift.txt", hunk: 2, offset: 2 },
  ]);
});

test("a later hunk is not placed before the end of the hunk before it, even when that match is nearer", () => {
  // Hunk 1 spans lines 3-5. Hunk 2 (stated line 7) matches at line 4 (inside hunk 1) and line 11.
  const files: Files = {
    "order.txt": text("k1", "k2", "t1", "dup", "t3", "k6", "k7", "k8", "k9", "k10", "dup", "k12", "k13", "k14"),
  };
  const diff = modify("order.txt", hunk(3, 3, [" t1", " dup", "-t3", "+T3"]), hunk(7, 7, ["-dup", "+DUP"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), {
    "order.txt": text("k1", "k2", "t1", "dup", "T3", "k6", "k7", "k8", "k9", "k10", "DUP", "k12", "k13", "k14"),
  });
  assert.deepEqual(hunksOf(r), [
    { path: "order.txt", hunk: 1, offset: 0 },
    { path: "order.txt", hunk: 2, offset: 4 },
  ]);
});

test("a later hunk whose only match lies before the end of the hunk before it is rejected with no match", () => {
  const files: Files = {
    "order2.txt": text("k1", "k2", "t1", "dup", "t3", "k6", "k7", "k8", "k9", "k10", "k11", "k12"),
  };
  const diff = modify("order2.txt", hunk(3, 3, [" t1", " dup", "-t3", "+T3"]), hunk(7, 7, ["-dup", "+DUP"]));
  const r = rejected(applyPatch(files, diff));
  assert.deepEqual(rejectsOf(r), [{ path: "order2.txt", hunk: 2, reason: "no match" }]);
  assert.deepEqual(plain(r.files), files);
});

test("a later hunk cannot match the lines added by the hunk before it", () => {
  const files: Files = { "added.txt": text(...seq("k", 1, 8)) };
  const diff = modify("added.txt", hunk(2, 2, [" k2", "+Z", " k3"]), hunk(4, 5, ["-Z", "+W"]));
  const r = rejected(applyPatch(files, diff));
  assert.deepEqual(rejectsOf(r), [{ path: "added.txt", hunk: 2, reason: "no match" }]);
  assert.deepEqual(plain(r.files), files);
});
