import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, type AccessRequest, type AccessRule } from "../../src/index.js";

function rule(overrides: Partial<AccessRule> = {}): AccessRule {
  return {
    id: "private-match",
    effect: "allow",
    subject: "member-73",
    action: "document:export",
    resource: "organizations/acme/documents/009",
    conditions: [],
    ...overrides,
  };
}

function request(overrides: Partial<AccessRequest> = {}): AccessRequest {
  return {
    subject: "member-73",
    roles: [],
    action: "document:export",
    resource: "organizations/acme/documents/009",
    attributes: {},
    ...overrides,
  };
}

function expectMatch(candidate: AccessRule, input: AccessRequest, matches: boolean): void {
  const result = evaluate([candidate], input);
  assert.equal(result.effect, matches ? "allow" : "deny");
  assert.equal(result.ruleId, matches ? candidate.id : null);
}

// Extends public "[happy-1] an exact subject, action and resource allow the request".
test("[happy-1] exact matches use arbitrary ids, literal punctuation and long paths", () => {
  for (const values of [
    { subject: "用户-73", action: "file.v2+(export)?", resource: "orgs/acme.v2+/docs/[009]/résumé" },
    { subject: "tenant:member 17", action: "create-report", resource: Array.from({ length: 70 }, (_, i) => `part-${i}`).join("/") },
  ]) {
    const candidate = rule({ id: `allow-${values.subject}`, ...values });
    expectMatch(candidate, request({ ...values, roles: ["unrelated"], attributes: { unused: "ignored" } }), true);
  }
});

// Extends public "[happy-1] changing any exact part prevents the rule from matching".
test("[happy-1] literals are anchored at both ends of every exact part", () => {
  const candidate = rule();
  for (const changes of [
    { subject: "prefix-member-73" }, { subject: "member-7" },
    { action: "prefix-document:export" }, { action: "document:expor" },
    { resource: "prefix/organizations/acme/documents/009" },
    { resource: "organizations/acme/documents/009/extra" },
    { resource: "organizations/acme/documents/9" },
  ]) {
    expectMatch(candidate, request(changes), false);
  }
});

test("[happy-1] an exact subject rule does not match a role with the same spelling", () => {
  const candidate = rule({ subject: "auditor" });
  expectMatch(candidate, request({ subject: "another-member", roles: ["auditor"] }), false);
  expectMatch(candidate, request({ subject: "auditor", roles: ["other"] }), true);
});

// Extends public "[happy-2] a listed role matches regardless of the subject id or role position".
test("[happy-2] a role can appear anywhere in a long list including more than once", () => {
  const candidate = rule({ subject: "role:tenant:auditor.v2", resource: "organizations/**" });
  const others = Array.from({ length: 65 }, (_, i) => `unrelated-${i}`);
  for (const roles of [
    ["tenant:auditor.v2", ...others],
    [...others, "tenant:auditor.v2"],
    [...others.slice(0, 31), "tenant:auditor.v2", ...others.slice(31), "tenant:auditor.v2"],
  ]) {
    expectMatch(candidate, request({ subject: "unrelated-user", roles }), true);
  }
});

// Extends public "[happy-2] absent and merely similar roles do not match a role pattern".
test("[happy-2] role patterns require a whole role and cannot match the subject field", () => {
  const candidate = rule({ subject: "role:tenant:auditor.v2" });
  for (const roles of [
    [], ["role:tenant:auditor.v2"], ["tenant:auditor.v20"],
    ["prefix-tenant:auditor.v2"], ["tenant:auditorXv2"], ["tenant:auditor.v2 "],
  ]) {
    expectMatch(candidate, request({ subject: "role:tenant:auditor.v2", roles }), false);
  }
});

// Extends public "[boundary-1] a resource star matches one segment for any subject".
test("[boundary-1] multiple single stars each consume their own segment", () => {
  const candidate = rule({ subject: "*", resource: "organizations/*/documents/*/versions/*" });
  for (const subject of ["member-73", "guest", "用户-8"]) {
    expectMatch(candidate, request({ subject, resource: "organizations/acme/documents/report/versions/v10" }), true);
  }
});

// Extends public "[boundary-1] a resource star cannot skip or consume extra segments".
test("[boundary-1] several stars cannot trade segments or lose literal anchors", () => {
  const candidate = rule({ resource: "organizations/*/documents/*/versions/*" });
  for (const resource of [
    "organizations/acme/team/documents/report/versions/v10",
    "organizations/documents/report/versions/v10",
    "organizations/acme/documents/versions/v10",
    "organizations/acme/documents/report/versions",
    "organizations/acme/documents/report/versions/v10/extra",
    "organizations/acme/reports/report/versions/v10",
    "prefix/organizations/acme/documents/report/versions/v10",
  ]) {
    expectMatch(candidate, request({ resource }), false);
  }
});

