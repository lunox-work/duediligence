import assert from "node:assert/strict";
import { test } from "node:test";

import { ISSUE_FIELDS } from "../src/mapping.js";
import { SPEC_FIELDS, specHash } from "../src/spec.js";
import { stripTrailingSlashes } from "../src/url.js";

/** specHash("Add login", "Users can sign in.") */
const ADD_LOGIN = "24b1c29d416fdea96e63dcd8edf3ccbc14c9e53a0f019720cefd4803fcec0bf5";
/** specHash("Fix the build", "Line one\nLine two") */
const FIX_BUILD = "401c829e08ad2a5a6a3cb4a6913afd15a8f35a9ceb9ddeb48a714539e0b50fa7";
/** specHash("", "") */
const EMPTY = "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d";

/** Calls specHash with arguments the types would not allow. */
function untypedSpecHash(summary: unknown, descriptionText: unknown) {
  return specHash(summary as string, descriptionText as string);
}

test("[happy-1] SPEC_FIELDS is the four spec fields, in order", () => {
  assert.deepEqual(
    [...SPEC_FIELDS],
    ["summary", "description", "issuetype", "updated"],
  );
});

test("[happy-1] SPEC_FIELDS has no duplicate field", () => {
  assert.equal(new Set(SPEC_FIELDS).size, SPEC_FIELDS.length);
});

test("[happy-2] ISSUE_FIELDS is unchanged by this feature", () => {
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
});

test("[happy-2] ISSUE_FIELDS stays 11 fields and does not gain description", () => {
  assert.equal(ISSUE_FIELDS.length, 11);
  assert.ok(!ISSUE_FIELDS.includes("description"));
});

test("[happy-3] a known ASCII summary and description give the known hash", async () => {
  assert.equal(await specHash("Add login", "Users can sign in."), ADD_LOGIN);
});

test("[happy-3] a description with an LF newline gives the known hash", async () => {
  assert.equal(await specHash("Fix the build", "Line one\nLine two"), FIX_BUILD);
});

test("[happy-3] non-ASCII text is hashed as UTF-8 to the known hash", async () => {
  assert.equal(
    await specHash("Café", "naïve \u{1F642}"),
    "9c4cc9badc248d4348703cb96e07cb1dc086a58719c9e27252c8258dec119ca4",
  );
});

test("[boundary-1] two empty strings still hash", async () => {
  assert.equal(await specHash("", ""), EMPTY);
});

test("[boundary-1] whitespace-only inputs canonicalise to empty and hash like two empty strings", async () => {
  assert.equal(await specHash("  \t ", "\r\n \n\t"), EMPTY);
});

test("[happy-4] the result has the shape of a lowercase hex SHA-256 digest", async () => {
  assert.match(await specHash("Add login", "Users can sign in."), /^[0-9a-f]{64}$/);
});

test("[happy-4] empty and non-ASCII inputs also give the hex digest's shape", async () => {
  assert.match(await specHash("", ""), /^[0-9a-f]{64}$/);
  assert.match(await specHash("Café", "naïve \u{1F642}"), /^[0-9a-f]{64}$/);
});

test("[happy-5] the same inputs always give the same hash", async () => {
  const first = await specHash("Add login", "Users can sign in.");
  const second = await specHash("Add login", "Users can sign in.");
  assert.equal(first, second);
});

test("[happy-5] the same empty inputs give the same hash every time", async () => {
  const first = await specHash("", "");
  const second = await specHash("", "");
  assert.equal(first, second);
});

test("[boundary-2] moving text across the summary/description boundary changes the hash", async () => {
  const first = await specHash("a\nb", "c");
  const second = await specHash("a", "b\nc");
  assert.equal(first, "896144d1d44195e89a7ed32b80e86e5c886c7f993eaf12f946524018d68dbd9c");
  assert.equal(second, "214df3f68e1a607f5baa40cc3315f4316ae58b282b6c0bf288b89fec4da7aa80");
  assert.notEqual(first, second);
});

test("[boundary-3] a trailing space on the description does not change the hash", async () => {
  assert.equal(await specHash("Add login", "Users can sign in. "), ADD_LOGIN);
});

test("[boundary-3] leading spaces and trailing blank lines on the description do not change the hash", async () => {
  assert.equal(await specHash("Add login", "  Users can sign in.\n\n"), ADD_LOGIN);
});

test("[boundary-3] spaces around the summary do not change the hash", async () => {
  assert.equal(await specHash("  Add login  ", "Users can sign in."), ADD_LOGIN);
});

test("[boundary-4] CRLF hashes the same as LF", async () => {
  assert.equal(await specHash("Fix the build", "Line one\r\nLine two"), FIX_BUILD);
});

