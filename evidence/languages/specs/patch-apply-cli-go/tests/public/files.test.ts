import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPatch } from "./boundary.js";
import type { Applied, ApplyResult, Rejected } from "./boundary.js";

/** Join diff lines, each ending with "\n". */
function diff(...lines: string[]): string {
  return lines.map((line) => line + "\n").join("");
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

const createNew = diff(
  "diff --git a/new.txt b/new.txt",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/new.txt",
  "@@ -0,0 +1,2 @@",
  "+one",
  "+two",
);

const deleteOld = diff(
  "diff --git a/old.txt b/old.txt",
  "deleted file mode 100644",
  "--- a/old.txt",
  "+++ /dev/null",
  "@@ -1,2 +0,0 @@",
  "-one",
  "-two",
);

// Scenario: A new file is created

test("a diff from /dev/null creates the file with the hunk's added lines", () => {
  const files = { "a.txt": "x\n" };
  const result = applied(applyPatch(files, createNew));
  assert.deepEqual(result.files, { "a.txt": "x\n", "new.txt": "one\ntwo\n" });
  assert.ok(result.hunks.some((h) => h.path === "new.txt" && h.hunk === 1));
});

test("creating a file where one already exists is rejected with reason exists", () => {
  const files = { "a.txt": "x\n", "new.txt": "already\n" };
  const result = rejected(applyPatch(files, createNew));
  assert.deepEqual(result.rejected, [{ path: "new.txt", hunk: 1, reason: "exists" }]);
  assert.deepEqual(result.files, { "a.txt": "x\n", "new.txt": "already\n" });
});

// Scenario: A file is deleted

test("a diff to /dev/null removing the file's whole text removes the file", () => {
  const files = { "old.txt": "one\ntwo\n", "keep.txt": "k\n" };
  const result = applied(applyPatch(files, deleteOld));
  assert.deepEqual(result.files, { "keep.txt": "k\n" });
  assert.equal("old.txt" in result.files, false);
  assert.ok(result.hunks.some((h) => h.path === "old.txt" && h.hunk === 1));
});

test("deleting a file whose text is more than the hunk's removed lines is rejected with reason no match", () => {
  const files = { "old.txt": "one\ntwo\nthree\n", "keep.txt": "k\n" };
  const result = rejected(applyPatch(files, deleteOld));
  assert.deepEqual(result.rejected, [{ path: "old.txt", hunk: 1, reason: "no match" }]);
  assert.deepEqual(result.files, { "old.txt": "one\ntwo\nthree\n", "keep.txt": "k\n" });
});

// Scenario: A file is renamed

test("a rename with a hunk moves the file and applies the hunk to its text", () => {
  const files = { "old/a.ts": "one\ntwo\nthree\n", "keep.ts": "k\n" };
  const result = applied(
    applyPatch(
      files,
      diff(
        "diff --git a/old/a.ts b/new/a.ts",
        "rename from old/a.ts",
        "rename to new/a.ts",
        "--- a/old/a.ts",
        "+++ b/new/a.ts",
        "@@ -1,3 +1,3 @@",
        " one",
        "-two",
        "+TWO",
        " three",
      ),
    ),
  );
  assert.deepEqual(result.files, { "new/a.ts": "one\nTWO\nthree\n", "keep.ts": "k\n" });
  assert.equal("old/a.ts" in result.files, false);
  assert.deepEqual(result.hunks, [{ path: "new/a.ts", hunk: 1, offset: 0 }]);
});

test("a rename with no hunks moves the text unchanged", () => {
  const files = { "old/a.ts": "one\r\ntwo", "keep.ts": "k\n" };
  const result = applied(
    applyPatch(
      files,
      diff(
        "diff --git a/old/a.ts b/new/a.ts",
        "rename from old/a.ts",
        "rename to new/a.ts",
        "--- a/old/a.ts",
        "+++ b/new/a.ts",
      ),
    ),
  );
  assert.deepEqual(result.files, { "new/a.ts": "one\r\ntwo", "keep.ts": "k\n" });
  assert.equal("old/a.ts" in result.files, false);
});