test("[boundary-1] a lone resource star accepts exactly one whole segment", () => {
  const candidate = rule({ resource: "*" });
  for (const resource of ["document", "v1.2+", "资料"]) {
    expectMatch(candidate, request({ resource }), true);
  }
  for (const resource of ["a/b", "a/b/c"]) {
    expectMatch(candidate, request({ resource }), false);
  }
});

// Extends public "[boundary-1] a trailing double star matches zero, one and many segments".
test("[boundary-1] a double star after several literals accepts arbitrarily deep descendants", () => {
  const candidate = rule({ resource: "organizations/acme/**" });
  for (const resource of [
    "organizations/acme", "organizations/acme/one",
    `organizations/acme/${Array.from({ length: 90 }, (_, i) => `level-${i}`).join("/")}`,
  ]) {
    expectMatch(candidate, request({ resource }), true);
  }
  for (const resource of ["organizations", "organizations/acme-other/docs", "other/organizations/acme"]) {
    expectMatch(candidate, request({ resource }), false);
  }
});

// Extends public "[boundary-1] a leading double star matches zero or many segments before its suffix".
test("[boundary-1] a leading double star keeps a multi-segment suffix anchored", () => {
  const candidate = rule({ resource: "**/documents/final" });
  for (const resource of ["documents/final", "org/documents/final", "a/b/c/d/e/f/documents/final"]) {
    expectMatch(candidate, request({ resource }), true);
  }
  for (const resource of ["documents", "documents/final/extra", "org/not-documents/final", "org/documents/finalized"]) {
    expectMatch(candidate, request({ resource }), false);
  }
});

// Extends public "[boundary-1] an interior double star preserves the literal segments on both sides".
test("[boundary-1] an interior double star backtracks past repeated literal anchors", () => {
  const candidate = rule({ resource: "org/**/documents/final" });
  for (const resource of [
    "org/documents/final", "org/documents/draft/documents/final",
    "org/a/documents/final/archive/documents/final",
  ]) {
    expectMatch(candidate, request({ resource }), true);
  }
  for (const resource of ["org/documents/final/archive", "org/a/documents/draft", "other/org/documents/final"]) {
    expectMatch(candidate, request({ resource }), false);
  }
});

test("[boundary-1] several double stars each allow zero segments while retaining required literals", () => {
  const candidate = rule({ resource: "**/org/**/documents/**/final/**" });
  for (const resource of [
    "org/documents/final", "prefix/org/documents/final",
    "org/a/b/documents/c/final/d/e", "x/org/y/org/z/documents/final/end",
  ]) {
    expectMatch(candidate, request({ resource }), true);
  }
  for (const resource of [
    "org/final", "documents/org/final", "org/documents/finalized", "org/reports/final",
  ]) {
    expectMatch(candidate, request({ resource }), false);
  }
});

test("[boundary-1] adjacent double stars and mixed stars preserve single-segment requirements", () => {
  const adjacent = rule({ resource: "org/**/**/final" });
  for (const resource of ["org/final", "org/a/final", "org/a/b/c/final"]) {
    expectMatch(adjacent, request({ resource }), true);
  }
  const mixed = rule({ resource: "org/**/*/final/*/**" });
  for (const resource of ["org/a/final/b", "org/a/b/c/final/d/e/f"]) {
    expectMatch(mixed, request({ resource }), true);
  }
  for (const resource of ["org/final/b", "org/a/final", "org/a/b/d"]) {
    expectMatch(mixed, request({ resource }), false);
  }
});

test("[boundary-1] a lone double star matches unrelated paths at different depths", () => {
  const candidate = rule({ subject: "*", action: "*", resource: "**" });
  for (const resource of ["one", "unrelated/two", "a/b/c/d/e/f/g/h", "资料/文档"]) {
    expectMatch(candidate, request({ subject: "visitor", action: "archive", resource }), true);
  }
});

test("[boundary-1] resource literals near wildcards do not become regular expressions", () => {
  const candidate = rule({ resource: "org.v2+/(team)/[docs]/**/file?.json" });
  for (const resource of ["org.v2+/(team)/[docs]/file?.json", "org.v2+/(team)/[docs]/a/b/file?.json"]) {
    expectMatch(candidate, request({ resource }), true);
  }
  for (const resource of [
    "orgXv22/(team)/[docs]/file?.json", "org.v2+/team/[docs]/file?.json",
    "org.v2+/(team)/d/file?.json", "org.v2+/(team)/[docs]/fileX.json",
  ]) {
    expectMatch(candidate, request({ resource }), false);
  }
});

