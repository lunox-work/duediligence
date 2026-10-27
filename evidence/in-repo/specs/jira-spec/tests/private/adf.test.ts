import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { specHash, toIssueSpec } from "../../src/spec.js";

/** sha256hex(s), as the spec defines it, computed with Node's own crypto. */
function sha256hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** What specHash(summary, descriptionText) must resolve to. */
function expectedHash(summary: string, descriptionText: string): string {
  return sha256hex(JSON.stringify([summary, descriptionText]));
}

/** The descriptionText toIssueSpec reads from `description`. */
async function descriptionTextOf(description: unknown): Promise<string> {
  return (await toIssueSpec("ACME-1", { description })).descriptionText;
}

/** A text run. */
function t(text: string): object {
  return { type: "text", text };
}

/** A paragraph of the given inline children. */
function p(...content: unknown[]): object {
  return { type: "paragraph", content };
}

/** A doc of the given block children. */
function doc(...content: unknown[]): object {
  return { type: "doc", version: 1, content };
}

/**
 * `levels` nested nodes, built without recursion. Each level's content is
 * `before`, then the next level in, then `after`.
 */
function nested(
  levels: number,
  innermost: object,
  type: string | ((level: number) => string) = "blockquote",
  before: unknown[] = [],
  after: unknown[] = [],
): object {
  let node: object = innermost;
  for (let i = 0; i < levels; i++) {
    const nodeType = typeof type === "string" ? type : type(i);
    node = { type: nodeType, content: [...before, node, ...after] };
  }
  return node;
}

/** A list of list items, each holding one paragraph of one text run. */
function list(type: string, ...items: string[]): object {
  return { type, content: items.map((item) => ({ type: "listItem", content: [p(t(item))] })) };
}

// Extends "[happy-11] ADF flattens to text: heading then paragraph": a heading's
// several runs join with no gap, which a joiner special-casing only paragraphs
// gets wrong.
test("[happy-11] a heading's text runs join with no separator", async () => {
  const description = doc(
    { type: "heading", attrs: { level: 1 }, content: [t("Go"), t("al"), t(" one")] },
    p(t("Ship it")),
  );
  assert.equal(await descriptionTextOf(description), "Goal one\nShip it");
});

// Extends "[happy-11] ADF flattens to text: code block keeps its own newlines":
// several runs in a code block join with no gap.
test("[happy-11] a code block's text runs join with no separator", async () => {
  const description = doc({ type: "codeBlock", content: [t("npm ci"), t(" && "), t("npm test")] });
  assert.equal(await descriptionTextOf(description), "npm ci && npm test");
});

// Extends "[happy-11] ADF flattens to text: task items hold inline content": the
// public suite has no decision items, the fifth textblock type.
test("[happy-11] decision items join their runs with no gap, and the decision list joins them with newlines", async () => {
  const description = doc({
    type: "decisionList",
    content: [
      { type: "decisionItem", attrs: { state: "DECIDED" }, content: [t("use "), t("SHA-256")] },
      { type: "decisionItem", content: [t("ship "), t("it")] },
    ],
  });
  assert.equal(await descriptionTextOf(description), "use SHA-256\nship it");
});

// Extends "[happy-11] ADF flattens to text: bullet list items, one per line":
// ordered and nested lists, and a list item with two paragraphs.
test("[happy-11] nested and ordered lists put every block on its own line", async () => {
  const description = doc(
    {
      type: "orderedList",
      attrs: { order: 1 },
      content: [
        { type: "listItem", content: [p(t("one")), p(t("one, more"))] },
        { type: "listItem", content: [p(t("two")), list("bulletList", "two.a", "two.b")] },
      ],
    },
    p(t("after")),
  );
  assert.equal(await descriptionTextOf(description), "one\none, more\ntwo\ntwo.a\ntwo.b\nafter");
});

