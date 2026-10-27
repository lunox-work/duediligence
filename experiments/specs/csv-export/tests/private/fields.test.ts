import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequisitionsCsv, type Requisition } from "../../src/index.js";

const BOM = "﻿";
const HEADER = "Requisition ID,Title,Status,Openings,Filled,Created\r\n";

function req(overrides: Partial<Requisition> = {}): Requisition {
  return {
    id: "REQ-1",
    title: "Engineer",
    status: "open",
    openings: 3,
    filled: 1,
    createdAt: new Date("2026-01-15T10:00:00.000Z"),
    ...overrides,
  };
}

/** The CSV with the byte order mark and header row checked and removed. */
function body(csv: string): string {
  assert.ok(csv.startsWith(BOM + HEADER), `expected BOM and header, got ${JSON.stringify(csv)}`);
  return csv.slice((BOM + HEADER).length);
}

/** The single data row written for a requisition with this title. */
function titleRow(title: string | null | undefined): string {
  return body(buildRequisitionsCsv([req({ title })]));
}

/** The row expected for the default requisition with this title field. */
function row(field: string): string {
  return `REQ-1,${field},Open,3,1,2026-01-15\r\n`;
}

// Rule: Fields are quoted when they must be

// Extends "[boundary-2] a title holding a comma or a double quote is quoted, with inner quotes doubled":
// replacing only the first double quote gets these wrong.
test("[boundary-2] every double quote is doubled, including adjacent and trailing ones", () => {
  assert.equal(titleRow('a""b'), row('"a""""b"'));
  assert.equal(titleRow('""'), row('""""""'));
  assert.equal(titleRow('Size 5"'), row('"Size 5"""'));
  assert.equal(titleRow('"Lead"'), row('"""Lead"""'));
  assert.equal(titleRow('He said "hi", then "bye"'), row('"He said ""hi"", then ""bye"""'));
});

// Extends "[boundary-2] a title holding a comma or a double quote is quoted, with inner quotes doubled".
test("[boundary-2] a comma at the start, at the end or alone forces quotes", () => {
  assert.equal(titleRow(",Ops"), row('",Ops"'));
  assert.equal(titleRow("Ops,"), row('"Ops,"'));
  assert.equal(titleRow(","), row('","'));
  assert.equal(titleRow("a,b,c,d"), row('"a,b,c,d"'));
});

// Extends "[boundary-2] line breaks and edge spaces force quotes; inner spaces alone do not".
test("[boundary-2] CRLF, a lone line break and trailing line breaks are kept inside quotes", () => {
  assert.equal(titleRow("Line\r\nTwo"), row('"Line\r\nTwo"'));
  assert.equal(titleRow("\n"), row('"\n"'));
  assert.equal(titleRow("Driver\n"), row('"Driver\n"'));
  assert.equal(titleRow("Driver\r"), row('"Driver\r"'));
  assert.equal(titleRow("One\nTwo\nThree"), row('"One\nTwo\nThree"'));
});

// Extends "[boundary-2] line breaks and edge spaces force quotes; inner spaces alone do not".
test("[boundary-2] titles of spaces only, or with spaces at both edges, are quoted", () => {
  assert.equal(titleRow(" "), row('" "'));
  assert.equal(titleRow("   "), row('"   "'));
  assert.equal(titleRow(" Night Nurse "), row('" Night Nurse "'));
  assert.equal(titleRow("  Driver"), row('"  Driver"'));
});

// Extends "[boundary-2] a title holding a comma or a double quote is quoted, with inner quotes doubled":
// several reasons to quote at once still give one pair of quotes.
test("[boundary-2] a title with several separators is wrapped once and its quotes doubled", () => {
  assert.equal(titleRow(' a,"b"\nc '), row('" a,""b""\nc "'));
  assert.equal(titleRow('x,\r\n"y"'), row('"x,\r\n""y"""'));
});

// Extends "[boundary-2] line breaks and edge spaces force quotes; inner spaces alone do not":
// characters outside the listed separators need no quotes.
test("[boundary-2] a title needing no quotes is written as it is, whatever else it holds", () => {
  assert.equal(titleRow("a\tb"), row("a\tb"));
  assert.equal(titleRow("O'Brien"), row("O'Brien"));
  assert.equal(titleRow("R&D; Ops/QA"), row("R&D; Ops/QA"));
  assert.equal(titleRow("Café Barista ☕"), row("Café Barista ☕"));
  assert.equal(titleRow("x|y"), row("x|y"));
  assert.equal(titleRow("Trailing tab\t"), row("Trailing tab\t"));
  assert.equal(titleRow("Senior  Staff   Engineer"), row("Senior  Staff   Engineer"));
});

// Extends "[boundary-2] line breaks and edge spaces force quotes; inner spaces alone do not".
test("[boundary-2] an empty title is an empty field without quotes", () => {
  assert.equal(titleRow(""), row(""));
});

// Extends both "[boundary-2]" public tests: quoting in a multi-row file touches only the fields that need it.
test("[boundary-2] in a file of several rows only the titles that need quotes are quoted", () => {
  const csv = buildRequisitionsCsv([
    req({ id: "REQ-1", title: "Plain", createdAt: new Date("2026-02-01T00:00:00.000Z") }),
    req({ id: "REQ-2", title: "Has, comma", createdAt: new Date("2026-02-02T00:00:00.000Z") }),
    req({ id: "REQ-3", title: "Also plain", createdAt: new Date("2026-02-03T00:00:00.000Z") }),
    req({ id: "REQ-4", title: 'Has "quote"', createdAt: new Date("2026-02-04T00:00:00.000Z") }),
    req({ id: "REQ-5", title: "Has\nbreak", createdAt: new Date("2026-02-05T00:00:00.000Z") }),
  ]);
  assert.equal(
    body(csv),
    "REQ-1,Plain,Open,3,1,2026-02-01\r\n" +
      'REQ-2,"Has, comma",Open,3,1,2026-02-02\r\n' +
      "REQ-3,Also plain,Open,3,1,2026-02-03\r\n" +
      'REQ-4,"Has ""quote""",Open,3,1,2026-02-04\r\n' +
      'REQ-5,"Has\nbreak",Open,3,1,2026-02-05\r\n',
  );
});

