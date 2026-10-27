import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../../src/index.js";
import type { AccessRequest, AccessRule, Condition } from "../../src/index.js";

function rule(
  id: string,
  effect: string,
  subject: string,
  action: string,
  resource: string,
  conditions: Condition[] = [],
): AccessRule {
  return { id, effect, subject, action, resource, conditions };
}

function req(
  subject: string,
  action: string,
  resource: string,
  roles: string[] = [],
  attributes: Record<string, string> = {},
): AccessRequest {
  return { subject, roles, action, resource, attributes };
}

const DENIED = { effect: "deny", ruleId: null };

function allowedBy(id: string) {
  return { effect: "allow", ruleId: id };
}

// Extends "[happy-1] an exact rule allows the request it names": other
// values, a deeper resource, and the exact rule among non-matching rules.
test("[happy-1] an exact rule among non-matching rules decides on a deep resource", () => {
  const rules = [
    rule("other-subject", "allow", "u20", "write", "projects/7/boards/3/cards/9"),
    rule("other-action", "allow", "u10", "read", "projects/7/boards/3/cards/9"),
    rule("other-resource", "allow", "u10", "write", "projects/7/boards/3/cards/8"),
    rule("exact", "allow", "u10", "write", "projects/7/boards/3/cards/9"),
    rule("other-deep", "allow", "u10", "write", "projects/7/boards/3/cards/9/x"),
  ];
  assert.deepEqual(
    evaluate(rules, req("u10", "write", "projects/7/boards/3/cards/9")),
    allowedBy("exact"),
  );
});

// Extends "[happy-1] an exact rule does not match a different subject, action
// or resource": prefixes and extensions of each part must not match.
test("[happy-1] an exact rule does not match prefixes or extensions of its subject, action or resource", () => {
  const rules = [rule("r1", "allow", "u1", "read", "tasks/42")];
  assert.deepEqual(evaluate(rules, req("u10", "read", "tasks/42")), DENIED);
  assert.deepEqual(evaluate(rules, req("u", "read", "tasks/42")), DENIED);
  assert.deepEqual(evaluate(rules, req("u1", "readx", "tasks/42")), DENIED);
  assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/421")), DENIED);
  assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/4")), DENIED);
  assert.deepEqual(evaluate(rules, req("u1", "read", "x/tasks/42")), DENIED);
});

// Extends "[happy-1]": a subject pattern that is a subject id matches the
// subject id, not a role of the same name.
test("[happy-1] a subject-id pattern does not match a request that only lists it as a role", () => {
  const rules = [rule("r1", "allow", "u1", "read", "tasks/42")];
  assert.deepEqual(evaluate(rules, req("u2", "read", "tasks/42", ["u1"])), DENIED);
  assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/42", ["u2"])), allowedBy("r1"));
});

// Extends "[happy-2] a role rule allows a subject whose request lists the
// role": the role last among many, and a role-based deny.
test("[happy-2] a role rule matches the role listed last among many roles", () => {
  const rules = [rule("by-role", "allow", "role:auditor", "export", "reports/**")];
  assert.deepEqual(
    evaluate(
      rules,
      req("u5", "export", "reports/2026/q3", ["viewer", "editor", "owner", "auditor"]),
    ),
    allowedBy("by-role"),
  );
  assert.deepEqual(
    evaluate(rules, req("u5", "export", "reports/2026/q3", ["viewer", "editor", "owner"])),
    DENIED,
  );
});

// Extends "[happy-2] a role rule matches the role among others but not a
// similar role name": prefixes of the role name, and a role listed with the
// "role:" prefix, are other role names.
test("[happy-2] a role rule does not match role names that only resemble it", () => {
  const rules = [rule("r1", "allow", "role:reviewer", "read", "tasks/**")];
  for (const roles of [["review"], ["Reviewer"], ["role:reviewer"], ["reviewer "], [""]]) {
    assert.deepEqual(evaluate(rules, req("u7", "read", "tasks/42", roles)), DENIED);
  }
});

