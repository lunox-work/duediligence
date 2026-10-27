import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequisitionsCsv, type Requisition } from "../../src/index.js";

function record(overrides: Partial<Requisition> = {}): Requisition {
  return {
    id: "private-invalid", title: "Supervisor", status: "on_hold", openings: 37, filled: 11,
    createdAt: new Date("2033-07-10T12:00:00Z"), ...overrides,
  };
}

// Each case uses one invalid record, so it does not prescribe which error wins
// if several invalid records are supplied. Input order and sorted order differ.
function rejects(overrides: Partial<Requisition>, id: string, position = 17): void {
  const invalid = record({ ...overrides, id });
  const batch = Array.from({ length: 37 }, (_, i) => record({
    id: `valid-${String(i).padStart(3, "0")}`,
    status: ["open", "on_hold", "filled", "cancelled"][i % 4],
    openings: i * 100,
    filled: i * 10,
    createdAt: new Date(Date.UTC(2033, 6, 1 + ((i * 13) % 28))),
  }));
  batch.splice(position, 0, invalid);
  assert.throws(() => buildRequisitionsCsv(batch), (error: unknown) =>
    error instanceof Error && error.message.includes(id));
}

// Extends public: An unknown status is refused with the requisition id.
test("[unhappy-2] Other unknown statuses embedded in a larger batch name the offending record", () => {
  for (const status of ["closed", "draft", "OPEN", "on-hold", "canceled"]) {
    rejects({ status }, `unknown-status-${status}`, 29);
  }
});

// Extends public: An empty status is refused with the requisition id.
test("[unhappy-2] An empty status at the end of a large otherwise valid input is rejected", () => {
  rejects({ status: "" }, "empty-status-at-the-end", 37);
});

// Extends public: An empty status is refused with the requisition id.
test("[unhappy-2] Whitespace-only statuses and padded valid statuses are unknown", () => {
  for (const [i, status] of [" ", "\t", "\r\n", " open", "open ", "on_hold ", "filled\n"].entries()) {
    rejects({ status }, `whitespace-status-${i}`, i);
  }
});

// Extends public: A display label is not a valid status value.
test("[unhappy-2] All other display labels remain invalid input statuses", () => {
  for (const [i, status] of ["On hold", "Filled", "Cancelled"].entries()) {
    rejects({ status }, `display-label-${i}`, 34 + i);
  }
});

// Extends public: An unknown status is refused with the requisition id.
test("[unhappy-2] Object prototype property names are unknown statuses", () => {
  for (const status of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
    rejects({ status }, `prototype-status-${status}`, 0);
  }
});

// Extends public: Negative openings are refused.
test("[unhappy-2] Negative openings including a tiny negative fraction are not clamped to zero", () => {
  for (const [i, openings] of [-2, -4294967296, -Number.MIN_VALUE].entries()) {
    rejects({ openings, filled: 0 }, `negative-openings-${i}`, 37);
  }
});

// Extends public: Fractional openings are refused even when filled fits.
test("[unhappy-2] Fractional openings near an integer and far above the public example are rejected", () => {
  for (const [i, openings] of [Number.MIN_VALUE, 1 + Number.EPSILON, 987654.125, 4294967296.5].entries()) {
    rejects({ openings, filled: 0 }, `fraction-openings-${i}`, 11 + i);
  }
});

// Extends public: NaN openings are refused.
test("[unhappy-2] NaN openings are rejected in a final record even with zero filled", () => {
  rejects({ openings: Number.NaN, filled: 0 }, "nan-openings-last", 37);
});

// Extends public: Positive infinite openings are refused.
test("[unhappy-2] Positive infinite openings are invalid even when filled is a large finite integer", () => {
  rejects({ openings: Number.POSITIVE_INFINITY, filled: 4294967296 }, "infinite-openings-middle", 21);
});

// Extends public: Negative infinite openings are refused.
test("[unhappy-2] Negative infinite openings in a noninitial record name that record", () => {
  rejects({ openings: Number.NEGATIVE_INFINITY, filled: 0 }, "negative-infinite-openings-late", 35);
});

// Extends public: Negative filled counts are refused.
test("[unhappy-2] Negative filled counts including tiny fractions are not rounded or clamped", () => {
  for (const [i, filled] of [-2, -987654321, -Number.MIN_VALUE].entries()) {
    rejects({ filled }, `negative-filled-${i}`, 15 + i);
  }
});

// Extends public: Fractional filled counts are refused.
test("[unhappy-2] Fractional filled values that fit below a large openings count are still invalid", () => {
  for (const [i, filled] of [Number.MIN_VALUE, 1 + Number.EPSILON, 987654.125, 4294967296.5].entries()) {
    rejects({ openings: 1e12, filled }, `fraction-filled-${i}`, 33 + i);
  }
});

