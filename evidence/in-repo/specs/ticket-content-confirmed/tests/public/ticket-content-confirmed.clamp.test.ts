import assert from "node:assert/strict";
import { test } from "node:test";

import { TICKET_LIMITS, clampTicketTitle } from "../src/ticket.js";

/**
 * clampTicketTitle only cuts to the first 255 UTF-16 code units: no trim,
 * no ellipsis, so titles already hashed keep their hashes. A high surrogate
 * left at the cut is dropped so an emoji is never split.
 */

const EMOJI = "\u{1F600}";

test("[happy-9] titles within the limit are returned unchanged", () => {
  for (const title of ["Add export", "  Add export \n", "Add   CSV  export"]) {
    assert.equal(clampTicketTitle(title), title);
  }
});

test("[happy-9] a title within the limit that ends on a whole emoji is unchanged", () => {
  const title = "x".repeat(253) + EMOJI;
  assert.equal(title.length, 255);
  assert.equal(clampTicketTitle(title), title);
  assert.equal(clampTicketTitle(EMOJI), EMOJI);
});

test("[boundary-5] titles are cut to exactly the title limit", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["x".repeat(255), "x".repeat(255)],
    ["x".repeat(256), "x".repeat(255)],
    [`  ${"x".repeat(255)}  `, `  ${"x".repeat(253)}`],
    ["x".repeat(1000), "x".repeat(255)],
  ];
  for (const [title, result] of cases) {
    const clamped = clampTicketTitle(title);
    assert.equal(clamped, result);
    assert.equal(clamped.length, 255);
  }
});

test("[boundary-5] one under the limit is unchanged and the limit is TICKET_LIMITS.title", () => {
  assert.equal(TICKET_LIMITS.title, 255);
  assert.equal(clampTicketTitle("x".repeat(254)), "x".repeat(254));
  assert.equal(
    clampTicketTitle("x".repeat(TICKET_LIMITS.title + 1)).length,
    TICKET_LIMITS.title,
  );
});

test("[boundary-6] empty and blank titles are not changed", () => {
  for (const title of ["", "   ", "\n\t "]) {
    assert.equal(clampTicketTitle(title), title);
  }
});

test("[boundary-6] an over-long blank title is cut, not trimmed", () => {
  assert.equal(clampTicketTitle(" ".repeat(300)), " ".repeat(255));
});

test("[boundary-7] whitespace before the cut is kept", () => {
  const title = "x".repeat(250) + " ".repeat(5) + "y".repeat(10);
  assert.equal(title.length, 265);
  const clamped = clampTicketTitle(title);
  assert.equal(clamped, "x".repeat(250) + " ".repeat(5));
  assert.equal(clamped.length, 255);
});

test("[boundary-7] a line break as the last kept code unit is kept", () => {
  const clamped = clampTicketTitle(`${"x".repeat(254)}\ny`);
  assert.equal(clamped, `${"x".repeat(254)}\n`);
  assert.equal(clamped.length, 255);
});

test("[boundary-8] a surrogate pair that fits whole is kept", () => {
  const title = "a".repeat(253) + EMOJI + "b";
  assert.equal(title.length, 256);
  const clamped = clampTicketTitle(title);
  assert.equal(clamped, "a".repeat(253) + EMOJI);
  assert.equal(clamped.length, 255);
});

test("[boundary-8] a surrogate pair at the start of a long title is kept", () => {
  const clamped = clampTicketTitle(EMOJI + "a".repeat(300));
  assert.equal(clamped, EMOJI + "a".repeat(253));
  assert.equal(clamped.length, 255);
});

test("[boundary-9] a cut never splits a surrogate pair", () => {
  const title = "a".repeat(254) + EMOJI;
  assert.equal(title.length, 256);
  const clamped = clampTicketTitle(title);
  assert.equal(clamped, "a".repeat(254));
  assert.equal(clamped.length, 254);
});

test("[boundary-9] a title of only emoji is cut to whole emoji", () => {
  const clamped = clampTicketTitle(EMOJI.repeat(200));
  assert.equal(clamped, EMOJI.repeat(127));
  assert.equal(clamped.length, 254);
});

test("[boundary-10] clamping twice equals clamping once", () => {
  const once = clampTicketTitle("x".repeat(300));
  assert.equal(once, "x".repeat(255));
  assert.equal(clampTicketTitle(once), once);
});

test("[boundary-10] clamping a title cut before an emoji is idempotent", () => {
  const once = clampTicketTitle("a".repeat(254) + EMOJI);
  assert.equal(once, "a".repeat(254));
  assert.equal(clampTicketTitle(once), once);
});
