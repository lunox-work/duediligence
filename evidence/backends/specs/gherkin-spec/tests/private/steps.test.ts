import { test } from "node:test";
import assert from "node:assert/strict";
import { generateFeatureFile } from "../../src/index.js";

// Extends public: "makes one Then step and lowercases only the first character".
test("[happy-2] preserves every later character in long mixed-case unstructured criteria", () => {
  const criteria = [
    "Warehouse RETAINS the SKU and HTTP status While ALL other DATA stays UNCHANGED",
    "MixedCASE values KEEP Their Original Capitalization",
    "lowerCASE remains as Written",
  ];
  const steps = [
    "warehouse RETAINS the SKU and HTTP status While ALL other DATA stays UNCHANGED",
    "mixedCASE values KEEP Their Original Capitalization",
    "lowerCASE remains as Written",
  ];
  const result = generateFeatureFile({ key: "TEXT-88", title: "Case retention", criteria });
  assert.equal(result.text, "Feature: Case retention\n" + criteria.map((criterion, index) =>
    `\n  Scenario: ${criterion}\n    Then ${steps[index]}\n`).join(""));
});

// Extends public: "makes one Then step and lowercases only the first character".
test("[happy-2] lowercases ordinary non-ASCII initial letters without altering the rest", () => {
  const result = generateFeatureFile({ key: "LANG-19", title: "International labels", criteria: ["Éclair is READY", "Öffnet the Gate", "Ñandú stays HERE"] });
  assert.equal(result.text,
    "Feature: International labels\n" +
    "\n  Scenario: Éclair is READY\n    Then éclair is READY\n" +
    "\n  Scenario: Öffnet the Gate\n    Then öffnet the Gate\n" +
    "\n  Scenario: Ñandú stays HERE\n    Then ñandú stays HERE\n");
});

// Extends public: "preserves initial acronyms and words containing digits".
test("[happy-2] preserves unfamiliar acronyms and digits anywhere in the initial word", () => {
  const criteria = ["ID matches", "OK", "HTTP responds", "XMLHTTP succeeds", "Q7 responds", "Check9 succeeds", "Rout9ing works", "A1", "7items arrive", "A123456789Z stays"];
  const result = generateFeatureFile({ key: "WORDS-76", title: "Initial word rules", criteria });
  assert.equal(result.text, "Feature: Initial word rules\n" + criteria.map(criterion =>
    `\n  Scenario: ${criterion}\n    Then ${criterion}\n`).join(""));
});

// Extends public: "preserves initial acronyms and words containing digits".
test("[happy-2] limits acronym and digit exceptions to the first word", () => {
  const result = generateFeatureFile({ key: "WORDS-77", title: "Later words", criteria: ["Ready API 2FA", "A 7digit CODE", "Retry 123 times", "Http status is OK", "Api serves v2"] });
  assert.equal(result.text,
    "Feature: Later words\n" +
    "\n  Scenario: Ready API 2FA\n    Then ready API 2FA\n" +
    "\n  Scenario: A 7digit CODE\n    Then a 7digit CODE\n" +
    "\n  Scenario: Retry 123 times\n    Then retry 123 times\n" +
    "\n  Scenario: Http status is OK\n    Then http status is OK\n" +
    "\n  Scenario: Api serves v2\n    Then api serves v2\n");
});

// Extends public: "lowercases a single uppercase letter because it is not an acronym".
test("[happy-2] handles other single-letter criteria and single-letter first words", () => {
  const result = generateFeatureFile({ key: "LETTER-3", title: "Single letters", criteria: ["I", "Z", "B is READY", "Q remains Q"] });
  assert.equal(result.text,
    "Feature: Single letters\n" +
    "\n  Scenario: I\n    Then i\n" +
    "\n  Scenario: Z\n    Then z\n" +
    "\n  Scenario: B is READY\n    Then b is READY\n" +
    "\n  Scenario: Q remains Q\n    Then q remains Q\n");
});

