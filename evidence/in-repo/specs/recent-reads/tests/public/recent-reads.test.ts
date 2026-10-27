import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RECENT_JIRA_READ_MS,
  RECENT_JIRA_READS_MAX,
  issueKey,
  recentReads,
} from "../src/jira/recent.js";

// The Background clock: "now" returns the number held in "t", which starts at 1000000.
function fakeClock() {
  const clock = { t: 1000000, now: () => clock.t };
  return clock;
}

const ttlError = {
  name: "RangeError",
  message: "ttlMs must be a positive finite number",
};
const maxError = { name: "RangeError", message: "max must be a positive integer" };

test("[happy-1] a value just written is returned as the same object", () => {
  const clock = fakeClock();
  const store = recentReads<{ summary: string }>({ now: clock.now, ttlMs: 60000 });
  const issue = { summary: "Fix login" };
  store.set("org_1\njcn_1\n10001", issue);
  assert.equal(store.get("org_1\njcn_1\n10001"), issue);
});

test("[happy-1] the same object is still returned at the last fresh millisecond", () => {
  const clock = fakeClock();
  const store = recentReads<{ summary: string }>({ now: clock.now, ttlMs: 60000 });
  const issue = { summary: "Fix login" };
  store.set("org_1\njcn_1\n10001", issue);
  clock.t = 1059999;
  assert.equal(store.get("org_1\njcn_1\n10001"), issue);
});

test("[happy-2] a key never written is a miss", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now });
  assert.equal(store.get("never-set"), undefined);
});

test("[happy-2] the empty-string key is a miss until it is written", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now });
  store.set("k", "v");
  assert.equal(store.get(""), undefined);
  assert.equal(store.get("never-set"), undefined);
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

test("[happy-3] a rewrite at the last fresh millisecond restarts the ttl from that write", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 60000 });
  store.set("k", "old");
  clock.t = 1059999;
  store.set("k", "new");
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

test("[happy-5] the exported constants are one minute and 1000 entries", () => {
  assert.equal(RECENT_JIRA_READ_MS, 60000);
  assert.equal(RECENT_JIRA_READS_MAX, 1000);
});

test("[happy-5] the exported constants are themselves valid options", () => {
  const clock = fakeClock();
  assert.doesNotThrow(() =>
    recentReads<string>({
      now: clock.now,
      ttlMs: RECENT_JIRA_READ_MS,
      max: RECENT_JIRA_READS_MAX,
    }),
  );
});

test("[happy-6] called with no options, the store returns a value read immediately", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1000000 });
  const store = recentReads<string>();
  store.set("k", "v");
  assert.equal(store.get("k"), "v");
});

test("[happy-6] called with no options, the store expires entries one minute by Date.now", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1000000 });
  const store = recentReads<string>();
  store.set("k", "v");
  t.mock.timers.tick(59999);
  assert.equal(store.get("k"), "v");
  t.mock.timers.tick(1);
  assert.equal(store.get("k"), undefined);
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

