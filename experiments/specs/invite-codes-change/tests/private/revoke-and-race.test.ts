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

/** Revokes a code that is already revoked; whether that throws is left open, so either is accepted. */
async function revokeAgain(registry: InviteRegistry, code: string): Promise<void> {
  try {
    await registry.revoke(code);
  } catch {
    // The spec says only that it changes nothing.
  }
}

/**
 * Like `laggingStore`, but a get reads when it resolves rather than when it
 * is called, so it may see a write that landed while it waited.
 */
function lateReadingStore(lags: number[]): Store {
  const data = new Map<string, unknown>();
  let call = 0;
  const lag = () => turns(lags[call++ % lags.length]);
  return {
    async get(key: string) {
      await lag();
      return data.get(key);
    },
    async set(key: string, value: unknown) {
      await lag();
      data.set(key, value);
    },
  };
}

async function race(store: Store, who: string[], typed: (code: string, i: number) => string = (c) => c) {
  const { registry } = setup("2026-03-01T09:00:00.000Z", { store });
  await registry.create("t0");
  const { code } = await registry.create("t1");
  const results = await Promise.all(who.map((w, i) => registry.redeem(typed(code, i), w)));
  return { registry, code, results };
}

async function assertOneWinner(registry: InviteRegistry, code: string, who: string[], results: RedeemResult[]) {
  const winners = who.filter((_, i) => results[i].ok);
  assert.equal(winners.length, 1, `exactly one of ${who.join(", ")} succeeds`);
  const [winner] = winners;
  who.forEach((w, i) => {
    if (w === winner) assertGrants(results[i], "t1");
    else assertFails(results[i], "used");
  });
  const withAccess: string[] = [];
  for (const w of who) if (await registry.hasAccess(w, "t1")) withAccess.push(w);
  assert.deepEqual(withAccess, [winner]);
  for (const w of who) assert.deepEqual(await registry.tasksFor(w), w === winner ? ["t1"] : []);
  const shown = await listed(registry, "t1", code);
  assert.equal(shown.state, "used");
  assert.equal(shown.usedBy, winner);
  return winner;
}

const LAG_PATTERNS = [[0], [2, 0], [0, 2], [1, 0, 0], [0, 0, 3], [4, 1], [1, 4, 0, 2], [0, 1, 0, 0, 5]];

// --- @happy-3: revoking a used code withdraws the access it granted --------

// Extends "[happy-3] revoking a used code withdraws its access and leaves other tasks alone": more tasks.
test("[happy-3] revoking one of three used codes withdraws that task alone", async () => {
  const { registry } = setup();
  const codes = [await registry.create("t1"), await registry.create("t2"), await registry.create("t3")];
  for (const c of codes) assertGrants(await registry.redeem(c.code, "c1"), c.taskId);

  await registry.revoke(codes[1].code);

  assert.deepEqual((await registry.tasksFor("c1")).sort(), ["t1", "t3"]);
  assert.equal(await registry.hasAccess("c1", "t1"), true);
  assert.equal(await registry.hasAccess("c1", "t2"), false);
  assert.equal(await registry.hasAccess("c1", "t3"), true);
});

// Extends "[happy-3] revoking a used code withdraws only the access that code granted":
// the code revoked is not the first one used.
test("[happy-3] revoking the code a later contributor used withdraws only theirs", async () => {
  const { registry } = setup();
  const codes = [await registry.create("t1"), await registry.create("t1"), await registry.create("t1")];
  const who = ["c1", "c2", "c3"];
  for (let i = 0; i < 3; i++) assertGrants(await registry.redeem(codes[i].code, who[i]), "t1");

  await registry.revoke(codes[1].code);

  assert.equal(await registry.hasAccess("c1", "t1"), true);
  assert.equal(await registry.hasAccess("c2", "t1"), false);
  assert.equal(await registry.hasAccess("c3", "t1"), true);
  assert.deepEqual(await registry.tasksFor("c2"), []);
});

// Extends "[happy-3] revoking a used code withdraws only the access that code granted":
// an unused code granted nothing, so revoking it withdraws nothing.
test("[happy-3] revoking an unused code for a task withdraws no one's access to it", async () => {
  const { registry } = setup();
  const used = await registry.create("t1");
  const unused = await registry.create("t1");
  assertGrants(await registry.redeem(used.code, "c1"), "t1");

  await registry.revoke(unused.code);

  assert.equal(await registry.hasAccess("c1", "t1"), true);
  assert.deepEqual(await registry.tasksFor("c1"), ["t1"]);
  assert.equal((await listed(registry, "t1", used.code)).state, "used");
});

