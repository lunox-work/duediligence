import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPatch } from "../../src/index.js";
import type { Applied, ApplyResult, Rejected } from "../../src/index.js";

/** Join diff lines, each ending with "\n". */
function diff(...lines: string[]): string {
  return lines.map((line) => line + "\n").join("");
}

/** The headers of a diff that changes `path` in place. */
function header(path: string): string[] {
  return [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`];
}

function applied(result: ApplyResult): Applied {
  if (!result.ok) {
    throw new Error(`expected the patch to apply, got ${JSON.stringify(result.rejected)}`);
  }
  return result;
}

function rejected(result: ApplyResult): Rejected {
  if (result.ok) {
    throw new Error(`expected the patch to be rejected, got ${JSON.stringify(result.files)}`);
  }
  return result;
}

// Scenario: A hunk applies at its stated line

test("a hunk matching at its old start line replaces its removed lines with its added lines, offset 0", () => {
  const files = { "f.txt": "a\nb\nc\nd\ne\n", "other.txt": "o\n" };
  const before = { ...files };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -2,3 +2,3 @@", " b", "-c", "+C", " d")),
  );
  assert.deepEqual(result.files, { "f.txt": "a\nb\nC\nd\ne\n", "other.txt": "o\n" });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: 0 }]);
  assert.deepEqual(files, before);
});

test("a hunk that matches at its stated line and also elsewhere applies at its stated line", () => {
  const files = { "f.txt": "x\ny\nx\ny\nx\n" };
  const result = applied(applyPatch(files, diff(...header("f.txt"), "@@ -3,2 +3,2 @@", "-x", "+X", " y")));
  assert.deepEqual(result.files, { "f.txt": "x\ny\nX\ny\nx\n" });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: 0 }]);
});

test("a hunk header with missing counts means a count of 1", () => {
  const files = { "f.txt": "a\nb\n" };
  const result = applied(applyPatch(files, diff(...header("f.txt"), "@@ -1 +1 @@", "-a", "+A")));
  assert.deepEqual(result.files, { "f.txt": "A\nb\n" });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: 0 }]);
});

// Scenario: A hunk whose lines moved applies at the nearest match

test("a hunk whose lines moved later in the file applies there with a positive offset", () => {
  const files = { "f.txt": "n1\nn2\na\nb\nc\n" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -1,3 +1,3 @@", " a", "-b", "+B", " c")),
  );
  assert.deepEqual(result.files, { "f.txt": "n1\nn2\na\nB\nc\n" });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: 2 }]);
});

test("of two matches equally near the stated line, the earlier is used, with a negative offset", () => {
  const files = { "f.txt": "T\nq\nr\nq\nT\n" };
  const result = applied(applyPatch(files, diff(...header("f.txt"), "@@ -3 +3 @@", "-T", "+U")));
  assert.deepEqual(result.files, { "f.txt": "U\nq\nr\nq\nT\n" });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: -2 }]);
});

test("a moved hunk applies at the nearest match, not the first in the file", () => {
  const files = { "f.txt": "T\nq\nq\nq\nq\nT\n" };
  const result = applied(applyPatch(files, diff(...header("f.txt"), "@@ -5 +5 @@", "-T", "+U")));
  assert.deepEqual(result.files, { "f.txt": "T\nq\nq\nq\nq\nU\n" });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: 1 }]);
});

test("a hunk with one context line matching nowhere is rejected: there is no fuzz", () => {
  const files = { "f.txt": "a\nb\nc\n" };
  const result = rejected(
    applyPatch(files, diff(...header("f.txt"), "@@ -1,3 +1,3 @@", " a", "-b", "+B", " z")),
  );
  assert.deepEqual(result.rejected, [{ path: "f.txt", hunk: 1, reason: "no match" }]);
  assert.deepEqual(result.files, { "f.txt": "a\nb\nc\n" });
});

// Scenario: Several hunks in one file apply in order

test("several hunks in one file all apply, each to the file as changed by those before it", () => {
  const files = { "f.txt": "a\nb\nc\nd\ne\nf\ng\n" };
  const result = applied(
    applyPatch(
      files,
      diff(
        ...header("f.txt"),
        "@@ -1,3 +1,4 @@",
        " a",
        "-b",
        "+b1",
        "+b2",
        " c",
        "@@ -5,3 +6,3 @@",
        " e",
        "-f",
        "+F",
        " g",
      ),
    ),
  );
  assert.deepEqual(result.files, { "f.txt": "a\nb1\nb2\nc\nd\ne\nF\ng\n" });
  const numbers = result.hunks
    .filter((h) => h.path === "f.txt")
    .map((h) => h.hunk)
    .sort((x, y) => x - y);
  assert.deepEqual(numbers, [1, 2]);
});

test("a later hunk is never placed before the end of the hunk before it, even where that is nearer", () => {
  const files = { "f.txt": "a\nb\nx\nc\nd\ne\nf\nx\ng\n" };
  const result = applied(
    applyPatch(
      files,
      diff(
        ...header("f.txt"),
        "@@ -1,4 +1,4 @@",
        " a",
        "-b",
        "+B",
        " x",
        " c",
        "@@ -5 +5 @@",
        "-x",
        "+X",
      ),
    ),
  );
  assert.deepEqual(result.files, { "f.txt": "a\nB\nx\nc\nd\ne\nf\nX\ng\n" });
  const second = result.hunks.find((h) => h.path === "f.txt" && h.hunk === 2);
  assert.deepEqual(second, { path: "f.txt", hunk: 2, offset: 3 });
  const first = result.hunks.find((h) => h.path === "f.txt" && h.hunk === 1);
  assert.deepEqual(first, { path: "f.txt", hunk: 1, offset: 0 });
});
