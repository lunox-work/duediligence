import assert from "node:assert/strict";
import { test } from "node:test";

import * as index from "../src/index.js";
import { ISSUE_FIELDS } from "../src/mapping.js";
import { SPEC_FIELDS, specHash, toIssueSpec } from "../src/spec.js";

/** specHash("Add login", "Users can sign in.") */
const ADD_LOGIN_HASH =
  "8a71edd3e48141d9e972a05a5e3315c9f55609fc4cf20abdd24dd1e606fb9e14";
/** specHash("Fix the build", "Line one\nLine two") */
const FIX_BUILD_HASH =
  "72cf51e53aee072c65b91b674e5d50ac48290bacff428cc88d992e91a1a95448";
/** specHash("", "") */
const EMPTY_HASH =
  "439083f38956ba51ece90631552c6ea23c5c29570d3d5710e408e77e01ba7375";

type Fields = Parameters<typeof toIssueSpec>[1];

const SPEC_KEYS = [
  "key",
  "summary",
  "descriptionText",
  "issueType",
  "updated",
  "specHash",
];

/** A v3 description: one paragraph of one text run. */
const ADD_LOGIN_ADF = {
  type: "doc",
  version: 1,
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Users can sign in." }],
    },
  ],
};

/** The descriptionText toIssueSpec reads from `description`. */
async function descriptionTextOf(description: unknown): Promise<string> {
  return (await toIssueSpec("ACME-1", { description })).descriptionText;
}

/** `levels` nested blockquotes, built without recursion, around `innermost`. */
function nestedBlockquotes(levels: number, innermost: object): object {
  let node: object = innermost;
  for (let i = 0; i < levels; i++) {
    node = { type: "blockquote", content: [node] };
  }
  return node;
}

test("[happy-6] a complete v3 issue becomes a spec", async () => {
  const result = await toIssueSpec("ACME-123", {
    summary: "Add login",
    description: ADD_LOGIN_ADF,
    issuetype: { name: "Story" },
    updated: "2026-10-20T09:15:00.000+0000",
  });

  assert.deepEqual(result, {
    key: "ACME-123",
    summary: "Add login",
    descriptionText: "Users can sign in.",
    issueType: "Story",
    updated: "2026-10-20T09:15:00.000+0000",
    specHash: ADD_LOGIN_HASH,
  });
  assert.deepEqual(Object.keys(result).sort(), [...SPEC_KEYS].sort());
});

test("[happy-6] fields beyond the spec fields add no keys to the result", async () => {
  const fields = {
    summary: "Add login",
    description: ADD_LOGIN_ADF,
    issuetype: { name: "Story" },
    updated: "2026-10-20T09:15:00.000+0000",
    status: { name: "In Progress" },
    labels: ["auth"],
    priority: { name: "High" },
  };
  const result = await toIssueSpec("ACME-123", fields);

  assert.deepEqual(Object.keys(result).sort(), [...SPEC_KEYS].sort());
  assert.equal(result.specHash, ADD_LOGIN_HASH);
});

test("[happy-7] the key is passed through verbatim", async () => {
  assert.equal((await toIssueSpec("acme-7", { summary: "x" })).key, "acme-7");
});

test("[happy-7] an empty or padded key is passed through without validation", async () => {
  assert.equal((await toIssueSpec("", { summary: "x" })).key, "");
  assert.equal((await toIssueSpec("  ACME-7 ", { summary: "x" })).key, "  ACME-7 ");
});

test("[happy-8] the input fields object is not modified", async () => {
  const fields = {
    summary: "Add login",
    description: "Users can sign in.",
    issuetype: { name: "Bug" },
    updated: null,
  };
  await toIssueSpec("ACME-1", fields);

  assert.deepEqual(fields, {
    summary: "Add login",
    description: "Users can sign in.",
    issuetype: { name: "Bug" },
    updated: null,
  });
});

test("[happy-8] an ADF description is not modified while it is flattened", async () => {
  const fields = {
    summary: "Add login",
    description: {
      type: "doc",
      content: [
        ADD_LOGIN_ADF.content[0],
        "x",
        null,
        { type: "paragraph" },
        { type: "bulletList", content: [{ type: "listItem", content: [] }] },
      ],
    },
  };
  const before = structuredClone(fields);
  await toIssueSpec("ACME-1", fields);

  assert.deepEqual(fields, before);
});

test("[happy-9] issue type and updated stamp do not affect the hash", async () => {
  const a = await toIssueSpec("ACME-1", {
    summary: "Add login",
    description: "Users can sign in.",
    issuetype: { name: "Story" },
    updated: "2026-10-20T09:15:00.000+0000",
  });
  const b = await toIssueSpec("ACME-2", {
    summary: "Add login",
    description: "Users can sign in.",
    issuetype: { name: "Bug" },
    updated: "2026-10-24T17:00:00.000+0000",
  });

  assert.equal(a.specHash, ADD_LOGIN_HASH);
  assert.equal(b.specHash, ADD_LOGIN_HASH);
});