// Extends "[happy-11] ADF flattens to text: paragraphs join with a newline":
// blockquotes, panels, expands and tables are block containers too.
test("[happy-11] blockquotes, panels and tables join their children with newlines", async () => {
  const cell = (text: string) => ({ type: "tableCell", attrs: {}, content: [p(t(text))] });
  const description = doc(
    { type: "blockquote", content: [p(t("q1")), p(t("q2"))] },
    { type: "panel", attrs: { panelType: "info" }, content: [p(t("note"))] },
    {
      type: "table",
      content: [
        { type: "tableRow", content: [{ type: "tableHeader", content: [p(t("h1"))] }, cell("h2")] },
        { type: "tableRow", content: [cell("c1"), cell("c2")] },
      ],
    },
    { type: "expand", attrs: { title: "More" }, content: [p(t("e1")), p(t("e2"))] },
  );
  assert.equal(await descriptionTextOf(description), "q1\nq2\nnote\nh1\nh2\nc1\nc2\ne1\ne2");
});

// Extends "[happy-11] ADF flattens to text: unknown inline node adds nothing":
// an unknown node that does have content contributes its children's text,
// joined with "\n" because it is not a textblock type.
test("[happy-11] an unknown node with content contributes its children joined with newlines", async () => {
  const description = doc(
    p(t("x"), { type: "status", attrs: { text: "DONE" }, content: [t("a"), t("b")] }, t("y")),
  );
  assert.equal(await descriptionTextOf(description), "xa\nby");
});

// Extends "[happy-11] ADF flattens to text: one paragraph": type names are exact,
// so a differently-cased "Paragraph" is not a textblock and joins with "\n".
test("[happy-11] type names are matched exactly, so a capitalised Paragraph joins with newlines", async () => {
  const description = { type: "Paragraph", content: [t("a"), t("b")] };
  assert.equal(await descriptionTextOf(description), "a\nb");
});

// Extends "[happy-11] ADF flattens to text: hard break is a newline": consecutive
// breaks, a break outside a textblock, and a break's own content ignored.
test("[happy-11] each hard break is one newline wherever it sits, whatever it holds", async () => {
  assert.equal(
    await descriptionTextOf(doc(p(t("a"), { type: "hardBreak" }, { type: "hardBreak" }, t("b")))),
    "a\n\nb",
  );
  // In a doc: "a", "\n" and "b" joined with "\n".
  assert.equal(await descriptionTextOf(doc(p(t("a")), { type: "hardBreak" }, p(t("b")))), "a\n\n\nb");
  assert.equal(
    await descriptionTextOf(doc(p(t("a"), { type: "hardBreak", text: "x", content: [t("y")] }, t("b")))),
    "a\nb",
  );
});

// Extends "[happy-11] ADF flattens to text: emoji falls back to shortName" and
// "mention uses attrs.text": an empty string is still a string, so it is used
// and there is no fallback.
test("[happy-11] an empty attrs.text is used as is, with no fallback to shortName", async () => {
  const description = doc(
    p(
      t("a"),
      { type: "emoji", attrs: { shortName: ":smile:", text: "" } },
      { type: "mention", attrs: { id: "123", text: "" } },
      { type: "inlineCard", attrs: { url: "", data: { name: "card" } } },
      t("b"),
    ),
  );
  assert.equal(await descriptionTextOf(description), "ab");
});

// Extends "[happy-11] ADF flattens to text: mention uses attrs.text" and "inline
// card uses attrs.url": only the member the table names is read.
test("[happy-11] mentions, emoji and inline cards read only their own attribute, never content", async () => {
  const description = doc(
    p(
      { type: "mention", attrs: { id: "123", text: "@Ann", accessLevel: "" }, content: [t("ignored")] },
      t(" "),
      { type: "emoji", attrs: { shortName: ":smile:", id: "1f604", text: "\u{1F604}" }, content: [t("ignored")] },
      t(" "),
      { type: "inlineCard", attrs: { url: "https://x.test/1", text: "ignored" }, content: [t("ignored")] },
    ),
  );
  assert.equal(await descriptionTextOf(description), "@Ann \u{1F604} https://x.test/1");
});

// Extends "[happy-11] ADF flattens to text: marked runs join with no gap": a link
// mark's href is not text.
test("[happy-11] marks, including a link's href, add no text", async () => {
  const description = doc(
    p(
      { type: "text", text: "click ", marks: [{ type: "em" }] },
      { type: "text", text: "here", marks: [{ type: "link", attrs: { href: "https://x.test" } }] },
    ),
  );
  assert.equal(await descriptionTextOf(description), "click here");
});

