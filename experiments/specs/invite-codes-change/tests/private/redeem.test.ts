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
const DAY = 24 * 60 * 60 * 1000;

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

/** A store whose calls each wait a number of event-loop turns taken in order from `lags`. */
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

function fixedClock(iso: string) {
  let current = new Date(iso).getTime();
  return {
    now: () => new Date(current),
    set(at: string) {
      current = new Date(at).getTime();
    },
    setMs(ms: number) {
      current = ms;
    },
  };
}

function countingRandom(start = 0): RandomInt {
  let n = start;
  return (bound: number) => n++ % bound;
}

/** Draws `script` first, in order, then counts up from `start`. */
function scriptedRandom(script: number[], start = 100): RandomInt {
  let i = 0;
  let n = start;
  return (bound: number) => (i < script.length ? script[i++] % bound : n++ % bound);
}

/** A deterministic pseudo-random source, so codes vary in every position. */
function seededRandom(seed: number): RandomInt {
  let state = seed >>> 0;
  return (bound: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 8) % bound;
  };
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

async function listed(registry: InviteRegistry, taskId: string, code: string): Promise<InviteCode> {
  const found = (await registry.list(taskId)).find((c) => c.code === code);
  if (found === undefined) assert.fail(`code ${code} is not listed for ${taskId}`);
  return found!;
}

/** `code` typed with every character split by spaces and its case flipped every other character. */
function spreadOut(code: string): string {
  return [...code].map((ch, i) => (i % 2 === 0 ? ch.toLowerCase() : ch)).join(" ");
}

// --- @happy-2: redeeming a code grants access to its task ------------------

// Extends "[happy-2] redeeming grants access to the code's task and to no other":
// more tasks, redeemed out of order.
test("[happy-2] redeeming codes for several tasks grants each code's own task and no others", async () => {
  const { registry } = setup();
  const t1 = await registry.create("t1");
  await registry.create("t2");
  const t3 = await registry.create("t3");
  await registry.create("t4");

  assertGrants(await registry.redeem(t3.code, "c1"), "t3");
  assertGrants(await registry.redeem(t1.code, "c1"), "t1");

  assert.deepEqual((await registry.tasksFor("c1")).sort(), ["t1", "t3"]);
  assert.equal(await registry.hasAccess("c1", "t1"), true);
  assert.equal(await registry.hasAccess("c1", "t2"), false);
  assert.equal(await registry.hasAccess("c1", "t3"), true);
  assert.equal(await registry.hasAccess("c1", "t4"), false);
});

// Extends "[happy-2] redeeming grants access to the code's task and to no other": more contributors.
test("[happy-2] each contributor gets the access of the codes they redeemed and no one else's", async () => {
  const { registry } = setup();
  const plan: [string, string][] = [
    ["c1", "t1"],
    ["c2", "t2"],
    ["c3", "t1"],
    ["c4", "t3"],
    ["c2", "t3"],
  ];
  for (const [who, task] of plan) {
    const { code } = await registry.create(task);
    assertGrants(await registry.redeem(code, who), task);
  }

  assert.deepEqual((await registry.tasksFor("c1")).sort(), ["t1"]);
  assert.deepEqual((await registry.tasksFor("c2")).sort(), ["t2", "t3"]);
  assert.deepEqual((await registry.tasksFor("c3")).sort(), ["t1"]);
  assert.deepEqual((await registry.tasksFor("c4")).sort(), ["t3"]);
  assert.deepEqual(await registry.tasksFor("c5"), []);
  assert.equal(await registry.hasAccess("c1", "t2"), false);
  assert.equal(await registry.hasAccess("c4", "t1"), false);
  assert.equal(await registry.hasAccess("c3", "t1"), true);
});