test("[happy-9] a missing issue type and stamp, and a different key, leave the hash alone", async () => {
  const bare = await toIssueSpec("OTHER-99", {
    summary: "Add login",
    description: "Users can sign in.",
  });
  const fromAdf = await toIssueSpec("ACME-1", {
    summary: "Add login",
    description: ADD_LOGIN_ADF,
    issuetype: null,
    updated: 1729415700000,
  });

  assert.equal(bare.specHash, ADD_LOGIN_HASH);
  assert.equal(fromAdf.specHash, ADD_LOGIN_HASH);
});

test("[boundary-5] a string summary is used verbatim, padding included", async () => {
  assert.equal(
    (await toIssueSpec("ACME-1", { summary: "  Add login  " })).summary,
    "  Add login  ",
  );
  assert.equal((await toIssueSpec("ACME-1", { summary: "" })).summary, "");
});

test("[boundary-5] a missing or non-string summary becomes the empty string", async () => {
  for (const fields of [
    {},
    { summary: null },
    { summary: 42 },
    { summary: ["Add login"] },
  ]) {
    assert.equal(
      (await toIssueSpec("ACME-1", fields)).summary,
      "",
      `summary of ${JSON.stringify(fields)}`,
    );
  }
});

test("[boundary-6] a string issuetype.name is used, even when empty", async () => {
  assert.equal(
    (await toIssueSpec("ACME-1", { issuetype: { name: "Bug" } })).issueType,
    "Bug",
  );
  assert.equal(
    (await toIssueSpec("ACME-1", { issuetype: { name: "" } })).issueType,
    "",
  );
});

test("[boundary-6] a missing or non-string issuetype.name becomes Task", async () => {
  const cases: Fields[] = [
    { issuetype: {} },
    { issuetype: { name: null } },
    { issuetype: { name: 3 } },
    { issuetype: null },
    {},
  ];
  for (const fields of cases) {
    assert.equal(
      (await toIssueSpec("ACME-1", fields)).issueType,
      "Task",
      `issueType of ${JSON.stringify(fields)}`,
    );
  }
});

test("[boundary-7] a string updated is used verbatim, unvalidated", async () => {
  for (const updated of ["2026-10-20T09:15:00.000+0000", "not a date", ""]) {
    assert.equal((await toIssueSpec("ACME-1", { updated })).updated, updated);
  }
});

test("[boundary-7] a missing or non-string updated becomes null", async () => {
  for (const fields of [{ updated: null }, {}, { updated: 1729415700000 }]) {
    assert.equal(
      (await toIssueSpec("ACME-1", fields)).updated,
      null,
      `updated of ${JSON.stringify(fields)}`,
    );
  }
});

test("[happy-10] a plain-string description is kept exactly", async () => {
  const result = await toIssueSpec("ACME-1", {
    summary: "Fix the build",
    description: "Line one\nLine two",
  });

  assert.equal(result.descriptionText, "Line one\nLine two");
  assert.equal(result.specHash, FIX_BUILD_HASH);
});

test("[happy-10] an empty string description is kept as the empty string", async () => {
  const result = await toIssueSpec("ACME-1", { summary: "", description: "" });

  assert.equal(result.descriptionText, "");
  assert.equal(result.specHash, EMPTY_HASH);
});

test("[boundary-8] carriage returns and surrounding whitespace are not normalised", async () => {
  assert.equal(await descriptionTextOf("  a\r\nb  "), "  a\r\nb  ");
});

test("[boundary-8] a whitespace-only string description is kept as is", async () => {
  assert.equal(await descriptionTextOf(" \t\r\n "), " \t\r\n ");
});

test("[boundary-9] an absent or null description becomes the empty string", async () => {
  for (const fields of [{ summary: "" }, { summary: "", description: null }]) {
    const result = await toIssueSpec("ACME-1", fields);
    assert.equal(result.descriptionText, "");
    assert.equal(result.specHash, EMPTY_HASH);
  }
});

test("[boundary-9] a number, boolean or array description becomes the empty string", async () => {
  for (const description of [42, true, ["text"]]) {
    const result = await toIssueSpec("ACME-1", { summary: "", description });
    assert.equal(result.descriptionText, "", `description ${JSON.stringify(description)}`);
    assert.equal(result.specHash, EMPTY_HASH);
  }
});

