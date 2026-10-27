import { test } from "node:test";
import assert from "node:assert/strict";
import { NameRegistry } from "../../src/index.js";

test("[happy-1] uses project- and the first four lowercase HMAC digest characters", () => {
  const registry = new NameRegistry("org-secret");

  assert.equal(registry.name("task-1"), "project-63a9");
});

test("[happy-1] names a single-character task id from its digest", () => {
  const registry = new NameRegistry("org-secret");

  assert.equal(registry.name("a"), "project-66a2");
});

test("[happy-2] returns the same name when a task is named again", () => {
  const registry = new NameRegistry("org-secret");
  assert.equal(registry.name("task-1"), "project-63a9");

  assert.equal(registry.name("task-1"), "project-63a9");
});

test("[happy-2] reuses an extended name without treating the task as a new collision", () => {
  const registry = new NameRegistry("org-secret");
  assert.equal(registry.name("task-81"), "project-139a");
  assert.equal(registry.name("task-136"), "project-139a1f");

  assert.equal(registry.name("task-136"), "project-139a1f");
  assert.equal(registry.name("task-136"), "project-139a1f");
});

test("[boundary-1] extends a colliding suffix from four to six characters", () => {
  const registry = new NameRegistry("org-secret");
  assert.equal(registry.name("task-81"), "project-139a");

  assert.equal(registry.name("task-136"), "project-139a1f");
});

test("[boundary-1] extends to eight characters when both shorter names are occupied", () => {
  const registry = new NameRegistry("org-secret");
  // Fixed HMAC-SHA256 prefixes under org-secret:
  // task-35411: 674e9054, task-1803: 674ea82e, task-9602: 674ea80c.
  assert.equal(registry.name("task-35411"), "project-674e");
  assert.equal(registry.name("task-1803"), "project-674ea8");

  assert.equal(registry.name("task-9602"), "project-674ea80c");
});

test("[boundary-2] preserves the first task's name after a collision", () => {
  const registry = new NameRegistry("org-secret");
  assert.equal(registry.name("task-81"), "project-139a");
  assert.equal(registry.name("task-136"), "project-139a1f");

  assert.equal(registry.name("task-81"), "project-139a");
});

test("[boundary-2] preserves the first task's name when collision order is reversed", () => {
  const registry = new NameRegistry("org-secret");
  assert.equal(registry.name("task-136"), "project-139a");
  assert.equal(registry.name("task-81"), "project-139a12");

  assert.equal(registry.name("task-136"), "project-139a");
});

test("[boundary-3] allows different tasks in separate registries to share a name", () => {
  const first = new NameRegistry("org-secret");
  const second = new NameRegistry("org-secret");
  assert.equal(first.name("task-81"), "project-139a");

  assert.equal(second.name("task-136"), "project-139a");
});

test("[boundary-3] allocates colliding names independently in both registries", () => {
  const first = new NameRegistry("org-secret");
  const second = new NameRegistry("org-secret");
  assert.equal(first.name("task-81"), "project-139a");
  assert.equal(first.name("task-136"), "project-139a1f");

  assert.equal(second.name("task-81"), "project-139a");
  assert.equal(second.name("task-136"), "project-139a1f");
});

test("[unhappy-1] rejects an empty registry key with an error", () => {
  assert.throws(() => new NameRegistry(""), Error);
});

test("[unhappy-1] accepts a single-character key and uses it for the digest", () => {
  const registry = new NameRegistry("k");

  assert.equal(registry.name("a"), "project-78da");
});

test("[unhappy-2] rejects an empty task id with an error", () => {
  const registry = new NameRegistry("org-secret");

  assert.throws(() => registry.name(""), Error);
});

test("[unhappy-2] accepts a space as a nonempty task id and hashes it literally", () => {
  const registry = new NameRegistry("org-secret");

  assert.equal(registry.name(" "), "project-370c");
});
