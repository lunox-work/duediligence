import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "../../src/index.js";

// Extends "reports the source path original term exact text and one-based location".
test("[happy-3] preserves the original term and excludes punctuation outside a matched span", () => {
  const term = "!!Copper--River??";
  assert.deepEqual(scan([term], [{
    path: "docs/notes.txt", text: "head [COPPER\t...River] tail\n\t\tcopperRiver!!!",
  }]), {
    matches: [
      { path: "docs/notes.txt", term, line: 1, column: 7, text: "COPPER\t...River" },
      { path: "docs/notes.txt", term, line: 2, column: 3, text: "copperRiver" },
    ],
    skipped: [],
  });
});

// Extends "counts UTF-16 units and literal tabs after empty CRLF lines".
test("[happy-3] counts several surrogate pairs as two columns each among CRLF lines", () => {
  assert.deepEqual(scan(["orion"], [{
    path: "notes.txt", text: "\r\n\r\n😀🪐\t𐐨 Orion\r\n\tORION\r\n\r\n",
  }]).matches, [
    { path: "notes.txt", term: "orion", line: 3, column: 9, text: "Orion" },
    { path: "notes.txt", term: "orion", line: 4, column: 2, text: "ORION" },
  ]);
});

test("[happy-3] a CR inside a match remains exact text while LF alone increments the line", () => {
  assert.deepEqual(scan(["copper-river"], [{
    path: "notes.txt", text: "!!copper\r\rRiver\r\n\ncopper\tRiver\r",
  }]).matches, [
    { path: "notes.txt", term: "copper-river", line: 1, column: 3, text: "copper\r\rRiver" },
    { path: "notes.txt", term: "copper-river", line: 3, column: 1, text: "copper\tRiver" },
  ]);
});

test("[happy-3] reports columns and exact text after a long nonmatching prefix", () => {
  const prefix = "😀\t.".repeat(300);
  assert.deepEqual(scan(["copper-river"], [{
    path: "notes.txt", text: `${prefix}COPPER__River`,
  }]).matches, [
    { path: "notes.txt", term: "copper-river", line: 1, column: prefix.length + 1, text: "COPPER__River" },
  ]);
});

// Extends "reports a path match on line zero when the file text is empty":
// repeated path occurrences and a match in a filename stem.
test("[happy-4] scans all path components and repeated filename occurrences", () => {
  const path = "copperRiver/pkg/COPPER_RIVER/copper.river.ts";
  assert.deepEqual(scan(["copper-river"], [{ path, text: "" }]), {
    matches: [
      { path, term: "copper-river", line: 0, column: 1, text: "copperRiver" },
      { path, term: "copper-river", line: 0, column: 17, text: "COPPER_RIVER" },
      { path, term: "copper-river", line: 0, column: 30, text: "copper.river" },
    ],
    skipped: [],
  });
});

// Extends "counts UTF-16 path columns and matches words joined by a path separator".
test("[happy-4] spans several path separators and uses UTF-16 positions in the path", () => {
  const path = "😀🪐/pkg/Copper/River/Studio.ts";
  assert.deepEqual(scan(["copper-river-studio"], [{ path, text: "" }]).matches, [
    { path, term: "copper-river-studio", line: 0, column: 10, text: "Copper/River/Studio" },
  ]);
});

test("[happy-4] applies identifier boundaries to paths and rejects path substrings", () => {
  const path = "prenova/novas/MyNova/NOVAOrders.ts";
  assert.deepEqual(scan(["nova"], [{ path, text: "" }]).matches, [
    { path, term: "nova", line: 0, column: 17, text: "Nova" },
    { path, term: "nova", line: 0, column: 22, text: "NOVA" },
  ]);
});

// Extends "keeps the longer match when terms share a start": three nested
// choices in several supplied orders, including longest-first.
test("[boundary-4] longest of three shared-start candidates wins independently of term order", () => {
  const orders = [
    ["copper", "copper river", "copper river studio"],
    ["copper river studio", "copper", "copper river"],
    ["copper river", "copper river studio", "copper"],
  ];
  for (const terms of orders) {
    assert.deepEqual(scan(terms, [{ path: "notes.txt", text: "copperRiverStudio" }]).matches, [
      { path: "notes.txt", term: "copper river studio", line: 1, column: 1, text: "copperRiverStudio" },
    ]);
  }
});

