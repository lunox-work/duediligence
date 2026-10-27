import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NameRegistry } from "../../src/index.js";

const KEY = "private-collision-key";
// Fixed HMAC-SHA256 prefixes under KEY. No searching or randomness at test time.
const A = "four-prefix-82686"; // c2be740231...
const B = "hidden-task-254881"; // c2be09098f...
const C = "hidden-task-548456"; // c2be09e0f5...
const D = "hidden-task-561148"; // c2be09e034...

function digest(key: string, id: string): string {
  return createHmac("sha256", key).update(id).digest("hex");
}

// An independent expected allocation table, derived only from digests and
// previously occupied complete names. Used for larger fixed input sequences.
function allocations(key: string, ids: string[]): Map<string, string> {
  const result = new Map<string, string>();
  const occupied = new Set<string>();
  for (const id of ids) {
    const hex = digest(key, id);
    const candidates = Array.from({ length: 31 }, (_, i) => "project-" + hex.slice(0, 4 + 2 * i));
    const available = candidates.find((candidate) => !occupied.has(candidate));
    assert.ok(available !== undefined, "fixture must have an available digest prefix");
    result.set(id, available!);
    occupied.add(available!);
  }
  return result;
}

// Extends public: extends a colliding suffix from four to six characters.
test("[boundary-1] extends a different collision pair under a different key", () => {
  const registry = new NameRegistry(KEY);
  assert.equal(registry.name(A), "project-c2be");
  assert.equal(registry.name(B), "project-c2be09");
});

test("[boundary-1] extends each later task using its own digest rather than a collision counter", () => {
  const registry = new NameRegistry(KEY);
  assert.equal(registry.name(B), "project-c2be");
  assert.equal(registry.name(A), "project-c2be74");
  assert.equal(registry.name(C), "project-c2be09");
});

// Extends public: extends to eight characters when both shorter names are occupied.
test("[boundary-1] reaches eight characters for an unrelated three-task collision", () => {
  const registry = new NameRegistry(KEY);
  assert.equal(registry.name(A), "project-c2be");
  assert.equal(registry.name(B), "project-c2be09");
  assert.equal(registry.name(C), "project-c2be09e0");
});

test("[boundary-1] continues through an occupied eight-character name to ten characters", () => {
  const registry = new NameRegistry(KEY);
  assert.equal(registry.name(A), "project-c2be");
  assert.equal(registry.name(B), "project-c2be09");
  assert.equal(registry.name(C), "project-c2be09e0");
  assert.equal(registry.name(D), "project-c2be09e034");
});

test("[boundary-1] uses the other task's ten-character prefix when the deepest pair is reversed", () => {
  const registry = new NameRegistry(KEY);
  assert.equal(registry.name(A), "project-c2be");
  assert.equal(registry.name(B), "project-c2be09");
  assert.equal(registry.name(D), "project-c2be09e0");
  assert.equal(registry.name(C), "project-c2be09e0f5");
});

test("[boundary-1] stops at a free eight-character name even if another digest shares that prefix", () => {
  const registry = new NameRegistry(KEY);
  assert.equal(registry.name(A), "project-c2be");
  assert.equal(registry.name(C), "project-c2be09");
  assert.equal(registry.name(D), "project-c2be09e0");
});

test("[boundary-1] uses six characters when a shared eight-character prefix has not been allocated", () => {
  const registry = new NameRegistry(KEY);
  assert.equal(registry.name(C), "project-c2be");
  assert.equal(registry.name(D), "project-c2be09");
});

test("[boundary-1] starts unrelated task names at four characters after a deep collision", () => {
  const registry = new NameRegistry(KEY);
  for (const id of [A, B, C, D]) registry.name(id);
  const id = "independent-after-deep-collision";
  const prefix = digest(KEY, id).slice(0, 4);
  assert.notEqual(prefix, "c2be");
  assert.equal(registry.name(id), "project-" + prefix);
});

test("[boundary-1] allocates the shortest free names across all 24 orders of a collision group", () => {
  const ids = [A, B, C, D];
  for (const first of ids) {
    for (const second of ids.filter((id) => id !== first)) {
      for (const third of ids.filter((id) => id !== first && id !== second)) {
        const fourth = ids.find((id) => id !== first && id !== second && id !== third)!;
        const order = [first, second, third, fourth];
        const expected = allocations(KEY, order);
        const registry = new NameRegistry(KEY);
        for (const id of order) assert.equal(registry.name(id), expected.get(id), order.join(","));
      }
    }
  }
});

