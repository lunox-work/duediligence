import { test } from "node:test";
import assert from "node:assert/strict";
import { generateFeatureFile } from "../../src/index.js";

// Extends public: "generates the exact two-criterion feature and path".
test("[happy-1] lays out six distinct criteria in their supplied order", () => {
  const result = generateFeatureFile({
    key: "SHIP9-8204",
    title: "Release shipment holds",
    criteria: ["Zebra shipments wait", "Archived shipments stay archived", "Manual holds persist", "Carrier responds", "Budget remains", "Delivery completes"],
  });
  assert.equal(result.path, ".spec/SHIP9-8204.feature");
  assert.equal(result.text,
    "Feature: Release shipment holds\n" +
    "\n  Scenario: Zebra shipments wait\n    Then zebra shipments wait\n" +
    "\n  Scenario: Archived shipments stay archived\n    Then archived shipments stay archived\n" +
    "\n  Scenario: Manual holds persist\n    Then manual holds persist\n" +
    "\n  Scenario: Carrier responds\n    Then carrier responds\n" +
    "\n  Scenario: Budget remains\n    Then budget remains\n" +
    "\n  Scenario: Delivery completes\n    Then delivery completes\n");
});

// Extends public: "generates the exact two-criterion feature and path".
test("[happy-1] emits every criterion in a large ticket without truncating or sorting", () => {
  const numbers = Array.from({ length: 137 }, (_, index) => 137 - index);
  const result = generateFeatureFile({
    key: "LOAD-137",
    title: "Many independent checks",
    criteria: numbers.map(number => `Check ${number} completes`),
  });
  assert.equal(result.path, ".spec/LOAD-137.feature");
  assert.equal(result.text, "Feature: Many independent checks\n" + numbers.map(number =>
    `\n  Scenario: Check ${number} completes\n    Then check ${number} completes\n`).join(""));
});

// Extends public: "handles one criterion and valid keys at the format boundaries".
test("[happy-1] accepts other single-letter keys and arbitrarily long valid key parts", () => {
  const keys = ["Z-9", "B0-0000", "X9Y8Z7-9876543210", `Q${"A9".repeat(50)}-${"0123456789".repeat(12)}`];
  for (const key of keys) {
    const result = generateFeatureFile({ key, title: "Queue receipt", criteria: ["Receipt appears"] });
    assert.equal(result.path, `.spec/${key}.feature`);
    assert.equal(result.text, "Feature: Queue receipt\n\n  Scenario: Receipt appears\n    Then receipt appears\n");
  }
});

// Extends public: "generates the exact two-criterion feature and path".
test("[happy-1] generates successive tickets independently including reversed criteria", () => {
  for (const [key, criteria, body] of [
    ["ORDER-71", ["Second item", "First item"], "\n  Scenario: Second item\n    Then second item\n\n  Scenario: First item\n    Then first item\n"],
    ["ORDER-72", ["First item", "Second item"], "\n  Scenario: First item\n    Then first item\n\n  Scenario: Second item\n    Then second item\n"],
    ["OTHER-0", ["First item"], "\n  Scenario: First item\n    Then first item\n"],
  ] as const) {
    const result = generateFeatureFile({ key, title: "Ordering", criteria: [...criteria] });
    assert.equal(result.path, `.spec/${key}.feature`);
    assert.equal(result.text, `Feature: Ordering\n${body}`);
  }
});

// Extends public: "generates the exact TODO feature for an empty criteria list".
test("[unhappy-1] interpolates each new key and title into an empty-ticket feature", () => {
  for (const [key, title] of [["AUDIT8-0007", "Review inventory"], ["Z-9", "Notify warehouse staff"]]) {
    const result = generateFeatureFile({ key, title, criteria: [] });
    assert.equal(result.path, `.spec/${key}.feature`);
    assert.equal(result.text, `Feature: ${title}\n\n  # TODO: ${key} has no acceptance criteria yet.\n`);
  }
});

