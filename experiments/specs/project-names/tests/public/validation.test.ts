import { test } from "node:test";
import assert from "node:assert/strict";
import { NameRegistry } from "../../src/index.js";

test("a registry needs a key", () => {
  assert.throws(() => new NameRegistry(""), Error);
});

test("a one-character key is enough to create a registry", () => {
  const registry = new NameRegistry("k");
  // HMAC-SHA256 of "task-1" under key "k": 1380f150...
  assert.equal(registry.name("task-1"), "project-1380");
});

test("a task needs an id", () => {
  const registry = new NameRegistry("org-secret");
  assert.throws(() => registry.name(""), Error);
});

test("a one-character task id is named", () => {
  const registry = new NameRegistry("org-secret");
  // HMAC-SHA256 of "x" under key "org-secret": dd2586f2...
  assert.equal(registry.name("x"), "project-dd25");
});