// Extends "[happy-2]": the same request without the role is denied with no
// rule, also when the role rule is a deny and another role is listed.
test("[happy-2] a request without the role is denied with no rule even with other roles", () => {
  const rules = [
    rule("reviewers", "allow", "role:reviewer", "read", "tasks/**"),
    rule("admins", "allow", "role:admin", "*", "projects/**"),
  ];
  assert.deepEqual(
    evaluate(rules, req("u7", "read", "tasks/42/submissions/7", ["admin", "editor"])),
    DENIED,
  );
  assert.deepEqual(
    evaluate(rules, req("u7", "read", "tasks/42/submissions/7", ["admin", "reviewer"])),
    allowedBy("reviewers"),
  );
});

// Extends "[boundary-1] a single-segment wildcard matches exactly one
// segment": several "*" segments and a lone "*".
test("[boundary-1] each single-segment wildcard matches exactly one segment", () => {
  const two = [rule("two", "allow", "*", "read", "*/x/*")];
  assert.deepEqual(evaluate(two, req("u1", "read", "a/x/b")), allowedBy("two"));
  assert.deepEqual(evaluate(two, req("u1", "read", "x/b")), DENIED);
  assert.deepEqual(evaluate(two, req("u1", "read", "a/x")), DENIED);
  assert.deepEqual(evaluate(two, req("u1", "read", "a/b/x/c")), DENIED);
  assert.deepEqual(evaluate(two, req("u1", "read", "a/x/b/c")), DENIED);
  assert.deepEqual(evaluate(two, req("u1", "read", "a/y/b")), DENIED);

  const lone = [rule("lone", "allow", "*", "read", "*")];
  assert.deepEqual(evaluate(lone, req("u1", "read", "tasks")), allowedBy("lone"));
  assert.deepEqual(evaluate(lone, req("u1", "read", "tasks/42")), DENIED);
});

// Extends "[boundary-1] a multi-segment wildcard matches any number of
// segments, including none": a whole-segment literal is not a string prefix
// or suffix.
test("[boundary-1] literal segments next to a multi-segment wildcard match whole segments only", () => {
  const trailing = [rule("t", "allow", "*", "read", "tasks/**")];
  assert.deepEqual(evaluate(trailing, req("u1", "read", "taskss")), DENIED);
  assert.deepEqual(evaluate(trailing, req("u1", "read", "tasksx/42")), DENIED);
  assert.deepEqual(evaluate(trailing, req("u1", "read", "my-tasks/42")), DENIED);

  const leading = [rule("l", "allow", "*", "read", "**/submissions")];
  assert.deepEqual(evaluate(leading, req("u1", "read", "mysubmissions")), DENIED);
  assert.deepEqual(evaluate(leading, req("u1", "read", "tasks/42/old-submissions")), DENIED);
  assert.deepEqual(evaluate(leading, req("u1", "read", "a/b/c/d/e/submissions")), allowedBy("l"));
});

// Extends "[boundary-1] a multi-segment wildcard ...": "**" in the middle of
// a pattern, matching zero, one or many segments.
test("[boundary-1] a multi-segment wildcard in the middle matches zero or more segments", () => {
  const rules = [rule("m", "allow", "*", "read", "tasks/**/7")];
  for (const resource of ["tasks/7", "tasks/42/7", "tasks/42/submissions/7", "tasks/7/7"]) {
    assert.deepEqual(evaluate(rules, req("u1", "read", resource)), allowedBy("m"));
  }
  for (const resource of ["tasks", "tasks/42/submissions/8", "tasks/7/8", "projects/7", "7"]) {
    assert.deepEqual(evaluate(rules, req("u1", "read", resource)), DENIED);
  }
});