// Extends public: "uses the cleaned title and actual key when all criteria clean to empty".
test("[unhappy-1] treats multi-digit marker-only criteria as empty and retains a title marker", () => {
  const result = generateFeatureFile({
    key: "DRAFT9-008",
    title: " \n[ ]\t Inventory\r review \t",
    criteria: ["12. \t", "438)\r\n", "\t*\t", " - \n", "[x]\t", "[ ]\r", "\v\f  "],
  });
  assert.equal(result.path, ".spec/DRAFT9-008.feature");
  assert.equal(result.text, "Feature: [ ] Inventory review\n\n  # TODO: DRAFT9-008 has no acceptance criteria yet.\n");
});

// Extends public: "uses the cleaned title and actual key when all criteria clean to empty".
test("[unhappy-1] produces a TODO after filtering hundreds of whitespace-only criteria", () => {
  const result = generateFeatureFile({
    key: "BLANK-240", title: "\n\t Blank\f ticket\r\n",
    criteria: Array.from({ length: 240 }, (_, index) => ["", " \t\n", "* \r\n", "[ ]\t", "22) \n"][index % 5]),
  });
  assert.equal(result.text, "Feature: Blank ticket\n\n  # TODO: BLANK-240 has no acceptance criteria yet.\n");
  assert.equal(result.path, ".spec/BLANK-240.feature");
});

function assertInvalidKey(key: string, criteria: string[]): void {
  assert.throws(() => generateFeatureFile({ key, title: "Valid inventory title", criteria }), (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    assert.ok(message.includes(key) || message.includes(JSON.stringify(key)), `Error must name ${JSON.stringify(key)}: ${message}`);
    return true;
  });
}

// Extends public: "rejects the specified malformed keys and names each key in its error".
test("[unhappy-2] rejects mixed-case prefixes and nondecimal suffixes of other lengths", () => {
  for (const key of ["a-0", "PaY9-123456", "ABCd-42", "Q-abc", "TEST-123456789Z", "X-0x12", "X-1.5", "X-+7", "X--7"]) {
    assertInvalidKey(key, ["Item is ready"]);
  }
});

// Extends public: "rejects keys with invalid starts, missing parts, or surrounding characters".
test("[unhappy-2] rejects embedded separators whitespace punctuation and a nonliteral dash", () => {
  for (const key of ["0ABC-4", "A-B-12", "A B-12", "A\tB-12", "AB-1 2", "AB-1\n2", "AB-12/3", "AB.-12", "AB_9-12", "AB–12"]) {
    assertInvalidKey(key, []);
  }
});

// Extends public: "rejects keys with invalid starts, missing parts, or surrounding characters".
test("[unhappy-2] refuses an entirely missing key with an error identifying the empty key", () => {
  assert.throws(() => generateFeatureFile({ key: "", title: "Unassigned inventory", criteria: ["Stock is counted"] }), (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    // Empty keys may be named by the field, described as empty, or quoted.
    assert.match(message, /key|identifier|empty|""|''|``/i);
    return true;
  });
});

// Extends public: "rejects keys with invalid starts, missing parts, or surrounding characters".
test("[unhappy-2] requires the entire key to match even with terminal line breaks or valid substrings", () => {
  for (const key of ["\nZX-42", "ZX-42\r", "ZX-42\r\n", "ZX-42\n\n", "\tZX-42", "ZX-42\t", ".spec/ZX-42", "ZX-42.feature", "ZX-42/../Q-1"]) {
    assertInvalidKey(key, ["Valid criterion"]);
  }
});

// Extends public: "rejects an empty title with an error saying the title is empty".
test("[unhappy-2] rejects a literally empty title with a populated ticket under a different key", () => {
  assert.throws(() => generateFeatureFile({ key: "VALID8-992", title: "", criteria: ["First check", "Second check", "Third check"] }), (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    assert.match(message, /title/i);
    assert.match(message, /empty/i);
    return true;
  });
});

// Extends public: "rejects a title that becomes empty after cleaning even without criteria".
test("[unhappy-2] rejects whitespace-only titles for both empty and nonempty criteria", () => {
  for (const title of ["\n", "\t\t", "\r\n \r", "\f\v\t  \n", "\u00a0\u2003 "]) {
    for (const criteria of [[], ["Available stock"]]) {
      assert.throws(() => generateFeatureFile({ key: "STOCK-81", title, criteria }), (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        assert.match(message, /title/i);
        assert.match(message, /empty/i);
        return true;
      });
    }
  }
});
