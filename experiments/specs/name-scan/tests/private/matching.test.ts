import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "../../src/index.js";

// Extends "each spelling of a term is a match": more case splits and joiners.
test("more spellings of a term are all found, whatever joins its words", () => {
  const lines = [
    "harbor::lights",
    "HarborLights",
    "HARBORLights",
    "harborLIGHTS",
    "harbor/lights",
    'harbor"lights',
    "harbor lights",
    "harbor—lights",
    "harbor\u{1F600}lights",
    "Harbor  ---  LIGHTS",
  ];
  const result = scan(["harbor-lights"], [{ path: "a.ts", text: lines.join("\n") }]);
  assert.deepEqual(
    result.matches,
    lines.map((text, i) => ({ path: "a.ts", term: "harbor-lights", line: i + 1, column: 1, text })),
  );
  assert.deepEqual(result.skipped, []);
});

// Extends "uppercase or capitalized words written together are one word":
// splits that do not yield the term's words in a row are not matches.
test("case splits that do not give the term's words are not matches", () => {
  const result = scan(
    ["harbor-lights"],
    [
      {
        path: "a.ts",
        text: "harborlIGHTS HARBORLIghts HARBORlights harborsLights harbor_lightsaber xharbor_lights harbor only",
      },
    ],
  );
  assert.deepEqual(result.matches, []);
});

// Extends "a term is found inside longer identifiers at word boundaries only".
test("terms are found deep inside a long identifier at its case boundaries", () => {
  const result = scan(
    ["harbor-lights", "acme orders"],
    [{ path: "a.ts", text: "getHarborLightsConfigForACMEOrdersV2" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "harbor-lights", line: 1, column: 4, text: "HarborLights" },
    { path: "a.ts", term: "acme orders", line: 1, column: 25, text: "ACMEOrders" },
  ]);
});

// Extends "a term is found inside longer identifiers at word boundaries only".
test("an uppercase run before a capitalized word splits before its last capital", () => {
  const result = scan(
    ["http-request", "acme"],
    [{ path: "a.ts", text: "XMLHttpRequest MyACMEOrders" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "http-request", line: 1, column: 4, text: "HttpRequest" },
    { path: "a.ts", term: "acme", line: 1, column: 18, text: "ACME" },
  ]);
});

// Extends "a term is found inside longer identifiers at word boundaries only".
test("a match may start and end in the middle of an identifier", () => {
  const result = scan(
    ["harbor lights"],
    [{ path: "a.ts", text: "xHarborLightsOut" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "harbor lights", line: 1, column: 2, text: "HarborLights" },
  ]);
});

// Extends "a digit or Unicode letter next to a term continues the word":
// letters of other scripts, including ones outside the BMP.
test("letters of any script continue a word", () => {
  const result = scan(
    ["acme"],
    [{ path: "a.ts", text: "acmeж жacme acme日本 日本acme acme\u{20000} ñacme acme_ж" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "acme", line: 1, column: 40, text: "acme" },
  ]);
});

// Extends "a digit or Unicode letter next to a term continues the word":
// a digit is not a lowercase letter, so a capital after it does not split.
test("a capital after a digit does not start a new word", () => {
  const result = scan(
    ["web3-labs", "orders"],
    [{ path: "a.ts", text: "v2Orders Web3Labs web3_labs WEB3-LABS" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "web3-labs", line: 1, column: 19, text: "web3_labs" },
    { path: "a.ts", term: "web3-labs", line: 1, column: 29, text: "WEB3-LABS" },
  ]);
});

// Extends "words written together with no boundary are one word" with
// non-ASCII lowercase and uppercase letters.
test("non-ASCII lowercase and uppercase letters split words too", () => {
  const result = scan(
    ["été harbor"],
    [{ path: "a.ts", text: "étéHarbor ÉTÉHarbor été-HARBOR étéharbor" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "été harbor", line: 1, column: 1, text: "étéHarbor" },
    { path: "a.ts", term: "été harbor", line: 1, column: 11, text: "ÉTÉHarbor" },
    { path: "a.ts", term: "été harbor", line: 1, column: 21, text: "été-HARBOR" },
  ]);
});

// Extends "each spelling of a term is a match" with non-ASCII case.
test("words with non-ASCII letters are compared ignoring case", () => {
  const result = scan(
    ["münchen-labs"],
    [{ path: "a.ts", text: "MÜNCHEN_LABS MünchenLabs" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "münchen-labs", line: 1, column: 1, text: "MÜNCHEN_LABS" },
    { path: "a.ts", term: "münchen-labs", line: 1, column: 14, text: "MünchenLabs" },
  ]);
});

// Extends "a match does not cross a CRLF line break": lines split only at
// "\n", so a lone "\r" is a character inside the line that joins words.
test("a lone carriage return inside a line joins words and does not end the line", () => {
  const result = scan(
    ["harbor-lights", "acme"],
    [{ path: "a.ts", text: "harbor\rlights\nacme\racme" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "harbor-lights", line: 1, column: 1, text: "harbor\rlights" },
    { path: "a.ts", term: "acme", line: 2, column: 1, text: "acme" },
    { path: "a.ts", term: "acme", line: 2, column: 6, text: "acme" },
  ]);
});

// Extends "a match does not cross a line break".
test("a match does not cross blank lines or lines of only spaces", () => {
  const result = scan(
    ["harbor-lights"],
    [{ path: "a.ts", text: "harbor\n\nlights\nharbor \n lights\nharbor\r\n\r\nlights\nharbor \r\n   \r\n  lights" }],
  );
  assert.deepEqual(result.matches, []);
});

// Extends "within a line any run of non-alphanumeric characters joins the words":
// a word in between, or the words in the other order, is not a match.
test("another word between the term's words breaks the match", () => {
  const result = scan(
    ["harbor-lights"],
    [{ path: "a.ts", text: "lights harbor; harbor x lights; harbor_2_lights; harbor lights" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "harbor-lights", line: 1, column: 50, text: "harbor lights" },
  ]);
});

// Extends "a term is found inside longer identifiers at word boundaries only":
// one term found many times on one line.
test("every occurrence of a term on a line is reported", () => {
  const result = scan(["acme"], [{ path: "a.ts", text: "acme acme-acme acmeAcme" }]);
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "acme", line: 1, column: 1, text: "acme" },
    { path: "a.ts", term: "acme", line: 1, column: 6, text: "acme" },
    { path: "a.ts", term: "acme", line: 1, column: 11, text: "acme" },
    { path: "a.ts", term: "acme", line: 1, column: 16, text: "acme" },
    { path: "a.ts", term: "acme", line: 1, column: 20, text: "Acme" },
  ]);
});
