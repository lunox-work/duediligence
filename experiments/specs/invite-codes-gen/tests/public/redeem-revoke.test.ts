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
// Rule: redeem reads a code however it is typed

test("[happy-3] typed variants of ABCD2345 redeem the same code", async () => {
  for (const typed of ["ABCD2345", "abcd2345", "ABCD-2345", "abcd 2345", " AbCd - 23 45 ", "A-B-C-D-2-3-4-5"]) {
    const env = setup();
    await createCode(env, "task-1", "ABCD2345");
    assert.deepEqual(await env.registry.redeem(typed, "alice"), granted("task-1"), JSON.stringify(typed));
  }
});

test("[happy-3] boundary: tabs, newlines, non-breaking spaces and repeated dashes are all removed", async () => {
  for (const typed of ["\tabcd\n2345\r\n", "--ABCD--2345--", " abcd 2345　", "a\fb\vc-d 2-3 4-5"]) {
    const env = setup();
    await createCode(env, "task-1", "ABCD2345");
    assert.deepEqual(await env.registry.redeem(typed, "alice"), granted("task-1"), JSON.stringify(typed));
  }
});

test("[unhappy-4] input that does not normalize to an existing code is unknown", async () => {
  for (const typed of ["", "-", "ABCD234", "ABCD23456", "ABCD_2345", "ABCD.2345", "0BCD2345", "ZZZZZZZZ"]) {
    const env = setup();
    await createCode(env, "task-1", "ABCD2345");
    assert.deepEqual(await env.registry.redeem(typed, "alice"), refused("unknown"), JSON.stringify(typed));
    assert.equal(await env.registry.hasAccess("alice", "task-1"), false, JSON.stringify(typed));
  }
});

test("[unhappy-4] boundary: separators other than whitespace and '-' are not removed", async () => {
  for (const typed of ["ABCD–2345", "ABCD​2345", "ABCD/2345", "ABCD2345!"]) {
    const env = setup();
    await createCode(env, "task-1", "ABCD2345");
    assert.deepEqual(await env.registry.redeem(typed, "alice"), refused("unknown"), JSON.stringify(typed));
    assert.equal(await env.registry.hasAccess("alice", "task-1"), false, JSON.stringify(typed));
  }
});

// Rule: redeeming an unused, unexpired code uses it and grants access to its task

test("[happy-4] a successful redemption records who used the code and when", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  env.clock.moveTo("2026-01-03T09:30:00.000Z");
  assert.deepEqual(await env.registry.redeem("abcd-2345", "alice"), granted("task-1"));
  assert.equal(await env.registry.hasAccess("alice", "task-1"), true);
  assert.deepEqual(
    (await env.registry.list("task-1")).map((c) => ({ ...c })),
    [
      {
        code: "ABCD2345",
        taskId: "task-1",
        createdAt: at("2026-01-01T00:00:00.000Z"),
        expiresAt: at("2026-01-15T00:00:00.000Z"),
        state: "used",
        usedBy: "alice",
        usedAt: at("2026-01-03T09:30:00.000Z"),
      },
    ],
  );
});

test("[happy-4] boundary: a whitespace-only contributor id is recorded as-is", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  env.clock.moveTo("2026-01-14T23:59:59.999Z");
  assert.deepEqual(await env.registry.redeem("ABCD2345", " "), granted("task-1"));
  assert.equal(await env.registry.hasAccess(" ", "task-1"), true);
  assert.equal(await env.registry.hasAccess("", "task-1"), false);
  const code = await listed(env, "task-1", "ABCD2345");
  assert.equal(code.state, "used");
  assert.equal(code.usedBy, " ");
  assert.deepEqual(code.usedAt, at("2026-01-14T23:59:59.999Z"));
});

test("[boundary-6] a used code stays used after its expiry time passes", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  env.clock.moveTo("2026-01-03T09:30:00.000Z");
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), granted("task-1"));
  env.clock.moveTo("2026-06-01T00:00:00.000Z");
  const code = await listed(env, "task-1", "ABCD2345");
  assert.equal(code.state, "used");
  assert.equal(code.usedBy, "alice");
  assert.equal(await env.registry.hasAccess("alice", "task-1"), true);
});

test("[boundary-6] boundary: at the exact expiry instant a used code is still used", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  env.clock.moveTo("2026-01-03T09:30:00.000Z");
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), granted("task-1"));
  env.clock.moveTo("2026-01-15T00:00:00.000Z");
  const code = await listed(env, "task-1", "ABCD2345");
  assert.equal(code.state, "used");
  assert.equal(code.usedBy, "alice");
  assert.deepEqual(code.usedAt, at("2026-01-03T09:30:00.000Z"));
  assert.deepEqual(await env.registry.tasksFor("alice"), ["task-1"]);
});

// Rule: a failed redemption changes nothing and reports the first reason that applies

