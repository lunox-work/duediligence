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
const DAY = 86_400_000;
const LIFETIME = 14 * DAY;
const START = Date.parse("2028-02-23T23:59:59.731Z");

// A stream of distinct, nonconstant codes; unlike the public fixture it
// continues to produce distinct codes after ALPHABET.length creations.
function candidate(index: number): string {
  let value = index;
  const chars: string[] = [];
  for (let position = 0; position < 8; position++) {
    chars.push(ALPHABET[(value + position * 7) % ALPHABET.length]!);
    value = Math.floor(value / ALPHABET.length);
  }
  return chars.join("");
}

function scripted(codes: string[]): RandomInt {
  const stream = codes.join("");
  let offset = 0;
  return (bound: number): number => {
    assert.equal(bound, ALPHABET.length);
    assert.ok(offset < stream.length, "code generation exhausted the supplied candidates");
    const index = ALPHABET.indexOf(stream[offset++]!);
    assert.ok(index >= 0);
    return index;
  };
}

function fixture(options: { start?: number; randomInt?: RandomInt; delayed?: boolean } = {}) {
  let time = options.start ?? START;
  let draw = 0;
  let operation = 0;
  const values = new Map<string, unknown>();
  async function delay(): Promise<void> {
    if (!options.delayed) return;
    // Different call lengths let independent operations overtake each other.
    // There are no timers, wall-clock dependencies, or shared object references.
    const turns = [5, 1, 4, 2, 7, 3][operation++ % 6]!;
    for (let turn = 0; turn < turns; turn++) await Promise.resolve();
  }
  const store: Store = {
    async get(key: string): Promise<unknown> {
      await delay();
      return structuredClone(values.get(key));
    },
    async set(key: string, value: unknown): Promise<void> {
      await delay();
      values.set(key, structuredClone(value));
    },
  };
  const registry = new InviteRegistry({
    store,
    now: () => new Date(time),
    randomInt: options.randomInt ?? ((bound: number): number => {
      assert.equal(bound, ALPHABET.length);
      const code = candidate(Math.floor(draw / 8));
      return ALPHABET.indexOf(code[draw++ % 8]!);
    }),
  });
  return { registry, at(value: number): void { time = value; } };
}

function succeeds(result: RedeemResult, taskId: string): void {
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.taskId, taskId);
}

function fails(result: RedeemResult, reason: RedeemFailureReason): void {
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, reason);
}

async function entry(registry: InviteRegistry, taskId: string, code: string): Promise<InviteCode> {
  const found = (await registry.list(taskId)).find((item) => item.code === code);
  assert.ok(found, `missing ${code} for ${taskId}`);
  return found!;
}

function sameEntry(actual: InviteCode, expected: InviteCode): void {
  assert.equal(actual.code, expected.code);
  assert.equal(actual.taskId, expected.taskId);
  assert.equal(actual.createdAt.getTime(), expected.createdAt.getTime());
  assert.equal(actual.expiresAt.getTime(), expected.expiresAt.getTime());
  assert.equal(actual.state, expected.state);
  assert.equal(actual.usedBy, expected.usedBy);
  assert.equal(actual.usedAt?.getTime(), expected.usedAt?.getTime());
}

function formatted(code: string): string {
  return `  ${code.split("").map((char, index) => index % 2 ? char.toLowerCase() : char).join(" - ")}  `;
}

// Extends public: "creation uses the supplied random source and sets a 14-day unused lifetime".
test("[happy-1] every alphabet position can appear at every character position", async () => {
  const expected = Array.from({ length: ALPHABET.length }, (_, row) =>
    Array.from({ length: 8 }, (_, col) => ALPHABET[(ALPHABET.length - 1 - row + col * 5) % ALPHABET.length]).join(""));
  const { registry } = fixture({ randomInt: scripted(expected) });
  for (let index = 0; index < expected.length; index++) {
    const code = await registry.create(`alphabet/task/${index}`);
    assert.equal(code.code, expected[index]);
    assert.equal(code.taskId, `alphabet/task/${index}`);
    assert.equal(code.state, "unused");
    assert.equal(code.createdAt.getTime(), START);
    assert.equal(code.expiresAt.getTime(), START + LIFETIME);
    assert.equal(code.usedBy, undefined);
    assert.equal(code.usedAt, undefined);
    sameEntry(await entry(registry, code.taskId, code.code), code);
  }
});

