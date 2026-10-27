import { test } from "node:test";
import assert from "node:assert/strict";
import { createEscrowHandler } from "../../src/index.js";
import type { EscrowEventKind, EscrowState, EscrowStore } from "../../src/index.js";

type Method = "get" | "set";

function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * The Background's store, where get and set each resolve only after a
 * macrotask delay. It counts calls and logs when each one starts and ends.
 * A failure queued with failOnce rejects the next call of that method, also
 * after the delay.
 */
function slowStore() {
  let state: EscrowState | undefined;
  const counts = { get: 0, set: 0 };
  const log: string[] = [];
  const failures: Record<Method, unknown[]> = { get: [], set: [] };
  const store: EscrowStore = {
    async get() {
      const n = ++counts.get;
      log.push(`get${n} start`);
      await tick();
      log.push(`get${n} end`);
      if (failures.get.length > 0) throw failures.get.shift();
      return state;
    },
    async set(next: EscrowState) {
      const n = ++counts.set;
      log.push(`set${n} start`);
      await tick();
      log.push(`set${n} end`);
      if (failures.set.length > 0) throw failures.set.shift();
      state = next;
    },
  };
  function failOnce(method: Method, error: unknown): void {
    failures[method].push(error);
  }
  return { store, counts, log, failOnce };
}

/** Waits for every promise, keeping each outcome. */
function outcomes(promises: Promise<EscrowState>[]) {
  return Promise.allSettled(promises);
}

function assertNotPassed(error: unknown): void {
  assert.ok(error instanceof Error, `expected an Error, got ${String(error)}`);
  const { message } = error as Error;
  assert.ok(
    message.includes("hidden tests have not passed"),
    `expected the message to contain "hidden tests have not passed", got "${message}"`,
  );
}

function event(id: string, kind: EscrowEventKind) {
  return { id, kind };
}

const LOCKED: EscrowState = { status: "locked", releases: [] };
const PARTIAL: EscrowState = {
  status: "partially released",
  releases: [{ kind: "hidden-tests", amount: 750 }],
};
const FULL: EscrowState = {
  status: "fully released",
  releases: [
    { kind: "hidden-tests", amount: 750 },
    { kind: "uat", amount: 250 },
  ],
};

test("[concurrency-1] the same pass delivered twice at the same time releases once", async () => {
  const { store, counts } = slowStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  const results = await Promise.all([
    handler.handle(event("e1", "hidden-tests-passed")),
    handler.handle(event("e1", "hidden-tests-passed")),
  ]);
  assert.deepEqual(results, [PARTIAL, PARTIAL]);
  assert.equal(counts.set, 1);
});

test("[concurrency-1] overlapping passes with different ids release once, the second reading after the write", async () => {
  const { store, counts, log } = slowStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  const results = await Promise.all([
    handler.handle(event("e1", "hidden-tests-passed")),
    handler.handle(event("e2", "hidden-tests-passed")),
  ]);
  assert.deepEqual(results, [PARTIAL, PARTIAL]);
  assert.deepEqual(counts, { get: 2, set: 1 });
  assert.deepEqual(log, ["get1 start", "get1 end", "set1 start", "set1 end", "get2 start", "get2 end"]);
});

test("[concurrency-2] duplicate UAT approvals at the same time release the rest once", async () => {
  const { store, counts } = slowStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  await handler.handle(event("e1", "hidden-tests-passed"));
  const results = await Promise.all([
    handler.handle(event("e2", "uat-approved")),
    handler.handle(event("e2", "uat-approved")),
    handler.handle(event("e2", "uat-approved")),
  ]);
  assert.deepEqual(results, [FULL, FULL, FULL]);
  assert.equal(counts.set, 2);
});

test("[concurrency-2] UAT approvals queued right behind the pass release the rest once", async () => {
  const { store, counts } = slowStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  const results = await Promise.all([
    handler.handle(event("e1", "hidden-tests-passed")),
    handler.handle(event("e2", "uat-approved")),
    handler.handle(event("e3", "uat-approved")),
    handler.handle(event("e2", "uat-approved")),
  ]);
  assert.deepEqual(results, [PARTIAL, FULL, FULL, FULL]);
  assert.equal(counts.set, 2);
});

test("[concurrency-3] overlapping pass then approval both succeed in call order", async () => {
  const { store } = slowStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  const first = handler.handle(event("e1", "hidden-tests-passed"));
  const second = handler.handle(event("e2", "uat-approved"));
  assert.deepEqual(await first, PARTIAL);
  assert.deepEqual(await second, FULL);
});

test("[concurrency-3] overlapping failed run, pass and approval behave as in sequence", async () => {
  const { store, counts } = slowStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  const results = await Promise.all([
    handler.handle(event("f1", "hidden-tests-failed")),
    handler.handle(event("e1", "hidden-tests-passed")),
    handler.handle(event("e2", "uat-approved")),
  ]);
  assert.deepEqual(results, [LOCKED, PARTIAL, FULL]);
  assert.deepEqual(counts, { get: 3, set: 2 });
});

test("[concurrency-4] overlapping approval then pass reject the approval and release the share", async () => {
  const { store } = slowStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  const [approval, pass] = await outcomes([
    handler.handle(event("e2", "uat-approved")),
    handler.handle(event("e1", "hidden-tests-passed")),
  ]);
  assert.equal(approval.status, "rejected");
  if (approval.status === "rejected") assertNotPassed(approval.reason);
  assert.equal(pass.status, "fulfilled");
  if (pass.status === "fulfilled") assert.deepEqual(pass.value, PARTIAL);
});

test("[concurrency-4] an approval queued after the pass succeeds where the one before it was rejected", async () => {
  const { store, counts } = slowStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  const [early, pass, late] = await outcomes([
    handler.handle(event("e2", "uat-approved")),
    handler.handle(event("e1", "hidden-tests-passed")),
    handler.handle(event("e2", "uat-approved")),
  ]);
  assert.equal(early.status, "rejected");
  if (early.status === "rejected") assertNotPassed(early.reason);
  assert.deepEqual(pass, { status: "fulfilled", value: PARTIAL });
  assert.deepEqual(late, { status: "fulfilled", value: FULL });
  assert.equal(counts.set, 2);
});

test("[concurrency-5] a set failure does not block the call queued behind it", async () => {
  const { store, failOnce } = slowStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  const failure = new Error("set failed");
  failOnce("set", failure);
  const [first, second] = await outcomes([
    handler.handle(event("e1", "hidden-tests-passed")),
    handler.handle(event("e1", "hidden-tests-passed")),
  ]);
  assert.equal(first.status, "rejected");
  if (first.status === "rejected") assert.equal(first.reason, failure);
  assert.deepEqual(second, { status: "fulfilled", value: PARTIAL });
  assert.deepEqual(await store.get(), PARTIAL);
});

test("[concurrency-5] a get failure does not block the calls queued behind it", async () => {
  const { store, counts, failOnce } = slowStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  const failure = new Error("get failed");
  failOnce("get", failure);
  const [first, second, third] = await outcomes([
    handler.handle(event("e1", "hidden-tests-passed")),
    handler.handle(event("e1", "hidden-tests-passed")),
    handler.handle(event("e2", "uat-approved")),
  ]);
  assert.equal(first.status, "rejected");
  if (first.status === "rejected") assert.equal(first.reason, failure);
  assert.deepEqual(second, { status: "fulfilled", value: PARTIAL });
  assert.deepEqual(third, { status: "fulfilled", value: FULL });
  assert.deepEqual(counts, { get: 3, set: 2 });
});
