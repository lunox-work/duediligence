import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeSpecText } from "../src/ticket.js";

/**
 * normalizeSpecText behaves exactly like the Jira package's private
 * `normalize`: split on any line ending, trimEnd each line, join with "\n",
 * then trim both ends.
 */

const examples: ReadonlyArray<readonly [string, string]> = [
  ["One\nTwo", "One\nTwo"],
  ["One  \r\nTwo\t", "One\nTwo"],
  ["One\rTwo", "One\nTwo"],
  ["  a  \r\n\r\n b\t\r c  ", "a\n\n b\n c"],
  ["Add  export", "Add  export"],
  ["\n\nTitle\n\n", "Title"],
];

test("[happy-4] normalizing spec text removes line-ending and edge noise", () => {
  for (const [input, output] of examples) {
    assert.equal(
      normalizeSpecText(input),
      output,
      `normalizing ${JSON.stringify(input)}`,
    );
  }
});

test("[happy-4] indentation after the first line and blank lines are kept", () => {
  assert.equal(normalizeSpecText("  a\n  b"), "a\n  b");
  assert.equal(normalizeSpecText("a\n\rb"), "a\n\nb");
  assert.equal(normalizeSpecText("a\n\n\nb"), "a\n\n\nb");
});

test("[boundary-1] empty and whitespace-only text normalizes to the empty string", () => {
  for (const input of ["", "   ", "\r\n\t\n "]) {
    assert.equal(
      normalizeSpecText(input),
      "",
      `normalizing ${JSON.stringify(input)}`,
    );
  }
});

test("[boundary-1] a lone line ending or tabs normalize to the empty string", () => {
  for (const input of ["\r", "\n", "\r\n", "\t\t", "\r\r\n\n"]) {
    assert.equal(
      normalizeSpecText(input),
      "",
      `normalizing ${JSON.stringify(input)}`,
    );
  }
});

test("[boundary-2] normalizing twice equals normalizing once", () => {
  const text = "  a  \r\n\r\n b\t\r c  ";
  const once = normalizeSpecText(text);
  assert.equal(once, "a\n\n b\n c");
  assert.equal(normalizeSpecText(once), once);
});

test("[boundary-2] normalizing is idempotent for every example input", () => {
  for (const [input] of examples) {
    const once = normalizeSpecText(input);
    assert.equal(
      normalizeSpecText(once),
      once,
      `normalizing ${JSON.stringify(input)} twice`,
    );
  }
});
