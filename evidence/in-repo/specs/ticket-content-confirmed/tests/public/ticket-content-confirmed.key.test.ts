import assert from "node:assert/strict";
import { test } from "node:test";

import { ticketKey } from "../src/ticket.js";

/**
 * A ticket shows by its Jira key when it has one, given as is, and by "T-"
 * and its number otherwise. The number is never checked.
 */

test("[happy-10] a ticket shows its Jira key, else T- and its number", () => {
  assert.equal(ticketKey({ number: 7, jiraKey: "ACME-12" }), "ACME-12");
  assert.equal(ticketKey({ number: 7, jiraKey: " ACME-12 " }), " ACME-12 ");
  assert.equal(ticketKey({ number: 7 }), "T-7");
  assert.equal(ticketKey({ number: 7, jiraKey: null }), "T-7");
  assert.equal(ticketKey({ number: 7, jiraKey: undefined }), "T-7");
  assert.equal(ticketKey({ number: 1042 }), "T-1042");
});

test("[happy-10] a Jira key is returned with its casing and line breaks", () => {
  assert.equal(ticketKey({ number: 7, jiraKey: "acme-12" }), "acme-12");
  assert.equal(ticketKey({ number: 7, jiraKey: "ACME-12\n" }), "ACME-12\n");
  assert.equal(ticketKey({ number: 7, jiraKey: "T-8" }), "T-8");
});

test("[boundary-11] blank Jira keys are returned as they are", () => {
  for (const jiraKey of ["", "   "]) {
    assert.equal(ticketKey({ number: 3, jiraKey }), jiraKey);
  }
});

test("[boundary-11] a Jira key of tabs and line breaks is returned as it is", () => {
  assert.equal(ticketKey({ number: 3, jiraKey: "\t\n" }), "\t\n");
});

test("[boundary-12] the number is used as given", () => {
  const cases: ReadonlyArray<readonly [number, string]> = [
    [1, "T-1"],
    [9007199254740991, "T-9007199254740991"],
    [0, "T-0"],
    [-1, "T--1"],
    [1.5, "T-1.5"],
  ];
  for (const [number, key] of cases) {
    assert.equal(ticketKey({ number }), key);
  }
});

test("[boundary-12] numbers are formatted the way JavaScript formats them", () => {
  assert.equal(ticketKey({ number: 1e21 }), `T-${String(1e21)}`);
  assert.equal(ticketKey({ number: Number.NaN }), "T-NaN");
  assert.equal(ticketKey({ number: Number.POSITIVE_INFINITY }), "T-Infinity");
});

test("[boundary-13] a Jira key makes the number irrelevant", () => {
  assert.equal(ticketKey({ number: 0, jiraKey: "ACME-1" }), "ACME-1");
});

test("[boundary-13] a Jira key wins over any number, blank keys included", () => {
  assert.equal(ticketKey({ number: Number.NaN, jiraKey: "ACME-1" }), "ACME-1");
  assert.equal(ticketKey({ number: -1, jiraKey: "ACME-1" }), "ACME-1");
  assert.equal(ticketKey({ number: 0, jiraKey: "" }), "");
});
