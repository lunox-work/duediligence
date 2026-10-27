import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../../src/index.js";
import type { AccessRequest, AccessRule } from "../../src/index.js";

function rule(
  id: string,
  effect: string,
  subject: string,
  action: string,
  resource: string,
): AccessRule {
  return { id, effect, subject, action, resource, conditions: [] };
}

function request(
  subject: string,
  roles: readonly string[],
  action: string,
  resource: string,
): AccessRequest {
  return { subject, roles, action, resource, attributes: {} };
}

const DENY_NONE = { effect: "deny", ruleId: null };

function resourceMatches(pattern: string, resource: string): boolean {
  const decision = evaluate(
    [rule("r-res", "allow", "*", "read", pattern)],
    request("u1", [], "read", resource),
  );
  return decision.effect === "allow" && decision.ruleId === "r-res";
}

function actionMatches(pattern: string, action: string): boolean {
  const decision = evaluate(
    [rule("r-act", "allow", "*", pattern, "tasks/42")],
    request("u1", [], action, "tasks/42"),
  );
  return decision.effect === "allow" && decision.ruleId === "r-act";
}

function subjectMatches(pattern: string, subject: string, roles: readonly string[]): boolean {
  const decision = evaluate(
    [rule("r-sub", "allow", pattern, "read", "tasks/42")],
    request(subject, roles, "read", "tasks/42"),
  );
  return decision.effect === "allow" && decision.ruleId === "r-sub";
}

// Extends public "[happy-1] an exact rule allows the matching request, by that rule":
// the exact rule sits after non-matching rules, with other ids and values.
test("[happy-1] an exact rule later in the list allows the request, by that rule", () => {
  const rules = [
    rule("r-other-subject", "allow", "u7", "write", "projects/9"),
    rule("r-other-resource", "allow", "alice", "write", "projects/8"),
    rule("r-exact", "allow", "alice", "write", "projects/9"),
  ];
  assert.deepEqual(evaluate(rules, request("alice", [], "write", "projects/9")), {
    effect: "allow",
    ruleId: "r-exact",
  });
});

// Extends public "[happy-1] an exact rule does not allow another subject":
// another action or another resource does not match either.
test("[happy-1] an exact rule does not allow another action or another resource", () => {
  const rules = [rule("r1", "allow", "u1", "read", "tasks/42")];
  assert.deepEqual(evaluate(rules, request("u1", [], "write", "tasks/42")), DENY_NONE);
  assert.deepEqual(evaluate(rules, request("u1", [], "read", "tasks/43")), DENY_NONE);
  assert.deepEqual(evaluate(rules, request("u1", [], "read", "tasks")), DENY_NONE);
  assert.deepEqual(evaluate(rules, request("u1", [], "read", "tasks/42/7")), DENY_NONE);
});

// Shortcut: a subject id pattern compared as a prefix or substring.
test("[happy-1] a subject id pattern matches only that exact subject id", () => {
  assert.equal(subjectMatches("u1", "u1", []), true);
  assert.equal(subjectMatches("u1", "u10", []), false);
  assert.equal(subjectMatches("u1", "xu1", []), false);
  assert.equal(subjectMatches("u10", "u1", []), false);
});

// Shortcut: a subject id pattern also compared against the request's roles.
test("[happy-1] a subject id pattern does not match a request that only lists it as a role", () => {
  assert.equal(subjectMatches("u1", "u2", ["u1"]), false);
});

test("[happy-1] a subject pattern '*' matches any subject, with or without roles", () => {
  assert.equal(subjectMatches("*", "u1", []), true);
  assert.equal(subjectMatches("*", "someone-else", ["reviewer", "admin"]), true);
});

// Extends public "[happy-2] a role pattern matches a subject that lists the role":
// the role is not the first one listed.
test("[happy-2] a role pattern matches when the role is anywhere in the request's roles", () => {
  const rules = [rule("r-rev", "allow", "role:reviewer", "read", "tasks/**")];
  assert.deepEqual(
    evaluate(rules, request("u9", ["author", "editor", "reviewer"], "read", "tasks/42/submissions/7")),
    { effect: "allow", ruleId: "r-rev" },
  );
});

