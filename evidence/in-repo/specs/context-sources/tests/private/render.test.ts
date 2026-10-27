import assert from "node:assert/strict";
import { test } from "node:test";

import { renderSourceContext, type GithubContext, type JiraContext } from "../../src/sources.js";

/**
 * renderSourceContext: "Jira issue <key>:" and the fields' JSON, then the
 * repository header and one block per document, joined by "\n", with no
 * trailing newline and no caps.
 */

function emptyJira(key: string): JiraContext {
  return {
    key,
    issueType: null,
    status: null,
    statusCategory: null,
    priority: null,
    labels: [],
    components: [],
    fixVersions: [],
    parentKey: null,
    dueDate: null,
    storyPoints: null,
    originalEstimateSeconds: null,
    remainingEstimateSeconds: null,
    votes: null,
    watchers: null,
    subtaskCount: 0,
    links: [],
    updated: "2026-10-01T10:00:00.000+0000",
  };
}

const OPS_7: JiraContext = {
  key: "OPS-7",
  issueType: "Bug",
  status: "Done",
  statusCategory: null,
  priority: "  ",
  labels: ['say "hi"', "back\\slash", "line\nbreak"],
  components: [],
  fixVersions: ["1.2.0"],
  parentKey: null,
  dueDate: "2026-12-01",
  storyPoints: 0,
  originalEstimateSeconds: null,
  remainingEstimateSeconds: 1800,
  votes: null,
  watchers: 9,
  subtaskCount: 3,
  links: [{ type: "Relates", direction: "inward", key: null, done: true }],
  updated: null,
};

const OPS_7_FIELDS =
  '{"issueType":"Bug","status":"Done","labels":["say \\"hi\\"","back\\\\slash","line\\nbreak"],"fixVersions":["1.2.0"],"dueDate":"2026-12-01","storyPoints":0,"remainingEstimateSeconds":1800,"watchers":9,"subtaskCount":3,"links":[{"type":"Relates","direction":"inward","key":null,"done":true}]}';

const SHA = "0123456789abcdef0123456789abcdef01234567";
const REPO_HEADER = `Repository documents from acme/pay at main (${SHA}):`;

function repo(documents: GithubContext["documents"], omitted: number): GithubContext {
  return { fullName: "acme/pay", branch: "main", commitSha: SHA, documents, omitted };
}

// Extends "[happy-9] both sources".
test("[happy-9] both sources with other values, line endings and a leading blank line", () => {
  const github: GithubContext = {
    fullName: "Org-Name/repo.js",
    branch: "release/2026-10",
    commitSha: "ffffffffffffffffffffffffffffffffffffffff",
    documents: [
      { path: "Docs/Odd Name.md", bytes: 1, text: "a\r\nb\r\n", truncated: false },
      { path: "x.md", bytes: 1, text: "\n\nlead", truncated: true },
      { path: "y.md", bytes: 1, text: "y  \t", truncated: false },
    ],
    omitted: 3,
  };
  assert.equal(
    renderSourceContext({ jira: OPS_7, github }),
    [
      "Jira issue OPS-7:",
      OPS_7_FIELDS,
      "",
      "Repository documents from Org-Name/repo.js at release/2026-10 (ffffffffffffffffffffffffffffffffffffffff):",
      "",
      "### Docs/Odd Name.md",
      "a\r\nb",
      "",
      "### x.md",
      "\n\nlead",
      "[truncated]",
      "",
      "### y.md",
      "y",
      "",
      "3 more documents left out.",
    ].join("\n"),
  );
});

// Extends "[happy-9] only the repository renders without a leading blank line, text uncapped".
test("[happy-9] every document given is rendered, past any count cap", () => {
  const documents = Array.from({ length: 15 }, (_, index) => ({
    path: `docs/${index + 1}.md`,
    bytes: 1,
    text: `t ${index + 1}`,
    truncated: false,
  }));
  const blocks = documents.flatMap((document) => ["", `### ${document.path}`, document.text]);
  assert.equal(
    renderSourceContext({ jira: emptyJira("OPS-1"), github: repo(documents, 0) }),
    ["Jira issue OPS-1:", '{"subtaskCount":0}', "", REPO_HEADER, ...blocks].join("\n"),
  );
});

// Extends "[happy-10] only Jira".
test("[happy-10] only Jira, with left-out fields and characters JSON escapes", () => {
  assert.equal(renderSourceContext({ jira: OPS_7, github: null }), `Jira issue OPS-7:\n${OPS_7_FIELDS}`);
});

// Extends "[happy-10] a Jira issue with nothing beyond its key renders its subtask count".
test("[happy-10] only Jira, the key verbatim", () => {
  assert.equal(
    renderSourceContext({ jira: { ...emptyJira("abc-0042"), subtaskCount: 12 }, github: null }),
    'Jira issue abc-0042:\n{"subtaskCount":12}',
  );
});

// Extends "[boundary-16] neither source" and "[boundary-16] the rendering has no trailing newline".
test("[boundary-16] neither source is empty, and no rendering ends in a newline", () => {
  assert.equal(renderSourceContext({ jira: null, github: null }), "");
  const renderings = [
    renderSourceContext({
      jira: null,
      github: repo([{ path: "a.md", bytes: 1, text: "x\n\n", truncated: false }], 0),
    }),
    renderSourceContext({ jira: null, github: repo([], 0) }),
    renderSourceContext({ jira: emptyJira("OPS-1"), github: repo([], 4) }),
  ];
  for (const rendering of renderings) {
    assert.equal(rendering.endsWith("\n"), false, JSON.stringify(rendering));
  }
  assert.equal(renderings[0], `${REPO_HEADER}\n\n### a.md\nx`);
});

// Extends "[boundary-17] a repository with no documents".
test("[boundary-17] a repository with no documents after a Jira section, many left out", () => {
  assert.equal(
    renderSourceContext({ jira: emptyJira("OPS-1"), github: repo([], 7) }),
    `Jira issue OPS-1:\n{"subtaskCount":0}\n\n${REPO_HEADER}\n\nNo documents.\n\n7 more documents left out.`,
  );
  assert.equal(
    renderSourceContext({ jira: null, github: repo([], 2) }),
    `${REPO_HEADER}\n\nNo documents.\n\n2 more documents left out.`,
  );
  assert.equal(
    renderSourceContext({ jira: emptyJira("OPS-1"), github: repo([], 0) }),
    `Jira issue OPS-1:\n{"subtaskCount":0}\n\n${REPO_HEADER}\n\nNo documents.`,
  );
});

// Extends "[boundary-18] a truncated document whose text is blank renders only its heading and marker".
test("[boundary-18] blank documents among others: only the truncated ones keep their marker", () => {
  const github = repo(
    [
      { path: "a.md", bytes: 1, text: "Alpha\n", truncated: false },
      { path: "b.md", bytes: 1, text: "\t \r\n", truncated: true },
      { path: "c.md", bytes: 0, text: "", truncated: false },
      { path: "d.md", bytes: 1, text: "Delta", truncated: true },
    ],
    1,
  );
  assert.equal(
    renderSourceContext({ jira: null, github }),
    [
      REPO_HEADER,
      "",
      "### a.md",
      "Alpha",
      "",
      "### b.md",
      "[truncated]",
      "",
      "### c.md",
      "",
      "### d.md",
      "Delta",
      "[truncated]",
      "",
      "1 more document left out.",
    ].join("\n"),
  );
});