// Extends public "[boundary-2] an action prefix matches an action with a nonempty suffix".
test("[boundary-2] action prefixes work without colons and with literal punctuation", () => {
  for (const [pattern, action] of [
    ["export*", "exportAllReports"], ["file.v2+*", "file.v2+download"],
    ["team:document:*", "team:document:export:archive"],
  ]) {
    expectMatch(rule({ action: pattern }), request({ action }), true);
  }
});

// Extends public "[boundary-2] an action prefix also matches an empty suffix".
test("[boundary-2] the empty suffix works for prefixes of different lengths", () => {
  for (const prefix of ["x", "export", "tenant:document:", "file.v2+"]) {
    expectMatch(rule({ action: `${prefix}*` }), request({ action: prefix }), true);
  }
});

// Extends public "[boundary-2] similar actions that lack the complete prefix do not match".
test("[boundary-2] prefixes are anchored and their punctuation is literal", () => {
  const candidate = rule({ action: "file.v2+*" });
  for (const action of ["prefix:file.v2+read", "file.v2", "fileXv2+read", "file.v22read", "File.v2+read"]) {
    expectMatch(candidate, request({ action }), false);
  }
});

// Extends public "[boundary-2] an exact action matches only itself".
test("[boundary-2] complex exact actions do not become prefixes or regular expressions", () => {
  const candidate = rule({ action: "file.v2+(read)?" });
  expectMatch(candidate, request({ action: "file.v2+(read)?" }), true);
  for (const action of ["file.v2+(read)?all", "prefix:file.v2+(read)?", "fileXv22read", "file.v2+(read)"]) {
    expectMatch(candidate, request({ action }), false);
  }
});

// Extends public "[boundary-2] a lone action star matches unrelated actions".
test("[boundary-2] action stars handle unicode, punctuation and long action names", () => {
  const candidate = rule({ action: "*" });
  for (const action of ["导出", "report.v2+(archive)?", `tenant:${"segment:".repeat(80)}export`]) {
    expectMatch(candidate, request({ action }), true);
  }
});

// Extends public "[boundary-3] matching case in roles, actions and resources allows".
test("[boundary-3] mixed-case exact literals are preserved across all fields", () => {
  const candidate = rule({ subject: "role:TeamLead", action: "Report:Export*", resource: "Orgs/AcMe/**/Final" });
  expectMatch(candidate, request({ roles: ["other", "TeamLead"], action: "Report:ExportAll", resource: "Orgs/AcMe/Reports/Final" }), true);
});

// Extends public "[boundary-3] each role, action and resource comparison is case-sensitive".
test("[boundary-3] prefix and interior resource literal comparisons retain case", () => {
  const candidate = rule({ subject: "role:TeamLead", action: "Report:Export*", resource: "Orgs/AcMe/**/Final" });
  const matching = request({ roles: ["TeamLead"], action: "Report:ExportAll", resource: "Orgs/AcMe/Reports/Final" });
  for (const changes of [
    { roles: ["TEAMLEAD"] }, { action: "report:ExportAll" }, { action: "Report:exportAll" },
    { resource: "Orgs/acme/Reports/Final" }, { resource: "Orgs/AcMe/Reports/final" },
  ]) {
    expectMatch(candidate, { ...matching, ...changes }, false);
  }
});

// Extends public "[boundary-3] a trailing resource slash is distinct from no trailing slash".
test("[boundary-3] an exact trailing slash matches only the identical trailing slash", () => {
  const candidate = rule({ resource: "org/acme/reports/final/" });
  expectMatch(candidate, request({ resource: "org/acme/reports/final/" }), true);
  for (const resource of ["org/acme/reports/final", "org/acme/reports/final//", "org/acme/reports/final/extra"]) {
    expectMatch(candidate, request({ resource }), false);
  }
});

test("[boundary-3] exact string matching does not trim whitespace or normalize unicode", () => {
  const candidate = rule({ subject: "Member-É", action: "export", resource: "org/café/report" });
  const matching = request({ subject: "Member-É", action: "export", resource: "org/café/report" });
  expectMatch(candidate, matching, true);
  for (const changes of [
    { subject: "Member-E\u0301" }, { subject: " Member-É" },
    { action: "export " }, { resource: "org/cafe\u0301/report" }, { resource: "org/café/report " },
  ]) {
    expectMatch(candidate, { ...matching, ...changes }, false);
  }
});
