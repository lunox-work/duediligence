import { test } from "node:test";
import assert from "node:assert/strict";
import { NameRegistry } from "../../src/index.js";

// Digests below are HMAC-SHA256 under key "org-secret", as lowercase hex:
//   task-81      139a1261...
//   task-136     139a1f83...
//   task-35411   674e9054...
//   task-1803    674ea82e...
//   task-9602    674ea80c...
//   task-105289  16d4ad32d52c...
//   task-144139  16d44d681af9...
//   task-153225  16d4af2f7f3e...
//   task-213793  16d4bf729b99...
//   task-8957597 16d4586e489c...
//   task-51869   16d458e790a2...
//   task-53615   16d458e76fc2...

// Extends "when six characters are also taken the suffix grows to eight":
// a fourth task needs ten characters.
test("[boundary-1] when eight characters are also taken the suffix grows to ten", () => {
  const registry = new NameRegistry("org-secret");
  assert.equal(registry.name("task-105289"), "project-16d4");
  assert.equal(registry.name("task-8957597"), "project-16d458");
  assert.equal(registry.name("task-51869"), "project-16d458e7");
  assert.equal(registry.name("task-53615"), "project-16d458e76f");
});

// Extends "a collision within an organization gets a six-character suffix":
// several tasks share four characters but not six, so each stops at six.
test("[boundary-1] several tasks sharing only four characters each get six", () => {
  const registry = new NameRegistry("org-secret");
  assert.equal(registry.name("task-105289"), "project-16d4");
  assert.equal(registry.name("task-144139"), "project-16d44d");
  assert.equal(registry.name("task-153225"), "project-16d4af");
  assert.equal(registry.name("task-213793"), "project-16d4bf");
  assert.equal(registry.name("task-51869"), "project-16d458");
});

// The suffix grows only while the name is taken: a six-character name is
// free even though another named task's digest starts with the same six
// characters, because that task holds only the four-character name.
test("[boundary-1] a longer name is free when the colliding task holds only the short one", () => {
  const registry = new NameRegistry("org-secret");
  assert.equal(registry.name("task-51869"), "project-16d4");
  assert.equal(registry.name("task-53615"), "project-16d458");
  assert.equal(registry.name("task-8957597"), "project-16d4586e");
});

test("[boundary-1] a third colliding task with a different sixth character gets six", () => {
  const registry = new NameRegistry("org-secret");
  assert.equal(registry.name("task-51869"), "project-16d4");
  assert.equal(registry.name("task-8957597"), "project-16d458");
  assert.equal(registry.name("task-105289"), "project-16d4ad");
  assert.equal(registry.name("task-53615"), "project-16d458e7");
});

test("[boundary-1] collisions in one group do not lengthen names in another", () => {
  const registry = new NameRegistry("org-secret");
  assert.equal(registry.name("task-81"), "project-139a");
  assert.equal(registry.name("task-105289"), "project-16d4");
  assert.equal(registry.name("task-136"), "project-139a1f");
  assert.equal(registry.name("task-35411"), "project-674e");
  assert.equal(registry.name("task-144139"), "project-16d44d");
  assert.equal(registry.name("task-1803"), "project-674ea8");
});

test("[boundary-1] tasks that collide under one key need not collide under another", () => {
  const registry = new NameRegistry("k");
  // under key "k": task-81 aad51449..., task-136 d9745632...
  assert.equal(registry.name("task-81"), "project-aad5");
  assert.equal(registry.name("task-136"), "project-d974");
});

// Extends "the task named first keeps its name": three and four colliding
// tasks, named again in another order.
test("[boundary-2] the first task keeps its name when a chain of collisions follows", () => {
  const registry = new NameRegistry("org-secret");
  registry.name("task-105289");
  registry.name("task-8957597");
  registry.name("task-51869");
  registry.name("task-53615");
  assert.equal(registry.name("task-105289"), "project-16d4");
  assert.equal(registry.name("task-8957597"), "project-16d458");
});

// Extends "whichever colliding task is named first keeps the short name":
// another group, reversed, so each task's length depends only on order.
test("[boundary-2] reversing the order of a collision chain reverses who keeps the short name", () => {
  const registry = new NameRegistry("org-secret");
  assert.equal(registry.name("task-53615"), "project-16d4");
  assert.equal(registry.name("task-51869"), "project-16d458");
  assert.equal(registry.name("task-8957597"), "project-16d4586e");
  assert.equal(registry.name("task-105289"), "project-16d4ad");
  assert.equal(registry.name("task-53615"), "project-16d4");
  assert.equal(registry.name("task-51869"), "project-16d458");
  assert.equal(registry.name("task-8957597"), "project-16d4586e");
});

test("[boundary-2] the first task keeps its name in the eight-character group", () => {
  const registry = new NameRegistry("org-secret");
  registry.name("task-9602");
  registry.name("task-1803");
  registry.name("task-35411");
  assert.equal(registry.name("task-9602"), "project-674e");
  assert.equal(registry.name("task-1803"), "project-674ea8");
  assert.equal(registry.name("task-35411"), "project-674e90");
});

// Extends "different organizations may hold the same name": every name of
// a collision chain is held in both organizations.
test("[boundary-3] two organizations each hold the whole collision chain", () => {
  const first = new NameRegistry("org-secret");
  const second = new NameRegistry("org-secret");
  for (const registry of [first, second]) {
    assert.equal(registry.name("task-105289"), "project-16d4");
    assert.equal(registry.name("task-8957597"), "project-16d458");
    assert.equal(registry.name("task-51869"), "project-16d458e7");
    assert.equal(registry.name("task-53615"), "project-16d458e76f");
  }
});

// Extends "names taken in another organization never lengthen a suffix".
test("[boundary-3] a chain named in one organization leaves a third organization untouched", () => {
  const first = new NameRegistry("org-secret");
  first.name("task-105289");
  first.name("task-8957597");
  first.name("task-51869");
  const second = new NameRegistry("org-secret");
  const third = new NameRegistry("org-secret");
  assert.equal(second.name("task-53615"), "project-16d4");
  assert.equal(third.name("task-51869"), "project-16d4");
  assert.equal(third.name("task-53615"), "project-16d458");
  assert.equal(first.name("task-53615"), "project-16d458e76f");
});

test("[boundary-3] organizations with different keys may hold the same name", () => {
  const first = new NameRegistry("org-secret");
  const second = new NameRegistry("k");
  // task-1 is "project-1380" under key "k"; task-81 is "project-139a"
  // under "org-secret". Each registry's names stay its own.
  assert.equal(second.name("task-1"), "project-1380");
  assert.equal(first.name("task-81"), "project-139a");
  assert.equal(first.name("task-136"), "project-139a1f");
  assert.equal(second.name("task-81"), "project-aad5");
});