// Rule: A cell never runs as a formula

// Extends "[unhappy-1] a title starting with a formula character gets a leading single quote":
// each character alone, and a title that looks like a negative number.
test("[unhappy-1] a title that is only a formula character, or a negative number, is defused", () => {
  assert.equal(titleRow("="), row("'="));
  assert.equal(titleRow("+"), row("'+"));
  assert.equal(titleRow("-"), row("'-"));
  assert.equal(titleRow("@"), row("'@"));
  assert.equal(titleRow("\t"), row("'\t"));
  assert.equal(titleRow("\r"), row("\"'\r\""));
  assert.equal(titleRow("-1"), row("'-1"));
  assert.equal(titleRow("+44 20 7946 0000"), row("'+44 20 7946 0000"));
});

// Extends "[unhappy-1] a title starting with a formula character gets a leading single quote".
test("[unhappy-1] only the first character is checked: repeated or later formula characters add one quote", () => {
  assert.equal(titleRow("==1"), row("'==1"));
  assert.equal(titleRow("--x"), row("'--x"));
  assert.equal(titleRow("-=+@"), row("'-=+@"));
  assert.equal(titleRow("x-y+z@w="), row("x-y+z@w="));
  assert.equal(titleRow("Pay = 10 + 2"), row("Pay = 10 + 2"));
  assert.equal(titleRow("name@example.com"), row("name@example.com"));
});

// Extends "[unhappy-1] a title starting with a formula character gets a leading single quote":
// an implementation that defuses more than the listed characters gets these wrong.
test("[unhappy-1] a title starting with a character outside the list is not defused", () => {
  assert.equal(titleRow("'Quoted"), row("'Quoted"));
  assert.equal(titleRow("|cmd"), row("|cmd"));
  assert.equal(titleRow("%TEMP%"), row("%TEMP%"));
  assert.equal(titleRow("#1 Pick"), row("#1 Pick"));
  assert.equal(titleRow("\nNext"), row('"\nNext"'));
  assert.equal(titleRow("1+1"), row("1+1"));
});

// Extends "[unhappy-1] the quoting rule applies to the defused field": a defused title ending in a space.
test("[unhappy-1] a defused title ending in a space is quoted after the single quote is added", () => {
  assert.equal(titleRow("=x "), row("\"'=x \""));
  assert.equal(titleRow("+ "), row("\"'+ \""));
  assert.equal(titleRow("\tTabbed "), row("\"'\tTabbed \""));
});

// Extends "[unhappy-1] the quoting rule applies to the defused field": other formula characters with
// other separators.
test("[unhappy-1] a defused title holding a line break, comma or double quote is quoted", () => {
  assert.equal(titleRow("@a\nb"), row("\"'@a\nb\""));
  assert.equal(titleRow('+"q"'), row("\"'+\"\"q\"\"\""));
  assert.equal(titleRow('\t"x"'), row("\"'\t\"\"x\"\"\""));
  assert.equal(titleRow("-1,000"), row("\"'-1,000\""));
  assert.equal(titleRow("\r\nX"), row("\"'\r\nX\""));
  assert.equal(titleRow('=CMD|"/C calc"!A0'), row("\"'=CMD|\"\"/C calc\"\"!A0\""));
});

// Extends "[unhappy-1] the quoting rule applies to the defused field": a leading space comes first,
// so the formula character after it is not the first character.
test("[unhappy-1] a formula character after a leading space is not defused", () => {
  assert.equal(titleRow(" -1"), row('" -1"'));
  assert.equal(titleRow(" @x"), row('" @x"'));
  assert.equal(titleRow(" +1 "), row('" +1 "'));
});

// Extends both "[unhappy-1]" public tests: every row is defused on its own.
test("[unhappy-1] each formula title in a file of several rows is defused", () => {
  const csv = buildRequisitionsCsv([
    req({ id: "REQ-1", title: "=A1", createdAt: new Date("2026-02-01T00:00:00.000Z") }),
    req({ id: "REQ-2", title: "Safe", createdAt: new Date("2026-02-02T00:00:00.000Z") }),
    req({ id: "REQ-3", title: "+B2", createdAt: new Date("2026-02-03T00:00:00.000Z") }),
    req({ id: "REQ-4", title: "-C3", createdAt: new Date("2026-02-04T00:00:00.000Z") }),
    req({ id: "REQ-5", title: "@D4", createdAt: new Date("2026-02-05T00:00:00.000Z") }),
    req({ id: "REQ-6", title: "=E5,F6", createdAt: new Date("2026-02-06T00:00:00.000Z") }),
  ]);
  assert.equal(
    body(csv),
    "REQ-1,'=A1,Open,3,1,2026-02-01\r\n" +
      "REQ-2,Safe,Open,3,1,2026-02-02\r\n" +
      "REQ-3,'+B2,Open,3,1,2026-02-03\r\n" +
      "REQ-4,'-C3,Open,3,1,2026-02-04\r\n" +
      "REQ-5,'@D4,Open,3,1,2026-02-05\r\n" +
      "REQ-6,\"'=E5,F6\",Open,3,1,2026-02-06\r\n",
  );
});