test("[unhappy-5] a code can be used only once", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), granted("task-1"));
  assert.deepEqual(await env.registry.redeem("ABCD2345", "bob"), refused("used"));
  assert.equal(await env.registry.hasAccess("bob", "task-1"), false);
  assert.equal((await listed(env, "task-1", "ABCD2345")).usedBy, "alice");
});

test("[unhappy-5] boundary: a typed variant of a used code is also used", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), granted("task-1"));
  assert.deepEqual(await env.registry.redeem(" abcd-2345 ", "bob"), refused("used"));
  assert.equal(await env.registry.hasAccess("bob", "task-1"), false);
  assert.deepEqual(await env.registry.tasksFor("bob"), []);
  assert.equal((await listed(env, "task-1", "ABCD2345")).usedBy, "alice");
});

test("[unhappy-6] the same contributor redeeming their own used code again gets used", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), granted("task-1"));
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), refused("used"));
});

test("[unhappy-6] boundary: after expiry the owner's repeat redemption is still used, and access remains", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), granted("task-1"));
  env.clock.moveTo("2026-02-01T00:00:00.000Z");
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), refused("used"));
  assert.equal(await env.registry.hasAccess("alice", "task-1"), true);
});

test("[unhappy-7] a second code for a task the contributor can already access is not consumed", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), granted("task-1"));
  await createCode(env, "task-1", "BBBBBBBB");
  assert.deepEqual(await env.registry.redeem("BBBBBBBB", "alice"), refused("already has access"));
  const code = await listed(env, "task-1", "BBBBBBBB");
  assert.equal(code.state, "unused");
  assert.equal("usedBy" in code, false);
  assert.deepEqual(await env.registry.redeem("BBBBBBBB", "bob"), granted("task-1"));
});

test("[unhappy-7] boundary: access from a code that has since expired still counts", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  env.clock.moveTo("2026-01-02T00:00:00.000Z");
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), granted("task-1"));
  env.clock.moveTo("2026-01-10T00:00:00.000Z");
  await createCode(env, "task-1", "BBBBBBBB");
  env.clock.moveTo("2026-01-20T00:00:00.000Z");
  assert.deepEqual(await env.registry.redeem("BBBBBBBB", "alice"), refused("already has access"));
  assert.equal((await listed(env, "task-1", "BBBBBBBB")).state, "unused");
  assert.deepEqual(await env.registry.redeem("BBBBBBBB", "bob"), granted("task-1"));
});

/** alice has access to task-1 through ABCD2345; CCCCCCCC for task-1 is unused. */
async function aliceWithSecondCode(): Promise<Env> {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  await createCode(env, "task-1", "CCCCCCCC");
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), granted("task-1"));
  return env;
}

test("[boundary-7] reason precedence when several reasons apply", async () => {
  const conditions: Array<[string, (env: Env) => Promise<void>, RedeemFailureReason]> = [
    ["used by bob, and past expiresAt", async (env) => {
      assert.deepEqual(await env.registry.redeem("CCCCCCCC", "bob"), granted("task-1"));
      env.clock.moveTo("2026-02-01T00:00:00.000Z");
    }, "used"],
    ["revoked, and past expiresAt", async (env) => {
      await env.registry.revoke("CCCCCCCC");
      env.clock.moveTo("2026-02-01T00:00:00.000Z");
    }, "revoked"],
    ["unused, and past expiresAt", async (env) => {
      env.clock.moveTo("2026-02-01T00:00:00.000Z");
    }, "expired"],
    ["unused, not expired", async () => {}, "already has access"],
  ];
  for (const [condition, arrange, reason] of conditions) {
    const env = await aliceWithSecondCode();
    await arrange(env);
    assert.deepEqual(await env.registry.redeem("CCCCCCCC", "alice"), refused(reason), condition);
  }
});

test("[boundary-7] boundary: around the expiry instant, expired precedes already has access, and revoked precedes it too", async () => {
  const conditions: Array<[string, (env: Env) => Promise<void>, RedeemFailureReason]> = [
    ["unused, at expiresAt exactly", async (env) => {
      env.clock.moveTo("2026-01-15T00:00:00.000Z");
    }, "expired"],
    ["unused, 1 ms before expiresAt", async (env) => {
      env.clock.moveTo("2026-01-14T23:59:59.999Z");
    }, "already has access"],
    ["revoked, not expired", async (env) => {
      await env.registry.revoke("CCCCCCCC");
    }, "revoked"],
  ];
  for (const [condition, arrange, reason] of conditions) {
    const env = await aliceWithSecondCode();
    await arrange(env);
    assert.deepEqual(await env.registry.redeem("CCCCCCCC", "alice"), refused(reason), condition);
  }
});

