import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature } from "../../src/index.js";

test("[boundary-2] a file with only Feature: Empty parses with no scenarios and no background", () => {
  assert.deepEqual(parseFeature("Feature: Empty\n"), {
    name: "Empty",
    background: null,
    scenarios: [],
  });
});

test("[boundary-2] an empty feature with no final newline, a description, comments and CRLF blank lines is valid", () => {
  const text = ["Feature: Empty", "  Nothing to see here.", "", "  # just a comment", ""].join("\r\n");

  assert.deepEqual(parseFeature(text), {
    name: "Empty",
    background: null,
    scenarios: [],
  });
  assert.deepEqual(parseFeature("Feature: Empty"), {
    name: "Empty",
    background: null,
    scenarios: [],
  });
});
