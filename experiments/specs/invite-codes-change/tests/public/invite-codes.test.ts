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

/** A store over a Map whose calls resolve on the next microtask. */
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

/**
 * A store whose calls resolve only after other work has run: each call
 * waits a number of event-loop turns taken in order from `lags`. A get
 * reads when it is called; a set writes when it resolves.
 */
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

/** A clock that stays where it is put. */
function fixedClock(iso: string) {
  let current = new Date(iso).getTime();
  return {
    now: () => new Date(current),
    set(at: string) {
      current = new Date(at).getTime();
    },
  };
}

/** A random source that counts up, so successive codes differ. */
function countingRandom(): RandomInt {
  let n = 0;
  return (bound: number) => n++ % bound;
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

async function listed(
  registry: InviteRegistry,
  taskId: string,
  code: string,
): Promise<InviteCode> {
  const found = (await registry.list(taskId)).find((c) => c.code === code);
  if (found === undefined) assert.fail(`code ${code} is not listed for ${taskId}`);
  return found!;
}

// --- Rule: Codes are made for a task ---------------------------------------

test("[happy-1] a new code is unused and expires 14 days after it was made", async () => {
  const { registry } = setup("2026-03-01T09:00:00.000Z");

  const code = await registry.create("t1");

  assert.match(code.code, CODE_PATTERN);
  assert.equal(code.taskId, "t1");
  assert.equal(code.state, "unused");
  assert.equal(code.createdAt.toISOString(), "2026-03-01T09:00:00.000Z");
  assert.equal(code.expiresAt.toISOString(), "2026-03-15T09:00:00.000Z");
});

test("[happy-1] a code that would repeat one already in the registry is drawn again", async () => {
  // The first 16 draws are all 0, so the second code's first draw repeats the first code.
  let n = 0;
  const randomInt = (bound: number) => (n < 16 ? (n++, 0) : n++ % bound);
  const { registry } = setup("2026-03-01T09:00:00.000Z", { randomInt });

  const first = await registry.create("t1");
  const second = await registry.create("t1");

  assert.match(first.code, CODE_PATTERN);
  assert.match(second.code, CODE_PATTERN);
  assert.notEqual(second.code, first.code);
  const codes = (await registry.list("t1")).map((c) => c.code).sort();
  assert.deepEqual(codes, [first.code, second.code].sort());
});

// --- Rule: Redeeming grants access once ------------------------------------

test("[happy-2] redeeming an unused code grants access to its task", async () => {
  const { registry, clock } = setup("2026-03-01T09:00:00.000Z");
  const { code } = await registry.create("t1");
  clock.set("2026-03-02T10:30:00.000Z");

  const result = await registry.redeem(code, "c1");

  assertGrants(result, "t1");
  assert.equal(await registry.hasAccess("c1", "t1"), true);
  assert.deepEqual(await registry.tasksFor("c1"), ["t1"]);
  const shown = await listed(registry, "t1", code);
  assert.equal(shown.state, "used");
  assert.equal(shown.usedBy, "c1");
  assert.equal(shown.usedAt?.toISOString(), "2026-03-02T10:30:00.000Z");
});

test("[happy-2] redeeming grants access to the code's task and to no other", async () => {
  const { registry } = setup("2026-03-01T09:00:00.000Z");
  const forT1 = await registry.create("t1");
  await registry.create("t2");

  assertGrants(await registry.redeem(forT1.code, "c1"), "t1");

  assert.equal(await registry.hasAccess("c1", "t2"), false);
  assert.deepEqual(await registry.tasksFor("c1"), ["t1"]);
  assert.equal(await registry.hasAccess("c2", "t1"), false);
  assert.deepEqual(await registry.tasksFor("c2"), []);
});

test("[boundary-1] a code redeemed in lowercase is the same code", async () => {
  const { registry } = setup();
  const { code } = await registry.create("t1");

  assertGrants(await registry.redeem(code.toLowerCase(), "c1"), "t1");

  assert.equal(await registry.hasAccess("c1", "t1"), true);
  assert.equal((await listed(registry, "t1", code)).usedBy, "c1");
});

test("[boundary-1] a code redeemed with spaces or a dash in it is the same code", async () => {
  const spaced = setup();
  const a = await spaced.registry.create("t1");
  const withSpaces = ` ${a.code.slice(0, 4)} ${a.code.slice(4)} `;
  assertGrants(await spaced.registry.redeem(withSpaces, "c1"), "t1");
  assert.equal((await listed(spaced.registry, "t1", a.code)).usedBy, "c1");

  const dashed = setup();
  const b = await dashed.registry.create("t1");
  const withDash = `${b.code.slice(0, 4)}-${b.code.slice(4)}`;
  assertGrants(await dashed.registry.redeem(withDash, "c1"), "t1");
  // Typed another way, it is still the code "c1" used.
  assertFails(await dashed.registry.redeem(b.code.toLowerCase(), "c2"), "used");
});

test("[boundary-2] a code can be redeemed up to the last millisecond before 14 days", async () => {
  const { registry, clock } = setup("2026-03-01T09:00:00.000Z");
  const { code } = await registry.create("t1");
  clock.set("2026-03-15T08:59:59.999Z");

  assertGrants(await registry.redeem(code, "c1"), "t1");
  assert.equal(await registry.hasAccess("c1", "t1"), true);
});

test("[boundary-2] a code redeemed exactly 14 days after it was made has expired", async () => {
  const { registry, clock } = setup("2026-03-01T09:00:00.000Z");
  const { code } = await registry.create("t1");
  clock.set("2026-03-15T09:00:00.000Z");

  assertFails(await registry.redeem(code, "c1"), "expired");
  assert.equal(await registry.hasAccess("c1", "t1"), false);
});

test("[unhappy-1] a used code redeemed by someone else fails with 'used' and grants nothing", async () => {
  const { registry } = setup();
  const { code } = await registry.create("t1");
  assertGrants(await registry.redeem(code, "c1"), "t1");

  assertFails(await registry.redeem(code, "c2"), "used");

  assert.equal(await registry.hasAccess("c2", "t1"), false);
  assert.deepEqual(await registry.tasksFor("c2"), []);
  assert.equal((await listed(registry, "t1", code)).usedBy, "c1");
});

test("[unhappy-1] the contributor who used a code can redeem it again and nothing changes", async () => {
  const { registry, clock } = setup("2026-03-01T09:00:00.000Z");
  const { code } = await registry.create("t1");
  clock.set("2026-03-02T09:00:00.000Z");
  assertGrants(await registry.redeem(code, "c1"), "t1");
  clock.set("2026-03-03T09:00:00.000Z");

  assertGrants(await registry.redeem(code, "c1"), "t1");

  assert.deepEqual(await registry.tasksFor("c1"), ["t1"]);
  const shown = await listed(registry, "t1", code);
  assert.equal(shown.state, "used");
  assert.equal(shown.usedBy, "c1");
  assert.equal(shown.usedAt?.toISOString(), "2026-03-02T09:00:00.000Z");
});

test("[unhappy-2] a code that was never made fails with 'unknown'", async () => {
  const { registry } = setup();
  const made = await registry.create("t1");
  const never = "ZZZZZZZZ";
  assert.notEqual(made.code, never);

  assertFails(await registry.redeem(never, "c1"), "unknown");
  assert.deepEqual(await registry.tasksFor("c1"), []);
});

test("[unhappy-2] a revoked code fails with 'revoked'", async () => {
  const { registry } = setup();
  const { code } = await registry.create("t1");
  await registry.revoke(code);

  assertFails(await registry.redeem(code, "c1"), "revoked");
  assert.equal(await registry.hasAccess("c1", "t1"), false);
});

test("[unhappy-2] a used code that is revoked fails with 'revoked' for its user and anyone else", async () => {
  const { registry } = setup();
  const { code } = await registry.create("t1");
  assertGrants(await registry.redeem(code, "c1"), "t1");
  await registry.revoke(code);

  assertFails(await registry.redeem(code, "c1"), "revoked");
  assertFails(await registry.redeem(code, "c2"), "revoked");
  assert.equal(await registry.hasAccess("c1", "t1"), false);
  assert.equal(await registry.hasAccess("c2", "t1"), false);
});

test("[boundary-3] a contributor with access fails another code for the task with 'already has access'", async () => {
  const { registry } = setup();
  const first = await registry.create("t1");
  const second = await registry.create("t1");
  assertGrants(await registry.redeem(first.code, "c1"), "t1");

  assertFails(await registry.redeem(second.code, "c1"), "already has access");

  const shown = await listed(registry, "t1", second.code);
  assert.equal(shown.state, "unused");
  assert.deepEqual(await registry.tasksFor("c1"), ["t1"]);
});

test("[boundary-3] a code refused with 'already has access' can still be redeemed by someone else", async () => {
  const { registry } = setup();
  const first = await registry.create("t1");
  const second = await registry.create("t1");
  assertGrants(await registry.redeem(first.code, "c1"), "t1");
  assertFails(await registry.redeem(second.code, "c1"), "already has access");

  assertGrants(await registry.redeem(second.code, "c2"), "t1");

  assert.equal(await registry.hasAccess("c2", "t1"), true);
  assert.equal((await listed(registry, "t1", second.code)).usedBy, "c2");
});

// --- Rule: Revoking a used code takes back its access ----------------------

test("[happy-3] revoking a used code withdraws its access and leaves other tasks alone", async () => {
  const { registry } = setup();
  const forT1 = await registry.create("t1");
  const forT2 = await registry.create("t2");
  assertGrants(await registry.redeem(forT1.code, "c1"), "t1");
  assertGrants(await registry.redeem(forT2.code, "c1"), "t2");

  await registry.revoke(forT1.code);

  assert.equal(await registry.hasAccess("c1", "t1"), false);
  assert.equal(await registry.hasAccess("c1", "t2"), true);
  assert.deepEqual(await registry.tasksFor("c1"), ["t2"]);
});

test("[happy-3] revoking a used code withdraws only the access that code granted", async () => {
  const { registry } = setup();
  const first = await registry.create("t1");
  const second = await registry.create("t1");
  assertGrants(await registry.redeem(first.code, "c1"), "t1");
  assertGrants(await registry.redeem(second.code, "c2"), "t1");

  await registry.revoke(first.code);

  assert.equal(await registry.hasAccess("c1", "t1"), false);
  assert.equal(await registry.hasAccess("c2", "t1"), true);
});

test("[boundary-4] a used code revoked after its expiry time is revoked and its access withdrawn", async () => {
  const { registry, clock } = setup("2026-03-01T09:00:00.000Z");
  const { code } = await registry.create("t1");
  clock.set("2026-03-10T09:00:00.000Z");
  assertGrants(await registry.redeem(code, "c1"), "t1");
  clock.set("2026-03-20T09:00:00.000Z");

  await registry.revoke(code);

  assert.equal((await listed(registry, "t1", code)).state, "revoked");
  assert.equal(await registry.hasAccess("c1", "t1"), false);
  assert.deepEqual(await registry.tasksFor("c1"), []);
});

test("[boundary-4] a used code can be revoked one millisecond after its expiry time", async () => {
  const { registry, clock } = setup("2026-03-01T09:00:00.000Z");
  const { code } = await registry.create("t1");
  clock.set("2026-03-15T08:59:59.999Z");
  assertGrants(await registry.redeem(code, "c1"), "t1");
  clock.set("2026-03-15T09:00:00.001Z");

  await registry.revoke(code);

  assert.equal((await listed(registry, "t1", code)).state, "revoked");
  assert.equal(await registry.hasAccess("c1", "t1"), false);
});

test("[boundary-5] access taken back is regained with another unused code for the task", async () => {
  const { registry } = setup();
  const first = await registry.create("t1");
  const second = await registry.create("t1");
  assertGrants(await registry.redeem(first.code, "c1"), "t1");
  await registry.revoke(first.code);
  assert.equal(await registry.hasAccess("c1", "t1"), false);

  assertGrants(await registry.redeem(second.code, "c1"), "t1");

  assert.equal(await registry.hasAccess("c1", "t1"), true);
  assert.deepEqual(await registry.tasksFor("c1"), ["t1"]);
});

test("[boundary-5] revoking an already revoked code changes nothing, so regained access is kept", async () => {
  const { registry } = setup();
  const first = await registry.create("t1");
  const second = await registry.create("t1");
  assertGrants(await registry.redeem(first.code, "c1"), "t1");
  await registry.revoke(first.code);
  assertGrants(await registry.redeem(second.code, "c1"), "t1");

  await registry.revoke(first.code);

  assert.equal(await registry.hasAccess("c1", "t1"), true);
  assert.equal((await listed(registry, "t1", first.code)).state, "revoked");
  const regained = await listed(registry, "t1", second.code);
  assert.equal(regained.state, "used");
  assert.equal(regained.usedBy, "c1");
});

// --- Rule: Two redemptions at once -----------------------------------------

async function raceFor(lags: number[], order: ["c1", "c2"] | ["c2", "c1"]) {
  const { registry } = setup("2026-03-01T09:00:00.000Z", {
    store: laggingStore(lags),
  });
  const { code } = await registry.create("t1");

  const [first, second] = await Promise.all(order.map((who) => registry.redeem(code, who)));
  const results = new Map([
    [order[0], first],
    [order[1], second],
  ]);
  return { registry, code, results };
}

async function assertOneWinner(
  registry: InviteRegistry,
  code: string,
  results: Map<string, RedeemResult>,
) {
  const winners = [...results].filter(([, r]) => r.ok).map(([who]) => who);
  assert.equal(winners.length, 1, "exactly one redemption succeeds");
  const [winner] = winners;
  const loser = winner === "c1" ? "c2" : "c1";
  assertGrants(results.get(winner)!, "t1");
  assertFails(results.get(loser)!, "used");

  assert.equal(await registry.hasAccess(winner, "t1"), true);
  assert.equal(await registry.hasAccess(loser, "t1"), false);
  const shown = await listed(registry, "t1", code);
  assert.equal(shown.state, "used");
  assert.equal(shown.usedBy, winner);
}

test("[concurrency-1] only one of two simultaneous redemptions wins", async () => {
  const { registry, code, results } = await raceFor([1], ["c1", "c2"]);
  await assertOneWinner(registry, code, results);
});

test("[concurrency-1] only one wins when store calls resolve after uneven delays", async () => {
  const { registry, code, results } = await raceFor([3, 1, 4, 1, 5, 2, 6], ["c2", "c1"]);
  await assertOneWinner(registry, code, results);
});

// --- Rule: The company sees its codes --------------------------------------

test("[happy-4] a task's codes are listed with when they were made, expire, and their state", async () => {
  const { registry, clock } = setup("2026-02-01T09:00:00.000Z");
  const expired = await registry.create("t1");
  clock.set("2026-03-01T09:00:00.000Z");
  const unused = await registry.create("t1");
  const used = await registry.create("t1");
  const revoked = await registry.create("t1");
  const usedThenRevoked = await registry.create("t1");
  const otherTask = await registry.create("t2");
  clock.set("2026-03-02T09:00:00.000Z");
  assertGrants(await registry.redeem(used.code, "c1"), "t1");
  assertGrants(await registry.redeem(usedThenRevoked.code, "c2"), "t1");
  await registry.revoke(revoked.code);
  await registry.revoke(usedThenRevoked.code);
  clock.set("2026-03-05T09:00:00.000Z");

  const codes = await registry.list("t1");

  assert.deepEqual(
    codes.map((c) => c.code).sort(),
    [expired.code, unused.code, used.code, revoked.code, usedThenRevoked.code].sort(),
  );
  assert.ok(!codes.some((c) => c.code === otherTask.code));

  const e = await listed(registry, "t1", expired.code);
  assert.equal(e.state, "expired");
  assert.equal(e.createdAt.toISOString(), "2026-02-01T09:00:00.000Z");
  assert.equal(e.expiresAt.toISOString(), "2026-02-15T09:00:00.000Z");

  const u = await listed(registry, "t1", unused.code);
  assert.equal(u.state, "unused");
  assert.equal(u.createdAt.toISOString(), "2026-03-01T09:00:00.000Z");
  assert.equal(u.expiresAt.toISOString(), "2026-03-15T09:00:00.000Z");

  const x = await listed(registry, "t1", used.code);
  assert.equal(x.state, "used");
  assert.equal(x.usedBy, "c1");
  assert.equal(x.usedAt?.toISOString(), "2026-03-02T09:00:00.000Z");

  assert.equal((await listed(registry, "t1", revoked.code)).state, "revoked");

  const y = await listed(registry, "t1", usedThenRevoked.code);
  assert.equal(y.state, "revoked");
  assert.equal(y.usedBy, "c2");
  assert.equal(y.usedAt?.toISOString(), "2026-03-02T09:00:00.000Z");
});

test("[happy-4] at its expiry time an unused code lists as 'expired' while a used one stays 'used'", async () => {
  const { registry, clock } = setup("2026-03-01T09:00:00.000Z");
  const unused = await registry.create("t1");
  const used = await registry.create("t1");
  clock.set("2026-03-03T12:00:00.000Z");
  assertGrants(await registry.redeem(used.code, "c1"), "t1");

  clock.set("2026-03-15T08:59:59.999Z");
  assert.equal((await listed(registry, "t1", unused.code)).state, "unused");

  clock.set("2026-03-15T09:00:00.000Z");
  assert.equal((await listed(registry, "t1", unused.code)).state, "expired");
  const shown = await listed(registry, "t1", used.code);
  assert.equal(shown.state, "used");
  assert.equal(shown.usedBy, "c1");
  assert.equal(shown.usedAt?.toISOString(), "2026-03-03T12:00:00.000Z");
});
