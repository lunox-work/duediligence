import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature } from "../../src/index.js";

// Extends public "[boundary-2] a file with only Feature: Empty parses with no scenarios and no background":
// a CRLF ending.
test("[boundary-2] Feature: Empty with a CRLF ending parses with no scenarios and no background", () => {
  assert.deepEqual(parseFeature("Feature: Empty\r\n"), {
    name: "Empty",
    background: null,
    scenarios: [],
  });
});

// Extends public "[boundary-2] a file with only Feature: Empty ...": another name, so an implementation
// that recognises only the literal "Feature: Empty" fails.
test("[boundary-2] an empty feature with another name keeps that name", () => {
  assert.deepEqual(parseFeature("Feature: Nothing here yet\n"), {
    name: "Nothing here yet",
    background: null,
    scenarios: [],
  });
});

// Extends public "[boundary-2] an empty feature with no final newline, a description, comments and CRLF blank lines is valid":
// leading blank lines, an indented Feature: line and trailing blank lines.
test("[boundary-2] an indented empty feature between blank lines is valid", () => {
  assert.deepEqual(parseFeature("\n\n\t  Feature: Empty\n\n\n"), {
    name: "Empty",
    background: null,
    scenarios: [],
  });
});

// Extends public "[boundary-2] an empty feature with ... a description, comments ...": a longer
// description whose lines mention the keywords without being keyword lines.
test("[boundary-2] an empty feature with a long description and comments has no scenarios", () => {
  const text = [
    "Feature: Empty",
    "  This feature has no Scenarios yet.",
    "  Backgrounds will come later.",
    "",
    "\tIn time, it will grow.",
    "  # Scenario: commented out",
    "  # @wip",
    "",
  ].join("\n");

  assert.deepEqual(parseFeature(text), { name: "Empty", background: null, scenarios: [] });
});
