import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPatch } from "../../src/index.js";
import type { Files, AppliedHunk, RejectedHunk } from "../../src/index.js";

const diff = (...lines: string[]): string => lines.join("\n") + "\n";
const header = (path: string): string[] => [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`];
const sortHunks = <T extends { path: string; hunk: number }>(hunks: T[]): T[] =>
  [...hunks].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.hunk - b.hunk);

function applied(files: Files, patch: string, expected: Files, hunks: AppliedHunk[]): void {
  const before = { ...files };
  const result = applyPatch(files, patch);
  assert.deepEqual(files, before);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Expected application");
  assert.deepEqual(result.files, expected);
  assert.deepEqual(sortHunks(result.hunks), sortHunks(hunks));
}

function rejected(files: Files, patch: string, hunks: RejectedHunk[]): void {
  const before = { ...files };
  const result = applyPatch(files, patch);
  assert.deepEqual(files, before);
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("Expected rejection");
  assert.deepEqual(result.files, before);
  assert.deepEqual(sortHunks(result.rejected), sortHunks(hunks));
}

// Extends public "replaces lines at the stated start with all context intact".
test("[happy-1] replaces a larger block and preserves blank, Unicode and prefix-like text", () => {
  const lines = ["lead", "", "\tcontext  ", "old α", "old β", "-literal", "tail"];
  applied({ "nested/a/data.txt": diff(...lines), "other": "\u0000keep" },
    diff(...header("nested/a/data.txt"), "@@ -2,5 +2,7 @@ section name",
      " ", " \tcontext  ", "-old α", "-old β", "+new λ", "+", "+--- text", "++++ text", " -literal"),
    { "nested/a/data.txt": diff("lead", "", "\tcontext  ", "new λ", "", "--- text", "+++ text", "-literal", "tail"), "other": "\u0000keep" },
    [{ path: "nested/a/data.txt", hunk: 1, offset: 0 }]);
});

// Extends public "accepts omitted counts for a one-line file".
test("[happy-1] parses omitted old and new counts independently away from line one", () => {
  applied({ "counts": "a\nb\nc\nd\ne\nf\n" },
    diff(...header("counts"), "@@ -2 +2,2 @@", "-b", "+B1", "+B2",
      "@@ -5,2 +6 @@", "-e", "-f", "+EF"),
    { "counts": "a\nB1\nB2\nc\nd\nEF\n" },
    [{ path: "counts", hunk: 1, offset: 0 }, { path: "counts", hunk: 2, offset: 0 }]);
});

test("[happy-1] inserts at the beginning with an explicit zero old count", () => {
  applied({ "x": "a\nb\n" }, diff(...header("x"), "@@ -0,0 +1,2 @@", "+front", "+"),
    { "x": "front\n\na\nb\n" }, [{ path: "x", hunk: 1, offset: 0 }]);
});

test("[happy-1] inserts between existing lines with an explicit zero old count", () => {
  applied({ "x": "a\nb\nc\n" }, diff(...header("x"), "@@ -2,0 +3,2 @@", "+middle", "+next"),
    { "x": "a\nb\nmiddle\nnext\nc\n" }, [{ path: "x", hunk: 1, offset: 0 }]);
});

test("[happy-1] appends at EOF with an explicit zero old count", () => {
  applied({ "x": "a\nb\n" }, diff(...header("x"), "@@ -2,0 +3 @@", "+end"),
    { "x": "a\nb\nend\n" }, [{ path: "x", hunk: 1, offset: 0 }]);
});

test("[happy-1] a normal modification removing every line retains an empty file", () => {
  applied({ "x": "a\nb\nc\n" }, diff(...header("x"), "@@ -1,3 +0,0 @@", "-a", "-b", "-c"),
    { "x": "" }, [{ path: "x", hunk: 1, offset: 0 }]);
});

// Extends public "chooses the nearest later match and reports a positive offset".
test("[boundary-1] searches far beyond a small fixed window and chooses the closer later block", () => {
  const lines = Array.from({ length: 1700 }, (_, i) => `line ${i}`);
  lines[1100] = "target";
  lines[1600] = "target";
  const expected = [...lines];
  expected[1100] = "changed";
  applied({ "long": diff(...lines) }, diff(...header("long"), "@@ -100 +100 @@", "-target", "+changed"),
    { "long": diff(...expected) }, [{ path: "long", hunk: 1, offset: 1001 }]);
});

// Extends public "chooses the nearest earlier match and reports a negative offset".
test("[boundary-1] searches a distant earlier block rather than the first matching block", () => {
  const lines = Array.from({ length: 1400 }, (_, i) => `row ${i}`);
  lines[30] = "target";
  lines[800] = "target";
  const expected = [...lines];
  expected[800] = "changed";
  applied({ "long": diff(...lines) }, diff(...header("long"), "@@ -1300 +1300 @@", "-target", "+changed"),
    { "long": diff(...expected) }, [{ path: "long", hunk: 1, offset: -499 }]);
});

// Extends public "breaks an equal-distance tie in favor of the earlier match".
test("[boundary-1] resolves a distant tie using full multiline matches", () => {
  const lines = Array.from({ length: 100 }, (_, i) => `row ${i}`);
  for (const i of [9, 69]) lines.splice(i, 3, "before", "target", "after");
  const expected = [...lines];
  expected[10] = "changed";
  applied({ "tie": diff(...lines) },
    diff(...header("tie"), "@@ -40,3 +40,3 @@", " before", "-target", "+changed", " after"),
    { "tie": diff(...expected) }, [{ path: "tie", hunk: 1, offset: -30 }]);
});

test("[boundary-1] uses an exact match even when identical blocks occur on both sides", () => {
  applied({ "x": "hit\ngap\nhit\ngap\nhit\n" },
    diff(...header("x"), "@@ -3 +3 @@", "-hit", "+middle"),
    { "x": "hit\ngap\nmiddle\ngap\nhit\n" }, [{ path: "x", hunk: 1, offset: 0 }]);
});

// Extends public "rejects a match that would require dropping a context line".
test("[boundary-1] rejects when only the trailing context differs", () => {
  rejected({ "x": "before\nold\nwrong\n" },
    diff(...header("x"), "@@ -1,3 +1,3 @@", " before", "-old", "+new", " after"),
    [{ path: "x", hunk: 1, reason: "no match" }]);
});

test("[boundary-1] does not trim significant leading or trailing whitespace while matching", () => {
  rejected({ "x": " before\nold \nafter\n" },
    diff(...header("x"), "@@ -1,3 +1,3 @@", " before", "-old", "+new", " after"),
    [{ path: "x", hunk: 1, reason: "no match" }]);
});

test("[boundary-1] skips closer context decoys to find the nearest complete match", () => {
  applied({ "x": "before\nold\nwrong\ngap\nbefore\nold\nafter\n" },
    diff(...header("x"), "@@ -1,3 +1,3 @@", " before", "-old", "+new", " after"),
    { "x": "before\nold\nwrong\ngap\nbefore\nnew\nafter\n" },
    [{ path: "x", hunk: 1, offset: 4 }]);
});

// Extends public "locates later hunks after earlier additions shift their stated lines"
// and "locates later hunks after earlier removals shift their stated lines".
test("[happy-2] accumulates additions and removals across four hunks", () => {
  applied({ "x": diff("a", "b", "c", "d", "e", "f", "g", "h", "i", "j") },
    diff(...header("x"), "@@ -1 +1,3 @@", "-a", "+a1", "+a2", "+a3",
      "@@ -3,3 +5 @@", "-c", "-d", "-e", "+cde",
      "@@ -7 +7,2 @@", "-g", "+g1", "+g2",
      "@@ -10 +11 @@", "-j", "+J"),
    { "x": diff("a1", "a2", "a3", "b", "cde", "f", "g1", "g2", "h", "i", "J") },
    [1, 2, 3, 4].map(hunk => ({ path: "x", hunk, offset: 0 })));
});

// Extends public "permits the next hunk immediately after the preceding hunk".
test("[happy-2] permits three adjacent replacements whose lengths differ", () => {
  applied({ "x": "a\nb\nc\nd\n" },
    diff(...header("x"), "@@ -1 +1,2 @@", "-a", "+a1", "+a2",
      "@@ -2,2 +3 @@", "-b", "-c", "+bc", "@@ -4 +4 @@", "-d", "+D"),
    { "x": "a1\na2\nbc\nD\n" }, [1, 2, 3].map(hunk => ({ path: "x", hunk, offset: 0 })));
});

// Extends public "measures each offset from the old start adjusted only by preceding line-count changes".
test("[happy-2] does not carry a previous relocation into later hunk offsets", () => {
  applied({ "x": "lead\nmore\na\nb\nc\nd\ne\nf\n" },
    diff(...header("x"), "@@ -1 +1,2 @@", "-a", "+a1", "+a2",
      "@@ -6 +7 @@", "-d", "+D", "@@ -7 +8 @@", "-f", "+F"),
    { "x": "lead\nmore\na1\na2\nb\nc\nD\ne\nF\n" },
    [{ path: "x", hunk: 1, offset: 2 }, { path: "x", hunk: 2, offset: 0 }, { path: "x", hunk: 3, offset: 1 }]);
});

// Extends public "rejects a later hunk whose only match precedes the prior hunk's end".
test("[happy-2] a prior hunk's added lines cannot be consumed by the next hunk", () => {
  rejected({ "x": "a\nb\nc\n" },
    diff(...header("x"), "@@ -1 +1,3 @@", "-a", "+start", "+target", "+end",
      "@@ -2 +4 @@", "-target", "+changed"),
    [{ path: "x", hunk: 2, reason: "no match" }]);
});

test("[happy-2] the end of a preceding hunk includes its trailing context", () => {
  rejected({ "x": "a\nb\nc\nd\n" },
    diff(...header("x"), "@@ -1,3 +1,3 @@", "-a", "+A", " b", " c",
      "@@ -4 +4 @@", "-c", "+C"),
    [{ path: "x", hunk: 2, reason: "no match" }]);
});

test("[happy-2] searches past an ineligible earlier match for a later eligible one", () => {
  applied({ "x": "target\nstart\ntarget\ngap\ntarget\n" },
    diff(...header("x"), "@@ -2,2 +2,2 @@", "-start", "+START", " target",
      "@@ -4 +4 @@", "-target", "+last"),
    { "x": "target\nSTART\ntarget\ngap\nlast\n" },
    [{ path: "x", hunk: 1, offset: 0 }, { path: "x", hunk: 2, offset: 1 }]);
});

test("[happy-2] line-count adjustments and hunk numbers restart for each file", () => {
  applied({ "z": "a\nb\n", "a": "x\ny\n" },
    diff(...header("z"), "@@ -1 +1,3 @@", "-a", "+a1", "+a2", "+a3",
      "@@ -2 +4 @@", "-b", "+B", ...header("a"), "@@ -2 +2 @@", "-y", "+Y"),
    { "z": "a1\na2\na3\nB\n", "a": "x\nY\n" },
    [{ path: "z", hunk: 1, offset: 0 }, { path: "z", hunk: 2, offset: 0 }, { path: "a", hunk: 1, offset: 0 }]);
});