// Extends "a longer overlapping span wins even when it starts later":
// matched length, including separators, outweighs the number of words.
test("[boundary-4] two words with a long join beat an overlapping three-word candidate", () => {
  assert.deepEqual(scan(["copper river light", "light dome"], [{
    path: "notes.txt", text: "copperRiverLight--------------------dome",
  }]).matches, [
    { path: "notes.txt", term: "light dome", line: 1, column: 12, text: "Light--------------------dome" },
  ]);
});

test("[boundary-4] matched source length outweighs the spelling length of the supplied term", () => {
  assert.deepEqual(scan(["copper----------------river", "river studio"], [{
    path: "notes.txt", text: "copperRiver-----studio",
  }]).matches, [
    { path: "notes.txt", term: "river studio", line: 1, column: 7, text: "River-----studio" },
  ]);
});

// Extends "equal-length overlaps use the first term in the supplied list":
// tied spans start at different positions instead of being equivalent terms.
test("[boundary-4] equal-length different-start overlaps use term order rather than earliest position", () => {
  const files = [{ path: "notes.txt", text: "amber.cedar.maple" }];
  assert.deepEqual(scan(["cedar maple", "amber cedar"], files).matches, [
    { path: "notes.txt", term: "cedar maple", line: 1, column: 7, text: "cedar.maple" },
  ]);
  assert.deepEqual(scan(["amber cedar", "cedar maple"], files).matches, [
    { path: "notes.txt", term: "amber cedar", line: 1, column: 1, text: "amber.cedar" },
  ]);
});

test("[boundary-4] equivalent terms keep the first spelling at every repeated occurrence", () => {
  assert.deepEqual(scan(["CopperRiver", "COPPER_RIVER", "copper river"], [{
    path: "notes.txt", text: "copper/river\nCOPPER.RIVER\ncopperRiver",
  }]).matches, [
    { path: "notes.txt", term: "CopperRiver", line: 1, column: 1, text: "copper/river" },
    { path: "notes.txt", term: "CopperRiver", line: 2, column: 1, text: "COPPER.RIVER" },
    { path: "notes.txt", term: "CopperRiver", line: 3, column: 1, text: "copperRiver" },
  ]);
});

// Extends "retains nonoverlapping matches including directly adjacent identifier words".
test("[boundary-4] keeps several adjacent winning spans and a final single word", () => {
  assert.deepEqual(scan(["river", "copper", "copper river"], [{
    path: "notes.txt", text: "copperRiverCopperRiverCopper",
  }]).matches, [
    { path: "notes.txt", term: "copper river", line: 1, column: 1, text: "copperRiver" },
    { path: "notes.txt", term: "copper river", line: 1, column: 12, text: "CopperRiver" },
    { path: "notes.txt", term: "copper", line: 1, column: 23, text: "Copper" },
  ]);
});

test("[boundary-4] resolves overlaps independently in the path and on separate lines", () => {
  const path = "copperRiver.txt";
  assert.deepEqual(scan(["copper", "copper river"], [{
    path, text: "copperRiver\ncopperRiver\ncopper",
  }]).matches, [
    { path, term: "copper river", line: 0, column: 1, text: "copperRiver" },
    { path, term: "copper river", line: 1, column: 1, text: "copperRiver" },
    { path, term: "copper river", line: 2, column: 1, text: "copperRiver" },
    { path, term: "copper", line: 3, column: 1, text: "copper" },
  ]);
});

test("[boundary-4] counts surrogate pairs as part of the longer matched text", () => {
  assert.deepEqual(scan(["amber cedar", "cedar maple"], [{
    path: "notes.txt", text: "amber..cedar💡💡💡maple",
  }]).matches, [
    { path: "notes.txt", term: "cedar maple", line: 1, column: 8, text: "cedar💡💡💡maple" },
  ]);
});

// Extends "sorts by path then line then column regardless of file and term input order".
test("[happy-5] sorts numeric line and column positions beyond nine in many reversed files", () => {
  const paths = ["a.txt", "b.txt", "c.txt", "d.txt", "e.txt", "f.txt", "g.txt", "h.txt", "i.txt", "j.txt", "k.txt", "z.txt"];
  const lines = Array.from({ length: 12 }, (_, index) => `${".".repeat(index)}orion.......vega`);
  const files = [...paths].reverse().map((path) => ({ path, text: lines.join("\n") }));
  const expected = paths.flatMap((path) => lines.flatMap((_, index) => [
    { path, term: "orion", line: index + 1, column: index + 1, text: "orion" },
    { path, term: "vega", line: index + 1, column: index + 13, text: "vega" },
  ]));
  assert.deepEqual(scan(["vega", "orion"], files).matches, expected);
});

