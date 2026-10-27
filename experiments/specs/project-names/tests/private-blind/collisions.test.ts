import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NameRegistry } from "../../src/index.js";

function digest(key: string, taskId: string): string {
  return createHmac("sha256", key).update(taskId).digest("hex");
}

function nameOf(key: string, taskId: string, chars: number): string {
  return "project-" + digest(key, taskId).slice(0, chars);
}

// Under "acme-key":
//   job-104, job-306, job-1973 share the first four digest characters
//   but differ in the first six.
//   job-2204 and job-7653 share the first six digest characters (but not
//   eight); job-x10649 shares only their first four.
const ACME = "acme-key";

test("acme-key fixtures collide as the tests assume", () => {
  const p = (id: string, n: number) => digest(ACME, id).slice(0, n);
  assert.equal(p("job-104", 4), p("job-306", 4));
  assert.equal(p("job-104", 4), p("job-1973", 4));
  assert.equal(new Set([p("job-104", 6), p("job-306", 6), p("job-1973", 6)]).size, 3);
  assert.equal(p("job-2204", 6), p("job-7653", 6));
  assert.notEqual(p("job-2204", 8), p("job-7653", 8));
  assert.equal(p("job-x10649", 4), p("job-2204", 4));
  assert.notEqual(p("job-x10649", 6), p("job-2204", 6));
  // The naming itself must work for this check to count.
  const registry = new NameRegistry(ACME);
  assert.equal(registry.name("job-104"), nameOf(ACME, "job-104", 4));
});

test("spec example: task-136 after task-81 under org-secret is named project-139a1f", () => {
  const registry = new NameRegistry("org-secret");
  assert.equal(registry.name("task-81"), "project-139a");
  assert.equal(registry.name("task-136"), "project-139a1f");
});

test("spec example: task-81 named first keeps project-139a after task-136 is named", () => {
  const registry = new NameRegistry("org-secret");
  registry.name("task-81");
  registry.name("task-136");
  assert.equal(registry.name("task-81"), "project-139a");
});

test("the task that got a longer name keeps it when named again", () => {
  const registry = new NameRegistry("org-secret");
  registry.name("task-81");
  registry.name("task-136");
  assert.equal(registry.name("task-136"), "project-139a1f");
  assert.equal(registry.name("task-81"), "project-139a");
  assert.equal(registry.name("task-136"), "project-139a1f");
});

test("reverse order under org-secret: task-136 first gets project-139a, task-81 gets project-139a12", () => {
  const registry = new NameRegistry("org-secret");
  assert.equal(registry.name("task-136"), "project-139a");
  assert.equal(registry.name("task-81"), "project-139a12");
  assert.equal(registry.name("task-136"), "project-139a");
  assert.equal(registry.name("task-81"), "project-139a12");
});

test("three tasks sharing four digest characters: the first gets four, the others six", () => {
  const registry = new NameRegistry(ACME);
  assert.equal(registry.name("job-306"), nameOf(ACME, "job-306", 4));
  assert.equal(registry.name("job-1973"), nameOf(ACME, "job-1973", 6));
  assert.equal(registry.name("job-104"), nameOf(ACME, "job-104", 6));
});

test("three colliding tasks in another order: whichever is named first gets the short name", () => {
  const registry = new NameRegistry(ACME);
  assert.equal(registry.name("job-1973"), nameOf(ACME, "job-1973", 4));
  assert.equal(registry.name("job-104"), nameOf(ACME, "job-104", 6));
  assert.equal(registry.name("job-306"), nameOf(ACME, "job-306", 6));
  assert.equal(registry.name("job-1973"), nameOf(ACME, "job-1973", 4));
  assert.equal(registry.name("job-104"), nameOf(ACME, "job-104", 6));
  assert.equal(registry.name("job-306"), nameOf(ACME, "job-306", 6));
});

test("the suffix grows to eight characters when the four- and six-character names are taken", () => {
  const registry = new NameRegistry(ACME);
  assert.equal(registry.name("job-x10649"), nameOf(ACME, "job-x10649", 4));
  assert.equal(registry.name("job-2204"), nameOf(ACME, "job-2204", 6));
  assert.equal(registry.name("job-7653"), nameOf(ACME, "job-7653", 8));
  assert.match(registry.name("job-7653"), /^project-[0-9a-f]{8}$/);
  assert.equal(registry.name("job-x10649"), nameOf(ACME, "job-x10649", 4));
  assert.equal(registry.name("job-2204"), nameOf(ACME, "job-2204", 6));
  assert.equal(registry.name("job-7653"), nameOf(ACME, "job-7653", 8));
});

test("the suffix stops at the first free length, not at the number of earlier collisions", () => {
  const registry = new NameRegistry(ACME);
  assert.equal(registry.name("job-7653"), nameOf(ACME, "job-7653", 4));
  assert.equal(registry.name("job-x10649"), nameOf(ACME, "job-x10649", 6));
  // Two earlier tasks share its first four characters, but its six-character name is free.
  assert.equal(registry.name("job-2204"), nameOf(ACME, "job-2204", 6));
});

test("a six-character collision without the eight-character step when only two tasks are involved", () => {
  const registry = new NameRegistry(ACME);
  assert.equal(registry.name("job-2204"), nameOf(ACME, "job-2204", 4));
  assert.equal(registry.name("job-7653"), nameOf(ACME, "job-7653", 6));
  assert.equal(registry.name("job-x10649"), nameOf(ACME, "job-x10649", 6));
});

test("a non-colliding task named among colliding ones still gets four characters", () => {
  const registry = new NameRegistry("org-secret");
  registry.name("task-81");
  registry.name("task-136");
  assert.equal(registry.name("task-1"), "project-63a9");
});

test("all names handed out by one registry are distinct", () => {
  const registry = new NameRegistry(ACME);
  const ids = ["job-104", "job-306", "job-1973", "job-2204", "job-7653", "job-x10649", "job-1", "job-2"];
  const names = ids.map((id) => registry.name(id));
  assert.equal(new Set(names).size, ids.length);
});

test("spec example: two org-secret registries may both hold project-139a", () => {
  const first = new NameRegistry("org-secret");
  const second = new NameRegistry("org-secret");
  assert.equal(first.name("task-81"), "project-139a");
  assert.equal(second.name("task-136"), "project-139a");
});

test("names taken in one registry do not affect another, even when calls interleave", () => {
  const first = new NameRegistry(ACME);
  const second = new NameRegistry(ACME);
  assert.equal(first.name("job-306"), nameOf(ACME, "job-306", 4));
  assert.equal(second.name("job-104"), nameOf(ACME, "job-104", 4));
  assert.equal(first.name("job-104"), nameOf(ACME, "job-104", 6));
  assert.equal(second.name("job-306"), nameOf(ACME, "job-306", 6));
  assert.equal(second.name("job-1973"), nameOf(ACME, "job-1973", 6));
  const third = new NameRegistry(ACME);
  assert.equal(third.name("job-1973"), nameOf(ACME, "job-1973", 4));
});
