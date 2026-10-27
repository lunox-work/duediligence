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

const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const CREATED = "2026-03-01T09:00:00.000Z";
const EXPIRES = "2026-03-15T09:00:00.000Z";
const JUST_BEFORE_EXPIRY = "2026-03-15T08:59:59.999Z";

function fixture(options: { delayed?: boolean; randomInt?: RandomInt } = {}) {
  let time = new Date(CREATED).getTime();
  let draws = 0;
  const values = new Map<string, unknown>();
  const store: Store = {
    async get(key: string): Promise<unknown> {
      if (options.delayed) {
        await Promise.resolve();
        await Promise.resolve();
      }
      // Reads return independent snapshots, as a serialized store would.
      return structuredClone(values.get(key));
    },
    async set(key: string, value: unknown): Promise<void> {
      if (options.delayed) {
        await Promise.resolve();
        await Promise.resolve();
      }
      values.set(key, structuredClone(value));
    },
  };
  const registry = new InviteRegistry({
    store,
    now: () => new Date(time),
    randomInt: options.randomInt ?? ((bound: number) => Math.floor(draws++ / 8) % bound),
  });
  return {
    registry,
    at(iso: string): void {
      time = new Date(iso).getTime();
    },
  };
}

function succeeds(result: RedeemResult, taskId: string): void {
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.taskId, taskId);
}

function fails(result: RedeemResult, reason: RedeemFailureReason): void {
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, reason);
}

async function listed(registry: InviteRegistry, taskId: string, code: string): Promise<InviteCode> {
  const entry = (await registry.list(taskId)).find((item) => item.code === code);
  assert.ok(entry, `Expected ${code} in the list for ${taskId}`);
  return entry!;
}

test("[happy-1] creation uses the supplied random source and sets a 14-day unused lifetime", async () => {
  let index = 0;
  const { registry } = fixture({
    randomInt: (bound: number) => {
      assert.equal(bound, ALPHABET.length);
      return index++ % ALPHABET.length;
    },
  });
  const code = await registry.create("t1");
  assert.equal(code.code, ALPHABET.slice(0, 8));
  assert.equal(code.code.length, 8);
  assert.equal(code.taskId, "t1");
  assert.equal(code.state, "unused");
  assert.equal(code.createdAt.getTime(), new Date(CREATED).getTime());
  assert.equal(code.expiresAt.getTime(), new Date(EXPIRES).getTime());
  assert.equal(code.usedBy, undefined);
  assert.equal(code.usedAt, undefined);
  const stored = await listed(registry, "t1", code.code);
  assert.equal(stored.state, "unused");
  assert.equal(stored.createdAt.getTime(), code.createdAt.getTime());
  assert.equal(stored.expiresAt.getTime(), code.expiresAt.getTime());
});

test("[happy-1] repeated collisions are redrawn even when the existing code belongs to another task", async () => {
  const candidates = "99999999999999999999999922222222";
  let index = 0;
  const { registry } = fixture({
    randomInt: (bound: number) => {
      assert.equal(bound, ALPHABET.length);
      assert.ok(index < candidates.length, "Unexpected extra random draw");
      return ALPHABET.indexOf(candidates[index++]!);
    },
  });
  const first = await registry.create("t1");
  const second = await registry.create("t2");
  assert.equal(first.code, "99999999");
  assert.equal(second.code, "22222222");
  assert.equal(second.state, "unused");
  assert.equal((await listed(registry, "t1", first.code)).taskId, "t1");
  assert.equal((await listed(registry, "t2", second.code)).taskId, "t2");
});

test("[happy-2] redemption grants only the invited task and records the contributor and time", async () => {
  const { registry, at } = fixture();
  const code = await registry.create("t1");
  await registry.create("t2");
  assert.equal(await registry.hasAccess("c1", "t1"), false);
  assert.deepEqual(await registry.tasksFor("c1"), []);
  const redeemedAt = "2026-03-02T12:34:56.789Z";
  at(redeemedAt);
  succeeds(await registry.redeem(code.code, "c1"), "t1");
  assert.equal(await registry.hasAccess("c1", "t1"), true);
  assert.equal(await registry.hasAccess("c1", "t2"), false);
  assert.deepEqual(await registry.tasksFor("c1"), ["t1"]);
  const used = await listed(registry, "t1", code.code);
  assert.equal(used.state, "used");
  assert.equal(used.usedBy, "c1");
  assert.equal(used.usedAt?.getTime(), new Date(redeemedAt).getTime());
});