// Extends public: NaN filled counts are refused.
test("[unhappy-2] NaN filled counts are rejected even at the zero-openings boundary", () => {
  rejects({ openings: 0, filled: Number.NaN }, "nan-filled-zero-openings", 25);
});

// Extends public: Positive infinite filled counts are refused.
test("[unhappy-2] Infinite filled counts fail for a large finite openings count in a later record", () => {
  rejects({ openings: 1e22, filled: Number.POSITIVE_INFINITY }, "infinite-filled-later", 36);
});

// Extends public: Negative infinite filled counts are refused.
test("[unhappy-2] Negative infinite filled counts fail when openings is zero", () => {
  rejects({ openings: 0, filled: Number.NEGATIVE_INFINITY }, "negative-infinite-filled-zero", 22);
});

// Extends public: Positive infinite openings are refused.
// Extends public: Positive infinite filled counts are refused.
test("[unhappy-2] Equal nonfinite counts are invalid even though filled does not compare greater than openings", () => {
  rejects({ openings: Number.POSITIVE_INFINITY, filled: Number.POSITIVE_INFINITY }, "equal-infinite-counts", 14);
  rejects({ openings: Number.NaN, filled: Number.NaN }, "both-nan-counts", 28);
});

// Extends public: Filled greater than openings by one is refused.
test("[unhappy-2] Filled one above openings is rejected beyond 32 bit integer ranges", () => {
  rejects({ openings: 4294967296, filled: 4294967297 }, "large-overfilled-by-one", 37);
  rejects({ openings: 2147483647, filled: 2147483648 }, "signed-overfilled-by-one", 0);
});

// Extends public: One filled opening is refused when there are no openings.
test("[unhappy-2] Zero openings also refuses larger positive filled values regardless of status", () => {
  for (const [i, status] of ["open", "on_hold", "filled", "cancelled"].entries()) {
    rejects({ status, openings: 0, filled: 40 + i }, `zero-openings-status-${i}`, 12 + i);
  }
});

// Extends public: Filled greater than openings by one is refused.
test("[unhappy-2] Large overfill differences cannot be hidden by truncation or separate count validation", () => {
  rejects({ openings: 1, filled: 4294967297 }, "wrapped-overfill", 19);
  rejects({ openings: 123456, filled: 999999999 }, "wide-overfill", 32);
});

// Extends public: An invalid creation Date is refused with the requisition id.
test("[unhappy-2] Dates outside the Date range are invalid and name their own record", () => {
  rejects({ createdAt: new Date(8640000000000001) }, "date-above-range", 37);
  rejects({ createdAt: new Date(-8640000000000001) }, "date-below-range", 0);
});

// Extends public: An invalid creation Date is refused with the requisition id.
test("[unhappy-2] Invalid parsed and subsequently invalidated Dates fail inside a larger batch", () => {
  rejects({ createdAt: new Date("definitely not a creation time") }, "unparseable-date", 24);
  const changed = new Date("2033-07-10T00:00:00Z");
  changed.setTime(Number.NaN);
  rejects({ createdAt: changed }, "invalidated-date", 18);
});

// Extends public: An invalid record after a valid record names its own id in the error.
test("[unhappy-2] Validation reaches the last record of a much longer export for every invalid field", () => {
  const defects: ReadonlyArray<Partial<Requisition>> = [
    { status: "archived" }, { openings: 2.25, filled: 0 }, { filled: -13 },
    { openings: 5, filled: 6 }, { createdAt: new Date(Number.NaN) },
  ];
  for (const [i, defect] of defects.entries()) {
    const invalid = record({ ...defect, id: `last-invalid-field-${i}` });
    const rows = Array.from({ length: 256 }, (_, j) => record({
      id: `accepted-${String(j).padStart(3, "0")}`,
      createdAt: new Date(Date.UTC(2033, 6, 1) + j * 1000),
    }));
    rows.push(invalid);
    assert.throws(() => buildRequisitionsCsv(rows), (error: unknown) =>
      error instanceof Error && error.message.includes(invalid.id));
  }
});

// Extends public: An invalid record after a valid record names its own id in the error.
test("[unhappy-2] An invalid earliest record after valid inputs cannot be skipped while sorting", () => {
  rejects({ status: "retired", createdAt: new Date("1901-01-01T00:00:00Z") }, "earliest-invalid-record", 30);
});

// Extends public: An unknown status is refused with the requisition id.
test("[unhappy-2] A valid title needing defusing and escaping cannot mask an invalid status", () => {
  rejects({ status: "no-such-status", title: '=IF(1,"東京","Team")\r\nNext ' }, "invalid-status-with-complex-title", 31);
});
