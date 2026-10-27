import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "../../src/index.js";

// Extends "finds all four spellings of a multiword term": more words,
// multiple occurrences per line, and mixed joins within a single match.
test("[happy-1] finds four-word names with different joins at each boundary", () => {
  const term = "silver-moon-river-studio";
  const spellings = [
    "silverMoonRiverStudio",
    "SILVER_MOON_RIVER_STUDIO",
    "Silver.moon/RIVER--studio",
    "silver Moon\tRiver:::Studio",
  ];
  const text = spellings.join(" | ");
  let offset = 0;
  const expected = spellings.map((spelling) => {
    const match = { path: "notes.txt", term, line: 1, column: offset + 1, text: spelling };
    offset += spelling.length + 3;
    return match;
  });
  assert.deepEqual(scan([term], [{ path: "notes.txt", text }]), {
    matches: expected, skipped: [],
  });
});

// Extends "finds all four spellings of a multiword term": the supplied term
// itself needs camel-case and acronym tokenization.
test("[happy-1] tokenizes camel-case and acronym spellings in supplied terms", () => {
  assert.deepEqual(scan(["XMLHttpRequest", "deepSeaBeacon"], [{
    path: "notes.txt",
    text: "xml-http-request\nXML_HTTP_REQUEST\ndeep/sea/beacon\nDEEP SEA BEACON",
  }]).matches, [
    { path: "notes.txt", term: "XMLHttpRequest", line: 1, column: 1, text: "xml-http-request" },
    { path: "notes.txt", term: "XMLHttpRequest", line: 2, column: 1, text: "XML_HTTP_REQUEST" },
    { path: "notes.txt", term: "deepSeaBeacon", line: 3, column: 1, text: "deep/sea/beacon" },
    { path: "notes.txt", term: "deepSeaBeacon", line: 4, column: 1, text: "DEEP SEA BEACON" },
  ]);
});

// Extends "recognizes Unicode letters and case across spelling variants":
// Greek and Cyrillic words, not only Latin accented letters.
test("[happy-1] compares Greek and Cyrillic words ignoring case", () => {
  assert.deepEqual(scan(["άλφα-βήτα", "север-ветер"], [{
    path: "notes.txt",
    text: "ΆΛΦΑ/ΒΉΤΑ\nάλφαΒήτα\nСЕВЕР_ВЕТЕР\nсеверВетер",
  }]).matches, [
    { path: "notes.txt", term: "άλφα-βήτα", line: 1, column: 1, text: "ΆΛΦΑ/ΒΉΤΑ" },
    { path: "notes.txt", term: "άλφα-βήτα", line: 2, column: 1, text: "άλφαΒήτα" },
    { path: "notes.txt", term: "север-ветер", line: 3, column: 1, text: "СЕВЕР_ВЕТЕР" },
    { path: "notes.txt", term: "север-ветер", line: 4, column: 1, text: "северВетер" },
  ]);
});

test("[happy-1] treats uncased Unicode letters as words and matches the whole sequence", () => {
  assert.deepEqual(scan(["北海-灯台"], [{
    path: "notes.txt",
    text: "北海/灯台\n北海灯台\n北海_灯台\n北海 extra 灯台\n灯台 北海",
  }]).matches, [
    { path: "notes.txt", term: "北海-灯台", line: 1, column: 1, text: "北海/灯台" },
    { path: "notes.txt", term: "北海-灯台", line: 3, column: 1, text: "北海_灯台" },
  ]);
});

// Extends "finds identifier words including acronym boundaries but rejects substrings".
test("[happy-2] finds internal words and acronym runs without splitting larger acronyms", () => {
  assert.deepEqual(scan(["nova", "xray"], [{
    path: "notes.txt",
    text: "XMLNovaReport\nMyNovaAPI\nNOVABook\nXRAYOrders\nMYXRAYOrders\nnovas\nprenova",
  }]).matches, [
    { path: "notes.txt", term: "nova", line: 1, column: 4, text: "Nova" },
    { path: "notes.txt", term: "nova", line: 2, column: 3, text: "Nova" },
    { path: "notes.txt", term: "nova", line: 3, column: 1, text: "NOVA" },
    { path: "notes.txt", term: "xray", line: 4, column: 1, text: "XRAY" },
  ]);
});

// Extends "applies Unicode case boundaries while digits stay in their word".
test("[happy-2] uses Cyrillic lowercase and acronym boundaries inside identifiers", () => {
  assert.deepEqual(scan(["север"], [{
    path: "notes.txt",
    text: "мойСеверСклад\nСЕВЕРСклад\nсеверный\nасевер\nсевер3\n3север",
  }]).matches, [
    { path: "notes.txt", term: "север", line: 1, column: 4, text: "Север" },
    { path: "notes.txt", term: "север", line: 2, column: 1, text: "СЕВЕР" },
  ]);
});