// Extends "[happy-3] revoking a used code withdraws its access and leaves other tasks alone":
// two revocations at once over a slow store.
test("[happy-3] two used codes revoked at once over a slow store both lose their access", async () => {
  const { registry } = setup("2026-03-01T09:00:00.000Z", { store: laggingStore([2, 0, 1, 3]) });
  const codes = [await registry.create("t1"), await registry.create("t2"), await registry.create("t3")];
  for (const c of codes) assertGrants(await registry.redeem(c.code, "c1"), c.taskId);

  await Promise.all([registry.revoke(codes[0].code), registry.revoke(codes[2].code)]);

  assert.deepEqual(await registry.tasksFor("c1"), ["t2"]);
  assert.equal(await registry.hasAccess("c1", "t1"), false);
  assert.equal(await registry.hasAccess("c1", "t3"), false);
});

// Extends "[happy-3] revoking a used code withdraws its access and leaves other tasks alone":
// the other task's access is gained while the revocation is under way.
test("[happy-3] a revocation and a redemption for another task at once leave just the other task", async () => {
  const { registry } = setup("2026-03-01T09:00:00.000Z", { store: laggingStore([1, 3, 0, 2]) });
  const forT1 = await registry.create("t1");
  const forT2 = await registry.create("t2");
  assertGrants(await registry.redeem(forT1.code, "c1"), "t1");

  const [, redeemed] = await Promise.all([registry.revoke(forT1.code), registry.redeem(forT2.code, "c1")]);

  assertGrants(redeemed, "t2");
  assert.deepEqual(await registry.tasksFor("c1"), ["t2"]);
  assert.equal(await registry.hasAccess("c1", "t1"), false);
});

// --- @boundary-4: a used code can be revoked after its expiry time ---------

// Extends "[boundary-4] a used code revoked after its expiry time is revoked and its access withdrawn":
// a year after, at another creation time.
test("[boundary-4] a used code revoked a year after it expired is revoked, still shows its user, and loses its access", async () => {
  const { registry, clock } = setup("2026-06-30T23:00:00.000Z");
  const code = await registry.create("t1");
  const other = await registry.create("t2");
  clock.set("2026-07-01T01:00:00.000Z");
  assertGrants(await registry.redeem(code.code, "c1"), "t1");
  assertGrants(await registry.redeem(other.code, "c1"), "t2");
  clock.set("2027-07-01T00:00:00.000Z");

  await registry.revoke(code.code);

  const shown = await listed(registry, "t1", code.code);
  assert.equal(shown.state, "revoked");
  assert.equal(shown.usedBy, "c1");
  assert.equal(shown.usedAt?.toISOString(), "2026-07-01T01:00:00.000Z");
  assert.equal(await registry.hasAccess("c1", "t1"), false);
  assert.deepEqual(await registry.tasksFor("c1"), ["t2"]);
  assert.equal((await listed(registry, "t2", other.code)).state, "used");
});

// Extends "[boundary-4] a used code can be revoked one millisecond after its expiry time": exactly at it.
test("[boundary-4] a used code revoked exactly at its expiry time is revoked and loses its access", async () => {
  const { registry, clock } = setup("2026-03-01T09:00:00.000Z");
  const { code } = await registry.create("t1");
  clock.set("2026-03-01T09:00:00.001Z");
  assertGrants(await registry.redeem(code, "c1"), "t1");
  clock.set("2026-03-15T09:00:00.000Z");

  await registry.revoke(code);

  assert.equal((await listed(registry, "t1", code)).state, "revoked");
  assert.equal(await registry.hasAccess("c1", "t1"), false);
  assert.deepEqual(await registry.tasksFor("c1"), []);
});

// --- @boundary-5: access taken back can be regained with another code ------

// Extends "[boundary-5] access taken back is regained with another unused code for the task": several rounds.
test("[boundary-5] access taken back over and over is regained each time with another code", async () => {
  const { registry } = setup();
  const codes = [await registry.create("t1"), await registry.create("t1"), await registry.create("t1")];

  assertGrants(await registry.redeem(codes[0].code, "c1"), "t1");
  await registry.revoke(codes[0].code);
  assertGrants(await registry.redeem(codes[1].code, "c1"), "t1");
  await registry.revoke(codes[1].code);
  assert.equal(await registry.hasAccess("c1", "t1"), false);
  assertGrants(await registry.redeem(codes[2].code, "c1"), "t1");

  assert.equal(await registry.hasAccess("c1", "t1"), true);
  assert.deepEqual(await registry.tasksFor("c1"), ["t1"]);
  for (const [i, state] of (["revoked", "revoked", "used"] as const).entries()) {
    const shown = await listed(registry, "t1", codes[i].code);
    assert.equal(shown.state, state);
    assert.equal(shown.usedBy, "c1");
  }
});

// Extends "[boundary-5] access taken back is regained with another unused code for the task":
// the other code is one refused earlier with "already has access".
test("[boundary-5] a code once refused with 'already has access' regains the task after the first is revoked", async () => {
  const { registry } = setup();
  const first = await registry.create("t1");
  const second = await registry.create("t1");
  assertGrants(await registry.redeem(first.code, "c1"), "t1");
  assertFails(await registry.redeem(second.code, "c1"), "already has access");
  await registry.revoke(first.code);

  assertGrants(await registry.redeem(second.code, "c1"), "t1");

  assert.equal(await registry.hasAccess("c1", "t1"), true);
  assert.equal((await listed(registry, "t1", second.code)).usedBy, "c1");
});

