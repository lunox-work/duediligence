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
// Rule: all state lives in the store, and a failed store call leaves it unchanged

test("[happy-8] a new registry over the same store sees earlier codes and access", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), granted("task-1"));
  await createCode(env, "task-1", "BBBBBBBB");
  const second = new InviteRegistry({ store: env.store, now: env.clock.now, randomInt: env.random.randomInt });
  assert.equal(await second.hasAccess("alice", "task-1"), true);
  assert.deepEqual(
    (await second.list("task-1")).map((c) => [c.code, c.state, c.usedBy]),
    [
      ["ABCD2345", "used", "alice"],
      ["BBBBBBBB", "unused", undefined],
    ],
  );
  assert.deepEqual(await second.redeem("ABCD2345", "bob"), refused("used"));
});

test("[happy-8] boundary: a new registry with its own clock and randomInt still treats earlier codes as taken", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), granted("task-1"));
  const clock = new FakeClock("2026-01-02T00:00:00.000Z");
  const random = new FakeRandom();
  const second = new InviteRegistry({ store: env.store, now: clock.now, randomInt: random.randomInt });
  random.queueCode("ABCD2345");
  random.queueCode("CCCCCCCC");
  const created = await second.create("task-2");
  assert.equal(created.code, "CCCCCCCC");
  assert.equal(random.calls, 16);
  assert.deepEqual(created.createdAt, at("2026-01-02T00:00:00.000Z"));
  assert.deepEqual(await second.tasksFor("alice"), ["task-1"]);
});

test("[unhappy-13] a store failure during redeem rejects and changes nothing", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  const failure = new Error("disk full");
  env.store.failNextSet(failure);
  await assert.rejects(env.registry.redeem("ABCD2345", "alice"), (error: unknown) => error === failure);
  assert.equal(await env.registry.hasAccess("alice", "task-1"), false);
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), granted("task-1"));
});

test("[unhappy-13] boundary: a failing store get during redeem rejects with that error and changes nothing", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  const failure = new Error("read failed");
  env.store.failNextGet(failure);
  await assert.rejects(env.registry.redeem("ABCD2345", "alice"), (error: unknown) => error === failure);
  assert.equal(await env.registry.hasAccess("alice", "task-1"), false);
  assert.equal((await listed(env, "task-1", "ABCD2345")).state, "unused");
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), granted("task-1"));
});

test("[unhappy-14] a store failure during create stores no code", async () => {
  const env = setup();
  const failure = new Error("disk full");
  env.store.failNextSet(failure);
  env.random.queueCode("ABCD2345");
  await assert.rejects(env.registry.create("task-1"), (error: unknown) => error === failure);
  assert.deepEqual(await env.registry.list("task-1"), []);
});

test("[unhappy-14] boundary: a code whose create failed is not taken, and earlier codes survive", async () => {
  const env = setup();
  await createCode(env, "task-1", "AAAAAAAA");
  const failure = new Error("disk full");
  env.store.failNextSet(failure);
  env.random.queueCode("BBBBBBBB");
  await assert.rejects(env.registry.create("task-1"), (error: unknown) => error === failure);
  assert.deepEqual((await env.registry.list("task-1")).map((c) => c.code), ["AAAAAAAA"]);
  const before = env.random.calls;
  await createCode(env, "task-1", "BBBBBBBB");
  assert.equal(env.random.calls - before, 8);
  assert.deepEqual((await env.registry.list("task-1")).map((c) => c.code), ["AAAAAAAA", "BBBBBBBB"]);
});

// Rule: overlapping calls on one registry run one at a time, in the order they were called

test("[concurrency-1] two contributors racing for one code: the first call wins", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  env.store.laterIsSooner = true;
  const alice = env.registry.redeem("ABCD2345", "alice");
  const bob = env.registry.redeem("abcd-2345", "bob");
  assert.deepEqual(await alice, granted("task-1"));
  assert.deepEqual(await bob, refused("used"));
  assert.equal((await listed(env, "task-1", "ABCD2345")).usedBy, "alice");
});

test("[concurrency-1] boundary: of three racers only the first wins", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  env.store.laterIsSooner = true;
  const results = await Promise.all([
    env.registry.redeem("ABCD2345", "alice"),
    env.registry.redeem("abcd 2345", "bob"),
    env.registry.redeem("ABCD-2345", "carol"),
  ]);
  assert.deepEqual(results, [granted("task-1"), refused("used"), refused("used")]);
  assert.equal(await env.registry.hasAccess("bob", "task-1"), false);
  assert.equal(await env.registry.hasAccess("carol", "task-1"), false);
  assert.equal((await listed(env, "task-1", "ABCD2345")).usedBy, "alice");
});

test("[concurrency-2] one contributor racing two codes for the same task consumes only one", async () => {
  const env = setup();
  await createCode(env, "task-1", "AAAAAAAA");
  await createCode(env, "task-1", "BBBBBBBB");
  const first = env.registry.redeem("BBBBBBBB", "alice");
  const second = env.registry.redeem("AAAAAAAA", "alice");
  assert.deepEqual(await first, granted("task-1"));
  assert.deepEqual(await second, refused("already has access"));
  assert.equal((await listed(env, "task-1", "AAAAAAAA")).state, "unused");
  assert.equal((await listed(env, "task-1", "BBBBBBBB")).state, "used");
});