// Extends "[happy-2] redeeming an unused code grants access to its task": other times of use.
test("[happy-2] each code shows who used it and the time it was redeemed, not when it was made", async () => {
  const { registry, clock } = setup("2026-06-01T00:00:00.000Z");
  const a = await registry.create("t1");
  const b = await registry.create("t1");
  clock.set("2026-06-14T23:59:59.500Z");
  assertGrants(await registry.redeem(a.code, "alice"), "t1");
  clock.set("2026-06-03T07:07:07.007Z");
  assertGrants(await registry.redeem(b.code, "bob"), "t1");
  clock.set("2026-06-04T00:00:00.000Z");

  const shownA = await listed(registry, "t1", a.code);
  assert.equal(shownA.state, "used");
  assert.equal(shownA.usedBy, "alice");
  assert.ok(shownA.usedAt instanceof Date);
  assert.equal(shownA.usedAt?.toISOString(), "2026-06-14T23:59:59.500Z");
  const shownB = await listed(registry, "t1", b.code);
  assert.equal(shownB.state, "used");
  assert.equal(shownB.usedBy, "bob");
  assert.equal(shownB.usedAt?.toISOString(), "2026-06-03T07:07:07.007Z");
});

// Extends "[happy-2] redeeming an unused code grants access to its task": over a slow store.
test("[happy-2] redeeming over a store whose calls resolve late grants access and records the use", async () => {
  const { registry, clock } = setup("2026-03-01T09:00:00.000Z", { store: laggingStore([3, 0, 1, 2]) });
  const { code } = await registry.create("t1");
  await registry.create("t2");
  clock.set("2026-03-04T09:00:00.000Z");

  assertGrants(await registry.redeem(code, "c1"), "t1");

  assert.equal(await registry.hasAccess("c1", "t1"), true);
  assert.equal(await registry.hasAccess("c1", "t2"), false);
  assert.deepEqual(await registry.tasksFor("c1"), ["t1"]);
  const shown = await listed(registry, "t1", code);
  assert.equal(shown.state, "used");
  assert.equal(shown.usedBy, "c1");
  assert.equal(shown.usedAt?.toISOString(), "2026-03-04T09:00:00.000Z");
});

// Extends "[happy-2] redeeming grants access to the code's task and to no other":
// different codes redeemed at the same time must not lose each other's access.
test("[happy-2] one contributor redeeming codes for three tasks at once gets all three", async () => {
  const { registry } = setup("2026-03-01T09:00:00.000Z", { store: laggingStore([1, 2, 0, 3]) });
  const codes = [await registry.create("t1"), await registry.create("t2"), await registry.create("t3")];

  const results = await Promise.all(codes.map((c) => registry.redeem(c.code, "c1")));

  assertGrants(results[0], "t1");
  assertGrants(results[1], "t2");
  assertGrants(results[2], "t3");
  assert.deepEqual((await registry.tasksFor("c1")).sort(), ["t1", "t2", "t3"]);
  for (const c of codes) assert.equal((await listed(registry, c.taskId, c.code)).usedBy, "c1");
});

// Extends "[happy-2] redeeming an unused code grants access to its task":
// different contributors redeeming different codes for one task at once.
test("[happy-2] different contributors redeeming different codes for one task at once all get access", async () => {
  const { registry } = setup("2026-03-01T09:00:00.000Z", { store: laggingStore([2, 1, 0, 4, 1]) });
  const codes = [await registry.create("t1"), await registry.create("t1"), await registry.create("t1")];
  const who = ["c1", "c2", "c3"];

  const results = await Promise.all(codes.map((c, i) => registry.redeem(c.code, who[i])));

  for (const r of results) assertGrants(r, "t1");
  for (let i = 0; i < 3; i++) {
    assert.equal(await registry.hasAccess(who[i], "t1"), true);
    const shown = await listed(registry, "t1", codes[i].code);
    assert.equal(shown.state, "used");
    assert.equal(shown.usedBy, who[i]);
  }
});

// --- @boundary-1: a code is read however it is typed -----------------------

