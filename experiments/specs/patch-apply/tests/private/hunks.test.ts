import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPatch } from "../../src/index.js";
import type { Applied, AppliedHunk, ApplyResult, Rejected } from "../../src/index.js";

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

/** Applied hunks in a fixed order, since the spec does not order them. */
function sortedHunks(list: AppliedHunk[]): AppliedHunk[] {
  return [...list].sort((x, y) =>
    x.path < y.path ? -1 : x.path > y.path ? 1 : x.hunk - y.hunk,
  );
}

/** Lines joined into a text, each ending with "\n". */
function text(lines: string[]): string {
  return lines.map((line) => line + "\n").join("");
}

// Scenario: A hunk applies at its stated line

// Extends "a hunk matching at its old start line replaces its removed lines with its added lines, offset 0": a long file, a hunk deep inside it.
test("[happy-1] a hunk deep in a long file applies at its stated line with offset 0", () => {
  const lines = Array.from({ length: 120 }, (_, i) => `line ${i + 1}`);
  const files = { "big.txt": text(lines) };
  const before = { ...files };
  const result = applied(
    applyPatch(
      files,
      diff(
        ...header("big.txt"),
        "@@ -80,4 +80,5 @@",
        " line 80",
        "-line 81",
        "-line 82",
        "+L81",
        "+L82a",
        "+L82b",
        " line 83",
      ),
    ),
  );
  const expected = [...lines.slice(0, 80), "L81", "L82a", "L82b", ...lines.slice(82)];
  assert.deepEqual(result.files, { "big.txt": text(expected) });
  assert.deepEqual(result.hunks, [{ path: "big.txt", hunk: 1, offset: 0 }]);
  assert.deepEqual(files, before);
});

// Extends "a hunk matching at its old start line ...": only the leading "a/" and "b/" are prefixes.
test("[happy-1] only the leading a/ and b/ prefixes are stripped from a path", () => {
  const files = { "a/b.txt": "one\ntwo\n", "b.txt": "one\ntwo\n" };
  const result = applied(
    applyPatch(files, diff(...header("a/b.txt"), "@@ -2 +2 @@", "-two", "+TWO")),
  );
  assert.deepEqual(result.files, { "a/b.txt": "one\nTWO\n", "b.txt": "one\ntwo\n" });
  assert.deepEqual(result.hunks, [{ path: "a/b.txt", hunk: 1, offset: 0 }]);
});

// Extends "a hunk matching at its old start line ...": hunk lines whose text looks like diff headers.
test("[happy-1] hunk lines whose text starts with ---, +++ or @@ are part of the hunk", () => {
  const files = { "f.txt": "x\n-- old\n@@ y\nz\n" };
  const result = applied(
    applyPatch(
      files,
      diff(...header("f.txt"), "@@ -1,4 +1,4 @@", " x", "--- old", "+++ new", " @@ y", " z"),
    ),
  );
  assert.deepEqual(result.files, { "f.txt": "x\n++ new\n@@ y\nz\n" });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: 0 }]);
});

// Extends "a hunk matching at its old start line ...": removed and added lines interleaved with context.
test("[happy-1] interleaved removed, added and context lines replace the old lines in order", () => {
  const files = { "f.txt": "a\nb\nc\nd\ne\nf\n" };
  const result = applied(
    applyPatch(
      files,
      diff(...header("f.txt"), "@@ -1,6 +1,6 @@", " a", "-b", "-c", "+X", " d", "-e", "+Y", "+Z", " f"),
    ),
  );
  assert.deepEqual(result.files, { "f.txt": "a\nX\nd\nY\nZ\nf\n" });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: 0 }]);
});

// Extends "a hunk matching at its old start line ...": an empty context line.
test("[happy-1] an empty context line matches an empty line in the file", () => {
  const files = { "f.txt": "a\n\nb\n" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -1,3 +1,3 @@", " a", " ", "-b", "+B")),
  );
  assert.deepEqual(result.files, { "f.txt": "a\n\nB\n" });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: 0 }]);
});

// Extends "a hunk header with missing counts means a count of 1": a missing new count only.
test("[happy-1] a hunk header with only the new count missing removes the last line", () => {
  const files = { "f.txt": "a\nb\nc\n" };
  const result = applied(applyPatch(files, diff(...header("f.txt"), "@@ -2,2 +2 @@", " b", "-c")));
  assert.deepEqual(result.files, { "f.txt": "a\nb\n" });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: 0 }]);
});

