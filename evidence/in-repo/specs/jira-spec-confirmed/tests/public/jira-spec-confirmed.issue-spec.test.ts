import assert from "node:assert/strict";
import { test } from "node:test";

import { specHash, toIssueSpec } from "../src/spec.js";

type Fields = Parameters<typeof toIssueSpec>[1];

/** specHash("Add login", "Users can sign in.") */
const ADD_LOGIN = "24b1c29d416fdea96e63dcd8edf3ccbc14c9e53a0f019720cefd4803fcec0bf5";
/** specHash("Fix the build", "Line one\nLine two") */
const FIX_BUILD = "401c829e08ad2a5a6a3cb4a6913afd15a8f35a9ceb9ddeb48a714539e0b50fa7";
/** specHash("", "") */
const EMPTY = "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d";

const SPEC_KEYS = ["key", "summary", "descriptionText", "issueType", "updated", "specHash"];

/** A complete issue as REST API v3 sends it. */
function v3Fields(): Fields {
  return {
    summary: "Add login",
    description: {
      type: "doc",
      version: 1,
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Users can sign in." }] },
      ],
    },
    issuetype: { name: "Story" },
    updated: "2026-10-20T09:15:00.000+0000",
  };
}

test("[happy-1] fields outside SPEC_FIELDS are not read", async () => {
  const plain = await toIssueSpec("ACME-1", v3Fields());
  const extra = await toIssueSpec("ACME-1", {
    ...v3Fields(),
    status: { name: "Done" },
    labels: ["x"],
    created: "2026-01-01T00:00:00.000+0000",
  } as Fields);
  assert.deepEqual(extra, plain);
});

test("[happy-6] a complete v3 issue becomes a spec", async () => {
  const spec = await toIssueSpec("ACME-123", v3Fields());
  assert.deepEqual(spec, {
    key: "ACME-123",
    summary: "Add login",
    descriptionText: "Users can sign in.",
    issueType: "Story",
    updated: "2026-10-20T09:15:00.000+0000",
    specHash: ADD_LOGIN,
  });
  assert.deepEqual(Object.keys(spec).sort(), [...SPEC_KEYS].sort());
});

test("[happy-6] the result has exactly the six keys even when fields has extra members", async () => {
  const spec = await toIssueSpec("ACME-123", {
    ...v3Fields(),
    status: { name: "Done" },
  } as Fields);
  assert.deepEqual(Object.keys(spec).sort(), [...SPEC_KEYS].sort());
});

test("[happy-6] specHash equals specHash of the result's summary and descriptionText", async () => {
  const spec = await toIssueSpec("ACME-9", {
    summary: "  Café  ",
    description: "Line one\nLine two",
  });
  assert.equal(spec.specHash, await specHash(spec.summary, spec.descriptionText));
});

