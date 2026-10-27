import { test } from "node:test";
import assert from "node:assert/strict";
import { InviteRegistry } from "../../src/index.js";
import type { InviteCode, RedeemResult, Store } from "../../src/index.js";

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

function setup(delays: number[], startIso = "2026-03-01T09:00:00Z") {
  const time = Date.parse(startIso);
  let n = 0;
  return new InviteRegistry({
    store: slowStore(delays),
    now: () => new Date(time),
    randomInt: (bound: number) => n++ % bound,
  });
}

/** Checks exactly one result succeeded for the task and every other failed with the reason; returns the winner's index. */
function assertOneWins(results: RedeemResult[], taskId: string, reason: string): number {
  const winners = results.flatMap((r, i) => (r.ok ? [i] : []));
  assert.equal(winners.length, 1, "exactly one redemption succeeds");
  const won = results[winners[0]];
  assert.equal(won.ok && won.taskId, taskId);
  for (const r of results) {
    if (r === won) continue;
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.reason, reason);
  }
  return winners[0];
}

const PATTERNS = [[0], [1], [3, 0], [0, 3], [7, 1, 0, 4], [2, 5, 0, 0, 1], [4, 4, 0, 9, 1, 3]];

// Extends "[concurrency-1] of two simultaneous redemptions exactly one wins and the other fails with used": more contributors.
test("[concurrency-1] of five simultaneous redemptions exactly one wins and the rest fail with used", async () => {
  for (const delays of PATTERNS) {
    const registry = setup(delays);
    const { code } = await registry.create("t1");
    const who = ["c1", "c2", "c3", "c4", "c5"];

    const results = await Promise.all(who.map((c) => registry.redeem(code, c)));
    const winner = who[assertOneWins(results, "t1", "used")];

    for (const c of who) {
      assert.equal(await registry.hasAccess(c, "t1"), c === winner, `${c} with delays ${delays}`);
      assert.deepEqual(await registry.tasksFor(c), c === winner ? ["t1"] : []);
    }
    const listed = (await registry.list("t1")).find((c) => c.code === code);
    assert.equal(listed?.state, "used");
    assert.equal(listed?.usedBy, winner);
  }
});

// Extends "[concurrency-1] exactly one contributor has access through the code, and it is the winner": the code is typed differently by each.
test("[concurrency-1] exactly one wins when each contributor types the code differently", async () => {
  for (const delays of PATTERNS) {
    const registry = setup(delays);
    const { code } = await registry.create("t1");
    const typings = [
      code.toLowerCase(),
      `${code.slice(0, 4)}-${code.slice(4)}`,
      ` ${code.slice(0, 4)} ${code.slice(4)} `,
      code,
    ];
    const who = ["c1", "c2", "c3", "c4"];

    const results = await Promise.all(typings.map((t, i) => registry.redeem(t, who[i])));
    const winner = who[assertOneWins(results, "t1", "used")];

    const holders: string[] = [];
    for (const c of who) if (await registry.hasAccess(c, "t1")) holders.push(c);
    assert.deepEqual(holders, [winner], `delays ${delays}`);
    const listed = (await registry.list("t1")).find((c) => c.code === code);
    assert.equal(listed?.usedBy, winner);
  }
});

// Extends "[concurrency-1] exactly one wins when the store's calls resolve out of order": a code for another task, among other codes.
test("[concurrency-1] a race on one code leaves the task's other codes unused", async () => {
  const registry = setup([5, 0, 3, 1, 4, 0, 2, 6]);
  const other = await registry.create("t2");
  const { code } = await registry.create("t2");
  const spare = await registry.create("t2");

  const results = await Promise.all([registry.redeem(code, "c1"), registry.redeem(code, "c2"), registry.redeem(code, "c3")]);
  const winner = ["c1", "c2", "c3"][assertOneWins(results, "t2", "used")];

  const listed = await registry.list("t2");
  assert.equal(listed.find((c) => c.code === code)?.usedBy, winner);
  assert.equal(listed.find((c) => c.code === other.code)?.state, "unused");
  assert.equal(listed.find((c) => c.code === spare.code)?.state, "unused");
});

