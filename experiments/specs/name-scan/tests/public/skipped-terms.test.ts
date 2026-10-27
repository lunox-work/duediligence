import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "../../src/index.js";

test("short and generic terms are not reported", () => {
  const result = scan(
    ["api", "Web", "x1", "core", "demo", "12345"],
    [{ path: "a.txt", text: "api Web x1 core demo 12345\nAPI web X1 CORE Demo" }],
  );
  assert.deepEqual(result.matches, []);
});

test("every listed generic word is skipped whatever its case", () => {
  const result = scan(
    ["ADMIN", "Api", "app", "Client", "core", "DEMO", "Example", "internal", "Main", "SERVER", "test", "Web"],
    [
      {
        path: "a.txt",
        text: "admin api app client core demo example internal main server test web",
      },
    ],
  );
  assert.deepEqual(result.matches, []);
});

test("a term with 4 letters and digits is scanned, one with 3 is not", () => {
  const result = scan(
    ["a-b-c", "ab-cd"],
    [{ path: "x.ts", text: "a-b-c ab-cd" }],
  );
  assert.deepEqual(result.matches, [
    { path: "x.ts", term: "ab-cd", line: 1, column: 7, text: "ab-cd" },
  ]);
});

test("a term with no letter is skipped however long", () => {
  const result = scan(
    ["2024-01-01"],
    [{ path: "a.txt", text: "2024-01-01" }],
  );
  assert.deepEqual(result.matches, []);
});

test("a generic word inside a longer term does not make it skipped", () => {
  const result = scan(
    ["acme-api"],
    [{ path: "a.ts", text: "acmeApi" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "acme-api", line: 1, column: 1, text: "acmeApi" },
  ]);
});
