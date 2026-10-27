import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import * as index from "../../src/index.js";
import { ISSUE_FIELDS } from "../../src/mapping.js";
import { SPEC_FIELDS, specHash, toIssueSpec } from "../../src/spec.js";

/** specHash("Add login", "Users can sign in.") */
const ADD_LOGIN_HASH =
  "8a71edd3e48141d9e972a05a5e3315c9f55609fc4cf20abdd24dd1e606fb9e14";

/** specHash("Fix the build", "Line one\nLine two") */
const FIX_BUILD_HASH =
  "72cf51e53aee072c65b91b674e5d50ac48290bacff428cc88d992e91a1a95448";

/** specHash("", "") */
const EMPTY_HASH =
  "439083f38956ba51ece90631552c6ea23c5c29570d3d5710e408e77e01ba7375";

const SPEC_KEYS = [
  "key",
  "summary",
  "descriptionText",
  "issueType",
  "updated",
  "specHash",
];

type Fields = Parameters<typeof toIssueSpec>[1];

/** sha256hex(s), as the spec defines it, computed with Node's own crypto. */
function sha256hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** What specHash(summary, descriptionText) must resolve to. */
function expectedHash(summary: string, descriptionText: string): string {
  return sha256hex(JSON.stringify([summary, descriptionText]));
}

/** Calls toIssueSpec with a fields block the types would not allow. */
function toIssueSpecUnchecked(key: string, fields: unknown) {
  return toIssueSpec(key, fields as Fields);
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

/** Freezes `root` and everything reachable from it, without recursion. */
function deepFreeze<T>(root: T): T {
  const stack: unknown[] = [root];
  const seen = new Set<unknown>();
  while (stack.length > 0) {
    const value = stack.pop();
    if (typeof value !== "object" || value === null || seen.has(value)) {
      continue;
    }
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) {
      stack.push(child);
    }
  }
  return root;
}

/** A full fields block as /rest/api/3 returns it, with non-spec fields too. */
function fullFields(): Record<string, unknown> {
  return {
    summary: "Add login",
    description: doc(p(t("Users can sign in."))),
    issuetype: { name: "Story", id: "10001", subtask: false },
    updated: "2026-10-20T09:15:00.000+0000",
    status: { name: "In Progress" },
    assignee: { displayName: "Ann", accountId: "abc" },
    priority: { name: "High" },
    labels: ["auth", "login"],
    created: "2026-10-01T08:00:00.000+0000",
    duedate: "2026-11-01",
    parent: { key: "ACME-100" },
    project: { key: "ACME", name: "Acme" },
    environment: "prod",
    comment: { comments: [{ body: "ignore me" }] },
  };
}

// Extends "[happy-1] SPEC_FIELDS is the four spec fields, in order": the rule is
// that SPEC_FIELDS lists exactly the fields toIssueSpec reads, so keeping only
// those fields of a full issue gives the same spec.
test("[happy-1] keeping only the SPEC_FIELDS members of a full issue gives the same spec", async () => {
  const full = fullFields();
  const picked = Object.fromEntries(SPEC_FIELDS.map((name) => [name, full[name]]));

  assert.deepEqual(
    await toIssueSpecUnchecked("ACME-123", picked),
    await toIssueSpecUnchecked("ACME-123", full),
  );
  assert.deepEqual([...SPEC_FIELDS], ["summary", "description", "issuetype", "updated"]);
});

// Extends "[happy-1] SPEC_FIELDS has exactly four entries, none repeated": each
// listed field is one toIssueSpec actually reads.
test("[happy-1] every field in SPEC_FIELDS changes the spec when it changes", async () => {
  const base = fullFields();
  const changed: Record<string, unknown> = {
    summary: "Add logout",
    description: "Users can sign out.",
    issuetype: { name: "Bug" },
    updated: "2026-10-24T17:00:00.000+0000",
  };
  const before = await toIssueSpecUnchecked("ACME-123", base);
  for (const name of SPEC_FIELDS) {
    const after = await toIssueSpecUnchecked("ACME-123", { ...base, [name]: changed[name] });
    assert.notDeepEqual(after, before, `changing ${name}`);
  }
});