test("[happy-1] creation uses each current clock value across leap days and year boundaries", async () => {
  const { registry, at } = fixture();
  const instants = [
    "2024-02-28T23:59:59.999Z", "2024-02-29T00:00:00.001Z",
    "2026-12-31T17:21:35.123Z", "2031-04-24T03:04:05.006Z",
  ];
  for (const instant of instants) {
    const made = Date.parse(instant);
    at(made);
    const code = await registry.create("rolling-clock");
    assert.equal(code.createdAt.getTime(), made);
    assert.equal(code.expiresAt.getTime(), made + LIFETIME);
    assert.equal(code.state, "unused");
    sameEntry(await entry(registry, "rolling-clock", code.code), code);
  }
});

// Extends public: "repeated collisions are redrawn even when the existing code belongs to another task".
test("[happy-1] dozens of collisions with several tasks are skipped without losing earlier records", async () => {
  const a = "Q7Y3M9WA", b = "9876ZYXW", c = "2345ABCD";
  const { registry } = fixture({ randomInt: scripted([a, b, ...Array<string>(41).fill(a), b, a, c]) });
  const first = await registry.create("task-one");
  const second = await registry.create("task-two");
  const third = await registry.create("task-one");
  assert.equal(third.code, c);
  assert.deepEqual((await registry.list("task-one")).map((item) => item.code).sort(), [a, c].sort());
  assert.equal((await registry.list("task-two")).length, 1);
  sameEntry(await entry(registry, "task-one", a), first);
  sameEntry(await entry(registry, "task-two", b), second);
});

test("[happy-1] used codes still reserve their characters when another task creates a code", async () => {
  const firstCode = "W9M2J7QA", nextCode = "3VN8R5XB";
  const { registry } = fixture({ randomInt: scripted([firstCode, firstCode, firstCode, nextCode]) });
  const first = await registry.create("old-task");
  succeeds(await registry.redeem(first.code, "original-owner"), "old-task");
  const before = structuredClone(await entry(registry, "old-task", first.code));
  assert.equal((await registry.create("new-task")).code, nextCode);
  sameEntry(await entry(registry, "old-task", first.code), before);
  fails(await registry.redeem(first.code, "outsider"), "used");
});

test("[happy-1] revoked codes are not recycled by a subsequent creation", async () => {
  const oldCode = "8AR7Q2VW", freshCode = "M5Y9C3NK";
  const { registry } = fixture({ randomInt: scripted([oldCode, oldCode, freshCode]) });
  const old = await registry.create("revocation-task");
  await registry.revoke(old.code);
  assert.equal((await registry.create("revocation-task")).code, freshCode);
  fails(await registry.redeem(old.code, "later-user"), "revoked");
  assert.equal((await registry.list("revocation-task")).length, 2);
});

test("[happy-1] expired codes are not recycled and fresh codes get their own lifetime", async () => {
  const oldCode = "6W9NX3CA", freshCode = "K2P8V5RB";
  const { registry, at } = fixture({ randomInt: scripted([oldCode, oldCode, freshCode]) });
  const old = await registry.create("expired-task");
  at(START + 40 * DAY + 543);
  const fresh = await registry.create("new-task");
  assert.equal(fresh.code, freshCode);
  assert.equal(fresh.createdAt.getTime(), START + 40 * DAY + 543);
  assert.equal(fresh.expiresAt.getTime(), START + 54 * DAY + 543);
  fails(await registry.redeem(old.code, "later-user"), "expired");
  succeeds(await registry.redeem(fresh.code, "later-user"), "new-task");
});

