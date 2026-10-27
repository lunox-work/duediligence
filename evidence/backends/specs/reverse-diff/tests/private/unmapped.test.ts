import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseMapDiff } from "../../src/index.js";

function headers(oldPath: string, newPath = oldPath): string {
  return `diff --git a/${oldPath} b/${newPath}\n--- a/${oldPath}\n+++ b/${newPath}\n`;
}

// Extends "[unhappy-1] leaves an unknown path unchanged and reports it only once".
test("[unhappy-1] deduplicates distinct unknown old and new names across all their repeated headers", () => {
  const diff = headers("docs/z.md", "docs/a.md") + headers("docs/a.md", "docs/z.md") + headers("docs/z.md");
  assert.deepEqual(reverseMapDiff(diff, []), { diff, unmapped: ["docs/z.md", "docs/a.md"] });
});

// Extends "[unhappy-1] reports unknown paths in first appearance order across repeated sections".
test("[unhappy-1] orders many unknown paths by discovery across both sides and mapped sections", () => {
  const unknown = Array.from({ length: 40 }, (_, i) => `docs/item${(i * 17) % 40}.md`);
  const input: string[] = [];
  const output: string[] = [];
  for (let i = 0; i < unknown.length; i += 2) {
    input.push(headers(unknown[i]!, unknown[i + 1]!), headers(`view/file${i}.ts`), headers(unknown[0]!));
    output.push(headers(unknown[i]!, unknown[i + 1]!), headers(`src/file${i}.ts`), headers(unknown[0]!));
  }
  assert.deepEqual(reverseMapDiff(input.join(""), [
    { kind: "path", public: "view", real: "src" },
  ]), { diff: output.join(""), unmapped: unknown });
});

test("[unhappy-1] retains and reports an unknown side when the other side of a file is mapped", () => {
  const diff = headers("docs/original.md", "view/first.ts") + headers("view/second.ts", "docs/final.md");
  const expected = headers("docs/original.md", "src/first.ts") + headers("src/second.ts", "docs/final.md");
  assert.deepEqual(reverseMapDiff(diff, [
    { kind: "path", public: "view", real: "src" },
  ]), { diff: expected, unmapped: ["docs/original.md", "docs/final.md"] });
});

test("[unhappy-1] reports unknown rename paths once even when no ordinary file headers repeat them", () => {
  const diff = "diff --git a/docs/z.md b/docs/a.md\nsimilarity index 100%\nrename from docs/z.md\nrename to docs/a.md\n" +
    "diff --git a/docs/a.md b/view/mapped.ts\nsimilarity index 100%\nrename from docs/a.md\nrename to view/mapped.ts\n";
  const expected = "diff --git a/docs/z.md b/docs/a.md\nsimilarity index 100%\nrename from docs/z.md\nrename to docs/a.md\n" +
    "diff --git a/docs/a.md b/src/mapped.ts\nsimilarity index 100%\nrename from docs/a.md\nrename to src/mapped.ts\n";
  assert.deepEqual(reverseMapDiff(diff, [
    { kind: "path", public: "view", real: "src" },
  ]), { diff: expected, unmapped: ["docs/z.md", "docs/a.md"] });
});

test("[unhappy-1] discovers paths from standalone old and new headers in their textual order", () => {
  const diff = "--- a/docs/z.md\n+++ b/docs/a.md\n@@ -1 +1 @@\n-old\n+new\n" +
    "--- a/docs/a.md\n+++ b/view/mapped.ts\n@@ -1 +1 @@\n-old\n+new\n";
  const expected = "--- a/docs/z.md\n+++ b/docs/a.md\n@@ -1 +1 @@\n-old\n+new\n" +
    "--- a/docs/a.md\n+++ b/src/mapped.ts\n@@ -1 +1 @@\n-old\n+new\n";
  assert.deepEqual(reverseMapDiff(diff, [
    { kind: "path", public: "view", real: "src" },
  ]), { diff: expected, unmapped: ["docs/z.md", "docs/a.md"] });
});

test("[unhappy-1] maps identifiers inside a file even when its path is unknown", () => {
  const diff = headers("docs/Parcel.ts") + "@@ -1 +1 @@ Parcel\n-Parcel.old()\n+Parcel.new()\n";
  const expected = headers("docs/Parcel.ts") + "@@ -1 +1 @@ Message\n-Message.old()\n+Message.new()\n";
  assert.deepEqual(reverseMapDiff(diff, [
    { kind: "identifier", public: "Parcel", real: "Message" },
    { kind: "identifier", public: "docs", real: "documents" },
  ]), { diff: expected, unmapped: ["docs/Parcel.ts"] });
});

test("[unhappy-1] does not treat a real name as a covered public path", () => {
  const diff = headers("src/already-real.ts") + headers("view/mapped.ts") + headers("src/already-real.ts");
  const expected = headers("src/already-real.ts") + headers("src/mapped.ts") + headers("src/already-real.ts");
  assert.deepEqual(reverseMapDiff(diff, [
    { kind: "path", public: "view", real: "src" },
  ]), { diff: expected, unmapped: ["src/already-real.ts"] });
});

test("[unhappy-1] excludes null sentinels while reporting unknown created and deleted files", () => {
  const diff = "diff --git a/docs/new.md b/docs/new.md\nnew file mode 100644\n--- /dev/null\n+++ b/docs/new.md\n@@ -0,0 +1 @@\n+new\n" +
    "diff --git a/docs/old.md b/docs/old.md\ndeleted file mode 100644\n--- a/docs/old.md\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n";
  assert.deepEqual(reverseMapDiff(diff, []), { diff, unmapped: ["docs/new.md", "docs/old.md"] });
});

test("[unhappy-1] treats object prototype property names as ordinary unknown paths", () => {
  const unknown = ["constructor", "__proto__", "toString", "hasOwnProperty"];
  const diff = unknown.map((p) => headers(p)).join("") + headers("constructor") + headers("__proto__");
  assert.deepEqual(reverseMapDiff(diff, []), { diff, unmapped: unknown });
});

test("[unhappy-1] keeps discovery state local to each invocation", () => {
  const first = headers("docs/z.md") + headers("docs/a.md");
  const second = headers("docs/a.md") + headers("docs/z.md");
  assert.deepEqual(reverseMapDiff(first, []), { diff: first, unmapped: ["docs/z.md", "docs/a.md"] });
  assert.deepEqual(reverseMapDiff(second, []), { diff: second, unmapped: ["docs/a.md", "docs/z.md"] });
  assert.deepEqual(reverseMapDiff(first, []), { diff: first, unmapped: ["docs/z.md", "docs/a.md"] });
});

test("[unhappy-1] reports an original unknown path even when it is also an earlier mapped result", () => {
  const diff = headers("view/file.ts") + headers("docs/other.md") + headers("src/file.ts") + headers("view/file.ts");
  const expected = headers("src/file.ts") + headers("docs/other.md") + headers("src/file.ts") + headers("src/file.ts");
  assert.deepEqual(reverseMapDiff(diff, [
    { kind: "path", public: "view", real: "src" },
  ]), { diff: expected, unmapped: ["docs/other.md", "src/file.ts"] });
});