test("[happy-7] a field list outlives the one-minute default when given an hour", () => {
  const clock = fakeClock();
  const fields = recentReads<string[]>({ now: clock.now, ttlMs: 3600000 });
  const list = ["summary", "priority"];
  fields.set("org_1\njcn_1", list);
  clock.t = 1060000;
  assert.equal(fields.get("org_1\njcn_1"), list);
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

test("[happy-8] writes to one store do not count against another store's max", () => {
  const clock = fakeClock();
  const first = recentReads<string>({ now: clock.now, max: 1 });
  const second = recentReads<string>({ now: clock.now, max: 1 });
  first.set("a", "A");
  second.set("b", "B");
  assert.equal(first.get("a"), "A");
  assert.equal(second.get("b"), "B");
});

test("[happy-9] issueKey builds the key from organization, connection and issue", () => {
  assert.equal(issueKey("org_1", "jcn_1", "10001"), "org_1\njcn_1\n10001");
  assert.equal(issueKey("org_1", "jcn_2", "10001"), "org_1\njcn_2\n10001");
  assert.equal(issueKey("org_2", "jcn_1", "PROJ-7"), "org_2\njcn_1\nPROJ-7");
  assert.equal(issueKey("", "", ""), "\n\n");
});

test("[happy-9] issueKey keeps its parts as given, without trimming or changing case", () => {
  assert.equal(issueKey(" ORG_1", "Jcn_1 ", " proj-7 "), " ORG_1\nJcn_1 \n proj-7 ");
});

test("[boundary-1] freshness is measured from the write, exclusive of ttlMs", () => {
  const cases: Array<[number, string | undefined]> = [
    [1000000, "v"],
    [1059999, "v"],
    [1060000, undefined],
    [1060001, undefined],
    [1120000, undefined],
  ];
  for (const [at, result] of cases) {
    const clock = fakeClock();
    const store = recentReads<string>({ now: clock.now, ttlMs: 60000 });
    store.set("k", "v");
    clock.t = at;
    assert.equal(store.get("k"), result, `t = ${at}`);
  }
});

test("[boundary-1] freshness is exclusive of ttlMs for a write at epoch zero", () => {
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

test("[boundary-2] after the clock moves backwards, the entry still expires ttlMs after its write", () => {
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
  const values: unknown[] = [null, 0, "", false, []];
  for (const value of values) {
    const clock = fakeClock();
    const store = recentReads<unknown>({ now: clock.now });
    store.set("k", value);
    assert.equal(store.get("k"), value, `value ${JSON.stringify(value)}`);
  }
});

test("[boundary-3] NaN and -0 are returned exactly as stored", () => {
  const clock = fakeClock();
  const store = recentReads<number>({ now: clock.now });
  store.set("nan", NaN);
  store.set("negative-zero", -0);
  assert.equal(store.get("nan"), NaN);
  assert.equal(Object.is(store.get("negative-zero"), -0), true);
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

test("[boundary-4] keys that name object properties are ordinary keys", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now });
  assert.equal(store.get("constructor"), undefined);
  assert.equal(store.get("toString"), undefined);
  assert.equal(store.get("__proto__"), undefined);
  store.set("__proto__", "proto");
  assert.equal(store.get("__proto__"), "proto");
  assert.equal(store.get("constructor"), undefined);
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

test("[boundary-5] many reads, up to the last fresh millisecond, do not refresh its expiry", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 60000 });
  store.set("k", "v");
  for (const at of [1000000, 1030000, 1059000, 1059999]) {
    clock.t = at;
    assert.equal(store.get("k"), "v", `t = ${at}`);
  }
  clock.t = 1060000;
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

test("[boundary-6] ttlMs defaults to RECENT_JIRA_READ_MS when only max is given", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, max: 5 });
  store.set("k", "v");
  clock.t = 1000000 + RECENT_JIRA_READ_MS - 1;
  assert.equal(store.get("k"), "v");
  clock.t = 1000000 + RECENT_JIRA_READ_MS;
  assert.equal(store.get("k"), undefined);
});

test("[boundary-7] options given as undefined take their defaults", () => {
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

test("[boundary-7] max given as undefined holds RECENT_JIRA_READS_MAX entries", () => {
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
});

test("[boundary-8] max defaults to RECENT_JIRA_READS_MAX", () => {
  const clock = fakeClock();
  const store = recentReads<number>({ now: clock.now });
  for (let i = 0; i < 1000; i++) store.set(`k${i}`, i);
  assert.equal(store.get("k0"), 0);
  store.set("k1000", 1000);
  assert.equal(store.get("k0"), undefined);
  assert.equal(store.get("k1"), 1);
  assert.equal(store.get("k1000"), 1000);
});

test("[boundary-8] rewriting the oldest key of a full default store drops nothing", () => {
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

test("[boundary-9] each new key into a full store drops the next-oldest write", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, max: 2 });
  store.set("a", "A");
  store.set("b", "B");
  store.set("c", "C");
  store.set("d", "D");
  assert.equal(store.get("a"), undefined);
  assert.equal(store.get("b"), undefined);
  assert.equal(store.get("c"), "C");
  assert.equal(store.get("d"), "D");
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

test("[boundary-10] rewriting the newest key in a full store drops nothing and keeps the order", () => {
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

test("[boundary-11] reading a missing key takes no slot in a full store", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, max: 1 });
  store.set("a", "A");
  assert.equal(store.get("x"), undefined);
  assert.equal(store.get("a"), "A");
});

test("[boundary-12] max of 1 keeps only the latest key", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, max: 1 });
  store.set("a", "A");
  store.set("b", "B");
  assert.equal(store.get("a"), undefined);
  assert.equal(store.get("b"), "B");
});

test("[boundary-12] max of 1 keeps a key that is written again", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, max: 1 });
  store.set("a", "A1");
  store.set("a", "A2");
  assert.equal(store.get("a"), "A2");
});

