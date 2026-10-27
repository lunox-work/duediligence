import assert from "node:assert/strict";
import { test } from "node:test";

import { toIssueSpec } from "../src/spec.js";

/** The descriptionText `toIssueSpec` gives for this description. */
async function textOf(description: unknown): Promise<string> {
  return (await toIssueSpec("ACME-1", { description })).descriptionText;
}

/** A doc whose content is these nodes. */
function doc(...content: unknown[]): unknown {
  return { type: "doc", content };
}

/** A paragraph holding these inline nodes. */
function para(...content: unknown[]): unknown {
  return { type: "paragraph", content };
}

/** A text node. */
function text(value: string): unknown {
  return { type: "text", text: value };
}

/** A list item holding one paragraph of text. */
function item(value: string): unknown {
  return { type: "listItem", content: [para(text(value))] };
}

const flattens: ReadonlyArray<readonly [string, unknown, string]> = [
  ["one paragraph", doc(para(text("Hello"))), "Hello"],
  [
    "marked runs join with no gap",
    doc(para(text("Hello "), { type: "text", text: "world", marks: [{ type: "strong" }] })),
    "Hello world",
  ],
  [
    "paragraphs join with a blank line",
    doc(para(text("First")), para(text("Second"))),
    "First\n\nSecond",
  ],
  [
    "hard break is a newline",
    doc(para(text("line one"), { type: "hardBreak" }, text("line two"))),
    "line one\nline two",
  ],
  [
    "heading keeps a Markdown marker",
    doc({ type: "heading", attrs: { level: 2 }, content: [text("Goal")] }, para(text("Ship it"))),
    "## Goal\n\nShip it",
  ],
  [
    'bullet list items get "- "',
    doc({ type: "bulletList", content: [item("a"), item("b")] }),
    "- a\n\n- b",
  ],
  [
    "ordered list numbers from order",
    doc({ type: "orderedList", attrs: { order: 3 }, content: [item("a"), item("b")] }),
    "3. a\n\n4. b",
  ],
  [
    "code block is fenced",
    doc({ type: "codeBlock", attrs: { language: "sh" }, content: [text("npm ci\nnpm test")] }),
    "```sh\nnpm ci\nnpm test\n```",
  ],
  [
    'blockquote lines get "> "',
    doc({ type: "blockquote", content: [para(text("a")), para(text("b"))] }),
    "> a\n> b",
  ],
  [
    "table rows are pipe-separated",
    doc({
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", content: [para(text("Field"))] },
            { type: "tableHeader", content: [para(text("Value"))] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [para(text("a"))] },
            { type: "tableCell", content: [para(text("1"))] },
          ],
        },
      ],
    }),
    "| Field | Value |\n\n| a | 1 |",
  ],
  [
    "mention uses attrs.text",
    doc(para(text("ask "), { type: "mention", attrs: { id: "123", text: "@Ann" } })),
    "ask @Ann",
  ],
  [
    "emoji uses shortName, not text",
    doc(para(text("ok "), { type: "emoji", attrs: { shortName: ":smile:", text: "\u{1F604}" } })),
    "ok :smile:",
  ],
  [
    "emoji with only shortName",
    doc(para({ type: "emoji", attrs: { shortName: ":smile:" } })),
    ":smile:",
  ],
  [
    "inline card uses attrs.url",
    doc(para(text("see "), { type: "inlineCard", attrs: { url: "https://acme.atlassian.net/browse/ACME-9" } })),
    "see https://acme.atlassian.net/browse/ACME-9",
  ],
  [
    "task items get checkboxes",
    doc({
      type: "taskList",
      content: [
        { type: "taskItem", content: [text("do "), text("this")] },
        { type: "taskItem", content: [text("then that")] },
      ],
    }),
    "- [ ] do this\n\n- [ ] then that",
  ],
  [
    "a DONE task item is ticked",
    doc({
      type: "taskList",
      content: [
        { type: "taskItem", attrs: { state: "DONE" }, content: [text("done")] },
        { type: "taskItem", attrs: { state: "TODO" }, content: [text("todo")] },
      ],
    }),
    "- [x] done\n\n- [ ] todo",
  ],
  [
    "unknown inline node adds nothing",
    doc(para(text("State: "), { type: "status", attrs: { text: "DONE" } }, text(" ok"))),
    "State:  ok",
  ],
  ["a root that is not a doc", para(text("bare")), "bare"],
];

for (const [name, description, expected] of flattens) {
  test(`[happy-11] ADF flattens to text: ${name}`, async () => {
    assert.equal(await textOf(description), expected);
  });
}

test("[happy-11] a heading level is clamped to 1-6 and defaults to 1", async () => {
  const heading = (attrs: unknown) => ({ type: "heading", attrs, content: [text("Goal")] });
  assert.equal(await textOf(doc(heading({ level: 9 }))), "###### Goal");
  assert.equal(await textOf(doc(heading({ level: 0 }))), "# Goal");
  assert.equal(await textOf(doc({ type: "heading", content: [text("Goal")] })), "# Goal");
});

test("[happy-11] a heading with empty inline text adds no block", async () => {
  const description = doc({ type: "heading", attrs: { level: 2 }, content: [] }, para(text("a")));
  assert.equal(await textOf(description), "a");
});

