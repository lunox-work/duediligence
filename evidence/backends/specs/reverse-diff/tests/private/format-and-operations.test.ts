import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseMapDiff } from "../../src/index.js";
import type { NameTable } from "../../src/index.js";

// Extends "[boundary-1] maps rename lines and a new file while preserving the null header".
test("[boundary-1] maps multiple renames and a creation after a preceding file hunk", () => {
  const diff = [
    "diff --git a/view/existing.ts b/view/existing.ts", "--- a/view/existing.ts", "+++ b/view/existing.ts",
    "@@ -1 +1 @@", "-Parcel.old()", "+Parcel.new()",
    "diff --git a/view/one.ts b/other/two.ts", "similarity index 100%",
    "rename from view/one.ts", "rename to other/two.ts",
    "diff --git a/other/three.ts b/view/deep/four.ts", "similarity index 100%",
    "rename from other/three.ts", "rename to view/deep/four.ts",
    "diff --git a/other/fresh.ts b/other/fresh.ts", "new file mode 100644", "--- /dev/null", "+++ b/other/fresh.ts",
    "@@ -0,0 +1 @@ Parcel", "+Parcel.create()", "",
  ].join("\n");
  const expected = [
    "diff --git a/src/existing.ts b/src/existing.ts", "--- a/src/existing.ts", "+++ b/src/existing.ts",
    "@@ -1 +1 @@", "-Message.old()", "+Message.new()",
    "diff --git a/src/one.ts b/packages/two.ts", "similarity index 100%",
    "rename from src/one.ts", "rename to packages/two.ts",
    "diff --git a/packages/three.ts b/src/deep/four.ts", "similarity index 100%",
    "rename from packages/three.ts", "rename to src/deep/four.ts",
    "diff --git a/packages/fresh.ts b/packages/fresh.ts", "new file mode 100644", "--- /dev/null", "+++ b/packages/fresh.ts",
    "@@ -0,0 +1 @@ Message", "+Message.create()", "",
  ].join("\n");
  assert.deepEqual(reverseMapDiff(diff, [
    { kind: "path", public: "view", real: "src" },
    { kind: "path", public: "other", real: "packages" },
    { kind: "identifier", public: "Parcel", real: "Message" },
  ]), { diff: expected, unmapped: [] });
});

// Extends "[boundary-1] maps a deleted file while preserving the null destination".
test("[boundary-1] maps several deletions and creations with dev directory entries present", () => {
  const diff = [
    "diff --git a/dev/old.ts b/dev/old.ts", "deleted file mode 100755", "--- a/dev/old.ts", "+++ /dev/null",
    "@@ -1 +0,0 @@", "-Widget.remove()",
    "diff --git a/dev/new.ts b/dev/new.ts", "new file mode 100644", "--- /dev/null", "+++ b/dev/new.ts",
    "@@ -0,0 +1 @@", "+Widget.add()",
    "diff --git a/dev/deep/old.ts b/dev/deep/old.ts", "deleted file mode 100644", "--- a/dev/deep/old.ts", "+++ /dev/null",
    "@@ -1 +0,0 @@", "-Widget.remove()", "",
  ].join("\n");
  const expected = [
    "diff --git a/devices/old.ts b/devices/old.ts", "deleted file mode 100755", "--- a/devices/old.ts", "+++ /dev/null",
    "@@ -1 +0,0 @@", "-Component.remove()",
    "diff --git a/devices/new.ts b/devices/new.ts", "new file mode 100644", "--- /dev/null", "+++ b/devices/new.ts",
    "@@ -0,0 +1 @@", "+Component.add()",
    "diff --git a/devices/deep/old.ts b/devices/deep/old.ts", "deleted file mode 100644", "--- a/devices/deep/old.ts", "+++ /dev/null",
    "@@ -1 +0,0 @@", "-Component.remove()", "",
  ].join("\n");
  assert.deepEqual(reverseMapDiff(diff, [
    { kind: "path", public: "dev", real: "devices" },
    { kind: "identifier", public: "Widget", real: "Component" },
  ]), { diff: expected, unmapped: [] });
});