test("[concurrency-2] boundary: three codes raced with later store calls resolving first consume only the first", async () => {
  const env = setup();
  await createCode(env, "task-1", "AAAAAAAA");
  await createCode(env, "task-1", "BBBBBBBB");
  await createCode(env, "task-1", "CCCCCCCC");
  env.store.laterIsSooner = true;
  const results = await Promise.all([
    env.registry.redeem("BBBBBBBB", "alice"),
    env.registry.redeem("AAAAAAAA", "alice"),
    env.registry.redeem("CCCCCCCC", "alice"),
  ]);
  assert.deepEqual(results, [granted("task-1"), refused("already has access"), refused("already has access")]);
  assert.deepEqual(
    (await env.registry.list("task-1")).map((c) => [c.code, c.state]),
    [
      ["AAAAAAAA", "unused"],
      ["BBBBBBBB", "used"],
      ["CCCCCCCC", "unused"],
    ],
  );
});

test("[concurrency-3] overlapping creates never repeat a code", async () => {
  const env = setup();
  env.random.queueValues(...repeat(0), ...repeat(0), ...repeat(5));
  const first = env.registry.create("task-1");
  const second = env.registry.create("task-2");
  assert.equal((await first).code, "AAAAAAAA");
  assert.equal((await second).code, "FFFFFFFF");
});

test("[concurrency-3] boundary: three overlapping creates with later store calls resolving first", async () => {
  const env = setup();
  env.store.laterIsSooner = true;
  env.random.queueValues(...repeat(0), ...repeat(0), ...repeat(1), ...repeat(0), ...repeat(1), ...repeat(2));
  const created = await Promise.all([
    env.registry.create("task-1"),
    env.registry.create("task-2"),
    env.registry.create("task-1"),
  ]);
  assert.deepEqual(created.map((c) => c.code), ["AAAAAAAA", "BBBBBBBB", "CCCCCCCC"]);
  assert.equal(env.random.calls, 48);
  assert.deepEqual((await env.registry.list("task-1")).map((c) => c.code), ["AAAAAAAA", "CCCCCCCC"]);
});

test("[concurrency-4] revoke and redeem overlapping: call order decides", async () => {
  {
    const env = setup();
    await createCode(env, "task-1", "ABCD2345");
    const redeeming = env.registry.redeem("ABCD2345", "alice");
    const revoking = env.registry.revoke("ABCD2345");
    assert.deepEqual(await redeeming, granted("task-1"));
    await rejectsWith(revoking, Error, "code has been used");
  }
  {
    const env = setup();
    await createCode(env, "task-1", "ABCD2345");
    const revoking = env.registry.revoke("ABCD2345");
    const redeeming = env.registry.redeem("ABCD2345", "alice");
    assert.equal(await revoking, undefined);
    assert.deepEqual(await redeeming, refused("revoked"));
  }
});

test("[concurrency-4] boundary: redeem, revoke, redeem with later store calls resolving first", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  env.store.laterIsSooner = true;
  const alice = env.registry.redeem("ABCD2345", "alice");
  const revoking = env.registry.revoke("ABCD2345");
  const bob = env.registry.redeem("ABCD2345", "bob");
  assert.deepEqual(await alice, granted("task-1"));
  await rejectsWith(revoking, Error, "code has been used");
  assert.deepEqual(await bob, refused("used"));
  const code = await listed(env, "task-1", "ABCD2345");
  assert.equal(code.state, "used");
  assert.equal(code.usedBy, "alice");
});

test("[concurrency-5] a query called during a pending redemption sees its result", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  const redeeming = env.registry.redeem("ABCD2345", "alice");
  const access = env.registry.hasAccess("alice", "task-1");
  const listing = env.registry.list("task-1");
  assert.deepEqual(await redeeming, granted("task-1"));
  assert.equal(await access, true);
  const codes = await listing;
  assert.equal(codes.length, 1);
  assert.equal(codes[0].code, "ABCD2345");
  assert.equal(codes[0].state, "used");
  assert.equal(codes[0].usedBy, "alice");
});

test("[concurrency-5] boundary: a query called just before the redemption does not see it, one just after does", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  env.store.laterIsSooner = true;
  const before = env.registry.hasAccess("alice", "task-1");
  const listedBefore = env.registry.list("task-1");
  const redeeming = env.registry.redeem("ABCD2345", "alice");
  const after = env.registry.hasAccess("alice", "task-1");
  const tasks = env.registry.tasksFor("alice");
  assert.equal(await before, false);
  assert.equal((await listedBefore)[0].state, "unused");
  assert.deepEqual(await redeeming, granted("task-1"));
  assert.equal(await after, true);
  assert.deepEqual(await tasks, ["task-1"]);
});

test("[concurrency-6] a failing call does not block the calls queued after it", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  const revoking = env.registry.revoke("ZZZZZZZZ");
  const redeeming = env.registry.redeem("ABCD2345", "alice");
  await rejectsWith(revoking, Error, "unknown code");
  assert.deepEqual(await redeeming, granted("task-1"));
});

test("[concurrency-6] boundary: a call failing on the store does not block the next, which sees the state before it", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  const failure = new Error("disk full");
  env.store.failNextSet(failure);
  const alice = env.registry.redeem("ABCD2345", "alice");
  const bob = env.registry.redeem("ABCD2345", "bob");
  await assert.rejects(alice, (error: unknown) => error === failure);
  assert.deepEqual(await bob, granted("task-1"));
  assert.equal(await env.registry.hasAccess("alice", "task-1"), false);
  assert.equal(await env.registry.hasAccess("bob", "task-1"), true);
  assert.equal((await listed(env, "task-1", "ABCD2345")).usedBy, "bob");
});