// Extends "a hunk header with missing counts means a count of 1": a missing old count only.
test("[happy-1] a hunk header with only the old count missing replaces one line with two", () => {
  const files = { "f.txt": "a\nb\nc\nd\n" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -3 +3,2 @@", "-c", "+C", "+D")),
  );
  assert.deepEqual(result.files, { "f.txt": "a\nb\nC\nD\nd\n" });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: 0 }]);
});

// Extends "a hunk matching at its old start line ...": git's section heading after the header.
test("[happy-1] a hunk header followed by git's section heading applies at its stated line", () => {
  const files = { "f.txt": "h\na\nb\nc\nt\n" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -2,3 +2,3 @@ h", " a", "-b", "+B", " c")),
  );
  assert.deepEqual(result.files, { "f.txt": "h\na\nB\nc\nt\n" });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: 0 }]);
});

// Extends "a hunk matching at its old start line ...": more files, each with a hunk, and one untouched.
test("[happy-1] hunks for two files each apply at their stated lines", () => {
  const files = { "p.txt": "1\n2\n3\n", "q.txt": "x\ny\n", "r.txt": "r\n" };
  const result = applied(
    applyPatch(
      files,
      diff(
        ...header("p.txt"),
        "@@ -2 +2 @@",
        "-2",
        "+two",
        ...header("q.txt"),
        "@@ -1,2 +1,2 @@",
        "-x",
        "+X",
        " y",
      ),
    ),
  );
  assert.deepEqual(result.files, { "p.txt": "1\ntwo\n3\n", "q.txt": "X\ny\n", "r.txt": "r\n" });
  assert.deepEqual(sortedHunks(result.hunks), [
    { path: "p.txt", hunk: 1, offset: 0 },
    { path: "q.txt", hunk: 1, offset: 0 },
  ]);
});

// Extends "a hunk that matches at its stated line and also elsewhere applies at its stated line": a multi-line hunk whose earlier copy comes first.
test("[happy-1] a multi-line hunk matching at its stated line and earlier applies at its stated line", () => {
  const files = { "f.txt": "k\nv\nm\nk\nv\nm\n" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -4,3 +4,3 @@", " k", "-v", "+V", " m")),
  );
  assert.deepEqual(result.files, { "f.txt": "k\nv\nm\nk\nV\nm\n" });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: 0 }]);
});

// Scenario: A hunk whose lines moved applies at the nearest match

// Extends "a hunk whose lines moved later in the file applies there with a positive offset": moved earlier instead.
test("[boundary-1] a hunk whose lines moved earlier applies there with a negative offset", () => {
  const files = { "f.txt": "a\nb\nc\nx\ny\n" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -4,3 +4,3 @@", " a", "-b", "+B", " c")),
  );
  assert.deepEqual(result.files, { "f.txt": "a\nB\nc\nx\ny\n" });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: -3 }]);
});

// Extends "a hunk whose lines moved later ...": a long file, moved far.
test("[boundary-1] a hunk moved far later in a long file applies there with its full offset", () => {
  const lines = Array.from({ length: 200 }, (_, i) => `row ${i + 1}`);
  const files = { "f.txt": text(lines) };
  const result = applied(
    applyPatch(
      files,
      diff(...header("f.txt"), "@@ -10,3 +10,3 @@", " row 150", "-row 151", "+ROW 151", " row 152"),
    ),
  );
  const expected = [...lines.slice(0, 150), "ROW 151", ...lines.slice(151)];
  assert.deepEqual(result.files, { "f.txt": text(expected) });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: 140 }]);
});

// Extends "a hunk whose lines moved later ...": a stated line past the end of the file.
test("[boundary-1] a hunk stated past the end of the file applies where it matches, earlier", () => {
  const files = { "f.txt": "a\nb\nc\nd\ne\n" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -50,2 +50,2 @@", " b", "-c", "+C")),
  );
  assert.deepEqual(result.files, { "f.txt": "a\nb\nC\nd\ne\n" });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: -48 }]);
});

// Extends "of two matches equally near the stated line, the earlier is used, with a negative offset": a two-line hunk, farther away.
test("[boundary-1] of two multi-line matches four lines either side, the earlier is used", () => {
  const files = { "f.txt": "n\np\nq\nn\nn\nn\nn\nn\nn\np\nq\nn\n" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -6,2 +6,2 @@", "-p", "+P", " q")),
  );
  assert.deepEqual(result.files, { "f.txt": "n\nP\nq\nn\nn\nn\nn\nn\nn\np\nq\nn\n" });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: -4 }]);
});

