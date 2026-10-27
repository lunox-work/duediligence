import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequisitionsCsv, type Requisition } from "../../src/index.js";

function csvForTitle(title: string): string {
  const record: Requisition = {
    id: "req-quote",
    title,
    status: "open",
    openings: 1,
    filled: 0,
    createdAt: new Date("2025-06-15T12:00:00.000Z"),
  };
  return buildRequisitionsCsv([record]);
}

function expectedCsv(titleField: string): string {
  return "\uFEFFRequisition ID,Title,Status,Openings,Filled,Created\r\n" +
    `req-quote,${titleField},Open,1,0,2025-06-15\r\n`;
}

test("[boundary-2] A comma in a title requires quotes", () => {
  assert.equal(csvForTitle("Engineer, Senior"), expectedCsv('"Engineer, Senior"'));
});

test("[boundary-2] Double quotes inside a quoted title are doubled", () => {
  assert.equal(csvForTitle('The "Lead"'), expectedCsv('"The ""Lead"""'));
});

test("[boundary-2] An internal carriage return requires quotes and is preserved", () => {
  assert.equal(csvForTitle("Line\rTwo"), expectedCsv('"Line\rTwo"'));
});

test("[boundary-2] An internal newline requires quotes and is preserved", () => {
  assert.equal(csvForTitle("Line\nTwo"), expectedCsv('"Line\nTwo"'));
});

test("[boundary-2] A leading space is preserved inside quotes", () => {
  assert.equal(csvForTitle(" Engineer"), expectedCsv('" Engineer"'));
});

test("[boundary-2] A trailing space is preserved inside quotes", () => {
  assert.equal(csvForTitle("Engineer "), expectedCsv('"Engineer "'));
});

test("[boundary-2] A single space title is quoted", () => {
  assert.equal(csvForTitle(" "), expectedCsv('" "'));
});

test("[boundary-2] A title containing only one double quote is escaped and wrapped", () => {
  assert.equal(csvForTitle('"'), expectedCsv('""""'));
});

test("[boundary-2] Combined comma quote and CRLF content is preserved in one field", () => {
  assert.equal(csvForTitle(' Lead, "Team"\r\nNext '), expectedCsv('" Lead, ""Team""\r\nNext "'));
});

test("[boundary-2] Plain Unicode text and internal spaces stay unquoted", () => {
  assert.equal(csvForTitle("Ingénieur 東京"), expectedCsv("Ingénieur 東京"));
});

test("[boundary-2] An internal tab does not by itself require quotes", () => {
  assert.equal(csvForTitle("Lead\tEngineer"), expectedCsv("Lead\tEngineer"));
});

test("[boundary-2] The quoting rule also protects a separator in an id", () => {
  assert.equal(
    buildRequisitionsCsv([{
      id: 'req,"one"',
      title: "Engineer",
      status: "open",
      openings: 1,
      filled: 0,
      createdAt: new Date("2025-06-15T12:00:00.000Z"),
    }]),
    "\uFEFFRequisition ID,Title,Status,Openings,Filled,Created\r\n" +
      '"req,""one""",Engineer,Open,1,0,2025-06-15\r\n',
  );
});