// Extends public "[happy-2] the same request without the role is denied with no rule":
// other roles, a role that only shares a prefix, and a subject id equal to the role name.
test("[happy-2] a role pattern does not match other roles, role prefixes, or a subject id equal to the role name", () => {
  assert.equal(subjectMatches("role:reviewer", "u9", ["author", "editor"]), false);
  assert.equal(subjectMatches("role:reviewer", "u9", ["review"]), false);
  assert.equal(subjectMatches("role:reviewer", "u9", ["reviewers"]), false);
  assert.equal(subjectMatches("role:rev", "u9", ["reviewer"]), false);
  assert.equal(subjectMatches("role:reviewer", "reviewer", []), false);
});

test("[happy-2] the same rule list allows with the role and denies without it, in either order of evaluation", () => {
  const rules = [
    rule("r-deny-other", "deny", "role:banned", "read", "**"),
    rule("r-rev", "allow", "role:reviewer", "read", "tasks/**"),
  ];
  const without = request("u9", ["author"], "read", "tasks/42");
  const withRole = request("u9", ["author", "reviewer"], "read", "tasks/42");
  assert.deepEqual(evaluate(rules, without), DENY_NONE);
  assert.deepEqual(evaluate(rules, withRole), { effect: "allow", ruleId: "r-rev" });
  assert.deepEqual(evaluate(rules, without), DENY_NONE);
});

// Extends public "[boundary-1] a single '*' segment matches exactly one segment":
// other values and several single-segment wildcards.
test("[boundary-1] each '*' segment matches exactly one segment, whatever its value", () => {
  assert.equal(resourceMatches("tasks/*/submissions", "tasks/abc-def/submissions"), true);
  assert.equal(resourceMatches("*", "tasks"), true);
  assert.equal(resourceMatches("*", "tasks/42"), false);
  assert.equal(resourceMatches("*/*", "a/b"), true);
  assert.equal(resourceMatches("*/*", "a"), false);
  assert.equal(resourceMatches("*/*", "a/b/c"), false);
  assert.equal(resourceMatches("tasks/*/submissions/*", "tasks/42/submissions/7"), true);
  assert.equal(resourceMatches("tasks/*/submissions/*", "tasks/42/submissions"), false);
});

// Extends public "[boundary-1] a single '*' segment does not match zero, two, or trailing extra segments":
// the literal segments around the wildcard must still match.
test("[boundary-1] the literal segments around a '*' segment must match exactly", () => {
  assert.equal(resourceMatches("tasks/*/submissions", "tasks/42/reviews"), false);
  assert.equal(resourceMatches("tasks/*/submissions", "projects/42/submissions"), false);
  assert.equal(resourceMatches("tasks/*/submissions", "tasks/42/submissionsx"), false);
  assert.equal(resourceMatches("tasks/*/submissions", "x/tasks/42/submissions"), false);
});

// Shortcut: a segment containing '*' among other characters treated as a glob.
test("[boundary-1] only a whole segment '*' is a wildcard; other segments match literally", () => {
  assert.equal(resourceMatches("tasks/4*", "tasks/42"), false);
  assert.equal(resourceMatches("task*/42", "tasks/42"), false);
  assert.equal(resourceMatches("tasks/4*", "tasks/4*"), true);
});

// Extends public "[boundary-1] a trailing '**' matches zero or more segments":
// it does not stretch the literal segment before it.
test("[boundary-1] a trailing '**' does not match a different or longer first segment", () => {
  assert.equal(resourceMatches("tasks/**", "tasksx"), false);
  assert.equal(resourceMatches("tasks/**", "tasksx/42"), false);
  assert.equal(resourceMatches("tasks/**", "task"), false);
  assert.equal(resourceMatches("tasks/**", "projects/tasks/42"), false);
  assert.equal(resourceMatches("tasks/**", "tasks/a/b/c/d/e/f/g/h"), true);
});