test("[boundary-13] the smallest valid options are accepted", () => {
  assert.doesNotThrow(() => recentReads({ ttlMs: 1, max: 1 }));
  assert.doesNotThrow(() => recentReads({ ttlMs: 0.5, max: 1 }));
});

test("[boundary-13] the smallest positive number is a valid ttlMs", () => {
  assert.doesNotThrow(() => recentReads({ ttlMs: Number.MIN_VALUE, max: 1 }));
});

test("[boundary-14] a fractional ttlMs keeps the exclusive boundary", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 0.5 });
  store.set("k", "v");
  assert.equal(store.get("k"), "v");
  clock.t = 1000000.5;
  assert.equal(store.get("k"), undefined);
});

test("[boundary-14] a ttlMs of 1.5 is fresh after 1 ms and gone at 1.5 ms", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 1.5 });
  store.set("k", "v");
  clock.t = 1000001;
  assert.equal(store.get("k"), "v");
  clock.t = 1000001.5;
  assert.equal(store.get("k"), undefined);
});

test("[boundary-15] the same issue under different organizations or connections is a different key", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now });
  store.set(issueKey("org_1", "jcn_1", "10001"), "seen by org_1");
  assert.equal(store.get(issueKey("org_2", "jcn_1", "10001")), undefined);
  assert.equal(store.get(issueKey("org_1", "jcn_2", "10001")), undefined);
  assert.equal(store.get(issueKey("org_1", "jcn_1", "10001")), "seen by org_1");
});

test("[boundary-15] a different issue under the same organization and connection is a different key", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now });
  store.set(issueKey("org_1", "jcn_1", "PROJ-7"), "seen");
  assert.equal(store.get(issueKey("org_1", "jcn_1", "PROJ-8")), undefined);
  assert.equal(store.get(issueKey("org_1", "jcn_1", "proj-7")), undefined);
  assert.equal(store.get(issueKey("org_1", "jcn_1", "PROJ-7")), "seen");
});

test("[unhappy-1] an invalid ttlMs is refused with a RangeError", () => {
  for (const ttlMs of [0, -1, NaN, Infinity, -Infinity]) {
    assert.throws(() => recentReads({ ttlMs }), ttlError, `ttlMs ${ttlMs}`);
  }
});

test("[unhappy-1] a ttlMs of -0 is refused even alongside valid now and max", () => {
  const clock = fakeClock();
  assert.throws(
    () => recentReads({ ttlMs: -0, now: clock.now, max: 1 }),
    ttlError,
  );
});

test("[unhappy-2] an invalid max is refused with a RangeError", () => {
  for (const max of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => recentReads({ max }), maxError, `max ${max}`);
  }
});

test("[unhappy-2] a max of 0.5, -0 or -Infinity is refused even alongside a valid ttlMs", () => {
  for (const max of [0.5, -0, -Infinity]) {
    assert.throws(
      () => recentReads({ ttlMs: 60000, max }),
      maxError,
      `max ${max}`,
    );
  }
});

test("[unhappy-3] when both are invalid, the ttlMs error wins", () => {
  assert.throws(() => recentReads({ ttlMs: 0, max: 0 }), ttlError);
});

test("[unhappy-3] the ttlMs error wins for NaN ttlMs and fractional max", () => {
  assert.throws(() => recentReads({ ttlMs: NaN, max: 1.5 }), ttlError);
});

test("[unhappy-4] parts containing a newline are not rejected and can collide", () => {
  assert.equal(issueKey("a\nb", "c", "d"), "a\nb\nc\nd");
  assert.equal(issueKey("a\nb", "c", "d"), issueKey("a", "b\nc", "d"));
});

test("[unhappy-4] colliding issue keys share one store entry", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now });
  assert.equal(issueKey("a", "b", "c\nd"), "a\nb\nc\nd");
  store.set(issueKey("a\nb", "c", "d"), "x");
  assert.equal(store.get(issueKey("a", "b\nc", "d")), "x");
  assert.equal(store.get(issueKey("a", "b", "c\nd")), "x");
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

test("[concurrency-1] two callers that write at the same instant keep the later call", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 60000 });
  assert.equal(store.get("k"), undefined);
  assert.equal(store.get("k"), undefined);
  store.set("k", "from A");
  store.set("k", "from B");
  assert.equal(store.get("k"), "from B");
  clock.t = 1059999;
  assert.equal(store.get("k"), "from B");
  clock.t = 1060000;
  assert.equal(store.get("k"), undefined);
});