test("[happy-7] the key is passed through verbatim", async () => {
  const spec = await toIssueSpec("acme-7", { summary: "x" });
  assert.equal(spec.key, "acme-7");
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

test("[happy-8] an ADF description in the input is not modified", async () => {
  const fields = v3Fields();
  await toIssueSpec("ACME-1", fields);
  assert.deepEqual(fields, v3Fields());
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
  assert.equal(a.specHash, ADD_LOGIN);
  assert.equal(b.specHash, ADD_LOGIN);
});

test("[happy-9] missing issue type and updated stamp do not affect the hash either", async () => {
  const spec = await toIssueSpec("ACME-3", {
    summary: "Add login",
    description: "Users can sign in.",
    issuetype: null,
  });
  assert.equal(spec.specHash, ADD_LOGIN);
});

test("[boundary-7] a string summary is kept verbatim, surrounding spaces included", async () => {
  const spec = await toIssueSpec("ACME-1", { summary: "  Add login  " });
  assert.equal(spec.summary, "  Add login  ");
});

test("[boundary-7] an empty summary stays empty", async () => {
  assert.equal((await toIssueSpec("ACME-1", { summary: "" })).summary, "");
});

test("[boundary-7] an absent summary becomes empty", async () => {
  assert.equal((await toIssueSpec("ACME-1", {})).summary, "");
});

test("[boundary-7] a null summary becomes empty", async () => {
  assert.equal((await toIssueSpec("ACME-1", { summary: null })).summary, "");
});

test("[boundary-7] a numeric summary becomes empty", async () => {
  assert.equal((await toIssueSpec("ACME-1", { summary: 42 })).summary, "");
});

test("[boundary-7] an array summary becomes empty", async () => {
  assert.equal((await toIssueSpec("ACME-1", { summary: ["Add login"] })).summary, "");
});

test("[boundary-8] a string issuetype.name is the issue type", async () => {
  assert.equal((await toIssueSpec("ACME-1", { issuetype: { name: "Bug" } })).issueType, "Bug");
});

test("[boundary-8] an empty issuetype.name is kept", async () => {
  assert.equal((await toIssueSpec("ACME-1", { issuetype: { name: "" } })).issueType, "");
});

test("[boundary-8] an issuetype with no name defaults to Task", async () => {
  assert.equal((await toIssueSpec("ACME-1", { issuetype: {} })).issueType, "Task");
});

test("[boundary-8] a null issuetype.name defaults to Task", async () => {
  assert.equal((await toIssueSpec("ACME-1", { issuetype: { name: null } })).issueType, "Task");
});

test("[boundary-8] a numeric issuetype.name defaults to Task", async () => {
  assert.equal((await toIssueSpec("ACME-1", { issuetype: { name: 3 } })).issueType, "Task");
});

test("[boundary-8] a null issuetype defaults to Task", async () => {
  assert.equal((await toIssueSpec("ACME-1", { issuetype: null })).issueType, "Task");
});

test("[boundary-8] an absent issuetype defaults to Task", async () => {
  assert.equal((await toIssueSpec("ACME-1", {})).issueType, "Task");
});

test("[boundary-9] a timestamp updated is kept verbatim", async () => {
  const spec = await toIssueSpec("ACME-1", { updated: "2026-10-20T09:15:00.000+0000" });
  assert.equal(spec.updated, "2026-10-20T09:15:00.000+0000");
});

test("[boundary-9] an updated string that is not a date passes through unvalidated", async () => {
  assert.equal((await toIssueSpec("ACME-1", { updated: "not a date" })).updated, "not a date");
});

test("[boundary-9] an empty updated string is kept", async () => {
  assert.equal((await toIssueSpec("ACME-1", { updated: "" })).updated, "");
});

test("[boundary-9] a null updated stays null", async () => {
  assert.equal((await toIssueSpec("ACME-1", { updated: null })).updated, null);
});

test("[boundary-9] an absent updated becomes null", async () => {
  assert.equal((await toIssueSpec("ACME-1", {})).updated, null);
});

test("[boundary-9] a numeric updated becomes null", async () => {
  assert.equal((await toIssueSpec("ACME-1", { updated: 1729415700000 })).updated, null);
});

test("[happy-10] a plain-string description keeps its words and newlines", async () => {
  const spec = await toIssueSpec("ACME-1", {
    summary: "Fix the build",
    description: "Line one\nLine two",
  });
  assert.equal(spec.descriptionText, "Line one\nLine two");
  assert.equal(spec.specHash, FIX_BUILD);
});

test("[happy-10] a plain-string description keeps a blank line between paragraphs", async () => {
  const spec = await toIssueSpec("ACME-1", { description: "First\n\nSecond" });
  assert.equal(spec.descriptionText, "First\n\nSecond");
});

test("[boundary-10] CR before a newline collapses to a space and the ends are trimmed", async () => {
  const spec = await toIssueSpec("ACME-1", { description: "  a\r\nb  " });
  assert.equal(spec.descriptionText, "a \nb");
});

test("[boundary-10] runs of spaces and tabs collapse to one space, newlines are kept", async () => {
  const spec = await toIssueSpec("ACME-1", { description: "a \t  b\n\n  c" });
  assert.equal(spec.descriptionText, "a b\n\n c");
});

test("[boundary-10] a whitespace-only string description becomes empty", async () => {
  const spec = await toIssueSpec("ACME-1", { summary: "", description: " \t  " });
  assert.equal(spec.descriptionText, "");
  assert.equal(spec.specHash, EMPTY);
});

test("[boundary-11] a string description longer than 20,000 characters is truncated with a marker", async () => {
  const spec = await toIssueSpec("ACME-1", { description: "x".repeat(20_001) });
  assert.equal(spec.descriptionText, `${"x".repeat(20_000)}\n[truncated]`);
});

test("[boundary-11] an ADF description longer than 20,000 characters is truncated with a marker", async () => {
  const spec = await toIssueSpec("ACME-1", {
    description: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "y".repeat(20_001) }] }],
    },
  });
  assert.equal(spec.descriptionText, `${"y".repeat(20_000)}\n[truncated]`);
});

