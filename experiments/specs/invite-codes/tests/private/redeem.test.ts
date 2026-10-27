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
function setup(startIso = "2026-03-01T09:00:00Z", store: Store = memoryStore()) {
  let time = Date.parse(startIso);
  let n = 0;
  const registry = new InviteRegistry({
    store,
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

async function sortedTasks(registry: InviteRegistry, contributorId: string): Promise<string[]> {
  return [...(await registry.tasksFor(contributorId))].sort();
}

const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

/** The same code with one character changed to another from the alphabet. */
function typo(code: string, at: number): string {
  const next = ALPHABET[(ALPHABET.indexOf(code[at]) + 1) % ALPHABET.length];
  return code.slice(0, at) + next + code.slice(at + 1);
}

// Redeeming a code grants access to its task

// Extends "[happy-2] redeeming an unused code grants access to its task": a code for a task other than the first one made.
test("[happy-2] redeeming a code for one of several tasks grants access to that task alone", async () => {
  const { registry } = setup();
  await registry.create("t1");
  const forT2 = await registry.create("t2");
  await registry.create("t3");

  assertGranted(await registry.redeem(forT2.code, "c1"), "t2");

  assert.equal(await registry.hasAccess("c1", "t2"), true);
  assert.equal(await registry.hasAccess("c1", "t1"), false);
  assert.equal(await registry.hasAccess("c1", "t3"), false);
  assert.deepEqual(await registry.tasksFor("c1"), ["t2"]);
});

// Extends "[happy-2] the code shows it was used by the contributor, and when": several codes, contributors and times.
test("[happy-2] each code shows who used it and when, and codes not redeemed stay unused", async () => {
  const { registry, at } = setup();
  const a = await registry.create("t1");
  const b = await registry.create("t1");
  const c = await registry.create("t1");

  at("2026-03-02T01:02:03.456Z");
  await registry.redeem(b.code, "alice");
  at("2026-03-05T17:00:00Z");
  await registry.redeem(a.code, "bob");

  const la = await find(registry, "t1", a.code);
  assert.equal(la.state, "used");
  assert.equal(la.usedBy, "bob");
  assert.equal(la.usedAt?.toISOString(), "2026-03-05T17:00:00.000Z");

  const lb = await find(registry, "t1", b.code);
  assert.equal(lb.state, "used");
  assert.equal(lb.usedBy, "alice");
  assert.equal(lb.usedAt?.toISOString(), "2026-03-02T01:02:03.456Z");

  const lc = await find(registry, "t1", c.code);
  assert.equal(lc.state, "unused");
  assert.equal(lc.usedBy, undefined);
  assert.equal(lc.usedAt, undefined);
});

// Extends "[happy-2] redeeming grants access to no other task and no other contributor": ids that prefix one another.
test("[happy-2] access is kept apart for contributors and tasks whose ids prefix one another", async () => {
  const { registry } = setup();
  const t1 = await registry.create("t1");
  const t10 = await registry.create("t10");
  await registry.create("t1");

  assertGranted(await registry.redeem(t1.code, "c1"), "t1");
  assertGranted(await registry.redeem(t10.code, "c10"), "t10");

  assert.deepEqual(await registry.tasksFor("c1"), ["t1"]);
  assert.deepEqual(await registry.tasksFor("c10"), ["t10"]);
  assert.equal(await registry.hasAccess("c1", "t10"), false);
  assert.equal(await registry.hasAccess("c10", "t1"), false);
  assert.deepEqual(await registry.tasksFor("c"), []);
  assert.equal(await registry.hasAccess("c1", "t"), false);
});

// Extends "[happy-2] redeeming grants access to no other task and no other contributor": many contributors and tasks.
test("[happy-2] many contributors each get access to the one task their code is for", async () => {
  const { registry } = setup();
  const codes: { code: string; task: string; who: string }[] = [];
  for (let i = 0; i < 8; i++) {
    const task = `task-${i % 3}`;
    const { code } = await registry.create(task);
    codes.push({ code, task, who: `contributor-${i}` });
  }
  for (const { code, task, who } of codes) {
    assertGranted(await registry.redeem(code, who), task);
  }
  for (const { task, who } of codes) {
    assert.deepEqual(await registry.tasksFor(who), [task]);
    for (const other of ["task-0", "task-1", "task-2"]) {
      assert.equal(await registry.hasAccess(who, other), other === task, `${who} on ${other}`);
    }
  }
});

// Extends "[happy-2] redeeming an unused code grants access to its task": a contributor collects several tasks.
test("[happy-2] a contributor who redeems codes for several tasks has access to exactly those tasks", async () => {
  const { registry } = setup();
  const t3 = await registry.create("t3");
  const t1 = await registry.create("t1");
  await registry.create("t2");
  const t4 = await registry.create("t4");

  assertGranted(await registry.redeem(t3.code, "c1"), "t3");
  assertGranted(await registry.redeem(t1.code, "c1"), "t1");
  assertGranted(await registry.redeem(t4.code, "c1"), "t4");

  assert.deepEqual(await sortedTasks(registry, "c1"), ["t1", "t3", "t4"]);
  assert.equal(await registry.hasAccess("c1", "t2"), false);
});

// Extends "[happy-2] redeeming an unused code grants access to its task": the registry keeps its codes in the store it is given.
test("[happy-2] a code made by one registry is redeemed by another registry over the same store", async () => {
  const store = memoryStore();
  const first = setup("2026-03-01T09:00:00Z", store).registry;
  const { code } = await first.create("t1");

  const second = setup("2026-03-02T09:00:00Z", store).registry;
  assertGranted(await second.redeem(code, "c1"), "t1");
  assert.equal(await second.hasAccess("c1", "t1"), true);
});

// A code is read however it is typed

// Extends "[boundary-1] a code typed in lowercase is the same code": mixed case.
test("[boundary-1] a code typed in mixed case is the same code", async () => {
  const { registry } = setup();
  const { code } = await registry.create("t1");
  const mixed = [...code].map((ch, i) => (i % 2 ? ch.toLowerCase() : ch)).join("");

  assertGranted(await registry.redeem(mixed, "c1"), "t1");
  assert.equal((await find(registry, "t1", code)).usedBy, "c1");
});

// Extends "[boundary-1] a code typed with spaces or with a dash is the same code": a dash elsewhere, many spaces, and all at once.
test("[boundary-1] a code typed with a dash anywhere, many spaces, or lowercase with both is the same code", async () => {
  const { registry } = setup();
  const a = await registry.create("t1");
  const b = await registry.create("t2");
  const c = await registry.create("t3");
  const d = await registry.create("t4");

  const dashEarly = `${a.code.slice(0, 2)}-${a.code.slice(2)}`;
  const manySpaces = [...b.code].join(" ");
  const everything = `  ${c.code.slice(0, 4).toLowerCase()} - ${c.code.slice(4).toLowerCase()}  `;
  const dashLate = `${d.code.slice(0, 7).toLowerCase()}-${d.code.slice(7)}`;

  assertGranted(await registry.redeem(dashEarly, "c1"), "t1");
  assertGranted(await registry.redeem(manySpaces, "c2"), "t2");
  assertGranted(await registry.redeem(everything, "c3"), "t3");
  assertGranted(await registry.redeem(dashLate, "c4"), "t4");

  assert.equal((await find(registry, "t1", a.code)).usedBy, "c1");
  assert.equal((await find(registry, "t2", b.code)).usedBy, "c2");
  assert.equal((await find(registry, "t3", c.code)).usedBy, "c3");
  assert.equal((await find(registry, "t4", d.code)).usedBy, "c4");
});

// A code expires exactly 14 days after it was made

// Extends "[boundary-2] a code can be redeemed one millisecond before it expires": another creation time with milliseconds.
test("[boundary-2] a code made at another time can be redeemed one millisecond before 14 days have passed", async () => {
  const { registry, at } = setup("2026-07-04T18:45:30.250Z");
  const { code } = await registry.create("t1");

  at("2026-07-18T18:45:30.249Z");
  assertGranted(await registry.redeem(code, "c1"), "t1");
  assert.equal(await registry.hasAccess("c1", "t1"), true);
});

// Extends "[boundary-2] at exactly 14 days redeeming fails with reason expired": another creation time, and later still.
test("[boundary-2] a code made at another time fails with expired at exactly 14 days and after", async () => {
  const { registry, at } = setup("2026-07-04T18:45:30.250Z");
  const { code } = await registry.create("t1");

  at("2026-07-18T18:45:30.250Z");
  assertRefused(await registry.redeem(code, "c1"), "expired");
  at("2026-09-01T00:00:00Z");
  assertRefused(await registry.redeem(code, "c2"), "expired");

  assert.deepEqual(await registry.tasksFor("c1"), []);
  assert.deepEqual(await registry.tasksFor("c2"), []);
  const listed = await find(registry, "t1", code);
  assert.equal(listed.state, "expired");
  assert.equal(listed.usedBy, undefined);
  assert.equal(listed.usedAt, undefined);
});

// Extends "[boundary-2] at exactly 14 days redeeming fails with reason expired": each code's 14 days run from when it was made.
test("[boundary-2] each code expires 14 days after it was made, not after the first code", async () => {
  const { registry, at } = setup("2026-03-01T09:00:00Z");
  const older = await registry.create("t1");
  at("2026-03-05T09:00:00Z");
  const newer = await registry.create("t1");

  at("2026-03-19T08:59:59.999Z");
  assertRefused(await registry.redeem(older.code, "c1"), "expired");
  assertGranted(await registry.redeem(newer.code, "c2"), "t1");

  at("2026-03-19T09:00:00Z");
  const another = await registry.create("t2");
  at("2026-04-02T09:00:00Z");
  assertRefused(await registry.redeem(another.code, "c3"), "expired");
});

// Extends "[boundary-2] at exactly 14 days redeeming fails with reason expired": across a daylight-saving change.
test("[boundary-2] across a daylight-saving change a code expires exactly 14 × 24 hours after it was made", async () => {
  const { registry, at } = setup("2026-03-20T09:00:00Z");
  const a = await registry.create("t1");
  const b = await registry.create("t1");

  at("2026-04-03T08:59:59.999Z");
  assertGranted(await registry.redeem(a.code, "c1"), "t1");
  at("2026-04-03T09:00:00Z");
  assertRefused(await registry.redeem(b.code, "c2"), "expired");
});

// Spans boundary-1 and boundary-2: a code typed another way still expires.
test("[boundary-2] an expired code typed in lowercase with a dash fails with expired", async () => {
  const { registry, at } = setup("2026-03-01T09:00:00Z");
  const { code } = await registry.create("t1");

  at("2026-03-15T09:00:00Z");
  const typed = `${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase();
  assertRefused(await registry.redeem(typed, "c1"), "expired");
  assert.equal(await registry.hasAccess("c1", "t1"), false);
});

// A used code cannot be used by someone else

// Extends "[unhappy-1] a code used by one contributor fails for another with reason used": several others, later times.
test("[unhappy-1] a used code fails with used for every other contributor and its use is unchanged", async () => {
  const { registry, at } = setup();
  const { code } = await registry.create("t1");
  at("2026-03-02T10:00:00Z");
  await registry.redeem(code, "c1");

  for (const [who, iso] of [
    ["c2", "2026-03-03T00:00:00Z"],
    ["c3", "2026-03-04T00:00:00Z"],
    ["c4", "2026-03-10T00:00:00Z"],
  ]) {
    at(iso);
    assertRefused(await registry.redeem(code, who), "used");
    assert.equal(await registry.hasAccess(who, "t1"), false);
    assert.deepEqual(await registry.tasksFor(who), []);
  }

  const listed = await find(registry, "t1", code);
  assert.equal(listed.usedBy, "c1");
  assert.equal(listed.usedAt?.toISOString(), "2026-03-02T10:00:00.000Z");
  assert.equal(await registry.hasAccess("c1", "t1"), true);
});

// Extends "[unhappy-1] a code used by one contributor fails for another with reason used": the other contributor keeps what they had.
test("[unhappy-1] a contributor refused a used code keeps the access they had and gains none", async () => {
  const { registry } = setup();
  const forT1 = await registry.create("t1");
  const forT2 = await registry.create("t2");
  await registry.redeem(forT1.code, "c1");
  await registry.redeem(forT2.code, "c2");

  assertRefused(await registry.redeem(forT1.code, "c2"), "used");

  assert.deepEqual(await registry.tasksFor("c2"), ["t2"]);
  assert.equal(await registry.hasAccess("c2", "t1"), false);
});

// Spans boundary-1 and unhappy-1: the used code typed another way is still used.
test("[unhappy-1] a used code typed in lowercase with spaces fails with used for someone else", async () => {
  const { registry } = setup();
  const { code } = await registry.create("t1");
  await registry.redeem(code, "c1");

  const typed = ` ${code.slice(0, 4).toLowerCase()} ${code.slice(4).toLowerCase()} `;
  assertRefused(await registry.redeem(typed, "c2"), "used");
  assert.equal(await registry.hasAccess("c2", "t1"), false);
});

// Extends "[unhappy-1] the same contributor redeeming again succeeds and nothing changes": several times, typed other ways.
test("[unhappy-1] the contributor who used a code redeems it again several ways and nothing changes", async () => {
  const { registry, at } = setup();
  const { code } = await registry.create("t1");
  await registry.create("t1");
  at("2026-03-02T10:00:00.123Z");
  await registry.redeem(code, "c1");

  at("2026-03-05T00:00:00Z");
  assertGranted(await registry.redeem(code.toLowerCase(), "c1"), "t1");
  at("2026-03-07T00:00:00Z");
  assertGranted(await registry.redeem(`${code.slice(0, 4)}-${code.slice(4)}`, "c1"), "t1");
  at("2026-03-08T00:00:00Z");
  assertGranted(await registry.redeem(code, "c1"), "t1");

  const listed = await find(registry, "t1", code);
  assert.equal(listed.state, "used");
  assert.equal(listed.usedBy, "c1");
  assert.equal(listed.usedAt?.toISOString(), "2026-03-02T10:00:00.123Z");
  assert.deepEqual(await registry.tasksFor("c1"), ["t1"]);
  const states = (await registry.list("t1")).map((c) => c.state).sort();
  assert.deepEqual(states, ["unused", "used"]);
});

// Extends "[unhappy-1] a code used by one contributor fails for another with reason used": still refused after its owner redeems again.
test("[unhappy-1] a used code still fails for someone else after its owner redeems it again", async () => {
  const { registry } = setup();
  const { code } = await registry.create("t1");
  await registry.redeem(code, "c1");
  await registry.redeem(code, "c1");

  assertRefused(await registry.redeem(code, "c2"), "used");
  assert.equal((await find(registry, "t1", code)).usedBy, "c1");
});

// Unknown and revoked codes are refused

// Extends "[unhappy-2] a code that was never made fails with reason unknown": near misses of a real code.
test("[unhappy-2] a code one character off, a character short or a character long fails with unknown", async () => {
  const { registry } = setup();
  const { code } = await registry.create("t1");

  for (const attempt of [
    typo(code, 0),
    typo(code, 7),
    code.slice(0, 7),
    `${code}A`,
    `A${code}`,
    typo(code, 3).toLowerCase(),
  ]) {
    assertRefused(await registry.redeem(attempt, "c1"), "unknown");
  }
  assert.deepEqual(await registry.tasksFor("c1"), []);
  assert.equal((await find(registry, "t1", code)).state, "unused");
});

// Extends "[unhappy-2] a code that was never made fails with reason unknown": a real code from another registry.
test("[unhappy-2] a code made by a registry over another store is unknown here", async () => {
  const elsewhere = setup().registry;
  const { code } = await elsewhere.create("t1");
  const here = setup().registry;

  assertRefused(await here.redeem(code, "c1"), "unknown");
  assert.equal(await here.hasAccess("c1", "t1"), false);
  assert.deepEqual(await here.list("t1"), []);
});

// Extends "[unhappy-2] a revoked code fails with reason revoked": one of several, typed other ways, for several contributors.
test("[unhappy-2] a revoked code fails with revoked however it is typed while the task's other codes still work", async () => {
  const { registry } = setup();
  const keep = await registry.create("t1");
  const gone = await registry.create("t1");

  await registry.revoke(gone.code);

  assertRefused(await registry.redeem(gone.code, "c1"), "revoked");
  assertRefused(await registry.redeem(gone.code.toLowerCase(), "c2"), "revoked");
  assertRefused(await registry.redeem(`${gone.code.slice(0, 4)}-${gone.code.slice(4)}`, "c3"), "revoked");
  for (const who of ["c1", "c2", "c3"]) {
    assert.deepEqual(await registry.tasksFor(who), []);
  }

  assertGranted(await registry.redeem(keep.code, "c1"), "t1");
  const listed = await find(registry, "t1", gone.code);
  assert.equal(listed.state, "revoked");
  assert.equal(listed.usedBy, undefined);
  assert.equal(listed.usedAt, undefined);
});

// Extends "[unhappy-2] a revoked code fails with reason revoked": revoking an unused code succeeds.
test("[unhappy-2] an unused code can be revoked", async () => {
  const { registry } = setup();
  const { code } = await registry.create("t1");

  await assert.doesNotReject(async () => {
    await registry.revoke(code);
  });
  assertRefused(await registry.redeem(code, "c1"), "revoked");
});

// Extends "[unhappy-2] a used code cannot be revoked": the code keeps refusing others as used, and other codes are untouched.
test("[unhappy-2] a used code cannot be revoked and still refuses others as used", async () => {
  const { registry, at } = setup();
  const used = await registry.create("t1");
  const other = await registry.create("t1");
  at("2026-03-03T03:03:03Z");
  await registry.redeem(used.code, "c1");

  await assert.rejects(async () => {
    await registry.revoke(used.code);
  }, Error);

  assertRefused(await registry.redeem(used.code, "c2"), "used");
  assertGranted(await registry.redeem(used.code, "c1"), "t1");
  const listed = await find(registry, "t1", used.code);
  assert.equal(listed.state, "used");
  assert.equal(listed.usedBy, "c1");
  assert.equal(listed.usedAt?.toISOString(), "2026-03-03T03:03:03.000Z");
  assert.equal((await find(registry, "t1", other.code)).state, "unused");
  assertGranted(await registry.redeem(other.code, "c2"), "t1");
});

// A contributor needs only one code per task

// Extends "[boundary-3] a second code for a task the contributor already has fails and stays unused": more codes, typed other ways.
test("[boundary-3] every further code for a task the contributor has fails with already has access and stays unused", async () => {
  const { registry, at } = setup();
  const first = await registry.create("t1");
  const second = await registry.create("t1");
  const third = await registry.create("t1");
  at("2026-03-02T00:00:00Z");
  await registry.redeem(first.code, "c1");

  at("2026-03-03T00:00:00Z");
  assertRefused(await registry.redeem(second.code.toLowerCase(), "c1"), "already has access");
  assertRefused(await registry.redeem(`${third.code.slice(0, 4)}-${third.code.slice(4)}`, "c1"), "already has access");

  for (const c of [second, third]) {
    const listed = await find(registry, "t1", c.code);
    assert.equal(listed.state, "unused");
    assert.equal(listed.usedBy, undefined);
    assert.equal(listed.usedAt, undefined);
  }
  const kept = await find(registry, "t1", first.code);
  assert.equal(kept.usedBy, "c1");
  assert.equal(kept.usedAt?.toISOString(), "2026-03-02T00:00:00.000Z");
  assert.deepEqual(await registry.tasksFor("c1"), ["t1"]);
});

// Extends "[boundary-3] the code refused for already having access can still be used by someone else": its use is recorded then.
test("[boundary-3] a code refused for already having access records its later use by someone else", async () => {
  const { registry, at } = setup();
  const first = await registry.create("t1");
  const second = await registry.create("t1");
  await registry.redeem(first.code, "c1");
  at("2026-03-02T00:00:00Z");
  await registry.redeem(second.code, "c1");

  at("2026-03-06T06:06:06Z");
  assertGranted(await registry.redeem(second.code, "c2"), "t1");
  const listed = await find(registry, "t1", second.code);
  assert.equal(listed.state, "used");
  assert.equal(listed.usedBy, "c2");
  assert.equal(listed.usedAt?.toISOString(), "2026-03-06T06:06:06.000Z");
  assert.deepEqual(await registry.tasksFor("c2"), ["t1"]);
});

// Extends "[boundary-3] a contributor with access to one task can still redeem a code for another": then a second code for that one.
test("[boundary-3] access to some tasks blocks a second code only for those tasks", async () => {
  const { registry } = setup();
  const t1 = await registry.create("t1");
  const t2a = await registry.create("t2");
  const t2b = await registry.create("t2");
  const t3 = await registry.create("t3");
  await registry.redeem(t1.code, "c1");
  await registry.redeem(t2a.code, "c1");

  assertRefused(await registry.redeem(t2b.code, "c1"), "already has access");
  assertGranted(await registry.redeem(t3.code, "c1"), "t3");
  assert.equal((await find(registry, "t2", t2b.code)).state, "unused");
  assert.deepEqual(await sortedTasks(registry, "c1"), ["t1", "t2", "t3"]);
});

// Extends "[boundary-3] a second code for a task the contributor already has fails and stays unused": access is per contributor.
test("[boundary-3] another contributor's access to the task does not block a code", async () => {
  const { registry } = setup();
  const first = await registry.create("t1");
  const second = await registry.create("t1");
  await registry.redeem(first.code, "c1");

  assertGranted(await registry.redeem(second.code, "c2"), "t1");
  assert.equal((await find(registry, "t1", second.code)).usedBy, "c2");
});
