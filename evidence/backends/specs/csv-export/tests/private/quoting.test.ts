import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequisitionsCsv, type Requisition } from "../../src/index.js";

const header = "\uFEFFRequisition ID,Title,Status,Openings,Filled,Created\r\n";

function record(title: string, id = "private-quote"): Requisition {
  return { id, title, status: "on_hold", openings: 17, filled: 9, createdAt: new Date("2028-08-09T06:00:00Z") };
}

function assertTitle(title: string, field: string): void {
  assert.equal(buildRequisitionsCsv([record(title)]), header + `private-quote,${field},On hold,17,9,2028-08-09\r\n`);
}

// Extends public: A comma in a title requires quotes.
test("[boundary-2] Commas at either edge and repeated empty CSV-looking fields stay inside one title", () => {
  for (const title of [",", ",,", ",Lead", "Lead,", ",Lead,,Team,"]) {
    assertTitle(title, `"${title}"`);
  }
});

// Extends public: Double quotes inside a quoted title are doubled.
test("[boundary-2] All consecutive and separated double quotes are escaped, including at the edges", () => {
  assertTitle('""Lead"" and "Team""', '"""""Lead"""" and ""Team"""""');
  assertTitle('a"b"c"d', '"a""b""c""d"');
});

// Extends public: An internal carriage return requires quotes and is preserved.
test("[boundary-2] Multiple internal carriage returns and a trailing carriage return remain verbatim", () => {
  assertTitle("A\rB\r\rC\r", '"A\rB\r\rC\r"');
});

// Extends public: An internal newline requires quotes and is preserved.
test("[boundary-2] Leading trailing and consecutive newlines are preserved without normalization", () => {
  assertTitle("\n\nA\nB\n\n", '"\n\nA\nB\n\n"');
  assertTitle("\n", '"\n"');
});

// Extends public: A leading space is preserved inside quotes.
test("[boundary-2] Multiple leading spaces are preserved without trimming", () => {
  assertTitle("    Coordinator", '"    Coordinator"');
  assertTitle("  東京", '"  東京"');
});

// Extends public: A trailing space is preserved inside quotes.
test("[boundary-2] Multiple trailing spaces and spaces at both edges are preserved", () => {
  assertTitle("Coordinator    ", '"Coordinator    "');
  assertTitle("   Coordinator    ", '"   Coordinator    "');
});

// Extends public: A single space title is quoted.
test("[boundary-2] Titles made of two or hundreds of spaces are not treated as missing titles", () => {
  for (const count of [2, 19, 512]) {
    assertTitle(" ".repeat(count), `"${" ".repeat(count)}"`);
  }
});

// Extends public: A title containing only one double quote is escaped and wrapped.
test("[boundary-2] Titles containing many double quotes double every one and add two wrapper quotes", () => {
  for (const count of [2, 3, 31, 300]) {
    assertTitle('"'.repeat(count), '"'.repeat(2 * count + 2));
  }
});

// Extends public: Combined comma quote and CRLF content is preserved in one field.
test("[boundary-2] A long multiline title escapes every repeated quote and preserves mixed line endings", () => {
  const unit = '東京, "Lead"\r\nSuite\nDesk\r';
  const escapedUnit = '東京, ""Lead""\r\nSuite\nDesk\r';
  assertTitle(`  ${unit.repeat(80)}  `, `"  ${escapedUnit.repeat(80)}  "`);
});

// Extends public: Plain Unicode text and internal spaces stay unquoted.
test("[boundary-2] Long Unicode titles preserve emoji combining marks and internal repeated spaces unquoted", () => {
  const title = "👩🏽‍💻 Développeuse  東京  e\u0301 Ω / 123 : ! ? # % & () [] {} ;".repeat(90);
  assertTitle(title, title);
});

// Extends public: An internal tab does not by itself require quotes.
test("[boundary-2] Several internal and trailing tabs alone do not trigger CSV quoting", () => {
  assertTitle("A\t\tB\tC\t", "A\t\tB\tC\t");
});

// Extends public: The quoting rule also protects a separator in an id.
test("[boundary-2] Ids quote multiple commas and double every embedded quote independently of the title", () => {
  assert.equal(buildRequisitionsCsv([record('Team,"West"', 'id,,"a""b",')]), header +
    '"id,,""a""""b"",","Team,""West""",On hold,17,9,2028-08-09\r\n');
});

// Extends public: The quoting rule also protects a separator in an id.
test("[boundary-2] Carriage returns newlines and edge spaces also require quoting in ids", () => {
  for (const id of ["id\rpart", "id\npart", "id\r\npart", " id", "id ", "  "]) {
    assert.equal(buildRequisitionsCsv([record("Plain title", id)]), header +
      `"${id}",Plain title,On hold,17,9,2028-08-09\r\n`);
  }
});

// Extends public: Combined comma quote and CRLF content is preserved in one field.
test("[boundary-2] Several differently quoted rows cannot be merged or split at their embedded line endings", () => {
  const rows = [
    record("Plain", "a"), record("B\r\nC", "b"), record('D"E', "c"),
    record("F,G", "d"), record(" H ", "e"), record("Last", "f"),
  ];
  assert.equal(buildRequisitionsCsv([...rows].reverse()), header +
    "a,Plain,On hold,17,9,2028-08-09\r\n" +
    'b,"B\r\nC",On hold,17,9,2028-08-09\r\n' +
    'c,"D""E",On hold,17,9,2028-08-09\r\n' +
    'd,"F,G",On hold,17,9,2028-08-09\r\n' +
    'e," H ",On hold,17,9,2028-08-09\r\n' +
    "f,Last,On hold,17,9,2028-08-09\r\n");
});
