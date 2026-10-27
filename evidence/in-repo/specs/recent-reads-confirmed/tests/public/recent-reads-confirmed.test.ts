import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RECENT_JIRA_READ_MS,
  issueKey,
  recentReads,
} from "../src/jira/recent.js";

// The spec's Background: a clock "now" returning the number held in "t",
// starting at 1000000.
function fakeClock() {
  const clock = { t: 1000000, now: () => clock.t };
  return clock;
}

test("[happy-1] a value just written is returned as the same object", () => {
  const clock = fakeClock();
  const store = recentReads<{ summary: string }>({
    now: clock.now,
    ttlMs: 60000,
  });
  const issue = { summary: "Fix login" };
  store.set("org_1\njcn_1\n10001", issue);
  assert.equal(store.get("org_1\njcn_1\n10001"), issue);
});

test("[happy-1] a value read at the last fresh millisecond is still the written object, not a copy", () => {
  const clock = fakeClock();
  const store = recentReads<{ summary: string }>({
    now: clock.now,
    ttlMs: 60000,
  });
  const issue = { summary: "Fix login" };
  store.set("org_1\njcn_1\n10001", issue);
  issue.summary = "Fix logout";
  clock.t = 1059999;
  const read = store.get("org_1\njcn_1\n10001");
  assert.equal(read, issue);
  assert.equal(read?.summary, "Fix logout");
});

test("[happy-2] a key never written is a miss", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now });
  assert.equal(store.get("never-set"), undefined);
});

test("[happy-2] a key never written is a miss even beside written keys that it prefixes or extends", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now });
  store.set("never", "a");
  store.set("never-set-2", "b");
  assert.equal(store.get("never-set"), undefined);
  assert.equal(store.get(""), undefined);
});

test("[boundary-1] freshness is measured from the write and excludes ttlMs itself", () => {
  const examples: Array<[number, string | undefined]> = [
    [1000000, "v"],
    [1059999, "v"],
    [1060000, undefined],
    [1060001, undefined],
    [1120000, undefined],
  ];
  for (const [t, result] of examples) {
    const clock = fakeClock();
    const store = recentReads<string>({ now: clock.now, ttlMs: 60000 });
    store.set("k", "v");
    clock.t = t;
    assert.equal(store.get("k"), result, `at t = ${t}`);
  }
});

test("[boundary-1] the exclusive boundary holds for a write at epoch zero", () => {
  const clock = fakeClock();
  clock.t = 0;
  const store = recentReads<string>({ now: clock.now, ttlMs: 60000 });
  store.set("k", "v");
  clock.t = 59999;
  assert.equal(store.get("k"), "v");
  clock.t = 60000;
  assert.equal(store.get("k"), undefined);
});

test("[boundary-2] a clock that moves backwards keeps the entry fresh", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 60000 });
  store.set("k", "v");
  clock.t = 999000;
  assert.equal(store.get("k"), "v");
});

test("[boundary-2] a clock far behind the write keeps the entry fresh and expiry still counts from the write", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 60000 });
  store.set("k", "v");
  clock.t = 0;
  assert.equal(store.get("k"), "v");
  clock.t = 1059999;
  assert.equal(store.get("k"), "v");
  clock.t = 1060000;
  assert.equal(store.get("k"), undefined);
});

test("[boundary-3] falsy values are stored and returned, not treated as misses", () => {
  const empty: unknown[] = [];
  for (const value of [null, 0, "", false, empty]) {
    const clock = fakeClock();
    const store = recentReads<unknown>({ now: clock.now });
    store.set("k", value);
    assert.equal(store.get("k"), value);
  }
});

test("[boundary-3] NaN and negative zero are returned exactly as stored", () => {
  const clock = fakeClock();
  const store = recentReads<unknown>({ now: clock.now });
  store.set("nan", NaN);
  store.set("negative-zero", -0);
  clock.t = 1059999;
  assert.equal(store.get("nan"), NaN);
  assert.equal(store.get("negative-zero"), -0);
});

test("[boundary-4] keys match exactly, are case-sensitive, and the empty string is a key", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now });
  store.set("", "empty");
  store.set("ABC-1", "upper");
  assert.equal(store.get(""), "empty");
  assert.equal(store.get("ABC-1"), "upper");
  assert.equal(store.get("abc-1"), undefined);
  assert.equal(store.get("ABC-1 "), undefined);
});

test("[boundary-4] keys differing only by whitespace, a trailing newline or unicode normalization are distinct", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now });
  store.set("k", "plain");
  store.set("é", "composed");
  assert.equal(store.get(" "), undefined);
  assert.equal(store.get("k\n"), undefined);
  assert.equal(store.get(" k"), undefined);
  assert.equal(store.get("é"), undefined);
  assert.equal(store.get("k"), "plain");
  assert.equal(store.get("é"), "composed");
});

