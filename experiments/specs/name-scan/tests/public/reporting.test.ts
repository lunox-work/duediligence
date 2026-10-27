import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "../../src/index.js";

test("a match reports path, term as given, line, column and text as written", () => {
  const result = scan(
    ["Harbor-Lights"],
    [{ path: "src/app.ts", text: "first\r\nsecond\r\n  const HARBOR_LIGHTS = 1;\r\n" }],
  );
  assert.deepEqual(result.matches, [
    { path: "src/app.ts", term: "Harbor-Lights", line: 3, column: 9, text: "HARBOR_LIGHTS" },
  ]);
});

test("columns count UTF-16 code units", () => {
  const result = scan(
    ["acme"],
    [{ path: "a.ts", text: "\u{1F600} acme\r\nété acme" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "acme", line: 1, column: 4, text: "acme" },
    { path: "a.ts", term: "acme", line: 2, column: 5, text: "acme" },
  ]);
});

test("a file's path is scanned with line 0 and the column in the path", () => {
  const result = scan(
    ["harbor-lights"],
    [{ path: "packages/harbor-lights/src/index.ts", text: "export {};\n" }],
  );
  assert.deepEqual(result.matches, [
    {
      path: "packages/harbor-lights/src/index.ts",
      term: "harbor-lights",
      line: 0,
      column: 10,
      text: "harbor-lights",
    },
  ]);
});

test("a match in the path comes before matches in the text", () => {
  const result = scan(
    ["harbor-lights"],
    [{ path: "src/HarborLights.tsx", text: "harborLights();" }],
  );
  assert.deepEqual(result.matches, [
    { path: "src/HarborLights.tsx", term: "harbor-lights", line: 0, column: 5, text: "HarborLights" },
    { path: "src/HarborLights.tsx", term: "harbor-lights", line: 1, column: 1, text: "harborLights" },
  ]);
});

test("overlapping matches keep the longest", () => {
  const result = scan(
    ["harbor", "harbor lights"],
    [{ path: "a.ts", text: "harborLights" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "harbor lights", line: 1, column: 1, text: "harborLights" },
  ]);
});

test("overlapping matches of the same length keep the term given first", () => {
  const files = [{ path: "a.ts", text: "acme-orders-base" }];
  assert.deepEqual(scan(["acme orders", "orders base"], files).matches, [
    { path: "a.ts", term: "acme orders", line: 1, column: 1, text: "acme-orders" },
  ]);
  assert.deepEqual(scan(["orders base", "acme orders"], files).matches, [
    { path: "a.ts", term: "orders base", line: 1, column: 6, text: "orders-base" },
  ]);
});

test("matches that do not overlap are all reported", () => {
  const result = scan(
    ["harbor", "harbor lights"],
    [{ path: "a.ts", text: "harbor lights harbor" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "harbor lights", line: 1, column: 1, text: "harbor lights" },
    { path: "a.ts", term: "harbor", line: 1, column: 15, text: "harbor" },
  ]);
});

test("matches are ordered by path, then line, then column", () => {
  const result = scan(
    ["harbor", "acme"],
    [
      { path: "b.ts", text: "acme\nharbor" },
      { path: "a.ts", text: "harbor acme" },
    ],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "harbor", line: 1, column: 1, text: "harbor" },
    { path: "a.ts", term: "acme", line: 1, column: 8, text: "acme" },
    { path: "b.ts", term: "acme", line: 1, column: 1, text: "acme" },
    { path: "b.ts", term: "harbor", line: 2, column: 1, text: "harbor" },
  ]);
});

test("matches are ordered by line number before column", () => {
  const text = ["x", "    harbor", "", "", "", "", "", "", "", "acme"].join("\n");
  const result = scan(["acme", "harbor"], [{ path: "a.ts", text }]);
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "harbor", line: 2, column: 5, text: "harbor" },
    { path: "a.ts", term: "acme", line: 10, column: 1, text: "acme" },
  ]);
});

test("a file whose text contains NUL is not scanned and is listed as skipped", () => {
  const result = scan(
    ["acme"],
    [
      { path: "logo.png", text: "acme\u0000acme" },
      { path: "ok.ts", text: "acme" },
    ],
  );
  assert.deepEqual(result.matches, [
    { path: "ok.ts", term: "acme", line: 1, column: 1, text: "acme" },
  ]);
  assert.deepEqual(result.skipped, ["logo.png"]);
});

test("a single NUL at the very end refuses a file; a file without NUL is not skipped", () => {
  const result = scan(
    ["acme"],
    [
      { path: "x.bin", text: "acme\n\u0000" },
      { path: "y.ts", text: "" },
    ],
  );
  assert.deepEqual(result.matches, []);
  assert.deepEqual(result.skipped, ["x.bin"]);
});
