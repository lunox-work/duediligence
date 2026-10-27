import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "../../src/index.js";

test("[happy-1] finds all four spellings of a multiword term", () => {
  assert.deepEqual(scan(["harbor-lights"], [{
    path: "notes.txt",
    text: "harborLights\nHARBOR_LIGHTS\nharbor.lights\nHarbor Lights",
  }]), {
    matches: [
      { path: "notes.txt", term: "harbor-lights", line: 1, column: 1, text: "harborLights" },
      { path: "notes.txt", term: "harbor-lights", line: 2, column: 1, text: "HARBOR_LIGHTS" },
      { path: "notes.txt", term: "harbor-lights", line: 3, column: 1, text: "harbor.lights" },
      { path: "notes.txt", term: "harbor-lights", line: 4, column: 1, text: "Harbor Lights" },
    ],
    skipped: [],
  });
});

test("[happy-1] recognizes Unicode letters and case across spelling variants", () => {
  assert.deepEqual(scan(["Étoile-Bleue"], [{
    path: "notes.txt",
    text: "étoileBleue\nÉTOILE_BLEUE\nÉtoile Bleue\nétoile...bleue",
  }]).matches, [
    { path: "notes.txt", term: "Étoile-Bleue", line: 1, column: 1, text: "étoileBleue" },
    { path: "notes.txt", term: "Étoile-Bleue", line: 2, column: 1, text: "ÉTOILE_BLEUE" },
    { path: "notes.txt", term: "Étoile-Bleue", line: 3, column: 1, text: "Étoile Bleue" },
    { path: "notes.txt", term: "Étoile-Bleue", line: 4, column: 1, text: "étoile...bleue" },
  ]);
});

test("[happy-2] finds identifier words including acronym boundaries but rejects substrings", () => {
  assert.deepEqual(scan(["acme"], [{
    path: "notes.txt",
    text: "acmeOrders\nMyAcme\nACMEOrders\nacmes\npacme",
  }]).matches, [
    { path: "notes.txt", term: "acme", line: 1, column: 1, text: "acme" },
    { path: "notes.txt", term: "acme", line: 2, column: 3, text: "Acme" },
    { path: "notes.txt", term: "acme", line: 3, column: 1, text: "ACME" },
  ]);
});

test("[happy-2] applies Unicode case boundaries while digits stay in their word", () => {
  assert.deepEqual(scan(["café", "acme"], [{
    path: "notes.txt",
    text: "caféOrders\nMyCafé\nCAFÉOrders\ncafé2\nacme1\n1acme\nacme",
  }]).matches, [
    { path: "notes.txt", term: "café", line: 1, column: 1, text: "café" },
    { path: "notes.txt", term: "café", line: 2, column: 3, text: "Café" },
    { path: "notes.txt", term: "café", line: 3, column: 1, text: "CAFÉ" },
    { path: "notes.txt", term: "acme", line: 7, column: 1, text: "acme" },
  ]);
});

test("[boundary-1] does not split a fused lowercase spelling into term words", () => {
  assert.deepEqual(scan(["harbor-lights"], [{ path: "notes.txt", text: "harborlights" }]), {
    matches: [],
    skipped: [],
  });
});

test("[boundary-1] distinguishes fused spellings from a neighboring camel-case spelling", () => {
  assert.deepEqual(scan(["harbor-lights"], [{
    path: "notes.txt",
    text: "harborlights harborLights harborlights",
  }]).matches, [
    { path: "notes.txt", term: "harbor-lights", line: 1, column: 14, text: "harborLights" },
  ]);
});

test("[boundary-2] does not join words across an LF line break", () => {
  assert.deepEqual(scan(["harbor-lights"], [{ path: "notes.txt", text: "harbor\nlights" }]), {
    matches: [],
    skipped: [],
  });
});

test("[boundary-2] does not join CRLF lines and still scans a complete term on the next line", () => {
  assert.deepEqual(scan(["harbor-lights"], [{
    path: "notes.txt",
    text: "harbor\r\nlights\r\nharbor-lights\r\n",
  }]).matches, [
    { path: "notes.txt", term: "harbor-lights", line: 3, column: 1, text: "harbor-lights" },
  ]);
});

test("[boundary-2] permits runs of nonword characters within a line but not intervening digits", () => {
  assert.deepEqual(scan(["harbor-lights"], [{
    path: "notes.txt",
    text: "harbor\t.../💡--lights\nharbor7lights\nharbor 7 lights",
  }]).matches, [
    { path: "notes.txt", term: "harbor-lights", line: 1, column: 1, text: "harbor\t.../💡--lights" },
  ]);
});