// Extends "[happy-2] ISSUE_FIELDS is unchanged by this feature": reading specs
// does not touch ISSUE_FIELDS.
test("[happy-2] ISSUE_FIELDS is unchanged after specs are read", async () => {
  await toIssueSpecUnchecked("ACME-123", fullFields());
  await specHash("Add login", "Users can sign in.");

  assert.deepEqual(
    [...ISSUE_FIELDS],
    [
      "summary",
      "status",
      "assignee",
      "priority",
      "issuetype",
      "labels",
      "created",
      "updated",
      "duedate",
      "parent",
      "project",
    ],
  );
  assert.ok(!ISSUE_FIELDS.includes("description"));
});

// Extends "[happy-6] a complete v3 issue becomes a spec": a multi-block ADF
// description, and a fields block carrying members named like the result's keys,
// which must not leak into it.
test("[happy-6] a complete issue with a richer description becomes exactly its spec", async () => {
  const descriptionText = "Goal\nUsers can sign in.\nemail\npassword\nnpm test";
  const fields = {
    ...fullFields(),
    summary: "Add login",
    description: doc(
      { type: "heading", attrs: { level: 2 }, content: [t("Goal")] },
      p(t("Users can "), t("sign in.")),
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [p(t("email"))] },
          { type: "listItem", content: [p(t("password"))] },
        ],
      },
      { type: "codeBlock", content: [t("npm test")] },
    ),
    issuetype: { name: "Epic" },
    updated: "2026-10-24T17:00:00.000+0000",
    key: "WRONG-1",
    descriptionText: "wrong",
    issueType: "Wrong",
    specHash: "0".repeat(64),
  };
  const result = await toIssueSpecUnchecked("ACME-124", fields);

  assert.deepEqual(result, {
    key: "ACME-124",
    summary: "Add login",
    descriptionText,
    issueType: "Epic",
    updated: "2026-10-24T17:00:00.000+0000",
    specHash: expectedHash("Add login", descriptionText),
  });
  assert.deepEqual(Object.keys(result).sort(), [...SPEC_KEYS].sort());
});

// Extends "[happy-6] a complete v3 issue becomes a spec": specHash is a resolved
// string equal to specHash(summary, descriptionText), across several issues.
test("[happy-6] the result's specHash equals specHash(summary, descriptionText) for several issues", async () => {
  const cases: [Record<string, unknown>, string, string][] = [
    [{ summary: "Fix the build", description: doc(p(t("Line one")), p(t("Line two"))) }, "Fix the build", "Line one\nLine two"],
    [{ summary: "Café", description: "naïve \u{1F642}" }, "Café", "naïve \u{1F642}"],
    [{ summary: 'say "hi"', description: doc(p(t("back\\slash"))) }, 'say "hi"', "back\\slash"],
    [{ summary: "Only a summary" }, "Only a summary", ""],
  ];
  for (const [fields, summary, descriptionText] of cases) {
    const result = await toIssueSpecUnchecked("ACME-1", fields);
    assert.equal(typeof result.specHash, "string");
    assert.equal(result.specHash, await specHash(summary, descriptionText));
    assert.equal(result.specHash, expectedHash(summary, descriptionText));
  }
});

// Extends "[happy-7] an empty or padded key is passed through without validation":
// other keys, and the key does not come from or affect the fields.
test("[happy-7] unusual keys are passed through verbatim and touch nothing else", async () => {
  const fields = { summary: "Add login", description: "Users can sign in." };
  const reference = await toIssueSpec("ACME-1", fields);
  for (const key of ["acme-7", "ÄCME-7", "ACME 7\n", "not a key at all", "K".repeat(10_000), "123"]) {
    const result = await toIssueSpec(key, fields);
    assert.equal(result.key, key);
    assert.deepEqual({ ...result, key: reference.key }, reference);
  }
});

// Extends "[happy-8] an ADF description is not modified while it is flattened":
// a deeply frozen input, so any write at all throws, still resolves correctly.
test("[happy-8] a deeply frozen fields block is read without being written to", async () => {
  const fields = deepFreeze({
    summary: "Add login",
    description: doc(
      { type: "heading", attrs: { level: 1 }, content: [t("Goal")] },
      p(
        { type: "text", text: "Users ", marks: [{ type: "strong" }] },
        { type: "mention", attrs: { id: "1", text: "@Ann" } },
        { type: "hardBreak" },
        { type: "emoji", attrs: { shortName: ":smile:" } },
        { type: "inlineCard", attrs: { url: "https://acme.atlassian.net/browse/ACME-9" } },
      ),
      "junk",
      null,
      { type: "rule" },
      { type: "taskList", content: [{ type: "taskItem", content: [t("do it")] }] },
    ),
    issuetype: { name: "Bug" },
    updated: "2026-10-20T09:15:00.000+0000",
  });
  const before = structuredClone(fields);
  const descriptionText =
    "Goal\nUsers @Ann\n:smile:https://acme.atlassian.net/browse/ACME-9\n\ndo it";

  const result = await toIssueSpec("ACME-1", fields);

  assert.equal(result.descriptionText, descriptionText);
  assert.equal(result.specHash, expectedHash("Add login", descriptionText));
  assert.deepEqual(fields, before);
});

