import assert from "node:assert/strict";
import { test } from "node:test";
import { recentReads } from "../../src/jira/recent.js";

// The Background clock: "now" returns the number held in "t", which starts at 1000000.
function fakeClock() {
  const clock = { t: 1000000, now: () => clock.t };
  return clock;
}

// Extends "[boundary-8] max defaults to RECENT_JIRA_READS_MAX": half again as many writes,
// so the oldest 500 go and the newest 1000 stay.
test("[boundary-8] 1500 new keys into a default store keep exactly the newest 1000", () => {
  const clock = fakeClock();
  const store = recentReads<number>({ now: clock.now });
  for (let i = 0; i < 1500; i++) store.set(`k${i}`, i);
  for (let i = 0; i < 500; i++) assert.equal(store.get(`k${i}`), undefined, `k${i}`);
  for (let i = 500; i < 1500; i++) assert.equal(store.get(`k${i}`), i, `k${i}`);
});

// Extends "[boundary-8] max defaults to RECENT_JIRA_READS_MAX": keys written in descending
// order, so dropping by key order instead of write order is caught.
test("[boundary-8] a full default store drops the first-written key, not the smallest key", () => {
  const clock = fakeClock();
  const store = recentReads<number>({ now: clock.now });
  for (let i = 999; i >= 0; i--) store.set(`k${String(i).padStart(4, "0")}`, i);
  store.set("a-new", -1);
  assert.equal(store.get("k0999"), undefined);
  assert.equal(store.get("k0000"), 0);
  assert.equal(store.get("k0998"), 998);
  assert.equal(store.get("a-new"), -1);
});

// Extends "[boundary-9] the oldest write is dropped when a new key exceeds max":
// a larger max and keys written out of alphabetical order.
test("[boundary-9] with max 3, new keys drop entries in write order, not key order", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, max: 3 });
  store.set("z", "Z");
  store.set("m", "M");
  store.set("a", "A");
  store.set("b", "B");
  assert.equal(store.get("z"), undefined);
  assert.equal(store.get("m"), "M");
  assert.equal(store.get("a"), "A");
  assert.equal(store.get("b"), "B");
  store.set("y", "Y");
  assert.equal(store.get("m"), undefined);
  assert.equal(store.get("a"), "A");
  assert.equal(store.get("b"), "B");
  assert.equal(store.get("y"), "Y");
});

// Extends "[boundary-9] the oldest write is dropped when a new key exceeds max":
// a store below max drops nothing, and dropping starts only with the key past max.
test("[boundary-9] with max 5, nothing is dropped until a sixth key is written", () => {
  const clock = fakeClock();
  const store = recentReads<number>({ now: clock.now, max: 5 });
  const keys = ["e", "d", "c", "b", "a"];
  keys.forEach((key, i) => store.set(key, i));
  keys.forEach((key, i) => assert.equal(store.get(key), i, key));
  store.set("f", 5);
  assert.equal(store.get("e"), undefined);
  ["d", "c", "b", "a"].forEach((key, i) => assert.equal(store.get(key), i + 1, key));
  assert.equal(store.get("f"), 5);
});

// Extends "[boundary-9] the oldest write is dropped when a new key exceeds max":
// the writes happen at different times, all still fresh.
test("[boundary-9] the oldest write is dropped when writes are spread over time", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, max: 2, ttlMs: 60000 });
  store.set("b", "B");
  clock.t = 1010000;
  store.set("a", "A");
  clock.t = 1020000;
  store.set("c", "C");
  assert.equal(store.get("b"), undefined);
  assert.equal(store.get("a"), "A");
  assert.equal(store.get("c"), "C");
});

