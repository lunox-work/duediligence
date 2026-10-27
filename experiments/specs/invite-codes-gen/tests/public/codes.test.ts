import { test } from "node:test";
import assert from "node:assert/strict";
import { InviteRegistry } from "../../src/index.js";
import type { InviteCode, RedeemFailureReason, RedeemResult } from "../../src/index.js";

// ---------------------------------------------------------------------------
// Test doubles: an in-memory store with deterministic delays, a settable
// clock and a queued randomInt. Each test builds its own with setup().

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const T0 = "2026-01-01T00:00:00.000Z";

function drawsFor(code: string): number[] {
  return Array.from(code, (ch) => {
    const index = ALPHABET.indexOf(ch);
    if (index < 0) throw new Error(`test setup: "${ch}" is not in the alphabet`);
    return index;
  });
}

function repeat(value: number, times = 8): number[] {
  return Array.from({ length: times }, () => value);
}

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

class FakeStore {
  readonly data = new Map<string, unknown>();
  gets = 0;
  sets = 0;
  /** When true, each call resolves after fewer ticks than the call before it. */
  laterIsSooner = false;
  private started = 0;
  private nextGetError: Error | undefined;
  private nextSetError: Error | undefined;

  failNextGet(error: Error): void {
    this.nextGetError = error;
  }

  failNextSet(error: Error): void {
    this.nextSetError = error;
  }

  private async delay(): Promise<void> {
    const n = this.started++;
    const ticks = this.laterIsSooner ? Math.max(0, 400 - n) : [1, 3, 0, 2][n % 4];
    for (let i = 0; i < ticks; i++) await tick();
  }

  get = async (key: string): Promise<unknown> => {
    this.gets++;
    const error = this.nextGetError;
    this.nextGetError = undefined;
    await this.delay();
    if (error) throw error;
    return this.data.get(key);
  };

  set = async (key: string, value: unknown): Promise<void> => {
    this.sets++;
    const error = this.nextSetError;
    this.nextSetError = undefined;
    await this.delay();
    if (error) throw error;
    this.data.set(key, value);
  };
}

class FakeClock {
  calls = 0;
  private ms: number;

  constructor(iso: string) {
    this.ms = Date.parse(iso);
  }

  moveTo(iso: string): void {
    this.ms = Date.parse(iso);
  }

  returnInvalidDate(): void {
    this.ms = NaN;
  }

  now = (): Date => {
    this.calls++;
    return new Date(this.ms);
  };
}

class FakeRandom {
  readonly bounds: number[] = [];
  private readonly queue: number[] = [];
  /** Returned once the queue is empty; if unset, an empty queue is a test setup error. */
  always: number | undefined;

  queueValues(...values: number[]): void {
    this.queue.push(...values);
  }

  queueCode(code: string): void {
    this.queue.push(...drawsFor(code));
  }

  get calls(): number {
    return this.bounds.length;
  }

  randomInt = (bound: number): number => {
    this.bounds.push(bound);
    const next = this.queue.shift();
    if (next !== undefined) return next;
    if (this.always !== undefined) return this.always;
    throw new Error("test setup: randomInt queue is empty");
  };
}

function setup(start: string = T0) {
  const store = new FakeStore();
  const clock = new FakeClock(start);
  const random = new FakeRandom();
  const registry = new InviteRegistry({ store, now: clock.now, randomInt: random.randomInt });
  return { store, clock, random, registry };
}

type Env = ReturnType<typeof setup>;

async function createCode(env: Env, taskId: string, code: string): Promise<InviteCode> {
  env.random.queueCode(code);
  const created = await env.registry.create(taskId);
  assert.equal(created.code, code);
  return created;
}

async function listed(env: Env, taskId: string, code: string): Promise<InviteCode> {
  const found = (await env.registry.list(taskId)).find((c) => c.code === code);
  if (found === undefined) throw new assert.AssertionError({ message: `${code} is not listed for ${taskId}` });
  return found;
}

async function rejectsWith(
  promise: Promise<unknown>,
  type: new (...args: any[]) => Error,
  message: string,
  label = "",
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof type, `${label} expected a ${type.name}, got ${String(error)}`);
    assert.equal((error as Error).message, message, label);
    return true;
  });
}

const granted = (taskId: string): RedeemResult => ({ ok: true, taskId });
const refused = (reason: RedeemFailureReason): RedeemResult => ({ ok: false, reason });
const at = (iso: string): Date => new Date(iso);

// ---------------------------------------------------------------------------
// Rule: a code is 8 characters drawn from a fixed 32-character alphabet

