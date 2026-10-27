import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "../../src/index.js";
import type { Match } from "../../src/index.js";

const PATH = "notes.txt";

/** Scans one file at PATH and returns its matches with only the spec's fields. */
function found(terms: string[], text: string) {
  const result = scan(terms, [{ path: PATH, text }]);
  return result.matches.map((m: Match) => ({
    path: m.path,
    term: m.term,
    line: m.line,
    column: m.column,
    text: m.text,
  }));
}

function match(term: string, line: number, column: number, text: string) {
  return { path: PATH, term, line, column, text };
}

test("spellings of harbor-lights on their own lines are all found", () => {
  const text = "harborLights\nHARBOR_LIGHTS\nharbor.lights\nHarbor Lights";
  assert.deepEqual(found(["harbor-lights"], text), [
    match("harbor-lights", 1, 1, "harborLights"),
    match("harbor-lights", 2, 1, "HARBOR_LIGHTS"),
    match("harbor-lights", 3, 1, "harbor.lights"),
    match("harbor-lights", 4, 1, "Harbor Lights"),
  ]);
});

test("spellings of a snake-case term are all found on one line", () => {
  const line =
    'const a = oceanBreeze; const b = "OCEAN-BREEZE"; // Ocean.Breeze or ocean breeze';
  const col = (s: string) => line.indexOf(s) + 1;
  assert.deepEqual(found(["Ocean_Breeze"], line), [
    match("Ocean_Breeze", 1, col("oceanBreeze"), "oceanBreeze"),
    match("Ocean_Breeze", 1, col("OCEAN-BREEZE"), "OCEAN-BREEZE"),
    match("Ocean_Breeze", 1, col("Ocean.Breeze"), "Ocean.Breeze"),
    match("Ocean_Breeze", 1, col("ocean breeze"), "ocean breeze"),
  ]);
});

test("a three-word camel-case term is found in every spelling", () => {
  const text = [
    "silver-fern-cloud",
    "SILVER_FERN_CLOUD",
    "SilverFernCloud",
    "silver fern cloud",
    "silver.fern/cloud",
  ].join("\n");
  assert.deepEqual(found(["silverFernCloud"], text), [
    match("silverFernCloud", 1, 1, "silver-fern-cloud"),
    match("silverFernCloud", 2, 1, "SILVER_FERN_CLOUD"),
    match("silverFernCloud", 3, 1, "SilverFernCloud"),
    match("silverFernCloud", 4, 1, "silver fern cloud"),
    match("silverFernCloud", 5, 1, "silver.fern/cloud"),
  ]);
});

test("words joined by longer runs of separators are matched with the separators in the text", () => {
  const text = "harbor  --  lights\nharbor/**/lights\nharbor\tlights\nharbor::lights";
  assert.deepEqual(found(["harbor-lights"], text), [
    match("harbor-lights", 1, 1, "harbor  --  lights"),
    match("harbor-lights", 2, 1, "harbor/**/lights"),
    match("harbor-lights", 3, 1, "harbor\tlights"),
    match("harbor-lights", 4, 1, "harbor::lights"),
  ]);
});

test("any run of non-letter, non-digit characters within a line joins words", () => {
  const joined = "harbor !@#$%^&*()[]{}<>~`'\"\\|,;?+= lights";
  assert.deepEqual(found(["harbor-lights"], `x ${joined} y`), [
    match("harbor-lights", 1, 3, joined),
  ]);
});

test("uppercase runs followed by a capitalized word split before the capital", () => {
  const text = "HARBORLights\nharborLIGHTS\nHarborLIGHTS";
  assert.deepEqual(found(["harbor-lights"], text), [
    match("harbor-lights", 1, 1, "HARBORLights"),
    match("harbor-lights", 2, 1, "harborLIGHTS"),
    match("harbor-lights", 3, 1, "HarborLIGHTS"),
  ]);
});

test("acme is found inside identifiers at word boundaries only", () => {
  const line = "acmeOrders MyAcme ACMEOrders acmes pacme";
  assert.deepEqual(found(["acme"], line), [
    match("acme", 1, 1, "acme"),
    match("acme", 1, line.indexOf("MyAcme") + 3, "Acme"),
    match("acme", 1, line.indexOf("ACMEOrders") + 1, "ACME"),
  ]);
});

