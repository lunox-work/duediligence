import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "../../src/index.js";

test("[boundary-3] skips the specified short generic and numeric examples in paths and text", () => {
  assert.deepEqual(scan(["api", "Web", "x1", "core", "demo", "12345"], [{
    path: "api/Web/x1/core/demo/12345.txt",
    text: "api Web x1 core demo 12345",
  }]), { matches: [], skipped: [] });
});

test("[boundary-3] excludes every generic term ignoring case", () => {
  const terms = [
    "ADMIN", "API", "APP", "CLIENT", "CORE", "DEMO", "EXAMPLE",
    "INTERNAL", "MAIN", "SERVER", "TEST", "WEB",
  ];
  assert.deepEqual(scan(terms, [{ path: "notes.txt", text: terms.join("\n") }]), {
    matches: [],
    skipped: [],
  });
});

test("[boundary-3] counts letters and digits rather than separators at the four-character cutoff", () => {
  assert.deepEqual(scan(["abc", "a-b-c", "abcd", "a-b-c-d", "abc1"], [{
    path: "notes.txt",
    text: "abc\na-b-c\nabcd\na-b-c-d\nabc1",
  }]).matches, [
    { path: "notes.txt", term: "abcd", line: 3, column: 1, text: "abcd" },
    { path: "notes.txt", term: "a-b-c-d", line: 4, column: 1, text: "a-b-c-d" },
    { path: "notes.txt", term: "abc1", line: 5, column: 1, text: "abc1" },
  ]);
});

test("[boundary-3] requires a letter and counts Unicode letters with digits toward the cutoff", () => {
  assert.deepEqual(scan(["12345", "12-345", "----", "é-2", "é-t-2-3"], [{
    path: "notes.txt",
    text: "12345\n12-345\n----\né-2\né-t-2-3",
  }]).matches, [
    { path: "notes.txt", term: "é-t-2-3", line: 5, column: 1, text: "é-t-2-3" },
  ]);
});
