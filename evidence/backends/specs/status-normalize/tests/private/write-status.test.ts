import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatus, writeStatus } from "../../src/index.js";

const statuses = ["draft", "review", "published", "claimed", "merged"] as const;

function refuses(value: string): void {
  assert.throws(
    () => writeStatus(value),
    (error: unknown) => error instanceof Error && error.message.includes(value),
    `Expected an error naming the original value ${JSON.stringify(value)}`,
  );
}

// Extends public "writes review as itself".
test("[happy-3] repeated writes and reads of review remain the canonical value", () => {
  for (let index = 0; index < 32; index++) {
    assert.equal(readStatus(index % 2 ? "uNdEr__-ReViEw" : "reviewing"), "review");
    const stored = writeStatus("review");
    assert.equal(stored, "review");
    assert.equal(readStatus(stored), "review");
    assert.equal(writeStatus(stored), "review");
  }
});

// Extends public "writes the remaining statuses including the shortest and longest values".
test("[happy-3] writes all statuses in changing orders and round trips each stored value", () => {
  for (let offset = 0; offset < statuses.length; offset++) {
    for (let index = statuses.length - 1; index >= 0; index--) {
      const status = statuses[(offset + index) % statuses.length];
      const stored = writeStatus(status);
      assert.equal(stored, status);
      assert.equal(writeStatus(stored), status);
      assert.equal(readStatus(stored), status);
    }
  }
});

// Extends public "refuses the example invalid writes and names each original value".
test("[unhappy-2] refuses every noncanonical ASCII capitalization of every status", () => {
  for (const status of statuses) {
    for (let mask = 1; mask < 2 ** status.length; mask++) {
      const value = [...status].map((letter, index) =>
        mask & (1 << index) ? letter.toUpperCase() : letter,
      ).join("");
      refuses(value);
    }
  }
});

// Extends public "refuses every legacy alias and blank or padded writes".
test("[unhappy-2] refuses left right and two-sided padding for every canonical status", () => {
  for (const status of [...statuses].reverse()) {
    for (const value of [` ${status}`, `${status} `, `  ${status}   `]) {
      refuses(value);
    }
  }
});

// Extends public "refuses every legacy alias and blank or padded writes".
test("[unhappy-2] refuses cleaned variants of every alias even when reading accepts them", () => {
  const aliases = [
    ["in review", "review"], ["under review", "review"], ["reviewing", "review"],
    ["live", "published"], ["public", "published"], ["assigned", "claimed"],
    ["taken", "claimed"], ["done", "merged"], ["complete", "merged"], ["completed", "merged"],
  ] as const;
  for (const [alias, expected] of aliases) {
    for (const value of [alias.toUpperCase(), ` ${alias}  `, `  ${alias.toUpperCase().replace(" ", "_- -__")} `]) {
      refuses(value);
      assert.equal(readStatus(value), expected);
    }
  }
});

// Extends public "refuses the example invalid writes and names each original value".
test("[unhappy-2] refuses other unknown words punctuation numeric strings and object property names", () => {
  for (const value of [
    "pending", "rejected", "blocked", "drafts", "reviewed", "published!",
    "merged/done", "0", "1", "null", "undefined", "constructor", "toString", "__proto__",
  ]) {
    refuses(value);
  }
});

// Extends public "refuses the example invalid writes and names each original value".
test("[unhappy-2] names the entire long invalid original instead of its cleaned or truncated form", () => {
  refuses("  INVALID-" + "q".repeat(8192) + "_END  ");
});

// Extends public "refuses every legacy alias and blank or padded writes".
test("[unhappy-2] refuses several blank lengths and the empty value", () => {
  // Empty-value error formatting is unspecified; no special wording is required.
  for (const value of ["  ", " ", " ".repeat(8192), ""]) {
    refuses(value);
  }
});

// Extends public "refuses the example invalid writes and names each original value".
test("[unhappy-2] invalid writes remain invalid when interleaved with successful writes", () => {
  for (const status of statuses) {
    refuses(status.toUpperCase());
    assert.equal(writeStatus(status), status);
    refuses(` ${status} `);
    assert.equal(writeStatus(status), status);
  }
});
