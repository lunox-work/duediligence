import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RECENT_JIRA_READ_MS,
  RECENT_JIRA_READS_MAX,
  issueKey,
  recentReads,
} from "../../src/jira/recent.js";

// The Background clock: "now" returns the number held in "t", which starts at 1000000.
function fakeClock() {
  const clock = { t: 1000000, now: () => clock.t };
  return clock;
}

// Extends "[happy-1] a value just written is returned as the same object":
// several keys at once, each handing back its own object by reference.
test("[happy-1] several objects written under different keys are each returned by identity", () => {
  const clock = fakeClock();
  const store = recentReads<{ summary: string }>({ now: clock.now, ttlMs: 60000 });
  const issues = [
    { summary: "Fix login" },
    { summary: "Fix login" },
    { summary: "Fix logout" },
  ];
  const keys = ["org_1\njcn_1\n10001", "org_1\njcn_1\n10002", "org_2\njcn_9\nPROJ-7"];
  keys.forEach((key, i) => store.set(key, issues[i]!));
  clock.t = 1030000;
  keys.forEach((key, i) => assert.equal(store.get(key), issues[i], key));
  assert.notEqual(store.get(keys[0]!), issues[1]);
});

// Extends "[happy-1] a value just written is returned as the same object":
// a value is not copied, so a change made after the write is visible on read.
test("[happy-1] a value is kept by reference, so later changes to it are seen", () => {
  const clock = fakeClock();
  const store = recentReads<{ summary: string; labels: string[] }>({ now: clock.now, ttlMs: 60000 });
  const issue = { summary: "Fix login", labels: ["auth"] };
  store.set("org_1\njcn_1\n10001", issue);
  issue.summary = "Fix login on Safari";
  issue.labels.push("safari");
  const read = store.get("org_1\njcn_1\n10001");
  assert.equal(read, issue);
  assert.deepEqual(read, { summary: "Fix login on Safari", labels: ["auth", "safari"] });
});

// Extends "[happy-2] a key never written is a miss": keys close to written ones are still misses.
test("[happy-2] keys that are prefixes or extensions of written keys are misses", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now });
  store.set("k", "v");
  store.set("org_1\njcn_1\n10001", "issue");
  assert.equal(store.get("never-set"), undefined);
  assert.equal(store.get("k2"), undefined);
  assert.equal(store.get("org_1\njcn_1"), undefined);
  assert.equal(store.get("org_1\njcn_1\n100011"), undefined);
  assert.equal(store.get("k"), "v");
});

// Extends "[happy-3] writing a key again replaces its value and restarts its ttl":
// another ttlMs, several rewrites, and a neighbour whose ttl is not restarted.
test("[happy-3] each rewrite under a 1000 ms ttl restarts only that key's ttl", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 1000 });
  store.set("k", "v1");
  store.set("other", "o");
  clock.t = 1000600;
  store.set("k", "v2");
  clock.t = 1001200;
  store.set("k", "v3");
  assert.equal(store.get("k"), "v3");
  assert.equal(store.get("other"), undefined);
  clock.t = 1002199;
  assert.equal(store.get("k"), "v3");
  clock.t = 1002200;
  assert.equal(store.get("k"), undefined);
});

// Extends "[happy-4] an expired key can be written again and is fresh":
// another ttlMs, a later rewrite and several expire-and-rewrite cycles.
test("[happy-4] a key expires and is rewritten repeatedly, each write fresh for its own ttl", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 5000 });
  store.set("k", "v1");
  clock.t = 1009000;
  assert.equal(store.get("k"), undefined);
  store.set("k", "v2");
  assert.equal(store.get("k"), "v2");
  clock.t = 1013999;
  assert.equal(store.get("k"), "v2");
  clock.t = 1014000;
  assert.equal(store.get("k"), undefined);
  store.set("k", "v3");
  clock.t = 1018999;
  assert.equal(store.get("k"), "v3");
  clock.t = 1019000;
  assert.equal(store.get("k"), undefined);
});