test("[boundary-12] a description of exactly 20,000 characters is kept whole", async () => {
  const description = "x".repeat(20_000);
  const spec = await toIssueSpec("ACME-1", { description });
  assert.equal(spec.descriptionText, description);
});

test("[boundary-12] an ADF description of exactly 20,000 characters is kept whole", async () => {
  const text = "y".repeat(20_000);
  const spec = await toIssueSpec("ACME-1", {
    description: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
  });
  assert.equal(spec.descriptionText, text);
});

for (const [label, description] of [
  ["absent", undefined],
  ["null", null],
  ["42", 42],
  ["true", true],
  ['["text"]', ["text"]],
] as const) {
  test(`[boundary-13] a description of ${label} is neither a string nor an ADF node and becomes ""`, async () => {
    const fields: Fields = description === undefined ? { summary: "" } : { summary: "", description };
    const spec = await toIssueSpec("ACME-1", fields);
    assert.equal(spec.descriptionText, "");
    assert.equal(spec.specHash, EMPTY);
  });
}

test("[boundary-16] an empty fields block yields a spec of defaults", async () => {
  const spec = await toIssueSpec("ACME-1", {});
  assert.deepEqual(spec, {
    key: "ACME-1",
    summary: "",
    descriptionText: "",
    issueType: "Task",
    updated: null,
    specHash: EMPTY,
  });
});

test("[boundary-16] a fields block of only malformed values yields the same defaults", async () => {
  const spec = await toIssueSpec("ACME-1", {
    summary: 42,
    description: 42,
    issuetype: { name: 3 },
    updated: 1729415700000,
  });
  assert.deepEqual(spec, {
    key: "ACME-1",
    summary: "",
    descriptionText: "",
    issueType: "Task",
    updated: null,
    specHash: EMPTY,
  });
});

test("[unhappy-3] a null fields block rejects with a TypeError", async () => {
  await assert.rejects(toIssueSpec("ACME-1", null as unknown as Fields), TypeError);
});

test("[unhappy-3] an undefined fields block rejects with a TypeError", async () => {
  await assert.rejects(toIssueSpec("ACME-1", undefined as unknown as Fields), TypeError);
});

test("[concurrency-2] overlapping toIssueSpec calls each resolve to their own issue's spec", async () => {
  const [first, second] = await Promise.all([
    toIssueSpec("ACME-1", { summary: "Add login", description: "Users can sign in." }),
    toIssueSpec("ACME-2", { summary: "Fix the build", description: "Line one\nLine two" }),
  ]);
  assert.equal(first.key, "ACME-1");
  assert.equal(first.specHash, ADD_LOGIN);
  assert.equal(second.key, "ACME-2");
  assert.equal(second.specHash, FIX_BUILD);
});

test("[concurrency-2] a rejecting call overlapping a valid one does not disturb it", async () => {
  const [ok, bad] = await Promise.allSettled([
    toIssueSpec("ACME-1", { summary: "Add login", description: "Users can sign in." }),
    toIssueSpec("ACME-2", null as unknown as Fields),
  ]);
  assert.equal(ok.status, "fulfilled");
  assert.ok(ok.status === "fulfilled");
  assert.equal(ok.value.key, "ACME-1");
  assert.equal(ok.value.specHash, ADD_LOGIN);
  assert.equal(bad.status, "rejected");
  assert.ok(bad.status === "rejected" && bad.reason instanceof TypeError);
});
