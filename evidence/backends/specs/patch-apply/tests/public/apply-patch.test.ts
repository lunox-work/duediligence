import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPatch } from "../../src/index.js";
import type { AppliedHunk, Files, RejectedHunk } from "../../src/index.js";

function diff(...lines: string[]): string {
  return lines.join("\n") + "\n";
}

function byHunk(a: { path: string; hunk: number }, b: { path: string; hunk: number }): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : a.hunk - b.hunk;
}

function expectApplied(
  files: Files,
  patch: string,
  expectedFiles: Files,
  expectedHunks: AppliedHunk[],
): void {
  const original = { ...files };
  const result = applyPatch(files, patch);
  assert.deepEqual(files, original, "the input files must not be modified");
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Expected an applied patch");
  assert.deepEqual(result.files, expectedFiles);
  // The interface promises every hunk, but does not prescribe array order.
  assert.deepEqual([...result.hunks].sort(byHunk), [...expectedHunks].sort(byHunk));
}

function expectRejected(files: Files, patch: string, expected: RejectedHunk[]): void {
  const original = { ...files };
  const result = applyPatch(files, patch);
  assert.deepEqual(files, original, "a rejection must not modify the input");
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("Expected a rejected patch");
  assert.deepEqual(result.files, original, "all returned files must be rolled back");
  assert.deepEqual([...result.rejected].sort(byHunk), [...expected].sort(byHunk));
}

test("[happy-1] replaces lines at the stated start with all context intact", () => {
  expectApplied(
    { "a.ts": "preamble\nbefore\nold\nafter\ntail\n", "keep.ts": "untouched\n" },
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -2,3 +2,3 @@", " before", "-old", "+new", " after"),
    { "a.ts": "preamble\nbefore\nnew\nafter\ntail\n", "keep.ts": "untouched\n" },
    [{ path: "a.ts", hunk: 1, offset: 0 }],
  );
});

test("[happy-1] accepts omitted counts for a one-line file", () => {
  expectApplied(
    { "a.ts": "old\n" },
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -1 +1 @@", "-old", "+new"),
    { "a.ts": "new\n" },
    [{ path: "a.ts", hunk: 1, offset: 0 }],
  );
});

test("[boundary-1] chooses the nearest later match and reports a positive offset", () => {
  expectApplied(
    { "a.ts": "one\ntwo\ntarget\nfour\nfive\ntarget\n" },
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -2 +2 @@", "-target", "+changed"),
    { "a.ts": "one\ntwo\nchanged\nfour\nfive\ntarget\n" },
    [{ path: "a.ts", hunk: 1, offset: 1 }],
  );
});

test("[boundary-1] chooses the nearest earlier match and reports a negative offset", () => {
  expectApplied(
    { "a.ts": "one\ntarget\nthree\nfour\nfive\nsix\nseven\ntarget\n" },
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -4 +4 @@", "-target", "+changed"),
    { "a.ts": "one\nchanged\nthree\nfour\nfive\nsix\nseven\ntarget\n" },
    [{ path: "a.ts", hunk: 1, offset: -2 }],
  );
});

test("[boundary-1] breaks an equal-distance tie in favor of the earlier match", () => {
  expectApplied(
    { "a.ts": "one\ntarget\nthree\ntarget\nlast\n" },
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -3 +3 @@", "-target", "+changed"),
    { "a.ts": "one\nchanged\nthree\ntarget\nlast\n" },
    [{ path: "a.ts", hunk: 1, offset: -1 }],
  );
});

test("[boundary-1] rejects a match that would require dropping a context line", () => {
  expectRejected(
    { "a.ts": "different\nold\nafter\n" },
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -1,3 +1,3 @@", " before", "-old", "+new", " after"),
    [{ path: "a.ts", hunk: 1, reason: "no match" }],
  );
});

test("[happy-2] locates later hunks after earlier additions shift their stated lines", () => {
  expectApplied(
    { "a.ts": "A\nB\nC\nD\nE\n" },
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -1 +1,3 @@", "-A", "+A1", "+A2", "+A3",
      "@@ -4 +6 @@", "-D", "+D2"),
    { "a.ts": "A1\nA2\nA3\nB\nC\nD2\nE\n" },
    [{ path: "a.ts", hunk: 1, offset: 0 }, { path: "a.ts", hunk: 2, offset: 0 }],
  );
});

