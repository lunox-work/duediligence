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

function remove(path: string, ...hunks: string[]): string {
  return `diff --git a/${path} b/${path}\ndeleted file mode 100644\n--- a/${path}\n+++ /dev/null\n` + hunks.join("");
}

// --- A file's line endings are kept ----------------------------------------

test("a CRLF file matches an LF diff and every added line ends with CRLF", () => {
  const files: Files = { "src/win.ts": "one\r\ntwo\r\nthree\r\nfour\r\n" };
  const diff = modify("src/win.ts", hunk(2, 2, [" two", "-three", "+THREE", "+three-b", " four"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), { "src/win.ts": "one\r\ntwo\r\nTHREE\r\nthree-b\r\nfour\r\n" });
});

test("lines added at the end of a CRLF file end with CRLF", () => {
  const files: Files = { "end.bat": "@echo off\r\nset A=1\r\n" };
  const diff = modify("end.bat", hunk(2, 2, [" set A=1", "+set B=2", "+exit"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), { "end.bat": "@echo off\r\nset A=1\r\nset B=2\r\nexit\r\n" });
});

test("an LF diff matches a CRLF file at an offset", () => {
  const files: Files = { "off.txt": "x\r\na\r\nb\r\nc\r\n" };
  const diff = modify("off.txt", hunk(1, 1, [" a", "-b", "+B", " c"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), { "off.txt": "x\r\na\r\nB\r\nc\r\n" });
  assert.deepEqual(hunksOf(r), [{ path: "off.txt", hunk: 1, offset: 1 }]);
});

test("a file whose first line ends with LF gets LF on added lines, and its CRLF lines are kept", () => {
  const files: Files = { "mixed.txt": "head\nmid\r\ntail\r\n" };
  const diff = modify("mixed.txt", hunk(2, 2, [" mid", "+ins", " tail"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), { "mixed.txt": "head\nmid\r\nins\ntail\r\n" });
});

test("a file whose first line ends with CRLF gets CRLF on added lines, and its LF lines are kept", () => {
  const files: Files = { "mixed2.txt": "head\r\nmid\ntail\n" };
  const diff = modify("mixed2.txt", hunk(2, 2, ["-mid", "+MID", " tail"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), { "mixed2.txt": "head\r\nMID\r\ntail\n" });
});

test("a one-line file with no line ending gets LF on added lines", () => {
  const files: Files = { "solo.txt": "solo" };
  const diff = modify("solo.txt", hunk(1, 1, ["-solo", "\\ No newline at end of file", "+solo", "+next"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), { "solo.txt": "solo\nnext\n" });
});

test("an empty file gets LF on added lines", () => {
  const files: Files = { "empty.txt": "" };
  const diff = modify("empty.txt", hunk(0, 1, ["+x", "+y"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), { "empty.txt": "x\ny\n" });
});

test("a CRLF file is deleted by an LF diff of its lines", () => {
  const files: Files = { "dos.ini": "[a]\r\nk=v\r\n", "other": "o\n" };
  const diff = remove("dos.ini", hunk(1, 0, ["-[a]", "-k=v"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), { "other": "o\n" });
});

// --- A missing final newline is honoured -----------------------------------

test("marker after a removed last line with no marker after the added line gives a final newline", () => {
  const files: Files = { "nl1.txt": "a\nb" };
  const diff = modify("nl1.txt", hunk(1, 1, [" a", "-b", "\\ No newline at end of file", "+B"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), { "nl1.txt": "a\nB\n" });
});

test("marker after an added last line leaves the new last line without a newline", () => {
  const files: Files = { "nl2.txt": "a\nb\n" };
  const diff = modify("nl2.txt", hunk(1, 1, [" a", "-b", "+B", "\\ No newline at end of file"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), { "nl2.txt": "a\nB" });
});

test("markers after both the removed and the added last lines keep the file without a final newline", () => {
  const files: Files = { "nl3.txt": "m1\nm2\nm3" };
  const diff = modify(
    "nl3.txt",
    hunk(2, 2, [" m2", "-m3", "\\ No newline at end of file", "+M3", "+M4", "\\ No newline at end of file"]),
  );
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), { "nl3.txt": "m1\nm2\nM3\nM4" });
});

test("marker after a context last line keeps that line last and without a newline", () => {
  const files: Files = { "nl4.txt": "x\ny" };
  const diff = modify("nl4.txt", hunk(1, 1, [" x", "+i", " y", "\\ No newline at end of file"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), { "nl4.txt": "x\ni\ny" });
});

test("marker after an added line in a CRLF file leaves the new last line without an ending", () => {
  const files: Files = { "crlf-nl.txt": "p\r\nq\r\n" };
  const diff = modify("crlf-nl.txt", hunk(1, 1, [" p", "-q", "+Q", "\\ No newline at end of file"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), { "crlf-nl.txt": "p\r\nQ" });
});

test("a CRLF file lacking a final newline gains CRLF endings when the hunk ends without a marker", () => {
  const files: Files = { "crlf-nl2.txt": "a\r\nb" };
  const diff = modify("crlf-nl2.txt", hunk(1, 1, [" a", "-b", "\\ No newline at end of file", "+b", "+c"]));
  const r = applied(applyPatch(files, diff));
  assert.deepEqual(plain(r.files), { "crlf-nl2.txt": "a\r\nb\r\nc\r\n" });
});

test("marker after a removed line does not match when that line has a newline in the file", () => {
  const files: Files = { "nl5.txt": "a\nb\n" };
  const diff = modify("nl5.txt", hunk(1, 1, [" a", "-b", "\\ No newline at end of file", "+B"]));
  const r = rejected(applyPatch(files, diff));
  assert.deepEqual(rejectsOf(r), [{ path: "nl5.txt", hunk: 1, reason: "no match" }]);
  assert.deepEqual(plain(r.files), files);
});

test("marker after a removed line does not match when that line is not the last in the file", () => {
  const files: Files = { "nl6.txt": "a\nb\nc" };
  const diff = modify("nl6.txt", hunk(2, 2, ["-b", "\\ No newline at end of file", "+B"]));
  const r = rejected(applyPatch(files, diff));
  assert.deepEqual(rejectsOf(r), [{ path: "nl6.txt", hunk: 1, reason: "no match" }]);
  assert.deepEqual(plain(r.files), files);
});