// Extends public: "redemption grants only the invited task and records the contributor and time".
test("[happy-2] many distinct owners get exactly their invitations with distinct use timestamps", async () => {
  const { registry, at } = fixture();
  const codes: InviteCode[] = [];
  for (let index = 0; index < 35; index++) codes.push(await registry.create(`task/${index}`));
  for (let index = codes.length - 1; index >= 0; index--) {
    const code = codes[index]!;
    const contributor = `person/${index}`;
    assert.deepEqual(await registry.tasksFor(contributor), []);
    const usedTime = START + 1000 + index * 12345;
    at(usedTime);
    succeeds(await registry.redeem(code.code, contributor), code.taskId);
    assert.deepEqual(await registry.tasksFor(contributor), [code.taskId]);
    const used = await entry(registry, code.taskId, code.code);
    assert.equal(used.state, "used");
    assert.equal(used.usedBy, contributor);
    assert.equal(used.usedAt?.getTime(), usedTime);
    assert.equal(used.createdAt.getTime(), START);
    assert.equal(used.expiresAt.getTime(), START + LIFETIME);
  }
  for (let owner = 0; owner < codes.length; owner++) {
    for (let task = 0; task < codes.length; task++) {
      assert.equal(await registry.hasAccess(`person/${owner}`, `task/${task}`), owner === task);
    }
  }
});

// Extends public: "separate invitations add tasks without granting access to another contributor".
test("[happy-2] interleaved owners accumulate larger disjoint task sets in different redemption orders", async () => {
  const { registry } = fixture();
  const codes: InviteCode[] = [];
  for (let index = 0; index < 48; index++) codes.push(await registry.create(`topic-${index}`));
  const expected = [[], [], [], []] as string[][];
  for (let turn = 0; turn < codes.length; turn++) {
    const index = turn * 17 % codes.length;
    const owner = index % 4;
    const code = codes[index]!;
    succeeds(await registry.redeem(code.code, `owner-${owner}`), code.taskId);
    expected[owner]!.push(code.taskId);
    assert.deepEqual((await registry.tasksFor(`owner-${owner}`)).sort(), [...expected[owner]!].sort());
  }
  for (let owner = 0; owner < 4; owner++) {
    for (const code of codes) {
      assert.equal(await registry.hasAccess(`owner-${owner}`, code.taskId), expected[owner]!.includes(code.taskId));
    }
  }
  assert.deepEqual(await registry.tasksFor("uninvolved"), []);
});

test("[happy-2] task and contributor identifiers remain distinct even when names and prefixes overlap", async () => {
  const { registry } = fixture();
  const ids = ["a", "a:b", "b:c", "__proto__", "constructor", "hasOwnProperty", "task/" + "long".repeat(80), "任务-δ"];
  for (let index = 0; index < ids.length; index++) {
    const task = ids[index]!;
    const owner = ids[(index + 1) % ids.length]!;
    const code = await registry.create(task);
    succeeds(await registry.redeem(code.code, owner), task);
  }
  for (let index = 0; index < ids.length; index++) {
    const owner = ids[(index + 1) % ids.length]!;
    assert.deepEqual(await registry.tasksFor(owner), [ids[index]!]);
    for (let other = 0; other < ids.length; other++) {
      assert.equal(await registry.hasAccess(owner, ids[other]!), other === index);
    }
  }
});

test("[happy-2] access for identifier pairs that resemble concatenated keys remains separate", async () => {
  const { registry } = fixture();
  const pairs = [
    ["account:segment", "task"], ["account", "segment:task"],
    ["person/path", "project"], ["person", "path/project"],
  ] as const;
  for (let index = 0; index < pairs.length; index++) {
    const [owner, task] = pairs[index]!;
    const code = await registry.create(task);
    succeeds(await registry.redeem(code.code, owner), task);
    for (let other = 0; other < pairs.length; other++) {
      const [otherOwner, otherTask] = pairs[other]!;
      assert.equal(await registry.hasAccess(otherOwner, otherTask), other <= index);
    }
  }
  for (const [owner, task] of pairs) assert.deepEqual(await registry.tasksFor(owner), [task]);
});

// Extends public: "lowercase, spaces, and hyphens each redeem the canonical code".
test("[boundary-1] separators at every split position identify nonconstant letter and digit codes", async () => {
  const { registry } = fixture();
  for (const separator of [" ", "-"]) {
    for (let position = 0; position <= 8; position++) {
      const task = `split/${separator}/${position}`;
      const code = await registry.create(task);
      const typed = (code.code.slice(0, position) + separator + code.code.slice(position)).toLowerCase();
      succeeds(await registry.redeem(typed, `owner/${task}`), task);
      assert.equal((await entry(registry, task, code.code)).usedBy, `owner/${task}`);
    }
  }
});