// Extends public: "does not split criteria starting with And, But, or a keyword prefix".
test("[happy-2] leaves mixed-case And and But criteria whole despite many later keywords", () => {
  const result = generateFeatureFile({
    key: "PLAIN-12", title: "Plain conjunctions",
    criteria: ["aNd stock Given it arrives When counted Then reserve it But wait", "bUt stock Then remains And the Given value stays"],
  });
  assert.equal(result.text,
    "Feature: Plain conjunctions\n" +
    "\n  Scenario: aNd stock Given it arrives When counted Then reserve it But wait\n    Then aNd stock Given it arrives When counted Then reserve it But wait\n" +
    "\n  Scenario: bUt stock Then remains And the Given value stays\n    Then bUt stock Then remains And the Given value stays\n");
});

// Extends public: "does not split criteria starting with And, But, or a keyword prefix".
test("[happy-2] requires an exact initial keyword rather than any of its longer prefixes", () => {
  const pairs = [
    ["Whenever stock arrives Then reserve it", "whenever stock arrives Then reserve it"],
    ["Thenable objects When resolved And ready", "thenable objects When resolved And ready"],
    ["Givenness is tested Given a value Then assert it", "givenness is tested Given a value Then assert it"],
    ["Given2 stock When counted Then reserve it", "Given2 stock When counted Then reserve it"],
    ["Inventory Given stock When received Then reserve it", "inventory Given stock When received Then reserve it"],
  ];
  const result = generateFeatureFile({ key: "PREFIX-4", title: "Initial words", criteria: pairs.map(([criterion]) => criterion) });
  assert.equal(result.text, "Feature: Initial words\n" + pairs.map(([criterion, step]) =>
    `\n  Scenario: ${criterion}\n    Then ${step}\n`).join(""));
});

// Extends public: "splits the example into four steps while retaining the whole scenario title".
test("[happy-3] retains a long criterion as title and splits six substantive steps", () => {
  const criterion = "Given a warehouse has a reserved item And the carrier has accepted the route When dispatch confirms the shipment Then the tracking number is recorded And the customer receives the tracking number But no second reservation is created";
  const result = generateFeatureFile({ key: "FLOW-81", title: "Dispatch workflow", criteria: [criterion] });
  assert.equal(result.text, `Feature: Dispatch workflow\n\n  Scenario: ${criterion}\n` +
    "    Given a warehouse has a reserved item\n" +
    "    And the carrier has accepted the route\n" +
    "    When dispatch confirms the shipment\n" +
    "    Then the tracking number is recorded\n" +
    "    And the customer receives the tracking number\n" +
    "    But no second reservation is created\n");
});

// Extends public: "recognizes all five keywords without regard to case and capitalizes each keyword".
test("[happy-3] splits repeated keywords in arbitrary order without recasing step bodies", () => {
  const criterion = "tHeN READY stays READY gIvEn an API responds bUt HOLD stays HOLD wHeN a JOB runs aNd UTC remains UTC gIvEn another API responds tHeN FINAL stays FINAL";
  const result = generateFeatureFile({ key: "FLOW-82", title: "Keyword order", criteria: [criterion] });
  assert.equal(result.text, `Feature: Keyword order\n\n  Scenario: ${criterion}\n` +
    "    Then READY stays READY\n" +
    "    Given an API responds\n" +
    "    But HOLD stays HOLD\n" +
    "    When a JOB runs\n" +
    "    And UTC remains UTC\n" +
    "    Given another API responds\n" +
    "    Then FINAL stays FINAL\n");
});