test("[boundary-4] a lone CR and trailing spaces before a line ending hash the same as LF", async () => {
  assert.equal(await specHash("Fix the build", "Line one\rLine two"), FIX_BUILD);
  assert.equal(await specHash("Fix the build", "Line one \t\r\nLine two"), FIX_BUILD);
});

test("[boundary-5] whitespace inside a line is significant", async () => {
  const hash = await specHash("Add login", "Users  can sign in.");
  assert.equal(hash, "9e8adb77f867c7c699b7b519248d5f241818f57c86bf3f495f4d50be8b92d458");
  assert.notEqual(hash, ADD_LOGIN);
});

test("[boundary-5] a blank line between lines of text is significant", async () => {
  assert.notEqual(await specHash("Fix the build", "Line one\n\nLine two"), FIX_BUILD);
});

test("[boundary-6] Unicode is hashed as given, without normalisation", async () => {
  const composed = await specHash("Café", "");
  const decomposed = await specHash("Café", "");
  assert.equal(composed, "6d376e109ca48a4c0406fbcef2371b0094c5aee541b5d71ca6adce921a59a792");
  assert.equal(decomposed, "4958810ccced6aa6642407420b24b5b561d0b12d72d229f855814f307491f030");
});

test("[boundary-6] composed and decomposed forms of the same word hash differently", async () => {
  assert.notEqual(await specHash("Café", ""), await specHash("Café", ""));
});

test("[unhappy-1] an undefined summary rejects with a TypeError", async () => {
  await assert.rejects(untypedSpecHash(undefined, ""), TypeError);
});

test("[unhappy-1] a numeric summary rejects with a TypeError", async () => {
  await assert.rejects(untypedSpecHash(42, ""), TypeError);
});

test("[unhappy-1] a null description rejects with a TypeError", async () => {
  await assert.rejects(untypedSpecHash("", null), TypeError);
});

test("[unhappy-1] an object description rejects with a TypeError", async () => {
  await assert.rejects(untypedSpecHash("", {}), TypeError);
});

test("[unhappy-1] a String object is not a string and rejects with a TypeError", async () => {
  await assert.rejects(untypedSpecHash(new String("Add login"), ""), TypeError);
});

test("[concurrency-1] overlapping specHash calls each resolve to their own input's hash", async () => {
  const results = await Promise.all([
    specHash("Add login", "Users can sign in."),
    specHash("", ""),
    specHash("Fix the build", "Line one\nLine two"),
  ]);
  assert.deepEqual(results, [ADD_LOGIN, EMPTY, FIX_BUILD]);
});

test("[concurrency-1] a rejecting call overlapping valid ones does not disturb them", async () => {
  const results = await Promise.allSettled([
    specHash("Add login", "Users can sign in."),
    untypedSpecHash(42, ""),
    specHash("Fix the build", "Line one\nLine two"),
  ]);
  assert.deepEqual(results[0], { status: "fulfilled", value: ADD_LOGIN });
  assert.equal(results[1]?.status, "rejected");
  assert.ok(results[1]?.status === "rejected" && results[1].reason instanceof TypeError);
  assert.deepEqual(results[2], { status: "fulfilled", value: FIX_BUILD });
});

test("[happy-12] the spec exports are reachable from the package entry point", async () => {
  // Specifiers held in variables: adf.ts and the new index exports do not
  // exist until the spec is implemented, and this file must still compile.
  const indexPath: string = "../src/index.js";
  const specPath: string = "../src/spec.js";
  const adfPath: string = "../src/adf.js";
  const index = (await import(indexPath)) as Record<string, unknown>;
  const spec = (await import(specPath)) as Record<string, unknown>;
  const adf = (await import(adfPath)) as Record<string, unknown>;

  assert.equal(index["SPEC_FIELDS"], spec["SPEC_FIELDS"]);
  assert.equal(index["specHash"], spec["specHash"]);
  assert.equal(index["toIssueSpec"], spec["toIssueSpec"]);
  assert.equal(typeof adf["adfToText"], "function");
  assert.equal(index["adfToText"], adf["adfToText"]);
  assert.equal(index["stripTrailingSlashes"], stripTrailingSlashes);
});

test("[happy-12] the existing entry-point exports are still there", async () => {
  const indexPath: string = "../src/index.js";
  const index = (await import(indexPath)) as Record<string, unknown>;

  assert.equal(index["ISSUE_FIELDS"], ISSUE_FIELDS);
  for (const name of ["toIssueDto", "toBoardDto", "toSprintDto", "JiraClient"]) {
    assert.equal(typeof index[name], "function", `${name} is exported`);
  }
});
