import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "../../src/index.js";
import type { Match } from "../../src/index.js";

function brief(m: Match) {
  return { path: m.path, term: m.term, line: m.line, column: m.column, text: m.text };
}

test("a file whose text holds a NUL is not scanned and is listed as skipped", () => {
  const result = scan(
    ["harbor-lights"],
    [
      { path: "image.bin", text: "harbor-lights\u0000\u0001\u0002harborLights" },
      { path: "readme.md", text: "about harborLights" },
    ],
  );
  assert.deepEqual(result.matches.map(brief), [
    { path: "readme.md", term: "harbor-lights", line: 1, column: 7, text: "harborLights" },
  ]);
  assert.deepEqual(result.skipped, ["image.bin"]);
});

test("a NUL anywhere in the text, first or last, makes the file skipped", () => {
  const result = scan(
    ["nimbus"],
    [
      { path: "c.dat", text: "nimbus\nnimbus\u0000" },
      { path: "b.txt", text: "x nimbus" },
      { path: "a.dat", text: "\u0000nimbus" },
      { path: "d.dat", text: "\u0000" },
    ],
  );
  assert.deepEqual(result.matches.map(brief), [
    { path: "b.txt", term: "nimbus", line: 1, column: 3, text: "nimbus" },
  ]);
  assert.deepEqual([...result.skipped].sort(), ["a.dat", "c.dat", "d.dat"]);
});

test("a skipped file with no matching term is still listed as skipped", () => {
  const result = scan(["nimbus"], [{ path: "blob.o", text: "\u007fELF\u0000\u0000" }]);
  assert.deepEqual(result.matches, []);
  assert.deepEqual(result.skipped, ["blob.o"]);
});

test("files without a NUL are not listed as skipped", () => {
  const result = scan(
    ["nimbus"],
    [
      { path: "one.txt", text: "nimbus ÿ" },
      { path: "two.txt", text: "" },
    ],
  );
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(result.matches.map(brief), [
    { path: "one.txt", term: "nimbus", line: 1, column: 1, text: "nimbus" },
  ]);
});
