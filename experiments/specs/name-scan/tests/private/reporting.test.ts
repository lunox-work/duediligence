import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "../../src/index.js";

// Extends "a match reports path, term as given, line, column and text as written".
test("positions are counted on each line past blank CRLF lines and tabs", () => {
  const result = scan(
    ["acme", "harbor lights"],
    [{ path: "lib/x.ts", text: "\r\n\r\n\t\tconst x = acme;\r\n  HarborLights\r\n" }],
  );
  assert.deepEqual(result.matches, [
    { path: "lib/x.ts", term: "acme", line: 3, column: 13, text: "acme" },
    { path: "lib/x.ts", term: "harbor lights", line: 4, column: 3, text: "HarborLights" },
  ]);
});

// Extends "columns count UTF-16 code units": several surrogate pairs, in the
// text and in the path.
test("columns count each surrogate pair as two units in the text and the path", () => {
  const path = "\u{1F600}\u{1F600}/acme.ts";
  const result = scan(
    ["acme", "harbor-lights"],
    [{ path, text: "\u{20000}\u{1F600} harbor-lights \u{1F600}acme" }],
  );
  assert.deepEqual(result.matches, [
    { path, term: "acme", line: 0, column: 6, text: "acme" },
    { path, term: "harbor-lights", line: 1, column: 6, text: "harbor-lights" },
    { path, term: "acme", line: 1, column: 22, text: "acme" },
  ]);
});

// Extends "a file's path is scanned with line 0 and the column in the path":
// several matches in one path, overlaps resolved there too.
test("every match in a path is reported, with overlaps resolved", () => {
  const path = "harbor-lights/harbor/HarborLights.ts";
  const result = scan(["harbor", "harbor lights"], [{ path, text: "" }]);
  assert.deepEqual(result.matches, [
    { path, term: "harbor lights", line: 0, column: 1, text: "harbor-lights" },
    { path, term: "harbor", line: 0, column: 15, text: "harbor" },
    { path, term: "harbor lights", line: 0, column: 22, text: "HarborLights" },
  ]);
  assert.deepEqual(result.skipped, []);
});

// Extends "a file's path is scanned with line 0 and the column in the path":
// a path separator joins words like any other character that is not a letter or digit.
test("words in separate path segments make one match", () => {
  const path = "src/harbor/lights/index.ts";
  const result = scan(["harbor-lights"], [{ path, text: "export {};" }]);
  assert.deepEqual(result.matches, [
    { path, term: "harbor-lights", line: 0, column: 5, text: "harbor/lights" },
  ]);
});

// Extends "a match in the path comes before matches in the text": across
// several files, and with the path match at a later column.
test("each file's path matches come before its text matches, files in path order", () => {
  const result = scan(
    ["acme"],
    [
      { path: "src/zz/acme.ts", text: "acme" },
      { path: "lib/aa/bb/cc/acme.ts", text: "x\nacme" },
    ],
  );
  assert.deepEqual(result.matches, [
    { path: "lib/aa/bb/cc/acme.ts", term: "acme", line: 0, column: 14, text: "acme" },
    { path: "lib/aa/bb/cc/acme.ts", term: "acme", line: 2, column: 1, text: "acme" },
    { path: "src/zz/acme.ts", term: "acme", line: 0, column: 8, text: "acme" },
    { path: "src/zz/acme.ts", term: "acme", line: 1, column: 1, text: "acme" },
  ]);
});

// Extends "overlapping matches keep the longest": the longer match starts
// later and its term is given second.
test("a longer match that starts later beats an earlier one given first", () => {
  const result = scan(
    ["acme harbor", "harbor lights"],
    [{ path: "a.ts", text: "acme harbor-lights" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "harbor lights", line: 1, column: 6, text: "harbor-lights" },
  ]);
});

