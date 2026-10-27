import { test } from "node:test";
import assert from "node:assert/strict";
import { InviteRegistry } from "../../src/index.js";
import type { RedeemResult, Store } from "../../src/index.js";

function tick(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

/**
 * An in-memory store whose calls resolve only after other work has run:
 * `get` reads when it is called and `set` writes when it resolves, each
 * after the number of event-loop turns the next delay gives.
 */
function slowStore(delays: number[]): Store {
  const data = new Map<string, unknown>();
  let call = 0;
  const wait = async () => {
    const turns = delays[call++ % delays.length];
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

function setup(delays: number[]) {
  const time = Date.parse("2026-03-01T09:00:00Z");
  let n = 0;
  return new InviteRegistry({
    store: slowStore(delays),
    now: () => new Date(time),
    randomInt: (bound: number) => n++ % bound,
  });
}

async function race(registry: InviteRegistry) {
  const { code } = await registry.create("t1");
  const [r1, r2] = await Promise.all([
    registry.redeem(code, "c1"),
    registry.redeem(code, "c2"),
  ]);
  return { code, r1, r2 };
}

function assertOneWins(r1: RedeemResult, r2: RedeemResult): "c1" | "c2" {
  const winners = [r1, r2].filter((r) => r.ok);
  assert.equal(winners.length, 1, "exactly one redemption succeeds");
  const winner = r1.ok ? "c1" : "c2";
  const [won, lost] = r1.ok ? [r1, r2] : [r2, r1];
  assert.equal(won.ok && won.taskId, "t1");
  assert.equal(lost.ok, false);
  assert.equal(!lost.ok && lost.reason, "used");
  return winner;
}

test("[concurrency-1] of two simultaneous redemptions exactly one wins and the other fails with used", async () => {
  const registry = setup([2]);
  const { r1, r2 } = await race(registry);

  assertOneWins(r1, r2);
});

test("[concurrency-1] exactly one contributor has access through the code, and it is the winner", async () => {
  const registry = setup([2]);
  const { code, r1, r2 } = await race(registry);
  const winner = assertOneWins(r1, r2);
  const loser = winner === "c1" ? "c2" : "c1";

  assert.equal(await registry.hasAccess(winner, "t1"), true);
  assert.equal(await registry.hasAccess(loser, "t1"), false);
  assert.deepEqual(await registry.tasksFor(loser), []);
  const listed = (await registry.list("t1")).find((c) => c.code === code);
  assert.equal(listed?.state, "used");
  assert.equal(listed?.usedBy, winner);
});

test("[concurrency-1] exactly one wins when the store's calls resolve out of order", async () => {
  const registry = setup([5, 0, 3, 1, 4, 0, 2, 6]);
  const { code, r1, r2 } = await race(registry);
  const winner = assertOneWins(r1, r2);
  const loser = winner === "c1" ? "c2" : "c1";

  assert.equal(await registry.hasAccess(winner, "t1"), true);
  assert.equal(await registry.hasAccess(loser, "t1"), false);
  const listed = (await registry.list("t1")).find((c) => c.code === code);
  assert.equal(listed?.usedBy, winner);
});
