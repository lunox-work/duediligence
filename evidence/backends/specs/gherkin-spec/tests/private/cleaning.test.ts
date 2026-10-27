import { test } from "node:test";
import assert from "node:assert/strict";
import { generateFeatureFile } from "../../src/index.js";

// Extends public: "removes each specified list marker and collapses whitespace".
test("[boundary-1] cleans reordered markers with larger list numbers and varied whitespace", () => {
  const result = generateFeatureFile({
    key: "CLEAN-42", title: "\n Warehouse\t\t inventory\r\n checks\v ",
    criteria: [
      "\n[x]\tPacked\r\n items\t ship ",
      " \t28)\vReserved\f stock stays ",
      " \r[ ]\nManual\t review finishes ",
      "\v*\tDamaged\r\n stock waits ",
      " 103.\tReturned\f items arrive\n",
      "\t-\nBackordered\v items wait\r",
    ],
  });
  assert.equal(result.text,
    "Feature: Warehouse inventory checks\n" +
    "\n  Scenario: Packed items ship\n    Then packed items ship\n" +
    "\n  Scenario: Reserved stock stays\n    Then reserved stock stays\n" +
    "\n  Scenario: Manual review finishes\n    Then manual review finishes\n" +
    "\n  Scenario: Damaged stock waits\n    Then damaged stock waits\n" +
    "\n  Scenario: Returned items arrive\n    Then returned items arrive\n" +
    "\n  Scenario: Backordered items wait\n    Then backordered items wait\n");
});

// Extends public: "removes each specified list marker and collapses whitespace".
test("[boundary-1] collapses nonbreaking and em spaces as well as long whitespace runs", () => {
  const result = generateFeatureFile({
    key: "SPACE-6", title: "\u00a0Inventory\u2003\t report\u00a0",
    criteria: ["\u2003-\tWarehouse\u00a0\u2003stock\r\n\t\f\v is\u2003available\u00a0", `\n[ ] ${" \t\r\n".repeat(100)}Another${"\t ".repeat(80)}item ships\n`],
  });
  assert.equal(result.text,
    "Feature: Inventory report\n" +
    "\n  Scenario: Warehouse stock is available\n    Then warehouse stock is available\n" +
    "\n  Scenario: Another item ships\n    Then another item ships\n");
});

// Extends public: "removes a marker only once and leaves markers inside criteria intact".
test("[boundary-1] strips only the outer marker for every marker family", () => {
  const result = generateFeatureFile({
    key: "NEST-18", title: "Nested notation",
    criteria: ["[x] [ ] Cached record", "[ ] * Pending record", "27) 9. Numbered record", "48. - Reserved record", "* 36) Other record", "- [x] Completed record"],
  });
  assert.equal(result.text,
    "Feature: Nested notation\n" +
    "\n  Scenario: [ ] Cached record\n    Then [ ] Cached record\n" +
    "\n  Scenario: * Pending record\n    Then * Pending record\n" +
    "\n  Scenario: 9. Numbered record\n    Then 9. Numbered record\n" +
    "\n  Scenario: - Reserved record\n    Then - Reserved record\n" +
    "\n  Scenario: 36) Other record\n    Then 36) Other record\n" +
    "\n  Scenario: [x] Completed record\n    Then [x] Completed record\n");
});

// Extends public: "removes a marker only once and leaves markers inside criteria intact".
test("[boundary-1] retains all six kinds of marker in the middle and at the end of text", () => {
  const result = generateFeatureFile({
    key: "INLINE-20", title: "Inline notation",
    criteria: ["Store - * 12. 18) [ ] [x] as text", "Retain the final [x]", "Keep a final -"],
  });
  assert.equal(result.text,
    "Feature: Inline notation\n" +
    "\n  Scenario: Store - * 12. 18) [ ] [x] as text\n    Then store - * 12. 18) [ ] [x] as text\n" +
    "\n  Scenario: Retain the final [x]\n    Then retain the final [x]\n" +
    "\n  Scenario: Keep a final -\n    Then keep a final -\n");
});

// Extends public: "retains title list markers and cleans a criterion before detecting steps".
test("[boundary-1] retains every title marker including a title consisting only of a marker", () => {
  for (const title of ["* Warehouse", "12. Stock", "28) Review", "[ ] Pick list", "[x] Packed", "-", "*", "1.", "12)", "[ ]", "[x]"]) {
    const result = generateFeatureFile({ key: "TITLE-2", title: ` \t${title}\r\n`, criteria: ["Items ship"] });
    assert.equal(result.text, `Feature: ${title}\n\n  Scenario: Items ship\n    Then items ship\n`);
  }
});

// Extends public: "retains title list markers and cleans a criterion before detecting steps".
test("[boundary-1] detects When and Then steps only after removing other markers and whitespace", () => {
  const result = generateFeatureFile({
    key: "STEP9-43", title: "\t[x]\n Inventory\t routing\r",
    criteria: ["\n37. \t wHeN\n stock arrives\t tHeN\r it is counted\n aNd totals update", "\t[ ]\n tHeN\t stock remains\n bUt no shipment starts"],
  });
  assert.equal(result.text,
    "Feature: [x] Inventory routing\n" +
    "\n  Scenario: wHeN stock arrives tHeN it is counted aNd totals update\n    When stock arrives\n    Then it is counted\n    And totals update\n" +
    "\n  Scenario: tHeN stock remains bUt no shipment starts\n    Then stock remains\n    But no shipment starts\n");
});

