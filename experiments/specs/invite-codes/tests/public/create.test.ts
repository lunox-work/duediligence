import { test } from "node:test";
import assert from "node:assert/strict";
import { InviteRegistry } from "../../src/index.js";
import type { RandomInt, Store } from "../../src/index.js";

const CODE_FORMAT = /^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{8}$/;

function memoryStore(): Store {
  const data = new Map<string, unknown>();
  return {
    async get(key: string) {
      return data.get(key);
    },
    async set(key: string, value: unknown) {
      data.set(key, value);
    },
  };
}

/** Returns the scripted values in order, then counts upward. */
function scripted(values: number[]): RandomInt {
  let i = 0;
  let n = 0;
  return (bound: number) => {
    if (i < values.length) return values[i++] % bound;
    return n++ % bound;
  };
}

function registryAt(iso: string, randomInt: RandomInt): InviteRegistry {
  const time = Date.parse(iso);
  return new InviteRegistry({
    store: memoryStore(),
    now: () => new Date(time),
    randomInt,
  });
}

const FIRST = [0, 1, 2, 3, 4, 5, 6, 7];
const OTHER = [8, 9, 10, 11, 12, 13, 14, 15];

test("[happy-1] a new code is unused, made now and expires 14 days later", async () => {
  const registry = registryAt("2026-03-01T09:00:00Z", scripted(FIRST));

  const created = await registry.create("t1");

  assert.match(created.code, CODE_FORMAT);
  assert.equal(created.taskId, "t1");
  assert.equal(created.state, "unused");
  assert.equal(created.createdAt.toISOString(), "2026-03-01T09:00:00.000Z");
  assert.equal(created.expiresAt.toISOString(), "2026-03-15T09:00:00.000Z");
  assert.equal(created.usedBy, undefined);
  assert.equal(created.usedAt, undefined);
});

test("[happy-1] the code is chosen by the random source", async () => {
  const a = await registryAt("2026-03-01T09:00:00Z", scripted(FIRST)).create("t1");
  const b = await registryAt("2026-03-01T09:00:00Z", scripted(FIRST)).create("t1");
  const c = await registryAt("2026-03-01T09:00:00Z", scripted(OTHER)).create("t1");

  assert.equal(a.code, b.code);
  assert.notEqual(a.code, c.code);
  assert.match(c.code, CODE_FORMAT);
});

test("[happy-1] a new code is listed for its task as unused", async () => {
  const registry = registryAt("2026-03-01T09:00:00Z", scripted(FIRST));

  const created = await registry.create("t1");
  const listed = await registry.list("t1");

  assert.equal(listed.length, 1);
  assert.equal(listed[0].code, created.code);
  assert.equal(listed[0].state, "unused");
  assert.equal(listed[0].expiresAt.toISOString(), "2026-03-15T09:00:00.000Z");
});

test("[happy-1] a code that would repeat one already in the registry is drawn again", async () => {
  const registry = registryAt(
    "2026-03-01T09:00:00Z",
    scripted([...FIRST, ...FIRST, ...OTHER]),
  );
  const expected = await registryAt("2026-03-01T09:00:00Z", scripted(OTHER)).create("t2");

  const first = await registry.create("t1");
  const second = await registry.create("t2");

  assert.notEqual(second.code, first.code);
  assert.equal(second.code, expected.code);

  const r1 = await registry.redeem(first.code, "c1");
  const r2 = await registry.redeem(second.code, "c2");
  assert.equal(r1.ok, true);
  assert.equal(r1.ok && r1.taskId, "t1");
  assert.equal(r2.ok, true);
  assert.equal(r2.ok && r2.taskId, "t2");
});
