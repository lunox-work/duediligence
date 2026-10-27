import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InviteRegistry,
  type InviteCode,
  type RandomInt,
  type RedeemFailureReason,
  type RedeemResult,
  type Store,
} from "../../src/index.js";

// --- Harness ---------------------------------------------------------------

const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{8}$/;
const DAY = 24 * 60 * 60 * 1000;

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

function turns(count: number): Promise<void> {
  let chain = Promise.resolve();
  for (let i = 0; i < count; i++)
    chain = chain.then(() => new Promise<void>((resolve) => setImmediate(resolve)));
  return chain;
}

/** A store whose calls each wait a number of event-loop turns taken in order from `lags`. */
function laggingStore(lags: number[]): Store {
  const data = new Map<string, unknown>();
  let call = 0;
  const lag = () => turns(lags[call++ % lags.length]);
  return {
    async get(key: string) {
      const value = data.get(key);
      await lag();
      return value;
    },
    async set(key: string, value: unknown) {
      await lag();
      data.set(key, value);
    },
  };
}

function fixedClock(iso: string) {
  let current = new Date(iso).getTime();
  return {
    now: () => new Date(current),
    set(at: string) {
      current = new Date(at).getTime();
    },
    setMs(ms: number) {
      current = ms;
    },
  };
}

function countingRandom(start = 0): RandomInt {
  let n = start;
  return (bound: number) => n++ % bound;
}

/** Draws `script` first, in order, then counts up from `start`. */
function scriptedRandom(script: number[], start = 100): RandomInt {
  let i = 0;
  let n = start;
  return (bound: number) => (i < script.length ? script[i++] % bound : n++ % bound);
}

/** A deterministic pseudo-random source, so codes vary in every position. */
function seededRandom(seed: number): RandomInt {
  let state = seed >>> 0;
  return (bound: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 8) % bound;
  };
}

function setup(
  at = "2026-03-01T09:00:00.000Z",
  options: { store?: Store; randomInt?: RandomInt } = {},
) {
  const clock = fixedClock(at);
  const registry = new InviteRegistry({
    store: options.store ?? memoryStore(),
    now: clock.now,
    randomInt: options.randomInt ?? countingRandom(),
  });
  return { registry, clock };
}

function assertGrants(result: RedeemResult, taskId: string) {
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.taskId, taskId);
}

function assertFails(result: RedeemResult, reason: RedeemFailureReason) {
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, reason);
}

async function listed(registry: InviteRegistry, taskId: string, code: string): Promise<InviteCode> {
  const found = (await registry.list(taskId)).find((c) => c.code === code);
  if (found === undefined) assert.fail(`code ${code} is not listed for ${taskId}`);
  return found!;
}

const P1 = [0, 1, 2, 3, 4, 5, 6, 7];
const P2 = [8, 9, 10, 11, 12, 13, 14, 15];
const P3 = [16, 17, 18, 19, 20, 21, 22, 23];

// --- @happy-1: a new code is unused and expires in 14 days -----------------

// Extends "[happy-1] a new code is unused and expires 14 days after it was made":
// other creation times, read from the clock when the code is made.
test("[happy-1] a code made at other times expires 14 days after the clock at its creation", async () => {
  const { registry, clock } = setup("2026-01-01T00:00:00.000Z");

  clock.set("2026-12-25T23:59:59.123Z");
  const a = await registry.create("task-a");
  assert.equal(a.taskId, "task-a");
  assert.equal(a.state, "unused");
  assert.match(a.code, CODE_PATTERN);
  assert.ok(a.createdAt instanceof Date);
  assert.ok(a.expiresAt instanceof Date);
  assert.equal(a.createdAt.toISOString(), "2026-12-25T23:59:59.123Z");
  assert.equal(a.expiresAt.toISOString(), "2027-01-08T23:59:59.123Z");
  assert.equal(a.usedBy, undefined);
  assert.equal(a.usedAt, undefined);

  clock.set("2028-02-20T12:00:00.000Z");
  const b = await registry.create("task-b");
  assert.equal(b.taskId, "task-b");
  assert.equal(b.state, "unused");
  assert.equal(b.createdAt.toISOString(), "2028-02-20T12:00:00.000Z");
  assert.equal(b.expiresAt.toISOString(), "2028-03-05T12:00:00.000Z");
});

// Extends "[happy-1] a new code is unused and expires 14 days after it was made": many codes.
test("[happy-1] many codes across tasks are each 8 characters from the alphabet and distinct", async () => {
  const { registry } = setup("2026-03-01T09:00:00.000Z", { randomInt: seededRandom(42) });
  const codes: string[] = [];
  for (let i = 0; i < 60; i++) {
    const made = await registry.create(`t${i % 4}`);
    assert.match(made.code, CODE_PATTERN);
    assert.equal(made.state, "unused");
    assert.equal(made.taskId, `t${i % 4}`);
    codes.push(made.code);
  }
  assert.equal(new Set(codes).size, codes.length);
});

