import { test } from "node:test";
import assert from "node:assert/strict";
import { NameRegistry } from "../../src/index.js";

// Extends "a registry needs a key": refusing an empty key does not stop
// other registries from being created and used.
test("[unhappy-1] an empty key fails while a non-empty key still works", () => {
  assert.throws(() => new NameRegistry(""), Error);
  const registry = new NameRegistry("org-secret");
  assert.equal(registry.name("task-1"), "project-63a9");
  assert.throws(() => new NameRegistry(""), Error);
});

// Extends "a task needs an id": the registry is usable after the failure.
test("[unhappy-2] an empty task id fails and the registry stays usable", () => {
  const registry = new NameRegistry("org-secret");
  assert.throws(() => registry.name(""), Error);
  assert.equal(registry.name("task-1"), "project-63a9");
});

test("[unhappy-2] an empty task id fails after other tasks have been named", () => {
  const registry = new NameRegistry("org-secret");
  registry.name("task-81");
  registry.name("task-136");
  assert.throws(() => registry.name(""), Error);
  assert.throws(() => registry.name(""), Error);
  assert.equal(registry.name("task-81"), "project-139a");
  assert.equal(registry.name("task-136"), "project-139a1f");
});

test("[unhappy-2] a failed naming takes no name", () => {
  const registry = new NameRegistry("org-secret");
  assert.throws(() => registry.name(""), Error);
  assert.equal(registry.name("task-81"), "project-139a");
  assert.equal(registry.name("task-136"), "project-139a1f");
  assert.equal(registry.name("task-35411"), "project-674e");
});

test("[unhappy-2] an empty task id fails under another key", () => {
  const registry = new NameRegistry("k");
  assert.throws(() => registry.name(""), Error);
  assert.equal(registry.name("task-1"), "project-1380");
});