test("[happy-2] locates later hunks after earlier removals shift their stated lines", () => {
  expectApplied(
    { "a.ts": "A\nB\nC\nD\nE\n" },
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -1,2 +1 @@", "-A", "-B", "+AB",
      "@@ -4 +3 @@", "-D", "+D2"),
    { "a.ts": "AB\nC\nD2\nE\n" },
    [{ path: "a.ts", hunk: 1, offset: 0 }, { path: "a.ts", hunk: 2, offset: 0 }],
  );
});

test("[happy-2] permits the next hunk immediately after the preceding hunk", () => {
  expectApplied(
    { "a.ts": "A\nB\n" },
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -1 +1 @@", "-A", "+A2", "@@ -2 +2 @@", "-B", "+B2"),
    { "a.ts": "A2\nB2\n" },
    [{ path: "a.ts", hunk: 1, offset: 0 }, { path: "a.ts", hunk: 2, offset: 0 }],
  );
});

test("[happy-2] measures each offset from the old start adjusted only by preceding line-count changes", () => {
  expectApplied(
    { "a.ts": "lead\ntarget\nspacer\nD\nlast\n" },
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -1 +1,2 @@", "-target", "+T1", "+T2",
      "@@ -5 +6 @@", "-D", "+changed D"),
    { "a.ts": "lead\nT1\nT2\nspacer\nchanged D\nlast\n" },
    [{ path: "a.ts", hunk: 1, offset: 1 }, { path: "a.ts", hunk: 2, offset: -1 }],
  );
});

test("[happy-2] rejects a later hunk whose only match precedes the prior hunk's end", () => {
  expectRejected(
    { "a.ts": "target\nspacer\ntail\nlast\n" },
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -3 +3 @@", "-tail", "+changed tail",
      "@@ -4 +4 @@", "-target", "+changed target"),
    [{ path: "a.ts", hunk: 2, reason: "no match" }],
  );
});

test("[happy-3] creates a file from added lines", () => {
  expectApplied(
    { "keep.ts": "keep\n" },
    diff("diff --git a/new.ts b/new.ts", "new file mode 100644",
      "--- /dev/null", "+++ b/new.ts", "@@ -0,0 +1,2 @@", "+first", "+second"),
    { "keep.ts": "keep\n", "new.ts": "first\nsecond\n" },
    [{ path: "new.ts", hunk: 1, offset: 0 }],
  );
});

test("[happy-3] creates an empty file without text headers or hunks", () => {
  expectApplied(
    {},
    diff("diff --git a/empty.ts b/empty.ts", "new file mode 100644"),
    { "empty.ts": "" },
    [],
  );
});

test("[happy-3] rejects creation at an existing path even when its file is empty", () => {
  expectRejected(
    { "new.ts": "" },
    diff("diff --git a/new.ts b/new.ts", "new file mode 100644",
      "--- /dev/null", "+++ b/new.ts", "@@ -0,0 +1 @@", "+new"),
    [{ path: "new.ts", hunk: 1, reason: "exists" }],
  );
});

test("[happy-3] rejects an empty-file creation without hunks at an existing path", () => {
  const files = { "empty.ts": "existing\n" };
  const result = applyPatch(files,
    diff("diff --git a/empty.ts b/empty.ts", "new file mode 100644"));
  assert.deepEqual(files, { "empty.ts": "existing\n" });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("Expected a rejected creation");
  assert.deepEqual(result.files, files);
  // The spec does not assign a hunk number to an operation without hunks.
  assert.equal(result.rejected.some((hunk) => hunk.path === "empty.ts" && hunk.reason === "exists"), true);
});

test("[happy-4] deletes a file when the removed lines are its whole text", () => {
  expectApplied(
    { "old.ts": "first\nsecond\n", "keep.ts": "keep\n" },
    diff("diff --git a/old.ts b/old.ts", "deleted file mode 100644",
      "--- a/old.ts", "+++ /dev/null", "@@ -1,2 +0,0 @@", "-first", "-second"),
    { "keep.ts": "keep\n" },
    [{ path: "old.ts", hunk: 1, offset: 0 }],
  );
});

test("[happy-4] deletes an empty file without text headers or hunks", () => {
  expectApplied(
    { "empty.ts": "", "keep.ts": "keep\n" },
    diff("diff --git a/empty.ts b/empty.ts", "deleted file mode 100644"),
    { "keep.ts": "keep\n" },
    [],
  );
});

