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

// Extends "a \n diff applies to a \r\n file and every added line ends with \r\n": lines added after the last line.
test("[boundary-2] lines appended after the last line of a \\r\\n file end with \\r\\n", () => {
  const files = { "f.txt": "a\r\nb\r\nc\r\n" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -2,2 +2,4 @@", " b", " c", "+d", "+e")),
  );
  assert.deepEqual(result.files, { "f.txt": "a\r\nb\r\nc\r\nd\r\ne\r\n" });
});

// Extends "a \n diff applies to a \r\n file ...": two hunks that only remove lines.
test("[boundary-2] two hunks removing lines from a \\r\\n file match and keep the other lines' endings", () => {
  const files = { "f.txt": "a\r\nb\r\nc\r\nd\r\ne\r\nf\r\n" };
  const result = applied(
    applyPatch(
      files,
      diff(...header("f.txt"), "@@ -1,3 +1,2 @@", " a", "-b", " c", "@@ -5,2 +4 @@", "-e", " f"),
    ),
  );
  assert.deepEqual(result.files, { "f.txt": "a\r\nc\r\nd\r\nf\r\n" });
});

// Extends "a \n diff applies to a \r\n file ...": the hunk's lines have moved.
test("[boundary-2] a moved hunk matches \\r\\n lines and reports its offset", () => {
  const files = { "f.txt": "z\r\nz2\r\na\r\nb\r\n" };
  const result = applied(applyPatch(files, diff(...header("f.txt"), "@@ -1,2 +1,2 @@", " a", "-b", "+B")));
  assert.deepEqual(result.files, { "f.txt": "z\r\nz2\r\na\r\nB\r\n" });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: 2 }]);
});

// Extends "added lines take the ending of the file's first line, not of the lines around them": the context lines inside the hunk keep theirs.
test("[boundary-2] context lines inside a hunk keep their own endings while added lines take the first line's", () => {
  const files = { "f.txt": "a\r\nb\nc\nd\n" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -2,3 +2,3 @@", " b", "-c", "+C", " d")),
  );
  assert.deepEqual(result.files, { "f.txt": "a\r\nb\nC\r\nd\n" });
});

// Extends "added lines take the ending of the file's first line ...": the first line itself is replaced.
test("[boundary-2] replacing a \\r\\n file's first line gives the added lines \\r\\n", () => {
  const files = { "f.txt": "a\r\nb\n" };
  const result = applied(applyPatch(files, diff(...header("f.txt"), "@@ -1 +1,2 @@", "-a", "+A", "+A2")));
  assert.deepEqual(result.files, { "f.txt": "A\r\nA2\r\nb\n" });
});

// Extends "a \n diff applies to a \r\n file ...": the \r\n file has no final newline, and the new one ends with one.
test("[boundary-2] lines added at the end of a \\r\\n file without a final newline all end with \\r\\n", () => {
  const files = { "f.txt": "a\r\nb" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -1,2 +1,3 @@", " a", "-b", NO_NEWLINE, "+B", "+C")),
  );
  assert.deepEqual(result.files, { "f.txt": "a\r\nB\r\nC\r\n" });
});

// Extends "a \n diff applies to a \r\n file ...": two files with different endings in one diff.
test("[boundary-2] each file's added lines take that file's own ending", () => {
  const files = { "w.txt": "a\r\nb\r\n", "u.txt": "a\nb\n" };
  const result = applied(
    applyPatch(
      files,
      diff(
        ...header("w.txt"),
        "@@ -2 +2,2 @@",
        "-b",
        "+B",
        "+C",
        ...header("u.txt"),
        "@@ -2 +2,2 @@",
        "-b",
        "+B",
        "+C",
      ),
    ),
  );
  assert.deepEqual(result.files, { "w.txt": "a\r\nB\r\nC\r\n", "u.txt": "a\nB\nC\n" });
});

// Scenario: A missing final newline is honoured

// Extends "a marker after a removed line that is not the file's last line does not match": it is the last line, but has a newline.
test("[boundary-3] a marker after a removed line does not match a last line that has a newline", () => {
  const files = { "f.txt": "a\nb\n" };
  const result = rejected(
    applyPatch(files, diff(...header("f.txt"), "@@ -1,2 +1,2 @@", " a", "-b", NO_NEWLINE, "+B")),
  );
  assert.deepEqual(result.rejected, [{ path: "f.txt", hunk: 1, reason: "no match" }]);
  assert.deepEqual(result.files, { "f.txt": "a\nb\n" });
});