// Extends "[happy-11] ADF flattens to text: a root that is not a doc": inline
// nodes as the root.
test("[happy-11] an inline node as the root gives its own text", async () => {
  assert.equal(await descriptionTextOf(t("bare text")), "bare text");
  assert.equal(await descriptionTextOf({ type: "hardBreak" }), "\n");
  assert.equal(await descriptionTextOf({ type: "mention", attrs: { text: "@Ann" } }), "@Ann");
  assert.equal(await descriptionTextOf({ type: "emoji", attrs: { shortName: ":ok:" } }), ":ok:");
  assert.equal(await descriptionTextOf({ type: "inlineCard", attrs: { url: "https://x.test" } }), "https://x.test");
});

// Extends "[happy-11] the hash of an ADF description is the hash of its flattened
// text": an ADF description and the plain string it flattens to give the same
// spec, so the hash is not over the raw tree.
test("[happy-11] an ADF description and the string it flattens to give the same spec", async () => {
  const text = "Goal\nUsers can sign in.\n\n- email";
  const fromAdf = await toIssueSpec("ACME-1", {
    summary: "Add login",
    description: doc(
      { type: "heading", content: [t("Goal")] },
      p(t("Users can "), { type: "text", text: "sign in.", marks: [{ type: "strong" }] }),
      { type: "rule" },
      p(t("- email")),
    ),
  });
  const fromString = await toIssueSpec("ACME-1", { summary: "Add login", description: text });

  assert.deepEqual(fromAdf, fromString);
  assert.equal(fromAdf.descriptionText, text);
  assert.equal(fromAdf.specHash, await specHash("Add login", text));
  assert.equal(fromAdf.specHash, expectedHash("Add login", text));
});

// Extends "[happy-11] ADF flattens to text: one paragraph": a realistic Jira
// description using most node types at once.
test("[happy-11] a realistic mixed description flattens block by block", async () => {
  const description = doc(
    { type: "heading", attrs: { level: 2 }, content: [t("Context")] },
    p(
      t("Reported by "),
      { type: "mention", attrs: { id: "1", text: "@Ann" } },
      t(" in "),
      { type: "inlineCard", attrs: { url: "https://acme.atlassian.net/browse/ACME-9" } },
      t(" "),
      { type: "emoji", attrs: { shortName: ":fire:" } },
    ),
    {
      type: "panel",
      content: [
        p(t("Steps:")),
        list("orderedList", "open", "click"),
      ],
    },
    { type: "codeBlock", attrs: { language: "ts" }, content: [t("const a = 1;\nconst b = 2;")] },
    { type: "taskList", content: [{ type: "taskItem", attrs: { state: "TODO" }, content: [t("fix "), t("it")] }] },
    { type: "mediaSingle", content: [{ type: "media", attrs: { id: "m1", type: "file" } }] },
    p(t("end")),
  );
  assert.equal(
    await descriptionTextOf(description),
    [
      "Context",
      "Reported by @Ann in https://acme.atlassian.net/browse/ACME-9 :fire:",
      "Steps:",
      "open",
      "click",
      "const a = 1;\nconst b = 2;",
      "fix it",
      "",
      "end",
    ].join("\n"),
  );
});

// Extends "[boundary-10] empty or degenerate ADF: an empty paragraph still gets
// its separators": several empty blocks, leading and trailing, are not trimmed
// or collapsed.
test("[boundary-10] empty blocks at the start, end and in a run each keep their separator", async () => {
  assert.equal(await descriptionTextOf(doc(p(), p())), "\n");
  assert.equal(await descriptionTextOf(doc(p(), p(), p())), "\n\n");
  assert.equal(await descriptionTextOf(doc(p(), p(t("a")))), "\na");
  assert.equal(await descriptionTextOf(doc(p(t("a")), { type: "rule" })), "a\n");
  assert.equal(
    await descriptionTextOf(doc(p(t("a")), { type: "paragraph" }, { type: "rule" }, p(), p(t("b")))),
    "a\n\n\n\nb",
  );
});

// Extends "[boundary-10] empty or degenerate ADF: an empty paragraph still gets
// its separators": empty list items keep their separators too.
test("[boundary-10] empty list items keep their separators", async () => {
  const description = doc({
    type: "bulletList",
    content: [{ type: "listItem", content: [] }, { type: "listItem", content: [p(t("a"))] }, { type: "listItem" }],
  });
  assert.equal(await descriptionTextOf(description), "\na\n");
});