// Extends public: "mixed case and combined surrounding and internal separators still identify one code".
test("[boundary-1] long runs of surrounding and repeated internal separators preserve canonical identity", async () => {
  const { registry } = fixture({ randomInt: scripted(["Z9W2M8Q3", "N7Y4B6R5"]) });
  for (let index = 0; index < 2; index++) {
    const code = await registry.create(`formatted-${index}`);
    const chars = code.code.split("").map((char, position) => position % 2 ? char : char.toLowerCase());
    const typed = " - ".repeat(20) + chars.join("--   - ") + " - ".repeat(23);
    succeeds(await registry.redeem(typed, `reader-${index}`), code.taskId);
    succeeds(await registry.redeem(code.code.toLowerCase(), `reader-${index}`), code.taskId);
    fails(await registry.redeem(formatted(code.code), `other-${index}`), "used");
    assert.deepEqual(await registry.tasksFor(`other-${index}`), []);
    assert.equal((await registry.list(code.taskId)).length, 1);
  }
});

// Extends public: "a code can be redeemed one millisecond before its expiry".
test("[boundary-2] the final valid millisecond is relative to each code across calendar boundaries", async () => {
  for (const instant of ["2024-02-20T01:02:03.456Z", "2026-12-28T23:59:59.999Z", "2030-04-23T12:00:00.001Z"]) {
    const start = Date.parse(instant);
    const { registry, at } = fixture({ start });
    const code = await registry.create(instant);
    at(start + LIFETIME - 1);
    succeeds(await registry.redeem(code.code, "last-millisecond"), instant);
    const used = await entry(registry, instant, code.code);
    assert.equal(used.usedAt?.getTime(), start + LIFETIME - 1);
    assert.equal(await registry.hasAccess("last-millisecond", instant), true);
  }
});

// Extends public: "a code is expired at exactly 14 days and grants no access".
test("[boundary-2] distinct staggered deadlines expire only their own codes at millisecond precision", async () => {
  const { registry, at } = fixture();
  const first = await registry.create("deadline-first");
  at(START + 1);
  const second = await registry.create("deadline-second");
  at(START + LIFETIME);
  fails(await registry.redeem(first.code, "late-reader"), "expired");
  succeeds(await registry.redeem(second.code, "on-time-reader"), "deadline-second");
  assert.deepEqual(await registry.tasksFor("late-reader"), []);
  assert.equal((await entry(registry, first.taskId, first.code)).state, "expired");
  const { registry: other, at: otherAt } = fixture({ start: Date.parse("2029-12-25T16:45:32.187Z") });
  const third = await other.create("another-deadline");
  otherAt(third.expiresAt.getTime());
  fails(await other.redeem(third.code, "exact-reader"), "expired");
  assert.equal(await other.hasAccess("exact-reader", third.taskId), false);
});

test("[boundary-2] expiry is permanent for unused codes a millisecond or years past the deadline", async () => {
  const { registry, at } = fixture();
  const code = await registry.create("long-expired");
  for (const time of [START + LIFETIME + 1, START + 400 * DAY, START + 5000 * DAY]) {
    at(time);
    for (const owner of ["late-one", "late-two"]) {
      fails(await registry.redeem(formatted(code.code), owner), "expired");
      assert.deepEqual(await registry.tasksFor(owner), []);
      assert.equal(await registry.hasAccess(owner, code.taskId), false);
    }
    const expired = await entry(registry, code.taskId, code.code);
    assert.equal(expired.state, "expired");
    assert.equal(expired.usedBy, undefined);
    assert.equal(expired.usedAt, undefined);
  }
});

// Extends public: "a second contributor cannot redeem a used code or change its recorded use".
test("[unhappy-1] many later contributors using different spellings cannot replace the recorded owner", async () => {
  const { registry, at } = fixture();
  const code = await registry.create("protected-task");
  at(START + 1234);
  succeeds(await registry.redeem(formatted(code.code), "owner"), code.taskId);
  const before = structuredClone(await entry(registry, code.taskId, code.code));
  for (let index = 0; index < 30; index++) {
    at(START + (index + 1) * 100_000);
    const other = `intruder-${index}`;
    fails(await registry.redeem(index % 2 ? code.code : formatted(code.code), other), "used");
    assert.equal(await registry.hasAccess(other, code.taskId), false);
    assert.deepEqual(await registry.tasksFor(other), []);
    sameEntry(await entry(registry, code.taskId, code.code), before);
  }
  assert.deepEqual(await registry.tasksFor("owner"), [code.taskId]);
});