// Extends public "[boundary-1] a leading '**' matches zero or more segments":
// more segments, and what it must not match.
test("[boundary-1] a leading '**' matches many segments but the last segment must still match", () => {
  assert.equal(resourceMatches("**/submissions", "a/b/c/d/e/submissions"), true);
  assert.equal(resourceMatches("**/submissions", "tasks/42/submissions/7"), false);
  assert.equal(resourceMatches("**/submissions", "xsubmissions"), false);
  assert.equal(resourceMatches("**/submissions", "tasks/submissionsx"), false);
});

test("[boundary-1] a '**' in the middle matches any number of segments, including none", () => {
  assert.equal(resourceMatches("tasks/**/7", "tasks/7"), true);
  assert.equal(resourceMatches("tasks/**/7", "tasks/42/7"), true);
  assert.equal(resourceMatches("tasks/**/7", "tasks/42/submissions/7"), true);
  assert.equal(resourceMatches("tasks/**/7", "tasks/42/submissions/8"), false);
  assert.equal(resourceMatches("tasks/**/7", "tasks"), false);
  assert.equal(resourceMatches("tasks/**/7", "other/42/7"), false);
});

test("[boundary-1] a pattern '**' alone matches any resource", () => {
  assert.equal(resourceMatches("**", "tasks"), true);
  assert.equal(resourceMatches("**", "tasks/42"), true);
  assert.equal(resourceMatches("**", "a/b/c/d/e"), true);
});

// Shortcut: a greedy '**' that does not backtrack.
test("[boundary-1] '**' matching requires trying shorter and longer spans", () => {
  assert.equal(resourceMatches("**/a/b", "a/a/b"), true);
  assert.equal(resourceMatches("**/a/b", "a/b/a/b"), true);
  assert.equal(resourceMatches("**/a/b", "a/b/a"), false);
  assert.equal(resourceMatches("**/42/**", "42"), true);
  assert.equal(resourceMatches("**/42/**", "tasks/42/submissions/7"), true);
  assert.equal(resourceMatches("**/42/**", "tasks/43/submissions/7"), false);
  assert.equal(resourceMatches("x/**/y/**/z", "x/y/z"), true);
  assert.equal(resourceMatches("x/**/y/**/z", "x/1/y/2/3/z"), true);
  assert.equal(resourceMatches("x/**/y/**/z", "x/1/z/2/y"), false);
});

test("[boundary-1] '*' and '**' combine by segment", () => {
  assert.equal(resourceMatches("*/**", "tasks"), true);
  assert.equal(resourceMatches("*/**", "tasks/42/7"), true);
  assert.equal(resourceMatches("**/*/submissions", "submissions"), false);
  assert.equal(resourceMatches("**/*/submissions", "42/submissions"), true);
  assert.equal(resourceMatches("**/*/submissions", "tasks/42/submissions"), true);
});

test("[boundary-1] a long resource matches by segment under several '**' segments", () => {
  const segments: string[] = [];
  for (let i = 0; i < 200; i++) segments.push("s" + i);
  const resource = segments.join("/");
  assert.equal(resourceMatches("**/s50/**/s150/**/s199", resource), true);
  assert.equal(resourceMatches("**/s150/**/s50/**/s199", resource), false);
});

// Extends public "[boundary-2] an action prefix matches actions starting with it, including the bare prefix":
// longer actions and other prefixes.
test("[boundary-2] an action prefix matches any longer action starting with it", () => {
  assert.equal(actionMatches("task:*", "task:write:all"), true);
  assert.equal(actionMatches("task:*", "task:*"), true);
  assert.equal(actionMatches("submission.*", "submission.create"), true);
  assert.equal(actionMatches("t*", "t"), true);
  assert.equal(actionMatches("t*", "task:read"), true);
});

// Extends public "[boundary-2] an action prefix does not match a shorter or different action":
// the prefix must be at the start.
test("[boundary-2] an action prefix does not match an action that only contains it later", () => {
  assert.equal(actionMatches("task:*", "xtask:read"), false);
  assert.equal(actionMatches("task:*", "my-task:read"), false);
  assert.equal(actionMatches("task:*", "ta"), false);
  assert.equal(actionMatches("submission.*", "submissionXcreate"), false);
});