// Spans concurrency-1 and boundary-3: one contributor redeems two codes for the same task at once.
test("[boundary-3] a contributor redeeming two codes for one task at once gets one, and the other fails with already has access and stays unused", async () => {
  for (const delays of PATTERNS) {
    const registry = setup(delays);
    const a = await registry.create("t1");
    const b = await registry.create("t1");

    const results = await Promise.all([registry.redeem(a.code, "c1"), registry.redeem(b.code, "c1")]);
    const winner = assertOneWins(results, "t1", "already has access");
    const [usedCode, keptCode] = winner === 0 ? [a.code, b.code] : [b.code, a.code];

    const listed = await registry.list("t1");
    assert.equal(listed.find((c) => c.code === usedCode)?.usedBy, "c1");
    const kept = listed.find((c) => c.code === keptCode);
    assert.equal(kept?.state, "unused", `delays ${delays}`);
    assert.equal(kept?.usedBy, undefined);
    assert.deepEqual(await registry.tasksFor("c1"), ["t1"]);
  }
});

// Extends "[concurrency-1] of two simultaneous redemptions exactly one wins": different codes at once must not lose each other's redemptions.
test("[happy-2] simultaneous redemptions of different codes each grant access and each code shows who used it", async () => {
  for (const delays of PATTERNS) {
    const registry = setup(delays);
    const codes: InviteCode[] = [];
    for (const task of ["t1", "t1", "t2", "t3"]) codes.push(await registry.create(task));
    const who = ["c1", "c2", "c3", "c4"];

    const results = await Promise.all(codes.map((c, i) => registry.redeem(c.code, who[i])));
    results.forEach((r, i) => {
      assert.equal(r.ok, true, `${who[i]} with delays ${delays}`);
      assert.equal(r.ok && r.taskId, codes[i].taskId);
    });

    for (let i = 0; i < codes.length; i++) {
      assert.deepEqual(await registry.tasksFor(who[i]), [codes[i].taskId]);
      const listed = (await registry.list(codes[i].taskId)).find((c) => c.code === codes[i].code);
      assert.equal(listed?.state, "used");
      assert.equal(listed?.usedBy, who[i]);
    }
  }
});

// Extends "[concurrency-1] of two simultaneous redemptions exactly one wins": one contributor gains several tasks at once.
test("[happy-2] a contributor redeeming codes for several tasks at once gains access to all of them", async () => {
  for (const delays of PATTERNS) {
    const registry = setup(delays);
    const codes: InviteCode[] = [];
    for (const task of ["t1", "t2", "t3", "t4"]) codes.push(await registry.create(task));

    const results = await Promise.all(codes.map((c) => registry.redeem(c.code, "c1")));
    for (const r of results) assert.equal(r.ok, true, `delays ${delays}`);

    assert.deepEqual([...(await registry.tasksFor("c1"))].sort(), ["t1", "t2", "t3", "t4"]);
    for (const t of ["t1", "t2", "t3", "t4"]) assert.equal(await registry.hasAccess("c1", t), true);
  }
});

// Extends "[happy-3] a task's codes are listed with when they were made, when they expire, and their state": codes made at once over a slow store.
test("[happy-3] codes made at the same time over a slow store are all listed for their task", async () => {
  for (const delays of PATTERNS) {
    const registry = setup(delays);

    const made = await Promise.all([
      registry.create("t1"),
      registry.create("t1"),
      registry.create("t2"),
      registry.create("t1"),
      registry.create("t1"),
    ]);
    assert.equal(new Set(made.map((c) => c.code)).size, 5);

    const listed = await registry.list("t1");
    assert.deepEqual(
      listed.map((c) => c.code).sort(),
      made.filter((c) => c.taskId === "t1").map((c) => c.code).sort(),
      `delays ${delays}`,
    );
    for (const c of listed) assert.equal(c.state, "unused");
    assert.equal((await registry.list("t2")).length, 1);
  }
});