// Extends public: "the original contributor can redeem again without changing use time or duplicating access".
test("[unhappy-1] repeated formatted redemptions preserve the first use and all unrelated grants", async () => {
  const { registry, at } = fixture();
  const codes: InviteCode[] = [];
  for (let index = 0; index < 7; index++) {
    const code = await registry.create(`replay-task-${index}`);
    at(START + 17 + index * 301);
    succeeds(await registry.redeem(code.code, "returning-owner"), code.taskId);
    codes.push(structuredClone(await entry(registry, code.taskId, code.code)));
  }
  for (let round = 0; round < 9; round++) {
    at(START + DAY + round * 313);
    for (const code of [...codes].reverse()) {
      succeeds(await registry.redeem(formatted(code.code), "returning-owner"), code.taskId);
      sameEntry(await entry(registry, code.taskId, code.code), code);
    }
    assert.deepEqual((await registry.tasksFor("returning-owner")).sort(), codes.map((code) => code.taskId).sort());
  }
});

// Extends public: "an unknown code is refused without creating access or a listed code".
test("[unhappy-2] near misses and formatted unknown codes stay unknown in a populated registry", async () => {
  const known = "9WY2J7QA";
  const { registry } = fixture({ randomInt: scripted([known]) });
  const code = await registry.create("known-task");
  for (let position = 0; position < 8; position++) {
    const replacement = code.code[position] === "A" ? "B" : "A";
    const unknown = code.code.slice(0, position) + replacement + code.code.slice(position + 1);
    fails(await registry.redeem(formatted(unknown), `unknown-reader-${position}`), "unknown");
    assert.deepEqual(await registry.tasksFor(`unknown-reader-${position}`), []);
    assert.equal(await registry.hasAccess(`unknown-reader-${position}`, code.taskId), false);
  }
  assert.deepEqual(await registry.list("absent-task"), []);
  assert.equal((await registry.list(code.taskId)).length, 1);
  sameEntry(await entry(registry, code.taskId, code.code), code);
  succeeds(await registry.redeem(code.code, "real-reader"), code.taskId);
});

// Extends public: "revoking an unused code prevents redemption and records its revoked state".
test("[unhappy-2] revoking alternating codes affects only those invitations across multiple tasks", async () => {
  const { registry, at } = fixture();
  const codes: InviteCode[] = [];
  for (let index = 0; index < 24; index++) codes.push(await registry.create(`revoke-task-${index % 3}`));
  for (let index = codes.length - 2; index >= 0; index -= 2) await registry.revoke(codes[index]!.code);
  at(START + 4 * DAY + 987);
  for (let index = 0; index < codes.length; index++) {
    const code = codes[index]!;
    const owner = `revoke-reader-${index}`;
    if (index % 2 === 0) {
      fails(await registry.redeem(formatted(code.code), owner), "revoked");
      assert.equal(await registry.hasAccess(owner, code.taskId), false);
      assert.deepEqual(await registry.tasksFor(owner), []);
      const revoked = await entry(registry, code.taskId, code.code);
      assert.equal(revoked.state, "revoked");
      assert.equal(revoked.usedBy, undefined);
      assert.equal(revoked.usedAt, undefined);
      assert.equal(revoked.createdAt.getTime(), START);
      assert.equal(revoked.expiresAt.getTime(), START + LIFETIME);
    } else {
      succeeds(await registry.redeem(code.code, owner), code.taskId);
    }
  }
});

