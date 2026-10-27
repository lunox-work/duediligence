import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NameRegistry } from "../../src/index.js";

function firstName(key: string, id: string): string {
  return "project-" + createHmac("sha256", key).update(id).digest("hex").slice(0, 4);
}

// The spec requires errors but does not specify their message or subclass.
// Check Error, as the public suite does, and combine rejections with successful
// operations so that an implementation which always throws cannot pass.

// Extends public: rejects an empty registry key with an error.
test("[unhappy-1] rejects empty keys between successful constructions using other keys", () => {
  for (const key of ["validation-first", "validation-second", "validation-third"]) {
    const registry = new NameRegistry(key);
    assert.equal(registry.name("valid-task"), firstName(key, "valid-task"));
    assert.throws(() => new NameRegistry(""), Error);
    assert.equal(registry.name("valid-task"), firstName(key, "valid-task"));
  }
});

test("[unhappy-1] repeated failed constructions leave an existing collision registry usable", () => {
  const registry = new NameRegistry("private-collision-key");
  assert.equal(registry.name("four-prefix-82686"), "project-c2be");
  for (let i = 0; i < 4; i++) assert.throws(() => new NameRegistry(""), Error);
  assert.equal(registry.name("hidden-task-254881"), "project-c2be09");
  assert.equal(registry.name("four-prefix-82686"), "project-c2be");
});

// Extends public: accepts a single-character key and uses it for the digest.
test("[unhappy-1] accepts other minimal keys and hashes whitespace and NUL keys literally", () => {
  for (const key of ["x", "0", "é", "界", " ", "\t", "\n", "\0", " \t\r\n "]) {
    const registry = new NameRegistry(key);
    assert.equal(registry.name("nonempty-id"), firstName(key, "nonempty-id"));
  }
});

// Extends public: rejects an empty task id with an error.
test("[unhappy-2] rejects repeated empty ids before and between successful names under different keys", () => {
  for (const key of ["validation-a", "validation-b", "秘密"]) {
    const registry = new NameRegistry(key);
    assert.throws(() => registry.name(""), Error);
    assert.equal(registry.name("valid-id"), firstName(key, "valid-id"));
    assert.throws(() => registry.name(""), Error);
    assert.throws(() => registry.name(""), Error);
    assert.equal(registry.name("valid-id"), firstName(key, "valid-id"));
    assert.equal(registry.name("another-valid-id"), firstName(key, "another-valid-id"));
  }
});

test("[unhappy-2] rejecting empty ids preserves occupied names and permits further collision extensions", () => {
  const registry = new NameRegistry("private-collision-key");
  assert.equal(registry.name("four-prefix-82686"), "project-c2be");
  assert.equal(registry.name("hidden-task-254881"), "project-c2be09");
  assert.throws(() => registry.name(""), Error);
  assert.equal(registry.name("hidden-task-548456"), "project-c2be09e0");
  assert.throws(() => registry.name(""), Error);
  assert.equal(registry.name("hidden-task-561148"), "project-c2be09e034");
  assert.equal(registry.name("four-prefix-82686"), "project-c2be");
  assert.equal(registry.name("hidden-task-254881"), "project-c2be09");
});

// Extends public: accepts a space as a nonempty task id and hashes it literally.
test("[unhappy-2] accepts longer whitespace-only ids and NUL without treating them as empty", () => {
  const key = "whitespace-id-key";
  const ids = ["  ", "\t", "\n", "\r\n", " \t ", "\0", "\u00A0", "\u2003"];
  const expected = ids.map((id) => firstName(key, id));
  assert.equal(new Set(expected).size, ids.length);
  const registry = new NameRegistry(key);
  for (let i = 0; i < ids.length; i++) {
    assert.equal(registry.name(ids[i]), expected[i]);
    assert.throws(() => registry.name(""), Error);
    assert.equal(registry.name(ids[i]), expected[i]);
  }
});