// Extends "[boundary-1] a code redeemed with spaces or a dash in it is the same code": all at once.
test("[boundary-1] a code in lowercase with spaces and a dash in it is the same code", async () => {
  const { registry } = setup();
  const { code } = await registry.create("t1");
  const other = await registry.create("t1");
  const typed = `  ${code.slice(0, 4).toLowerCase()} - ${code.slice(4).toLowerCase()}  `;

  assertGrants(await registry.redeem(typed, "c1"), "t1");

  assert.equal(await registry.hasAccess("c1", "t1"), true);
  const shown = await listed(registry, "t1", code);
  assert.equal(shown.code, code);
  assert.equal(shown.state, "used");
  assert.equal(shown.usedBy, "c1");
  assert.equal((await listed(registry, "t1", other.code)).state, "unused");
});

// Extends "[boundary-1] a code redeemed with spaces or a dash in it is the same code":
// spaces between every character, mixed case, a dash elsewhere.
test("[boundary-1] a code with a space between every character and mixed case is the same code", async () => {
  const { registry } = setup("2026-03-01T09:00:00.000Z", { randomInt: seededRandom(3) });
  const a = await registry.create("t1");
  const b = await registry.create("t2");

  assertGrants(await registry.redeem(spreadOut(a.code), "c1"), "t1");
  const dashed = `${b.code.slice(0, 2).toLowerCase()}-${b.code.slice(2)}`;
  assertGrants(await registry.redeem(dashed, "c1"), "t2");

  assert.deepEqual((await registry.tasksFor("c1")).sort(), ["t1", "t2"]);
  assert.equal((await listed(registry, "t1", a.code)).usedBy, "c1");
  assert.equal((await listed(registry, "t2", b.code)).usedBy, "c1");
});

