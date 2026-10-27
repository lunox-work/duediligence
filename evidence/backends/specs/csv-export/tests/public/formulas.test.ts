import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequisitionsCsv } from "../../src/index.js";

function csvForTitle(title: string): string {
  return buildRequisitionsCsv([{
    id: "req-formula",
    title,
    status: "open",
    openings: 1,
    filled: 0,
    createdAt: new Date("2025-06-15T12:00:00.000Z"),
  }]);
}

function expectedCsv(titleField: string): string {
  return "\uFEFFRequisition ID,Title,Status,Openings,Filled,Created\r\n" +
    `req-formula,${titleField},Open,1,0,2025-06-15\r\n`;
}

test("[unhappy-1] A leading equals sign is prefixed with an apostrophe", () => {
  assert.equal(csvForTitle("=1+1"), expectedCsv("'=1+1"));
});

test("[unhappy-1] A leading plus sign is prefixed with an apostrophe", () => {
  assert.equal(csvForTitle("+1"), expectedCsv("'+1"));
});

test("[unhappy-1] A leading minus sign is prefixed with an apostrophe", () => {
  assert.equal(csvForTitle("-1"), expectedCsv("'-1"));
});

test("[unhappy-1] A leading at sign is prefixed with an apostrophe", () => {
  assert.equal(csvForTitle("@SUM(A1)"), expectedCsv("'@SUM(A1)"));
});

test("[unhappy-1] A leading tab is prefixed with an apostrophe", () => {
  assert.equal(csvForTitle("\tEngineer"), expectedCsv("'\tEngineer"));
});

test("[unhappy-1] A leading carriage return is defused and then CSV quoted", () => {
  assert.equal(csvForTitle("\rEngineer"), expectedCsv('"\'\rEngineer"'));
});

test("[unhappy-1] A title consisting of just a formula marker is defused", () => {
  assert.equal(csvForTitle("="), expectedCsv("'="));
});

test("[unhappy-1] A lone tab is defused without adding CSV quotes", () => {
  assert.equal(csvForTitle("\t"), expectedCsv("'\t"));
});

test("[unhappy-1] A formula title with commas and quotes is defused before escaping", () => {
  assert.equal(csvForTitle('=IF(1,"yes","no")'), expectedCsv('"\'=IF(1,""yes"",""no"")"'));
});

test("[unhappy-1] Equals signs and other markers after an ordinary first character are unchanged", () => {
  assert.equal(csvForTitle("a=b+1-2@x"), expectedCsv("a=b+1-2@x"));
});

test("[unhappy-1] A leading space is quoted but does not expose the later equals sign to defusing", () => {
  assert.equal(csvForTitle(" =1"), expectedCsv('" =1"'));
});

test("[unhappy-1] An existing apostrophe is preserved without a second apostrophe", () => {
  assert.equal(csvForTitle("'=1"), expectedCsv("'=1"));
});

test("[unhappy-1] A leading newline is quoted without formula defusing", () => {
  assert.equal(csvForTitle("\n=1"), expectedCsv('"\n=1"'));
});
