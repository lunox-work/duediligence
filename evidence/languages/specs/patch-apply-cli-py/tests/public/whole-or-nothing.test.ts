import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPatch } from "./boundary.js";
import type { ApplyResult, Rejected, RejectedHunk } from "./boundary.js";

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

// Scenario: Every failing hunk is reported and nothing changes

test("every failing hunk across files is reported and no file changes", () => {
  const files = {
    "one.txt": "a\nb\nc\nd\ne\nf\ng\n",
    "two.txt": "p\nq\nr\ns\nt\nu\nv\n",
  };
  const before = { ...files };
  const result = rejected(
    applyPatch(
      files,
      diff(
        ...header("one.txt"),
        "@@ -1,3 +1,3 @@",
        " a",
        "-b",
        "+B",
        " c",
        "@@ -5,3 +5,3 @@",
        " e",
        "-zzz",
        "+F",
        " g",
        ...header("two.txt"),
        "@@ -1,3 +1,3 @@",
        " p",
        "-yyy",
        "+Q",
        " r",
        "@@ -5,3 +5,3 @@",
        " t",
        "-u",
        "+U",
        " v",
      ),
    ),
  );
  assert.deepEqual(sorted(result.rejected), [
    { path: "one.txt", hunk: 2, reason: "no match" },
    { path: "two.txt", hunk: 1, reason: "no match" },
  ]);
  assert.deepEqual(result.files, before);
  assert.deepEqual(files, before);
});

test("when one hunk fails, a file the patch would create or delete is left as it was", () => {
  const files = { "edit.txt": "a\nb\n", "doomed.txt": "x\n" };
  const result = rejected(
    applyPatch(
      files,
      diff(
        "diff --git a/fresh.txt b/fresh.txt",
        "new file mode 100644",
        "--- /dev/null",
        "+++ b/fresh.txt",
        "@@ -0,0 +1 @@",
        "+fresh",
        "diff --git a/doomed.txt b/doomed.txt",
        "deleted file mode 100644",
        "--- a/doomed.txt",
        "+++ /dev/null",
        "@@ -1 +0,0 @@",
        "-x",
        ...header("edit.txt"),
        "@@ -1,2 +1,2 @@",
        " a",
        "-nope",
        "+B",
      ),
    ),
  );
  assert.deepEqual(result.rejected, [{ path: "edit.txt", hunk: 1, reason: "no match" }]);
  assert.deepEqual(result.files, { "edit.txt": "a\nb\n", "doomed.txt": "x\n" });
});

// Scenario: A missing file is rejected

test("a hunk for a path not in the files is rejected with reason missing", () => {
  const files = { "here.txt": "a\n" };
  const result = rejected(applyPatch(files, diff(...header("gone.txt"), "@@ -1 +1 @@", "-a", "+b")));
  assert.deepEqual(result.rejected, [{ path: "gone.txt", hunk: 1, reason: "missing" }]);
  assert.deepEqual(result.files, { "here.txt": "a\n" });
});

test("every hunk for a missing path is rejected, and the files that would change do not", () => {
  const files = { "here.txt": "a\n" };
  const result = rejected(
    applyPatch(
      files,
      diff(
        ...header("here.txt"),
        "@@ -1 +1 @@",
        "-a",
        "+A",
        ...header("gone.txt"),
        "@@ -1,2 +1,2 @@",
        " a",
        "-b",
        "+B",
        "@@ -9,2 +9,2 @@",
        " i",
        "-j",
        "+J",
      ),
    ),
  );
  assert.deepEqual(sorted(result.rejected), [
    { path: "gone.txt", hunk: 1, reason: "missing" },
    { path: "gone.txt", hunk: 2, reason: "missing" },
  ]);
  assert.deepEqual(result.files, { "here.txt": "a\n" });
});

// Scenario: A malformed diff is refused outright

/** Any error but the stub's, so these fail until the parser is written. */
function refused(error: unknown): boolean {
  return error instanceof Error && error.message !== "not implemented";
}

test("a hunk with fewer lines than its header counts throws", () => {
  const files = { "f.txt": "a\nb\nc\n" };
  assert.throws(() =>
    applyPatch(files, diff(...header("f.txt"), "@@ -1,3 +1,3 @@", " a", "-b", "+B")),
    refused,
  );
});

test("a short hunk followed by another file's header throws", () => {
  const files = { "f.txt": "a\nb\nc\n", "g.txt": "x\n" };
  assert.throws(() =>
    applyPatch(
      files,
      diff(
        ...header("f.txt"),
        "@@ -1,3 +1,3 @@",
        " a",
        "-b",
        "+B",
        ...header("g.txt"),
        "@@ -1 +1 @@",
        "-x",
        "+X",
      ),
    ),
    refused,
  );
});

test("a hunk before any file header throws", () => {
  const files = { "f.txt": "a\n" };
  assert.throws(() => applyPatch(files, diff("@@ -1 +1 @@", "-a", "+A")), refused);
});
