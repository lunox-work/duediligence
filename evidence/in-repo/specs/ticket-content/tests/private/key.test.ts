import assert from "node:assert/strict";
import { test } from "node:test";

import { ticketKey } from "../../src/ticket.js";

/**
 * A non-blank jiraKey wins, trimmed, and the number is not checked;
 * otherwise the key is "#" and the number in base 10, which must be a safe
 * integer of at least 1.
 */

const BAD_NUMBER = "A ticket number must be a positive whole number.";

function assertBadNumber(fn: () => unknown): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof RangeError, "expected a RangeError");
    assert.equal(error.message, BAD_NUMBER);
    return true;
  });
}

// Extends "[happy-10] a Jira ticket is shown by its Jira key":
// other keys and paddings; the key is only trimmed, never reformatted.
test("[happy-10] other Jira keys are returned trimmed and otherwise as written", () => {
  assert.equal(ticketKey({ number: 99, jiraKey: "PROJ-1" }), "PROJ-1");
  assert.equal(ticketKey({ number: 7, jiraKey: "\tACME-12\n" }), "ACME-12");
  assert.equal(ticketKey({ number: 7, jiraKey: "\r\n  ACME-12 \t " }), "ACME-12");
  assert.equal(ticketKey({ number: 7, jiraKey: "acme-12" }), "acme-12");
  assert.equal(ticketKey({ number: 7, jiraKey: "ACME 12" }), "ACME 12");
  assert.equal(ticketKey({ number: 7, jiraKey: "#5" }), "#5");
  assert.equal(ticketKey({ number: 7, jiraKey: "X" }), "X");
});

// Extends "[happy-10] a native ticket is shown by # and its number":
// other numbers, written in plain base 10.
test("[happy-10] native ticket numbers are written in plain base 10", () => {
  const cases: [number, string][] = [
    [2, "#2"],
    [10, "#10"],
    [255, "#255"],
    [1000000, "#1000000"],
    [123456789012, "#123456789012"],
    [1e15, "#1000000000000000"],
    [2 ** 52, "#4503599627370496"],
  ];
  for (const [number, key] of cases) {
    assert.equal(ticketKey({ number }), key);
    assert.equal(ticketKey({ number, jiraKey: null }), key);
  }
});

// Extends "[boundary-10] a whitespace-only Jira key falls back to the number":
// other whitespace-only keys and other numbers.
test("[boundary-10] other blank Jira keys fall back to the number", () => {
  for (const jiraKey of ["\r\n", "\t \t", "\n", " "]) {
    assert.equal(ticketKey({ number: 42, jiraKey }), "#42", JSON.stringify(jiraKey));
  }
  assert.equal(ticketKey({ number: 1, jiraKey: "" }), "#1");
  assert.equal(ticketKey({ number: 1042, jiraKey: "   " }), "#1042");
});

// Extends "[boundary-11] the largest ticket number is the largest safe integer":
// values next to each end of the range, with and without a blank Jira key.
test("[boundary-11] numbers next to each end of the range are accepted", () => {
  assert.equal(ticketKey({ number: 2 }), "#2");
  assert.equal(ticketKey({ number: 9007199254740990 }), "#9007199254740990");
  assert.equal(ticketKey({ number: 1, jiraKey: "" }), "#1");
  assert.equal(
    ticketKey({ number: Number.MAX_SAFE_INTEGER, jiraKey: "  " }),
    "#9007199254740991",
  );
});

// Extends "[unhappy-3] zero, negative and fractional ticket numbers are refused":
// values a check for "> 0" or "integer" alone would let through.
test("[unhappy-3] negative zero, near-integers and tiny numbers are refused", () => {
  for (const number of [-0, 0.5, 0.999, 1 - Number.EPSILON, 1 + Number.EPSILON, 2.5, Number.MIN_VALUE, 1e-7]) {
    assertBadNumber(() => ticketKey({ number }));
  }
});

// Extends "[unhappy-3] non-finite and unsafe ticket numbers are refused, as is a bad number behind a blank Jira key":
// other non-finite, unsafe and negative values.
test("[unhappy-3] other non-finite, unsafe and negative numbers are refused", () => {
  for (const number of [
    Number.NEGATIVE_INFINITY,
    2 ** 53 + 2,
    2 ** 60,
    1e21,
    Number.MAX_VALUE,
    -9007199254740991,
    -42,
  ]) {
    assertBadNumber(() => ticketKey({ number }));
  }
});

// Extends "[unhappy-3] non-finite and unsafe ticket numbers are refused, as is a bad number behind a blank Jira key":
// every way of having no Jira key still checks the number.
test("[unhappy-3] a bad number is refused behind every form of missing or blank Jira key", () => {
  for (const number of [0, 1.5, Number.NaN, 9007199254740992]) {
    assertBadNumber(() => ticketKey({ number }));
    assertBadNumber(() => ticketKey({ number, jiraKey: undefined }));
    assertBadNumber(() => ticketKey({ number, jiraKey: null }));
    assertBadNumber(() => ticketKey({ number, jiraKey: "" }));
    assertBadNumber(() => ticketKey({ number, jiraKey: "\t\r\n " }));
  }
});

// Extends "[boundary-12] a padded Jira key makes a non-finite number irrelevant":
// every kind of bad number behind a Jira key.
test("[boundary-12] a Jira key makes any bad number irrelevant", () => {
  for (const number of [
    -0,
    1.5,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    9007199254740992,
    -9007199254740991,
  ]) {
    assert.equal(ticketKey({ number, jiraKey: "\tACME-1 " }), "ACME-1", String(number));
  }
});
