import { test } from "node:test";
import assert from "node:assert/strict";
import { InviteRegistry } from "../../src/index.js";
import type { InviteCode, Store } from "../../src/index.js";

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

function setup(startIso: string) {
  let time = Date.parse(startIso);
  let n = 0;
  const registry = new InviteRegistry({
    store: memoryStore(),
    now: () => new Date(time),
    randomInt: (bound: number) => n++ % bound,
  });
  return {
    registry,
    at(iso: string) {
      time = Date.parse(iso);
    },
  };
}

function byCode(listed: InviteCode[], code: string): InviteCode {
  const found = listed.find((c) => c.code === code);
  if (!found) throw new assert.AssertionError({ message: `code ${code} is listed` });
  return found;
}

test("[happy-3] a task's codes are listed with when they were made, when they expire, and their state", async () => {
  const { registry, at } = setup("2026-03-01T09:00:00Z");
  const expired = await registry.create("t1");
  at("2026-03-10T08:00:00Z");
  const unused = await registry.create("t1");
  const used = await registry.create("t1");
  const revoked = await registry.create("t1");
  const otherTask = await registry.create("t2");
  at("2026-03-12T15:00:00Z");
  await registry.redeem(used.code, "c1");
  await registry.revoke(revoked.code);

  at("2026-03-20T00:00:00Z");
  const listed = await registry.list("t1");

  assert.deepEqual(
    listed.map((c) => c.code).sort(),
    [expired.code, unused.code, used.code, revoked.code].sort(),
  );
  assert.ok(!listed.some((c) => c.code === otherTask.code));
  for (const c of listed) assert.equal(c.taskId, "t1");

  const e = byCode(listed, expired.code);
  assert.equal(e.state, "expired");
  assert.equal(e.createdAt.toISOString(), "2026-03-01T09:00:00.000Z");
  assert.equal(e.expiresAt.toISOString(), "2026-03-15T09:00:00.000Z");

  const u = byCode(listed, unused.code);
  assert.equal(u.state, "unused");
  assert.equal(u.createdAt.toISOString(), "2026-03-10T08:00:00.000Z");
  assert.equal(u.expiresAt.toISOString(), "2026-03-24T08:00:00.000Z");
  assert.equal(u.usedBy, undefined);
  assert.equal(u.usedAt, undefined);

  const d = byCode(listed, used.code);
  assert.equal(d.state, "used");
  assert.equal(d.usedBy, "c1");
  assert.equal(d.usedAt?.toISOString(), "2026-03-12T15:00:00.000Z");

  const r = byCode(listed, revoked.code);
  assert.equal(r.state, "revoked");
  assert.equal(r.usedBy, undefined);
});

test("[happy-3] a task with no codes lists none", async () => {
  const { registry } = setup("2026-03-01T09:00:00Z");
  await registry.create("t2");

  assert.deepEqual(await registry.list("t1"), []);
});

test("[happy-3] a used code stays used after its expiry time and still shows who used it and when", async () => {
  const { registry, at } = setup("2026-03-01T09:00:00Z");
  const { code } = await registry.create("t1");
  at("2026-03-15T08:59:59.999Z");
  await registry.redeem(code, "c1");

  at("2026-03-15T09:00:00Z");
  const atExpiry = byCode(await registry.list("t1"), code);
  assert.equal(atExpiry.state, "used");

  at("2026-06-01T00:00:00Z");
  const later = byCode(await registry.list("t1"), code);
  assert.equal(later.state, "used");
  assert.equal(later.usedBy, "c1");
  assert.equal(later.usedAt?.toISOString(), "2026-03-15T08:59:59.999Z");
});

test("[happy-3] an unused code is listed as unused just before its expiry and expired at it", async () => {
  const { registry, at } = setup("2026-03-01T09:00:00Z");
  const { code } = await registry.create("t1");

  at("2026-03-15T08:59:59.999Z");
  assert.equal(byCode(await registry.list("t1"), code).state, "unused");

  at("2026-03-15T09:00:00Z");
  assert.equal(byCode(await registry.list("t1"), code).state, "expired");
});
