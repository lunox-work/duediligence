import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NameRegistry } from "../../src/index.js";

function digest(key: string, taskId: string): string {
  return createHmac("sha256", key).update(taskId).digest("hex");
}

function shortName(key: string, taskId: string): string {
  return "project-" + digest(key, taskId).slice(0, 4);
}

// Picks task ids whose first four digest characters are all distinct, so
// none of them collides with another.
function distinctTasks(key: string, from: number, count: number): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (let i = from; ids.length < count; i++) {
    const id = "task-" + i;
    const prefix = digest(key, id).slice(0, 4);
    if (seen.has(prefix)) continue;
    seen.add(prefix);
    ids.push(id);
  }
  return ids;
}

// Extends "a task's name is project- and the first four digest characters":
// other task ids, each computed from the definition.
test("[happy-1] many task ids are each named from their own digest", () => {
  const registry = new NameRegistry("org-secret");
  for (const id of distinctTasks("org-secret", 1000, 150)) {
    assert.equal(registry.name(id), shortName("org-secret", id), id);
  }
});

// Extends "a task's name is project- and the first four digest characters":
// a name is derived from the registry's own key, not a fixed one.
test("[happy-1] the name depends on the registry's key", () => {
  const registry = new NameRegistry("acme-key");
  assert.equal(registry.name("task-1"), shortName("acme-key", "task-1"));
  assert.equal(registry.name("task-77"), shortName("acme-key", "task-77"));
  assert.notEqual(shortName("acme-key", "task-1"), "project-63a9");
});

test("[happy-1] the same task gets different names under different keys", () => {
  const a = new NameRegistry("org-secret");
  const b = new NameRegistry("k");
  assert.equal(a.name("task-81"), "project-139a");
  assert.equal(b.name("task-81"), "project-aad5");
  assert.equal(b.name("task-136"), "project-d974");
});

// Extends "a one-character key is enough to create a registry": a key
// longer than the HMAC block size.
test("[happy-1] a long key is used as an HMAC key", () => {
  const key = "K".repeat(100);
  const registry = new NameRegistry(key);
  // HMAC-SHA256 of "task-1" under that key: bc47e9e2...
  assert.equal(registry.name("task-1"), "project-bc47");
});

test("[happy-1] a key of a single space is not empty", () => {
  const registry = new NameRegistry(" ");
  // HMAC-SHA256 of "task-1" under key " ": b4c884b1...
  assert.equal(registry.name("task-1"), "project-b4c8");
});

// Extends "a one-character task id is named".
test("[happy-1] a task id of a single space is not empty", () => {
  const registry = new NameRegistry("org-secret");
  // HMAC-SHA256 of " " under key "org-secret": 370c6cc6...
  assert.equal(registry.name(" "), "project-370c");
});

test("[happy-1] a long task id is named from its digest", () => {
  const registry = new NameRegistry("org-secret");
  const id = "task-" + "abcdefghij".repeat(200);
  assert.equal(registry.name(id), shortName("org-secret", id));
});

// Extends "leading zeros in the digest are kept in the name".
test("[happy-1] three leading zeros in the digest are kept in the name", () => {
  const registry = new NameRegistry("org-secret");
  // digest of "task-365": 0006629f...
  assert.equal(registry.name("task-365"), "project-0006");
});

test("[happy-1] leading zeros are kept under another key", () => {
  const registry = new NameRegistry("acme-key");
  // HMAC-SHA256 of "task-52" under key "acme-key": 00137508...
  assert.equal(registry.name("task-52"), "project-0013");
});

test("[happy-1] a name is lowercase hex", () => {
  const registry = new NameRegistry("org-secret");
  for (const id of distinctTasks("org-secret", 5000, 40)) {
    assert.match(registry.name(id), /^project-[0-9a-f]{4}$/);
  }
});

// Extends "the same task always gets the same name": other tasks, named
// many times, interleaved with each other.
test("[happy-2] tasks named repeatedly in interleaved order keep their names", () => {
  const registry = new NameRegistry("org-secret");
  const ids = distinctTasks("org-secret", 2000, 30);
  for (const id of ids) registry.name(id);
  for (let round = 0; round < 3; round++) {
    for (const id of [...ids].reverse()) {
      assert.equal(registry.name(id), shortName("org-secret", id), id);
    }
  }
});

test("[happy-2] naming a task again does not take another name", () => {
  const registry = new NameRegistry("org-secret");
  registry.name("task-81");
  registry.name("task-81");
  registry.name("task-81");
  // "task-136" shares only the four-character name with "task-81", so it
  // gets six characters, not more.
  assert.equal(registry.name("task-136"), "project-139a1f");
});

test("[happy-2] the same task gets the same name in two registries with the same key", () => {
  const first = new NameRegistry("org-secret");
  const second = new NameRegistry("org-secret");
  assert.equal(first.name("x"), "project-dd25");
  assert.equal(second.name("x"), "project-dd25");
  assert.equal(first.name("x"), "project-dd25");
});

// Extends "a task that got a longer suffix keeps it when named again":
// eight- and ten-character names, named again after further tasks.
test("[happy-2] tasks with eight- and ten-character names keep them when named again", () => {
  const registry = new NameRegistry("org-secret");
  // digests: task-105289 16d4ad32..., task-8957597 16d4586e...,
  //          task-51869 16d458e790..., task-53615 16d458e76f...
  registry.name("task-105289");
  registry.name("task-8957597");
  registry.name("task-51869");
  registry.name("task-53615");
  registry.name("task-1");
  assert.equal(registry.name("task-53615"), "project-16d458e76f");
  assert.equal(registry.name("task-51869"), "project-16d458e7");
  assert.equal(registry.name("task-8957597"), "project-16d458");
  assert.equal(registry.name("task-105289"), "project-16d4");
});