// Extends "[happy-8] the input fields object is not modified": a 100,000-level
// frozen tree, where marking visited nodes or splicing content would throw.
test("[happy-8] a deeply nested frozen description is flattened without being written to", async () => {
  const description = deepFreeze(nested(100_000, p(t("deep"))));
  const result = await toIssueSpec("ACME-1", { summary: "", description });
  assert.equal(result.descriptionText, "deep");
});

// Extends "[happy-9] a missing issue type and stamp, and a different key, leave
// the hash alone": more combinations of key, issuetype and updated.
test("[happy-9] no combination of key, issue type and updated changes the hash", async () => {
  const variants: [string, unknown, unknown][] = [
    ["ACME-1", { name: "Epic" }, "2026-01-01T00:00:00.000+0000"],
    ["ACME-2", { name: "" }, ""],
    ["acme-3", {}, null],
    ["", null, "not a date"],
    ["X-9", { name: 3 }, 0],
    ["Y-1", undefined, undefined],
  ];
  for (const [key, issuetype, updated] of variants) {
    const fields: Record<string, unknown> = {
      summary: "Fix the build",
      description: "Line one\nLine two",
    };
    if (issuetype !== undefined) fields["issuetype"] = issuetype;
    if (updated !== undefined) fields["updated"] = updated;
    const result = await toIssueSpecUnchecked(key, fields);
    assert.equal(result.specHash, FIX_BUILD_HASH, `variant ${JSON.stringify([key, issuetype, updated])}`);
  }
});

// Extends "[happy-9] issue type and updated stamp do not affect the hash": a hash
// computed over more than summary and description would differ here; one
// computed over less would not change when they do.
test("[happy-9] changing the summary or the description text changes the hash, issue type does not", async () => {
  const base = { summary: "Add login", description: "Users can sign in.", issuetype: { name: "Story" } };
  const a = await toIssueSpec("ACME-1", base);
  const b = await toIssueSpec("ACME-1", { ...base, summary: "Add login." });
  const c = await toIssueSpec("ACME-1", { ...base, description: "Users can sign in" });
  const d = await toIssueSpec("ACME-1", { ...base, issuetype: { name: "Spike" } });

  assert.equal(a.specHash, ADD_LOGIN_HASH);
  assert.equal(b.specHash, expectedHash("Add login.", "Users can sign in."));
  assert.equal(c.specHash, expectedHash("Add login", "Users can sign in"));
  assert.equal(d.specHash, ADD_LOGIN_HASH);
});

// Extends "[boundary-5] a string summary is used verbatim, padding included":
// other string shapes.
test("[boundary-5] multi-line, unicode and placeholder-like summaries are used verbatim", async () => {
  for (const summary of ["Line one\nLine two", "\tCafé \u{1F642}", "(no summary)", " ", "Café"]) {
    const result = await toIssueSpec("ACME-1", { summary });
    assert.equal(result.summary, summary);
    assert.equal(result.specHash, expectedHash(summary, ""));
  }
});

// Extends "[boundary-5] a missing or non-string summary becomes the empty string":
// other non-strings, and the hash is of "" rather than of toIssueDto's
// "(no summary)" placeholder.
test("[boundary-5] other non-string summaries become the empty string, and hash as it", async () => {
  for (const summary of [undefined, true, false, 0, {}, { toString: () => "Add login" }, new Date(0), ["a", "b"]]) {
    const result = await toIssueSpecUnchecked("ACME-1", { summary, description: "Users can sign in." });
    assert.equal(result.summary, "", `summary ${String(summary)}`);
    assert.equal(result.specHash, expectedHash("", "Users can sign in."));
  }
});