// Extends "[happy-1] a new code is unused and expires 14 days after it was made":
// the characters come from the supplied random source, not from another one.
test("[happy-1] codes are chosen by the supplied random source, one draw or more per character", async () => {
  const make = async () => {
    const random = seededRandom(7);
    let calls = 0;
    const randomInt = (bound: number) => {
      calls++;
      return random(bound);
    };
    const { registry } = setup("2026-03-01T09:00:00.000Z", { randomInt });
    const codes: string[] = [];
    for (let i = 0; i < 5; i++) codes.push((await registry.create("t1")).code);
    return { codes, calls };
  };

  const first = await make();
  const second = await make();

  assert.deepEqual(first.codes, second.codes);
  assert.ok(first.calls >= 5 * 8, `expected at least 40 draws, got ${first.calls}`);
});

// Extends "[happy-1] a code that would repeat one already in the registry is drawn again":
// the code it would repeat belongs to another task.
test("[happy-1] a code that would repeat one made for another task is drawn again", async () => {
  const { registry } = setup("2026-03-01T09:00:00.000Z", { randomInt: scriptedRandom([...P1, ...P1]) });

  const forT1 = await registry.create("t1");
  const forT2 = await registry.create("t2");

  assert.match(forT2.code, CODE_PATTERN);
  assert.notEqual(forT2.code, forT1.code);
  assert.equal(forT2.taskId, "t2");
  assert.deepEqual((await registry.list("t1")).map((c) => c.code), [forT1.code]);
  assert.deepEqual((await registry.list("t2")).map((c) => c.code), [forT2.code]);
  assertGrants(await registry.redeem(forT1.code, "c1"), "t1");
  assertGrants(await registry.redeem(forT2.code, "c2"), "t2");
  assert.deepEqual(await registry.tasksFor("c1"), ["t1"]);
  assert.deepEqual(await registry.tasksFor("c2"), ["t2"]);
});

// Extends "[happy-1] a code that would repeat one already in the registry is drawn again":
// it is drawn again as often as it takes, against every code, not just the last one.
test("[happy-1] a code is drawn again for as long as it would repeat any code in the registry", async () => {
  const randomInt = scriptedRandom([...P1, ...P2, ...P1, ...P2, ...P1, ...P2]);
  const { registry } = setup("2026-03-01T09:00:00.000Z", { randomInt });

  const first = await registry.create("t1");
  const second = await registry.create("t1");
  const third = await registry.create("t1");

  assert.notEqual(first.code, second.code);
  assert.notEqual(third.code, first.code);
  assert.notEqual(third.code, second.code);
  assert.match(third.code, CODE_PATTERN);
  const codes = (await registry.list("t1")).map((c) => c.code).sort();
  assert.deepEqual(codes, [first.code, second.code, third.code].sort());
  for (const c of await registry.list("t1")) assert.equal(c.state, "unused");
});

// Extends "[happy-1] a code that would repeat one already in the registry is drawn again":
// codes that were used, revoked or have expired are still in the registry.
test("[happy-1] a code that would repeat a used, a revoked or an expired code is drawn again", async () => {
  const randomInt = scriptedRandom([...P1, ...P2, ...P3, ...P1, ...P2, ...P3]);
  const { registry, clock } = setup("2026-03-01T09:00:00.000Z", { randomInt });
  const used = await registry.create("t1");
  const revoked = await registry.create("t2");
  const expired = await registry.create("t3");
  assertGrants(await registry.redeem(used.code, "c1"), "t1");
  await registry.revoke(revoked.code);
  clock.set("2026-03-20T09:00:00.000Z");

  const fresh = await registry.create("t4");

  assert.match(fresh.code, CODE_PATTERN);
  assert.ok(![used.code, revoked.code, expired.code].includes(fresh.code));
  assert.equal(fresh.state, "unused");
  assertGrants(await registry.redeem(fresh.code, "c2"), "t4");
  const u = await listed(registry, "t1", used.code);
  assert.equal(u.state, "used");
  assert.equal(u.usedBy, "c1");
  assert.equal((await listed(registry, "t2", revoked.code)).state, "revoked");
  assert.equal((await listed(registry, "t3", expired.code)).state, "expired");
  assert.deepEqual(await registry.tasksFor("c2"), ["t4"]);
});

// --- @happy-4: a task's codes are listed with their state ------------------

// Extends "[happy-4] a task's codes are listed with when they were made, expire, and their state".
test("[happy-4] a task with no codes lists none, and each listed code belongs to the task listed", async () => {
  const { registry } = setup();
  const a = await registry.create("t1");
  const b = await registry.create("t2");
  const c = await registry.create("t1");

  assert.deepEqual(await registry.list("t9"), []);
  const t1 = await registry.list("t1");
  assert.deepEqual(t1.map((x) => x.code).sort(), [a.code, c.code].sort());
  for (const x of t1) {
    assert.equal(x.taskId, "t1");
    assert.ok(x.createdAt instanceof Date);
    assert.ok(x.expiresAt instanceof Date);
  }
  const t2 = await registry.list("t2");
  assert.deepEqual(t2.map((x) => x.code), [b.code]);
  assert.equal(t2[0].taskId, "t2");
});

