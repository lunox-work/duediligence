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

test("spec example: task-1 under org-secret is named project-63a9", () => {
  const registry = new NameRegistry("org-secret");
  assert.equal(registry.name("task-1"), "project-63a9");
});

test("name is project- and the first four HMAC-SHA256 hex characters for other keys and ids", () => {
  const cases: Array<[string, string]> = [
    ["acme-key", "task-2"],
    ["k", "x"],
    ["another secret with spaces", "PROJ-42/alpha"],
    ["org-secret", "task-999"],
    ["ORG-SECRET", "task-1"],
    ["s3cr3t!", "t".repeat(500)],
  ];
  for (const [key, taskId] of cases) {
    const registry = new NameRegistry(key);
    assert.equal(registry.name(taskId), shortName(key, taskId), `${key} / ${taskId}`);
  }
});

test("a first name is project- followed by exactly four lowercase hex characters", () => {
  const registry = new NameRegistry("format-key");
  const name = registry.name("Task-ABC");
  assert.match(name, /^project-[0-9a-f]{4}$/);
});

test("the key determines the name: the same task under two keys follows each key's digest", () => {
  const taskId = "task-7";
  const a = new NameRegistry("key-one");
  const b = new NameRegistry("key-two");
  assert.notEqual(shortName("key-one", taskId), shortName("key-two", taskId));
  assert.equal(a.name(taskId), shortName("key-one", taskId));
  assert.equal(b.name(taskId), shortName("key-two", taskId));
});

test("many tasks whose first four digest characters differ each get a four-character name", () => {
  const key = "bulk-key";
  const ids: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; ids.length < 40; i++) {
    const id = `item-${i}`;
    const prefix = digest(key, id).slice(0, 4);
    if (seen.has(prefix)) continue;
    seen.add(prefix);
    ids.push(id);
  }
  const registry = new NameRegistry(key);
  for (const id of ids) {
    assert.equal(registry.name(id), shortName(key, id), id);
  }
});

test("spec example: task-1 named again under org-secret is still project-63a9", () => {
  const registry = new NameRegistry("org-secret");
  registry.name("task-1");
  assert.equal(registry.name("task-1"), "project-63a9");
});

test("a task named repeatedly, with other tasks named in between, always gets its first name", () => {
  const key = "repeat-key";
  const registry = new NameRegistry(key);
  const first = registry.name("alpha");
  assert.equal(first, shortName(key, "alpha"));
  registry.name("beta");
  assert.equal(registry.name("alpha"), first);
  registry.name("gamma");
  registry.name("beta");
  assert.equal(registry.name("alpha"), first);
  assert.equal(registry.name("alpha"), first);
  assert.equal(registry.name("beta"), shortName(key, "beta"));
  assert.equal(registry.name("gamma"), shortName(key, "gamma"));
});

test("two registries with the same key give a task the same name", () => {
  const a = new NameRegistry("shared-key");
  const b = new NameRegistry("shared-key");
  const name = a.name("job-55");
  assert.equal(name, shortName("shared-key", "job-55"));
  assert.equal(b.name("job-55"), name);
});
