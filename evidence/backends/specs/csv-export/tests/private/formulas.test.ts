import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequisitionsCsv, type Requisition } from "../../src/index.js";

const header = "\uFEFFRequisition ID,Title,Status,Openings,Filled,Created\r\n";

function record(title: string, id = "private-formula"): Requisition {
  return { id, title, status: "cancelled", openings: 12, filled: 4, createdAt: new Date("2031-11-07T23:45:00Z") };
}

function assertTitle(title: string, field: string): void {
  assert.equal(buildRequisitionsCsv([record(title)]), header +
    `private-formula,${field},Cancelled,12,4,2031-11-07\r\n`);
}

// Extends public: A leading equals sign is prefixed with an apostrophe.
test("[unhappy-1] An equals prefix is defused for text and repeated operators as well as arithmetic", () => {
  assertTitle("=東京", "'=東京");
  assertTitle("===A1", "'===A1");
});

// Extends public: A leading plus sign is prefixed with an apostrophe.
test("[unhappy-1] A plus prefix is defused for words and before a quoted CSV separator", () => {
  assertTitle("+Coordinator", "'+Coordinator");
  assertTitle('+SUM(1,2)+"x"', '"\'+SUM(1,2)+""x"""');
});

// Extends public: A leading minus sign is prefixed with an apostrophe.
test("[unhappy-1] A minus prefix is defused for nonnumeric titles and a multiline title", () => {
  assertTitle("-Coordinator", "'-Coordinator");
  assertTitle("-A\r\nB", '"\'-A\r\nB"');
});

// Extends public: A leading at sign is prefixed with an apostrophe.
test("[unhappy-1] An at prefix is defused for ordinary handles and quoted function arguments", () => {
  assertTitle("@team", "'@team");
  assertTitle('@IF(A1,"x","y")', '"\'@IF(A1,""x"",""y"")"');
});

// Extends public: A leading tab is prefixed with an apostrophe.
test("[unhappy-1] Leading tabs are retained after exactly one apostrophe and then escaped as needed", () => {
  assertTitle("\t\t=SUM(A1)", "'\t\t=SUM(A1)");
  assertTitle('\t"A",B', '"\'\t""A"",B"');
});

// Extends public: A leading carriage return is defused and then CSV quoted.
test("[unhappy-1] Leading CRLF and repeated carriage returns are defused without stripping line endings", () => {
  assertTitle("\r\n=SUM(A1)", '"\'\r\n=SUM(A1)"');
  assertTitle('\r\r"A",B', '"\'\r\r""A"",B"');
});

// Extends public: A title consisting of just a formula marker is defused.
test("[unhappy-1] Lone plus minus at and carriage return markers are each defused", () => {
  assertTitle("+", "'+");
  assertTitle("-", "'-");
  assertTitle("@", "'@");
  assertTitle("\r", '"\'\r"');
});

// Extends public: A lone tab is defused without adding CSV quotes.
test("[unhappy-1] A title of only repeated tabs gets one apostrophe and no CSV wrapper", () => {
  for (const count of [2, 9, 128]) {
    assertTitle("\t".repeat(count), "'" + "\t".repeat(count));
  }
});

// Extends public: A formula title with commas and quotes is defused before escaping.
test("[unhappy-1] Long formula content escapes every quote and separator after one defusing apostrophe", () => {
  const argument = '"東京",\r\n"team",';
  const escapedArgument = '""東京"",\r\n""team"",';
  assertTitle(`=CALL(${argument.repeat(64)}0)`, `"'=CALL(${escapedArgument.repeat(64)}0)"`);
});

// Extends public: Equals signs and other markers after an ordinary first character are unchanged.
test("[unhappy-1] Internal formula markers and controls are not apostrophe-prefixed or removed", () => {
  assertTitle("東京=+-@\tEnd", "東京=+-@\tEnd");
  assertTitle('x\r=1,+2,-3,@x,"q"', '"x\r=1,+2,-3,@x,""q"""');
});

// Extends public: A leading space is quoted but does not expose the later equals sign to defusing.
test("[unhappy-1] Leading spaces prevent defusing for every later dangerous marker", () => {
  for (const marker of ["=", "+", "-", "@", "\t", "\r"]) {
    const title = `   ${marker}Title`;
    assertTitle(title, `"${title}"`);
  }
});

// Extends public: An existing apostrophe is preserved without a second apostrophe.
test("[unhappy-1] Existing single or repeated apostrophes prevent defusing while CSV escaping still applies", () => {
  for (const marker of ["=", "+", "-", "@", "\t"]) {
    assertTitle(`''${marker}Title`, `''${marker}Title`);
  }
  assertTitle('\'@SUM("a",1)', '"\'@SUM(""a"",1)"');
  assertTitle("'\r=1", '"\'\r=1"');
});

// Extends public: A leading newline is quoted without formula defusing.
test("[unhappy-1] A leading newline blocks defusing of all later markers including a carriage return", () => {
  for (const marker of ["=", "+", "-", "@", "\t", "\r"]) {
    assertTitle(`\n${marker}Title`, `"\n${marker}Title"`);
  }
});

// Extends public: A formula title with commas and quotes is defused before escaping.
test("[unhappy-1] Every dangerous prefix composes with every CSV quoting trigger", () => {
  const suffixes: ReadonlyArray<readonly [string, string]> = [
    [",tail", ",tail"], ['"tail"', '""tail""'], ["\rTail", "\rTail"],
    ["\nTail", "\nTail"], ["Tail ", "Tail "],
  ];
  for (const marker of ["=", "+", "-", "@", "\t", "\r"]) {
    for (const [suffix, escapedSuffix] of suffixes) {
      assertTitle(marker + suffix, `"'${marker}${escapedSuffix}"`);
    }
  }
});

// Extends public: Equals signs and other markers after an ordinary first character are unchanged.
test("[unhappy-1] A double quote first character triggers CSV escaping without exposing a formula marker", () => {
  assertTitle('"=A1', '"""=A1"');
  assertTitle('"@SUM(1,2)"', '"""@SUM(1,2)"""');
});

// Extends public: A leading equals sign is prefixed with an apostrophe.
test("[unhappy-1] Mixed safe and dangerous titles are defused per row after sorting", () => {
  const values: ReadonlyArray<readonly [string, string, string]> = [
    ["a", "@Title", "'@Title"], ["b", "Normal", "Normal"],
    ["c", "\t=1", "'\t=1"], ["d", "=A1", "'=A1"],
    ["e", " +1", '" +1"'], ["f", "-Lead", "'-Lead"],
    ["g", "'@Title", "'@Title"], ["h", "\rX", '"\'\rX"'],
  ];
  const rows = values.map(([id, title]) => record(title, id));
  assert.equal(buildRequisitionsCsv([...rows].reverse()), header +
    values.map(([id, , field]) => `${id},${field},Cancelled,12,4,2031-11-07\r\n`).join(""));
});