// Extends "[boundary-1] a multi-segment wildcard ...": matching needs to try
// more than the first place a literal segment occurs.
test("[boundary-1] a multi-segment wildcard backtracks over repeated segments", () => {
  const leading = [rule("l", "allow", "*", "read", "**/a/b")];
  assert.deepEqual(evaluate(leading, req("u1", "read", "a/a/b")), allowedBy("l"));
  assert.deepEqual(evaluate(leading, req("u1", "read", "a/b/a/b")), allowedBy("l"));
  assert.deepEqual(evaluate(leading, req("u1", "read", "a/b/a")), DENIED);

  const middle = [rule("m", "allow", "*", "read", "x/**/y/**/z")];
  assert.deepEqual(evaluate(middle, req("u1", "read", "x/y/z")), allowedBy("m"));
  assert.deepEqual(evaluate(middle, req("u1", "read", "x/y/q/y/z")), allowedBy("m"));
  assert.deepEqual(evaluate(middle, req("u1", "read", "x/1/y/2/3/z")), allowedBy("m"));
  assert.deepEqual(evaluate(middle, req("u1", "read", "x/z")), DENIED);
  assert.deepEqual(evaluate(middle, req("u1", "read", "x/y/z/q")), DENIED);
});

// Extends "[boundary-1]": "**" alone and combined with "*".
test("[boundary-1] a lone multi-segment wildcard matches every resource, and combines with single-segment wildcards", () => {
  const all = [rule("all", "allow", "*", "read", "**")];
  for (const resource of ["tasks", "tasks/42", "a/b/c/d/e/f/g"]) {
    assert.deepEqual(evaluate(all, req("u1", "read", resource)), allowedBy("all"));
  }

  const mixed = [rule("mx", "allow", "*", "read", "*/**/submissions")];
  assert.deepEqual(evaluate(mixed, req("u1", "read", "tasks/submissions")), allowedBy("mx"));
  assert.deepEqual(evaluate(mixed, req("u1", "read", "tasks/42/submissions")), allowedBy("mx"));
  assert.deepEqual(evaluate(mixed, req("u1", "read", "submissions")), DENIED);
});

// Extends "[boundary-1]": only a whole segment "*" or "**" is a wildcard, and
// other characters are literal, including ones special in globs or regexes.
test("[boundary-1] characters inside a literal segment are matched literally", () => {
  const partial = [rule("p", "allow", "*", "read", "tasks/4*")];
  assert.deepEqual(evaluate(partial, req("u1", "read", "tasks/42")), DENIED);
  assert.deepEqual(evaluate(partial, req("u1", "read", "tasks/4*")), allowedBy("p"));

  const dotted = [rule("d", "allow", "*", "read", "files/a.txt")];
  assert.deepEqual(evaluate(dotted, req("u1", "read", "files/abtxt")), DENIED);
  assert.deepEqual(evaluate(dotted, req("u1", "read", "files/a.txt")), allowedBy("d"));

  const question = [rule("q", "allow", "*", "read", "tasks/4?")];
  assert.deepEqual(evaluate(question, req("u1", "read", "tasks/42")), DENIED);

  const bracket = [rule("b", "allow", "*", "read", "tasks/[0-9]+")];
  assert.deepEqual(evaluate(bracket, req("u1", "read", "tasks/42")), DENIED);
  assert.deepEqual(evaluate(bracket, req("u1", "read", "tasks/[0-9]+")), allowedBy("b"));
});

// Extends "[boundary-2] an action prefix matches actions starting with it,
// including the bare prefix": longer actions and other prefixes.
test("[boundary-2] an action prefix matches every longer action that starts with it", () => {
  const rules = [rule("r1", "allow", "*", "task:*", "tasks/42")];
  for (const action of ["task:read:all", "task:*", "task:a", "task::"]) {
    assert.deepEqual(evaluate(rules, req("u1", action, "tasks/42")), allowedBy("r1"));
  }
  const short = [rule("s", "allow", "*", "t*", "tasks/42")];
  for (const action of ["t", "task", "tasks:read"]) {
    assert.deepEqual(evaluate(short, req("u1", action, "tasks/42")), allowedBy("s"));
  }
  assert.deepEqual(evaluate(short, req("u1", "read", "tasks/42")), DENIED);
});

