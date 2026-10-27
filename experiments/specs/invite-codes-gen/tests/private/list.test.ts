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

// Extends "[happy-3] a task's codes are listed with when they were made, when they expire, and their state": more codes of each state, and a task whose id another prefixes.
test("[happy-3] many codes of every state are listed with all their details, and only the task's own", async () => {
  const { registry, at } = setup("2026-06-01T00:00:00Z");
  const expiredA = await registry.create("t1");
  at("2026-06-02T12:00:00.500Z");
  const expiredB = await registry.create("t1");
  const t10 = await registry.create("t10");
  at("2026-06-10T00:00:00Z");
  const usedA = await registry.create("t1");
  const usedB = await registry.create("t1");
  const unusedA = await registry.create("t1");
  const revoked = await registry.create("t1");
  at("2026-06-11T00:00:00Z");
  const unusedB = await registry.create("t1");
  at("2026-06-12T08:15:00Z");
  await registry.redeem(usedA.code, "alice");
  at("2026-06-13T09:30:00.750Z");
  await registry.redeem(usedB.code, "bob");
  await registry.revoke(revoked.code);

  at("2026-06-20T00:00:00Z");
  const listed = await registry.list("t1");

  assert.equal(listed.length, 7);
  assert.deepEqual(
    listed.map((c) => c.code).sort(),
    [expiredA, expiredB, usedA, usedB, unusedA, revoked, unusedB].map((c) => c.code).sort(),
  );
  assert.ok(!listed.some((c) => c.code === t10.code));
  for (const c of listed) {
    assert.equal(c.taskId, "t1");
    assert.ok(c.createdAt instanceof Date);
    assert.ok(c.expiresAt instanceof Date);
    assert.equal(c.expiresAt.getTime() - c.createdAt.getTime(), 14 * 24 * 60 * 60 * 1000);
  }

  const eb = byCode(listed, expiredB.code);
  assert.equal(eb.state, "expired");
  assert.equal(eb.createdAt.toISOString(), "2026-06-02T12:00:00.500Z");
  assert.equal(eb.expiresAt.toISOString(), "2026-06-16T12:00:00.500Z");
  assert.equal(eb.usedBy, undefined);
  assert.equal(byCode(listed, expiredA.code).state, "expired");

  const ua = byCode(listed, usedA.code);
  assert.equal(ua.state, "used");
  assert.equal(ua.usedBy, "alice");
  assert.equal(ua.usedAt?.toISOString(), "2026-06-12T08:15:00.000Z");
  const ub = byCode(listed, usedB.code);
  assert.equal(ub.state, "used");
  assert.equal(ub.usedBy, "bob");
  assert.equal(ub.usedAt?.toISOString(), "2026-06-13T09:30:00.750Z");

  for (const u of [unusedA, unusedB]) {
    const l = byCode(listed, u.code);
    assert.equal(l.state, "unused");
    assert.equal(l.usedBy, undefined);
    assert.equal(l.usedAt, undefined);
  }
  assert.equal(byCode(listed, unusedB.code).expiresAt.toISOString(), "2026-06-25T00:00:00.000Z");

  const r = byCode(listed, revoked.code);
  assert.equal(r.state, "revoked");
  assert.equal(r.usedBy, undefined);
  assert.equal(r.usedAt, undefined);

  const other = await registry.list("t10");
  assert.equal(other.length, 1);
  assert.equal(other[0].code, t10.code);
  assert.equal(other[0].state, "expired");
});

// Extends "[happy-3] a task with no codes lists none": an empty registry, and ids that prefix or extend a task's id.
test("[happy-3] a task with no codes lists none, even when other task ids contain its id", async () => {
  const { registry } = setup("2026-03-01T09:00:00Z");
  assert.deepEqual(await registry.list("t1"), []);

  await registry.create("t10");
  await registry.create("xt1");
  assert.deepEqual(await registry.list("t1"), []);
  assert.deepEqual(await registry.list("t"), []);
  assert.deepEqual(await registry.list(""), []);
});

// Extends "[happy-3] a used code stays used after its expiry time and still shows who used it and when": several codes, long after.
test("[happy-3] long after expiry used codes stay used with who and when, and the rest are expired", async () => {
  const { registry, at } = setup("2026-03-01T09:00:00Z");
  const a = await registry.create("t1");
  const b = await registry.create("t1");
  const c = await registry.create("t1");
  at("2026-03-01T09:00:00.001Z");
  await registry.redeem(a.code, "c1");
  at("2026-03-14T23:00:00Z");
  await registry.redeem(c.code, "c2");

  at("2027-03-01T09:00:00Z");
  const listed = await registry.list("t1");
  const la = byCode(listed, a.code);
  assert.equal(la.state, "used");
  assert.equal(la.usedBy, "c1");
  assert.equal(la.usedAt?.toISOString(), "2026-03-01T09:00:00.001Z");
  const lc = byCode(listed, c.code);
  assert.equal(lc.state, "used");
  assert.equal(lc.usedBy, "c2");
  assert.equal(lc.usedAt?.toISOString(), "2026-03-14T23:00:00.000Z");
  const lb = byCode(listed, b.code);
  assert.equal(lb.state, "expired");
  assert.equal(lb.usedBy, undefined);
  assert.equal(lb.usedAt, undefined);
});

// Extends "[happy-3] an unused code is listed as unused just before its expiry and expired at it": another time, and a code refused for already having access.
test("[happy-3] an unused code made at another time turns expired exactly 14 days later, even after a refused redemption", async () => {
  const { registry, at } = setup("2026-08-08T08:08:08.808Z");
  const first = await registry.create("t1");
  const second = await registry.create("t1");
  await registry.redeem(first.code, "c1");
  await registry.redeem(second.code, "c1");

  at("2026-08-22T08:08:08.807Z");
  assert.equal(byCode(await registry.list("t1"), second.code).state, "unused");

  at("2026-08-22T08:08:08.808Z");
  const listed = byCode(await registry.list("t1"), second.code);
  assert.equal(listed.state, "expired");
  assert.equal(listed.expiresAt.toISOString(), "2026-08-22T08:08:08.808Z");
  assert.equal(byCode(await registry.list("t1"), first.code).state, "used");
});

// Extends "[happy-3] a task's codes are listed with when they were made, when they expire, and their state": the list follows each change.
test("[happy-3] listing again after a redemption and a revocation shows the new states", async () => {
  const { registry, at } = setup("2026-03-01T09:00:00Z");
  const a = await registry.create("t1");
  const b = await registry.create("t1");

  const before = await registry.list("t1");
  assert.deepEqual(before.map((c) => c.state), ["unused", "unused"]);

  at("2026-03-02T09:00:00Z");
  await registry.redeem(a.code, "c1");
  await registry.revoke(b.code);

  const after = await registry.list("t1");
  assert.equal(byCode(after, a.code).state, "used");
  assert.equal(byCode(after, a.code).usedAt?.toISOString(), "2026-03-02T09:00:00.000Z");
  assert.equal(byCode(after, b.code).state, "revoked");
});