// Extends public "[boundary-2] an exact action matches only itself, and '*' matches any action":
// longer exact actions, and '*' with more actions.
test("[boundary-2] an exact namespaced action matches only itself", () => {
  assert.equal(actionMatches("task:read", "task:read"), true);
  assert.equal(actionMatches("task:read", "task:readx"), false);
  assert.equal(actionMatches("task:read", "task:"), false);
  assert.equal(actionMatches("task:read", "xtask:read"), false);
  assert.equal(actionMatches("*", "a"), true);
  assert.equal(actionMatches("*", "task:delete:everything"), true);
});

// Extends public "[boundary-3] matching on role, action and resource is case-sensitive":
// each part differs in case on its own.
test("[boundary-3] a case difference in only the role, only the action, or only the resource fails", () => {
  const rules = [rule("r-case", "allow", "role:Admin", "Read", "Tasks/**")];
  assert.deepEqual(evaluate(rules, request("u1", ["admin"], "Read", "Tasks/42")), DENY_NONE);
  assert.deepEqual(evaluate(rules, request("u1", ["Admin"], "read", "Tasks/42")), DENY_NONE);
  assert.deepEqual(evaluate(rules, request("u1", ["Admin"], "Read", "tasks/42")), DENY_NONE);
  assert.deepEqual(evaluate(rules, request("u1", ["ADMIN"], "READ", "TASKS/42")), DENY_NONE);
});

test("[boundary-3] subject ids, action prefixes and resource segments are case-sensitive", () => {
  assert.equal(subjectMatches("u1", "U1", []), false);
  assert.equal(subjectMatches("Alice", "alice", []), false);
  assert.equal(actionMatches("task:*", "Task:read"), false);
  assert.equal(actionMatches("Task:*", "task:read"), false);
  assert.equal(resourceMatches("tasks/*/Submissions", "tasks/42/submissions"), false);
  assert.equal(resourceMatches("**/submissions", "tasks/42/SUBMISSIONS"), false);
});

test("[boundary-3] the 'role:' marker is case-sensitive", () => {
  assert.equal(subjectMatches("ROLE:admin", "u1", ["admin"]), false);
  assert.equal(subjectMatches("Role:admin", "u1", ["admin"]), false);
});

// Extends public "[boundary-3] a resource with a trailing slash is not the resource without it":
// leading slashes, and wildcard patterns.
test("[boundary-3] leading and trailing slashes make a different resource", () => {
  assert.equal(resourceMatches("tasks/42", "/tasks/42"), false);
  assert.equal(resourceMatches("tasks/42/", "tasks/42"), false);
  assert.equal(resourceMatches("tasks/*", "tasks/42/"), false);
  assert.equal(resourceMatches("tasks/*/submissions", "tasks/42/submissions/"), false);
});

// Shortcut: patterns turned into regular expressions without escaping.
test("[boundary-3] characters in patterns other than the wildcards match only themselves", () => {
  assert.equal(resourceMatches("tasks/4.2", "tasks/4x2"), false);
  assert.equal(resourceMatches("tasks/4.2", "tasks/4.2"), true);
  assert.equal(resourceMatches("tasks/(a|b)", "tasks/a"), false);
  assert.equal(resourceMatches("tasks/a+", "tasks/aaa"), false);
  assert.equal(resourceMatches("tasks/[0-9]", "tasks/4"), false);
  assert.equal(actionMatches("task.read", "taskXread"), false);
  assert.equal(actionMatches("task.*", "taskXread"), false);
  assert.equal(actionMatches("a+*", "aaa"), false);
  assert.equal(subjectMatches("u.1", "ux1", []), false);
  assert.equal(subjectMatches("role:rev.ewer", "u1", ["reviewer"]), false);
});

test("[boundary-3] surrounding whitespace makes a different subject, action or resource", () => {
  assert.equal(subjectMatches("u1", " u1", []), false);
  assert.equal(actionMatches("read", "read "), false);
  assert.equal(resourceMatches("tasks/42", "tasks/42 "), false);
  assert.equal(resourceMatches("tasks/42", "tasks/ 42"), false);
});
