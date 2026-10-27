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

const NO_NEWLINE = "\\ No newline at end of file";

// Scenario: A file's line endings are kept

test("a \\n diff applies to a \\r\\n file and every added line ends with \\r\\n", () => {
  const files = { "f.txt": "a\r\nb\r\nc\r\n" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -1,3 +1,4 @@", " a", "-b", "+B", "+B2", " c")),
  );
  assert.deepEqual(result.files, { "f.txt": "a\r\nB\r\nB2\r\nc\r\n" });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: 0 }]);
});

test("added lines take the ending of the file's first line, not of the lines around them", () => {
  const files = { "f.txt": "a\r\nb\nc\n" };
  const result = applied(applyPatch(files, diff(...header("f.txt"), "@@ -2 +2 @@", "-b", "+B")));
  assert.deepEqual(result.files, { "f.txt": "a\r\nB\r\nc\n" });
});

test("added lines end with \\n in a file whose first line is \\n-terminated though later lines are \\r\\n", () => {
  const files = { "f.txt": "a\nb\r\nc\r\n" };
  const result = applied(applyPatch(files, diff(...header("f.txt"), "@@ -3 +3 @@", "-c", "+C")));
  assert.deepEqual(result.files, { "f.txt": "a\nb\r\nC\n" });
});

test("added lines end with \\n in a file whose first line has no ending", () => {
  const files = { "f.txt": "a" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -1 +1,2 @@", "-a", NO_NEWLINE, "+a", "+b")),
  );
  assert.deepEqual(result.files, { "f.txt": "a\nb\n" });
});

// Scenario: A missing final newline is honoured

test("a marker after a removed line matches a file without a final newline, and the new file ends with one", () => {
  const files = { "f.txt": "a\nb" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -1,2 +1,2 @@", " a", "-b", NO_NEWLINE, "+B")),
  );
  assert.deepEqual(result.files, { "f.txt": "a\nB\n" });
});

test("a marker after an added line leaves the new last line without a newline", () => {
  const files = { "f.txt": "a\nb\n" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -1,2 +1,2 @@", " a", "-b", "+B", NO_NEWLINE)),
  );
  assert.deepEqual(result.files, { "f.txt": "a\nB" });
});

test("a marker after a final context line keeps that last line without a newline", () => {
  const files = { "f.txt": "a\nb" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -1,2 +1,2 @@", "-a", "+A", " b", NO_NEWLINE)),
  );
  assert.deepEqual(result.files, { "f.txt": "A\nb" });
});

test("a marker after a removed line that is not the file's last line does not match", () => {
  const files = { "f.txt": "a\nb\nc\n" };
  const result = rejected(
    applyPatch(files, diff(...header("f.txt"), "@@ -1,2 +1,2 @@", " a", "-b", NO_NEWLINE, "+B")),
  );
  assert.deepEqual(result.rejected, [{ path: "f.txt", hunk: 1, reason: "no match" }]);
  assert.deepEqual(result.files, { "f.txt": "a\nb\nc\n" });
});
