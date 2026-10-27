import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature } from "../../src/index.js";
import type { Scenario, Step, StepKeyword } from "../../src/index.js";

function step(keyword: StepKeyword, text: string, line: number): Step {
  return { keyword, text, line, docString: null, table: null };
}

// Extends public "returns feature, scenarios and every step keyword in file order".
test("[happy-1] preserves a longer file with repeated keywords in noncanonical order", () => {
  const lines = ["Feature: Reconciliation: café 東京"];
  const expected: Scenario[] = [];
  const keywords: StepKeyword[] = ["*", "But", "And", "Then", "When", "Given", "Given", "*", "And"];
  for (let i = 0; i < 12; i++) {
    lines.push("", `\tScenario: Batch ${i}`);
    const scenario: Scenario = { name: `Batch ${i}`, line: lines.length, tags: [], steps: [] };
    for (let j = 0; j < keywords.length; j++) {
      const text = `entry ${i}/${j}: #literal @value`;
      lines.push(` \t${keywords[j]} ${text}`);
      scenario.steps.push(step(keywords[j], text, lines.length));
    }
    expected.push(scenario);
  }
  assert.deepEqual(parseFeature(lines.join("\n")), {
    name: "Reconciliation: café 東京", background: null, scenarios: expected,
  });
});

// Extends public "returns feature, scenarios and every step keyword in file order".
test("[happy-1] keeps duplicate scenario names and identical steps as distinct entries", () => {
  assert.deepEqual(parseFeature([
    "Feature: Repeated names", "Scenario: Same", "Then repeat", "Then repeat",
    "Scenario: Same", "Then repeat", "Scenario: Same", "Then repeat", "Then repeat",
  ].join("\n")), {
    name: "Repeated names", background: null,
    scenarios: [
      { name: "Same", line: 2, tags: [], steps: [step("Then", "repeat", 3), step("Then", "repeat", 4)] },
      { name: "Same", line: 5, tags: [], steps: [step("Then", "repeat", 6)] },
      { name: "Same", line: 7, tags: [], steps: [step("Then", "repeat", 8), step("Then", "repeat", 9)] },
    ],
  });
});

// Extends public "handles CRLF, mixed leading whitespace and no final newline".
test("[happy-1] removes exactly one separator space for every keyword with CRLF", () => {
  const keywords: StepKeyword[] = ["But", "And", "When", "Then", "*", "Given"];
  const texts = ["  retain leading spaces  ", "\tkeep this tab\t", "東京: café", "# text @tag", "Feature: literal", "Scenario: literal"];
  const lines = [" \t Feature: Whitespace", "\t \tScenario: All separators"];
  for (let i = 0; i < keywords.length; i++) {
    lines.push(`\t  \t${keywords[i]} ${texts[i]}`);
  }
  assert.deepEqual(parseFeature(lines.join("\r\n")), {
    name: "Whitespace", background: null,
    scenarios: [{
      name: "All separators", line: 2, tags: [],
      steps: keywords.map((keyword, i) => step(keyword, texts[i], i + 3)),
    }],
  });
});

// Extends public "handles CRLF, mixed leading whitespace and no final newline".
test("[happy-1] counts physical lines across alternating LF and CRLF endings", () => {
  const lines = [
    "", " \tFeature: Mixed endings", "\t", "\tScenario: One", "\tGiven first",
    "", "\t# skipped", "  Then second", "Scenario: Two", "* final",
  ];
  const source = lines.map((line, i) => line + (i === lines.length - 1 ? "" : i % 2 ? "\n" : "\r\n")).join("");
  assert.deepEqual(parseFeature(source), {
    name: "Mixed endings", background: null,
    scenarios: [
      { name: "One", line: 4, tags: [], steps: [step("Given", "first", 5), step("Then", "second", 8)] },
      { name: "Two", line: 9, tags: [], steps: [step("*", "final", 10)] },
    ],
  });
});