test("[boundary-1] distinguishes a real file named dev/null from the null header sentinel", () => {
  const diff = "diff --git a/dev/null b/dev/null\nnew file mode 100644\n--- /dev/null\n+++ b/dev/null\n@@ -0,0 +1 @@\n+text\n";
  const expected = "diff --git a/devices/null b/devices/null\nnew file mode 100644\n--- /dev/null\n+++ b/devices/null\n@@ -0,0 +1 @@\n+text\n";
  assert.deepEqual(reverseMapDiff(diff, [
    { kind: "path", public: "dev", real: "devices" },
  ]), { diff: expected, unmapped: [] });
});

test("[boundary-1] maps exact rename paths literally rather than as identifier words", () => {
  const diff = "diff --git a/tmp/Parcel.v2.ts b/tmp/Parcel.v3.ts\nsimilarity index 100%\nrename from tmp/Parcel.v2.ts\nrename to tmp/Parcel.v3.ts\n";
  const expected = "diff --git a/src/$&/old.ts b/lib/new.ts\nsimilarity index 100%\nrename from src/$&/old.ts\nrename to lib/new.ts\n";
  assert.deepEqual(reverseMapDiff(diff, [
    { kind: "identifier", public: "Parcel", real: "Message" },
    { kind: "path", public: "tmp/Parcel.v2.ts", real: "src/$&/old.ts" },
    { kind: "path", public: "tmp/Parcel.v3.ts", real: "lib/new.ts" },
  ]), { diff: expected, unmapped: [] });
});

// Extends "[boundary-4] preserves unchanged metadata, whitespace, content and newline markers".
test("[boundary-4] keeps blank hunk lines tabs trailing spaces and unicode around mapped words", () => {
  const diff = "diff --git a/view/a.ts b/view/a.ts\nindex 012abc..def987 100644\n--- a/view/a.ts\n+++ b/view/a.ts\n@@ -1,3 +1,4 @@\n \n-\tParcel();  \t\n+\tParcel(); \t \n+\n café = '雪';  \n";
  const expected = "diff --git a/src/a.ts b/src/a.ts\nindex 012abc..def987 100644\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,3 +1,4 @@\n \n-\tMessage();  \t\n+\tMessage(); \t \n+\n café = '雪';  \n";
  assert.deepEqual(reverseMapDiff(diff, [
    { kind: "path", public: "view", real: "src" },
    { kind: "identifier", public: "Parcel", real: "Message" },
  ]), { diff: expected, unmapped: [] });
});

// Extends "[boundary-4] preserves mixed line endings and a missing final newline while mapping".
test("[boundary-4] preserves every line terminator across several hunks and maps the unterminated final line", () => {
  const input = [
    "diff --git a/view/a.ts b/view/a.ts", "--- a/view/a.ts", "+++ b/view/a.ts",
    "@@ -1 +1 @@ Parcel", "-Parcel.old()", "+Parcel.new()",
    "@@ -10 +10 @@", "-Parcel.left()", "+Parcel.right()",
    "diff --git a/view/b.ts b/view/b.ts", "--- a/view/b.ts", "+++ b/view/b.ts",
    "@@ -1 +1 @@", "-Parcel()", "+Parcel()",
  ];
  const expected = [
    "diff --git a/src/a.ts b/src/a.ts", "--- a/src/a.ts", "+++ b/src/a.ts",
    "@@ -1 +1 @@ Message", "-Message.old()", "+Message.new()",
    "@@ -10 +10 @@", "-Message.left()", "+Message.right()",
    "diff --git a/src/b.ts b/src/b.ts", "--- a/src/b.ts", "+++ b/src/b.ts",
    "@@ -1 +1 @@", "-Message()", "+Message()",
  ];
  const endings = ["\r\n", "\n", "\n", "\r\n", "\n"];
  const join = (lines: string[]): string => lines.map((line, i) => line + (i === lines.length - 1 ? "" : endings[i % endings.length]!)).join("");
  assert.deepEqual(reverseMapDiff(join(input), [
    { kind: "path", public: "view", real: "src" },
    { kind: "identifier", public: "Parcel", real: "Message" },
  ]), { diff: join(expected), unmapped: [] });
});