// Extends "applies Unicode case boundaries while digits stay in their word":
// neither side of a digit creates a word boundary on its own.
test("[happy-2] keeps letters and digits together even before a capital letter", () => {
  assert.deepEqual(scan(["node", "node4", "r2d2"], [{
    path: "notes.txt",
    text: "node4\nNODE4\nr2d2\nR2D2\nnode4Orders\n4node\nnode４\nnode",
  }]).matches, [
    { path: "notes.txt", term: "node4", line: 1, column: 1, text: "node4" },
    { path: "notes.txt", term: "node4", line: 2, column: 1, text: "NODE4" },
    { path: "notes.txt", term: "r2d2", line: 3, column: 1, text: "r2d2" },
    { path: "notes.txt", term: "r2d2", line: 4, column: 1, text: "R2D2" },
    { path: "notes.txt", term: "node", line: 8, column: 1, text: "node" },
  ]);
});

test("[happy-2] finds multiple occurrences in the same identifier", () => {
  assert.deepEqual(scan(["nova"], [{ path: "notes.txt", text: "NovaNovaNovaNova" }]).matches, [
    { path: "notes.txt", term: "nova", line: 1, column: 1, text: "Nova" },
    { path: "notes.txt", term: "nova", line: 1, column: 5, text: "Nova" },
    { path: "notes.txt", term: "nova", line: 1, column: 9, text: "Nova" },
    { path: "notes.txt", term: "nova", line: 1, column: 13, text: "Nova" },
  ]);
});

// Extends "does not split a fused lowercase spelling into term words":
// uppercasing a fused spelling does not introduce boundaries either.
test("[boundary-1] rejects fused uppercase and lowercase spellings in text and paths", () => {
  assert.deepEqual(scan(["moon-beam"], [
    { path: "moonbeam/MOONBEAM.txt", text: "moonbeam\nMOONBEAM\nMoonbeam" },
    { path: "docs.txt", text: "moonbeamRunner\npreMoonbeamPost" },
  ]), { matches: [], skipped: [] });
});

// Extends "distinguishes fused spellings from a neighboring camel-case spelling".
test("[boundary-1] requires every boundary in a three-word term", () => {
  assert.deepEqual(scan(["silver-moon-beam"], [{
    path: "notes.txt",
    text: "silvermoonBeam\nsilverMoonbeam\nsilvermoonbeam\nsilverMoonBeam\nSILVERMOON_BEAM",
  }]).matches, [
    { path: "notes.txt", term: "silver-moon-beam", line: 4, column: 1, text: "silverMoonBeam" },
  ]);
});

// Extends "does not join words across an LF line break": an otherwise
// flexible separator must not absorb LF amid a much longer separator run.
test("[boundary-2] rejects LF hidden among punctuation and blank lines", () => {
  assert.deepEqual(scan(["silver-moon-beam"], [{
    path: "notes.txt",
    text: "silver...\n---moon beam\nsilver moon\n\nbeam\nsilver\nmoon\nbeam",
  }]), { matches: [], skipped: [] });
});

// Extends "does not join CRLF lines and still scans a complete term on the next line".
test("[boundary-2] preserves partial prefixes without joining adjacent CRLF lines", () => {
  assert.deepEqual(scan(["silver-moon-beam"], [{
    path: "notes.txt",
    text: "silver\r\nmoon beam\r\nsilver moon\r\nbeam\r\nsilverMoonBeam\r\n",
  }]).matches, [
    { path: "notes.txt", term: "silver-moon-beam", line: 5, column: 1, text: "silverMoonBeam" },
  ]);
});

// Extends "permits runs of nonword characters within a line but not intervening digits".
test("[boundary-2] accepts non-LF whitespace and arbitrary punctuation as joins", () => {
  const joins = ["\r", "\t\v\f", "\u2028\u2029", "\u00a0\u2003", "<>#&=+!?💡"];
  const spellings = joins.map((join) => `silver${join}moon`);
  assert.deepEqual(scan(["silver-moon"], [{
    path: "notes.txt", text: spellings.join("\n"),
  }]).matches, spellings.map((text, index) => ({
    path: "notes.txt", term: "silver-moon", line: index + 1, column: 1, text,
  })));
});

// Extends "permits runs of nonword characters within a line but not intervening digits".
test("[boundary-2] rejects intervening words and Unicode digits as well as ASCII digits", () => {
  assert.deepEqual(scan(["silver-moon"], [{
    path: "notes.txt",
    text: "silver extra moon\nsilver ٢ moon\nsilver４moon\nsilver 北京 moon\nmoon silver",
  }]), { matches: [], skipped: [] });
});

test("[happy-1] finds many occurrences and very long separators without truncation", () => {
  const term = "amber-lantern";
  const separator = ".-_/".repeat(512);
  const spelling = `AMBER${separator}LANTERN`;
  const count = 64;
  assert.deepEqual(scan([term], [{
    path: "notes.txt", text: Array.from({ length: count }, () => spelling).join("\n"),
  }]).matches, Array.from({ length: count }, (_, index) => ({
    path: "notes.txt", term, line: index + 1, column: 1, text: spelling,
  })));
});
