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
// Rule: access is granted only by redemption and is reported per contributor

test("[happy-6] a contributor's tasks are listed once each, sorted", async () => {
  const env = setup();
  const tasks: Array<[string, string]> = [["task-b", "AAAAAAAA"], ["task-a", "BBBBBBBB"], ["Task-c", "CCCCCCCC"]];
  for (const [taskId, code] of tasks) {
    await createCode(env, taskId, code);
    assert.deepEqual(await env.registry.redeem(code, "alice"), granted(taskId));
  }
  assert.deepEqual(await env.registry.tasksFor("alice"), ["Task-c", "task-a", "task-b"]);
});

test("[happy-6] boundary: tasks sort by UTF-16 code units and a refused second code adds no duplicate", async () => {
  const env = setup();
  const taskIds = ["b", "Ａ", "a", "\u{1F600}", "B", "10", "9", "a "];
  for (const [i, taskId] of taskIds.entries()) {
    const code = ALPHABET[i].repeat(8);
    await createCode(env, taskId, code);
    assert.deepEqual(await env.registry.redeem(code, "alice"), granted(taskId));
  }
  await createCode(env, "b", "JJJJJJJJ");
  assert.deepEqual(await env.registry.redeem("JJJJJJJJ", "alice"), refused("already has access"));
  assert.deepEqual(await env.registry.tasksFor("alice"), ["10", "9", "B", "a", "a ", "b", "\u{1F600}", "Ａ"]);
});

test("[boundary-10] access lookups use exact ids", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), granted("task-1"));
  const cases: Array<[string, string, boolean]> = [
    ["alice", "task-1", true],
    ["Alice", "task-1", false],
    ["alice", "TASK-1", false],
    ["alice", "task-2", false],
    ["bob", "task-1", false],
    ["", "task-1", false],
  ];
  for (const [contributor, task, answer] of cases) {
    assert.equal(await env.registry.hasAccess(contributor, task), answer, `${contributor}/${task}`);
  }
});

test("[boundary-10] boundary: ids are not trimmed", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), granted("task-1"));
  const cases: Array<[string, string]> = [
    ["alice ", "task-1"],
    [" alice", "task-1"],
    ["alice", " task-1"],
    ["alice", "task-1\n"],
  ];
  for (const [contributor, task] of cases) {
    assert.equal(await env.registry.hasAccess(contributor, task), false, JSON.stringify([contributor, task]));
  }
  assert.deepEqual(await env.registry.tasksFor("alice "), []);
});

test("[boundary-11] a contributor with no access has no tasks", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  assert.deepEqual(await env.registry.tasksFor("alice"), []);
});

test("[boundary-11] boundary: failed redemptions grant no tasks", async () => {
  const env = setup();
  await createCode(env, "task-1", "AAAAAAAA");
  await createCode(env, "task-2", "BBBBBBBB");
  await env.registry.revoke("AAAAAAAA");
  env.clock.moveTo("2026-01-15T00:00:00.000Z");
  assert.deepEqual(await env.registry.redeem("AAAAAAAA", "alice"), refused("revoked"));
  assert.deepEqual(await env.registry.redeem("BBBBBBBB", "alice"), refused("expired"));
  assert.deepEqual(await env.registry.redeem("ZZZZZZZZ", "alice"), refused("unknown"));
  assert.deepEqual(await env.registry.tasksFor("alice"), []);
  assert.equal(await env.registry.hasAccess("alice", "task-1"), false);
  assert.equal(await env.registry.hasAccess("alice", "task-2"), false);
});

// Rule: list shows a task's codes in creation order with their state at the current time

