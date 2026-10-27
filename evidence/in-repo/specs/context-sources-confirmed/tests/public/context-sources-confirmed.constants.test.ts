import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONTEXT_DOCUMENT_BYTES_MAX,
  CONTEXT_DOCUMENT_CHARS,
  CONTEXT_DOCUMENTS_MAX,
  CONTEXT_SOURCES,
  CONTEXT_TOTAL_CHARS,
  NO_CONTEXT,
} from "../src/sources.js";

test("[happy-1] the sources and caps have their declared values", () => {
  assert.deepEqual([...CONTEXT_SOURCES], ["jira", "github"]);
  assert.equal(CONTEXT_DOCUMENTS_MAX, 12);
  assert.equal(CONTEXT_DOCUMENT_BYTES_MAX, 262144);
  assert.equal(CONTEXT_DOCUMENT_CHARS, 12000);
  assert.equal(CONTEXT_TOTAL_CHARS, 48000);
});

test("[happy-1] the byte cap is exactly 256 KiB and the total holds four whole documents", () => {
  assert.equal(CONTEXT_DOCUMENT_BYTES_MAX, 256 * 1024);
  assert.equal(CONTEXT_TOTAL_CHARS, 4 * CONTEXT_DOCUMENT_CHARS);
  assert.equal(CONTEXT_SOURCES.length, 2);
});

test("[happy-2] NO_CONTEXT names no version of either source", () => {
  assert.deepEqual(NO_CONTEXT, { jira: null, github: null });
});

test("[happy-2] NO_CONTEXT is not frozen", () => {
  assert.equal(Object.isFrozen(NO_CONTEXT), false);
});