// Extends "[boundary-5] revoking an already revoked code changes nothing, so regained access is kept":
// revoked again several times, with other contributors on the task.
test("[boundary-5] revoking an already revoked code again and again takes nothing from anyone", async () => {
  const { registry, clock } = setup("2026-03-01T09:00:00.000Z");
  const first = await registry.create("t1");
  const second = await registry.create("t1");
  const third = await registry.create("t1");
  clock.set("2026-03-02T09:00:00.000Z");
  assertGrants(await registry.redeem(first.code, "c1"), "t1");
  await registry.revoke(first.code);
  clock.set("2026-03-03T09:00:00.000Z");
  assertGrants(await registry.redeem(second.code, "c1"), "t1");
  assertGrants(await registry.redeem(third.code, "c2"), "t1");

  for (const at of ["2026-03-04T09:00:00.000Z", "2026-03-20T09:00:00.000Z", "2026-04-01T09:00:00.000Z"]) {
    clock.set(at);
    await revokeAgain(registry, first.code);
  }

  assert.equal(await registry.hasAccess("c1", "t1"), true);
  assert.equal(await registry.hasAccess("c2", "t1"), true);
  const old = await listed(registry, "t1", first.code);
  assert.equal(old.state, "revoked");
  assert.equal(old.usedBy, "c1");
  assert.equal(old.usedAt?.toISOString(), "2026-03-02T09:00:00.000Z");
  const regained = await listed(registry, "t1", second.code);
  assert.equal(regained.state, "used");
  assert.equal(regained.usedBy, "c1");
  assert.equal(regained.usedAt?.toISOString(), "2026-03-03T09:00:00.000Z");
});

// --- @concurrency-1: only one of two simultaneous redemptions wins ---------

// Extends "[concurrency-1] only one wins when store calls resolve after uneven delays":
// many more delay patterns, in both orders.
test("[concurrency-1] one of two simultaneous redemptions wins across many store delay patterns", async () => {
  for (const lags of LAG_PATTERNS) {
    for (const who of [["c1", "c2"], ["c2", "c1"]]) {
      const { registry, code, results } = await race(laggingStore(lags), who);
      await assertOneWinner(registry, code, who, results);
    }
  }
});

// Extends "[concurrency-1] only one of two simultaneous redemptions wins":
// a store whose reads see writes that land while they wait.
test("[concurrency-1] one of two simultaneous redemptions wins when the store reads late", async () => {
  for (const lags of LAG_PATTERNS) {
    for (const who of [["c1", "c2"], ["c2", "c1"]]) {
      const { registry, code, results } = await race(lateReadingStore(lags), who);
      await assertOneWinner(registry, code, who, results);
    }
  }
});

// Extends "[concurrency-1] only one of two simultaneous redemptions wins": more contenders.
test("[concurrency-1] one of five simultaneous redemptions wins and the rest are told it is used", async () => {
  const who = ["c1", "c2", "c3", "c4", "c5"];
  for (const lags of [[1], [3, 1, 4, 1, 5, 2, 6], [0, 2]]) {
    const { registry, code, results } = await race(laggingStore(lags), who);
    await assertOneWinner(registry, code, who, results);
  }
});

// Extends "[concurrency-1] only one of two simultaneous redemptions wins":
// the contenders type the same code differently.
test("[concurrency-1] one of two simultaneous redemptions wins when the code is typed differently", async () => {
  const typings = [
    (code: string) => code,
    (code: string) => code.toLowerCase(),
    (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`,
    (code: string) => ` ${code.slice(0, 4)} ${code.slice(4).toLowerCase()} `,
  ];
  for (const lags of [[1], [2, 0], [0, 3, 1]]) {
    for (let a = 0; a < typings.length; a++) {
      const b = (a + 1) % typings.length;
      const who = ["c1", "c2"];
      const { registry, code, results } = await race(laggingStore(lags), who, (c, i) =>
        i === 0 ? typings[a](c) : typings[b](c),
      );
      await assertOneWinner(registry, code, who, results);
    }
  }
});

// Extends "[concurrency-1] only one of two simultaneous redemptions wins": what follows the race.
test("[concurrency-1] after the race the winner can redeem the code again and the loser still cannot", async () => {
  const who = ["c1", "c2"];
  const { registry, code, results } = await race(laggingStore([2, 1, 0]), who);
  const winner = await assertOneWinner(registry, code, who, results);
  const loser = winner === "c1" ? "c2" : "c1";

  assertGrants(await registry.redeem(code, winner), "t1");
  assertFails(await registry.redeem(code, loser), "used");
  assert.equal(await registry.hasAccess(loser, "t1"), false);
  assert.equal((await listed(registry, "t1", code)).usedBy, winner);
});
