import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "../../src/index.js";
import type { Match } from "../../src/index.js";

/** Scans one file and returns its matches as term, line, column and text. */
function found(terms: string[], text: string) {
  const result = scan(terms, [{ path: "f.txt", text }]);
  return result.matches.map((m: Match) => ({
    term: m.term,
    line: m.line,
    column: m.column,
    text: m.text,
  }));
}

test("harbor and harbor lights in harborLights report only harbor lights", () => {
  assert.deepEqual(found(["harbor", "harbor lights"], "harborLights"), [
    { term: "harbor lights", line: 1, column: 1, text: "harborLights" },
  ]);
});

test("the longest match wins whatever order the terms are given in", () => {
  assert.deepEqual(found(["harbor lights", "lights", "harbor"], "x = HARBOR_LIGHTS;"), [
    { term: "harbor lights", line: 1, column: 5, text: "HARBOR_LIGHTS" },
  ]);
});

test("a term matching the middle of a longer match is dropped there but kept elsewhere", () => {
  assert.deepEqual(found(["fern", "silver-fern-cloud"], "use silverFernCloud and fern"), [
    { term: "silver-fern-cloud", line: 1, column: 5, text: "silverFernCloud" },
    { term: "fern", line: 1, column: 25, text: "fern" },
  ]);
});

test("the longer matched text wins, not the term with more words", () => {
  const text = "alpha beta gamma____________delta\nalpha beta gamma delta";
  assert.deepEqual(found(["alpha-beta-gamma", "gamma-delta"], text), [
    { term: "gamma-delta", line: 1, column: 12, text: "gamma____________delta" },
    { term: "alpha-beta-gamma", line: 2, column: 1, text: "alpha beta gamma" },
  ]);
});

test("of two overlapping matches the same length, the term given first wins", () => {
  assert.deepEqual(found(["moon-rise", "blue-moon"], "blue moon rise\nBlueMoonRise"), [
    { term: "moon-rise", line: 1, column: 6, text: "moon rise" },
    { term: "moon-rise", line: 2, column: 5, text: "MoonRise" },
  ]);
  assert.deepEqual(found(["blue-moon", "moon-rise"], "blue moon rise\nBlueMoonRise"), [
    { term: "blue-moon", line: 1, column: 1, text: "blue moon" },
    { term: "blue-moon", line: 2, column: 1, text: "BlueMoon" },
  ]);
});

test("two spellings of the same term matching the same text report the one given first", () => {
  assert.deepEqual(found(["harbor_lights", "Harbor-Lights"], "HarborLights"), [
    { term: "harbor_lights", line: 1, column: 1, text: "HarborLights" },
  ]);
  assert.deepEqual(found(["Harbor-Lights", "harbor_lights"], "HarborLights"), [
    { term: "Harbor-Lights", line: 1, column: 1, text: "HarborLights" },
  ]);
});

test("matches that do not overlap are all reported", () => {
  assert.deepEqual(found(["harbor", "harbor lights"], "harborLights harbor\nharbor harbor_lights"), [
    { term: "harbor lights", line: 1, column: 1, text: "harborLights" },
    { term: "harbor", line: 1, column: 14, text: "harbor" },
    { term: "harbor", line: 2, column: 1, text: "harbor" },
    { term: "harbor lights", line: 2, column: 8, text: "harbor_lights" },
  ]);
});

test("adjacent matches of one term inside an identifier are both reported", () => {
  assert.deepEqual(found(["acme"], "AcmeAcme"), [
    { term: "acme", line: 1, column: 1, text: "Acme" },
    { term: "acme", line: 1, column: 5, text: "Acme" },
  ]);
});