// Extends "[boundary-10] rewriting an existing key in a full store drops nothing and makes it the newest":
// a rewrite of the middle key of three, followed by a run of new keys.
test("[boundary-10] with max 3, a rewritten middle key moves to the newest place", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, max: 3 });
  store.set("a", "A");
  store.set("b", "B1");
  store.set("c", "C");
  store.set("b", "B2");
  assert.equal(store.get("a"), "A");
  assert.equal(store.get("b"), "B2");
  assert.equal(store.get("c"), "C");
  store.set("d", "D");
  assert.equal(store.get("a"), undefined);
  assert.equal(store.get("c"), "C");
  assert.equal(store.get("b"), "B2");
  store.set("e", "E");
  assert.equal(store.get("c"), undefined);
  assert.equal(store.get("b"), "B2");
  assert.equal(store.get("d"), "D");
  store.set("f", "F");
  assert.equal(store.get("b"), undefined);
  assert.equal(store.get("d"), "D");
  assert.equal(store.get("e"), "E");
  assert.equal(store.get("f"), "F");
});

// Extends "[boundary-10] rewriting an existing key in a full store drops nothing and makes it the newest":
// repeated rewrites of every key in a full store never drop anything.
test("[boundary-10] rewriting every key of a full store many times drops nothing", () => {
  const clock = fakeClock();
  const store = recentReads<number>({ now: clock.now, max: 3 });
  for (let round = 0; round < 5; round++) {
    for (const key of ["a", "b", "c"]) store.set(key, round);
  }
  store.set("a", 99);
  assert.equal(store.get("a"), 99);
  assert.equal(store.get("b"), 4);
  assert.equal(store.get("c"), 4);
  store.set("d", 100);
  assert.equal(store.get("b"), undefined);
  assert.equal(store.get("c"), 4);
  assert.equal(store.get("a"), 99);
  assert.equal(store.get("d"), 100);
});

// Extends "[boundary-11] reading an entry does not protect it from eviction":
// many reads of the oldest entries in a larger store still leave write order alone.
test("[boundary-11] with max 3, repeated reads of the oldest keys do not change eviction order", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, max: 3 });
  store.set("a", "A");
  store.set("b", "B");
  store.set("c", "C");
  for (let i = 0; i < 5; i++) {
    assert.equal(store.get("a"), "A");
    assert.equal(store.get("b"), "B");
  }
  store.set("d", "D");
  assert.equal(store.get("a"), undefined);
  assert.equal(store.get("b"), "B");
  store.set("e", "E");
  assert.equal(store.get("b"), undefined);
  assert.equal(store.get("c"), "C");
  assert.equal(store.get("d"), "D");
  assert.equal(store.get("e"), "E");
});

// Extends "[boundary-11] reading a missing key takes no slot in a full store":
// misses on many keys leave every written entry in place.
test("[boundary-11] many misses in a full store of three drop nothing", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, max: 3 });
  store.set("a", "A");
  store.set("b", "B");
  store.set("c", "C");
  for (let i = 0; i < 10; i++) assert.equal(store.get(`miss${i}`), undefined);
  assert.equal(store.get("a"), "A");
  assert.equal(store.get("b"), "B");
  assert.equal(store.get("c"), "C");
});

// Extends "[boundary-12] max of 1 keeps only the latest key": a long run of keys.
test("[boundary-12] max of 1 keeps only the latest of many keys", () => {
  const clock = fakeClock();
  const store = recentReads<number>({ now: clock.now, max: 1 });
  for (let i = 0; i < 50; i++) {
    store.set(`k${i}`, i);
    assert.equal(store.get(`k${i}`), i);
    if (i > 0) assert.equal(store.get(`k${i - 1}`), undefined);
  }
  for (let i = 0; i < 49; i++) assert.equal(store.get(`k${i}`), undefined, `k${i}`);
  assert.equal(store.get("k49"), 49);
});

// Extends "[boundary-12] max of 1 keeps a key that is written again":
// a key dropped by max 1 can come back and in turn drops the other.
test("[boundary-12] max of 1 alternating between two keys keeps whichever was written last", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, max: 1 });
  store.set("a", "A1");
  store.set("b", "B1");
  store.set("a", "A2");
  assert.equal(store.get("a"), "A2");
  assert.equal(store.get("b"), undefined);
  store.set("b", "B2");
  assert.equal(store.get("b"), "B2");
  assert.equal(store.get("a"), undefined);
});
