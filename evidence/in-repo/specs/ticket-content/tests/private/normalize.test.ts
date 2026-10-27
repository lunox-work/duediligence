import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeSpecText } from "../../src/ticket.js";

/**
 * normalizeSpecText splits on "\r\n", "\r" or "\n", trims each line's end
 * (String.prototype.trimEnd), joins with "\n" and trims both ends
 * (String.prototype.trim).
 */

// Extends "[happy-4] mixed line endings keep blank lines and inner indentation":
// lines are trimmed at their end only, so indentation of later lines survives.
test("[happy-4] leading indentation of every line but the first is kept", () => {
  assert.equal(
    normalizeSpecText("Steps:  \n  1. Open\t\n\t2. Save  \n    - nested"),
    "Steps:\n  1. Open\n\t2. Save\n    - nested",
  );
  assert.equal(normalizeSpecText("   first\n   second"), "first\n   second");
});

// Extends "[happy-4] normalizing spec text removes line-ending and trailing whitespace noise":
// each "\r" and each "\n" not part of a "\r\n" is its own line break.
test("[happy-4] consecutive and reversed line breaks each count as a break", () => {
  const cases: [string, string][] = [
    ["a\r\rb", "a\n\nb"],
    ["a\n\rb", "a\n\nb"],
    ["a\r\r\nb", "a\n\nb"],
    ["a\r\n\nb", "a\n\nb"],
    ["a\r\n\r\n\r\nb", "a\n\n\nb"],
    ["a\n\n\n\nb", "a\n\n\n\nb"],
    ["a\r\n\rb\n\r\nc", "a\n\nb\n\nc"],
  ];
  for (const [input, output] of cases) {
    assert.equal(normalizeSpecText(input), output, JSON.stringify(input));
  }
});

// Extends "[happy-4] normalizing spec text removes line-ending and trailing whitespace noise":
// whitespace-only lines between text become empty lines, not removed.
test("[happy-4] whitespace-only lines between text become empty lines", () => {
  assert.equal(normalizeSpecText("a\n   \n\t\nb"), "a\n\n\nb");
  assert.equal(normalizeSpecText("a  \r\n \t \r\n  b  "), "a\n\n  b");
});

// Extends "[happy-4] normalizing spec text removes line-ending and trailing whitespace noise":
// trimEnd and trim remove every kind of JavaScript whitespace, not only spaces and tabs.
test("[happy-4] Unicode whitespace is trimmed at line ends and at the edges", () => {
  assert.equal(normalizeSpecText("One 　\nTwo "), "One\nTwo");
  assert.equal(normalizeSpecText("﻿ One\nTwo"), "One\nTwo");
  assert.equal(normalizeSpecText("a\f\v\nb"), "a\nb");
  assert.equal(normalizeSpecText("One\n Two"), "One\n Two");
});

// Extends "[happy-4] normalizing spec text removes line-ending and trailing whitespace noise"
// ("Add  export" keeps its double space): inner whitespace of any kind is kept.
test("[happy-4] inner whitespace and non-ASCII text are kept as written", () => {
  assert.equal(normalizeSpecText("a \t b\tc"), "a \t b\tc");
  assert.equal(normalizeSpecText("Café ☕  😀 “quoted”"), "Café ☕  😀 “quoted”");
  assert.equal(normalizeSpecText("a b"), "a b");
  assert.equal(normalizeSpecText("x  y  \r\n  z  w  "), "x  y\n  z  w");
});

// Extends "[happy-4] normalizing spec text removes line-ending and trailing whitespace noise":
// a long multi-line input with noise on every line.
test("[happy-4] a long text with noise on every line normalizes line by line", () => {
  const lines: string[] = [];
  const expected: string[] = [];
  for (let i = 0; i < 5000; i++) {
    const indent = " ".repeat(i % 4);
    const ending = i % 3 === 0 ? "\r\n" : i % 3 === 1 ? "\r" : "\n";
    lines.push(`${indent}line ${i}${" \t".repeat(i % 3)}${ending}`);
    expected.push(`${indent}line ${i}`);
  }
  // The first line has no indent (0 % 4) and the final trim drops the last break.
  assert.equal(normalizeSpecText(lines.join("")), expected.join("\n"));
});

// Extends "[happy-4] normalizing spec text removes line-ending and trailing whitespace noise":
// it never throws, even on text that is not well-formed UTF-16.
test("[happy-4] lone surrogates and control characters do not make it throw", () => {
  assert.equal(normalizeSpecText("\ud800 \n\udc00\t"), "\ud800\n\udc00");
  assert.equal(normalizeSpecText("a\u0000b  "), "a\u0000b");
});

// Extends "[boundary-1] whitespace-only text normalizes to the empty string".
test("[boundary-1] other and longer whitespace-only texts normalize to the empty string", () => {
  const inputs = [
    "\r",
    "\n",
    "\r\r\r",
    "\t\t",
    " 　﻿",
    " \n \r\n \r ",
    "   \r\n".repeat(1000),
    " ".repeat(20000),
  ];
  for (const input of inputs) {
    assert.equal(normalizeSpecText(input), "", JSON.stringify(input.slice(0, 20)));
  }
});

// Extends "[boundary-2] normalizing twice equals normalizing once":
// idempotence over other inputs, including ones whose result keeps indentation.
test("[boundary-2] normalizing is idempotent across varied inputs", () => {
  const inputs = [
    "Steps:  \n  1. Open\t\n\t2. Save  ",
    "a\r\rb\r\n\r\n",
    "\n\n   indented first\n   second  ",
    "One 　\nTwo ",
    "a\n   \n\t\nb",
    "Add  export",
    "x",
  ];
  for (const input of inputs) {
    const once = normalizeSpecText(input);
    assert.equal(normalizeSpecText(once), once, JSON.stringify(input));
  }
  assert.equal(normalizeSpecText(normalizeSpecText("\n\n   indented first\n   second  ")), "indented first\n   second");
});