// Extends "a moved hunk applies at the nearest match, not the first in the file": the nearer match is earlier.
test("[boundary-1] a nearer earlier match wins over a farther later one", () => {
  const files = { "f.txt": "n\nn\nn\nT\nn\nn\nT\nn\n" };
  const result = applied(applyPatch(files, diff(...header("f.txt"), "@@ -5 +5 @@", "-T", "+U")));
  assert.deepEqual(result.files, { "f.txt": "n\nn\nn\nU\nn\nn\nT\nn\n" });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: -1 }]);
});

// Extends "a moved hunk applies at the nearest match, not the first in the file": the farther earlier match is close too.
test("[boundary-1] a nearer later match wins over an earlier one two lines away", () => {
  const files = { "f.txt": "n\nn\nT\nn\nn\nT\nn\n" };
  const result = applied(applyPatch(files, diff(...header("f.txt"), "@@ -5 +5 @@", "-T", "+U")));
  assert.deepEqual(result.files, { "f.txt": "n\nn\nT\nn\nn\nU\nn\n" });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: 1 }]);
});

// Extends "a moved hunk applies at the nearest match ...": a nearer partial match does not count.
test("[boundary-1] a nearer position matching only some of the hunk's lines is passed over", () => {
  const files = { "f.txt": "a\nb\nz\nn\nn\nn\na\nb\nc\n" };
  const result = applied(
    applyPatch(files, diff(...header("f.txt"), "@@ -1,3 +1,3 @@", " a", "-b", "+B", " c")),
  );
  assert.deepEqual(result.files, { "f.txt": "a\nb\nz\nn\nn\nn\na\nB\nc\n" });
  assert.deepEqual(result.hunks, [{ path: "f.txt", hunk: 1, offset: 6 }]);
});

// Extends "a hunk with one context line matching nowhere is rejected: there is no fuzz": the removed line differs.
test("[boundary-1] a hunk whose removed line differs while its context matches is rejected", () => {
  const files = { "f.txt": "a\nb\nc\nd\ne\n" };
  const result = rejected(
    applyPatch(files, diff(...header("f.txt"), "@@ -2,3 +2,3 @@", " b", "-X", "+Y", " d")),
  );
  assert.deepEqual(result.rejected, [{ path: "f.txt", hunk: 1, reason: "no match" }]);
  assert.deepEqual(result.files, { "f.txt": "a\nb\nc\nd\ne\n" });
});

// Extends "a hunk with one context line matching nowhere ...": one mismatch among many context lines.
test("[boundary-1] one differing context line among six is enough to reject the hunk", () => {
  const files = { "f.txt": "1\n2\n3\n4\n5\n6\n7\n" };
  const result = rejected(
    applyPatch(
      files,
      diff(...header("f.txt"), "@@ -1,7 +1,7 @@", " 1", " 2", " 3", "-4", "+FOUR", " 5", " six", " 7"),
    ),
  );
  assert.deepEqual(result.rejected, [{ path: "f.txt", hunk: 1, reason: "no match" }]);
  assert.deepEqual(result.files, { "f.txt": "1\n2\n3\n4\n5\n6\n7\n" });
});

// Extends "a hunk with one context line matching nowhere ...": a difference of leading whitespace.
test("[boundary-1] a line differing only in leading whitespace does not match", () => {
  const files = { "f.txt": "a\n  b\nc\n" };
  const result = rejected(
    applyPatch(files, diff(...header("f.txt"), "@@ -1,3 +1,3 @@", " a", "-b", "+B", " c")),
  );
  assert.deepEqual(result.rejected, [{ path: "f.txt", hunk: 1, reason: "no match" }]);
  assert.deepEqual(result.files, { "f.txt": "a\n  b\nc\n" });
});

// Extends "a hunk with one context line matching nowhere ...": the hunk runs past the end of the file.
test("[boundary-1] a hunk whose lines run past the end of the file is rejected", () => {
  const files = { "f.txt": "a\nb\n" };
  const result = rejected(
    applyPatch(files, diff(...header("f.txt"), "@@ -1,3 +1,3 @@", " a", "-b", "+B", " c")),
  );
  assert.deepEqual(result.rejected, [{ path: "f.txt", hunk: 1, reason: "no match" }]);
  assert.deepEqual(result.files, { "f.txt": "a\nb\n" });
});

// Scenario: Several hunks in one file apply in order

