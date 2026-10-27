import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseMapDiff } from "../../src/index.js";
import type { NameTable } from "../../src/index.js";

function headers(oldPath: string, newPath = oldPath): string {
  return `diff --git a/${oldPath} b/${newPath}\n--- a/${oldPath}\n+++ b/${newPath}\n`;
}

// Extends "[happy-1] maps all file header occurrences to the real path".
test("[happy-1] maps a large collection of exact paths without truncating or reordering sections", () => {
  const table: NameTable = Array.from({ length: 36 }, (_, i) => ({
    kind: "path",
    public: `view/group${i}/item${i}.tsx`,
    real: `source/package${35 - i}/component${i}.tsx`,
  }));
  const order = Array.from({ length: 36 }, (_, i) => (i * 13) % 36);
  const diff = order.map((i) => headers(table[i]!.public)).join("");
  const expected = order.map((i) => headers(table[i]!.real)).join("");
  assert.deepEqual(reverseMapDiff(diff, table), { diff: expected, unmapped: [] });
});

// Extends "[happy-1] maps distinct old and new file paths independently".
test("[happy-1] maps crossed old and new paths across several files with literal a and b directories", () => {
  const table: NameTable = [
    { kind: "path", public: "a/view.ts", real: "b/source.ts" },
    { kind: "path", public: "b/view.ts", real: "a/source.ts" },
    { kind: "path", public: "view/deep/third.ts", real: "lib/third.ts" },
  ];
  assert.deepEqual(
    reverseMapDiff(
      headers("a/view.ts", "b/view.ts") + headers("b/view.ts", "view/deep/third.ts") + headers("view/deep/third.ts", "a/view.ts"),
      table,
    ),
    {
      diff: headers("b/source.ts", "a/source.ts") + headers("a/source.ts", "lib/third.ts") + headers("lib/third.ts", "b/source.ts"),
      unmapped: [],
    },
  );
});

test("[happy-1] treats punctuation in file entries and replacement paths literally", () => {
  const input = "generated.v2/[cache]+(old).ts";
  const output = "source/$&/real[final]+(new).ts";
  assert.deepEqual(
    reverseMapDiff(headers(input), [{ kind: "path", public: input, real: output }]),
    { diff: headers(output), unmapped: [] },
  );
});

// Extends "[happy-2] maps directory descendants while retaining their suffixes".
test("[happy-2] matches a multi-segment directory itself and arbitrarily deep descendants", () => {
  const suffixes = ["", "/one.ts", "/a/b/c/d/e/f/file.ts", "/a/generated/a/last.ts"];
  assert.deepEqual(
    reverseMapDiff(suffixes.map((s) => headers(`view/generated${s}`)).join(""), [
      { kind: "path", public: "view/generated", real: "source/components" },
    ]),
    { diff: suffixes.map((s) => headers(`source/components${s}`)).join(""), unmapped: [] },
  );
});

// Extends "[happy-2] leaves a directory with a longer segment name unmapped".
test("[happy-2] requires the entire leading path and a segment boundary", () => {
  const unknown = ["view/generator/file.ts", "view/generated-extra/file.ts", "view/generated.ts", "other/view/generated/file.ts", "preview/generated/file.ts"];
  const diff = headers("view/generated/ok.ts") + unknown.map((p) => headers(p)).join("");
  assert.deepEqual(
    reverseMapDiff(diff, [{ kind: "path", public: "view/generated", real: "src" }]),
    { diff: headers("src/ok.ts") + unknown.map((p) => headers(p)).join(""), unmapped: unknown },
  );
});

test("[happy-2] replaces only the leading directory even when it repeats in the suffix", () => {
  assert.deepEqual(
    reverseMapDiff(headers("view/view/deep/view/file.ts"), [
      { kind: "path", public: "view", real: "source/modules" },
    ]),
    { diff: headers("source/modules/view/deep/view/file.ts"), unmapped: [] },
  );
});

// Extends "[boundary-2] chooses an exact file mapping over an earlier directory mapping".
test("[boundary-2] selects the longest of four overlapping paths in multiple table orders", () => {
  const entries: NameTable = [
    { kind: "path", public: "view", real: "src" },
    { kind: "path", public: "view/lib", real: "packages/library" },
    { kind: "path", public: "view/lib/deep", real: "internal" },
    { kind: "path", public: "view/lib/deep/special.ts", real: "single/replacement.ts" },
  ];
  const diff = headers("view/lib/deep/special.ts") + headers("view/lib/deep/other.ts") + headers("view/lib/other.ts") + headers("view/other.ts");
  const expected = headers("single/replacement.ts") + headers("internal/other.ts") + headers("packages/library/other.ts") + headers("src/other.ts");
  for (const table of [entries, [...entries].reverse(), [entries[2]!, entries[0]!, entries[3]!, entries[1]!]]) {
    assert.deepEqual(reverseMapDiff(diff, table), { diff: expected, unmapped: [] });
  }
});

// Extends "[boundary-2] keeps specific mappings ahead of a later general mapping at segment boundaries".
test("[boundary-2] falls back through several directory levels when a longer segment differs", () => {
  const paths = ["view/lib/deepest/x.ts", "view/library/x.ts", "view/lib/deep/x.ts", "view/lib/deep.ts", "view/lib/deep/file.tsx"];
  const expected = ["libroot/deepest/x.ts", "root/library/x.ts", "deeproot/x.ts", "libroot/deep.ts", "deeproot/file.tsx"];
  assert.deepEqual(
    reverseMapDiff(paths.map((p) => headers(p)).join(""), [
      { kind: "path", public: "view/lib/deep/file.ts", real: "exact.ts" },
      { kind: "path", public: "view", real: "root" },
      { kind: "path", public: "view/lib/deep", real: "deeproot" },
      { kind: "path", public: "view/lib", real: "libroot" },
    ]),
    { diff: expected.map((p) => headers(p)).join(""), unmapped: [] },
  );
});

test("[boundary-2] uses the most specific path for each side of rename metadata", () => {
  const diff = headers("view/lib/old.ts", "view/lib/new.ts") + "similarity index 100%\nrename from view/lib/old.ts\nrename to view/lib/new.ts\n";
  const expected = headers("src/old.ts", "special/new.ts") + "similarity index 100%\nrename from src/old.ts\nrename to special/new.ts\n";
  assert.deepEqual(
    reverseMapDiff(diff, [
      { kind: "path", public: "view", real: "root" },
      { kind: "path", public: "view/lib", real: "src" },
      { kind: "path", public: "view/lib/new.ts", real: "special/new.ts" },
    ]),
    { diff: expected, unmapped: [] },
  );
});

test("[boundary-3] maps chained directory names once per original header path", () => {
  const table: NameTable = [
    { kind: "path", public: "middle", real: "source" },
    { kind: "path", public: "outer", real: "middle" },
    { kind: "path", public: "source", real: "final" },
  ];
  const diff = headers("outer/a.ts", "middle/b.ts") + headers("source/c.ts");
  const expected = headers("middle/a.ts", "source/b.ts") + headers("final/c.ts");
  for (const order of [table, [...table].reverse()]) {
    assert.deepEqual(reverseMapDiff(diff, order), { diff: expected, unmapped: [] });
  }
});
