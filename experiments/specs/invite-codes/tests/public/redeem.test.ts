import { test } from "node:test";
import assert from "node:assert/strict";
import { InviteRegistry } from "../../src/index.js";
import type { InviteCode, RedeemResult, Store } from "../../src/index.js";

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

/** A registry over an in-memory store, a settable clock and a counting random source. */
function setup(startIso = "2026-03-01T09:00:00Z") {
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

function assertGranted(result: RedeemResult, taskId: string) {
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.taskId, taskId);
}

function assertRefused(result: RedeemResult, reason: string) {
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, reason);
}

async function find(registry: InviteRegistry, taskId: string, code: string): Promise<InviteCode> {
  const found = (await registry.list(taskId)).find((c) => c.code === code);
  if (!found) throw new assert.AssertionError({ message: `code ${code} is listed for ${taskId}` });
  return found;
}

// Redeeming a code grants access to its task

test("[happy-2] redeeming an unused code grants access to its task", async () => {
  const { registry } = setup();
  const { code } = await registry.create("t1");

  assertGranted(await registry.redeem(code, "c1"), "t1");

  assert.equal(await registry.hasAccess("c1", "t1"), true);
  assert.deepEqual(await registry.tasksFor("c1"), ["t1"]);
});

test("[happy-2] the code shows it was used by the contributor, and when", async () => {
  const { registry, at } = setup();
  const { code } = await registry.create("t1");

  at("2026-03-04T12:30:00Z");
  await registry.redeem(code, "c1");

  const listed = await find(registry, "t1", code);
  assert.equal(listed.state, "used");
  assert.equal(listed.usedBy, "c1");
  assert.equal(listed.usedAt?.toISOString(), "2026-03-04T12:30:00.000Z");
});

test("[happy-2] redeeming grants access to no other task and no other contributor", async () => {
  const { registry } = setup();
  const { code } = await registry.create("t1");
  await registry.create("t2");

  await registry.redeem(code, "c1");

  assert.equal(await registry.hasAccess("c1", "t2"), false);
  assert.deepEqual(await registry.tasksFor("c1"), ["t1"]);
  assert.equal(await registry.hasAccess("c2", "t1"), false);
  assert.deepEqual(await registry.tasksFor("c2"), []);
});

// A code is read however it is typed

test("[boundary-1] a code typed in lowercase is the same code", async () => {
  const { registry } = setup();
  const { code } = await registry.create("t1");

  assertGranted(await registry.redeem(code.toLowerCase(), "c1"), "t1");

  const listed = await find(registry, "t1", code);
  assert.equal(listed.state, "used");
  assert.equal(listed.usedBy, "c1");
  assertRefused(await registry.redeem(code, "c2"), "used");
});

test("[boundary-1] a code typed with spaces or with a dash is the same code", async () => {
  const { registry } = setup();
  const spaced = await registry.create("t1");
  const dashed = await registry.create("t1");

  const withSpaces = ` ${spaced.code.slice(0, 4)} ${spaced.code.slice(4)} `;
  const withDash = `${dashed.code.slice(0, 4)}-${dashed.code.slice(4)}`;

  assertGranted(await registry.redeem(withSpaces, "c1"), "t1");
  assertGranted(await registry.redeem(withDash, "c2"), "t1");

  assert.equal((await find(registry, "t1", spaced.code)).usedBy, "c1");
  assert.equal((await find(registry, "t1", dashed.code)).usedBy, "c2");
  assertRefused(await registry.redeem(spaced.code, "c3"), "used");
  assertRefused(await registry.redeem(dashed.code, "c3"), "used");
});

// A code expires exactly 14 days after it was made

test("[boundary-2] a code can be redeemed one millisecond before it expires", async () => {
  const { registry, at } = setup("2026-03-01T09:00:00Z");
  const { code } = await registry.create("t1");

  at("2026-03-15T08:59:59.999Z");
  assertGranted(await registry.redeem(code, "c1"), "t1");
  assert.equal(await registry.hasAccess("c1", "t1"), true);
});

