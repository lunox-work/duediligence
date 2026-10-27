import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseMapDiff } from "../../src/index.js";
import type { NameTable } from "../../src/index.js";

// Extends "[happy-3] maps words in hunk headings and all three content line kinds".
test("[happy-3] maps several identifiers in multiple hunks and files including large line numbers", () => {
  const diff = [
    "diff --git a/public/a.ts b/public/a.ts",
    "--- a/public/a.ts", "+++ b/public/a.ts",
    "@@ -120,2 +2048,2 @@ class Parcel extends Cart {",
    " const p = new Parcel(Cart);", "-Cart.remove(Parcel);", "+Cart.add(Parcel, Parcel);",
    "@@ -9000 +10000 @@ Parcel", "-Parcel.old(Cart)", "+Parcel.new(Cart)",
    "diff --git a/public/b.ts b/public/b.ts", "--- a/public/b.ts", "+++ b/public/b.ts",
    "@@ -0,0 +1,2 @@ Cart", "+Parcel();", "+Cart();", "",
  ].join("\n");
  const expected = [
    "diff --git a/src/a.ts b/src/a.ts", "--- a/src/a.ts", "+++ b/src/a.ts",
    "@@ -120,2 +2048,2 @@ class Message extends Queue {",
    " const p = new Message(Queue);", "-Queue.remove(Message);", "+Queue.add(Message, Message);",
    "@@ -9000 +10000 @@ Message", "-Message.old(Queue)", "+Message.new(Queue)",
    "diff --git a/src/b.ts b/src/b.ts", "--- a/src/b.ts", "+++ b/src/b.ts",
    "@@ -0,0 +1,2 @@ Queue", "+Message();", "+Queue();", "",
  ].join("\n");
  assert.deepEqual(reverseMapDiff(diff, [
    { kind: "identifier", public: "Cart", real: "Queue" },
    { kind: "path", public: "public", real: "src" },
    { kind: "identifier", public: "Parcel", real: "Message" },
  ]), { diff: expected, unmapped: [] });
});

// Extends "[happy-3] replaces punctuation-delimited words but preserves larger words".
test("[happy-3] preserves identifier continuations on either side and matches case exactly", () => {
  const diff = "@@ -12 +34 @@ ParcelHandler\n-Parcel(Parcel2, 2Parcel, Parcel_, _Parcel, ParcelParcel, parcel, PARCEL);\n+Parcel[Parcel].Parcel/Parcel + (Parcel) /* Parcel */;\n";
  const expected = "@@ -12 +34 @@ ParcelHandler\n-Message(Parcel2, 2Parcel, Parcel_, _Parcel, ParcelParcel, parcel, PARCEL);\n+Message[Message].Message/Message + (Message) /* Message */;\n";
  assert.deepEqual(reverseMapDiff(diff, [
    { kind: "identifier", public: "Parcel", real: "Message" },
  ]), { diff: expected, unmapped: [] });
});

test("[happy-3] replaces text words in comments and string literals as well as code", () => {
  const diff = "@@ -1,2 +1,2 @@ Parcel factory\n // Parcel, ParcelHandler\n-const label = 'Parcel';\n+const label = \"Parcel Parcel\";\n";
  const expected = "@@ -1,2 +1,2 @@ Message factory\n // Message, ParcelHandler\n-const label = 'Message';\n+const label = \"Message Message\";\n";
  assert.deepEqual(reverseMapDiff(diff, [
    { kind: "identifier", public: "Parcel", real: "Message" },
  ]), { diff: expected, unmapped: [] });
});

test("[happy-3] keeps path and identifier entries distinct when they share a public name", () => {
  const diff = "diff --git a/Facade/Facade.ts b/Facade/Facade.ts\n--- a/Facade/Facade.ts\n+++ b/Facade/Facade.ts\n@@ -1 +1 @@ Facade\n-Facade.old()\n+Facade.new()\n";
  const expected = "diff --git a/packages/runtime/Facade.ts b/packages/runtime/Facade.ts\n--- a/packages/runtime/Facade.ts\n+++ b/packages/runtime/Facade.ts\n@@ -1 +1 @@ Concrete\n-Concrete.old()\n+Concrete.new()\n";
  const entries: NameTable = [
    { kind: "identifier", public: "Facade", real: "Concrete" },
    { kind: "path", public: "Facade", real: "packages/runtime" },
  ];
  for (const table of [entries, [...entries].reverse()]) {
    assert.deepEqual(reverseMapDiff(diff, table), { diff: expected, unmapped: [] });
  }
});