test("[happy-7] each state appears as listed", async () => {
  const env = setup();
  await createCode(env, "task-1", "AAAAAAAA");
  await createCode(env, "task-1", "BBBBBBBB");
  await createCode(env, "task-1", "CCCCCCCC");
  env.clock.moveTo("2026-01-02T00:00:00.000Z");
  assert.deepEqual(await env.registry.redeem("BBBBBBBB", "alice"), granted("task-1"));
  await env.registry.revoke("CCCCCCCC");
  env.clock.moveTo("2026-01-10T00:00:00.000Z");
  await createCode(env, "task-1", "DDDDDDDD");
  await createCode(env, "task-2", "EEEEEEEE");
  env.clock.moveTo("2026-01-20T00:00:00.000Z");
  assert.deepEqual(
    (await env.registry.list("task-1")).map((c) => ({ ...c })),
    [
      {
        code: "AAAAAAAA",
        taskId: "task-1",
        createdAt: at("2026-01-01T00:00:00.000Z"),
        expiresAt: at("2026-01-15T00:00:00.000Z"),
        state: "expired",
      },
      {
        code: "BBBBBBBB",
        taskId: "task-1",
        createdAt: at("2026-01-01T00:00:00.000Z"),
        expiresAt: at("2026-01-15T00:00:00.000Z"),
        state: "used",
        usedBy: "alice",
        usedAt: at("2026-01-02T00:00:00.000Z"),
      },
      {
        code: "CCCCCCCC",
        taskId: "task-1",
        createdAt: at("2026-01-01T00:00:00.000Z"),
        expiresAt: at("2026-01-15T00:00:00.000Z"),
        state: "revoked",
      },
      {
        code: "DDDDDDDD",
        taskId: "task-1",
        createdAt: at("2026-01-10T00:00:00.000Z"),
        expiresAt: at("2026-01-24T00:00:00.000Z"),
        state: "unused",
      },
    ],
  );
});

test("[happy-7] boundary: codes with equal createdAt are listed in the order create was called", async () => {
  const env = setup();
  await createCode(env, "task-1", "ZZZZZZZZ");
  await createCode(env, "task-1", "AAAAAAAA");
  await createCode(env, "task-2", "BBBBBBBB");
  await createCode(env, "task-1", "MMMMMMMM");
  await createCode(env, "task-1", "99999999");
  const codes = await env.registry.list("task-1");
  assert.deepEqual(codes.map((c) => c.code), ["ZZZZZZZZ", "AAAAAAAA", "MMMMMMMM", "99999999"]);
  for (const c of codes) assert.deepEqual(c.createdAt, at(T0));
});

test("[boundary-12] a task with no codes lists nothing", async () => {
  const env = setup();
  assert.deepEqual(await env.registry.list("task-404"), []);
});

test("[boundary-12] boundary: the empty id and a differently cased id list nothing", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  assert.deepEqual(await env.registry.list(""), []);
  assert.deepEqual(await env.registry.list("TASK-1"), []);
  assert.deepEqual(await env.registry.list("task-1 "), []);
});

test("[boundary-13] mutating a listed code does not change the registry", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  const first = await env.registry.list("task-1");
  first[0].state = "used";
  first[0].expiresAt = at("2030-01-01");
  const again = await listed(env, "task-1", "ABCD2345");
  assert.equal(again.state, "unused");
  assert.deepEqual(again.expiresAt, at("2026-01-15T00:00:00.000Z"));
});

test("[boundary-13] boundary: mutating listed Dates in place, deleting keys or editing the array does not change the registry", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  env.clock.moveTo("2026-01-03T09:30:00.000Z");
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), granted("task-1"));
  const snapshot = (await env.registry.list("task-1")).map((c) => ({ ...c }));
  const first = await env.registry.list("task-1");
  first[0].createdAt.setTime(0);
  first[0].expiresAt.setTime(0);
  first[0].usedAt?.setTime(0);
  delete first[0].usedBy;
  first.push({ ...first[0], code: "ZZZZZZZZ" });
  assert.deepEqual(
    (await env.registry.list("task-1")).map((c) => ({ ...c })),
    snapshot,
  );
  assert.deepEqual(snapshot[0].usedAt, at("2026-01-03T09:30:00.000Z"));
});

// Rule: invalid arguments are rejected before anything else happens

