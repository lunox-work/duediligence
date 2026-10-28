import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPatch } from "./boundary.js";
import type { Applied, AppliedHunk, ApplyResult, Rejected } from "./boundary.js";

/** Join diff lines, each ending with "\n". */
function diff(...lines: string[]): string {
  return lines.map((line) => line + "\n").join("");
}

/** The headers of a diff that changes `path` in place. */
function header(path: string): string[] {
  return [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`];
}

/** The headers of a diff that creates `path`. */
function creating(path: string): string[] {
  return [`diff --git a/${path} b/${path}`, "new file mode 100644", "--- /dev/null", `+++ b/${path}`];
}

/** The headers of a diff that deletes `path`. */
function deleting(path: string): string[] {
  return [`diff --git a/${path} b/${path}`, "deleted file mode 100644", `--- a/${path}`, "+++ /dev/null"];
}

/** The headers of a diff that renames `from` to `to`. */
function renaming(from: string, to: string): string[] {
  return [`diff --git a/${from} b/${to}`, `rename from ${from}`, `rename to ${to}`, `--- a/${from}`, `+++ b/${to}`];
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

/** Applied hunks in a fixed order, since the spec does not order them. */
function sortedHunks(list: AppliedHunk[]): AppliedHunk[] {
  return [...list].sort((x, y) =>
    x.path < y.path ? -1 : x.path > y.path ? 1 : x.hunk - y.hunk,
  );
}

const NO_NEWLINE = "\\ No newline at end of file";

// Scenario: A new file is created

// Extends "a diff from /dev/null creates the file with the hunk's added lines": a nested path, more lines, an empty one among them.
test("[happy-3] a new file at a nested path is created with all its added lines", () => {
  const files = { "a.txt": "x\n" };
  const result = applied(
    applyPatch(files, diff(...creating("dir/sub/new.ts"), "@@ -0,0 +1,4 @@", "+l1", "+l2", "+", "+l4")),
  );
  assert.deepEqual(result.files, { "a.txt": "x\n", "dir/sub/new.ts": "l1\nl2\n\nl4\n" });
  assert.ok(result.hunks.some((h) => h.path === "dir/sub/new.ts" && h.hunk === 1));
  assert.deepEqual(files, { "a.txt": "x\n" });
});

// Extends "a diff from /dev/null creates the file ...": created alongside an edit to another file.
test("[happy-3] a new file is created in the same patch that edits another file", () => {
  const files = { "e.txt": "a\nb\n" };
  const result = applied(
    applyPatch(
      files,
      diff(...creating("c.txt"), "@@ -0,0 +1 @@", "+c", ...header("e.txt"), "@@ -1,2 +1,2 @@", "-a", "+A", " b"),
    ),
  );
  assert.deepEqual(result.files, { "c.txt": "c\n", "e.txt": "A\nb\n" });
});

// Extends "creating a file where one already exists is rejected with reason exists": the other hunks would apply.
test("[happy-3] creating an existing file is rejected though the patch's other hunks match", () => {
  const files = { "e.txt": "a\nb\n", "c.txt": "old\n" };
  const result = rejected(
    applyPatch(
      files,
      diff(...header("e.txt"), "@@ -1,2 +1,2 @@", "-a", "+A", " b", ...creating("c.txt"), "@@ -0,0 +1 @@", "+c"),
    ),
  );
  assert.deepEqual(result.rejected, [{ path: "c.txt", hunk: 1, reason: "exists" }]);
  assert.deepEqual(result.files, { "e.txt": "a\nb\n", "c.txt": "old\n" });
});

// Extends "creating a file where one already exists ...": the existing file already holds the new text.
test("[happy-3] creating a file is rejected with reason exists even when its text would be the same", () => {
  const files = { "c.txt": "c\n" };
  const result = rejected(applyPatch(files, diff(...creating("c.txt"), "@@ -0,0 +1 @@", "+c")));
  assert.deepEqual(result.rejected, [{ path: "c.txt", hunk: 1, reason: "exists" }]);
  assert.deepEqual(result.files, { "c.txt": "c\n" });
});

// Extends "creating a file where one already exists ...": the existing file is empty.
test("[happy-3] creating a file where an empty file already is is rejected with reason exists", () => {
  const files = { "c.txt": "" };
  const result = rejected(applyPatch(files, diff(...creating("c.txt"), "@@ -0,0 +1,2 @@", "+c", "+d")));
  assert.deepEqual(result.rejected, [{ path: "c.txt", hunk: 1, reason: "exists" }]);
  assert.deepEqual(result.files, { "c.txt": "" });
});

// Scenario: A file is deleted

// Extends "a diff to /dev/null removing the file's whole text removes the file": a nested path, three lines; the hunk's path is the "---" path.
test("[happy-4] a file at a nested path is deleted and its hunk is reported under that path", () => {
  const files = { "dir/old.txt": "x\ny\nz\n", "k.txt": "k\n" };
  const result = applied(
    applyPatch(files, diff(...deleting("dir/old.txt"), "@@ -1,3 +0,0 @@", "-x", "-y", "-z")),
  );
  assert.deepEqual(result.files, { "k.txt": "k\n" });
  assert.ok(result.hunks.some((h) => h.path === "dir/old.txt" && h.hunk === 1));
});

// Extends "a diff to /dev/null removing the file's whole text ...": a file whose lines end with "\r\n".
test("[happy-4] a file whose lines end with \\r\\n is deleted by a \\n diff", () => {
  const files = { "old.txt": "x\r\ny\r\n" };
  const result = applied(applyPatch(files, diff(...deleting("old.txt"), "@@ -1,2 +0,0 @@", "-x", "-y")));
  assert.deepEqual(result.files, {});
});

// Extends "a diff to /dev/null removing the file's whole text ...": a file without a final newline.
test("[happy-4] a file without a final newline is deleted by a hunk marking its last line", () => {
  const files = { "old.txt": "x\ny", "k.txt": "k\n" };
  const result = applied(
    applyPatch(files, diff(...deleting("old.txt"), "@@ -1,2 +0,0 @@", "-x", "-y", NO_NEWLINE)),
  );
  assert.deepEqual(result.files, { "k.txt": "k\n" });
});

// Extends "deleting a file whose text is more than the hunk's removed lines ...": the extra line comes first.
test("[happy-4] deleting a file whose removed lines are only its last lines is rejected with reason no match", () => {
  const files = { "old.txt": "w\nx\ny\n" };
  const result = rejected(applyPatch(files, diff(...deleting("old.txt"), "@@ -1,2 +0,0 @@", "-x", "-y")));
  assert.deepEqual(result.rejected, [{ path: "old.txt", hunk: 1, reason: "no match" }]);
  assert.deepEqual(result.files, { "old.txt": "w\nx\ny\n" });
});

// Extends "deleting a file whose text is more than the hunk's removed lines ...": as many lines, one different.
test("[happy-4] deleting a file whose lines differ from the removed lines is rejected with reason no match", () => {
  const files = { "old.txt": "x\nY\n" };
  const result = rejected(applyPatch(files, diff(...deleting("old.txt"), "@@ -1,2 +0,0 @@", "-x", "-y")));
  assert.deepEqual(result.rejected, [{ path: "old.txt", hunk: 1, reason: "no match" }]);
  assert.deepEqual(result.files, { "old.txt": "x\nY\n" });
});

// Extends "deleting a file whose text is more than the hunk's removed lines ...": the text is less.
test("[happy-4] deleting a file shorter than the hunk's removed lines is rejected with reason no match", () => {
  const files = { "old.txt": "x\n" };
  const result = rejected(applyPatch(files, diff(...deleting("old.txt"), "@@ -1,2 +0,0 @@", "-x", "-y")));
  assert.deepEqual(result.rejected, [{ path: "old.txt", hunk: 1, reason: "no match" }]);
  assert.deepEqual(result.files, { "old.txt": "x\n" });
});

// Extends "a diff to /dev/null removing the file's whole text ...": deleted alongside an edit.
test("[happy-4] a file is deleted in the same patch that edits another file", () => {
  const files = { "old.txt": "one\n", "e.txt": "one\n" };
  const result = applied(
    applyPatch(
      files,
      diff(...deleting("old.txt"), "@@ -1 +0,0 @@", "-one", ...header("e.txt"), "@@ -1 +1 @@", "-one", "+ONE"),
    ),
  );
  assert.deepEqual(result.files, { "e.txt": "ONE\n" });
});

// Scenario: A file is renamed

// Extends "a rename with a hunk moves the file and applies the hunk to its text": deeper paths and a hunk that adds a line.
test("[happy-5] a rename with a hunk that grows the file moves it and applies the hunk", () => {
  const files = { "src/old/mod.ts": "import a\nimport b\n\nexport x\n", "other.ts": "o\n" };
  const result = applied(
    applyPatch(
      files,
      diff(
        ...renaming("src/old/mod.ts", "lib/new/mod.ts"),
        "@@ -1,4 +1,5 @@",
        " import a",
        "-import b",
        "+import B",
        "+import C",
        " ",
        " export x",
      ),
    ),
  );
  assert.deepEqual(result.files, {
    "lib/new/mod.ts": "import a\nimport B\nimport C\n\nexport x\n",
    "other.ts": "o\n",
  });
  assert.deepEqual(result.hunks, [{ path: "lib/new/mod.ts", hunk: 1, offset: 0 }]);
});

// Extends "a rename with a hunk moves the file ...": two hunks.
test("[happy-5] a rename with two hunks applies both and reports them under the new path", () => {
  const files = { "r/a.txt": "1\n2\n3\n4\n5\n6\n7\n8\n" };
  const result = applied(
    applyPatch(
      files,
      diff(
        ...renaming("r/a.txt", "s/a.txt"),
        "@@ -1,2 +1,2 @@",
        "-1",
        "+one",
        " 2",
        "@@ -7,2 +7,2 @@",
        " 7",
        "-8",
        "+eight",
      ),
    ),
  );
  assert.deepEqual(result.files, { "s/a.txt": "one\n2\n3\n4\n5\n6\n7\neight\n" });
  assert.deepEqual(sortedHunks(result.hunks), [
    { path: "s/a.txt", hunk: 1, offset: 0 },
    { path: "s/a.txt", hunk: 2, offset: 0 },
  ]);
});

// Extends "a rename with a hunk moves the file ...": the hunk's lines have moved.
test("[happy-5] a rename's hunk applies at an offset as it would without the rename", () => {
  const files = { "old/a.ts": "pre\npre2\na\nb\nc\n" };
  const result = applied(
    applyPatch(files, diff(...renaming("old/a.ts", "new/a.ts"), "@@ -1,3 +1,3 @@", " a", "-b", "+B", " c")),
  );
  assert.deepEqual(result.files, { "new/a.ts": "pre\npre2\na\nB\nc\n" });
  assert.deepEqual(result.hunks, [{ path: "new/a.ts", hunk: 1, offset: 2 }]);
});

// Extends "a rename with no hunks moves the text unchanged": followed by another file's diff.
test("[happy-5] a rename with no hunks followed by another file's hunk applies both", () => {
  const files = { "x/1.txt": "one", "e.txt": "a\n" };
  const result = applied(
    applyPatch(files, diff(...renaming("x/1.txt", "y/1.txt"), ...header("e.txt"), "@@ -1 +1 @@", "-a", "+A")),
  );
  assert.deepEqual(result.files, { "y/1.txt": "one", "e.txt": "A\n" });
});

// Extends "a rename with no hunks moves the text unchanged": two renames in one diff.
test("[happy-5] two renames with no hunks each move their text unchanged", () => {
  const files = { "x/1.txt": "1\n", "x/2.txt": "2\r\n2\r\n", "k.txt": "k" };
  const result = applied(
    applyPatch(files, diff(...renaming("x/1.txt", "y/1.txt"), ...renaming("x/2.txt", "y/2.txt"))),
  );
  assert.deepEqual(result.files, { "y/1.txt": "1\n", "y/2.txt": "2\r\n2\r\n", "k.txt": "k" });
});

// Extends "a rename with no hunks moves the text unchanged": an empty text.
test("[happy-5] a rename with no hunks moves an empty file", () => {
  const files = { "old/e.txt": "" };
  const result = applied(applyPatch(files, diff(...renaming("old/e.txt", "new/e.txt"))));
  assert.deepEqual(result.files, { "new/e.txt": "" });
});