test("[happy-3] maps header-like removed and added lines as hunk content", () => {
  const diff = "diff --git a/view/a.ts b/view/a.ts\n--- a/view/a.ts\n+++ b/view/a.ts\n@@ -1,2 +1,2 @@\n--- Parcel.old();\n-ordinary(Parcel);\n+++ Parcel.new();\n+ordinary(Parcel);\n";
  const expected = "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,2 @@\n--- Message.old();\n-ordinary(Message);\n+++ Message.new();\n+ordinary(Message);\n";
  assert.deepEqual(reverseMapDiff(diff, [
    { kind: "path", public: "view", real: "src" },
    { kind: "identifier", public: "Parcel", real: "Message" },
  ]), { diff: expected, unmapped: [] });
});

// Extends "[boundary-3] replaces chained public identifiers in one pass".
test("[boundary-3] handles a four-step identifier chain without rescanning any output", () => {
  const entries: NameTable = [
    { kind: "identifier", public: "Delta", real: "Gamma" },
    { kind: "identifier", public: "Gamma", real: "Beta" },
    { kind: "identifier", public: "Beta", real: "Alpha" },
    { kind: "identifier", public: "Alpha", real: "Original" },
  ];
  const diff = "@@ -1,2 +1,2 @@ Delta Gamma Beta Alpha\n Delta(Gamma, Beta, Alpha)\n-Alpha(Beta, Gamma, Delta)\n+Delta(Delta, Gamma, Beta, Alpha)\n";
  const expected = "@@ -1,2 +1,2 @@ Gamma Beta Alpha Original\n Gamma(Beta, Alpha, Original)\n-Original(Alpha, Beta, Gamma)\n+Gamma(Gamma, Beta, Alpha, Original)\n";
  for (const table of [entries, [...entries].reverse(), [entries[1]!, entries[3]!, entries[0]!, entries[2]!]]) {
    assert.deepEqual(reverseMapDiff(diff, table), { diff: expected, unmapped: [] });
  }
});

// Extends "[boundary-3] avoids cascading with reversed table order and repeated names".
test("[boundary-3] swaps cyclic identifier names without temporary-name collisions", () => {
  const diff = "@@ -1 +1 @@ First Second Third\n-First(Second, Third, FirstSecond)\n+Third(First, Second, Third, First)\n";
  const expected = "@@ -1 +1 @@ Second Third First\n-Second(Third, First, FirstSecond)\n+First(Second, Third, First, Second)\n";
  assert.deepEqual(reverseMapDiff(diff, [
    { kind: "identifier", public: "First", real: "Second" },
    { kind: "identifier", public: "Second", real: "Third" },
    { kind: "identifier", public: "Third", real: "First" },
  ]), { diff: expected, unmapped: [] });
});

test("[boundary-3] handles an identity entry next to a mapping whose result is its public name", () => {
  assert.deepEqual(reverseMapDiff("@@ -1 +1 @@ Same\n-Same(Source)\n+Source(Same)\n", [
    { kind: "identifier", public: "Same", real: "Same" },
    { kind: "identifier", public: "Source", real: "Same" },
  ]), { diff: "@@ -1 +1 @@ Same\n-Same(Same)\n+Same(Same)\n", unmapped: [] });
});

test("[happy-3] replaces every occurrence in a long line and handles many independent identifiers", () => {
  const entries: NameTable = Array.from({ length: 48 }, (_, i) => ({
    kind: "identifier", public: `Public${i}`, real: `Actual${i}`,
  }));
  const order = Array.from({ length: 240 }, (_, i) => (i * 17) % 48);
  const before = order.map((i) => `Public${i}(Public${i}Tail)`).join(" + ");
  const after = order.map((i) => `Actual${i}(Public${i}Tail)`).join(" + ");
  assert.deepEqual(reverseMapDiff(`@@ -1 +1 @@\n-${before}\n+${before}\n`, entries), {
    diff: `@@ -1 +1 @@\n-${after}\n+${after}\n`, unmapped: [],
  });
});
