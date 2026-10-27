import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPatch } from "../../src/index.js";
import type { Files, AppliedHunk, RejectedHunk } from "../../src/index.js";

const diff = (...lines: string[]): string => lines.join("\n") + "\n";
const header = (path: string): string[] => [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`];
const marker = "\\ No newline at end of file";
const sorted = <T extends { path: string; hunk: number }>(items: T[]): T[] =>
  [...items].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.hunk - b.hunk);

function applied(files: Files, patch: string, expected: Files, hunks: AppliedHunk[]): void {
  const before = { ...files };
  const result = applyPatch(files, patch);
  assert.deepEqual(files, before);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Expected application");
  assert.deepEqual(result.files, expected);
  assert.deepEqual(sorted(result.hunks), sorted(hunks));
}

function rejected(files: Files, patch: string, expected: RejectedHunk[]): void {
  const before = { ...files };
  const result = applyPatch(files, patch);
  assert.deepEqual(files, before);
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("Expected rejection");
  assert.deepEqual(result.files, before);
  assert.deepEqual(sorted(result.rejected), sorted(expected));
}

function malformed(files: Files, patch: string): void {
  const before = { ...files };
  assert.throws(() => applyPatch(files, patch), (error: unknown): boolean => {
    // No diagnostic wording or Error subclass is specified. Check the specified
    // error outcome and explicitly exclude the unimplemented interface's error.
    assert.ok(error instanceof Error, "a malformed diff must fail with an error");
    if (!(error instanceof Error)) return false;
    assert.notEqual(error.message, "not implemented");
    return true;
  });
  assert.deepEqual(files, before);
}

// Extends public "matches LF diff lines against CRLF and adds CRLF lines".
test("[boundary-2] keeps CRLF through several hunks with blank additions", () => {
  applied({ "win": "a\r\nb\r\nc\r\nd\r\n" },
    diff(...header("win"), "@@ -1 +1,3 @@", "-a", "+A", "+", "+A2",
      "@@ -4 +6,2 @@", "-d", "+D", "+D2"),
    { "win": "A\r\n\r\nA2\r\nb\r\nc\r\nD\r\nD2\r\n" },
    [{ path: "win", hunk: 1, offset: 0 }, { path: "win", hunk: 2, offset: 0 }]);
});

// Extends public "chooses the first line's ending for additions in a mixed-ending file".
test("[boundary-2] an LF first line controls additions despite a majority of CRLF lines", () => {
  applied({ "mixed": "first\nsecond\r\nold\r\nlast\r\n" },
    diff(...header("mixed"), "@@ -3 +3,2 @@", "-old", "+new", "+extra"),
    { "mixed": "first\nsecond\r\nnew\nextra\nlast\r\n" },
    [{ path: "mixed", hunk: 1, offset: 0 }]);
});

test("[boundary-2] a blank first line still determines the CRLF ending", () => {
  applied({ "mixed": "\r\nold\nlast\n" },
    diff(...header("mixed"), "@@ -2 +2 @@", "-old", "+new"),
    { "mixed": "\r\nnew\r\nlast\n" }, [{ path: "mixed", hunk: 1, offset: 0 }]);
});

// Extends public "defaults to LF when inserting into an existing empty file".
test("[boundary-2] empty files independently default to LF among CRLF files", () => {
  applied({ "empty": "", "win": "old\r\n" },
    diff(...header("win"), "@@ -1 +1 @@", "-old", "+new",
      ...header("empty"), "@@ -0,0 +1,3 @@", "+first", "+", "+last"),
    { "empty": "first\n\nlast\n", "win": "new\r\n" },
    [{ path: "win", hunk: 1, offset: 0 }, { path: "empty", hunk: 1, offset: 0 }]);
});

test("[boundary-2] a single unterminated line has no ending and additions default to LF", () => {
  applied({ "x": "old" },
    diff(...header("x"), "@@ -1 +1,2 @@", "-old", marker, "+first", "+last"),
    { "x": "first\nlast\n" }, [{ path: "x", hunk: 1, offset: 0 }]);
});

test("[boundary-2] each file independently chooses its ending when several files change", () => {
  applied({ "lf": "old\n", "crlf": "old\r\n", "empty": "" },
    diff(...header("crlf"), "@@ -1 +1 @@", "-old", "+CRLF",
      ...header("lf"), "@@ -1 +1 @@", "-old", "+LF",
      ...header("empty"), "@@ -0,0 +1 @@", "+empty"),
    { "lf": "LF\n", "crlf": "CRLF\r\n", "empty": "empty\n" },
    [{ path: "lf", hunk: 1, offset: 0 }, { path: "crlf", hunk: 1, offset: 0 }, { path: "empty", hunk: 1, offset: 0 }]);
});

// Extends public "honors markers on both removed and added final lines".
test("[boundary-3] markers on the last lines of larger replacement blocks affect only those lines", () => {
  applied({ "x": "prefix\nold one\nold two" },
    diff(...header("x"), "@@ -2,2 +2,3 @@", "-old one", "-old two", marker,
      "+new one", "+", "+new last", marker),
    { "x": "prefix\nnew one\n\nnew last" }, [{ path: "x", hunk: 1, offset: 0 }]);
});

// Extends public "preserves a marked final context line without a newline".
test("[boundary-3] final context marker survives a length-changing hunk in CRLF text", () => {
  applied({ "x": "prefix\r\nold\r\nlast" },
    diff(...header("x"), "@@ -2,2 +2,3 @@", "-old", "+one", "+two", " last", marker),
    { "x": "prefix\r\none\r\ntwo\r\nlast" }, [{ path: "x", hunk: 1, offset: 0 }]);
});

// Extends public "restores a final newline when the last added line has no marker".
test("[boundary-3] unmarked replacement restores a CRLF final newline", () => {
  applied({ "x": "first\r\nold" },
    diff(...header("x"), "@@ -2 +2,2 @@", "-old", marker, "+one", "+two"),
    { "x": "first\r\none\r\ntwo\r\n" }, [{ path: "x", hunk: 1, offset: 0 }]);
});

// Extends public "removes the final newline when only the added line is marked".
test("[boundary-3] final added marker removes CRLF without removing earlier newlines", () => {
  applied({ "x": "first\r\nold\r\n" },
    diff(...header("x"), "@@ -2 +2,3 @@", "-old", "+one", "+two", "+last", marker),
    { "x": "first\r\none\r\ntwo\r\nlast" }, [{ path: "x", hunk: 1, offset: 0 }]);
});

// Extends public "rejects a marked removed line when the old line has a newline".
test("[boundary-3] a marked removed line cannot match a CRLF-terminated final line", () => {
  rejected({ "x": "first\r\nold\r\n" },
    diff(...header("x"), "@@ -2 +2 @@", "-old", marker, "+new", marker),
    [{ path: "x", hunk: 1, reason: "no match" }]);
});

test("[boundary-3] a marked removed line cannot match an interior line", () => {
  rejected({ "x": "old\nlast" },
    diff(...header("x"), "@@ -1 +1 @@", "-old", marker, "+new", marker),
    [{ path: "x", hunk: 1, reason: "no match" }]);
});

// Extends public "rejects a marked context line that is not the unterminated last line".
test("[boundary-3] a marked context line rejects a newline-terminated EOF", () => {
  rejected({ "x": "prefix\nold\nlast\n" },
    diff(...header("x"), "@@ -2,2 +2,2 @@", "-old", "+new", " last", marker),
    [{ path: "x", hunk: 1, reason: "no match" }]);
});

test("[boundary-3] searches past a terminated removed-line duplicate to the marked EOF", () => {
  applied({ "x": "old\ngap\nold" },
    diff(...header("x"), "@@ -1 +1 @@", "-old", marker, "+new", marker),
    { "x": "old\ngap\nnew" }, [{ path: "x", hunk: 1, offset: 2 }]);
});

test("[boundary-3] searches past a terminated context duplicate to a marked final context", () => {
  applied({ "x": "old\nlast\ngap\nold\nlast" },
    diff(...header("x"), "@@ -1,2 +1,2 @@", "-old", "+new", " last", marker),
    { "x": "old\nlast\ngap\nnew\nlast" }, [{ path: "x", hunk: 1, offset: 3 }]);
});

test("[boundary-3] a marker in one file does not remove another file's final newline", () => {
  applied({ "marked": "old\n", "plain": "old\n" },
    diff(...header("marked"), "@@ -1 +1 @@", "-old", "+new", marker,
      ...header("plain"), "@@ -1 +1 @@", "-old", "+new"),
    { "marked": "new", "plain": "new\n" },
    [{ path: "marked", hunk: 1, offset: 0 }, { path: "plain", hunk: 1, offset: 0 }]);
});

test("[boundary-3] an untouched unterminated tail survives a hunk earlier in the file", () => {
  applied({ "x": "old\nmiddle\nlast" },
    diff(...header("x"), "@@ -1 +1,2 @@", "-old", "+one", "+two"),
    { "x": "one\ntwo\nmiddle\nlast" }, [{ path: "x", hunk: 1, offset: 0 }]);
});

// Extends public "throws for a hunk truncated before its old count is satisfied".
test("[unhappy-3] context lines count on both sides but do not conceal a missing old line", () => {
  malformed({ "x": "before\na\nb\nafter\n" },
    diff(...header("x"), "@@ -1,4 +1,3 @@", " before", "-a", "+new", " after"));
});

// Extends public "throws for a hunk missing just one added line".
test("[unhappy-3] omitted old count does not conceal several missing additions", () => {
  malformed({ "x": "old\n" },
    diff(...header("x"), "@@ -1 +1,5 @@", "-old", "+one", "+two"));
});

// Extends public "throws for a complete hunk before any file header".
test("[unhappy-3] an orphan hunk is still malformed when a valid file section follows", () => {
  malformed({ "x": "old\n" },
    diff("@@ -0,0 +1,2 @@", "+orphan", "+line", ...header("x"), "@@ -1 +1 @@", "-old", "+new"));
});

// Extends public "throws when an incomplete hunk is followed by another file header".
test("[unhappy-3] an incomplete later hunk before another file makes the whole patch malformed", () => {
  malformed({ "x": "a\nb\nc\n", "y": "old\n" },
    diff(...header("x"), "@@ -1 +1 @@", "-a", "+A",
      "@@ -2,2 +2,2 @@", "-b", "+B",
      ...header("y"), "@@ -1 +1 @@", "-old", "+new"));
});

test("[unhappy-3] an incomplete hunk cannot borrow lines from the following hunk", () => {
  malformed({ "x": "a\nb\nc\n" },
    diff(...header("x"), "@@ -1 +1,2 @@", "-a", "+A", "@@ -3 +4 @@", "-c", "+C"));
});

test("[unhappy-3] newline markers do not satisfy missing hunk line counts", () => {
  malformed({ "x": "old" },
    diff(...header("x"), "@@ -1,2 +1,2 @@", "-old", marker, "+new", marker));
});

test("[unhappy-3] malformed hunks for missing files are errors rather than missing rejections", () => {
  malformed({}, diff(...header("missing"), "@@ -1,3 +1,2 @@", "-old", "+new"));
});

test("[unhappy-3] malformed late hunks cannot leave earlier creates deletes or renames committed", () => {
  malformed({ "delete": "", "source": "unchanged", "bad": "a\nb\n" },
    diff("diff --git a/new b/new", "new file mode 100644",
      "diff --git a/delete b/delete", "deleted file mode 100644",
      "diff --git a/source b/destination", "rename from source", "rename to destination",
      ...header("bad"), "@@ -1,2 +1 @@", "-a", "+A"));
});