// Extends "[boundary-1] a code redeemed with spaces or a dash in it is the same code":
// its user retyping it another way, and others typing it other ways.
test("[boundary-1] however a used code is typed, its user gets it again and others are told it is used", async () => {
  const { registry, clock } = setup("2026-03-01T09:00:00.000Z");
  const { code } = await registry.create("t1");
  clock.set("2026-03-02T09:00:00.000Z");
  assertGrants(await registry.redeem(code, "c1"), "t1");
  clock.set("2026-03-03T09:00:00.000Z");

  assertGrants(await registry.redeem(`${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase(), "c1"), "t1");
  assertFails(await registry.redeem(spreadOut(code), "c2"), "used");
  assertFails(await registry.redeem(` ${code.toLowerCase()} `, "c3"), "used");

  const shown = await listed(registry, "t1", code);
  assert.equal(shown.usedBy, "c1");
  assert.equal(shown.usedAt?.toISOString(), "2026-03-02T09:00:00.000Z");
  assert.equal(await registry.hasAccess("c2", "t1"), false);
  assert.equal(await registry.hasAccess("c3", "t1"), false);
});

// Extends "[boundary-1] a code redeemed in lowercase is the same code":
// typed another way, an expired or revoked code is still that code.
test("[boundary-1] typed another way, an expired code is refused 'expired' and a revoked one 'revoked'", async () => {
  const { registry, clock } = setup("2026-03-01T09:00:00.000Z");
  const expiring = await registry.create("t1");
  clock.set("2026-03-10T09:00:00.000Z");
  const revoked = await registry.create("t1");
  await registry.revoke(revoked.code);
  clock.set("2026-03-15T09:00:00.000Z");

  assertFails(await registry.redeem(expiring.code.toLowerCase(), "c1"), "expired");
  assertFails(await registry.redeem(`${revoked.code.slice(0, 3)}-${revoked.code.slice(3)}`, "c1"), "revoked");
  assertFails(await registry.redeem(spreadOut(revoked.code), "c2"), "revoked");
  assert.deepEqual(await registry.tasksFor("c1"), []);
});

// Extends "[boundary-1] a code redeemed in lowercase is the same code": typed another
// way, a second code for a task the contributor has is refused as that code.
test("[boundary-1] typed another way, a second code for a task the contributor has is refused 'already has access'", async () => {
  const { registry } = setup();
  const first = await registry.create("t1");
  const second = await registry.create("t1");
  assertGrants(await registry.redeem(first.code.toLowerCase(), "c1"), "t1");

  assertFails(await registry.redeem(` ${second.code.slice(0, 4)} - ${second.code.slice(4).toLowerCase()}`, "c1"), "already has access");

  assert.equal((await listed(registry, "t1", second.code)).state, "unused");
});

// --- @boundary-2: a code expires exactly 14 days after it was made ---------

// Extends "[boundary-2] a code redeemed exactly 14 days after it was made has expired":
// each code's expiry is measured from its own creation time.
test("[boundary-2] each code expires 14 days after its own creation, to the millisecond", async () => {
  const { registry, clock } = setup("2026-05-10T00:00:00.000Z");
  const early = await registry.create("t1");
  clock.set("2026-05-10T12:34:56.789Z");
  const late = await registry.create("t1");
  const lateToo = await registry.create("t1");

  clock.set("2026-05-24T00:00:00.000Z");
  assertFails(await registry.redeem(early.code, "c1"), "expired");
  assertGrants(await registry.redeem(late.code, "c2"), "t1");

  clock.set("2026-05-24T12:34:56.788Z");
  assertGrants(await registry.redeem(lateToo.code, "c1"), "t1");
  assert.equal(await registry.hasAccess("c1", "t1"), true);
  assert.equal(await registry.hasAccess("c2", "t1"), true);
});

// Extends "[boundary-2] a code redeemed exactly 14 days after it was made has expired":
// one millisecond and a long time after, at another creation time.
test("[boundary-2] a code is refused 'expired' one millisecond after its expiry and long after", async () => {
  const { registry, clock } = setup("2026-11-20T17:45:00.250Z");
  const a = await registry.create("t1");
  const b = await registry.create("t1");

  clock.set("2026-12-04T17:45:00.251Z");
  assertFails(await registry.redeem(a.code, "c1"), "expired");
  clock.set("2027-06-01T00:00:00.000Z");
  assertFails(await registry.redeem(b.code, "c2"), "expired");
  assertFails(await registry.redeem(a.code, "c3"), "expired");

  assert.deepEqual(await registry.tasksFor("c1"), []);
  assert.deepEqual(await registry.tasksFor("c2"), []);
  assert.deepEqual(await registry.tasksFor("c3"), []);
});

// Extends "[boundary-2] a code redeemed exactly 14 days after it was made has expired":
// a refused expired code is left unused, and does not stand in the way of a fresh code.
test("[boundary-2] an expired code refused stays unused, and its contributor can still redeem a fresh code", async () => {
  const { registry, clock } = setup("2026-03-01T09:00:00.000Z");
  const old = await registry.create("t1");
  clock.set("2026-03-15T09:00:00.000Z");
  const fresh = await registry.create("t1");

  assertFails(await registry.redeem(old.code, "c1"), "expired");
  const shown = await listed(registry, "t1", old.code);
  assert.equal(shown.state, "expired");
  assert.equal(shown.usedBy, undefined);
  assert.equal(shown.usedAt, undefined);

  assertGrants(await registry.redeem(fresh.code, "c1"), "t1");
  assert.equal(await registry.hasAccess("c1", "t1"), true);
});

// --- @unhappy-1: a used code cannot be used by someone else ----------------

// Extends "[unhappy-1] a used code redeemed by someone else fails with 'used' and grants nothing": more people.
test("[unhappy-1] everyone else redeeming a used code is refused 'used' and nothing about the code changes", async () => {
  const { registry, clock } = setup("2026-03-01T09:00:00.000Z");
  const { code } = await registry.create("t1");
  clock.set("2026-03-02T09:00:00.000Z");
  assertGrants(await registry.redeem(code, "c1"), "t1");

  for (const [i, who] of ["c2", "c3", "c4", "c5", "c6"].entries()) {
    clock.set(`2026-03-0${3 + i}T09:00:00.000Z`);
    assertFails(await registry.redeem(code, who), "used");
    assert.equal(await registry.hasAccess(who, "t1"), false);
    assert.deepEqual(await registry.tasksFor(who), []);
  }

  const shown = await listed(registry, "t1", code);
  assert.equal(shown.state, "used");
  assert.equal(shown.usedBy, "c1");
  assert.equal(shown.usedAt?.toISOString(), "2026-03-02T09:00:00.000Z");
  assert.equal(await registry.hasAccess("c1", "t1"), true);
});

// Extends "[unhappy-1] a used code redeemed by someone else fails with 'used' and grants nothing":
// the one refused keeps what they already had.
test("[unhappy-1] someone refused a used code keeps the access they already had", async () => {
  const { registry } = setup();
  const forT1 = await registry.create("t1");
  const forT2 = await registry.create("t2");
  assertGrants(await registry.redeem(forT2.code, "c2"), "t2");
  assertGrants(await registry.redeem(forT1.code, "c1"), "t1");

  assertFails(await registry.redeem(forT1.code, "c2"), "used");

  assert.deepEqual(await registry.tasksFor("c2"), ["t2"]);
  assert.equal(await registry.hasAccess("c2", "t1"), false);
  assert.deepEqual(await registry.tasksFor("c1"), ["t1"]);
});

// Extends "[unhappy-1] the contributor who used a code can redeem it again and nothing changes":
// many times, for another task, with others between.
test("[unhappy-1] a code's user redeeming it again and again gets its task and nothing changes", async () => {
  const { registry, clock } = setup("2026-03-01T09:00:00.000Z");
  await registry.create("t1");
  const forT2 = await registry.create("t2");
  clock.set("2026-03-05T10:00:00.000Z");
  assertGrants(await registry.redeem(forT2.code, "c1"), "t2");

  for (const at of ["2026-03-06T10:00:00.000Z", "2026-03-10T10:00:00.000Z", "2026-03-14T10:00:00.000Z"]) {
    clock.set(at);
    assertGrants(await registry.redeem(forT2.code, "c1"), "t2");
    assertFails(await registry.redeem(forT2.code, "c2"), "used");
  }

  assert.deepEqual(await registry.tasksFor("c1"), ["t2"]);
  assert.equal(await registry.hasAccess("c1", "t1"), false);
  const shown = await listed(registry, "t2", forT2.code);
  assert.equal(shown.state, "used");
  assert.equal(shown.usedBy, "c1");
  assert.equal(shown.usedAt?.toISOString(), "2026-03-05T10:00:00.000Z");
});

// --- @unhappy-2: unknown and revoked codes are refused ---------------------

// Extends "[unhappy-2] a code that was never made fails with 'unknown'": other never-made codes.
test("[unhappy-2] codes that were never made are refused 'unknown', however close to a real one", async () => {
  const empty = setup();
  assertFails(await empty.registry.redeem("ABCDEFGH", "c1"), "unknown");

  const { registry } = setup();
  const { code } = await registry.create("t1");
  const last = code[7] === "Z" ? "Y" : "Z";
  const nearMiss = code.slice(0, 7) + last;
  const shifted = code.slice(1) + code[0];

  assertFails(await registry.redeem(nearMiss, "c1"), "unknown");
  assertFails(await registry.redeem(shifted === code ? "22222222" : shifted, "c1"), "unknown");
  assertFails(await registry.redeem(code.slice(0, 7), "c1"), "unknown");
  assertFails(await registry.redeem(`${nearMiss.slice(0, 4)}-${nearMiss.slice(4)}`.toLowerCase(), "c1"), "unknown");
  assert.deepEqual(await registry.tasksFor("c1"), []);
  assert.equal((await listed(registry, "t1", code)).state, "unused");
});

// Extends "[unhappy-2] a revoked code fails with 'revoked'": for anyone, and it stays revoked.
test("[unhappy-2] an unused code that was revoked is refused 'revoked' to everyone", async () => {
  const { registry } = setup();
  const kept = await registry.create("t1");
  const { code } = await registry.create("t1");
  await registry.revoke(code);

  for (const who of ["c1", "c2", "c3"]) {
    assertFails(await registry.redeem(code, who), "revoked");
    assert.equal(await registry.hasAccess(who, "t1"), false);
  }

  const shown = await listed(registry, "t1", code);
  assert.equal(shown.state, "revoked");
  assert.equal(shown.usedBy, undefined);
  assertGrants(await registry.redeem(kept.code, "c1"), "t1");
});

// Extends "[unhappy-2] a used code that is revoked fails with 'revoked' for its user and anyone else":
// its user who has since regained the task through another code.
test("[unhappy-2] a revoked code is refused 'revoked' to its user even after they regained the task", async () => {
  const { registry } = setup();
  const first = await registry.create("t1");
  const second = await registry.create("t1");
  assertGrants(await registry.redeem(first.code, "c1"), "t1");
  await registry.revoke(first.code);
  assertGrants(await registry.redeem(second.code, "c1"), "t1");

  assertFails(await registry.redeem(first.code, "c1"), "revoked");
  assertFails(await registry.redeem(first.code, "c2"), "revoked");

  assert.equal(await registry.hasAccess("c1", "t1"), true);
  assert.equal(await registry.hasAccess("c2", "t1"), false);
  const shown = await listed(registry, "t1", second.code);
  assert.equal(shown.state, "used");
  assert.equal(shown.usedBy, "c1");
});

// --- @boundary-3: a contributor needs only one code per task ---------------

// Extends "[boundary-3] a contributor with access fails another code for the task with 'already has access'":
// several more codes.
test("[boundary-3] every further code for a task the contributor has is refused and stays unused", async () => {
  const { registry, clock } = setup("2026-03-01T09:00:00.000Z");
  const first = await registry.create("t1");
  const more = [await registry.create("t1"), await registry.create("t1"), await registry.create("t1")];
  clock.set("2026-03-02T09:00:00.000Z");
  assertGrants(await registry.redeem(first.code, "c1"), "t1");
  clock.set("2026-03-03T09:00:00.000Z");

  for (const c of more) assertFails(await registry.redeem(c.code, "c1"), "already has access");

  for (const c of more) {
    const shown = await listed(registry, "t1", c.code);
    assert.equal(shown.state, "unused");
    assert.equal(shown.usedBy, undefined);
    assert.equal(shown.usedAt, undefined);
  }
  const used = await listed(registry, "t1", first.code);
  assert.equal(used.usedBy, "c1");
  assert.equal(used.usedAt?.toISOString(), "2026-03-02T09:00:00.000Z");
  assert.deepEqual(await registry.tasksFor("c1"), ["t1"]);

  // Extends "[boundary-3] a code refused with 'already has access' can still be redeemed by someone else".
  clock.set("2026-03-04T12:00:00.000Z");
  assertGrants(await registry.redeem(more[1].code, "c2"), "t1");
  const taken = await listed(registry, "t1", more[1].code);
  assert.equal(taken.usedBy, "c2");
  assert.equal(taken.usedAt?.toISOString(), "2026-03-04T12:00:00.000Z");
});

// Extends "[boundary-3] a contributor with access fails another code for the task with 'already has access'":
// the limit is one code per task, not one per contributor.
test("[boundary-3] access to one task does not stand in the way of a code for another task", async () => {
  const { registry } = setup();
  const forT1 = await registry.create("t1");
  const forT2 = await registry.create("t2");
  const forT3 = await registry.create("t3");
  const another = await registry.create("t1");
  assertGrants(await registry.redeem(forT1.code, "c1"), "t1");

  assertGrants(await registry.redeem(forT2.code, "c1"), "t2");
  assertGrants(await registry.redeem(forT3.code, "c1"), "t3");
  assertFails(await registry.redeem(another.code, "c1"), "already has access");

  assert.deepEqual((await registry.tasksFor("c1")).sort(), ["t1", "t2", "t3"]);
  assert.equal((await listed(registry, "t1", another.code)).state, "unused");
});