test("[boundary-2] at exactly 14 days redeeming fails with reason expired", async () => {
  const { registry, at } = setup("2026-03-01T09:00:00Z");
  const { code } = await registry.create("t1");

  at("2026-03-15T09:00:00Z");
  assertRefused(await registry.redeem(code, "c1"), "expired");
  assert.equal(await registry.hasAccess("c1", "t1"), false);
  assert.deepEqual(await registry.tasksFor("c1"), []);
});

// A used code cannot be used by someone else

test("[unhappy-1] a code used by one contributor fails for another with reason used", async () => {
  const { registry } = setup();
  const { code } = await registry.create("t1");
  await registry.redeem(code, "c1");

  assertRefused(await registry.redeem(code, "c2"), "used");

  assert.equal(await registry.hasAccess("c2", "t1"), false);
  assert.deepEqual(await registry.tasksFor("c2"), []);
  assert.equal((await find(registry, "t1", code)).usedBy, "c1");
});

test("[unhappy-1] the same contributor redeeming again succeeds and nothing changes", async () => {
  const { registry, at } = setup();
  const { code } = await registry.create("t1");
  at("2026-03-02T10:00:00Z");
  await registry.redeem(code, "c1");

  at("2026-03-03T11:00:00Z");
  assertGranted(await registry.redeem(code, "c1"), "t1");

  const listed = await find(registry, "t1", code);
  assert.equal(listed.state, "used");
  assert.equal(listed.usedBy, "c1");
  assert.equal(listed.usedAt?.toISOString(), "2026-03-02T10:00:00.000Z");
  assert.deepEqual(await registry.tasksFor("c1"), ["t1"]);
  assert.equal((await registry.list("t1")).length, 1);
});

// Unknown and revoked codes are refused

test("[unhappy-2] a code that was never made fails with reason unknown", async () => {
  const { registry } = setup();
  await registry.create("t1");

  assertRefused(await registry.redeem("ZZZZZZZZ", "c1"), "unknown");
  assert.deepEqual(await registry.tasksFor("c1"), []);
});

test("[unhappy-2] a revoked code fails with reason revoked", async () => {
  const { registry } = setup();
  const { code } = await registry.create("t1");

  await registry.revoke(code);

  assertRefused(await registry.redeem(code, "c1"), "revoked");
  assert.equal(await registry.hasAccess("c1", "t1"), false);
});

test("[unhappy-2] a used code cannot be revoked", async () => {
  const { registry } = setup();
  const { code } = await registry.create("t1");
  await registry.redeem(code, "c1");

  await assert.rejects(async () => {
    await registry.revoke(code);
  });

  const listed = await find(registry, "t1", code);
  assert.equal(listed.state, "used");
  assert.equal(listed.usedBy, "c1");
  assert.equal(await registry.hasAccess("c1", "t1"), true);
});

// A contributor needs only one code per task

test("[boundary-3] a second code for a task the contributor already has fails and stays unused", async () => {
  const { registry } = setup();
  const first = await registry.create("t1");
  const second = await registry.create("t1");
  await registry.redeem(first.code, "c1");

  assertRefused(await registry.redeem(second.code, "c1"), "already has access");

  const listed = await find(registry, "t1", second.code);
  assert.equal(listed.state, "unused");
  assert.equal(listed.usedBy, undefined);
  assert.equal(listed.usedAt, undefined);
});

test("[boundary-3] the code refused for already having access can still be used by someone else", async () => {
  const { registry } = setup();
  const first = await registry.create("t1");
  const second = await registry.create("t1");
  await registry.redeem(first.code, "c1");
  await registry.redeem(second.code, "c1");

  assertGranted(await registry.redeem(second.code, "c2"), "t1");
  assert.equal((await find(registry, "t1", second.code)).usedBy, "c2");
});

test("[boundary-3] a contributor with access to one task can still redeem a code for another", async () => {
  const { registry } = setup();
  const forT1 = await registry.create("t1");
  const forT2 = await registry.create("t2");
  await registry.redeem(forT1.code, "c1");

  assertGranted(await registry.redeem(forT2.code, "c1"), "t2");
  assert.deepEqual([...(await registry.tasksFor("c1"))].sort(), ["t1", "t2"]);
});