// Extends "[happy-5] the exported constants are themselves valid options":
// the constants are the values the store actually uses as one minute and 1000 entries.
test("[happy-5] a store built from the constants keeps an entry one minute and holds 1000 keys", () => {
  assert.equal(RECENT_JIRA_READ_MS, 60000);
  assert.equal(RECENT_JIRA_READS_MAX, 1000);
  const clock = fakeClock();
  const store = recentReads<number>({
    now: clock.now,
    ttlMs: RECENT_JIRA_READ_MS,
    max: RECENT_JIRA_READS_MAX,
  });
  for (let i = 0; i < 1000; i++) store.set(`k${i}`, i);
  clock.t = 1059999;
  assert.equal(store.get("k0"), 0);
  assert.equal(store.get("k999"), 999);
  clock.t = 1060000;
  assert.equal(store.get("k0"), undefined);
});

// Extends "[happy-6] called with no options, the store returns a value read immediately":
// every way of giving no options, with several keys and a value kept by reference.
test("[happy-6] recentReads(), recentReads(undefined) and recentReads({}) all return working stores", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1700000000000 });
  const issue = { summary: "Fix login" };
  for (const store of [
    recentReads<unknown>(),
    recentReads<unknown>(undefined),
    recentReads<unknown>({}),
  ]) {
    store.set("k", "v");
    store.set("issue", issue);
    assert.equal(store.get("k"), "v");
    assert.equal(store.get("issue"), issue);
    assert.equal(store.get("missing"), undefined);
  }
});

// Extends "[happy-7] a field list is kept for an hour": two sites written at different times
// each keep their own hour.
test("[happy-7] field lists for two sites written at different times each last their own hour", () => {
  const clock = fakeClock();
  const fields = recentReads<string[]>({ now: clock.now, ttlMs: 3600000 });
  const first = ["summary", "priority"];
  const second = ["summary", "labels", "customfield_10010"];
  fields.set("org_1\njcn_1", first);
  clock.t = 2000000;
  fields.set("org_2\njcn_7", second);
  clock.t = 4599999;
  assert.equal(fields.get("org_1\njcn_1"), first);
  assert.equal(fields.get("org_2\njcn_7"), second);
  clock.t = 4600000;
  assert.equal(fields.get("org_1\njcn_1"), undefined);
  assert.equal(fields.get("org_2\njcn_7"), second);
  clock.t = 5599999;
  assert.deepEqual(fields.get("org_2\njcn_7"), ["summary", "labels", "customfield_10010"]);
  clock.t = 5600000;
  assert.equal(fields.get("org_2\njcn_7"), undefined);
});

// Extends "[happy-8] two stores with the same key do not see each other's writes":
// stores also keep their own ttlMs and their own clock.
test("[happy-8] stores built with different ttlMs and clocks keep their own expiry", () => {
  const fast = fakeClock();
  const slow = fakeClock();
  const short = recentReads<string>({ now: fast.now, ttlMs: 1000 });
  const long = recentReads<string>({ now: slow.now, ttlMs: 3600000 });
  const third = recentReads<string>({ now: fast.now });
  short.set("k", "short");
  long.set("k", "long");
  third.set("k", "third");
  fast.t = 1001000;
  assert.equal(short.get("k"), undefined);
  assert.equal(third.get("k"), "third");
  assert.equal(long.get("k"), "long");
  slow.t = 4599999;
  assert.equal(long.get("k"), "long");
  slow.t = 4600000;
  assert.equal(long.get("k"), undefined);
  assert.equal(third.get("k"), "third");
});

// Extends "[happy-8] writes to one store do not count against another store's max":
// a store built later with a smaller max does not change an earlier store's bound.
test("[happy-8] each store keeps its own max regardless of the order they are built in", () => {
  const clock = fakeClock();
  const big = recentReads<string>({ now: clock.now, max: 3 });
  const small = recentReads<string>({ now: clock.now, max: 1 });
  for (const key of ["a", "b", "c"]) {
    big.set(key, key.toUpperCase());
    small.set(key, key.toUpperCase());
  }
  assert.equal(big.get("a"), "A");
  assert.equal(big.get("b"), "B");
  assert.equal(big.get("c"), "C");
  assert.equal(small.get("a"), undefined);
  assert.equal(small.get("b"), undefined);
  assert.equal(small.get("c"), "C");
});

