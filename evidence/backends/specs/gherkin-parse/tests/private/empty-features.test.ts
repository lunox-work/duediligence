import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature } from "../../src/index.js";

// Extends public "parses the feature-only input with no scenarios or background".
test("[boundary-2] accepts different feature-only names and a final line ending", () => {
  for (const name of ["Inventory", "Résumé 東京", "Reports: October", "A".repeat(300)]) {
    for (const ending of ["", "\n", "\r\n"]) {
      assert.deepEqual(parseFeature(`\t Feature: ${name}${ending}`), {
        name, background: null, scenarios: [],
      });
    }
  }
});

// Extends public "keeps a feature empty when surrounded by blanks, comments and description".
test("[boundary-2] skips a long description and many blank and comment lines through EOF", () => {
  const lines = ["", "\t", "\t# preliminary", "Feature: Documentation only"];
  for (let i = 0; i < 80; i++) {
    lines.push(`  Paragraph ${i} mentions the words Scenario: and Background:.`, "\t# @ignored", " \t");
  }
  lines.push("# Feature: not another feature", "", "");
  assert.deepEqual(parseFeature(lines.join("\r\n")), {
    name: "Documentation only", background: null, scenarios: [],
  });
});

// Extends public "parses the feature-only input with no scenarios or background".
test("[boundary-2] parsing an empty feature after populated files does not reuse their state", () => {
  const populated = parseFeature([
    "Feature: Previous", "Background:", "Given setup", "@old", "Scenario: Old", "Then old result",
  ].join("\n"));
  assert.equal(populated.scenarios.length, 1);
  assert.deepEqual(parseFeature("Feature: Fresh\n"), { name: "Fresh", background: null, scenarios: [] });
  assert.deepEqual(parseFeature("Feature: Another"), { name: "Another", background: null, scenarios: [] });
  assert.equal(populated.name, "Previous");
  assert.deepEqual(populated.scenarios[0].tags, ["@old"]);
});
