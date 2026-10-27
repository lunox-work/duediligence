import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature, type Feature, type Step, type StepKeyword } from "../../src/index.js";

function feature(...lines: string[]): string {
  return lines.join("\n") + "\n";
}

function step(keyword: StepKeyword, text: string, line: number): Step {
  return { keyword, text, line, docString: null, table: null };
}

function scenarioSummary(f: Feature): { name: string; line: number; tags: string[] }[] {
  return f.scenarios.map((s) => ({ name: s.name, line: s.line, tags: s.tags }));
}

test("[happy-1] A typical file yields its name, background and scenarios", () => {
  const text = feature(
    "Feature: Checkout",
    "  Shoppers pay for what is in their basket.",
    "",
    "  Background:",
    "    Given a basket with 2 items",
    "",
    "  @happy @smoke",
    "  Scenario: Pay by card",
    "    When the shopper pays by card",
    "    Then the order is placed",
    "",
    "  Scenario: Empty basket",
    "    Given an empty basket",
    "    * the shopper pays",
  );
  assert.deepEqual(parseFeature(text), {
    name: "Checkout",
    background: [step("Given", "a basket with 2 items", 5)],
    scenarios: [
      {
        name: "Pay by card",
        line: 8,
        tags: ["@happy", "@smoke"],
        steps: [step("When", "the shopper pays by card", 9), step("Then", "the order is placed", 10)],
      },
      {
        name: "Empty basket",
        line: 12,
        tags: [],
        steps: [step("Given", "an empty basket", 13), step("*", "the shopper pays", 14)],
      },
    ],
  });
});

test("[happy-1] boundary: background steps are not copied into a scenario without steps", () => {
  const text = "Feature: F\nBackground:\nGiven b\nScenario: S\n";
  assert.deepEqual(parseFeature(text), {
    name: "F",
    background: [step("Given", "b", 3)],
    scenarios: [{ name: "S", line: 4, tags: [], steps: [] }],
  });
});

test("[boundary-1] A file with only a Feature line", () => {
  assert.deepEqual(parseFeature("Feature: Lonely\n"), { name: "Lonely", background: null, scenarios: [] });
});

test("[boundary-1] boundary: an empty-named Feature line without a final newline", () => {
  assert.deepEqual(parseFeature("Feature:"), { name: "", background: null, scenarios: [] });
});

test("[boundary-2] An empty Background and a Scenario without steps", () => {
  assert.deepEqual(parseFeature("Feature: F\nBackground:\nScenario: S\n"), {
    name: "F",
    background: [],
    scenarios: [{ name: "S", line: 3, tags: [], steps: [] }],
  });
});

test("[boundary-2] boundary: a named empty Background followed by blank and comment lines", () => {
  assert.deepEqual(parseFeature("Feature: F\nBackground: ignored name\n\n# c\nScenario: S\n"), {
    name: "F",
    background: [],
    scenarios: [{ name: "S", line: 5, tags: [], steps: [] }],
  });
});

test("[happy-4] Names are trimmed and may be empty", () => {
  const result = parseFeature("  Feature:   Checkout # v2  \n\tScenario:Pay\t\n  Example:\n");
  assert.equal(result.name, "Checkout # v2");
  assert.deepEqual(scenarioSummary(result), [
    { name: "Pay", line: 2, tags: [] },
    { name: "", line: 3, tags: [] },
  ]);
});

test("[happy-4] boundary: names of only whitespace are empty", () => {
  const result = parseFeature("Feature:\t\nScenario:   \n");
  assert.equal(result.name, "");
  assert.deepEqual(scenarioSummary(result), [{ name: "", line: 2, tags: [] }]);
});

test("[happy-5] Example is a synonym of Scenario", () => {
  const result = parseFeature("Feature: F\nExample: E\n  Given x\nScenario: S\n");
  assert.deepEqual(scenarioSummary(result), [
    { name: "E", line: 2, tags: [] },
    { name: "S", line: 4, tags: [] },
  ]);
});

test("[happy-5] boundary: a tagged Example with an empty name", () => {
  assert.deepEqual(parseFeature("Feature: F\n@t\nExample:\n").scenarios, [
    { name: "", line: 3, tags: ["@t"], steps: [] },
  ]);
});

test("[happy-6] Scenarios under rules are flattened in file order", () => {
  const text = feature(
    "Feature: F",
    "",
    "  Background:",
    "    Given shared",
    "",
    "  Scenario: Before rules",
    "    Given a",
    "",
    "  Rule: First rule",
    "    Free text describing the rule.",
    "    | ignored | too |",
    "",
    "    Scenario: In first rule",
    "      Given b",
    "",
    "  Rule: Second rule",
    "",
    "    Example: In second rule",
    "      Given c",
  );
  const result = parseFeature(text);
  assert.deepEqual(result.background, [step("Given", "shared", 4)]);
  assert.deepEqual(scenarioSummary(result), [
    { name: "Before rules", line: 6, tags: [] },
    { name: "In first rule", line: 13, tags: [] },
    { name: "In second rule", line: 18, tags: [] },
  ]);
  const inFirstRule = result.scenarios.find((s) => s.name === "In first rule");
  assert.deepEqual(inFirstRule?.steps, [step("Given", "b", 14)]);
});

test("[happy-6] boundary: consecutive Rule lines, one without a name, before the first scenario", () => {
  assert.deepEqual(parseFeature("Feature: F\nRule:\nRule: R2\nScenario: S\nGiven x\n"), {
    name: "F",
    background: null,
    scenarios: [{ name: "S", line: 4, tags: [], steps: [step("Given", "x", 5)] }],
  });
});

test("[boundary-4] Description text is ignored, even when it looks like a table or doc string", () => {
  const text = feature(
    "Feature: F",
    "  As a user",
    "  | not a table |",
    '  """',
    "  Examples: not special here",
    "  Given-ish text is fine",
    "",
    "  Scenario: S",
  );
  assert.deepEqual(scenarioSummary(parseFeature(text)), [{ name: "S", line: 8, tags: [] }]);
});

test("[boundary-4] boundary: Rule description with a delimiter line and a malformed row is ignored", () => {
  const text = "Feature: F\nRule: R\n```\nsome text\n| a\nScenario: S\n";
  assert.deepEqual(scenarioSummary(parseFeature(text)), [{ name: "S", line: 6, tags: [] }]);
});

test("[boundary-7] Results of separate calls are independent", () => {
  const text = "Feature: F\nScenario: S\nGiven x\n";
  const first = parseFeature(text);
  const second = parseFeature(text);
  assert.deepEqual(first, second);
  first.scenarios[0].steps.length = 0;
  assert.equal(second.scenarios[0].steps.length, 1);
});

test("[boundary-7] boundary: nested tables and lists are not shared between calls", () => {
  const text = "Feature: F\nBackground:\nGiven t\n| a |\nScenario: S\n";
  const first = parseFeature(text);
  const second = parseFeature(text);
  first.background?.[0].table?.[0].push("changed");
  first.background?.push(step("Given", "extra", 99));
  first.scenarios.length = 0;
  assert.deepEqual(second, {
    name: "F",
    background: [{ keyword: "Given", text: "t", line: 3, docString: null, table: [["a"]] }],
    scenarios: [{ name: "S", line: 5, tags: [], steps: [] }],
  });
});
