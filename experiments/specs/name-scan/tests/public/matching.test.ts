import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "../../src/index.js";

test("each spelling of a term is a match", () => {
  const result = scan(
    ["harbor-lights"],
    [
      {
        path: "a.ts",
        text: "harborLights\nHARBOR_LIGHTS\nharbor.lights\nHarbor Lights\n",
      },
    ],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "harbor-lights", line: 1, column: 1, text: "harborLights" },
    { path: "a.ts", term: "harbor-lights", line: 2, column: 1, text: "HARBOR_LIGHTS" },
    { path: "a.ts", term: "harbor-lights", line: 3, column: 1, text: "harbor.lights" },
    { path: "a.ts", term: "harbor-lights", line: 4, column: 1, text: "Harbor Lights" },
  ]);
  assert.deepEqual(result.skipped, []);
});

test("a term given in another spelling is the same sequence of words", () => {
  const result = scan(
    ["Harbor Lights"],
    [{ path: "a.ts", text: "const harbor_lights = 1;" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "Harbor Lights", line: 1, column: 7, text: "harbor_lights" },
  ]);
});

test("a term is found inside longer identifiers at word boundaries only", () => {
  const result = scan(
    ["acme"],
    [{ path: "a.ts", text: "acmeOrders MyAcme ACMEOrders acmes pacme" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "acme", line: 1, column: 1, text: "acme" },
    { path: "a.ts", term: "acme", line: 1, column: 14, text: "Acme" },
    { path: "a.ts", term: "acme", line: 1, column: 19, text: "ACME" },
  ]);
});

test("a digit or Unicode letter next to a term continues the word", () => {
  const result = scan(
    ["acme"],
    [{ path: "a.ts", text: "acme2 x2acme acmeé acme_2" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "acme", line: 1, column: 20, text: "acme" },
  ]);
});

test("words written together with no boundary are one word", () => {
  const result = scan(
    ["harbor-lights"],
    [{ path: "a.ts", text: "const harborlights = 1;" }],
  );
  assert.deepEqual(result.matches, []);
});

test("uppercase or capitalized words written together are one word", () => {
  const result = scan(
    ["harbor-lights"],
    [{ path: "a.ts", text: "HARBORLIGHTS Harborlights" }],
  );
  assert.deepEqual(result.matches, []);
});

test("a match does not cross a line break", () => {
  const result = scan(
    ["harbor-lights"],
    [{ path: "a.ts", text: "export const harbor\nlights = 1;" }],
  );
  assert.deepEqual(result.matches, []);
});

test("a match does not cross a CRLF line break", () => {
  const result = scan(
    ["harbor-lights"],
    [{ path: "a.ts", text: "harbor\r\nlights" }],
  );
  assert.deepEqual(result.matches, []);
});

test("within a line any run of non-alphanumeric characters joins the words", () => {
  const result = scan(
    ["harbor-lights"],
    [{ path: "a.ts", text: "harbor -- // lights\nharbor\t\tlights" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "harbor-lights", line: 1, column: 1, text: "harbor -- // lights" },
    { path: "a.ts", term: "harbor-lights", line: 2, column: 1, text: "harbor\t\tlights" },
  ]);
});