test("[happy-1] create turns 8 random draws into the canonical code", async () => {
  const env = setup();
  env.random.queueValues(0, 1, 2, 3, 24, 25, 26, 27);
  const created = await env.registry.create("task-1");
  assert.deepEqual(
    { ...created },
    {
      code: "ABCD2345",
      taskId: "task-1",
      createdAt: at("2026-01-01T00:00:00.000Z"),
      expiresAt: at("2026-01-15T00:00:00.000Z"),
      state: "unused",
    },
  );
  assert.equal("usedBy" in created, false);
  assert.equal("usedAt" in created, false);
  assert.deepEqual(env.random.bounds, repeat(32));
});

test("[happy-1] boundary: draws across the letter/digit seam map left to right", async () => {
  const env = setup();
  env.random.queueValues(22, 23, 24, 25, 8, 7, 13, 12);
  const created = await env.registry.create("task-1");
  assert.equal(created.code, "YZ23JHPN");
  assert.deepEqual(env.random.bounds, repeat(32));
});

test("[boundary-1] the first and last alphabet characters are reachable", async () => {
  for (const [draws, code] of [
    [repeat(0), "AAAAAAAA"],
    [repeat(31), "99999999"],
  ] as const) {
    const env = setup();
    env.random.queueValues(...draws);
    assert.equal((await env.registry.create("task-1")).code, code);
  }
});

test("[boundary-1] boundary: the characters next to the skipped I, O, 0 and 1 are reachable", async () => {
  const env = setup();
  env.random.queueValues(7, 8, 12, 13, 23, 24, 30, 31);
  assert.equal((await env.registry.create("task-1")).code, "HJNPZ289");
});

test("[unhappy-1] a randomInt result outside 0..31 or not an integer is rejected", async () => {
  for (const bad of [-1, 32, 1.5, NaN]) {
    const env = setup();
    env.random.queueValues(0, 0, 0, bad);
    env.random.always = 0;
    await rejectsWith(env.registry.create("task-1"), RangeError, "randomInt returned an out-of-range value", `bad=${bad}`);
    assert.deepEqual(await env.registry.list("task-1"), [], `bad=${bad}`);
  }
});

test("[unhappy-1] boundary: an out-of-range value on the 8th draw is still rejected", async () => {
  const env = setup();
  env.random.queueValues(0, 0, 0, 0, 0, 0, 0, 32);
  await rejectsWith(env.registry.create("task-1"), RangeError, "randomInt returned an out-of-range value");
  assert.deepEqual(await env.registry.list("task-1"), []);
});

// Rule: a code that repeats any code already in the registry is drawn again, at most 10 attempts

test("[happy-2] a repeated code is redrawn", async () => {
  const env = setup();
  await createCode(env, "task-1", "AAAAAAAA");
  env.random.queueValues(...repeat(0), ...repeat(1));
  const before = env.random.calls;
  assert.equal((await env.registry.create("task-2")).code, "BBBBBBBB");
  assert.equal(env.random.calls - before, 16);
});

test("[happy-2] boundary: a code differing from an existing one only in its last character is not a repeat", async () => {
  const env = setup();
  await createCode(env, "task-1", "AAAAAAAA");
  env.random.queueValues(0, 0, 0, 0, 0, 0, 0, 1);
  const before = env.random.calls;
  assert.equal((await env.registry.create("task-2")).code, "AAAAAAAB");
  assert.equal(env.random.calls - before, 8);
});

test("[boundary-2] a revoked code of another task still counts as taken", async () => {
  const env = setup();
  await createCode(env, "task-1", "AAAAAAAA");
  await env.registry.revoke("AAAAAAAA");
  env.random.queueValues(...repeat(0), ...repeat(2));
  assert.equal((await env.registry.create("task-9")).code, "CCCCCCCC");
});

test("[boundary-2] boundary: used and expired codes of another task still count as taken", async () => {
  const env = setup();
  await createCode(env, "task-1", "AAAAAAAA");
  assert.deepEqual(await env.registry.redeem("AAAAAAAA", "alice"), granted("task-1"));
  await createCode(env, "task-1", "BBBBBBBB");
  env.clock.moveTo("2026-01-15T00:00:00.000Z");
  assert.equal((await listed(env, "task-1", "BBBBBBBB")).state, "expired");
  env.random.queueValues(...repeat(0), ...repeat(1), ...repeat(2));
  const before = env.random.calls;
  assert.equal((await env.registry.create("task-9")).code, "CCCCCCCC");
  assert.equal(env.random.calls - before, 24);
});

test("[boundary-3] the 10th attempt may still succeed", async () => {
  const env = setup();
  await createCode(env, "task-1", "AAAAAAAA");
  for (let i = 0; i < 9; i++) env.random.queueValues(...repeat(0));
  env.random.queueValues(...repeat(3));
  const before = env.random.calls;
  assert.equal((await env.registry.create("task-1")).code, "DDDDDDDD");
  assert.equal(env.random.calls - before, 80);
});

