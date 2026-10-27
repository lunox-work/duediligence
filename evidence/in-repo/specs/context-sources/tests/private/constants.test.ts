import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONTEXT_DOCUMENTS_MAX,
  CONTEXT_DOCUMENT_BYTES_MAX,
  CONTEXT_DOCUMENT_CHARS,
  CONTEXT_SOURCES,
  CONTEXT_TOTAL_CHARS,
  NO_CONTEXT,
  contextDocuments,
  contextDrift,
  keptDocuments,
} from "../../src/sources.js";

/**
 * The constants hold their declared values, and those values are the caps
 * the functions apply: a constant that read 12 while the function cut at
 * some other count would satisfy neither.
 */

// Extends "[happy-1] the sources and caps have their declared values".
test("[happy-1] the count and byte caps are the ones contextDocuments applies", () => {
  assert.equal(CONTEXT_DOCUMENTS_MAX, 12);
  assert.equal(CONTEXT_DOCUMENT_BYTES_MAX, 131072);
  const files = Array.from({ length: CONTEXT_DOCUMENTS_MAX + 3 }, (_, index) => ({
    path: `docs/c${String(index).padStart(2, "0")}.md`,
    size: 10,
  }));
  const counted = contextDocuments(files);
  assert.equal(counted.paths.length, 12);
  assert.equal(counted.omitted, 3);
  assert.deepEqual(contextDocuments([{ path: "GUIDE.md", size: CONTEXT_DOCUMENT_BYTES_MAX }]), {
    paths: ["GUIDE.md"],
    omitted: 0,
  });
  assert.deepEqual(
    contextDocuments([{ path: "GUIDE.md", size: CONTEXT_DOCUMENT_BYTES_MAX + 1 }]),
    { paths: [], omitted: 1 },
  );
});

// Extends "[happy-1] the byte cap is exactly 128 KiB".
test("[happy-1] the per-document and total character caps are the ones keptDocuments applies", () => {
  assert.equal(CONTEXT_DOCUMENT_CHARS, 12000);
  assert.equal(CONTEXT_TOTAL_CHARS, 48000);
  const input = Array.from({ length: 5 }, (_, index) => ({
    path: `d${index}.md`,
    bytes: 1,
    text: "q".repeat(20000),
  }));
  const result = keptDocuments(input);
  assert.deepEqual(
    result.documents.map((document) => document.text.length),
    [12000, 12000, 12000, 12000],
  );
  assert.equal(
    result.documents.reduce((sum, document) => sum + document.text.length, 0),
    48000,
  );
  assert.equal(result.omitted, 1);
});

test("[happy-1] CONTEXT_SOURCES names exactly the sources contextDrift answers for", () => {
  assert.deepEqual([...CONTEXT_SOURCES], ["jira", "github"]);
  const drift = contextDrift({ jira: 1, github: 1 }, { jira: 1, github: 1 });
  assert.deepEqual(Object.keys(drift).sort(), [...CONTEXT_SOURCES].sort());
});

// Extends "[happy-2] NO_CONTEXT names no version of either source and is frozen".
test("[happy-2] NO_CONTEXT used as a step's versions means it used no version of either source", () => {
  assert.deepEqual({ ...NO_CONTEXT }, { jira: null, github: null });
  assert.deepEqual(contextDrift({ jira: 2, github: 3 }, NO_CONTEXT), {
    jira: { uses: null, current: 2 },
    github: { uses: null, current: 3 },
  });
});

// Extends "[happy-2] NO_CONTEXT refuses a write and keeps its nulls".
test("[happy-2] NO_CONTEXT stays frozen and null after being passed to contextDrift both ways", () => {
  contextDrift(NO_CONTEXT, { jira: 4, github: 5 });
  contextDrift({ jira: 4, github: 5 }, NO_CONTEXT);
  assert.equal(Object.isFrozen(NO_CONTEXT), true);
  assert.deepEqual(Object.keys(NO_CONTEXT).sort(), ["github", "jira"]);
  assert.equal(NO_CONTEXT.jira, null);
  assert.equal(NO_CONTEXT.github, null);
});