// Extends "[boundary-6] a string issuetype.name is used, even when empty": other
// string names, verbatim.
test("[boundary-6] padded and unicode issue type names are used verbatim", async () => {
  for (const name of ["  Bug  ", "Sub-task", "Tâche", "task", "\n"]) {
    const result = await toIssueSpecUnchecked("ACME-1", { issuetype: { name, id: "1", iconUrl: "x" } });
    assert.equal(result.issueType, name);
  }
});

// Extends "[boundary-6] a missing or non-string issuetype.name becomes Task":
// issuetype values that are not objects at all, and other non-string names.
test("[boundary-6] other malformed issuetype values become Task", async () => {
  const cases: unknown[] = [
    "Bug",
    42,
    true,
    false,
    ["Bug"],
    { name: ["Bug"] },
    { name: { value: "Bug" } },
    { name: true },
    { name: undefined },
    { id: "10001" },
  ];
  for (const issuetype of cases) {
    assert.equal(
      (await toIssueSpecUnchecked("ACME-1", { issuetype })).issueType,
      "Task",
      `issueType of ${String(JSON.stringify(issuetype))}`,
    );
  }
});

// Extends "[boundary-7] a string updated is used verbatim, unvalidated": other
// strings.
test("[boundary-7] whitespace and odd-format updated strings are used verbatim", async () => {
  for (const updated of [" ", "  2026-10-20T09:15:00.000+0000  ", "2026-10-20", "yesterday", "\u{1F642}"]) {
    assert.equal((await toIssueSpec("ACME-1", { updated })).updated, updated);
  }
});

// Extends "[boundary-7] a missing or non-string updated becomes null": other
// non-strings, including a Date.
test("[boundary-7] other non-string updated values become null", async () => {
  for (const updated of [undefined, 0, true, false, {}, new Date(1729415700000), ["2026-10-20T09:15:00.000+0000"]]) {
    assert.equal(
      (await toIssueSpecUnchecked("ACME-1", { updated })).updated,
      null,
      `updated ${String(updated)}`,
    );
  }
});

// Extends "[happy-10] a plain-string description is kept exactly": strings that
// look like ADF JSON, markup or are long are not parsed.
test("[happy-10] a string description that looks like ADF or markup is kept verbatim", async () => {
  const strings = [
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]}]}',
    "h2. Goal\n* email\n* password",
    "<p>Hello</p>",
    "Café naïve \u{1F642}",
    "line\n".repeat(10_000),
  ];
  for (const description of strings) {
    const result = await toIssueSpec("ACME-1", { summary: "Fix the build", description });
    assert.equal(result.descriptionText, description);
    assert.equal(result.specHash, expectedHash("Fix the build", description));
  }
});

// Extends "[boundary-8] a whitespace-only string description is kept as is":
// other whitespace and line terminators.
test("[boundary-8] lone carriage returns, tabs and Unicode spaces in a string description are kept", async () => {
  for (const description of ["a\rb", "\t\ta\t\t", " a b ", "a\n\n\n", "\r\n\r\n", "a \r\n b"]) {
    const result = await toIssueSpec("ACME-1", { summary: "", description });
    assert.equal(result.descriptionText, description);
    assert.equal(result.specHash, expectedHash("", description));
  }
});

// Extends "[boundary-9] a number, boolean or array description becomes the empty
// string": other non-nodes, including an array of ADF nodes, which is not a node.
test("[boundary-9] other descriptions that are neither strings nor ADF nodes become the empty string", async () => {
  const cases: unknown[] = [
    undefined,
    false,
    0,
    1n,
    Symbol("description"),
    [],
    [p(t("Hello"))],
    [doc(p(t("Hello")))],
  ];
  for (const description of cases) {
    const result = await toIssueSpecUnchecked("ACME-1", { summary: "", description });
    assert.equal(result.descriptionText, "", `description ${String(description)}`);
    assert.equal(result.specHash, EMPTY_HASH);
  }
});

// Extends "[boundary-9] an absent or null description becomes the empty string":
// with a summary, the hash is of the summary and "".
test("[boundary-9] a non-node description with a summary hashes as the summary and the empty string", async () => {
  for (const description of [null, 42, ["Users can sign in."]]) {
    const result = await toIssueSpecUnchecked("ACME-1", { summary: "Add login", description });
    assert.equal(result.descriptionText, "");
    assert.equal(result.specHash, expectedHash("Add login", ""));
  }
});