test("[happy-11] a code block with no language string has a bare fence", async () => {
  assert.equal(
    await textOf(doc({ type: "codeBlock", content: [text("npm ci")] })),
    "```\nnpm ci\n```",
  );
  assert.equal(
    await textOf(doc({ type: "codeBlock", attrs: { language: 7 }, content: [text("npm ci")] })),
    "```\nnpm ci\n```",
  );
});

test("[happy-11] an ordered list with no order numbers from 1", async () => {
  assert.equal(
    await textOf(doc({ type: "orderedList", content: [item("a"), item("b")] })),
    "1. a\n\n2. b",
  );
});

test("[happy-11] a list item's later blocks are indented two spaces", async () => {
  const description = doc({
    type: "bulletList",
    content: [{ type: "listItem", content: [para(text("a")), para(text("b"))] }],
  });
  assert.equal(await textOf(description), "- a\n\n  b");
});

test("[happy-11] media nodes become a media placeholder with a count", async () => {
  const media = { type: "media", attrs: { id: "1" } };
  assert.equal(await textOf(doc({ type: "mediaSingle", content: [media] })), "[media]");
  assert.equal(await textOf(doc({ type: "mediaGroup", content: [media, media] })), "[media x2]");
});

test("[happy-11] a table cell's blocks are joined with a space", async () => {
  const description = doc({
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [{ type: "tableCell", content: [para(text("a")), para(text("b"))] }],
      },
    ],
  });
  assert.equal(await textOf(description), "| a b |");
});

test("[happy-11] date and card nodes use their string attrs", async () => {
  const description = doc(
    para(text("due "), { type: "date", attrs: { timestamp: "1729415700000" } }),
    para({ type: "blockCard", attrs: { url: "https://acme.atlassian.net/browse/ACME-9" } }),
  );
  assert.equal(await textOf(description), "due 1729415700000\n\nhttps://acme.atlassian.net/browse/ACME-9");
});

const degenerate: ReadonlyArray<readonly [string, unknown, string]> = [
  ["empty doc", { type: "doc", version: 1, content: [] }, ""],
  ["doc with no content member", { type: "doc", version: 1 }, ""],
  ["empty object", {}, ""],
  [
    "an empty paragraph adds no block",
    doc(para(text("a")), { type: "paragraph" }, para(text("b"))),
    "a\n\nb",
  ],
  [
    'a rule is a "---" block',
    doc(para(text("a")), { type: "rule" }, para(text("b"))),
    "a\n\n---\n\nb",
  ],
  [
    "trailing whitespace of a block is removed",
    doc(para(text("  padded  "))),
    "  padded",
  ],
];

for (const [name, description, expected] of degenerate) {
  test(`[boundary-14] empty and degenerate ADF: ${name}`, async () => {
    assert.equal(await textOf(description), expected);
  });
}

test("[boundary-14] a paragraph of only whitespace adds no block", async () => {
  assert.equal(await textOf(doc(para(text("a")), para(text("   ")), para(text("b")))), "a\n\nb");
});

const malformed: ReadonlyArray<readonly [string, unknown, string]> = [
  [
    "non-node items in content are skipped",
    { type: "doc", content: ["x", null, 7, [], para(text("a"))] },
    "a",
  ],
  [
    "text that is not a string",
    doc(para({ type: "text", text: 42 })),
    "",
  ],
  ["content that is not an array", { type: "doc", content: { type: "paragraph" } }, ""],
  ["text children of a node with no type", { content: [text("a"), text("b")] }, "a\n\nb"],
  ["mention without attrs", doc(para({ type: "mention" })), "@unknown"],
  [
    "inlineCard with a non-string url",
    doc(para({ type: "inlineCard", attrs: { url: 5 } })),
    "",
  ],
  [
    "text node's own content is ignored",
    { type: "text", text: "x", content: [text("y")] },
    "x",
  ],
];

for (const [name, description, expected] of malformed) {
  test(`[unhappy-2] malformed ADF is ignored rather than thrown on: ${name}`, async () => {
    assert.equal(await textOf(description), expected);
  });
}

test("[unhappy-2] attrs and type of the wrong type are ignored", async () => {
  assert.equal(await textOf(doc(para({ type: "mention", attrs: "Ann" }))), "@unknown");
  assert.equal(await textOf(doc(para({ type: "emoji", attrs: { text: "\u{1F604}" } }))), "");
  assert.equal(await textOf({ type: 5, content: [text("a")] }), "a");
});

test("[boundary-15] deeply nested ADF does not overflow the stack, and content past 50 levels is dropped", async () => {
  let description: unknown = para(text("deep"));
  for (let i = 0; i < 100_000; i++) {
    description = { type: "blockquote", content: [description] };
  }
  const spec = await toIssueSpec("ACME-1", { description });
  assert.equal(spec.descriptionText, `${"> ".repeat(49)}>`);
  assert.ok(!spec.descriptionText.includes("deep"));
});

test("[boundary-15] shallowly nested blockquotes keep their text", async () => {
  let description: unknown = para(text("deep"));
  for (let i = 0; i < 3; i++) {
    description = { type: "blockquote", content: [description] };
  }
  assert.equal(await textOf(description), "> > > deep");
});
