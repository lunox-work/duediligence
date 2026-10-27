import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPatch } from "../../src/index.js";
import type { ApplyResult, Rejected, RejectedHunk } from "../../src/index.js";

/** Join diff lines, each ending with "\n". */
function diff(...lines: string[]): string {
  return lines.map((line) => line + "\n").join("");
}

/** The headers of a diff that changes `path` in place. */
function header(path: string): string[] {
  return [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`];
}

function rejected(result: ApplyResult): Rejected {
  if (result.ok) {
    throw new Error(`expected the patch to be rejected, got ${JSON.stringify(result.files)}`);
  }
  return result;
}

/** Rejections in a fixed order, since the spec does not order them. */
function sorted(list: RejectedHunk[]): RejectedHunk[] {
  return [...list].sort((x, y) =>
    x.path < y.path ? -1 : x.path > y.path ? 1 : x.hunk - y.hunk,
  );
}

/** Any error but the stub's: the spec names no message for a malformed diff. */
function refused(error: unknown): boolean {
  return error instanceof Error && error.message !== "not implemented";
}

const NO_NEWLINE = "\\ No newline at end of file";

// Scenario: Every failing hunk is reported and nothing changes

// Extends "every failing hunk across files is reported and no file changes": three files, a failing third hunk, two failing hunks in one file.
test("[unhappy-1] failing hunks in several files and positions are all reported and no file changes", () => {
  const files = {
    "a.txt": "1\n2\n3\n4\n5\n6\n7\n8\n9\n",
    "b.txt": "p\nq\nr\ns\nt\nu\nv\nw\n",
    "c.txt": "c\n",
  };
  const before = { ...files };
  const result = rejected(
    applyPatch(
      files,
      diff(
        ...header("a.txt"),
        "@@ -1,2 +1,2 @@",
        "-1",
        "+one",
        " 2",
        "@@ -4,2 +4,2 @@",
        "-4",
        "+four",
        " 5",
        "@@ -8,2 +8,2 @@",
        "-8",
        "+eight",
        " nine",
        ...header("b.txt"),
        "@@ -1,2 +1,2 @@",
        "-P",
        "+X",
        " q",
        "@@ -6,2 +6,2 @@",
        "-u",
        "+U",
        " V",
        ...header("c.txt"),
        "@@ -1 +1 @@",
        "-c",
        "+C",
      ),
    ),
  );
  assert.deepEqual(sorted(result.rejected), [
    { path: "a.txt", hunk: 3, reason: "no match" },
    { path: "b.txt", hunk: 1, reason: "no match" },
    { path: "b.txt", hunk: 2, reason: "no match" },
  ]);
  assert.deepEqual(result.files, before);
  assert.deepEqual(files, before);
});

// Extends "every failing hunk across files is reported ...": a failing first hunk does not stop the file's later hunks being tried.
test("[unhappy-1] after a failing hunk the file's later hunks are still tried, and only the failing ones reported", () => {
  const files = { "f.txt": "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n" };
  const result = rejected(
    applyPatch(
      files,
      diff(
        ...header("f.txt"),
        "@@ -2 +2 @@",
        "-zz",
        "+Z",
        "@@ -6 +6 @@",
        "-6",
        "+six",
        "@@ -10 +10 @@",
        "-yy",
        "+Y",
      ),
    ),
  );
  assert.deepEqual(sorted(result.rejected), [
    { path: "f.txt", hunk: 1, reason: "no match" },
    { path: "f.txt", hunk: 3, reason: "no match" },
  ]);
  assert.deepEqual(result.files, { "f.txt": "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n" });
});

// Extends "every failing hunk across files is reported ...": failures with every reason in one rejection.
test("[unhappy-1] hunks failing for no match, missing and exists are all reported together", () => {
  const files = { "e.txt": "a\n", "made.txt": "m\n", "edit.txt": "x\n" };
  const result = rejected(
    applyPatch(
      files,
      diff(
        "diff --git a/made.txt b/made.txt",
        "new file mode 100644",
        "--- /dev/null",
        "+++ b/made.txt",
        "@@ -0,0 +1 @@",
        "+made",
        ...header("gone.txt"),
        "@@ -1 +1 @@",
        "-g",
        "+G",
        ...header("edit.txt"),
        "@@ -1 +1 @@",
        "-nope",
        "+y",
        ...header("e.txt"),
        "@@ -1 +1 @@",
        "-a",
        "+A",
      ),
    ),
  );
  assert.deepEqual(sorted(result.rejected), [
    { path: "edit.txt", hunk: 1, reason: "no match" },
    { path: "gone.txt", hunk: 1, reason: "missing" },
    { path: "made.txt", hunk: 1, reason: "exists" },
  ]);
  assert.deepEqual(result.files, { "e.txt": "a\n", "made.txt": "m\n", "edit.txt": "x\n" });
});

// Extends "when one hunk fails, a file the patch would create or delete is left as it was": a rename whose hunk fails.
test("[unhappy-1] a renamed file whose hunk fails is reported under its new path and stays at its old one", () => {
  const files = { "old/a.ts": "one\ntwo\n" };
  const result = rejected(
    applyPatch(
      files,
      diff(
        "diff --git a/old/a.ts b/new/a.ts",
        "rename from old/a.ts",
        "rename to new/a.ts",
        "--- a/old/a.ts",
        "+++ b/new/a.ts",
        "@@ -1,2 +1,2 @@",
        " one",
        "-TWO",
        "+2",
      ),
    ),
  );
  assert.deepEqual(result.rejected, [{ path: "new/a.ts", hunk: 1, reason: "no match" }]);
  assert.deepEqual(result.files, { "old/a.ts": "one\ntwo\n" });
});

// Extends "when one hunk fails, a file the patch would create or delete is left as it was": a failing deletion beside an edit that applies.
test("[unhappy-1] a deletion that does not match leaves its file, and the edit beside it is not made", () => {
  const files = { "del.txt": "a\nb\n", "e.txt": "x\n" };
  const result = rejected(
    applyPatch(
      files,
      diff(
        "diff --git a/del.txt b/del.txt",
        "deleted file mode 100644",
        "--- a/del.txt",
        "+++ /dev/null",
        "@@ -1 +0,0 @@",
        "-a",
        ...header("e.txt"),
        "@@ -1 +1 @@",
        "-x",
        "+X",
      ),
    ),
  );
  assert.deepEqual(result.rejected, [{ path: "del.txt", hunk: 1, reason: "no match" }]);
  assert.deepEqual(result.files, { "del.txt": "a\nb\n", "e.txt": "x\n" });
});

// Extends "every failing hunk across files is reported ...": many files apply and only the last fails.
test("[unhappy-1] one failing hunk after a dozen files that apply leaves every file unchanged", () => {
  const files: Record<string, string> = {};
  const lines: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const path = `f${String(i).padStart(2, "0")}.txt`;
    files[path] = "v\n";
    lines.push(...header(path), "@@ -1 +1 @@", "-v", "+w");
  }
  files["last.txt"] = "v\n";
  lines.push(...header("last.txt"), "@@ -1 +1 @@", "-nope", "+w");
  const before = { ...files };
  const result = rejected(applyPatch(files, diff(...lines)));
  assert.deepEqual(result.rejected, [{ path: "last.txt", hunk: 1, reason: "no match" }]);
  assert.deepEqual(result.files, before);
  assert.deepEqual(files, before);
});

// Scenario: A missing file is rejected

// Extends "every hunk for a missing path is rejected, and the files that would change do not": a nested path, three hunks.
test("[unhappy-2] all three hunks for a missing nested path are rejected with reason missing", () => {
  const files = { "src/here.ts": "a\n" };
  const result = rejected(
    applyPatch(
      files,
      diff(
        ...header("src/gone.ts"),
        "@@ -1 +1 @@",
        "-a",
        "+A",
        "@@ -5 +5 @@",
        "-e",
        "+E",
        "@@ -9,2 +9,2 @@",
        " i",
        "-j",
        "+J",
      ),
    ),
  );
  assert.deepEqual(sorted(result.rejected), [
    { path: "src/gone.ts", hunk: 1, reason: "missing" },
    { path: "src/gone.ts", hunk: 2, reason: "missing" },
    { path: "src/gone.ts", hunk: 3, reason: "missing" },
  ]);
  assert.deepEqual(result.files, { "src/here.ts": "a\n" });
});

// Extends "a hunk for a path not in the files is rejected with reason missing": alongside a hunk that does not match.
test("[unhappy-2] a missing path and a non-matching hunk are each reported with their own reason", () => {
  const files = { "x.txt": "x\n" };
  const result = rejected(
    applyPatch(
      files,
      diff(...header("x.txt"), "@@ -1 +1 @@", "-q", "+Q", ...header("y.txt"), "@@ -1 +1 @@", "-y", "+Y"),
    ),
  );
  assert.deepEqual(sorted(result.rejected), [
    { path: "x.txt", hunk: 1, reason: "no match" },
    { path: "y.txt", hunk: 1, reason: "missing" },
  ]);
  assert.deepEqual(result.files, { "x.txt": "x\n" });
});

// Extends "a hunk for a path not in the files is rejected with reason missing": paths that only resemble it are present.
test("[unhappy-2] a path is missing even when similar paths, including its a/-prefixed form, are present", () => {
  const files = { "src/gone.txt": "a\n", "gone.txt.bak": "a\n", "a/gone.txt": "a\n" };
  const result = rejected(applyPatch(files, diff(...header("gone.txt"), "@@ -1 +1 @@", "-a", "+b")));
  assert.deepEqual(result.rejected, [{ path: "gone.txt", hunk: 1, reason: "missing" }]);
  assert.deepEqual(result.files, { "src/gone.txt": "a\n", "gone.txt.bak": "a\n", "a/gone.txt": "a\n" });
});

// Extends "every hunk for a missing path is rejected, and the files that would change do not": more files that would change.
test("[unhappy-2] a missing path among several files that would change leaves them all unchanged", () => {
  const files = { "p.txt": "p\n", "q.txt": "q\n", "r.txt": "r\n" };
  const result = rejected(
    applyPatch(
      files,
      diff(
        ...header("p.txt"),
        "@@ -1 +1 @@",
        "-p",
        "+P",
        ...header("missing/s.txt"),
        "@@ -1 +1 @@",
        "-s",
        "+S",
        ...header("q.txt"),
        "@@ -1 +1 @@",
        "-q",
        "+Q",
        ...header("r.txt"),
        "@@ -1 +1 @@",
        "-r",
        "+R",
      ),
    ),
  );
  assert.deepEqual(result.rejected, [{ path: "missing/s.txt", hunk: 1, reason: "missing" }]);
  assert.deepEqual(result.files, { "p.txt": "p\n", "q.txt": "q\n", "r.txt": "r\n" });
});

// Scenario: A malformed diff is refused outright

// Extends "a short hunk followed by another file's header throws": followed by another hunk of the same file.
test("[unhappy-3] a short hunk followed by another hunk of the same file throws", () => {
  const files = { "f.txt": "a\nb\nc\nd\ne\nf\n" };
  assert.throws(
    () =>
      applyPatch(
        files,
        diff(...header("f.txt"), "@@ -1,3 +1,3 @@", " a", "-b", "+B", "@@ -5,2 +5,2 @@", "-e", "+E", " f"),
      ),
    refused,
  );
});

// Extends "a hunk with fewer lines than its header counts throws": only the new count falls short.
test("[unhappy-3] a hunk with all its old lines but fewer new lines than counted throws", () => {
  const files = { "f.txt": "a\nb\n", "g.txt": "x\n" };
  assert.throws(
    () =>
      applyPatch(
        files,
        diff(...header("f.txt"), "@@ -1,2 +1,3 @@", " a", "-b", "+B", ...header("g.txt"), "@@ -1 +1 @@", "-x", "+X"),
      ),
    refused,
  );
});

// Extends "a hunk with fewer lines than its header counts throws": only the old count falls short, the new count being a missing 1.
test("[unhappy-3] a hunk with its one new line but fewer old lines than counted throws", () => {
  const files = { "f.txt": "a\nb\nc\nd\ne\n" };
  assert.throws(
    () =>
      applyPatch(
        files,
        diff(...header("f.txt"), "@@ -1,3 +1 @@", " a", "-b", "@@ -5 +5 @@", "-e", "+E"),
      ),
    refused,
  );
});

// Extends "a hunk with fewer lines than its header counts throws": the no-newline marker is not a line.
test("[unhappy-3] a hunk made up to its count only by a no-newline marker throws", () => {
  const files = { "f.txt": "a\nb", "g.txt": "x\n" };
  assert.throws(
    () =>
      applyPatch(
        files,
        diff(...header("f.txt"), "@@ -1,2 +1,2 @@", " a", "-b", NO_NEWLINE, ...header("g.txt"), "@@ -1 +1 @@", "-x", "+X"),
      ),
    refused,
  );
});

// Extends "a hunk with fewer lines than its header counts throws": a short hunk for a path that is missing.
test("[unhappy-3] a short hunk for a missing path throws rather than being rejected as missing", () => {
  const files = { "here.txt": "a\n" };
  assert.throws(
    () =>
      applyPatch(
        files,
        diff(...header("gone.txt"), "@@ -1,3 +1,3 @@", " a", "-b", "+B", ...header("here.txt"), "@@ -1 +1 @@", "-a", "+A"),
      ),
    refused,
  );
});

// Extends "a short hunk followed by another file's header throws": an earlier file's hunk does not match.
test("[unhappy-3] a short hunk throws even when another hunk in the diff does not match", () => {
  const files = { "f.txt": "a\n", "g.txt": "a\nb\nc\n" };
  assert.throws(
    () =>
      applyPatch(
        files,
        diff(...header("f.txt"), "@@ -1 +1 @@", "-nope", "+A", ...header("g.txt"), "@@ -1,3 +1,3 @@", " a", "-b", "+B"),
      ),
    refused,
  );
});

// Extends "a short hunk followed by another file's header throws": a new file's hunk is short.
test("[unhappy-3] a new file's hunk with fewer added lines than counted throws", () => {
  const files = { "g.txt": "x\n" };
  assert.throws(
    () =>
      applyPatch(
        files,
        diff(
          "diff --git a/n.txt b/n.txt",
          "new file mode 100644",
          "--- /dev/null",
          "+++ b/n.txt",
          "@@ -0,0 +1,3 @@",
          "+one",
          "+two",
          ...header("g.txt"),
          "@@ -1 +1 @@",
          "-x",
          "+X",
        ),
      ),
    refused,
  );
});

// Extends "a hunk before any file header throws": well-formed file sections follow it.
test("[unhappy-3] a hunk before any file header throws even when valid file sections follow", () => {
  const files = { "f.txt": "a\n", "g.txt": "x\n" };
  assert.throws(
    () =>
      applyPatch(
        files,
        diff(
          "@@ -1 +1 @@",
          "-a",
          "+A",
          ...header("f.txt"),
          "@@ -1 +1 @@",
          "-a",
          "+A",
          ...header("g.txt"),
          "@@ -1 +1 @@",
          "-x",
          "+X",
        ),
      ),
    refused,
  );
});
