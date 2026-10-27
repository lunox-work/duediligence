import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NameRegistry } from "../../src/index.js";

function shortName(key: string, taskId: string): string {
  return "project-" + createHmac("sha256", key).update(taskId).digest("hex").slice(0, 4);
}

test("spec example: creating a registry with an empty key fails, while a non-empty key works", () => {
  const ok = new NameRegistry("org-secret");
  assert.equal(ok.name("task-1"), "project-63a9");
  assert.throws(() => new NameRegistry(""), (err: unknown) => err instanceof Error);
});

test("a one-character key is accepted, the empty key is not", () => {
  const registry = new NameRegistry("z");
  assert.equal(registry.name("job-3"), shortName("z", "job-3"));
  assert.throws(() => new NameRegistry(""), (err: unknown) => err instanceof Error);
});

test("spec example: naming a task with an empty id fails", () => {
  const registry = new NameRegistry("org-secret");
  assert.throws(() => registry.name(""), (err: unknown) => err instanceof Error);
});

test("an empty id fails in a registry with another key that has already named tasks", () => {
  const registry = new NameRegistry("acme-key");
  assert.equal(registry.name("job-104"), shortName("acme-key", "job-104"));
  assert.throws(() => registry.name(""), (err: unknown) => err instanceof Error);
});

test("a one-character task id is accepted", () => {
  const registry = new NameRegistry("other-key");
  assert.equal(registry.name("a"), shortName("other-key", "a"));
});