// Extends public: "revocation rejects a code immediately after use and preserves its access and history".
test("[unhappy-2] attempts to revoke several used codes preserve each owner and the original history", async () => {
  const { registry, at } = fixture();
  const used: InviteCode[] = [];
  for (let index = 0; index < 5; index++) {
    const code = await registry.create(`used-revoke-${index}`);
    at(START + index * 3123);
    succeeds(await registry.redeem(code.code, `owner-${index}`), code.taskId);
    used.push(structuredClone(await entry(registry, code.taskId, code.code)));
  }
  at(START + 10 * DAY);
  for (let index = used.length - 1; index >= 0; index--) {
    const before = used[index]!;
    // The spec supplies no rejection message or error type for revoke. Test
    // the observable inability to revoke, without inventing an error contract.
    try { await registry.revoke(before.code); } catch { /* no error shape is specified */ }
    sameEntry(await entry(registry, before.taskId, before.code), before);
    assert.equal(await registry.hasAccess(`owner-${index}`, before.taskId), true);
    assert.deepEqual(await registry.tasksFor(`owner-${index}`), [before.taskId]);
    succeeds(await registry.redeem(before.code, `owner-${index}`), before.taskId);
    fails(await registry.redeem(before.code, "outsider"), "used");
  }
});

test("[unhappy-2] attempted revocation after expiry cannot erase an already used code or its access", async () => {
  const { registry, at } = fixture();
  const code = await registry.create("used-past-expiry");
  at(START + 9876);
  succeeds(await registry.redeem(code.code, "permanent-owner"), code.taskId);
  const before = structuredClone(await entry(registry, code.taskId, code.code));
  for (const time of [code.expiresAt.getTime(), START + 900 * DAY]) {
    at(time);
    // Assert preservation rather than inventing a revocation error message.
    try { await registry.revoke(code.code); } catch { /* no error shape is specified */ }
    sameEntry(await entry(registry, code.taskId, code.code), before);
    assert.equal(await registry.hasAccess("permanent-owner", code.taskId), true);
    assert.deepEqual(await registry.tasksFor("permanent-owner"), [code.taskId]);
  }
});

// Extends public: "another code for an accessible task is refused and remains unused".
test("[boundary-3] many spare codes stay unchanged after repeated refusals for an existing task owner", async () => {
  const { registry, at } = fixture();
  const first = await registry.create("shared-task");
  succeeds(await registry.redeem(first.code, "existing-owner"), first.taskId);
  const spares: InviteCode[] = [];
  for (let index = 0; index < 18; index++) spares.push(await registry.create(first.taskId));
  for (let round = 0; round < 3; round++) {
    at(START + (round + 1) * DAY);
    for (const spare of [...spares].reverse()) {
      fails(await registry.redeem(formatted(spare.code), "existing-owner"), "already has access");
      sameEntry(await entry(registry, spare.taskId, spare.code), spare);
    }
    assert.deepEqual(await registry.tasksFor("existing-owner"), [first.taskId]);
  }
  const unrelated = await registry.create("unrelated-task");
  succeeds(await registry.redeem(unrelated.code, "existing-owner"), unrelated.taskId);
  assert.deepEqual((await registry.tasksFor("existing-owner")).sort(), ["shared-task", "unrelated-task"]);
});

// Extends public: "a rejected spare code remains redeemable by another contributor just before expiry".
test("[boundary-3] several owners can reuse rejected spares at their staggered final valid milliseconds", async () => {
  const { registry, at } = fixture();
  const first = await registry.create("one-task");
  succeeds(await registry.redeem(first.code, "first-owner"), first.taskId);
  const spares: InviteCode[] = [];
  for (let index = 0; index < 8; index++) {
    at(START + index * 2001);
    spares.push(await registry.create(first.taskId));
  }
  for (let index = 0; index < spares.length; index++) {
    const spare = spares[index]!;
    const time = spare.expiresAt.getTime() - 1;
    at(time);
    fails(await registry.redeem(spare.code, "first-owner"), "already has access");
    sameEntry(await entry(registry, spare.taskId, spare.code), spare);
    succeeds(await registry.redeem(formatted(spare.code), `new-owner-${index}`), spare.taskId);
    const used = await entry(registry, spare.taskId, spare.code);
    assert.equal(used.usedBy, `new-owner-${index}`);
    assert.equal(used.usedAt?.getTime(), time);
    assert.equal(await registry.hasAccess(`new-owner-${index}`, spare.taskId), true);
  }
  assert.deepEqual(await registry.tasksFor("first-owner"), [first.taskId]);
});

