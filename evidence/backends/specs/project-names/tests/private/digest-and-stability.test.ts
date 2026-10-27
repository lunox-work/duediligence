import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NameRegistry } from "../../src/index.js";

function firstName(key: string, id: string): string {
  return "project-" + createHmac("sha256", key).update(id).digest("hex").slice(0, 4);
}

function checkUncontestedNames(key: string, ids: string[]): void {
  const expected = ids.map((id) => firstName(key, id));
  // These fixtures have distinct initial names, so no suffix extension is needed.
  assert.equal(new Set(expected).size, ids.length);
  const registry = new NameRegistry(key);
  for (let i = 0; i < ids.length; i++) {
    assert.equal(registry.name(ids[i]), expected[i], ids[i]);
  }
}

// Extends public: uses project- and the first four lowercase HMAC digest characters.
test("[happy-1] derives names using several different secret keys", () => {
  for (const key of ["other-organization", "0", "org-secret ", "ORG-SECRET", "private-key-2026"]) {
    checkUncontestedNames(key, ["task-1", "task-2026", "release/alpha", "customer:17"]);
  }
});

// Extends public: names a single-character task id from its digest.
test("[happy-1] hashes other single-character ids including non-ASCII characters", () => {
  checkUncontestedNames("one-character-fixtures", ["b", "Z", "0", "/", "é", "界", "🦉"]);
});

test("[happy-1] preserves leading zeroes in the four-character hex suffix", () => {
  const registry = new NameRegistry("zero-key");
  assert.equal(registry.name("leading-zero-0"), "project-0c52");
  assert.equal(registry.name("leading-zero-188"), "project-0009");
});

test("[happy-1] handles keys below at and above the SHA256 HMAC block size", () => {
  for (const length of [63, 64, 65, 128, 257, 4096]) {
    const key = "K".repeat(length - 1) + "!";
    checkUncontestedNames(key, ["block-size-task", "block-size-task-2"]);
  }
});

test("[happy-1] hashes complete long ids including differences at the very end", () => {
  const prefix = "long/task/".repeat(1024);
  checkUncontestedNames("long-id-secret", [prefix, prefix + "a", prefix + "b", "界".repeat(4096)]);
});

test("[happy-1] treats case whitespace separators and embedded NULs as literal id content", () => {
  checkUncontestedNames("literal-id-secret", [
    "Ticket", "ticket", " ticket", "ticket ", "ticket\n", "ticket\t",
    "ticket/child", "ticket\\child", "ticket\0child", "ticket\0",
  ]);
});

test("[happy-1] hashes Unicode keys and ids without normalizing their spelling", () => {
  for (const key of ["组织/🔑", "café", "cafe\u0301", "secret\0tail"]) {
    checkUncontestedNames(key, ["café", "cafe\u0301", "任务/🦉", "\uFEFFtask"]);
  }
});

test("[happy-1] accepts ids that are inherited JavaScript object property names", () => {
  checkUncontestedNames("object-property-key", [
    "__proto__", "constructor", "toString", "hasOwnProperty", "valueOf", "prototype",
  ]);
});

// Extends public: returns the same name when a task is named again.
test("[happy-2] remembers many nonadjacent tasks during reverse and interleaved lookups", () => {
  const key = "persistent-lookup-key";
  const ids = Array.from({ length: 80 }, (_, i) => "remember-" + i);
  const expected = ids.map((id) => firstName(key, id));
  assert.equal(new Set(expected).size, ids.length);
  const registry = new NameRegistry(key);
  for (let i = 0; i < ids.length; i++) assert.equal(registry.name(ids[i]), expected[i]);
  for (let round = 0; round < 3; round++) {
    for (let i = ids.length - 1; i >= 0; i--) {
      assert.equal(registry.name(ids[i]), expected[i]);
      assert.equal(registry.name(ids[0]), expected[0]);
    }
  }
});

test("[happy-2] repeatedly reuses an id containing non-ASCII text and NUL", () => {
  const key = "repeat/秘密";
  const id = "任务\0tail";
  const registry = new NameRegistry(key);
  const expected = firstName(key, id);
  for (let i = 0; i < 128; i++) assert.equal(registry.name(id), expected);
});

test("[happy-2] repeats prototype-like task ids without losing their assignments", () => {
  const key = "prototype-repeat-key";
  const ids = ["__proto__", "constructor", "toString", "hasOwnProperty"];
  const expected = ids.map((id) => firstName(key, id));
  assert.equal(new Set(expected).size, ids.length);
  const registry = new NameRegistry(key);
  for (let round = 0; round < 4; round++) {
    for (let i = ids.length - 1; i >= 0; i--) assert.equal(registry.name(ids[i]), expected[i]);
  }
});