// Extends "[happy-4] a task's codes are listed with when they were made, expire, and their state".
test("[happy-4] codes that were never used show no user and no time of use", async () => {
  const { registry, clock } = setup("2026-03-01T09:00:00.000Z");
  const expired = await registry.create("t1");
  clock.set("2026-03-10T09:00:00.000Z");
  const unused = await registry.create("t1");
  const revoked = await registry.create("t1");
  await registry.revoke(revoked.code);
  clock.set("2026-03-16T09:00:00.000Z");

  const e = await listed(registry, "t1", expired.code);
  assert.equal(e.state, "expired");
  assert.equal(e.usedBy, undefined);
  assert.equal(e.usedAt, undefined);
  const u = await listed(registry, "t1", unused.code);
  assert.equal(u.state, "unused");
  assert.equal(u.usedBy, undefined);
  assert.equal(u.usedAt, undefined);
  assert.equal(u.createdAt.toISOString(), "2026-03-10T09:00:00.000Z");
  assert.equal(u.expiresAt.toISOString(), "2026-03-24T09:00:00.000Z");
  const r = await listed(registry, "t1", revoked.code);
  assert.equal(r.state, "revoked");
  assert.equal(r.usedBy, undefined);
  assert.equal(r.usedAt, undefined);
});

// Extends "[happy-4] at its expiry time an unused code lists as 'expired' while a used one stays 'used'":
// far later, and a revoked used code too.
test("[happy-4] a used code stays 'used' long after its expiry, and a revoked used one still shows its user", async () => {
  const { registry, clock } = setup("2026-05-01T00:00:00.000Z");
  const used = await registry.create("t1");
  const usedThenRevoked = await registry.create("t1");
  clock.set("2026-05-07T06:15:30.250Z");
  assertGrants(await registry.redeem(used.code, "c1"), "t1");
  clock.set("2026-05-08T18:00:00.000Z");
  assertGrants(await registry.redeem(usedThenRevoked.code, "c2"), "t1");
  await registry.revoke(usedThenRevoked.code);
  clock.set("2027-05-01T00:00:00.000Z");

  const u = await listed(registry, "t1", used.code);
  assert.equal(u.state, "used");
  assert.equal(u.usedBy, "c1");
  assert.equal(u.usedAt?.toISOString(), "2026-05-07T06:15:30.250Z");
  assert.equal(u.createdAt.toISOString(), "2026-05-01T00:00:00.000Z");
  assert.equal(u.expiresAt.toISOString(), "2026-05-15T00:00:00.000Z");

  const r = await listed(registry, "t1", usedThenRevoked.code);
  assert.equal(r.state, "revoked");
  assert.equal(r.usedBy, "c2");
  assert.equal(r.usedAt?.toISOString(), "2026-05-08T18:00:00.000Z");
});

// Extends "[happy-4] at its expiry time an unused code lists as 'expired' while a used one stays 'used'":
// many codes made on different days, each judged by its own creation time.
test("[happy-4] codes made on different days are 'expired' or 'unused' by their own expiry at listing time", async () => {
  const start = new Date("2026-04-01T10:00:00.000Z").getTime();
  const { registry, clock } = setup("2026-04-01T10:00:00.000Z", { randomInt: seededRandom(11) });
  const made: InviteCode[] = [];
  for (let day = 0; day <= 20; day++) {
    clock.setMs(start + day * DAY);
    made.push(await registry.create("t1"));
  }
  const listAt = start + 20 * DAY;
  clock.setMs(listAt);

  const codes = await registry.list("t1");

  assert.equal(codes.length, made.length);
  for (let day = 0; day <= 20; day++) {
    const shown = codes.find((c) => c.code === made[day].code);
    assert.ok(shown, `code made on day ${day} is listed`);
    assert.equal(shown!.createdAt.getTime(), start + day * DAY);
    assert.equal(shown!.expiresAt.getTime(), start + (day + 14) * DAY);
    assert.equal(shown!.state, day <= 6 ? "expired" : "unused", `day ${day}`);
  }
});

// Extends "[happy-4] a task's codes are listed with when they were made, expire, and their state":
// codes made at the same time over a store whose calls resolve late.
test("[happy-4] codes made at the same time over a slow store are all listed as unused", async () => {
  const { registry } = setup("2026-03-01T09:00:00.000Z", { store: laggingStore([2, 0, 3, 1]) });

  const made = await Promise.all([1, 2, 3, 4, 5, 6].map(() => registry.create("t1")));

  const codes = made.map((c) => c.code);
  assert.equal(new Set(codes).size, codes.length);
  const shown = await registry.list("t1");
  assert.deepEqual(shown.map((c) => c.code).sort(), [...codes].sort());
  for (const c of shown) {
    assert.equal(c.state, "unused");
    assert.equal(c.expiresAt.toISOString(), "2026-03-15T09:00:00.000Z");
  }
});