// Extends "[boundary-1] freshness is measured from the write, exclusive of ttlMs":
// the boundary follows ttlMs rather than a fixed minute.
test("[boundary-1] freshness is exclusive of a 1000 ms ttlMs", () => {
  const cases: Array<[number, string | undefined]> = [
    [1000000, "v"],
    [1000001, "v"],
    [1000999, "v"],
    [1001000, undefined],
    [1001001, undefined],
    [1059999, undefined],
  ];
  for (const [at, result] of cases) {
    const clock = fakeClock();
    const store = recentReads<string>({ now: clock.now, ttlMs: 1000 });
    store.set("k", "v");
    clock.t = at;
    assert.equal(store.get("k"), result, `t = ${at}`);
  }
});

// Extends "[boundary-1] freshness is measured from the write, exclusive of ttlMs":
// a real-world epoch, a long ttlMs, and keys written at different times.
test("[boundary-1] each key's freshness is measured from its own write at a present-day epoch", () => {
  const clock = fakeClock();
  clock.t = 1761350400000;
  const store = recentReads<string>({ now: clock.now, ttlMs: 3600000 });
  store.set("a", "A");
  clock.t = 1761350400000 + 1800000;
  store.set("b", "B");
  clock.t = 1761350400000 + 3599999;
  assert.equal(store.get("a"), "A");
  assert.equal(store.get("b"), "B");
  clock.t = 1761350400000 + 3600000;
  assert.equal(store.get("a"), undefined);
  assert.equal(store.get("b"), "B");
  clock.t = 1761350400000 + 5399999;
  assert.equal(store.get("b"), "B");
  clock.t = 1761350400000 + 5400000;
  assert.equal(store.get("b"), undefined);
});

// Extends "[boundary-2] a clock that moves backwards keeps the entry fresh":
// a jump far larger than a short ttlMs, which a distance-based check would expire.
test("[boundary-2] a clock moved back by far more than ttlMs keeps the entry fresh", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 1000 });
  store.set("k", "v");
  for (const at of [999999, 995000, 500000, 0, -1000000]) {
    clock.t = at;
    assert.equal(store.get("k"), "v", `t = ${at}`);
  }
  clock.t = 1000999;
  assert.equal(store.get("k"), "v");
  clock.t = 1001000;
  assert.equal(store.get("k"), undefined);
});

// Extends "[boundary-3] falsy values are stored and returned, not treated as misses":
// all of them in one store, at the last fresh millisecond, and expiring like any value.
test("[boundary-3] falsy values held together stay until ttlMs and then expire", () => {
  const clock = fakeClock();
  const store = recentReads<unknown>({ now: clock.now });
  const empty: unknown[] = [];
  const values: Array<[string, unknown]> = [
    ["null", null],
    ["zero", 0],
    ["empty-string", ""],
    ["false", false],
    ["empty-array", empty],
    ["zero-bigint", BigInt(0)],
  ];
  for (const [key, value] of values) store.set(key, value);
  clock.t = 1059999;
  for (const [key, value] of values) assert.equal(store.get(key), value, key);
  assert.equal(store.get("empty-array"), empty);
  clock.t = 1060000;
  for (const [key] of values) assert.equal(store.get(key), undefined, key);
});

// Extends "[boundary-3] falsy values are stored and returned, not treated as misses":
// a falsy value replaces a truthy one and a truthy one replaces a falsy one.
test("[boundary-3] a falsy value written over a truthy one is returned, and back again", () => {
  const clock = fakeClock();
  const store = recentReads<unknown>({ now: clock.now });
  store.set("k", "v");
  store.set("k", null);
  assert.equal(store.get("k"), null);
  store.set("k", 0);
  assert.equal(store.get("k"), 0);
  store.set("k", "again");
  assert.equal(store.get("k"), "again");
});