// Extends "overlapping matches keep the longest": length is that of the
// matched text as written, not of the term as given.
test("the longer matched text wins, not the longer term", () => {
  const result = scan(
    ["acme--------orders", "orders base"],
    [{ path: "a.ts", text: "acme-orders   base" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "orders base", line: 1, column: 6, text: "orders   base" },
  ]);
});

// Extends "overlapping matches keep the longest": a term with fewer words can
// still have the longer matched text.
test("the longer matched text wins, not the term with more words", () => {
  const result = scan(
    ["out harbor lights", "lights beam"],
    [{ path: "a.ts", text: "out harbor lights          beam" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "lights beam", line: 1, column: 12, text: "lights          beam" },
  ]);
});

// Extends "overlapping matches keep the longest": the shorter match lies in
// the middle of the longer one rather than at its start.
test("a match inside the middle of a longer one is dropped", () => {
  const result = scan(
    ["lights", "harbor lights beam"],
    [{ path: "a.ts", text: "harbor lights beam lights" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "harbor lights beam", line: 1, column: 1, text: "harbor lights beam" },
    { path: "a.ts", term: "lights", line: 1, column: 20, text: "lights" },
  ]);
});

// Extends "overlapping matches keep the longest" and "matches that do not
// overlap are all reported": a short match overlapped on both sides.
test("two longer matches that do not overlap each other both beat one between them", () => {
  const result = scan(
    ["harbor lights", "acme harbor", "lights beam"],
    [{ path: "a.ts", text: "acme-----harbor lights-----beam" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "acme harbor", line: 1, column: 1, text: "acme-----harbor" },
    { path: "a.ts", term: "lights beam", line: 1, column: 17, text: "lights-----beam" },
  ]);
});

// Extends "overlapping matches of the same length keep the term given first":
// the same term given twice in different spellings.
test("a term given twice is reported once, under the spelling given first", () => {
  const files = [{ path: "a.ts", text: "x = HarborLights" }];
  assert.deepEqual(scan(["harbor lights", "Harbor-Lights"], files).matches, [
    { path: "a.ts", term: "harbor lights", line: 1, column: 5, text: "HarborLights" },
  ]);
  assert.deepEqual(scan(["Harbor-Lights", "harbor lights"], files).matches, [
    { path: "a.ts", term: "Harbor-Lights", line: 1, column: 5, text: "HarborLights" },
  ]);
});

// Extends "overlapping matches of the same length keep the term given first":
// the first of the overlapping terms wins even when other terms come before it.
test("of equal-length overlapping matches the earliest given term wins among several", () => {
  const files = [{ path: "a.ts", text: "acme-orders-base" }];
  assert.deepEqual(scan(["zeta", "orders base", "harbor", "acme orders"], files).matches, [
    { path: "a.ts", term: "orders base", line: 1, column: 6, text: "orders-base" },
  ]);
});

// Extends "matches that do not overlap are all reported": matches that touch
// but share no character.
test("adjacent matches that share no character are all reported", () => {
  const result = scan(
    ["harbor lights", "acme"],
    [{ path: "a.ts", text: "harborLightsAcme acme-harbor-lights" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "harbor lights", line: 1, column: 1, text: "harborLights" },
    { path: "a.ts", term: "acme", line: 1, column: 13, text: "Acme" },
    { path: "a.ts", term: "acme", line: 1, column: 18, text: "acme" },
    { path: "a.ts", term: "harbor lights", line: 1, column: 23, text: "harbor-lights" },
  ]);
});

// Extends "matches are ordered by path, then line, then column": many files
// given in reverse order.
test("many files given in reverse order are reported in path order", () => {
  const paths = Array.from({ length: 40 }, (_, i) => `src/f${String(i).padStart(2, "0")}.ts`);
  const files = [...paths].reverse().map((path) => ({ path, text: "acme" }));
  const result = scan(["acme"], files);
  assert.deepEqual(
    result.matches,
    paths.map((path) => ({ path, term: "acme", line: 1, column: 1, text: "acme" })),
  );
});