// Extends "several hunks in one file all apply, each to the file as changed by those before it": three hunks that grow, shrink and keep the file's length.
test("[happy-2] three hunks that add, remove and replace lines all apply in order", () => {
  const lines = Array.from({ length: 15 }, (_, i) => `l${i + 1}`);
  const files = { "f.txt": text(lines) };
  const result = applied(
    applyPatch(
      files,
      diff(
        ...header("f.txt"),
        "@@ -2,2 +2,4 @@",
        " l2",
        "+n1",
        "+n2",
        " l3",
        "@@ -7,3 +9,2 @@",
        " l7",
        "-l8",
        " l9",
        "@@ -13,2 +14,2 @@",
        "-l13",
        "+L13",
        " l14",
      ),
    ),
  );
  const expected = [
    "l1", "l2", "n1", "n2", "l3", "l4", "l5", "l6", "l7", "l9", "l10", "l11", "l12", "L13", "l14", "l15",
  ];
  assert.deepEqual(result.files, { "f.txt": text(expected) });
  const numbers = result.hunks
    .filter((h) => h.path === "f.txt")
    .map((h) => h.hunk)
    .sort((x, y) => x - y);
  assert.deepEqual(numbers, [1, 2, 3]);
});

// Extends "several hunks in one file all apply ...": the second hunk starts on the line right after the first ends.
test("[happy-2] a hunk starting right after the end of the hunk before it applies there", () => {
  const files = { "f.txt": "a\nb\nc\nd\ne\nf\n" };
  const result = applied(
    applyPatch(
      files,
      diff(...header("f.txt"), "@@ -1,3 +1,3 @@", " a", "-b", "+B", " c", "@@ -4,2 +4,2 @@", "-d", "+D", " e"),
    ),
  );
  assert.deepEqual(result.files, { "f.txt": "a\nB\nc\nD\ne\nf\n" });
  assert.deepEqual(sortedHunks(result.hunks), [
    { path: "f.txt", hunk: 1, offset: 0 },
    { path: "f.txt", hunk: 2, offset: 0 },
  ]);
});

// Extends "a later hunk is never placed before the end of the hunk before it, even where that is nearer": the nearer match lies before the first hunk entirely.
test("[happy-2] a later hunk whose nearest match is before the hunk before it applies after it", () => {
  const files = { "f.txt": "a\nm\nb\nc\nd\ne\nf\ng\nh\nm\ni\n" };
  const result = applied(
    applyPatch(
      files,
      diff(...header("f.txt"), "@@ -5,3 +5,3 @@", " d", "-e", "+E", " f", "@@ -3 +3 @@", "-m", "+M"),
    ),
  );
  assert.deepEqual(result.files, { "f.txt": "a\nm\nb\nc\nd\nE\nf\ng\nh\nM\ni\n" });
  assert.deepEqual(sortedHunks(result.hunks), [
    { path: "f.txt", hunk: 1, offset: 0 },
    { path: "f.txt", hunk: 2, offset: 7 },
  ]);
});

// Extends "a later hunk is never placed before the end of the hunk before it ...": no match after it at all.
test("[happy-2] a later hunk that matches only before the hunk before it is rejected", () => {
  const files = { "f.txt": "a\nb\nc\nd\ne\n" };
  const result = rejected(
    applyPatch(
      files,
      diff(...header("f.txt"), "@@ -3,2 +3,2 @@", "-c", "+C", " d", "@@ -1 +1 @@", "-a", "+A"),
    ),
  );
  assert.deepEqual(result.rejected, [{ path: "f.txt", hunk: 2, reason: "no match" }]);
  assert.deepEqual(result.files, { "f.txt": "a\nb\nc\nd\ne\n" });
});

// Extends "several hunks in one file all apply ...": two files, hunk numbers counting from 1 within each.
test("[happy-2] hunk numbers count from 1 within each file of a multi-file diff", () => {
  const files = { "one.txt": "a\nb\nc\nd\ne\nf\ng\nh\n", "two.txt": "1\n2\n3\n4\n5\n" };
  const result = applied(
    applyPatch(
      files,
      diff(
        ...header("one.txt"),
        "@@ -1,2 +1,2 @@",
        "-a",
        "+A",
        " b",
        "@@ -5,2 +5,2 @@",
        " f",
        "-g",
        "+G",
        ...header("two.txt"),
        "@@ -2 +2 @@",
        "-2",
        "+II",
        "@@ -4,2 +4,2 @@",
        " 4",
        "-5",
        "+V",
      ),
    ),
  );
  assert.deepEqual(result.files, { "one.txt": "A\nb\nc\nd\ne\nf\nG\nh\n", "two.txt": "1\nII\n3\n4\nV\n" });
  assert.deepEqual(sortedHunks(result.hunks), [
    { path: "one.txt", hunk: 1, offset: 0 },
    { path: "one.txt", hunk: 2, offset: 1 },
    { path: "two.txt", hunk: 1, offset: 0 },
    { path: "two.txt", hunk: 2, offset: 0 },
  ]);
});