test("[unhappy-11] bad arguments reject with a TypeError before any collaborator is called", async () => {
  const calls: Array<[string, (r: InviteRegistry) => Promise<unknown>, string]> = [
    ['create("")', (r) => r.create(""), "taskId must be a non-empty string"],
    ["create(42)", (r) => r.create(42 as any), "taskId must be a non-empty string"],
    ['redeem(null, "alice")', (r) => r.redeem(null as any, "alice"), "code must be a string"],
    ['redeem("ABCD2345", "")', (r) => r.redeem("ABCD2345", ""), "contributorId must be a non-empty string"],
    ['redeem("ABCD2345", 7)', (r) => r.redeem("ABCD2345", 7 as any), "contributorId must be a non-empty string"],
    ["revoke(undefined)", (r) => r.revoke(undefined as any), "code must be a string"],
    ['hasAccess(1, "task-1")', (r) => r.hasAccess(1 as any, "task-1"), "contributorId must be a string"],
    ['hasAccess("alice", null)', (r) => r.hasAccess("alice", null as any), "taskId must be a string"],
    ["tasksFor(undefined)", (r) => r.tasksFor(undefined as any), "contributorId must be a string"],
    ["list(5)", (r) => r.list(5 as any), "taskId must be a string"],
  ];
  for (const [label, call, message] of calls) {
    const env = setup();
    let promise: Promise<unknown> | undefined;
    assert.doesNotThrow(() => {
      promise = call(env.registry);
    }, label);
    await rejectsWith(promise!, TypeError, message, label);
    assert.equal(env.clock.calls, 0, `${label}: clock`);
    assert.equal(env.random.calls, 0, `${label}: randomInt`);
    assert.equal(env.store.gets, 0, `${label}: store.get`);
    assert.equal(env.store.sets, 0, `${label}: store.set`);
  }
});

test("[unhappy-11] boundary: the empty string is accepted by redeem's code and by the queries, and matches nothing", async () => {
  const env = setup();
  await createCode(env, "task-1", "ABCD2345");
  assert.deepEqual(await env.registry.redeem("", "alice"), refused("unknown"));
  assert.equal(await env.registry.hasAccess("", "task-1"), false);
  assert.equal(await env.registry.hasAccess("alice", ""), false);
  assert.deepEqual(await env.registry.tasksFor(""), []);
  assert.deepEqual(await env.registry.list(""), []);
});

test("[boundary-14] a whitespace-only task id is accepted", async () => {
  const env = setup();
  env.random.queueValues(...repeat(0));
  const created = await env.registry.create(" ");
  assert.equal(created.taskId, " ");
});

test("[boundary-14] boundary: a whitespace-only task id is kept as-is, not trimmed", async () => {
  const env = setup();
  await createCode(env, "\t\n", "ABCD2345");
  assert.deepEqual(
    (await env.registry.list("\t\n")).map((c) => [c.code, c.taskId]),
    [["ABCD2345", "\t\n"]],
  );
  assert.deepEqual(await env.registry.list(" "), []);
  assert.deepEqual(await env.registry.list(""), []);
  assert.deepEqual(await env.registry.redeem("ABCD2345", "alice"), granted("\t\n"));
  assert.equal(await env.registry.hasAccess("alice", "\t\n"), true);
});

test("[unhappy-12] the constructor rejects a missing randomInt", async () => {
  const env = setup();
  assert.throws(
    () => new InviteRegistry({ store: env.store, now: env.clock.now, randomInt: undefined as any }),
    (error: unknown) => {
      assert.ok(error instanceof TypeError);
      assert.equal((error as Error).message, "invalid registry options");
      return true;
    },
  );
});

test("[unhappy-12] boundary: each missing collaborator is rejected and none is called", async () => {
  const env = setup();
  const { store, clock, random } = env;
  const options: Array<[string, unknown]> = [
    ["store.get", { store: { set: store.set }, now: clock.now, randomInt: random.randomInt }],
    ["store.set", { store: { get: store.get }, now: clock.now, randomInt: random.randomInt }],
    ["now", { store, now: new Date(T0), randomInt: random.randomInt }],
    ["randomInt", { store, now: clock.now, randomInt: 4 }],
  ];
  for (const [missing, bad] of options) {
    assert.throws(
      () => new InviteRegistry(bad as any),
      (error: unknown) => {
        assert.ok(error instanceof TypeError, missing);
        assert.equal((error as Error).message, "invalid registry options", missing);
        return true;
      },
    );
  }
  assert.equal(clock.calls, 0);
  assert.equal(random.calls, 0);
  assert.equal(store.gets, 0);
  assert.equal(store.sets, 0);
});