// Extends "[boundary-4] keys match exactly, are case-sensitive, and the empty string is a key":
// each near-match is its own key holding its own value.
test("[boundary-4] keys differing only by case, whitespace or Unicode form hold separate values", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now });
  const composed = "café";
  const decomposed = "café";
  store.set("ABC-1", "upper");
  store.set("abc-1", "lower");
  store.set(" ABC-1", "leading");
  store.set("", "empty");
  store.set(" ", "space");
  store.set(composed, "composed");
  assert.equal(store.get("ABC-1"), "upper");
  assert.equal(store.get("abc-1"), "lower");
  assert.equal(store.get(" ABC-1"), "leading");
  assert.equal(store.get("Abc-1"), undefined);
  assert.equal(store.get(""), "empty");
  assert.equal(store.get(" "), "space");
  assert.equal(store.get("  "), undefined);
  assert.equal(store.get(composed), "composed");
  assert.equal(store.get(decomposed), undefined);
});

// Extends "[boundary-4] keys match exactly, are case-sensitive, and the empty string is a key":
// the empty-string key expires and is replaced like any other key.
test("[boundary-4] the empty-string key is replaced and expires like any other key", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 1000 });
  store.set("", "first");
  clock.t = 1000500;
  store.set("", "second");
  assert.equal(store.get(""), "second");
  clock.t = 1001499;
  assert.equal(store.get(""), "second");
  clock.t = 1001500;
  assert.equal(store.get(""), undefined);
});

// Extends "[boundary-5] reading an entry does not refresh its expiry":
// another ttlMs, and a read on every millisecond up to the end.
test("[boundary-5] reads on every millisecond of a 50 ms ttl never extend it", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 50 });
  store.set("k", "v");
  for (let at = 1000000; at < 1000050; at++) {
    clock.t = at;
    assert.equal(store.get("k"), "v", `t = ${at}`);
  }
  clock.t = 1000050;
  assert.equal(store.get("k"), undefined);
});

// Extends "[boundary-6] ttlMs defaults to RECENT_JIRA_READ_MS when only max is given":
// keys written at different times all use the one-minute default.
test("[boundary-6] with ttlMs left out, keys written at different times each last one minute", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now });
  store.set("a", "A");
  clock.t = 1030000;
  store.set("b", "B");
  clock.t = 1059999;
  assert.equal(store.get("a"), "A");
  clock.t = 1060000;
  assert.equal(store.get("a"), undefined);
  assert.equal(store.get("b"), "B");
  clock.t = 1089999;
  assert.equal(store.get("b"), "B");
  clock.t = 1090000;
  assert.equal(store.get("b"), undefined);
});

// Extends "[boundary-7] options given as undefined take their defaults":
// ttlMs alone given as undefined, next to a valid max.
test("[boundary-7] ttlMs given as undefined next to a valid max takes the one-minute default", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: undefined, max: 2 });
  store.set("k", "v");
  clock.t = 1059999;
  assert.equal(store.get("k"), "v");
  clock.t = 1060000;
  assert.equal(store.get("k"), undefined);
});

// Extends "[boundary-7] max given as undefined holds RECENT_JIRA_READS_MAX entries":
// max alone given as undefined, next to a custom ttlMs.
test("[boundary-7] max given as undefined next to a custom ttlMs holds 1000 entries", () => {
  const clock = fakeClock();
  const store = recentReads<number>({ now: clock.now, ttlMs: 5000, max: undefined });
  for (let i = 0; i < 1000; i++) store.set(`k${i}`, i);
  assert.equal(store.get("k0"), 0);
  store.set("k1000", 1000);
  assert.equal(store.get("k0"), undefined);
  assert.equal(store.get("k1"), 1);
  clock.t = 1005000;
  assert.equal(store.get("k1"), undefined);
});

// Extends "[boundary-7] options given as undefined take their defaults": now given as undefined
// falls back to Date.now, here held still by a mocked Date.
test("[boundary-7] now given as undefined, with every option undefined, returns a working store", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1700000000000 });
  const store = recentReads<string>({ now: undefined, ttlMs: undefined, max: undefined });
  store.set("k", "v");
  assert.equal(store.get("k"), "v");
  assert.equal(store.get("other"), undefined);
});

