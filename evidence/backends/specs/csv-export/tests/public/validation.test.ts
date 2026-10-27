import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequisitionsCsv, type Requisition } from "../../src/index.js";

function requisition(overrides: Partial<Requisition> = {}): Requisition {
  return {
    id: "bad-requisition-42",
    title: "Engineer",
    status: "open",
    openings: 3,
    filled: 1,
    createdAt: new Date("2025-06-15T12:00:00.000Z"),
    ...overrides,
  };
}

function assertRejected(overrides: Partial<Requisition>): void {
  const invalid = requisition(overrides);
  assert.throws(
    () => buildRequisitionsCsv([invalid]),
    (error: unknown) => error instanceof Error && error.message.includes(invalid.id),
  );
}

test("[unhappy-2] An unknown status is refused with the requisition id", () => {
  assertRejected({ status: "pending" });
});

test("[unhappy-2] An empty status is refused with the requisition id", () => {
  assertRejected({ status: "" });
});

test("[unhappy-2] A display label is not a valid status value", () => {
  assertRejected({ status: "Open" });
});

test("[unhappy-2] Negative openings are refused", () => {
  assertRejected({ openings: -1, filled: 0 });
});

test("[unhappy-2] Fractional openings are refused even when filled fits", () => {
  assertRejected({ openings: 1.5, filled: 1 });
});

test("[unhappy-2] NaN openings are refused", () => {
  assertRejected({ openings: Number.NaN, filled: 0 });
});

test("[unhappy-2] Positive infinite openings are refused", () => {
  assertRejected({ openings: Number.POSITIVE_INFINITY, filled: 0 });
});

test("[unhappy-2] Negative infinite openings are refused", () => {
  assertRejected({ openings: Number.NEGATIVE_INFINITY, filled: 0 });
});

test("[unhappy-2] Negative filled counts are refused", () => {
  assertRejected({ filled: -1 });
});

test("[unhappy-2] Fractional filled counts are refused", () => {
  assertRejected({ filled: 0.5 });
});

test("[unhappy-2] NaN filled counts are refused", () => {
  assertRejected({ filled: Number.NaN });
});

test("[unhappy-2] Positive infinite filled counts are refused", () => {
  assertRejected({ filled: Number.POSITIVE_INFINITY });
});

test("[unhappy-2] Negative infinite filled counts are refused", () => {
  assertRejected({ filled: Number.NEGATIVE_INFINITY });
});

test("[unhappy-2] Filled greater than openings by one is refused", () => {
  assertRejected({ openings: 3, filled: 4 });
});

test("[unhappy-2] One filled opening is refused when there are no openings", () => {
  assertRejected({ openings: 0, filled: 1 });
});

test("[unhappy-2] An invalid creation Date is refused with the requisition id", () => {
  assertRejected({ createdAt: new Date(Number.NaN) });
});

test("[unhappy-2] An invalid record after a valid record names its own id in the error", () => {
  const invalid = requisition({ id: "invalid-second-record", status: "unknown" });
  assert.throws(
    () => buildRequisitionsCsv([
      requisition({ id: "valid-first-record" }),
      invalid,
      requisition({ id: "valid-last-record" }),
    ]),
    (error: unknown) => error instanceof Error && error.message.includes(invalid.id),
  );
});

test("[unhappy-2] Zero counts and filled equal to openings are accepted at the validation boundaries", () => {
  assert.equal(
    buildRequisitionsCsv([
      requisition({ id: "a", openings: 0, filled: 0 }),
      requisition({ id: "b", openings: 3, filled: 3 }),
    ]),
    "\uFEFFRequisition ID,Title,Status,Openings,Filled,Created\r\n" +
      "a,Engineer,Open,0,0,2025-06-15\r\n" +
      "b,Engineer,Open,3,3,2025-06-15\r\n",
  );
});