test("[boundary-1] handles thousands of tasks and collisions spread across many prefixes", () => {
  const key = "large-registry-key";
  const ids = Array.from({ length: 4096 }, (_, i) => "bulk-task-" + i);
  const expected = allocations(key, ids);
  assert.ok([...expected.values()].some((name) => name.length > "project-".length + 4));
  const registry = new NameRegistry(key);
  for (const id of ids) assert.equal(registry.name(id), expected.get(id), id);
  for (let i = ids.length - 1; i >= 0; i--) assert.equal(registry.name(ids[i]), expected.get(ids[i]));
});

// Extends public: reuses an extended name without treating the task as a new collision.
test("[happy-2] remembers a ten-character assignment during many interleaved collision lookups", () => {
  const registry = new NameRegistry(KEY);
  const order = [A, B, C, D];
  const names = ["project-c2be", "project-c2be09", "project-c2be09e0", "project-c2be09e034"];
  for (let i = 0; i < order.length; i++) assert.equal(registry.name(order[i]), names[i]);
  for (let round = 0; round < 32; round++) {
    assert.equal(registry.name(D), names[3]);
    assert.equal(registry.name(B), names[1]);
    assert.equal(registry.name(C), names[2]);
    assert.equal(registry.name(A), names[0]);
  }
});

// Extends public: preserves the first task's name after a collision.
test("[boundary-2] preserves the first allocation after three later tasks extend to ten characters", () => {
  const registry = new NameRegistry(KEY);
  assert.equal(registry.name(A), "project-c2be");
  for (const id of [B, C, D]) {
    registry.name(id);
    assert.equal(registry.name(A), "project-c2be");
  }
});

// Extends public: preserves the first task's name when collision order is reversed.
test("[boundary-2] preserves the first task and every later assignment in reverse four-task order", () => {
  const registry = new NameRegistry(KEY);
  const order = [D, C, B, A];
  const names = ["project-c2be", "project-c2be09", "project-c2be0909", "project-c2be74"];
  for (let i = 0; i < order.length; i++) {
    assert.equal(registry.name(order[i]), names[i]);
    for (let j = 0; j <= i; j++) assert.equal(registry.name(order[j]), names[j]);
  }
});

// Extends public: allows different tasks in separate registries to share a name.
test("[boundary-3] lets four interleaved registries give different tasks the same initial name", () => {
  const registries = [new NameRegistry(KEY), new NameRegistry(KEY), new NameRegistry(KEY), new NameRegistry(KEY)];
  const ids = [A, B, C, D];
  for (let i = 0; i < ids.length; i++) assert.equal(registries[i].name(ids[i]), "project-c2be");
  for (let i = ids.length - 1; i >= 0; i--) assert.equal(registries[i].name(ids[i]), "project-c2be");
});

// Extends public: allocates colliding names independently in both registries.
test("[boundary-3] independently allocates four colliding tasks in opposite interleaved orders", () => {
  const first = new NameRegistry(KEY);
  const second = new NameRegistry(KEY);
  const forward = [A, B, C, D];
  const reverse = [D, C, B, A];
  const firstNames = ["project-c2be", "project-c2be09", "project-c2be09e0", "project-c2be09e034"];
  const secondNames = ["project-c2be", "project-c2be09", "project-c2be0909", "project-c2be74"];
  for (let i = 0; i < forward.length; i++) {
    assert.equal(first.name(forward[i]), firstNames[i]);
    assert.equal(second.name(reverse[i]), secondNames[i]);
  }
  for (let i = forward.length - 1; i >= 0; i--) {
    assert.equal(first.name(forward[i]), firstNames[i]);
    assert.equal(second.name(reverse[i]), secondNames[i]);
  }
});

test("[boundary-3] creating a fresh registry neither inherits nor clears existing allocations", () => {
  const old = new NameRegistry(KEY);
  const ids = [A, B, C, D];
  const expected = allocations(KEY, ids);
  for (const id of ids) assert.equal(old.name(id), expected.get(id));
  const fresh = new NameRegistry(KEY);
  assert.equal(fresh.name(D), "project-c2be");
  for (const id of ids) assert.equal(old.name(id), expected.get(id));
  assert.equal(fresh.name(C), "project-c2be09");
});

test("[boundary-3] each registry retains its own secret when differently keyed registries are interleaved", () => {
  const keys = ["organization-one", "organization-two", "organization-three"];
  const registries = keys.map((key) => new NameRegistry(key));
  const ids = ["shared-task", "shared-task-2", "shared-task-3"];
  const tables = keys.map((key) => allocations(key, ids));
  for (let round = 0; round < 3; round++) {
    for (const id of ids) {
      for (let i = registries.length - 1; i >= 0; i--) {
        assert.equal(registries[i].name(id), tables[i].get(id));
      }
    }
  }
});