// Extends "[boundary-14] a fractional ttlMs keeps the exclusive boundary":
// a ttlMs that rounding up or down would both get wrong.
test("[boundary-14] a ttlMs of 2.25 is fresh at 2 ms and 2.125 ms and gone at 2.25 ms", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 2.25 });
  store.set("k", "v");
  clock.t = 1000002;
  assert.equal(store.get("k"), "v");
  clock.t = 1000002.125;
  assert.equal(store.get("k"), "v");
  clock.t = 1000002.25;
  assert.equal(store.get("k"), undefined);
  clock.t = 1000003;
  assert.equal(store.get("k"), undefined);
});

// Extends "[boundary-14] a fractional ttlMs keeps the exclusive boundary":
// with a 0.5 ms ttl, a quarter-millisecond later is still fresh.
test("[boundary-14] a ttlMs of 0.5 is fresh at 0.25 ms after the write", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 0.5 });
  store.set("k", "v");
  clock.t = 1000000.25;
  assert.equal(store.get("k"), "v");
  clock.t = 1000000.5;
  assert.equal(store.get("k"), undefined);
});

// Extends "[boundary-15] the same issue under different organizations or connections is a different key":
// every part, and the order of the parts, changes the key.
test("[boundary-15] issue keys differing in any part or in part order hold separate values", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now });
  store.set(issueKey("org_1", "jcn_1", "10001"), "base");
  store.set(issueKey("org_2", "jcn_1", "10001"), "other org");
  store.set(issueKey("org_1", "jcn_2", "10001"), "other connection");
  store.set(issueKey("org_1", "jcn_1", "10002"), "other issue");
  assert.equal(store.get(issueKey("org_1", "jcn_1", "10001")), "base");
  assert.equal(store.get(issueKey("org_2", "jcn_1", "10001")), "other org");
  assert.equal(store.get(issueKey("org_1", "jcn_2", "10001")), "other connection");
  assert.equal(store.get(issueKey("org_1", "jcn_1", "10002")), "other issue");
  assert.equal(store.get(issueKey("jcn_1", "org_1", "10001")), undefined);
  assert.equal(store.get(issueKey("10001", "jcn_1", "org_1")), undefined);
  assert.equal(store.get(issueKey("org_1", "jcn_1", "")), undefined);
  assert.equal(store.get("org_1\njcn_1\n10001"), "base");
});

// Extends "[concurrency-1] two callers that both miss both write, and the later write is kept":
// three callers and a short ttl, where only the last write's ttl counts.
test("[concurrency-1] three callers that all miss all write, and the last write and its ttl are kept", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 1000 });
  assert.equal(store.get("k"), undefined);
  assert.equal(store.get("k"), undefined);
  assert.equal(store.get("k"), undefined);
  clock.t = 1000100;
  store.set("k", "from A");
  assert.equal(store.get("k"), "from A");
  clock.t = 1000300;
  store.set("k", "from C");
  clock.t = 1000700;
  store.set("k", "from B");
  assert.equal(store.get("k"), "from B");
  clock.t = 1001300;
  assert.equal(store.get("k"), "from B");
  clock.t = 1001699;
  assert.equal(store.get("k"), "from B");
  clock.t = 1001700;
  assert.equal(store.get("k"), undefined);
});

// Extends "[concurrency-1] two callers that both miss both write, and the later write is kept":
// the overlapping writes to one key leave other keys alone.
test("[concurrency-1] overlapping writes to one key do not touch another key", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 60000 });
  store.set("other", "untouched");
  assert.equal(store.get("k"), undefined);
  assert.equal(store.get("k"), undefined);
  clock.t = 1000100;
  store.set("k", "from B");
  clock.t = 1000200;
  store.set("k", "from A");
  assert.equal(store.get("k"), "from A");
  assert.equal(store.get("other"), "untouched");
  clock.t = 1060000;
  assert.equal(store.get("other"), undefined);
  assert.equal(store.get("k"), "from A");
});
