import { test } from "node:test";
import assert from "node:assert/strict";
import { NameRegistry } from "../../src/index.js";

// Digests below are HMAC-SHA256 under key "org-secret", as lowercase hex:
//   task-81    139a1261...
//   task-136   139a1f83...
//   task-35411 674e9054...
//   task-1803  674ea82e...
//   task-9602  674ea80c...

test("a collision within an organization gets a six-character suffix", () => {
  const registry = new NameRegistry("org-secret");
  assert.equal(registry.name("task-81"), "project-139a");
  assert.equal(registry.name("task-136"), "project-139a1f");
});

test("when six characters are also taken the suffix grows to eight", () => {
  const registry = new NameRegistry("org-secret");
  assert.equal(registry.name("task-35411"), "project-674e");
  assert.equal(registry.name("task-1803"), "project-674ea8");
  assert.equal(registry.name("task-9602"), "project-674ea80c");
});

test("the task named first keeps its name", () => {
  const registry = new NameRegistry("org-secret");
  registry.name("task-81");
  registry.name("task-136");
  assert.equal(registry.name("task-81"), "project-139a");
});

test("whichever colliding task is named first keeps the short name", () => {
  const registry = new NameRegistry("org-secret");
  assert.equal(registry.name("task-136"), "project-139a");
  assert.equal(registry.name("task-81"), "project-139a12");
  assert.equal(registry.name("task-136"), "project-139a");
});

test("different organizations may hold the same name", () => {
  const first = new NameRegistry("org-secret");
  const second = new NameRegistry("org-secret");
  first.name("task-81");
  assert.equal(second.name("task-136"), "project-139a");
});

test("names taken in another organization never lengthen a suffix", () => {
  const first = new NameRegistry("org-secret");
  const second = new NameRegistry("org-secret");
  second.name("task-136");
  second.name("task-81");
  assert.equal(first.name("task-81"), "project-139a");
  assert.equal(first.name("task-136"), "project-139a1f");
});