test("[boundary-3] boundary: nine repeats of different existing codes, then a fresh code on the 10th attempt", async () => {
  const env = setup();
  await createCode(env, "task-1", "AAAAAAAA");
  await createCode(env, "task-2", "BBBBBBBB");
  for (let i = 0; i < 9; i++) env.random.queueValues(...repeat(i % 2));
  env.random.queueValues(...repeat(2));
  assert.equal((await env.registry.create("task-1")).code, "CCCCCCCC");
  assert.deepEqual(
    (await env.registry.list("task-1")).map((c) => c.code),
    ["AAAAAAAA", "CCCCCCCC"],
  );
});

test("[unhappy-2] ten repeats in a row give up", async () => {
  const env = setup();
  await createCode(env, "task-1", "AAAAAAAA");
  env.random.always = 0;
  const before = env.random.calls;
  await rejectsWith(env.registry.create("task-1"), Error, "could not generate a unique code");
  assert.equal(env.random.calls - before, 80);
  assert.deepEqual(
    (await env.registry.list("task-1")).map((c) => c.code),
    ["AAAAAAAA"],
  );
});

test("[unhappy-2] boundary: ten repeats of different existing codes give up without an 11th attempt", async () => {
  const env = setup();
  await createCode(env, "task-1", "AAAAAAAA");
  await createCode(env, "task-1", "BBBBBBBB");
  for (let i = 0; i < 10; i++) env.random.queueValues(...repeat(i % 2));
  env.random.queueValues(...repeat(2));
  const before = env.random.calls;
  await rejectsWith(env.registry.create("task-2"), Error, "could not generate a unique code");
  assert.equal(env.random.calls - before, 80);
  assert.deepEqual(await env.registry.list("task-2"), []);
  assert.deepEqual(
    (await env.registry.list("task-1")).map((c) => c.code),
    ["AAAAAAAA", "BBBBBBBB"],
  );
});

// Rule: a code expires exactly 14 days (1,209,600,000 ms) after it was created

test("[boundary-4] redeeming 1 ms before the expiry instant succeeds; at the instant it is expired", async () => {
  for (const [now, result] of [
    ["2026-01-14T23:59:59.999Z", granted("task-1")],
    ["2026-01-15T00:00:00.000Z", refused("expired")],
  ] as const) {
    const env = setup();
    env.random.queueValues(0, 1, 2, 3, 24, 25, 26, 27);
    const created = await env.registry.create("task-1");
    assert.equal(created.code, "ABCD2345");
    assert.deepEqual(created.createdAt, at("2026-01-01T00:00:00.000Z"));
    env.clock.moveTo(now);
    assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), result, now);
  }
});

test("[boundary-4] boundary: long after expiry the code is still expired and grants nothing", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  env.clock.moveTo("2026-03-01T00:00:00.000Z");
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), refused("expired"));
  assert.equal(await env.registry.hasAccess("alice", "task-1"), false);
  assert.equal((await listed(env, "task-1", "ABCD2345")).state, "expired");
});

test("[boundary-5] expiry ignores daylight-saving changes", async () => {
  const env = setup("2026-03-20T12:00:00.000Z");
  env.random.queueValues(...repeat(0));
  const created = await env.registry.create("task-1");
  assert.deepEqual(created.createdAt, at("2026-03-20T12:00:00.000Z"));
  assert.deepEqual(created.expiresAt, at("2026-04-03T12:00:00.000Z"));
});

test("[boundary-5] boundary: expiry is exact to the millisecond across a leap day", async () => {
  const env = setup("2028-02-20T23:59:59.999Z");
  env.random.queueValues(...repeat(0));
  const created = await env.registry.create("task-1");
  assert.deepEqual(created.expiresAt, at("2028-03-05T23:59:59.999Z"));
  assert.equal(created.expiresAt.getTime() - created.createdAt.getTime(), 1_209_600_000);
});

test("[unhappy-3] an invalid date from the clock is rejected by create", async () => {
  const env = setup();
  env.clock.returnInvalidDate();
  env.random.always = 0;
  await rejectsWith(env.registry.create("task-1"), RangeError, "clock returned an invalid date");
  assert.equal(env.random.calls, 0);
});

test("[unhappy-3] boundary: redeem and list reject the same way when the clock returns an invalid date", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  env.clock.returnInvalidDate();
  await rejectsWith(env.registry.redeem("ABCD2345", "alice"), RangeError, "clock returned an invalid date");
  await rejectsWith(env.registry.list("task-1"), RangeError, "clock returned an invalid date");
});