// Extends "matches are ordered by path, then line, then column": columns are
// compared as numbers, whatever order the terms are given in.
test("matches on one line are ordered by column as a number", () => {
  const line = "    zeta".padEnd(11) + "acme".padEnd(88) + "harbor";
  const result = scan(["harbor", "acme", "zeta"], [{ path: "a.ts", text: line }]);
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "zeta", line: 1, column: 5, text: "zeta" },
    { path: "a.ts", term: "acme", line: 1, column: 12, text: "acme" },
    { path: "a.ts", term: "harbor", line: 1, column: 100, text: "harbor" },
  ]);
});

// Extends "matches are ordered by line number before column": lines are
// compared as numbers, and the terms are given in the other order.
test("matches are ordered by line as a number across many lines", () => {
  const lines = Array.from({ length: 100 }, () => "");
  lines[2] = "          harbor";
  lines[19] = "     acme";
  lines[99] = "zeta";
  const result = scan(["zeta", "acme", "harbor"], [{ path: "a.ts", text: lines.join("\n") }]);
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "harbor", line: 3, column: 11, text: "harbor" },
    { path: "a.ts", term: "acme", line: 20, column: 6, text: "acme" },
    { path: "a.ts", term: "zeta", line: 100, column: 1, text: "zeta" },
  ]);
});

// Extends "a match reports path, term as given, line, column and text as written":
// a long file.
test("a match deep in a long file reports its line", () => {
  const text = Array.from({ length: 4999 }, () => "const x = 1;").join("\r\n") + "\r\n  acmeOrders();";
  const result = scan(["acme"], [{ path: "a.ts", text }]);
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "acme", line: 5000, column: 3, text: "acme" },
  ]);
});

// Extends "a file whose text contains NUL is not scanned and is listed as skipped":
// several refused files among scanned ones.
test("every file with a NUL is skipped and the others are scanned", () => {
  const result = scan(
    ["acme"],
    [
      { path: "c.bin", text: "acme\u0000" },
      { path: "d.ts", text: "x\nacme" },
      { path: "a.bin", text: "\u0000" },
      { path: "b.ts", text: "acme" },
      { path: "e.bin", text: "acme\nacme\u0000acme\nacme" },
    ],
  );
  assert.deepEqual(result.matches, [
    { path: "b.ts", term: "acme", line: 1, column: 1, text: "acme" },
    { path: "d.ts", term: "acme", line: 2, column: 1, text: "acme" },
  ]);
  assert.deepEqual([...result.skipped].sort(), ["a.bin", "c.bin", "e.bin"]);
});

// Extends "a single NUL at the very end refuses a file; a file without NUL is
// not skipped": other control characters do not refuse a file.
test("a file with control characters other than NUL is scanned", () => {
  const result = scan(
    ["acme"],
    [{ path: "a.ts", text: "acme\u0001acme\u007Facme \\0 acme" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "acme", line: 1, column: 1, text: "acme" },
    { path: "a.ts", term: "acme", line: 1, column: 6, text: "acme" },
    { path: "a.ts", term: "acme", line: 1, column: 11, text: "acme" },
    { path: "a.ts", term: "acme", line: 1, column: 19, text: "acme" },
  ]);
  assert.deepEqual(result.skipped, []);
});

// Extends "a file whose text contains NUL is not scanned and is listed as skipped":
// a refused file is listed even when there is no term to scan for.
test("a file with a NUL is listed as skipped even when no term is scanned", () => {
  const files = [
    { path: "x.bin", text: "\u0000" },
    { path: "y.ts", text: "api" },
  ];
  assert.deepEqual(scan([], files), { matches: [], skipped: ["x.bin"] });
  assert.deepEqual(scan(["api", "x1"], files), { matches: [], skipped: ["x.bin"] });
});

// Boundary the public suite skips: nothing to scan.
test("no files give no matches and no skipped paths", () => {
  const result = scan(["acme", "harbor-lights"], []);
  assert.deepEqual(result.matches, []);
  assert.deepEqual(result.skipped, []);
});