test("[boundary-5] reading an entry does not refresh its expiry", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 60000 });
  store.set("k", "v");
  clock.t = 1059000;
  assert.equal(store.get("k"), "v");
  clock.t = 1060000;
  assert.equal(store.get("k"), undefined);
});

test("[boundary-5] repeated reads up to the last fresh millisecond do not refresh the expiry", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 60000 });
  store.set("k", "v");
  for (const t of [1000000, 1020000, 1040000, 1059999]) {
    clock.t = t;
    assert.equal(store.get("k"), "v", `at t = ${t}`);
  }
  clock.t = 1060000;
  assert.equal(store.get("k"), undefined);
});

test("[happy-3] writing a key again replaces its value and restarts its ttl", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 60000 });
  store.set("k", "old");
  clock.t = 1050000;
  store.set("k", "new");
  assert.equal(store.get("k"), "new");
  clock.t = 1109999;
  assert.equal(store.get("k"), "new");
  clock.t = 1110000;
  assert.equal(store.get("k"), undefined);
});

test("[happy-3] rewriting at the last fresh millisecond restarts the ttl from that write", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 60000 });
  store.set("k", "old");
  clock.t = 1059999;
  store.set("k", "new");
  clock.t = 1060000;
  assert.equal(store.get("k"), "new");
  clock.t = 1119998;
  assert.equal(store.get("k"), "new");
  clock.t = 1119999;
  assert.equal(store.get("k"), undefined);
});

test("[happy-4] an expired key can be written again and is fresh", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 60000 });
  store.set("k", "v1");
  clock.t = 1060000;
  assert.equal(store.get("k"), undefined);
  store.set("k", "v2");
  assert.equal(store.get("k"), "v2");
});

test("[happy-4] a key written again after expiry lives a full ttl from the new write", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 60000 });
  store.set("k", "v1");
  clock.t = 1060000;
  assert.equal(store.get("k"), undefined);
  store.set("k", "v2");
  clock.t = 1119999;
  assert.equal(store.get("k"), "v2");
  clock.t = 1120000;
  assert.equal(store.get("k"), undefined);
});

test("[happy-5] RECENT_JIRA_READ_MS equals 60000", () => {
  assert.equal(RECENT_JIRA_READ_MS, 60000);
});

test("[happy-5] RECENT_JIRA_READ_MS passed as ttlMs keeps an entry exactly one minute", () => {
  const clock = fakeClock();
  const store = recentReads<string>({
    now: clock.now,
    ttlMs: RECENT_JIRA_READ_MS,
  });
  store.set("k", "v");
  clock.t = 1000000 + 60 * 1000 - 1;
  assert.equal(store.get("k"), "v");
  clock.t = 1000000 + 60 * 1000;
  assert.equal(store.get("k"), undefined);
});

test("[boundary-6] ttlMs defaults to RECENT_JIRA_READ_MS", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now });
  store.set("k", "v");
  clock.t = 1059999;
  assert.equal(store.get("k"), "v");
  clock.t = 1060000;
  assert.equal(store.get("k"), undefined);
});

test("[boundary-6] ttlMs still defaults to RECENT_JIRA_READ_MS when only max is given", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, max: 5 });
  store.set("k", "v");
  clock.t = 1000000 + RECENT_JIRA_READ_MS - 1;
  assert.equal(store.get("k"), "v");
  clock.t = 1000000 + RECENT_JIRA_READ_MS;
  assert.equal(store.get("k"), undefined);
});

test("[boundary-7] options given as undefined take their defaults for ttlMs", () => {
  const clock = fakeClock();
  const store = recentReads<string>({
    now: clock.now,
    ttlMs: undefined,
    max: undefined,
  });
  store.set("k", "v");
  clock.t = 1059999;
  assert.equal(store.get("k"), "v");
  clock.t = 1060000;
  assert.equal(store.get("k"), undefined);
});

test("[boundary-7] max given as undefined takes its default of 1000 entries", () => {
  const clock = fakeClock();
  const store = recentReads<number>({
    now: clock.now,
    ttlMs: undefined,
    max: undefined,
  });
  for (let i = 0; i < 1000; i++) store.set(`k${i}`, i);
  assert.equal(store.get("k0"), 0);
  store.set("k1000", 1000);
  assert.equal(store.get("k0"), undefined);
  assert.equal(store.get("k1"), 1);
  assert.equal(store.get("k1000"), 1000);
});