test("[boundary-3] simultaneous different codes for one owner consume only one invitation", async () => {
  const { registry } = fixture({ delayed: true });
  const codes: InviteCode[] = [];
  for (let index = 0; index < 9; index++) codes.push(await registry.create("same-task-many-codes"));
  const results = await Promise.all(codes.map((code) => registry.redeem(code.code, "one-owner")));
  assert.equal(results.filter((result) => result.ok).length, 1);
  for (let index = 0; index < results.length; index++) {
    const code = codes[index]!;
    if (results[index]!.ok) {
      succeeds(results[index]!, code.taskId);
      assert.equal((await entry(registry, code.taskId, code.code)).usedBy, "one-owner");
    } else {
      fails(results[index]!, "already has access");
      sameEntry(await entry(registry, code.taskId, code.code), code);
      succeeds(await registry.redeem(code.code, `spare-owner-${index}`), code.taskId);
    }
  }
  assert.deepEqual(await registry.tasksFor("one-owner"), ["same-task-many-codes"]);
});

async function checkRace(registry: InviteRegistry, code: InviteCode, inputs: string[], owners: string[], usedTime: number): Promise<void> {
  const results = await Promise.all(inputs.map((input, index) => registry.redeem(input, owners[index]!)));
  assert.equal(results.filter((result) => result.ok).length, 1);
  const winner = results.findIndex((result) => result.ok);
  for (let index = 0; index < results.length; index++) {
    if (index === winner) succeeds(results[index]!, code.taskId);
    else fails(results[index]!, "used");
    assert.equal(await registry.hasAccess(owners[index]!, code.taskId), index === winner);
    assert.deepEqual(await registry.tasksFor(owners[index]!), index === winner ? [code.taskId] : []);
  }
  const used = await entry(registry, code.taskId, code.code);
  assert.equal(used.state, "used");
  assert.equal(used.usedBy, owners[winner]);
  assert.equal(used.usedAt?.getTime(), usedTime);
}

// Extends public: "exactly one simultaneous redemption wins with delayed store operations".
test("[concurrency-1] repeated two-way races work for nonconstant codes and overtaking store calls", async () => {
  const { registry, at } = fixture({ delayed: true });
  for (let round = 0; round < 16; round++) {
    at(START + round * 123456);
    const code = await registry.create(`race-${round}`);
    await checkRace(registry, code, [code.code, code.code], [`left-${round}`, `right-${round}`], START + round * 123456);
  }
});

// Extends public: "differently typed simultaneous redemptions share one winner just before expiry".
test("[concurrency-1] a crowd of distinct formatted inputs shares a single winner at the expiry edge", async () => {
  const { registry, at } = fixture({ delayed: true });
  const code = await registry.create("crowded-task");
  at(START + LIFETIME - 1);
  const inputs = Array.from({ length: 15 }, (_, index) => {
    const chars = code.code.split("").map((char, position) => (position + index) % 2 ? char.toLowerCase() : char);
    return " ".repeat(index) + chars.join(index % 2 ? "-" : " ") + " ".repeat(15 - index);
  });
  await checkRace(registry, code, inputs, inputs.map((_, index) => `crowd-${index}`), START + LIFETIME - 1);
});

test("[concurrency-1] independent simultaneous races preserve all winners on a shared task", async () => {
  const { registry } = fixture({ delayed: true });
  const codes: InviteCode[] = [];
  for (let index = 0; index < 10; index++) codes.push(await registry.create("many-races-one-task"));
  await Promise.all(codes.map((code, index) => checkRace(
    registry, code, [formatted(code.code), code.code], [`a-${index}`, `b-${index}`], START,
  )));
  assert.equal((await registry.list("many-races-one-task")).filter((code) => code.state === "used").length, codes.length);
});

