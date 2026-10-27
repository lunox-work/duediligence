import { test } from "node:test";
import assert from "node:assert/strict";
import { InviteRegistry } from "../../src/index.js";
import type { RandomInt, Store } from "../../src/index.js";

const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const CODE_FORMAT = /^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{8}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

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

function tick(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

/** An in-memory store whose `get` reads when called and `set` writes when it resolves, both after a few turns. */
function slowStore(turns: number): Store {
  const data = new Map<string, unknown>();
  const wait = async () => {
    for (let i = 0; i < turns; i++) await tick();
  };
  return {
    async get(key: string) {
      const value = data.get(key);
      await wait();
      return value;
    },
    async set(key: string, value: unknown) {
      await wait();
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

function setup(startIso: string, randomInt: RandomInt, store: Store = memoryStore()) {
  let time = Date.parse(startIso);
  const registry = new InviteRegistry({
    store,
    now: () => new Date(time),
    randomInt,
  });
  return {
    registry,
    at(iso: string) {
      time = Date.parse(iso);
    },
  };
}

/** The code a fresh registry makes from these draws. */
async function codeFor(values: number[]): Promise<string> {
  const { registry } = setup("2026-03-01T09:00:00Z", scripted(values));
  return (await registry.create("x")).code;
}

const A = [0, 1, 2, 3, 4, 5, 6, 7];
const B = [8, 9, 10, 11, 12, 13, 14, 15];
const C = [16, 17, 18, 19, 20, 21, 22, 23];
const D = [24, 25, 26, 27, 28, 29, 0, 1];

// Extends "[happy-1] a new code is unused, made now and expires 14 days later": other times, with milliseconds, across a year end.
test("[happy-1] a code made at another time, with milliseconds, expires exactly 14 days later", async () => {
  const { registry } = setup("2026-12-25T23:59:59.500Z", scripted(A));

  const created = await registry.create("task-42");

  assert.match(created.code, CODE_FORMAT);
  assert.equal(created.taskId, "task-42");
  assert.equal(created.state, "unused");
  assert.ok(created.createdAt instanceof Date);
  assert.ok(created.expiresAt instanceof Date);
  assert.equal(created.createdAt.toISOString(), "2026-12-25T23:59:59.500Z");
  assert.equal(created.expiresAt.toISOString(), "2027-01-08T23:59:59.500Z");
  assert.equal(created.usedBy, undefined);
  assert.equal(created.usedAt, undefined);
});

// Extends "[happy-1] a new code is unused, made now and expires 14 days later": 14 days is 14 × 24 hours whatever the daylight-saving changes.
test("[happy-1] a code expires 14 × 24 hours after it was made across daylight-saving changes", async () => {
  for (const iso of [
    "2026-03-20T09:00:00.000Z",
    "2026-03-28T23:30:00.000Z",
    "2026-10-20T12:00:00.000Z",
    "2026-10-30T01:15:00.000Z",
    "2026-02-20T00:00:00.000Z",
  ]) {
    const { registry } = setup(iso, scripted(A));
    const created = await registry.create("t1");
    assert.equal(created.createdAt.toISOString(), iso);
    assert.equal(created.expiresAt.getTime() - Date.parse(iso), 14 * DAY_MS, `made at ${iso}`);
  }
});

// Extends "[happy-1] the code is chosen by the random source": every character of the alphabet can be chosen.
test("[happy-1] each character is chosen by the random source from the whole alphabet", async () => {
  const seen = new Set<string>();
  for (let r = 0; r < ALPHABET.length; r++) {
    const { registry } = setup("2026-03-01T09:00:00Z", (bound: number) => r % bound);
    const { code } = await registry.create("t1");
    assert.match(code, CODE_FORMAT);
    assert.equal(new Set(code).size, 1, `the same draw ${r} gives the same character in every place`);
    seen.add(code[0]);
  }
  assert.deepEqual([...seen].sort(), [...ALPHABET].sort());
});

// Extends "[happy-1] the code is chosen by the random source": the order of the draws is the order of the characters.
test("[happy-1] distinct draws give distinct characters and reversed draws give the reversed code", async () => {
  const forward = await codeFor([3, 14, 15, 9, 26, 5, 29, 0]);
  const backward = await codeFor([0, 29, 5, 26, 9, 15, 14, 3]);

  assert.match(forward, CODE_FORMAT);
  assert.equal(new Set(forward).size, 8);
  assert.equal(backward, [...forward].reverse().join(""));
});

// Extends "[happy-1] a new code is listed for its task as unused": more codes, more tasks, other times.
test("[happy-1] several new codes for several tasks are each listed for their own task as unused", async () => {
  const { registry, at } = setup("2026-05-01T00:00:00Z", scripted([]));
  const t1a = await registry.create("t1");
  at("2026-05-02T06:30:00Z");
  const t2a = await registry.create("t2");
  const t1b = await registry.create("t1");
  at("2026-05-03T12:00:00.250Z");
  const t1c = await registry.create("t1");

  const all = [t1a, t2a, t1b, t1c].map((c) => c.code);
  assert.equal(new Set(all).size, 4);

  at("2026-05-04T00:00:00Z");
  const listed = await registry.list("t1");
  assert.deepEqual(
    listed.map((c) => c.code).sort(),
    [t1a.code, t1b.code, t1c.code].sort(),
  );
  for (const c of listed) {
    assert.equal(c.state, "unused");
    assert.equal(c.taskId, "t1");
    assert.equal(c.usedBy, undefined);
  }
  const c = listed.find((x) => x.code === t1c.code);
  assert.equal(c?.createdAt.toISOString(), "2026-05-03T12:00:00.250Z");
  assert.equal(c?.expiresAt.toISOString(), "2026-05-17T12:00:00.250Z");

  const t2 = await registry.list("t2");
  assert.equal(t2.length, 1);
  assert.equal(t2[0].code, t2a.code);
  assert.equal(t2[0].createdAt.toISOString(), "2026-05-02T06:30:00.000Z");
});

// Extends "[happy-1] a code that would repeat one already in the registry is drawn again": repeats several times in a row.
test("[happy-1] a code is drawn again for as long as it would repeat any code already in the registry", async () => {
  const expected = await codeFor(C);
  const { registry } = setup("2026-03-01T09:00:00Z", scripted([...A, ...B, ...A, ...B, ...A, ...C]));

  const first = await registry.create("t1");
  const second = await registry.create("t1");
  const third = await registry.create("t1");

  assert.equal(first.code, await codeFor(A));
  assert.equal(second.code, await codeFor(B));
  assert.equal(third.code, expected);
  assert.equal((await registry.list("t1")).length, 3);

  const r = await registry.redeem(third.code, "c1");
  assert.equal(r.ok, true);
});

// Extends "[happy-1] a code that would repeat one already in the registry is drawn again": the existing codes are used, revoked or expired.
test("[happy-1] a code is drawn again when it would repeat a used, revoked or expired code", async () => {
  const expected = await codeFor(D);
  const { registry, at } = setup("2026-03-01T09:00:00Z", scripted([...A, ...B, ...C, ...A, ...B, ...C, ...D]));
  const used = await registry.create("t1");
  const revoked = await registry.create("t2");
  const expired = await registry.create("t3");
  await registry.redeem(used.code, "c1");
  await registry.revoke(revoked.code);
  assert.equal((await registry.list("t2"))[0].state, "revoked");

  at("2026-04-01T00:00:00Z");
  const fresh = await registry.create("t4");

  assert.equal(fresh.code, expected);
  assert.equal(fresh.state, "unused");
  assert.equal(fresh.taskId, "t4");

  const [u] = await registry.list("t1");
  assert.equal(u.state, "used");
  assert.equal(u.usedBy, "c1");
  assert.equal((await registry.list("t3"))[0].state, "expired");

  const r = await registry.redeem(fresh.code, "c2");
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.taskId, "t4");
});

// Extends "[happy-1] a code that would repeat one already in the registry is drawn again": the two codes are made at the same time over a slow store.
test("[happy-1] two codes made at the same time over a slow store never repeat each other", async () => {
  const { registry } = setup(
    "2026-03-01T09:00:00Z",
    scripted([...A, ...A, ...B, ...B, ...C]),
    slowStore(3),
  );

  const [x, y] = await Promise.all([registry.create("t1"), registry.create("t2")]);

  assert.match(x.code, CODE_FORMAT);
  assert.match(y.code, CODE_FORMAT);
  assert.notEqual(x.code, y.code);

  const rx = await registry.redeem(x.code, "c1");
  const ry = await registry.redeem(y.code, "c2");
  assert.equal(rx.ok && rx.taskId, "t1");
  assert.equal(ry.ok && ry.taskId, "t2");
});
