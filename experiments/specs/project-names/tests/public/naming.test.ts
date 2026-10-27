import { test } from "node:test";
import assert from "node:assert/strict";
import { NameRegistry } from "../../src/index.js";

// Digests below are HMAC-SHA256 under key "org-secret", as lowercase hex.

test("a task's name is project- and the first four digest characters", () => {
  const registry = new NameRegistry("org-secret");
  // digest of "task-1": 63a93d98...
  assert.equal(registry.name("task-1"), "project-63a9");
});

test("leading zeros in the digest are kept in the name", () => {
  const registry = new NameRegistry("org-secret");
  // digest of "task-32": 002209ee...
  assert.equal(registry.name("task-32"), "project-0022");
});

test("the same task always gets the same name", () => {
  const registry = new NameRegistry("org-secret");
  registry.name("task-1");
  assert.equal(registry.name("task-1"), "project-63a9");
});

test("a task that got a longer suffix keeps it when named again", () => {
  const registry = new NameRegistry("org-secret");
  // "task-81" digest 139a1261..., "task-136" digest 139a1f83...
  registry.name("task-81");
  registry.name("task-136");
  assert.equal(registry.name("task-136"), "project-139a1f");
});
