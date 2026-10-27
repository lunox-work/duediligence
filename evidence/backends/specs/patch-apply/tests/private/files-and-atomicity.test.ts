import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPatch } from "../../src/index.js";
import type { Files, AppliedHunk, RejectedHunk } from "../../src/index.js";

const diff = (...lines: string[]): string => lines.join("\n") + "\n";
const header = (path: string): string[] => [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`];
const create = (path: string): string[] => [`diff --git a/${path} b/${path}`, "new file mode 100644"];
const remove = (path: string): string[] => [`diff --git a/${path} b/${path}`, "deleted file mode 100644"];
const rename = (from: string, to: string): string[] => [
  `diff --git a/${from} b/${to}`, `rename from ${from}`, `rename to ${to}`,
];
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

function operationRejected(files: Files, patch: string, path: string, reason: "exists" | "no match"): void {
  const before = { ...files };
  const result = applyPatch(files, patch);
  assert.deepEqual(files, before);
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("Expected rejection");
  assert.deepEqual(result.files, before);
  // Operations without hunks have no specified hunk number.
  assert.ok(result.rejected.some(item => item.path === path && item.reason === reason));
}

// Extends public "creates a file from added lines".
test("[happy-3] creates several nested files with literal prefixes, blanks and Unicode", () => {
  applied({ "keep": "unchanged" },
    diff(...create("a/deep.txt"), "--- /dev/null", "+++ b/a/deep.txt", "@@ -0,0 +1,5 @@",
      "+α", "+", "+--- literal", "++++ literal", "+  spaced  ",
      ...create("b/second.txt"), "--- /dev/null", "+++ b/b/second.txt", "@@ -0,0 +1 @@", "+β"),
    { "keep": "unchanged", "a/deep.txt": "α\n\n--- literal\n+++ literal\n  spaced  \n", "b/second.txt": "β\n" },
    [{ path: "a/deep.txt", hunk: 1, offset: 0 }, { path: "b/second.txt", hunk: 1, offset: 0 }]);
});

// Extends public "creates an empty file without text headers or hunks".
test("[happy-3] parses consecutive empty creations before a file with hunks", () => {
  applied({ "keep": "K\n" },
    diff(...create("nested/empty-a"), ...create("nested/empty-b"), ...header("keep"),
      "@@ -1 +1 @@", "-K", "+changed"),
    { "keep": "changed\n", "nested/empty-a": "", "nested/empty-b": "" },
    [{ path: "keep", hunk: 1, offset: 0 }]);
});

// Extends public "rejects creation at an existing path even when its file is empty".
test("[happy-3] creation rejects an occupied nonempty path rather than replacing or appending", () => {
  rejected({ "nested/new": "already\nhere\n", "keep": "" },
    diff(...create("nested/new"), "--- /dev/null", "+++ b/nested/new", "@@ -0,0 +1,2 @@", "+already", "+here"),
    [{ path: "nested/new", hunk: 1, reason: "exists" }]);
});

// Extends public "rejects an empty-file creation without hunks at an existing path".
test("[happy-3] an existing empty string still blocks a headerless empty creation", () => {
  operationRejected({ "nested/empty": "", "keep": "kept" }, diff(...create("nested/empty")), "nested/empty", "exists");
});

test("[happy-3] creates a file with an unterminated final line", () => {
  applied({}, diff(...create("no-newline"), "--- /dev/null", "+++ b/no-newline",
    "@@ -0,0 +1,3 @@", "+first", "+", "+last", "\\ No newline at end of file"),
    { "no-newline": "first\n\nlast" }, [{ path: "no-newline", hunk: 1, offset: 0 }]);
});

// Extends public "deletes a file when the removed lines are its whole text".
test("[happy-4] deletes an entire larger CRLF file with an unterminated final line", () => {
  applied({ "a/remove": "α\r\n\r\nlast", "keep": "unchanged" },
    diff(...remove("a/remove"), "--- a/a/remove", "+++ /dev/null", "@@ -1,3 +0,0 @@",
      "-α", "-", "-last", "\\ No newline at end of file"),
    { "keep": "unchanged" }, [{ path: "a/remove", hunk: 1, offset: 0 }]);
});

// Extends public "deletes an empty file without text headers or hunks".
test("[happy-4] deletes consecutive empty files while retaining an untouched empty file", () => {
  applied({ "one/empty": "", "two/empty": "", "keep/empty": "", "keep": "x" },
    diff(...remove("two/empty"), ...remove("one/empty")),
    { "keep/empty": "", "keep": "x" }, []);
});

// Extends public "rejects deletion when matching removed lines leave other text".
test("[happy-4] rejects a suffix-only deletion even though its removed lines match at EOF", () => {
  rejected({ "old": "prefix\nfirst\nsecond\n" },
    diff(...remove("old"), "--- a/old", "+++ /dev/null", "@@ -2,2 +0,0 @@", "-first", "-second"),
    [{ path: "old", hunk: 1, reason: "no match" }]);
});

test("[happy-4] rejects deletion of a middle block leaving both prefix and suffix", () => {
  rejected({ "old": "prefix\nonly\nsuffix\n" },
    diff(...remove("old"), "--- a/old", "+++ /dev/null", "@@ -2 +0,0 @@", "-only"),
    [{ path: "old", hunk: 1, reason: "no match" }]);
});

// Extends public "rejects a deletion without hunks when the file is nonempty".
test("[happy-4] a newline-only file is not empty for a headerless deletion", () => {
  operationRejected({ "blank": "\n", "keep": "" }, diff(...remove("blank")), "blank", "no match");
});

test("[happy-4] a deletion with wholly different text reports no match at the old path", () => {
  rejected({ "nested/old": "actual\ntext\n" },
    diff(...remove("nested/old"), "--- a/nested/old", "+++ /dev/null", "@@ -1,2 +0,0 @@", "-wrong", "-text"),
    [{ path: "nested/old", hunk: 1, reason: "no match" }]);
});

// Extends public "renames a file and applies its hunks under the destination path".
test("[happy-5] renames across directories with several hunks and relocated matches", () => {
  applied({ "a/old/name": "lead\na\nb\nc\nd\n", "keep": "K" },
    diff(...rename("a/old/name", "b/new/name"), "--- a/a/old/name", "+++ b/b/new/name",
      "@@ -1 +1,2 @@", "-a", "+A1", "+A2", "@@ -4 +5 @@", "-d", "+D"),
    { "b/new/name": "lead\nA1\nA2\nb\nc\nD\n", "keep": "K" },
    [{ path: "b/new/name", hunk: 1, offset: 1 }, { path: "b/new/name", hunk: 2, offset: 1 }]);
});

// Extends public "renames without hunks or text headers and preserves text exactly".
test("[happy-5] several headerless renames preserve empty and mixed-ending text", () => {
  applied({ "old/empty": "", "old/text": "α\n\r\nβ\r\nlast", "keep": "z" },
    diff(...rename("old/text", "new/text"), ...rename("old/empty", "new/empty")),
    { "new/empty": "", "new/text": "α\n\r\nβ\r\nlast", "keep": "z" }, []);
});

test("[happy-5] renamed CRLF text uses its existing line ending for additions", () => {
  applied({ "old": "before\r\nold\r\nlast\r\n" },
    diff(...rename("old", "new"), "--- a/old", "+++ b/new", "@@ -2 +2,2 @@", "-old", "+one", "+two"),
    { "new": "before\r\none\r\ntwo\r\nlast\r\n" }, [{ path: "new", hunk: 1, offset: 0 }]);
});

// Extends public "reports both failing hunks and rolls back an earlier successful hunk".
test("[unhappy-1] collects failures before and after successful hunks across three files", () => {
  rejected({ "z": "a\nb\nc\nd\ne\n", "a": "x\ny\nz\n", "m": "one\ntwo\n", "keep": "K" },
    diff(...header("z"), "@@ -1 +1 @@", "-absent a", "+A", "@@ -2 +2 @@", "-b", "+B",
      "@@ -4 +4 @@", "-absent d", "+D", "@@ -5 +5 @@", "-e", "+E",
      ...header("a"), "@@ -1 +1 @@", "-absent x", "+X", "@@ -3 +3 @@", "-absent z", "+Z",
      ...header("m"), "@@ -1 +1 @@", "-one", "+ONE", "@@ -2 +2 @@", "-absent two", "+TWO"),
    [{ path: "z", hunk: 1, reason: "no match" }, { path: "z", hunk: 3, reason: "no match" },
      { path: "a", hunk: 1, reason: "no match" }, { path: "a", hunk: 2, reason: "no match" },
      { path: "m", hunk: 2, reason: "no match" }]);
});

// Extends public "rolls back creation deletion and rename when later hunks fail".
test("[unhappy-1] rolls back operations on both sides of failures including empty operations", () => {
  rejected({ "bad1": "actual\n", "bad2": "actual\n", "empty-delete": "", "move": "original", "keep": "K" },
    diff(...header("bad1"), "@@ -1 +1 @@", "-wrong", "+new",
      ...create("empty-new"), ...remove("empty-delete"), ...rename("move", "moved"),
      ...header("bad2"), "@@ -1 +1 @@", "-also wrong", "+new",
      ...create("created"), "--- /dev/null", "+++ b/created", "@@ -0,0 +1 @@", "+text"),
    [{ path: "bad1", hunk: 1, reason: "no match" }, { path: "bad2", hunk: 1, reason: "no match" }]);
});

test("[unhappy-1] returns every distinct rejection reason and rolls back a successful edit", () => {
  rejected({ "occupied": "existing\n", "bad": "actual\n", "good": "old\n" },
    diff(...header("good"), "@@ -1 +1 @@", "-old", "+new",
      ...create("occupied"), "--- /dev/null", "+++ b/occupied", "@@ -0,0 +1 @@", "+created",
      ...header("absent"), "@@ -1 +1 @@", "-old", "+new",
      ...header("bad"), "@@ -1 +1 @@", "-wrong", "+new"),
    [{ path: "occupied", hunk: 1, reason: "exists" }, { path: "absent", hunk: 1, reason: "missing" },
      { path: "bad", hunk: 1, reason: "no match" }]);
});

test("[unhappy-1] failed rename hunks report the destination path and retain the source", () => {
  rejected({ "source": "first\nsecond\nthird\n", "other": "text\n" },
    diff(...rename("source", "destination"), "--- a/source", "+++ b/destination",
      "@@ -1 +1 @@", "-first", "+FIRST", "@@ -3 +3 @@", "-wrong", "+THIRD",
      ...header("other"), "@@ -1 +1 @@", "-missing", "+changed"),
    [{ path: "destination", hunk: 2, reason: "no match" }, { path: "other", hunk: 1, reason: "no match" }]);
});

// Extends public "rejects a hunk for a missing file".
test("[unhappy-2] distinguishes a missing nested path from a present empty path", () => {
  rejected({ "present": "", "keep": "K" },
    diff(...header("absent/deep"), "@@ -1 +1 @@", "-old", "+new",
      ...header("present"), "@@ -1 +1 @@", "-old", "+new"),
    [{ path: "absent/deep", hunk: 1, reason: "missing" }, { path: "present", hunk: 1, reason: "no match" }]);
});

// Extends public "reports every hunk of a missing file even with an empty input set".
test("[unhappy-2] reports all hunks of several missing files and restarts numbering", () => {
  rejected({}, diff(...header("z/missing"),
    "@@ -1 +1 @@", "-a", "+A", "@@ -3 +3 @@", "-b", "+B", "@@ -7 +7 @@", "-c", "+C",
    ...header("a/missing"), "@@ -2 +2 @@", "-d", "+D", "@@ -4 +4 @@", "-e", "+E"),
    [{ path: "z/missing", hunk: 1, reason: "missing" }, { path: "z/missing", hunk: 2, reason: "missing" },
      { path: "z/missing", hunk: 3, reason: "missing" }, { path: "a/missing", hunk: 1, reason: "missing" },
      { path: "a/missing", hunk: 2, reason: "missing" }]);
});

test("[unhappy-2] missing deletion hunks are reported under the old path", () => {
  rejected({ "keep": "K" },
    diff(...remove("gone"), "--- a/gone", "+++ /dev/null", "@@ -1,2 +0,0 @@", "-a", "-b"),
    [{ path: "gone", hunk: 1, reason: "missing" }]);
});

test("[unhappy-2] missing rename source rejects every hunk using its destination path", () => {
  rejected({ "keep": "K" },
    diff(...rename("absent", "destination"), "--- a/absent", "+++ b/destination",
      "@@ -1 +1 @@", "-a", "+A", "@@ -3 +3 @@", "-b", "+B"),
    [{ path: "destination", hunk: 1, reason: "missing" }, { path: "destination", hunk: 2, reason: "missing" }]);
});