const FLATTEN_CASES: [string, unknown, string][] = [
  [
    "one paragraph",
    { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] },
    "Hello",
  ],
  [
    "marked runs join with no gap",
    {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello " },
            { type: "text", text: "world", marks: [{ type: "strong" }] },
          ],
        },
      ],
    },
    "Hello world",
  ],
  [
    "paragraphs join with a newline",
    {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First" }] },
        { type: "paragraph", content: [{ type: "text", text: "Second" }] },
      ],
    },
    "First\nSecond",
  ],
  [
    "hard break is a newline",
    {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "line one" },
            { type: "hardBreak" },
            { type: "text", text: "line two" },
          ],
        },
      ],
    },
    "line one\nline two",
  ],
  [
    "heading then paragraph",
    {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Goal" }] },
        { type: "paragraph", content: [{ type: "text", text: "Ship it" }] },
      ],
    },
    "Goal\nShip it",
  ],
  [
    "bullet list items, one per line",
    {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "b" }] }] },
          ],
        },
      ],
    },
    "a\nb",
  ],
  [
    "code block keeps its own newlines",
    {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "sh" },
          content: [{ type: "text", text: "npm ci\nnpm test" }],
        },
      ],
    },
    "npm ci\nnpm test",
  ],
  [
    "mention uses attrs.text",
    {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "ask " },
            { type: "mention", attrs: { id: "123", text: "@Ann" } },
          ],
        },
      ],
    },
    "ask @Ann",
  ],
  [
    "emoji uses attrs.text",
    {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "ok " },
            { type: "emoji", attrs: { shortName: ":smile:", text: "\u{1F604}" } },
          ],
        },
      ],
    },
    "ok \u{1F604}",
  ],
  [
    "emoji falls back to shortName",
    {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "emoji", attrs: { shortName: ":smile:" } }] }],
    },
    ":smile:",
  ],
  [
    "inline card uses attrs.url",
    {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "see " },
            { type: "inlineCard", attrs: { url: "https://acme.atlassian.net/browse/ACME-9" } },
          ],
        },
      ],
    },
    "see https://acme.atlassian.net/browse/ACME-9",
  ],
  [
    "task items hold inline content",
    {
      type: "doc",
      content: [
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              content: [
                { type: "text", text: "do " },
                { type: "text", text: "this" },
              ],
            },
            { type: "taskItem", content: [{ type: "text", text: "then that" }] },
          ],
        },
      ],
    },
    "do this\nthen that",
  ],
  [
    "unknown inline node adds nothing",
    {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "State: " },
            { type: "status", attrs: { text: "DONE" } },
            { type: "text", text: " ok" },
          ],
        },
      ],
    },
    "State:  ok",
  ],
  [
    "a root that is not a doc",
    { type: "paragraph", content: [{ type: "text", text: "bare" }] },
    "bare",
  ],
];

for (const [name, description, text] of FLATTEN_CASES) {
  test(`[happy-11] ADF flattens to text: ${name}`, async () => {
    assert.equal(await descriptionTextOf(description), text);
  });
}

test("[happy-11] the hash of an ADF description is the hash of its flattened text", async () => {
  const description = {
    type: "doc",
    content: [
      { type: "heading", content: [{ type: "text", text: "Goal" }] },
      { type: "paragraph", content: [{ type: "text", text: "Ship it" }] },
    ],
  };
  const result = await toIssueSpec("ACME-1", { summary: "Add login", description });

  assert.equal(result.descriptionText, "Goal\nShip it");
  assert.equal(result.specHash, await specHash("Add login", "Goal\nShip it"));
});

const DEGENERATE_CASES: [string, unknown, string][] = [
  ["empty doc", { type: "doc", version: 1, content: [] }, ""],
  ["doc with no content member", { type: "doc", version: 1 }, ""],
  ["empty object", {}, ""],
  [
    "an empty paragraph still gets its separators",
    {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "a" }] },
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "b" }] },
      ],
    },
    "a\n\nb",
  ],
  [
    "a rule is an empty block",
    {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "a" }] },
        { type: "rule" },
        { type: "paragraph", content: [{ type: "text", text: "b" }] },
      ],
    },
    "a\n\nb",
  ],
  [
    "whitespace is not trimmed",
    {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "  padded  " }] }],
    },
    "  padded  ",
  ],
];

for (const [name, description, text] of DEGENERATE_CASES) {
  test(`[boundary-10] empty or degenerate ADF: ${name}`, async () => {
    assert.equal(await descriptionTextOf(description), text);
  });
}