// Extends "[boundary-10] empty or degenerate ADF: empty doc": a doc whose only
// block is empty in one way or another.
test("[boundary-10] a doc holding only an empty block is the empty string", async () => {
  for (const block of [p(), { type: "paragraph" }, { type: "rule" }, p(t("")), { type: "bulletList", content: [] }]) {
    assert.equal(await descriptionTextOf(doc(block)), "", `block ${JSON.stringify(block)}`);
  }
});

// Extends "[boundary-10] empty or degenerate ADF: whitespace is not trimmed":
// whitespace runs and empty runs inside a textblock.
test("[boundary-10] whitespace-only and empty runs are kept exactly", async () => {
  assert.equal(await descriptionTextOf(doc(p(t("  "), t(""), t("\t"), t(" \r\n ")))), "  \t \r\n ");
  assert.equal(await descriptionTextOf(doc(p(t(" ")), p(t(" ")))), " \n ");
  assert.equal(await descriptionTextOf(doc(p({ type: "hardBreak" }))), "\n");
});

// Extends "[unhappy-2] malformed ADF is ignored rather than thrown on: node with
// no type joins with newlines": a type that is not a string is ignored, even one
// that coerces to a known type name.
test("[unhappy-2] a non-string type is ignored, even one that would coerce to a known type", async () => {
  assert.equal(await descriptionTextOf({ type: 5, content: [t("a"), t("b")] }), "a\nb");
  assert.equal(await descriptionTextOf({ type: ["paragraph"], content: [t("a"), t("b")] }), "a\nb");
  assert.equal(await descriptionTextOf({ type: ["text"], text: "x" }), "");
  assert.equal(await descriptionTextOf({ type: ["hardBreak"] }), "");
  assert.equal(await descriptionTextOf({ type: null, text: "x" }), "");
});

// Extends "[unhappy-2] malformed ADF is ignored rather than thrown on: text that
// is not a string": other non-string text members.
test("[unhappy-2] other non-string text members give the empty string", async () => {
  for (const text of [null, undefined, true, {}, ["x"], { toString: () => "x" }]) {
    assert.equal(
      await descriptionTextOf(doc(p(t("a"), { type: "text", text }, t("b")))),
      "ab",
      `text ${String(text)}`,
    );
  }
});

// Extends "[unhappy-2] malformed ADF is ignored rather than thrown on: mention
// without attrs": attrs that are not objects, or members of the wrong type.
test("[unhappy-2] malformed attrs on mentions, emoji and inline cards give the empty string", async () => {
  const inline: object[] = [
    { type: "mention", attrs: "@Ann" },
    { type: "mention", attrs: null },
    { type: "mention", attrs: { text: 7, id: "@Ann" } },
    { type: "emoji", attrs: null },
    { type: "emoji" },
    { type: "emoji", attrs: { text: 5, shortName: 6 } },
    { type: "emoji", attrs: { id: ":smile:" } },
    { type: "inlineCard" },
    { type: "inlineCard", attrs: "https://x.test" },
    { type: "inlineCard", attrs: { url: null, text: "https://x.test" } },
  ];
  for (const node of inline) {
    assert.equal(await descriptionTextOf(doc(p(t("a"), node, t("b")))), "ab", JSON.stringify(node));
  }
});

// Extends "[unhappy-2] malformed ADF is ignored rather than thrown on: mention
// without attrs": an emoji whose text is not a string falls back to shortName.
test("[unhappy-2] an emoji whose attrs.text is not a string falls back to shortName", async () => {
  for (const text of [5, null, {}, ["x"]]) {
    assert.equal(
      await descriptionTextOf(doc(p({ type: "emoji", attrs: { text, shortName: ":x:" } }))),
      ":x:",
    );
  }
});

// Extends "[unhappy-2] non-node items between blocks add no separator": inside
// a textblock and a list, and arrays of nodes are skipped, not flattened.
test("[unhappy-2] non-node items, including arrays holding nodes, are skipped everywhere", async () => {
  assert.equal(
    await descriptionTextOf(doc(p(t("a"), null, "x", 7, undefined, true, [t("y")], t("b")))),
    "ab",
  );
  assert.equal(
    await descriptionTextOf(
      doc({
        type: "bulletList",
        content: [false, { type: "listItem", content: [p(t("a"))] }, "x", [p(t("y"))], { type: "listItem", content: [p(t("b"))] }, 0],
      }),
    ),
    "a\nb",
  );
  assert.equal(await descriptionTextOf(doc([p(t("x"))], p(t("a")), [p(t("y"))])), "a");
});