// Extends "[boundary-2] an action prefix does not match shorter or
// differently prefixed actions ...": the prefix is literal text.
test("[boundary-2] an action prefix is literal text, not a pattern", () => {
  const dotted = [rule("d", "allow", "*", "task.*", "tasks/42")];
  assert.deepEqual(evaluate(dotted, req("u1", "taskXread", "tasks/42")), DENIED);
  assert.deepEqual(evaluate(dotted, req("u1", "task.read", "tasks/42")), allowedBy("d"));

  const prefixed = [rule("p", "allow", "*", "task:*", "tasks/42")];
  assert.deepEqual(evaluate(prefixed, req("u1", "TASK:read", "tasks/42")), DENIED);
  assert.deepEqual(evaluate(prefixed, req("u1", "x:task:read", "tasks/42")), DENIED);
  assert.deepEqual(evaluate(prefixed, req("u1", "tas:read", "tasks/42")), DENIED);
});

// Extends "[boundary-2]": an exact action that is not "*" and does not end
// in "*" matches itself alone.
test("[boundary-2] an exact action matches itself alone among similar actions", () => {
  const exact = [rule("e", "allow", "*", "task:read", "tasks/42")];
  assert.deepEqual(evaluate(exact, req("u1", "task:read", "tasks/42")), allowedBy("e"));
  for (const action of ["task:", "task:rea", "task:readx", "task:read:all", "Task:read"]) {
    assert.deepEqual(evaluate(exact, req("u1", action, "tasks/42")), DENIED);
  }
});

// Extends "[boundary-3] matching on role, action and resource is
// case-sensitive": the subject id is case-sensitive too.
test("[boundary-3] subject ids and role names match case-sensitively", () => {
  const bySubject = [rule("s", "allow", "U1", "read", "tasks/42")];
  assert.deepEqual(evaluate(bySubject, req("u1", "read", "tasks/42")), DENIED);
  assert.deepEqual(evaluate(bySubject, req("U1", "read", "tasks/42")), allowedBy("s"));

  const byRole = [rule("r", "allow", "role:Admin", "Read", "Tasks/**")];
  assert.deepEqual(evaluate(byRole, req("u1", "Read", "Tasks/42", ["ADMIN"])), DENIED);
  assert.deepEqual(evaluate(byRole, req("u1", "Read", "TASKS/42", ["Admin"])), DENIED);
  assert.deepEqual(evaluate(byRole, req("u1", "READ", "Tasks/42", ["Admin"])), DENIED);
});

// Extends "[boundary-3] a resource with a trailing slash is not the same
// resource": other resources differing only by slashes, on a deeper pattern.
test("[boundary-3] resources differing from an exact pattern only by slashes do not match", () => {
  const rules = [rule("r1", "allow", "u1", "read", "projects/7/tasks/42")];
  for (const resource of [
    "projects/7/tasks/42/",
    "/projects/7/tasks/42",
    "projects//7/tasks/42",
    "projects/7/tasks42",
  ]) {
    assert.deepEqual(evaluate(rules, req("u1", "read", resource)), DENIED);
  }
  assert.deepEqual(
    evaluate(rules, req("u1", "read", "projects/7/tasks/42")),
    allowedBy("r1"),
  );
});

// Extends "[boundary-3]": a subject pattern is a subject id, a role, or "*"
// alone; a trailing "*" in a subject is not a wildcard.
test("[boundary-3] a subject pattern with a trailing star matches that exact subject id only", () => {
  const rules = [rule("r1", "allow", "u*", "read", "tasks/42")];
  assert.deepEqual(evaluate(rules, req("u1", "read", "tasks/42")), DENIED);
  assert.deepEqual(evaluate(rules, req("u*", "read", "tasks/42")), allowedBy("r1"));
});