const MALFORMED_CASES: [string, unknown, string][] = [
  [
    "non-node items in content are skipped",
    {
      type: "doc",
      content: ["x", null, 7, [], { type: "paragraph", content: [{ type: "text", text: "a" }] }],
    },
    "a",
  ],
  [
    "text that is not a string",
    { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: 42 }] }] },
    "",
  ],
  ["content that is not an array", { type: "doc", content: { type: "paragraph" } }, ""],
  [
    "node with no type joins with newlines",
    {
      content: [
        { type: "text", text: "a" },
        { type: "text", text: "b" },
      ],
    },
    "a\nb",
  ],
  [
    "mention without attrs",
    { type: "doc", content: [{ type: "paragraph", content: [{ type: "mention" }] }] },
    "",
  ],
  [
    "inlineCard with a non-string url",
    {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "inlineCard", attrs: { url: 5 } }] }],
    },
    "",
  ],
  [
    "text node's own content is ignored",
    { type: "text", text: "x", content: [{ type: "text", text: "y" }] },
    "x",
  ],
];

for (const [name, description, text] of MALFORMED_CASES) {
  test(`[unhappy-2] malformed ADF is ignored rather than thrown on: ${name}`, async () => {
    assert.equal(await descriptionTextOf(description), text);
  });
}

test("[unhappy-2] non-node items between blocks add no separator", async () => {
  const description = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "a" }] },
      "x",
      null,
      [],
      { type: "paragraph", content: [{ type: "text", text: "b" }] },
    ],
  };
  assert.equal(await descriptionTextOf(description), "a\nb");
});

test("[boundary-11] deeply nested ADF does not overflow the stack", async () => {
  const description = nestedBlockquotes(100_000, {
    type: "paragraph",
    content: [{ type: "text", text: "deep" }],
  });
  assert.equal(await descriptionTextOf(description), "deep");
});

test("[boundary-11] deeply nested ADF under a doc with an empty innermost node is empty", async () => {
  const description = {
    type: "doc",
    content: [nestedBlockquotes(100_000, { type: "paragraph" })],
  };
  assert.equal(await descriptionTextOf(description), "");
});

for (const [name, fields] of [
  ["{}", {}],
  ["null", null],
  ["undefined", undefined],
] as [string, unknown][]) {
  test(`[boundary-12] a fields block of ${name} yields a spec of defaults`, async () => {
    assert.deepEqual(await toIssueSpec("ACME-1", fields as Fields), {
      key: "ACME-1",
      summary: "",
      descriptionText: "",
      issueType: "Task",
      updated: null,
      specHash: EMPTY_HASH,
    });
  });
}

test("[boundary-12] a fields block of all-null members yields a spec of defaults", async () => {
  assert.deepEqual(
    await toIssueSpec("ACME-1", {
      summary: null,
      description: null,
      issuetype: null,
      updated: null,
    }),
    {
      key: "ACME-1",
      summary: "",
      descriptionText: "",
      issueType: "Task",
      updated: null,
      specHash: EMPTY_HASH,
    },
  );
});

test("[concurrency-2] overlapping calls each resolve to their own issue's spec", async () => {
  const [first, second] = await Promise.all([
    toIssueSpec("ACME-1", { summary: "Add login", description: "Users can sign in." }),
    toIssueSpec("ACME-2", { summary: "Fix the build", description: "Line one\nLine two" }),
  ]);

  assert.equal(first.key, "ACME-1");
  assert.equal(first.specHash, ADD_LOGIN_HASH);
  assert.equal(second.key, "ACME-2");
  assert.equal(second.specHash, FIX_BUILD_HASH);
});

test("[concurrency-2] many interleaved string and ADF calls each resolve to their own spec", async () => {
  const calls = Array.from({ length: 20 }, (_, i) =>
    i % 2 === 0
      ? { key: `ACME-${i}`, fields: { summary: "Add login", description: ADD_LOGIN_ADF }, hash: ADD_LOGIN_HASH }
      : {
          key: `ACME-${i}`,
          fields: { summary: "Fix the build", description: "Line one\nLine two" },
          hash: FIX_BUILD_HASH,
        },
  );
  const results = await Promise.all(calls.map(({ key, fields }) => toIssueSpec(key, fields)));

  assert.deepEqual(
    results.map(({ key, specHash }) => [key, specHash]),
    calls.map(({ key, hash }) => [key, hash]),
  );
});

test("[happy-12] the spec exports are reachable from the package entry point", () => {
  const entry: Record<string, unknown> = { ...index };
  assert.equal(entry["SPEC_FIELDS"], SPEC_FIELDS);
  assert.equal(entry["specHash"], specHash);
  assert.equal(entry["toIssueSpec"], toIssueSpec);
});

test("[happy-12] the entry point still exports ISSUE_FIELDS unchanged", () => {
  assert.equal(index.ISSUE_FIELDS, ISSUE_FIELDS);
  assert.equal(index.ISSUE_FIELDS.length, 11);
});