// Extends "[boundary-12] a fields block of all-null members yields a spec of
// defaults": a block of only non-spec fields, and exactly six keys for null.
test("[boundary-12] a fields block of only non-spec fields yields a spec of defaults", async () => {
  const fields = { status: { name: "Done" }, labels: ["x"], key: "WRONG-1", specHash: "nope" };
  const expected = {
    key: "ACME-1",
    summary: "",
    descriptionText: "",
    issueType: "Task",
    updated: null,
    specHash: EMPTY_HASH,
  };
  assert.deepEqual(await toIssueSpecUnchecked("ACME-1", fields), expected);

  const fromNull = await toIssueSpecUnchecked("ACME-9", null);
  assert.deepEqual(fromNull, { ...expected, key: "ACME-9" });
  assert.deepEqual(Object.keys(fromNull).sort(), [...SPEC_KEYS].sort());
});

// Extends "[concurrency-2] many interleaved string and ADF calls each resolve to
// their own spec": thirty distinct issues of very different sizes, including
// deep nesting, with every field checked.
test("[concurrency-2] thirty distinct overlapping issues each resolve to their own full spec", async () => {
  const calls = Array.from({ length: 30 }, (_, i) => {
    const summary = `Ticket ${i}`;
    let description: unknown;
    let descriptionText: string;
    if (i % 3 === 0) {
      description = `plain ${i}`;
      descriptionText = `plain ${i}`;
    } else if (i % 3 === 1) {
      description = doc(p(t(`para ${i}`)), p(t("x".repeat(i * 100))));
      descriptionText = `para ${i}\n${"x".repeat(i * 100)}`;
    } else {
      description = nested(20_000, p(t(`deep ${i}`)));
      descriptionText = `deep ${i}`;
    }
    return {
      key: `ACME-${i}`,
      fields: { summary, description, issuetype: { name: `Type${i}` }, updated: `stamp-${i}` },
      expected: {
        key: `ACME-${i}`,
        summary,
        descriptionText,
        issueType: `Type${i}`,
        updated: `stamp-${i}`,
        specHash: expectedHash(summary, descriptionText),
      },
    };
  });
  const results = await Promise.all(calls.map(({ key, fields }) => toIssueSpec(key, fields)));
  assert.deepEqual(results, calls.map(({ expected }) => expected));
});

// Extends "[concurrency-2] overlapping calls each resolve to their own issue's
// spec": specHash and toIssueSpec calls overlapping one another.
test("[concurrency-2] toIssueSpec calls overlapping specHash calls each resolve to their own result", async () => {
  const [first, hash, second, empty] = await Promise.all([
    toIssueSpec("ACME-1", { summary: "Add login", description: doc(p(t("Users can sign in."))) }),
    specHash("Café", "naïve"),
    toIssueSpec("ACME-2", { summary: "Fix the build", description: "Line one\nLine two" }),
    toIssueSpec("ACME-3", {}),
  ]);
  assert.equal(first.key, "ACME-1");
  assert.equal(first.specHash, ADD_LOGIN_HASH);
  assert.equal(hash, expectedHash("Café", "naïve"));
  assert.equal(second.key, "ACME-2");
  assert.equal(second.specHash, FIX_BUILD_HASH);
  assert.equal(empty.key, "ACME-3");
  assert.equal(empty.specHash, EMPTY_HASH);
});

// Extends "[happy-12] the spec exports are reachable from the package entry
// point": the re-exports work when called through the entry point.
test("[happy-12] the entry point's specHash and toIssueSpec work when called", async () => {
  const entry: Record<string, unknown> = { ...index };
  const entrySpecHash = entry["specHash"] as typeof specHash;
  const entryToIssueSpec = entry["toIssueSpec"] as typeof toIssueSpec;
  assert.equal(typeof entrySpecHash, "function");
  assert.equal(typeof entryToIssueSpec, "function");

  assert.equal(await entrySpecHash("Add login", "Users can sign in."), ADD_LOGIN_HASH);
  assert.deepEqual(
    await entryToIssueSpec("ACME-1", { summary: "Fix the build", description: "Line one\nLine two" }),
    await toIssueSpec("ACME-1", { summary: "Fix the build", description: "Line one\nLine two" }),
  );
  assert.deepEqual(entry["SPEC_FIELDS"], ["summary", "description", "issuetype", "updated"]);
});