// Extends "a marker after a final context line keeps that last line without a newline": the file's last line has a newline.
test("[boundary-3] a marker after a context line does not match a last line that has a newline", () => {
  const files = { "f.txt": "a\nb\n" };
  const result = rejected(
    applyPatch(files, diff(...header("f.txt"), "@@ -1,2 +1,2 @@", "-a", "+A", " b", NO_NEWLINE)),
  );
  assert.deepEqual(result.rejected, [{ path: "f.txt", hunk: 1, reason: "no match" }]);
  assert.deepEqual(result.files, { "f.txt": "a\nb\n" });
});

// Extends "a marker after an added line leaves the new last line without a newline": markers after both a removed and an added line.
test("[boundary-3] markers after both the removed and the added last line keep the file without a final newline", () => {
  const files = { "f.txt": "a\nb" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -1,2 +1,2 @@", " a", "-b", NO_NEWLINE, "+B", NO_NEWLINE)),
  );
  assert.deepEqual(result.files, { "f.txt": "a\nB" });
});

// Extends "a marker after a removed line matches a file without a final newline ...": only the final newline is added.
test("[boundary-3] a hunk that re-adds the same last line gives the file a final newline", () => {
  const files = { "f.txt": "a\nb" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -1,2 +1,2 @@", " a", "-b", NO_NEWLINE, "+b")),
  );
  assert.deepEqual(result.files, { "f.txt": "a\nb\n" });
});

// Extends "a marker after an added line leaves the new last line without a newline": only the final newline is removed.
test("[boundary-3] a hunk that re-adds the same last line with a marker removes the final newline", () => {
  const files = { "f.txt": "a\nb\n" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -1,2 +1,2 @@", " a", "-b", "+b", NO_NEWLINE)),
  );
  assert.deepEqual(result.files, { "f.txt": "a\nb" });
});

// Extends "a marker after a final context line keeps that last line without a newline": the hunk's lines have moved.
test("[boundary-3] a moved hunk with a marker after its last context line applies at the end of the file", () => {
  const files = { "f.txt": "x\ny\na\nb" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -1,2 +1,2 @@", "-a", "+A", " b", NO_NEWLINE)),
  );
  assert.deepEqual(result.files, { "f.txt": "x\ny\nA\nb" });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: 2 }]);
});

// Extends "a marker after a removed line that is not the file's last line does not match": the same text is also the last line.
test("[boundary-3] a marked removed line passes over a copy with a newline and matches the last line", () => {
  const files = { "f.txt": "b\nq\nb" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -1 +1 @@", "-b", NO_NEWLINE, "+B")),
  );
  assert.deepEqual(result.files, { "f.txt": "b\nq\nB\n" });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: 2 }]);
});

// Extends "a marker after an added line leaves the new last line without a newline": a new file.
test("[boundary-3] a new file whose last added line is marked has no final newline", () => {
  const files = { "k.txt": "k\n" };
  const result = applied(
    applyPatch(
      files,
      diff(
        "diff --git a/n.txt b/n.txt",
        "new file mode 100644",
        "--- /dev/null",
        "+++ b/n.txt",
        "@@ -0,0 +1,2 @@",
        "+one",
        "+two",
        NO_NEWLINE,
      ),
    ),
  );
  assert.deepEqual(result.files, { "k.txt": "k\n", "n.txt": "one\ntwo" });
});

// Extends "a marker after a removed line matches a file without a final newline, and the new file ends with one": more added lines.
test("[boundary-3] with no marker after the last added line, a file that had no final newline ends with one", () => {
  const files = { "f.txt": "a\nb" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -1,2 +1,3 @@", " a", "-b", NO_NEWLINE, "+b", "+c")),
  );
  assert.deepEqual(result.files, { "f.txt": "a\nb\nc\n" });
});

// Extends "a marker after an added line leaves the new last line without a newline": a \r\n file.
test("[boundary-3] a marker after an added line in a \\r\\n file leaves the new last line without an ending", () => {
  const files = { "f.txt": "a\r\nb\r\n" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -1,2 +1,2 @@", " a", "-b", "+B", NO_NEWLINE)),
  );
  assert.deepEqual(result.files, { "f.txt": "a\r\nB" });
});