test("[happy-2] separate invitations add tasks without granting access to another contributor", async () => {
  const { registry } = fixture();
  const first = await registry.create("t1");
  const second = await registry.create("t2");
  succeeds(await registry.redeem(first.code, "c1"), "t1");
  succeeds(await registry.redeem(second.code, "c1"), "t2");
  assert.deepEqual((await registry.tasksFor("c1")).sort(), ["t1", "t2"]);
  assert.equal(await registry.hasAccess("c1", "t1"), true);
  assert.equal(await registry.hasAccess("c1", "t2"), true);
  assert.equal(await registry.hasAccess("c2", "t1"), false);
  assert.equal(await registry.hasAccess("c2", "t2"), false);
  assert.deepEqual(await registry.tasksFor("c2"), []);
});

test("[boundary-1] lowercase, spaces, and hyphens each redeem the canonical code", async () => {
  const forms = [
    (code: string) => code.toLowerCase(),
    (code: string) => `${code.slice(0, 4)} ${code.slice(4)}`,
    (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`,
  ];
  for (const format of forms) {
    const { registry } = fixture();
    const code = await registry.create("t1");
    succeeds(await registry.redeem(format(code.code), "c1"), "t1");
    assert.equal(await registry.hasAccess("c1", "t1"), true);
    const used = await listed(registry, "t1", code.code);
    assert.equal(used.state, "used");
    assert.equal(used.usedBy, "c1");
  }
});

test("[boundary-1] mixed case and combined surrounding and internal separators still identify one code", async () => {
  const { registry } = fixture();
  const code = await registry.create("t1");
  const mixed = code.code.split("").map((char, index) => index % 2 ? char.toLowerCase() : char);
  const typed = `  ${mixed.slice(0, 4).join(" ")}-${mixed.slice(4).join(" ")}  `;
  succeeds(await registry.redeem(typed, "c1"), "t1");
  fails(await registry.redeem(code.code, "c2"), "used");
  assert.equal(await registry.hasAccess("c2", "t1"), false);
  assert.equal((await registry.list("t1")).length, 1);
});

test("[boundary-2] a code can be redeemed one millisecond before its expiry", async () => {
  const { registry, at } = fixture();
  const code = await registry.create("t1");
  at(JUST_BEFORE_EXPIRY);
  succeeds(await registry.redeem(code.code, "c1"), "t1");
  assert.equal(await registry.hasAccess("c1", "t1"), true);
  const used = await listed(registry, "t1", code.code);
  assert.equal(used.state, "used");
  assert.equal(used.usedAt?.getTime(), new Date(JUST_BEFORE_EXPIRY).getTime());
});

test("[boundary-2] a code is expired at exactly 14 days and grants no access", async () => {
  const { registry, at } = fixture();
  const code = await registry.create("t1");
  at(EXPIRES);
  fails(await registry.redeem(code.code, "c1"), "expired");
  assert.equal(await registry.hasAccess("c1", "t1"), false);
  assert.deepEqual(await registry.tasksFor("c1"), []);
  const expired = await listed(registry, "t1", code.code);
  assert.equal(expired.state, "expired");
  assert.equal(expired.usedBy, undefined);
  assert.equal(expired.usedAt, undefined);
});

test("[unhappy-1] a second contributor cannot redeem a used code or change its recorded use", async () => {
  const { registry, at } = fixture();
  const code = await registry.create("t1");
  succeeds(await registry.redeem(code.code, "c1"), "t1");
  const before = structuredClone(await listed(registry, "t1", code.code));
  at("2026-03-02T09:00:00.000Z");
  fails(await registry.redeem(code.code, "c2"), "used");
  assert.equal(await registry.hasAccess("c2", "t1"), false);
  assert.deepEqual(await registry.tasksFor("c2"), []);
  assert.equal(await registry.hasAccess("c1", "t1"), true);
  assert.deepEqual(await listed(registry, "t1", code.code), before);
});

test("[unhappy-1] the original contributor can redeem again without changing use time or duplicating access", async () => {
  const { registry, at } = fixture();
  const code = await registry.create("t1");
  succeeds(await registry.redeem(code.code, "c1"), "t1");
  const before = structuredClone(await registry.list("t1"));
  at("2026-03-02T09:00:00.000Z");
  succeeds(await registry.redeem(code.code, "c1"), "t1");
  assert.deepEqual(await registry.list("t1"), before);
  assert.deepEqual(await registry.tasksFor("c1"), ["t1"]);
  assert.equal(await registry.hasAccess("c1", "t1"), true);
});

test("[unhappy-2] an unknown code is refused without creating access or a listed code", async () => {
  const { registry } = fixture();
  fails(await registry.redeem("99999999", "c1"), "unknown");
  assert.deepEqual(await registry.tasksFor("c1"), []);
  assert.equal(await registry.hasAccess("c1", "t1"), false);
  assert.deepEqual(await registry.list("t1"), []);
});

test("[unhappy-2] revoking an unused code prevents redemption and records its revoked state", async () => {
  const { registry } = fixture();
  const code = await registry.create("t1");
  await registry.revoke(code.code);
  fails(await registry.redeem(code.code, "c1"), "revoked");
  assert.equal(await registry.hasAccess("c1", "t1"), false);
  assert.deepEqual(await registry.tasksFor("c1"), []);
  const revoked = await listed(registry, "t1", code.code);
  assert.equal(revoked.state, "revoked");
  assert.equal(revoked.usedBy, undefined);
  assert.equal(revoked.usedAt, undefined);
});

test("[unhappy-2] revocation rejects a code immediately after use and preserves its access and history", async () => {
  const { registry } = fixture();
  const code = await registry.create("t1");
  succeeds(await registry.redeem(code.code, "c1"), "t1");
  const before = structuredClone(await registry.list("t1"));
  // The wrapper also accepts an implementation that throws synchronously.
  await assert.rejects(async () => { await registry.revoke(code.code); });
  assert.deepEqual(await registry.list("t1"), before);
  assert.equal(await registry.hasAccess("c1", "t1"), true);
  assert.deepEqual(await registry.tasksFor("c1"), ["t1"]);
});

test("[boundary-3] another code for an accessible task is refused and remains unused", async () => {
  const { registry, at } = fixture();
  const first = await registry.create("t1");
  const spare = await registry.create("t1");
  succeeds(await registry.redeem(first.code, "c1"), "t1");
  at("2026-03-02T09:00:00.000Z");
  fails(await registry.redeem(spare.code, "c1"), "already has access");
  const unused = await listed(registry, "t1", spare.code);
  assert.equal(unused.state, "unused");
  assert.equal(unused.usedBy, undefined);
  assert.equal(unused.usedAt, undefined);
  assert.deepEqual(await registry.tasksFor("c1"), ["t1"]);
  assert.equal((await listed(registry, "t1", first.code)).usedBy, "c1");
});

test("[boundary-3] a rejected spare code remains redeemable by another contributor just before expiry", async () => {
  const { registry, at } = fixture();
  const first = await registry.create("t1");
  const spare = await registry.create("t1");
  succeeds(await registry.redeem(first.code, "c1"), "t1");
  at(JUST_BEFORE_EXPIRY);
  fails(await registry.redeem(spare.code, "c1"), "already has access");
  succeeds(await registry.redeem(spare.code, "c2"), "t1");
  assert.equal(await registry.hasAccess("c1", "t1"), true);
  assert.equal(await registry.hasAccess("c2", "t1"), true);
  const used = await listed(registry, "t1", spare.code);
  assert.equal(used.state, "used");
  assert.equal(used.usedBy, "c2");
  assert.equal(used.usedAt?.getTime(), new Date(JUST_BEFORE_EXPIRY).getTime());
});

async function simultaneousRedemptions(formatted: boolean): Promise<void> {
  const { registry, at } = fixture({ delayed: true });
  const code = await registry.create("t1");
  if (formatted) at(JUST_BEFORE_EXPIRY);
  const secondInput = formatted
    ? ` ${code.code.slice(0, 4).toLowerCase()}-${code.code.slice(4).toLowerCase()} `
    : code.code;
  const results = await Promise.all([
    registry.redeem(code.code, "c1"),
    registry.redeem(secondInput, "c2"),
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => !result.ok).length, 1);
  for (const result of results) {
    if (result.ok) succeeds(result, "t1");
    else fails(result, "used");
  }
  const winner = results[0]!.ok ? "c1" : "c2";
  const loser = winner === "c1" ? "c2" : "c1";
  assert.equal(await registry.hasAccess(winner, "t1"), true);
  assert.equal(await registry.hasAccess(loser, "t1"), false);
  assert.deepEqual(await registry.tasksFor(winner), ["t1"]);
  assert.deepEqual(await registry.tasksFor(loser), []);
  const used = await listed(registry, "t1", code.code);
  assert.equal(used.state, "used");
  assert.equal(used.usedBy, winner);
  assert.equal(used.usedAt?.getTime(), new Date(formatted ? JUST_BEFORE_EXPIRY : CREATED).getTime());
}

test("[concurrency-1] exactly one simultaneous redemption wins with delayed store operations", async () => {
  await simultaneousRedemptions(false);
});

test("[concurrency-1] differently typed simultaneous redemptions share one winner just before expiry", async () => {
  await simultaneousRedemptions(true);
});

test("[happy-3] listing a task includes all four states and their dates while excluding other tasks", async () => {
  const { registry, at } = fixture();
  const expired = await registry.create("t1");
  at("2026-03-02T09:00:00.000Z");
  const unused = await registry.create("t1");
  const used = await registry.create("t1");
  const revoked = await registry.create("t1");
  await registry.create("t2");
  const usedTime = "2026-03-02T10:00:00.000Z";
  at(usedTime);
  succeeds(await registry.redeem(used.code, "c1"), "t1");
  await registry.revoke(revoked.code);
  at(EXPIRES);
  const entries = await registry.list("t1");
  assert.equal(entries.length, 4);
  for (const [original, state] of [
    [expired, "expired"], [unused, "unused"], [used, "used"], [revoked, "revoked"],
  ] as const) {
    const entry = entries.find((item) => item.code === original.code);
    assert.ok(entry);
    assert.equal(entry!.taskId, "t1");
    assert.equal(entry!.state, state);
    const made = original.code === expired.code ? CREATED : "2026-03-02T09:00:00.000Z";
    assert.equal(entry!.createdAt.getTime(), new Date(made).getTime());
    assert.equal(entry!.expiresAt.getTime(), new Date(made).getTime() + 14 * 24 * 60 * 60 * 1000);
    assert.equal(entry!.usedBy, state === "used" ? "c1" : undefined);
    assert.equal(entry!.usedAt?.getTime(), state === "used" ? new Date(usedTime).getTime() : undefined);
  }
});

test("[happy-3] listing changes unused to expired at the deadline while used retains its use history afterwards", async () => {
  const { registry, at } = fixture();
  const unused = await registry.create("t1");
  const used = await registry.create("t1");
  succeeds(await registry.redeem(used.code, "c1"), "t1");
  const history = structuredClone(await listed(registry, "t1", used.code));
  at(JUST_BEFORE_EXPIRY);
  assert.equal((await listed(registry, "t1", unused.code)).state, "unused");
  at(EXPIRES);
  assert.equal((await listed(registry, "t1", unused.code)).state, "expired");
  assert.deepEqual(await listed(registry, "t1", used.code), history);
  at("2026-03-16T09:00:00.000Z");
  assert.deepEqual(await listed(registry, "t1", used.code), history);
});