// Extends public: "recognizes all five keywords without regard to case and capitalizes each keyword".
test("[happy-3] splits a long chain at every occurrence including repeated Given and But", () => {
  const keywordCases = [["gIVEN", "Given"], ["AND", "And"], ["bUT", "But"], ["WHEN", "When"], ["given", "Given"], ["then", "Then"], ["BUT", "But"]];
  const clauses = Array.from({ length: 175 }, (_, index) => {
    const [inputKeyword, outputKeyword] = keywordCases[index % keywordCases.length];
    return { input: `${inputKeyword} payload ${index} stays READY`, output: `${outputKeyword} payload ${index} stays READY` };
  });
  const criterion = clauses.map(clause => clause.input).join(" ");
  const result = generateFeatureFile({ key: "CHAIN-175", title: "Long workflow", criteria: [criterion] });
  assert.equal(result.text, `Feature: Long workflow\n\n  Scenario: ${criterion}\n` + clauses.map(clause => `    ${clause.output}\n`).join(""));
});

// Extends public: "leaves keyword substrings within words intact".
test("[happy-3] ignores keyword substrings at both ends and in the middle of words", () => {
  const criterion = "Given regiven GIVENNESS whenwhen somewhere thence band candy rebut BUTTER And elsewhere remains Then reGiven whenEVER someTHEN andAND butBUT remain";
  const result = generateFeatureFile({ key: "WORDS-83", title: "Whole words", criteria: [criterion] });
  assert.equal(result.text, `Feature: Whole words\n\n  Scenario: ${criterion}\n` +
    "    Given regiven GIVENNESS whenwhen somewhere thence band candy rebut BUTTER\n" +
    "    And elsewhere remains\n" +
    "    Then reGiven whenEVER someTHEN andAND butBUT remain\n");
});

// Extends public: "accepts When or Then as the initial keyword".
test("[happy-3] preserves single-step Given When and Then criteria while normalizing keywords", () => {
  const result = generateFeatureFile({
    key: "SINGLE-84", title: "Single explicit steps",
    criteria: ["wHEN READY stock arrives", "thEN API responds", "giVEN UTC is configured"],
  });
  assert.equal(result.text,
    "Feature: Single explicit steps\n" +
    "\n  Scenario: wHEN READY stock arrives\n    When READY stock arrives\n" +
    "\n  Scenario: thEN API responds\n    Then API responds\n" +
    "\n  Scenario: giVEN UTC is configured\n    Given UTC is configured\n");
});

// Extends public: "accepts When or Then as the initial keyword".
test("[happy-3] handles When and Then starts with later Given When And and But clauses", () => {
  const result = generateFeatureFile({
    key: "INITIAL-85", title: "Alternative starts",
    criteria: ["WHEN dispatch runs BUT no stock exists GIVEN a HOLD remains THEN stop", "THEN stock stays WHEN a HOLD exists AND inventory is counted BUT dispatch waits"],
  });
  assert.equal(result.text,
    "Feature: Alternative starts\n" +
    "\n  Scenario: WHEN dispatch runs BUT no stock exists GIVEN a HOLD remains THEN stop\n    When dispatch runs\n    But no stock exists\n    Given a HOLD remains\n    Then stop\n" +
    "\n  Scenario: THEN stock stays WHEN a HOLD exists AND inventory is counted BUT dispatch waits\n    Then stock stays\n    When a HOLD exists\n    And inventory is counted\n    But dispatch waits\n");
});

test("[happy-1] mixes cleaned explicit steps and ordinary criteria in one fixed-layout feature", () => {
  const result = generateFeatureFile({
    key: "MIX9-86", title: " \n Mixed\t acceptance\r criteria ",
    criteria: [" [x] Given\t READY stock When counted Then reserve it ", "", "* API\n responds", "14) Then dispatch waits But no HOLD changes", "- A\t receipt is printed"],
  });
  assert.equal(result.path, ".spec/MIX9-86.feature");
  assert.equal(result.text,
    "Feature: Mixed acceptance criteria\n" +
    "\n  Scenario: Given READY stock When counted Then reserve it\n    Given READY stock\n    When counted\n    Then reserve it\n" +
    "\n  Scenario: API responds\n    Then API responds\n" +
    "\n  Scenario: Then dispatch waits But no HOLD changes\n    Then dispatch waits\n    But no HOLD changes\n" +
    "\n  Scenario: A receipt is printed\n    Then a receipt is printed\n");
});