test("[concurrency-1] simultaneous independent invitations for one contributor do not lose task grants", async () => {
  const { registry } = fixture({ delayed: true });
  const codes: InviteCode[] = [];
  for (let index = 0; index < 14; index++) codes.push(await registry.create(`concurrent-task-${index}`));
  const results = await Promise.all(codes.map((code) => registry.redeem(formatted(code.code), "one-contributor")));
  for (let index = 0; index < codes.length; index++) {
    succeeds(results[index]!, codes[index]!.taskId);
    assert.equal(await registry.hasAccess("one-contributor", codes[index]!.taskId), true);
    const used = await entry(registry, codes[index]!.taskId, codes[index]!.code);
    assert.equal(used.state, "used");
    assert.equal(used.usedBy, "one-contributor");
  }
  assert.deepEqual((await registry.tasksFor("one-contributor")).sort(), codes.map((code) => code.taskId).sort());
  assert.deepEqual(await registry.tasksFor("bystander"), []);
});

test("[unhappy-1] simultaneous duplicate requests by the same owner remain idempotent", async () => {
  const { registry } = fixture({ delayed: true });
  const code = await registry.create("same-owner-race");
  const results = await Promise.all(Array.from({ length: 8 }, (_, index) =>
    registry.redeem(index % 2 ? code.code : formatted(code.code), "same-owner")));
  for (const result of results) succeeds(result, code.taskId);
  assert.deepEqual(await registry.tasksFor("same-owner"), [code.taskId]);
  const used = await entry(registry, code.taskId, code.code);
  assert.equal(used.usedBy, "same-owner");
  assert.equal(used.usedAt?.getTime(), START);
});

// Extends public: "listing a task includes all four states and their dates while excluding other tasks".
test("[happy-3] larger interleaved task listings retain all states and each individual timestamp", async () => {
  const { registry, at } = fixture();
  const expected: InviteCode[] = [];
  for (let index = 0; index < 48; index++) {
    const task = `listed-task-${index % 3}`;
    const group = Math.floor(index / 12);
    const made = START + (group === 0 ? 0 : 2 * DAY) + index * 137;
    at(made);
    const code = await registry.create(task);
    const snapshot = structuredClone(code);
    if (group === 2) {
      at(made + 41);
      const owner = `listed-owner-${index}`;
      succeeds(await registry.redeem(code.code, owner), task);
      snapshot.state = "used";
      snapshot.usedBy = owner;
      snapshot.usedAt = new Date(made + 41);
    } else if (group === 3) {
      await registry.revoke(code.code);
      snapshot.state = "revoked";
    } else if (group === 0) {
      snapshot.state = "expired";
    }
    expected.push(snapshot);
  }
  at(START + 15 * DAY);
  for (let task = 2; task >= 0; task--) {
    const taskId = `listed-task-${task}`;
    const listed = await registry.list(taskId);
    const own = expected.filter((code) => code.taskId === taskId);
    assert.equal(listed.length, own.length);
    assert.deepEqual(listed.map((code) => code.code).sort(), own.map((code) => code.code).sort());
    for (const code of own) sameEntry(listed.find((item) => item.code === code.code)!, code);
  }
  assert.deepEqual(await registry.list("listed-task-absent"), []);
});

// Extends public: "listing changes unused to expired at the deadline while used retains its use history afterwards".
test("[happy-3] listing follows many staggered deadlines without losing used histories years later", async () => {
  const { registry, at } = fixture();
  const codes: InviteCode[] = [];
  for (let index = 0; index < 12; index++) {
    at(START + index * 1001);
    const code = await registry.create("staggered-list");
    if (index % 3 === 0) {
      at(START + index * 1001 + 41);
      succeeds(await registry.redeem(code.code, `history-owner-${index}`), code.taskId);
      codes.push(structuredClone(await entry(registry, code.taskId, code.code)));
    } else codes.push(structuredClone(code));
  }
  const times = codes.flatMap((code) => [code.expiresAt.getTime() - 1, code.expiresAt.getTime()]);
  times.push(START + 20_000 * DAY);
  for (const time of times.sort((a, b) => a - b)) {
    at(time);
    const listed = await registry.list("staggered-list");
    assert.equal(listed.length, codes.length);
    for (const code of codes) {
      const expected = { ...code };
      if (code.state !== "used") expected.state = time >= code.expiresAt.getTime() ? "expired" : "unused";
      sameEntry(listed.find((item) => item.code === code.code)!, expected);
      if (code.state === "used") {
        assert.equal(await registry.hasAccess(code.usedBy!, code.taskId), true);
        assert.deepEqual(await registry.tasksFor(code.usedBy!), [code.taskId]);
      }
    }
  }
});