test("[unhappy-8] a failed redemption writes nothing to the store", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  await env.registry.revoke("ABCD2345");
  env.store.sets = 0;
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), refused("revoked"));
  assert.equal(env.store.sets, 0);
});

test("[unhappy-8] boundary: unknown, used, already has access and expired failures write nothing either", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  await createCode(env, "task-1", "BBBBBBBB");
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), granted("task-1"));
  env.store.sets = 0;
  assert.deepEqual(await env.registry.redeem("ZZZZZZZZ", "bob"), refused("unknown"));
  assert.deepEqual(await env.registry.redeem("ABCD2345", "bob"), refused("used"));
  assert.deepEqual(await env.registry.redeem("BBBBBBBB", "alice"), refused("already has access"));
  env.clock.moveTo("2026-01-15T00:00:00.000Z");
  assert.deepEqual(await env.registry.redeem("BBBBBBBB", "bob"), refused("expired"));
  assert.equal(env.store.sets, 0);
});

// Rule: revoke stops an unused code from being redeemed and throws for used or unknown codes

test("[happy-5] a revoked code cannot be redeemed", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  assert.equal(await env.registry.revoke("abcd-2345"), undefined);
  const code = await listed(env, "task-1", "ABCD2345");
  assert.equal(code.state, "revoked");
  assert.equal("usedBy" in code, false);
  assert.equal("usedAt" in code, false);
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), refused("revoked"));
});

test("[happy-5] boundary: a code revoked 1 ms before expiry stays revoked after its expiry time", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  env.clock.moveTo("2026-01-14T23:59:59.999Z");
  await env.registry.revoke(" ab cd-23 45 ");
  env.clock.moveTo("2026-01-15T00:00:00.000Z");
  assert.equal((await listed(env, "task-1", "ABCD2345")).state, "revoked");
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), refused("revoked"));
  assert.equal(await env.registry.hasAccess("alice", "task-1"), false);
});

test("[boundary-8] an expired, unused code can be revoked and then lists as revoked", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  env.clock.moveTo("2026-02-01T00:00:00.000Z");
  assert.equal((await listed(env, "task-1", "ABCD2345")).state, "expired");
  assert.equal(await env.registry.revoke("ABCD2345"), undefined);
  assert.equal((await listed(env, "task-1", "ABCD2345")).state, "revoked");
});

test("[boundary-8] boundary: a code can be revoked at its exact expiry instant", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  env.clock.moveTo("2026-01-15T00:00:00.000Z");
  assert.equal(await env.registry.revoke("ABCD2345"), undefined);
  assert.equal((await listed(env, "task-1", "ABCD2345")).state, "revoked");
});

test("[boundary-9] revoking twice is a no-op", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  await env.registry.revoke("ABCD2345");
  assert.equal(await env.registry.revoke("ABCD2345"), undefined);
  assert.equal((await listed(env, "task-1", "ABCD2345")).state, "revoked");
});

test("[boundary-9] boundary: the second revoke, typed differently, writes nothing", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  await env.registry.revoke("ABCD2345");
  env.store.sets = 0;
  assert.equal(await env.registry.revoke("abcd 2345"), undefined);
  assert.equal(env.store.sets, 0);
  assert.equal((await listed(env, "task-1", "ABCD2345")).state, "revoked");
});

test("[unhappy-9] a used code cannot be revoked", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), granted("task-1"));
  await rejectsWith(env.registry.revoke("ABCD2345"), Error, "code has been used");
  const code = await listed(env, "task-1", "ABCD2345");
  assert.equal(code.state, "used");
  assert.equal(code.usedBy, "alice");
  assert.equal(await env.registry.hasAccess("alice", "task-1"), true);
});

test("[unhappy-9] boundary: a used code typed differently and past its expiry still cannot be revoked", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  env.clock.moveTo("2026-01-03T09:30:00.000Z");
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), granted("task-1"));
  env.clock.moveTo("2026-02-01T00:00:00.000Z");
  await rejectsWith(env.registry.revoke("abcd-2345"), Error, "code has been used");
  const code = await listed(env, "task-1", "ABCD2345");
  assert.equal(code.state, "used");
  assert.equal(code.usedBy, "alice");
  assert.deepEqual(code.usedAt, at("2026-01-03T09:30:00.000Z"));
});

test("[unhappy-10] an unknown code cannot be revoked", async () => {
  const env = setup();
  await rejectsWith(env.registry.revoke("ZZZZ-ZZZZ"), Error, "unknown code");
});

test("[unhappy-10] boundary: near-miss codes are unknown and leave the real code untouched", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  for (const typed of ["", "ABCD234", "ABCD23456", "0BCD2345"]) {
    await rejectsWith(env.registry.revoke(typed), Error, "unknown code", JSON.stringify(typed));
  }
  assert.equal((await listed(env, "task-1", "ABCD2345")).state, "unused");
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), granted("task-1"));
});