// Extends public "skips descriptions, comments and blanks while assigning tags".
test("[happy-2] skips long descriptions and syntax-looking comments without losing positions", () => {
  const lines = ["\t# Feature: not a header", "", "Feature: Notes"];
  for (let i = 0; i < 40; i++) lines.push(`  Description ${i} mentions Given, Scenario: and @markers.`);
  lines.push("\t# Scenario: not a scenario", "  @audit @nightly", "\t# @notATag", " \t", "Scenario: Read notes");
  const scenarioLine = lines.length;
  lines.push("\t# Given not a step", "\tGiven real content", "", "\t# Feature: not a duplicate", "Then finish", "# tail");
  assert.deepEqual(parseFeature(lines.join("\r\n")), {
    name: "Notes", background: null,
    scenarios: [{
      name: "Read notes", line: scenarioLine, tags: ["@audit", "@nightly"],
      steps: [step("Given", "real content", scenarioLine + 2), step("Then", "finish", scenarioLine + 5)],
    }],
  });
});

// Extends public "accumulates tag lines for only the next scenario across comments and blanks".
test("[happy-2] assigns many separate tag groups to successive scenarios and resets each group", () => {
  const lines = ["Feature: Tag groups"];
  const expected: Scenario[] = [];
  for (let i = 0; i < 9; i++) {
    const tags: string[] = [];
    if (i % 3 !== 2) {
      for (let j = 0; j < 4; j++) {
        const pair = [`@group-${i}-${j}`, `@other-${i}-${j}`];
        tags.push(...pair);
        lines.push(` \t${pair.join(" ")}`, "\t# @ignored", " \t");
      }
    }
    lines.push(`Scenario: Case ${i}`);
    const scenarioLine = lines.length;
    lines.push(`Given case ${i} # @inline`, "# after steps");
    expected.push({
      name: `Case ${i}`, line: scenarioLine, tags,
      steps: [step("Given", `case ${i} # @inline`, scenarioLine + 1)],
    });
  }
  assert.deepEqual(parseFeature(lines.join("\n")).scenarios, expected);
});

// Extends public "returns background steps separately from both scenarios".
test("[happy-3] returns every background keyword once and separates many local scenarios", () => {
  const lines = ["Feature: Shared environment", "A description.", "Background:"];
  const keywords: StepKeyword[] = ["When", "*", "Then", "But", "Given", "And", "Given", "But"];
  const background: Step[] = [];
  for (const keyword of keywords) {
    const text = `shared ${lines.length}`;
    lines.push(`\t${keyword} ${text}`);
    background.push(step(keyword, text, lines.length));
  }
  const scenarios: Scenario[] = [];
  for (let i = 0; i < 6; i++) {
    lines.push(`Scenario: Local ${i}`);
    const line = lines.length;
    lines.push(`When local ${i}`, `Then verified ${i}`);
    scenarios.push({ name: `Local ${i}`, line, tags: [], steps: [step("When", `local ${i}`, line + 1), step("Then", `verified ${i}`, line + 2)] });
  }
  assert.deepEqual(parseFeature(lines.join("\n")), { name: "Shared environment", background, scenarios });
});

// Extends public "ends an indented background at an immediately following tagged scenario".
test("[happy-3] ends background across multiple tag lines and never adds later steps to it", () => {
  assert.deepEqual(parseFeature([
    "Feature: Tagged setup", " \tBackground:", "\tGiven common", " \t", "\t# shared comment",
    "\tBut common exception", "\t@first @slow", "# tag comment", "\t@database", "\t",
    "\tScenario: First", "\tThen first result", "@second", "Scenario: Second", "* second result",
    "Scenario: Third", "And third result",
  ].join("\r\n")), {
    name: "Tagged setup",
    background: [step("Given", "common", 3), step("But", "common exception", 6)],
    scenarios: [
      { name: "First", line: 11, tags: ["@first", "@slow", "@database"], steps: [step("Then", "first result", 12)] },
      { name: "Second", line: 14, tags: ["@second"], steps: [step("*", "second result", 15)] },
      { name: "Third", line: 16, tags: [], steps: [step("And", "third result", 17)] },
    ],
  });
});