// Extends "orders path matches before text matches within the same file":
// sorting is path-first even when another file has a path match on line zero.
test("[happy-5] finishes one path before another regardless of their line numbers", () => {
  assert.deepEqual(scan(["orion", "vega"], [
    { path: "z/vega.txt", text: "orion\nvega" },
    { path: "a/orion.txt", text: "\n\nvega orion" },
  ]).matches, [
    { path: "a/orion.txt", term: "orion", line: 0, column: 3, text: "orion" },
    { path: "a/orion.txt", term: "vega", line: 3, column: 1, text: "vega" },
    { path: "a/orion.txt", term: "orion", line: 3, column: 6, text: "orion" },
    { path: "z/vega.txt", term: "vega", line: 0, column: 3, text: "vega" },
    { path: "z/vega.txt", term: "orion", line: 1, column: 1, text: "orion" },
    { path: "z/vega.txt", term: "vega", line: 2, column: 1, text: "vega" },
  ]);
});

test("[happy-3] repeated calls use the current terms rather than cached results", () => {
  const files = [{ path: "notes.txt", text: "orion vega" }];
  assert.deepEqual(scan(["orion"], files).matches, [
    { path: "notes.txt", term: "orion", line: 1, column: 1, text: "orion" },
  ]);
  assert.deepEqual(scan(["vega"], files).matches, [
    { path: "notes.txt", term: "vega", line: 1, column: 7, text: "vega" },
  ]);
  assert.deepEqual(scan([], files), { matches: [], skipped: [] });
});

// Extends "refuses an entire NUL-containing file including its otherwise matching path".
test("[unhappy-1] a late NUL discards every earlier path and text match", () => {
  const path = "orion/Orion.txt";
  assert.deepEqual(scan(["orion"], [{
    path, text: `${"orion\n".repeat(128)}${".".repeat(8192)}\u0000orion`,
  }]), { matches: [], skipped: [path] });
});

// Extends "detects NUL at either text edge while continuing to scan a text file".
test("[unhappy-1] skips several binary files once each and scans interleaved clean files", () => {
  const result = scan(["orion"], [
    { path: "orion/end.bin", text: "orion\u0000" },
    { path: "b.txt", text: "Orion" },
    { path: "orion/middle.bin", text: "orion\u0000orion\u0000orion" },
    { path: "a.txt", text: "\norion" },
    { path: "orion/start.bin", text: "\u0000orion" },
    { path: "empty.txt", text: "" },
  ]);
  assert.deepEqual(result.matches, [
    { path: "a.txt", term: "orion", line: 2, column: 1, text: "orion" },
    { path: "b.txt", term: "orion", line: 1, column: 1, text: "Orion" },
  ]);
  // The order of skipped paths is not specified.
  assert.deepEqual([...result.skipped].sort(), ["orion/end.bin", "orion/middle.bin", "orion/start.bin"]);
});

test("[unhappy-1] binary detection still applies when there are no terms to scan", () => {
  assert.deepEqual(scan([], [
    { path: "empty.txt", text: "" },
    { path: "binary.dat", text: "\u0000" },
  ]), { matches: [], skipped: ["binary.dat"] });
});

test("[unhappy-1] binary detection still applies when all terms are filtered out", () => {
  assert.deepEqual(scan(["api", "123456", "ab"], [{
    path: "plain-looking.txt", text: "\u0000\u0000",
  }]), { matches: [], skipped: ["plain-looking.txt"] });
});

test("[unhappy-1] a binary extension alone does not make NUL-free text unscannable", () => {
  assert.deepEqual(scan(["orion"], [{ path: "image.bin", text: "orion\u0001\u0002\u001f\u007f" }]), {
    matches: [{ path: "image.bin", term: "orion", line: 1, column: 1, text: "orion" }],
    skipped: [],
  });
});

test("[happy-3] each invocation uses its own file contents and skipped status", () => {
  assert.deepEqual(scan(["orion"], [{ path: "notes.txt", text: "\u0000orion" }]), {
    matches: [], skipped: ["notes.txt"],
  });
  assert.deepEqual(scan(["orion"], [{ path: "notes.txt", text: "..ORION" }]), {
    matches: [{ path: "notes.txt", term: "orion", line: 1, column: 3, text: "ORION" }], skipped: [],
  });
});