test("[boundary-4] preserves both no-newline markers and their CRLF endings", () => {
  const diff = "@@ -8 +8 @@ Parcel\r\n-Parcel.before();\r\n\\ No newline at end of file\r\n+Parcel.after();\r\n\\ No newline at end of file\r\n";
  const expected = "@@ -8 +8 @@ Message\r\n-Message.before();\r\n\\ No newline at end of file\r\n+Message.after();\r\n\\ No newline at end of file\r\n";
  assert.deepEqual(reverseMapDiff(diff, [
    { kind: "identifier", public: "Parcel", real: "Message" },
  ]), { diff: expected, unmapped: [] });
});

test("[boundary-4] returns an empty diff unchanged with either an empty or populated table", () => {
  const populated: NameTable = [
    { kind: "path", public: "view", real: "src" },
    { kind: "identifier", public: "Parcel", real: "Message" },
  ];
  for (const table of [[], populated]) {
    assert.deepEqual(reverseMapDiff("", table), { diff: "", unmapped: [] });
  }
});

test("[boundary-4] preserves an entire unmapped CRLF patch with an empty table", () => {
  const diff = "diff --git a/docs/z.md b/docs/z.md\r\nindex a12..b34 100644\r\n--- a/docs/z.md\r\n+++ b/docs/z.md\r\n@@ -1,2 +1,2 @@ café\r\n \tunchanged  \r\n-old  \r\n+new\r\n\\ No newline at end of file";
  assert.deepEqual(reverseMapDiff(diff, []), { diff, unmapped: ["docs/z.md"] });
});

test("[boundary-4] does not apply identifier replacements to metadata or newline marker text", () => {
  const diff = "diff --git a/view/index.ts b/view/index.ts\nindex abc123..def456 100644\nnew file mode 100644\n--- /dev/null\n+++ b/view/index.ts\n@@ -0,0 +1 @@\n+index(mode, file, No, newline);\n\\ No newline at end of file\n";
  const expected = "diff --git a/src/index.ts b/src/index.ts\nindex abc123..def456 100644\nnew file mode 100644\n--- /dev/null\n+++ b/src/index.ts\n@@ -0,0 +1 @@\n+position(setting, document, Yes, linebreak);\n\\ No newline at end of file\n";
  assert.deepEqual(reverseMapDiff(diff, [
    { kind: "path", public: "view", real: "src" },
    { kind: "identifier", public: "index", real: "position" },
    { kind: "identifier", public: "mode", real: "setting" },
    { kind: "identifier", public: "file", real: "document" },
    { kind: "identifier", public: "No", real: "Yes" },
    { kind: "identifier", public: "newline", real: "linebreak" },
  ]), { diff: expected, unmapped: [] });
});

test("[boundary-4] leaves path-like hunk text unchanged when only path entries match it", () => {
  const body = "@@ -1,2 +1,2 @@ view/a.ts\n // view/a.ts\n-const path = 'view/a.ts';\n+const path = 'view/b.ts';\n";
  const diff = "diff --git a/view/a.ts b/view/a.ts\n--- a/view/a.ts\n+++ b/view/a.ts\n" + body;
  const expected = "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n" + body;
  assert.deepEqual(reverseMapDiff(diff, [
    { kind: "path", public: "view", real: "src" },
    { kind: "path", public: "view/a.ts", real: "src/a.ts" },
  ]), { diff: expected, unmapped: [] });
});