test("[happy-4] rejects deletion when matching removed lines leave other text", () => {
  expectRejected(
    { "old.ts": "first\nsecond\n" },
    diff("diff --git a/old.ts b/old.ts", "deleted file mode 100644",
      "--- a/old.ts", "+++ /dev/null", "@@ -1 +0,0 @@", "-first"),
    [{ path: "old.ts", hunk: 1, reason: "no match" }],
  );
});

test("[happy-4] rejects a deletion without hunks when the file is nonempty", () => {
  const files = { "old.ts": "still here\n" };
  const result = applyPatch(files,
    diff("diff --git a/old.ts b/old.ts", "deleted file mode 100644"));
  assert.deepEqual(files, { "old.ts": "still here\n" });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("Expected a rejected deletion");
  assert.deepEqual(result.files, files);
  assert.equal(result.rejected.some((hunk) => hunk.path === "old.ts" && hunk.reason === "no match"), true);
});

test("[happy-5] renames a file and applies its hunks under the destination path", () => {
  expectApplied(
    { "old/a.ts": "before\nold\nafter\n", "keep.ts": "keep\n" },
    diff("diff --git a/old/a.ts b/new/a.ts", "rename from old/a.ts", "rename to new/a.ts",
      "--- a/old/a.ts", "+++ b/new/a.ts", "@@ -1,3 +1,3 @@",
      " before", "-old", "+new", " after"),
    { "new/a.ts": "before\nnew\nafter\n", "keep.ts": "keep\n" },
    [{ path: "new/a.ts", hunk: 1, offset: 0 }],
  );
});

test("[happy-5] renames without hunks or text headers and preserves text exactly", () => {
  expectApplied(
    { "old/a.ts": "first\r\nlast", "keep.ts": "" },
    diff("diff --git a/old/a.ts b/new/a.ts", "rename from old/a.ts", "rename to new/a.ts"),
    { "new/a.ts": "first\r\nlast", "keep.ts": "" },
    [],
  );
});

test("[boundary-2] matches LF diff lines against CRLF and adds CRLF lines", () => {
  expectApplied(
    { "a.ts": "before\r\nold\r\nafter\r\n" },
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -1,3 +1,4 @@", " before", "-old", "+new", "+extra", " after"),
    { "a.ts": "before\r\nnew\r\nextra\r\nafter\r\n" },
    [{ path: "a.ts", hunk: 1, offset: 0 }],
  );
});

test("[boundary-2] chooses the first line's ending for additions in a mixed-ending file", () => {
  expectApplied(
    { "a.ts": "first\r\nold\nlast\n" },
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -2 +2 @@", "-old", "+new"),
    { "a.ts": "first\r\nnew\r\nlast\n" },
    [{ path: "a.ts", hunk: 1, offset: 0 }],
  );
});

test("[boundary-2] defaults to LF when inserting into an existing empty file", () => {
  expectApplied(
    { "a.ts": "" },
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -0,0 +1 @@", "+first"),
    { "a.ts": "first\n" },
    [{ path: "a.ts", hunk: 1, offset: 0 }],
  );
});

test("[boundary-3] honors markers on both removed and added final lines", () => {
  expectApplied(
    { "a.ts": "first\nold" },
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -2 +2 @@", "-old", "\\ No newline at end of file",
      "+new", "\\ No newline at end of file"),
    { "a.ts": "first\nnew" },
    [{ path: "a.ts", hunk: 1, offset: 0 }],
  );
});

test("[boundary-3] preserves a marked final context line without a newline", () => {
  expectApplied(
    { "a.ts": "old\nlast" },
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -1,2 +1,2 @@", "-old", "+new", " last", "\\ No newline at end of file"),
    { "a.ts": "new\nlast" },
    [{ path: "a.ts", hunk: 1, offset: 0 }],
  );
});

test("[boundary-3] restores a final newline when the last added line has no marker", () => {
  expectApplied(
    { "a.ts": "old" },
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -1 +1 @@", "-old", "\\ No newline at end of file", "+new"),
    { "a.ts": "new\n" },
    [{ path: "a.ts", hunk: 1, offset: 0 }],
  );
});

test("[boundary-3] removes the final newline when only the added line is marked", () => {
  expectApplied(
    { "a.ts": "old\n" },
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -1 +1 @@", "-old", "+new", "\\ No newline at end of file"),
    { "a.ts": "new" },
    [{ path: "a.ts", hunk: 1, offset: 0 }],
  );
});

test("[boundary-3] rejects a marked removed line when the old line has a newline", () => {
  expectRejected(
    { "a.ts": "old\n" },
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -1 +1 @@", "-old", "\\ No newline at end of file", "+new"),
    [{ path: "a.ts", hunk: 1, reason: "no match" }],
  );
});