test("[happy-6] called with no options, the store reads back a value immediately on Date.now", (t) => {
  t.mock.method(Date, "now", () => 1000000);
  const store = recentReads<string>();
  store.set("k", "v");
  assert.equal(store.get("k"), "v");
});

test("[happy-6] called with no options, the store expires on Date.now after one minute", (t) => {
  let clock = 1000000;
  t.mock.method(Date, "now", () => clock);
  const store = recentReads<string>();
  store.set("k", "v");
  clock = 1059999;
  assert.equal(store.get("k"), "v");
  clock = 1060000;
  assert.equal(store.get("k"), undefined);
});

test("[boundary-8] max defaults to 1000", () => {
  const clock = fakeClock();
  const store = recentReads<number>({ now: clock.now });
  for (let i = 0; i < 1000; i++) store.set(`k${i}`, i);
  assert.equal(store.get("k0"), 0);
  store.set("k1000", 1000);
  assert.equal(store.get("k0"), undefined);
  assert.equal(store.get("k1"), 1);
  assert.equal(store.get("k1000"), 1000);
});

test("[boundary-8] rewriting a key in a store full at the default max drops nothing", () => {
  const clock = fakeClock();
  const store = recentReads<number>({ now: clock.now });
  for (let i = 0; i < 1000; i++) store.set(`k${i}`, i);
  store.set("k0", -1);
  assert.equal(store.get("k0"), -1);
  assert.equal(store.get("k1"), 1);
  assert.equal(store.get("k999"), 999);
  store.set("k1000", 1000);
  assert.equal(store.get("k1"), undefined);
  assert.equal(store.get("k0"), -1);
  assert.equal(store.get("k2"), 2);
  assert.equal(store.get("k1000"), 1000);
});

test("[happy-7] a field list is kept for an hour", () => {
  const clock = fakeClock();
  const fields = recentReads<string[]>({ now: clock.now, ttlMs: 3600000 });
  fields.set("org_1\njcn_1", ["summary", "priority"]);
  clock.t = 4599999;
  assert.deepEqual(fields.get("org_1\njcn_1"), ["summary", "priority"]);
  clock.t = 4600000;
  assert.equal(fields.get("org_1\njcn_1"), undefined);
});

test("[happy-7] field lists for two connections each expire an hour after their own write", () => {
  const clock = fakeClock();
  const fields = recentReads<string[]>({ now: clock.now, ttlMs: 3600000 });
  fields.set("org_1\njcn_1", ["summary"]);
  clock.t = 2000000;
  fields.set("org_1\njcn_2", ["priority"]);
  clock.t = 4600000;
  assert.equal(fields.get("org_1\njcn_1"), undefined);
  assert.deepEqual(fields.get("org_1\njcn_2"), ["priority"]);
  clock.t = 5599999;
  assert.deepEqual(fields.get("org_1\njcn_2"), ["priority"]);
  clock.t = 5600000;
  assert.equal(fields.get("org_1\njcn_2"), undefined);
});

test("[boundary-9] the oldest write is dropped when a new key exceeds max", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, max: 2 });
  store.set("a", "A");
  store.set("b", "B");
  store.set("c", "C");
  assert.equal(store.get("a"), undefined);
  assert.equal(store.get("b"), "B");
  assert.equal(store.get("c"), "C");
});

test("[boundary-9] successive new keys drop entries in the order they were written", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, max: 3 });
  for (const key of ["a", "b", "c", "d", "e"]) store.set(key, key.toUpperCase());
  assert.equal(store.get("a"), undefined);
  assert.equal(store.get("b"), undefined);
  assert.equal(store.get("c"), "C");
  assert.equal(store.get("d"), "D");
  assert.equal(store.get("e"), "E");
});

test("[boundary-10] rewriting an existing key in a full store drops nothing and makes it the newest", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, max: 2 });
  store.set("a", "A1");
  store.set("b", "B");
  store.set("a", "A2");
  assert.equal(store.get("a"), "A2");
  assert.equal(store.get("b"), "B");
  store.set("c", "C");
  assert.equal(store.get("b"), undefined);
  assert.equal(store.get("a"), "A2");
  assert.equal(store.get("c"), "C");
});

test("[boundary-10] rewriting the newest key in a full store drops nothing and leaves the oldest next to go", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, max: 2 });
  store.set("a", "A");
  store.set("b", "B1");
  store.set("b", "B2");
  assert.equal(store.get("a"), "A");
  assert.equal(store.get("b"), "B2");
  store.set("c", "C");
  assert.equal(store.get("a"), undefined);
  assert.equal(store.get("b"), "B2");
  assert.equal(store.get("c"), "C");
});