// Extends "[unhappy-2] malformed ADF is ignored rather than thrown on: content
// that is not an array": other non-array content, including array-likes.
test("[unhappy-2] content that is a string, null or an array-like is not read", async () => {
  for (const content of ["abc", null, 5, { length: 1, 0: t("x") }, { 0: p(t("x")) }]) {
    assert.equal(await descriptionTextOf({ type: "doc", content }), "", `content ${JSON.stringify(content)}`);
    assert.equal(await descriptionTextOf(doc(p(t("a")), { type: "paragraph", content }, p(t("b")))), "a\n\nb");
  }
});

// Extends "[unhappy-2] malformed ADF is ignored rather than thrown on: text node's
// own content is ignored": a block's own text member is ignored too.
test("[unhappy-2] a block's own text member is ignored", async () => {
  assert.equal(await descriptionTextOf({ type: "paragraph", text: "x", content: [t("a")] }), "a");
  assert.equal(await descriptionTextOf({ type: "doc", text: "x" }), "");
});

// Extends "[unhappy-2] malformed ADF is ignored rather than thrown on: text that
// is not a string": malformed marks do not stop a run's text being read.
test("[unhappy-2] malformed marks on a text run are ignored", async () => {
  for (const marks of ["bold", [null], [{ type: 5 }], {}, 3]) {
    assert.equal(await descriptionTextOf(doc(p({ type: "text", text: "a", marks }))), "a");
  }
});

// Extends the [unhappy-2] public cases: any non-null, non-array object is a node,
// including one with no prototype, which has no hasOwnProperty to call.
test("[unhappy-2] nodes with a null prototype are read like any other object", async () => {
  const bare = (members: Record<string, unknown>) => Object.assign(Object.create(null) as object, members);
  const description = bare({
    type: "doc",
    content: [
      bare({ type: "paragraph", content: [bare({ type: "text", text: "a" }), bare({ type: "mention", attrs: bare({ text: "@Ann" }) })] }),
      bare({ type: "paragraph", content: [bare({ type: "text", text: "b" })] }),
    ],
  });
  assert.equal(await descriptionTextOf(description), "a@Ann\nb");
});

// Extends "[boundary-11] deeply nested ADF does not overflow the stack": nested
// textblocks rather than blockquotes.
test("[boundary-11] 100,000 nested paragraphs flatten without overflowing", async () => {
  assert.equal(await descriptionTextOf(nested(100_000, t("deep"), "paragraph")), "deep");
});

// Extends "[boundary-11] deeply nested ADF does not overflow the stack": a sibling
// at every level, so an iterative walk must still order and separate correctly.
test("[boundary-11] 100,000 nested blockquotes, each with a trailing sibling, keep order and separators", async () => {
  const description = nested(100_000, p(t("deep")), "blockquote", [], [p(t("x"))]);
  assert.equal(await descriptionTextOf(description), "deep" + "\nx".repeat(100_000));
});

// Extends "[boundary-11] deeply nested ADF does not overflow the stack": siblings
// before and after at every level of a textblock nesting.
test("[boundary-11] 100,000 nested paragraphs with siblings either side join with no gaps", async () => {
  const description = nested(100_000, t("deep"), "paragraph", [t("<")], [t(">")]);
  assert.equal(
    await descriptionTextOf(description),
    "<".repeat(100_000) + "deep" + ">".repeat(100_000),
  );
});

// Extends "[boundary-11] deeply nested ADF does not overflow the stack":
// alternating list types, with non-node junk at every level.
test("[boundary-11] 100,000 alternating list levels with junk items flatten to the innermost text", async () => {
  const description = nested(
    100_000,
    p(t("deep")),
    (level) => (level % 2 === 0 ? "listItem" : "bulletList"),
    [null, "junk"],
    [7, []],
  );
  const result = await toIssueSpec("ACME-1", { summary: "Add login", description });
  assert.equal(result.descriptionText, "deep");
  assert.equal(result.specHash, expectedHash("Add login", "deep"));
});