// Extends public: "omits empty criteria before, between, and after real criteria".
test("[boundary-2] removes empty numbered and starred criteria without losing neighboring steps", () => {
  const result = generateFeatureFile({
    key: "EMPTY-19", title: "Inventory",
    criteria: ["37. \n", "* \t", "Given stock arrives Then count it", "\v", "82)\t", "API reports stock", "[x] \r\n", "- \n", "Last item ships", "\f\v", "[ ] \n"],
  });
  assert.equal(result.text,
    "Feature: Inventory\n" +
    "\n  Scenario: Given stock arrives Then count it\n    Given stock arrives\n    Then count it\n" +
    "\n  Scenario: API reports stock\n    Then API reports stock\n" +
    "\n  Scenario: Last item ships\n    Then last item ships\n");
});

// Extends public: "omits empty criteria before, between, and after real criteria"
// and "removes a marker only once and leaves markers inside criteria intact".
test("[boundary-2] keeps a criterion that becomes a single marker after one removal", () => {
  const result = generateFeatureFile({
    key: "ONCE-7", title: "Marker content", criteria: ["", "- -", "* *", "[x] [ ]", "1. 2)", "\t"],
  });
  assert.equal(result.text,
    "Feature: Marker content\n" +
    "\n  Scenario: -\n    Then -\n" +
    "\n  Scenario: *\n    Then *\n" +
    "\n  Scenario: [ ]\n    Then [ ]\n" +
    "\n  Scenario: 2)\n    Then 2)\n");
});

// Extends public: "suffixes repeated titles from the second occurrence without changing steps".
test("[boundary-2] numbers repeated titles through two-digit and three-digit suffixes", () => {
  const result = generateFeatureFile({ key: "REPEAT-105", title: "Repeated checks", criteria: Array.from({ length: 105 }, () => "API remains READY") });
  const expected = Array.from({ length: 105 }, (_, index) =>
    `\n  Scenario: API remains READY${index === 0 ? "" : ` (${index + 1})`}\n    Then API remains READY\n`).join("");
  assert.equal(result.text, `Feature: Repeated checks\n${expected}`);
});

// Extends public: "suffixes repeated titles from the second occurrence without changing steps".
test("[boundary-2] adds duplicate suffixes only to titles of multi-step criteria", () => {
  const criterion = "wHeN stock arrives tHeN count it bUt keep the HOLD";
  const result = generateFeatureFile({ key: "REPEAT-9", title: "Repeated workflow", criteria: [criterion, criterion, criterion] });
  assert.equal(result.text, "Feature: Repeated workflow\n" + ["", " (2)", " (3)"].map(suffix =>
    `\n  Scenario: ${criterion}${suffix}\n    When stock arrives\n    Then count it\n    But keep the HOLD\n`).join(""));
});

// Extends public: "counts duplicates after cleaning and maintains a separate count per title".
test("[boundary-2] counts three interleaved cleaned titles independently across larger lists", () => {
  const criteria: string[] = [];
  let expected = "Feature: Interleaved checks\n";
  for (let occurrence = 1; occurrence <= 24; occurrence++) {
    criteria.push("[x] API\t responds", "28) Given\n stock arrives Then count it", "- Reservation\t holds", "* \t");
    const suffix = occurrence === 1 ? "" : ` (${occurrence})`;
    expected += `\n  Scenario: API responds${suffix}\n    Then API responds\n`;
    expected += `\n  Scenario: Given stock arrives Then count it${suffix}\n    Given stock arrives\n    Then count it\n`;
    expected += `\n  Scenario: Reservation holds${suffix}\n    Then reservation holds\n`;
  }
  assert.equal(generateFeatureFile({ key: "COUNTS-24", title: "Interleaved checks", criteria }).text, expected);
});

// Extends public: "counts duplicates after cleaning and maintains a separate count per title".
test("[boundary-2] distinguishes title case even when resulting steps are identical", () => {
  const result = generateFeatureFile({
    key: "CASE-8", title: "Case-sensitive titles",
    criteria: ["Stock remains", "stock remains", "Given stock exists", "given stock exists", "* Stock remains", "[ ] given stock exists"],
  });
  assert.equal(result.text,
    "Feature: Case-sensitive titles\n" +
    "\n  Scenario: Stock remains\n    Then stock remains\n" +
    "\n  Scenario: stock remains\n    Then stock remains\n" +
    "\n  Scenario: Given stock exists\n    Given stock exists\n" +
    "\n  Scenario: given stock exists\n    Given stock exists\n" +
    "\n  Scenario: Stock remains (2)\n    Then stock remains\n" +
    "\n  Scenario: given stock exists (2)\n    Given stock exists\n");
});