test("[boundary-3] rejects a marked context line that is not the unterminated last line", () => {
  expectRejected(
    { "a.ts": "old\nlast\nsuffix" },
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -1,2 +1,2 @@", "-old", "+new", " last", "\\ No newline at end of file"),
    [{ path: "a.ts", hunk: 1, reason: "no match" }],
  );
});

test("[unhappy-1] reports both failing hunks and rolls back an earlier successful hunk", () => {
  expectRejected(
    { "a.ts": "first\nsecond\nthird\n", "b.ts": "actual\n", "keep.ts": "keep\n" },
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -1 +1 @@", "-first", "+changed", "@@ -3 +3 @@", "-absent", "+new third",
      "diff --git a/b.ts b/b.ts", "--- a/b.ts", "+++ b/b.ts",
      "@@ -1 +1 @@", "-expected", "+new"),
    [{ path: "a.ts", hunk: 2, reason: "no match" }, { path: "b.ts", hunk: 1, reason: "no match" }],
  );
});

test("[unhappy-1] rolls back creation deletion and rename when later hunks fail", () => {
  expectRejected(
    { "delete.ts": "remove\n", "old/a.ts": "move\n", "a.ts": "actual\n", "b.ts": "actual\n" },
    diff("diff --git a/new.ts b/new.ts", "new file mode 100644",
      "--- /dev/null", "+++ b/new.ts", "@@ -0,0 +1 @@", "+created",
      "diff --git a/delete.ts b/delete.ts", "deleted file mode 100644",
      "--- a/delete.ts", "+++ /dev/null", "@@ -1 +0,0 @@", "-remove",
      "diff --git a/old/a.ts b/new/a.ts", "rename from old/a.ts", "rename to new/a.ts",
      "diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -1 +1 @@", "-absent", "+replacement",
      "diff --git a/b.ts b/b.ts", "--- a/b.ts", "+++ b/b.ts",
      "@@ -1 +1 @@", "-also absent", "+replacement"),
    [{ path: "a.ts", hunk: 1, reason: "no match" }, { path: "b.ts", hunk: 1, reason: "no match" }],
  );
});

test("[unhappy-2] rejects a hunk for a missing file", () => {
  expectRejected(
    { "keep.ts": "keep\n" },
    diff("diff --git a/missing.ts b/missing.ts", "--- a/missing.ts", "+++ b/missing.ts",
      "@@ -1 +1 @@", "-old", "+new"),
    [{ path: "missing.ts", hunk: 1, reason: "missing" }],
  );
});

test("[unhappy-2] reports every hunk of a missing file even with an empty input set", () => {
  expectRejected(
    {},
    diff("diff --git a/missing.ts b/missing.ts", "--- a/missing.ts", "+++ b/missing.ts",
      "@@ -1 +1 @@", "-old first", "+new first",
      "@@ -3 +3 @@", "-old third", "+new third"),
    [{ path: "missing.ts", hunk: 1, reason: "missing" },
      { path: "missing.ts", hunk: 2, reason: "missing" }],
  );
});

test("[unhappy-3] throws for a hunk truncated before its old count is satisfied", () => {
  const files = { "a.ts": "one\ntwo\n" };
  assert.throws(() => applyPatch(files,
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -1,2 +1 @@", "-one", "+new")));
  assert.deepEqual(files, { "a.ts": "one\ntwo\n" });
});

test("[unhappy-3] throws for a hunk missing just one added line", () => {
  assert.throws(() => applyPatch({ "a.ts": "old\n" },
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -1 +1,2 @@", "-old", "+only one")));
});

test("[unhappy-3] throws for a complete hunk before any file header", () => {
  assert.throws(() => applyPatch({ "a.ts": "old\n" },
    diff("@@ -1 +1 @@", "-old", "+new")));
});

test("[unhappy-3] throws when an incomplete hunk is followed by another file header", () => {
  const files = { "a.ts": "one\ntwo\n", "b.ts": "old\n" };
  assert.throws(() => applyPatch(files,
    diff("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts",
      "@@ -1,2 +1 @@", "-one", "+new",
      "diff --git a/b.ts b/b.ts", "--- a/b.ts", "+++ b/b.ts",
      "@@ -1 +1 @@", "-old", "+new")));
  assert.deepEqual(files, { "a.ts": "one\ntwo\n", "b.ts": "old\n" });
});
