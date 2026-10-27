import assert from "node:assert/strict";
import { test } from "node:test";
import { issueKey, recentReads } from "../../src/jira/recent.js";

// The Background clock: "now" returns the number held in "t", which starts at 1000000.
function fakeClock() {
  const clock = { t: 1000000, now: () => clock.t };
  return clock;
}

// Extends "[happy-9] issueKey builds the key from organization, connection and issue":
// other identifiers, each joined with a newline and nothing else.
test("[happy-9] issueKey joins other organization, connection and issue ids with newlines", () => {
  const cases: Array<[string, string, string]> = [
    ["org_99", "jcn_abc", "ABC-123"],
    ["org_2", "jcn_2", "2"],
    ["org-with-dash", "jcn_1", "10001"],
    ["org_1", "jcn_1", "PROJ-7:summary"],
    ["Organization One", "connection/two", "ISSUE,3"],
    ["组织", "連接", "ПРОЕКТ-1"],
  ];
  for (const [organizationId, connectionId, issueId] of cases) {
    assert.equal(
      issueKey(organizationId, connectionId, issueId),
      `${organizationId}\n${connectionId}\n${issueId}`,
      JSON.stringify([organizationId, connectionId, issueId]),
    );
  }
});

// Extends "[happy-9] issueKey builds the key from organization, connection and issue":
// long parts and parts left empty one at a time.
test("[happy-9] issueKey keeps long parts whole and accepts any single empty part", () => {
  const long = "x".repeat(10000);
  assert.equal(issueKey(long, "jcn_1", long), `${long}\njcn_1\n${long}`);
  assert.equal(issueKey("", "jcn_1", "10001"), "\njcn_1\n10001");
  assert.equal(issueKey("org_1", "", "10001"), "org_1\n\n10001");
  assert.equal(issueKey("org_1", "jcn_1", ""), "org_1\njcn_1\n");
});

// Extends "[unhappy-4] parts containing a newline are not rejected and can collide":
// newlines at the ends of parts, and parts made only of newlines.
test("[unhappy-4] issueKey keeps leading, trailing and lone newlines in parts", () => {
  assert.equal(issueKey("\n", "", ""), "\n\n\n");
  assert.equal(issueKey("", "\n", ""), "\n\n\n");
  assert.equal(issueKey("", "", "\n"), "\n\n\n");
  assert.equal(issueKey("a\n", "b", "\nc"), "a\n\nb\n\nc");
  assert.equal(issueKey("x\ny\nz", "", ""), "x\ny\nz\n\n");
  assert.equal(issueKey("x\ny\nz", "", ""), issueKey("x", "y", "z\n\n"));
  assert.equal(issueKey("a\r\nb", "c", "d"), "a\r\nb\nc\nd");
});

// Extends "[unhappy-4] colliding issue keys share one store entry":
// a write under one colliding key is replaced by a write under another.
test("[unhappy-4] a write under a colliding issue key replaces the other's value", () => {
  const clock = fakeClock();
  const store = recentReads<string>({ now: clock.now, ttlMs: 1000 });
  store.set(issueKey("org_1\njcn_1", "10001", "x"), "first");
  clock.t = 1000500;
  store.set(issueKey("org_1", "jcn_1\n10001", "x"), "second");
  assert.equal(store.get(issueKey("org_1", "jcn_1", "10001\nx")), "second");
  clock.t = 1001499;
  assert.equal(store.get("org_1\njcn_1\n10001\nx"), "second");
  clock.t = 1001500;
  assert.equal(store.get("org_1\njcn_1\n10001\nx"), undefined);
});