test("[boundary-11] reading an entry does not protect it from eviction", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, max: 2 });
  store.set("a", "A");
  store.set("b", "B");
  assert.equal(store.get("a"), "A");
  store.set("c", "C");
  assert.equal(store.get("a"), undefined);
  assert.equal(store.get("b"), "B");
});

test("[boundary-11] many reads of the oldest entry do not move it behind later writes", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, max: 3 });
  store.set("a", "A");
  store.set("b", "B");
  store.set("c", "C");
  for (let i = 0; i < 5; i++) assert.equal(store.get("a"), "A");
  store.set("d", "D");
  assert.equal(store.get("a"), undefined);
  assert.equal(store.get("b"), "B");
  assert.equal(store.get("c"), "C");
  assert.equal(store.get("d"), "D");
});

test("[boundary-12] a max of 1 keeps only the latest key", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, max: 1 });
  store.set("a", "A");
  store.set("b", "B");
  assert.equal(store.get("a"), undefined);
  assert.equal(store.get("b"), "B");
});

test("[boundary-12] a max of 1 keeps a key that is rewritten with its new value", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, max: 1 });
  store.set("a", "A1");
  store.set("a", "A2");
  assert.equal(store.get("a"), "A2");
});

test("[unhappy-1] unusual options do not throw", () => {
  const examples: Array<[number, number]> = [
    [1, 1],
    [0.5, 1],
    [0, 0],
    [-1, -1],
    [NaN, 1.5],
    [Infinity, NaN],
    [-Infinity, Infinity],
  ];
  for (const [ttlMs, max] of examples) {
    let store: ReturnType<typeof recentReads> | undefined;
    assert.doesNotThrow(() => {
      store = recentReads({ ttlMs, max });
    }, `ttlMs ${ttlMs}, max ${max}`);
    assert.equal(typeof store?.get, "function");
    assert.equal(typeof store?.set, "function");
  }
});

test("[unhappy-1] extreme single options do not throw", () => {
  const examples = [
    { ttlMs: -0 },
    { ttlMs: Number.MIN_VALUE },
    { ttlMs: Number.MAX_VALUE },
    { max: -Infinity },
    { max: Number.MAX_SAFE_INTEGER },
    { ttlMs: -0, max: -0 },
  ];
  for (const options of examples) {
    let store: ReturnType<typeof recentReads> | undefined;
    assert.doesNotThrow(() => {
      store = recentReads(options);
    }, JSON.stringify(options));
    assert.equal(typeof store?.get, "function");
    assert.equal(typeof store?.set, "function");
  }
});

test("[unhappy-2] a ttlMs of 0 makes every read a miss", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 0 });
  store.set("k", "v");
  assert.equal(store.get("k"), undefined);
});

test("[unhappy-2] a ttlMs of 1 keeps an entry only at the instant it was written", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 1 });
  store.set("k", "v");
  assert.equal(store.get("k"), "v");
  clock.t = 1000001;
  assert.equal(store.get("k"), undefined);
});

test("[boundary-13] a ttlMs of Infinity never expires", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: Infinity });
  store.set("k", "v");
  clock.t = 1000000000000;
  assert.equal(store.get("k"), "v");
});

test("[boundary-13] a ttlMs of Infinity is still fresh at the largest safe integer time", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: Infinity });
  store.set("k", "v");
  clock.t = Number.MAX_SAFE_INTEGER;
  assert.equal(store.get("k"), "v");
});

test("[unhappy-3] a max of 0 still keeps the latest key", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, max: 0 });
  store.set("a", "A");
  store.set("b", "B");
  assert.equal(store.get("a"), undefined);
  assert.equal(store.get("b"), "B");
});

test("[unhappy-3] a max of 0 behaves like 1 across several writes and a rewrite", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, max: 0 });
  store.set("a", "A");
  store.set("b", "B");
  store.set("c", "C1");
  assert.equal(store.get("a"), undefined);
  assert.equal(store.get("b"), undefined);
  assert.equal(store.get("c"), "C1");
  store.set("c", "C2");
  assert.equal(store.get("c"), "C2");
});

test("[boundary-14] a fractional ttlMs keeps the exclusive boundary", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 0.5 });
  store.set("k", "v");
  assert.equal(store.get("k"), "v");
  clock.t = 1000000.5;
  assert.equal(store.get("k"), undefined);
});

test("[boundary-14] a fractional ttlMs is compared against fractional elapsed time", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 0.5 });
  store.set("k", "v");
  clock.t = 1000000.25;
  assert.equal(store.get("k"), "v");
  clock.t = 1000000.75;
  assert.equal(store.get("k"), undefined);
});

