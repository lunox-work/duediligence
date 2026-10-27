import assert from "node:assert/strict";
import { test } from "node:test";

import { clampTicketTitle, TICKET_LIMITS } from "../../src/ticket.js";

/**
 * The frozen limits, checked through the title clamp that reads them: a
 * failed assignment must leave both the constant and the clamp at 255.
 */

// Extends "[unhappy-1] the ticket limits are frozen and refuse assignment":
// the clamp still cuts at 255 after an attempted change to the limit.
test("[unhappy-1] an attempted change to the title limit leaves the clamp at 255", () => {
  const writable = TICKET_LIMITS as unknown as { titleMaxChars: number };
  assert.throws(() => {
    writable.titleMaxChars = 10;
  }, TypeError);
  assert.equal(TICKET_LIMITS.titleMaxChars, 255);
  assert.equal(clampTicketTitle("x".repeat(255)), "x".repeat(255));
  assert.equal(clampTicketTitle("x".repeat(20)), "x".repeat(20));
  const cut = clampTicketTitle("x".repeat(256));
  assert.equal(cut, "x".repeat(254) + "…");
  assert.equal(cut.length, TICKET_LIMITS.titleMaxChars);
});

// Extends "[unhappy-1] the frozen limits refuse new keys and deletions too":
// a refused deletion and redefinition leave the clamp's limit in place.
test("[unhappy-1] a refused deletion or redefinition of the title limit leaves the clamp at 255", () => {
  const loose = TICKET_LIMITS as unknown as Record<string, number>;
  assert.throws(() => {
    delete loose["titleMaxChars"];
  }, TypeError);
  assert.throws(() => {
    Object.defineProperty(TICKET_LIMITS, "titleMaxChars", { value: 1000 });
  }, TypeError);
  assert.equal(TICKET_LIMITS.titleMaxChars, 255);
  assert.equal(clampTicketTitle("y".repeat(400)).length, 255);
});