test("a one-word term is found at word boundaries inside other identifiers", () => {
  const text = [
    "xnimbus",
    "nimbusClient",
    "nimbuses",
    "getNimbus",
    "nimbus2",
    "NIMBUSConfig",
    "Nimbusy",
    "MY_NIMBUS_KEY",
  ].join("\n");
  assert.deepEqual(found(["nimbus"], text), [
    match("nimbus", 2, 1, "nimbus"),
    match("nimbus", 4, 4, "Nimbus"),
    match("nimbus", 6, 1, "NIMBUS"),
    match("nimbus", 8, 4, "NIMBUS"),
  ]);
});

test("a two-word term is found inside a longer identifier", () => {
  const text = "loadHarborLightsConfig();\n  get_harbor_lights_v2";
  assert.deepEqual(found(["harbor-lights"], text), [
    match("harbor-lights", 1, 5, "HarborLights"),
    match("harbor-lights", 2, 7, "harbor_lights"),
  ]);
});

test("harborlights written together is not a match for harbor-lights", () => {
  assert.deepEqual(found(["harbor-lights"], "harborlights"), []);
});

test("other single words that run the term's words together are not matches", () => {
  const text = [
    "HARBORLIGHTS",
    "Harborlights",
    "harbor1lights",
    "const harborlightsValue = 1;",
    "harbor lightship",
    "theharbor lights",
  ].join("\n");
  assert.deepEqual(found(["harbor-lights"], text), []);
});

test("an uppercase run before a lowercase letter splits before its last capital", () => {
  // "HARBORlights" is the words "HARBO" and "Rlights".
  assert.deepEqual(found(["harbor-lights"], "HARBORlights"), []);
});

test("another word between the term's words prevents a match", () => {
  assert.deepEqual(found(["harbor-lights"], "harbor_1_lights harbor big lights"), []);
});

test("a one-word term matches only that one word, not its parts written apart", () => {
  const text = "harborLights\nHARBORLIGHTS\nharbor-lights\nharborlights";
  assert.deepEqual(found(["harborlights"], text), [
    match("harborlights", 2, 1, "HARBORLIGHTS"),
    match("harborlights", 4, 1, "harborlights"),
  ]);
});

test("a term with a digit is one word with it, and a separated digit is another word", () => {
  const text = "Route66\nROUTE66_CONFIG\nroute-66\nroute66b";
  assert.deepEqual(found(["route66"], text), [
    match("route66", 1, 1, "Route66"),
    match("route66", 2, 1, "ROUTE66"),
  ]);
});

test("harbor at the end of a line and lights at the start of the next is not a match", () => {
  assert.deepEqual(found(["harbor-lights"], "const a = harbor\nlights = 2"), []);
});

test("no match is made across line breaks, with or without carriage returns", () => {
  const text = "Harbor  \n  Lights\nharbor_\r\nlights\nsilver fern\ncloud\nsilver\r\nfern cloud";
  assert.deepEqual(found(["harbor-lights", "silver-fern-cloud"], text), []);
});

test("a carriage return that does not end a line may join words", () => {
  assert.deepEqual(found(["harbor-lights"], "a harbor\rlights\n"), [
    match("harbor-lights", 1, 3, "harbor\rlights"),
  ]);
});

test("non-ASCII letters are part of words", () => {
  const text = "überharbor harborö\nüber-harbor\nÜberHarbor";
  assert.deepEqual(found(["harbor"], text), [
    match("harbor", 2, 6, "harbor"),
    match("harbor", 3, 5, "Harbor"),
  ]);
});

test("terms with non-ASCII letters are matched ignoring case", () => {
  const text = "ZÜRICH_BANK = zürichBank";
  assert.deepEqual(found(["Zürich Bank"], text), [
    match("Zürich Bank", 1, 1, "ZÜRICH_BANK"),
    match("Zürich Bank", 1, 15, "zürichBank"),
  ]);
});