test("[happy-8] two stores with the same key do not see each other's writes", () => {
  const clock = fakeClock();
  const first = recentReads<string>({ now: clock.now });
  const second = recentReads<string>({ now: clock.now });
  first.set("k", "one");
  assert.equal(second.get("k"), undefined);
  second.set("k", "two");
  assert.equal(first.get("k"), "one");
  assert.equal(second.get("k"), "two");
});

test("[happy-8] filling one store does not evict entries from another", () => {
  const clock = fakeClock();
  const first = recentReads<string>({ now: clock.now, max: 1 });
  const second = recentReads<string>({ now: clock.now, max: 1 });
  first.set("a", "first A");
  second.set("b", "second B");
  first.set("c", "first C");
  assert.equal(first.get("a"), undefined);
  assert.equal(first.get("c"), "first C");
  assert.equal(second.get("b"), "second B");
  assert.equal(second.get("c"), undefined);
});

test("[concurrency-1] two callers that both miss both write, and the later write is kept", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 60000 });
  assert.equal(store.get("k"), undefined);
  assert.equal(store.get("k"), undefined);
  clock.t = 1000100;
  store.set("k", "from B");
  clock.t = 1000200;
  store.set("k", "from A");
  assert.equal(store.get("k"), "from A");
  clock.t = 1060199;
  assert.equal(store.get("k"), "from A");
  clock.t = 1060200;
  assert.equal(store.get("k"), undefined);
});

test("[concurrency-1] two callers writing at the same instant keep the later write", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 60000 });
  assert.equal(store.get("k"), undefined);
  assert.equal(store.get("k"), undefined);
  clock.t = 1000100;
  store.set("k", "from B");
  store.set("k", "from A");
  assert.equal(store.get("k"), "from A");
  clock.t = 1060099;
  assert.equal(store.get("k"), "from A");
  clock.t = 1060100;
  assert.equal(store.get("k"), undefined);
});

test("[happy-9] issueKey builds the key from organization, connection and issue", () => {
  const examples: Array<[string, string, string, string]> = [
    ["org_1", "jcn_1", "10001", "org_1\njcn_1\n10001"],
    ["org_1", "jcn_2", "10001", "org_1\njcn_2\n10001"],
    ["org_2", "jcn_1", "PROJ-7", "org_2\njcn_1\nPROJ-7"],
    ["", "", "", "\n\n"],
  ];
  for (const [organizationId, connectionId, issueId, key] of examples) {
    assert.equal(issueKey(organizationId, connectionId, issueId), key);
  }
});

test("[happy-9] issueKey keeps each part's case and surrounding whitespace", () => {
  assert.equal(
    issueKey(" org_1 ", "JCN_1", "proj-7\t"),
    " org_1 \nJCN_1\nproj-7\t",
  );
  assert.equal(issueKey("org_1", "", "10001"), "org_1\n\n10001");
});

test("[boundary-15] the same issue under different organizations or connections is a different key", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now });
  store.set(issueKey("org_1", "jcn_1", "10001"), "seen by org_1");
  assert.equal(store.get(issueKey("org_2", "jcn_1", "10001")), undefined);
  assert.equal(store.get(issueKey("org_1", "jcn_2", "10001")), undefined);
  assert.equal(store.get(issueKey("org_1", "jcn_1", "10001")), "seen by org_1");
});

test("[boundary-15] swapping the organization and connection parts is a different key", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now });
  store.set(issueKey("org_1", "jcn_1", "10001"), "seen by org_1");
  assert.equal(store.get(issueKey("jcn_1", "org_1", "10001")), undefined);
  assert.equal(store.get(issueKey("org_1", "jcn_1", "10002")), undefined);
  assert.equal(store.get("org_1\njcn_1\n10001"), "seen by org_1");
});

test("[unhappy-4] parts containing a newline are not rejected and can collide", () => {
  let key = "";
  assert.doesNotThrow(() => {
    key = issueKey("a\nb", "c", "d");
  });
  assert.equal(key, "a\nb\nc\nd");
  assert.equal(key, issueKey("a", "b\nc", "d"));
});

test("[unhappy-4] colliding issue keys address the same store entry", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now });
  store.set(issueKey("a\nb", "c", "d"), "first");
  assert.equal(store.get(issueKey("a", "b\nc", "d")), "first");
  assert.equal(store.get(issueKey("a", "b", "c\nd")), "first");
  store.set(issueKey("a", "b", "c\nd"), "second");
  assert.equal(store.get(issueKey("a\nb", "c", "d")), "second");
});
