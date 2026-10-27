import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type GithubContext,
  type JiraContext,
  renderSourceContext,
} from "../src/sources.js";

/** The filled-in issue "PAY-42" of the jiraContextFields rule. */
const PAY_42: JiraContext = {
  key: "PAY-42",
  issueType: "Story",
  status: "In Progress",
  statusCategory: "indeterminate",
  priority: "High",
  labels: ["billing"],
  components: ["api"],
  fixVersions: [],
  parentKey: "PAY-1",
  dueDate: null,
  storyPoints: 5,
  originalEstimateSeconds: 28800,
  remainingEstimateSeconds: null,
  votes: 0,
  watchers: 3,
  subtaskCount: 2,
  links: [{ type: "Blocks", direction: "outward", key: "PAY-50", done: false }],
  updated: "2026-10-01T10:00:00.000+0000",
};

const ACME_PAY: GithubContext = {
  fullName: "acme/pay",
  branch: "main",
  commitSha: "0123456789abcdef0123456789abcdef01234567",
  documents: [
    { path: "README.md", bytes: 20, text: "# Pay\nCharges cards.", truncated: false },
    { path: "docs/setup.md", bytes: 30000, text: "Run make up.", truncated: true },
  ],
  omitted: 2,
};

const JIRA_SECTION =
  "Jira fields:\n" +
  '{"issueType":"Story","status":"In Progress","priority":"High","labels":["billing"],"components":["api"],"storyPoints":5,"originalEstimateHours":8,"votes":0,"watchers":3,"subtasks":2,"hasParent":true,"links":[{"type":"Blocks","direction":"outward","done":false}]}';

const REPOSITORY_SECTION =
  "Repository documents:\n" +
  "\n" +
  "--- README.md ---\n" +
  "# Pay\n" +
  "Charges cards.\n" +
  "\n" +
  "--- docs/setup.md (cut short) ---\n" +
  "Run make up.";

test("[happy-9] renderSourceContext with both sources", () => {
  assert.equal(
    renderSourceContext({ jira: PAY_42, github: ACME_PAY }),
    `${JIRA_SECTION}\n\n${REPOSITORY_SECTION}`,
  );
});

test("[happy-9] no caps apply when rendering, and the key, repository and commit are not rendered", () => {
  const long = "x".repeat(60000);
  const rendered = renderSourceContext({
    jira: PAY_42,
    github: {
      ...ACME_PAY,
      documents: [{ path: "a.md", bytes: 1, text: long, truncated: false }],
    },
  });
  assert.equal(
    rendered,
    `${JIRA_SECTION}\n\nRepository documents:\n\n--- a.md ---\n${long}`,
  );
  for (const hidden of ["PAY-42", "PAY-50", "PAY-1", "acme/pay", ACME_PAY.commitSha]) {
    assert.equal(rendered.includes(hidden), false, hidden);
  }
});

test("[happy-10] renderSourceContext with only Jira", () => {
  assert.equal(renderSourceContext({ jira: PAY_42, github: null }), JIRA_SECTION);
});

test("[happy-10] only Jira names neither the issue nor what it links to", () => {
  const rendered = renderSourceContext({ jira: PAY_42, github: null });
  assert.equal(rendered.split("\n").length, 2);
  for (const hidden of ["PAY-42", "PAY-50", "PAY-1", "2026-10-01"]) {
    assert.equal(rendered.includes(hidden), false, hidden);
  }
});

test("[happy-11] renderSourceContext with only the repository", () => {
  assert.equal(
    renderSourceContext({ jira: null, github: ACME_PAY }),
    REPOSITORY_SECTION,
  );
});

test("[happy-11] a lone truncated document's text is rendered as given, with nothing added after it", () => {
  assert.equal(
    renderSourceContext({
      jira: null,
      github: {
        ...ACME_PAY,
        documents: [
          { path: "docs/a.md", bytes: 9, text: "line\n", truncated: true },
        ],
        omitted: 0,
      },
    }),
    "Repository documents:\n\n--- docs/a.md (cut short) ---\nline\n",
  );
});

test("[boundary-14] renderSourceContext with neither source", () => {
  assert.equal(renderSourceContext({ jira: null, github: null }), "");
});

test("[boundary-14] no Jira and a repository without documents contribute nothing", () => {
  assert.equal(
    renderSourceContext({
      jira: null,
      github: { ...ACME_PAY, documents: [], omitted: 0 },
    }),
    "",
  );
});

test("[boundary-15] a repository with no documents contributes nothing", () => {
  for (const omitted of [0, 1]) {
    assert.equal(
      renderSourceContext({
        jira: null,
        github: { ...ACME_PAY, documents: [], omitted },
      }),
      "",
      String(omitted),
    );
  }
});

test("[boundary-15] beside Jira, a repository with no documents adds no section", () => {
  assert.equal(
    renderSourceContext({
      jira: PAY_42,
      github: { ...ACME_PAY, documents: [], omitted: 5 },
    }),
    JIRA_SECTION,
  );
});
