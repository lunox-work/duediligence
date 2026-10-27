import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatuses } from "../../src/index.js";
import type { ReadStatusRow, SandboxStatus, StoredStatusRow } from "../../src/index.js";

// Row order is unspecified. Compare multisets, retaining repeated ids and rows.
function assertRows(actual: ReadStatusRow[], expected: ReadStatusRow[]): void {
  const entries = (rows: ReadStatusRow[]) => rows.map((row) => JSON.stringify([row.id, row.status])).sort();
  assert.deepEqual(entries(actual), entries(expected));
}

const readable = [
  ["dRaFt", "draft"], ["ReViEw", "review"], ["pUbLiShEd", "published"],
  ["ClAiMeD", "claimed"], ["mErGeD", "merged"],
  ["  iN_- --__rEvIeW  ", "review"], ["UnDeR -__ ReViEw", "review"],
  [" rEvIeWiNg ", "review"], [" LiVe ", "published"], ["pUbLiC", "published"],
  ["aSsIgNeD", "claimed"], [" TaKeN ", "claimed"], ["dOnE", "merged"],
  ["CoMpLeTe", "merged"], [" cOmPlEtEd ", "merged"],
] as const;

// Extends public "reads mixed rows and reports sorted distinct original unreadable values".
test("[happy-4] reads a large mixed table without limiting rows or unique unreadable values", () => {
  const rows: StoredStatusRow[] = [];
  const expected: ReadStatusRow[] = [];
  const unknowns = Array.from({ length: 130 }, (_, index) =>
    `unknown ${String(index).padStart(3, "0")}`,
  );
  for (let round = 0; round < 40; round++) {
    for (const [stored, status] of readable) {
      const id = `recognized-${round}-${rows.length}`;
      rows.push({ id, status: stored });
      expected.push({ id, status });
    }
    for (let index = unknowns.length - 1; index >= 0; index--) {
      const id = `unrecognized-${round}-${index}`;
      rows.push({ id, status: unknowns[index] });
      expected.push({ id, status: null });
    }
  }
  const result = readStatuses(rows);
  assertRows(result.rows, expected);
  assert.deepEqual(result.unreadable, unknowns);
});

// Extends public "reads mixed rows and reports sorted distinct original unreadable values".
test("[happy-4] associates results with ids across reversed and rotated input orders", () => {
  const cases = [...readable, ["unrecognized", null], ["other unknown", null]] as const;
  const input = cases.map(([status], index) => ({ id: `id-${index}`, status }));
  const expected = cases.map(([, status], index) => ({ id: `id-${index}`, status }));
  for (const order of [input, [...input].reverse(), [...input.slice(7), ...input.slice(0, 7)]]) {
    const result = readStatuses(order.map((row) => ({ ...row })));
    assertRows(result.rows, expected);
    assert.deepEqual(result.unreadable, ["other unknown", "unrecognized"]);
  }
});

// Extends public "reads mixed rows and reports sorted distinct original unreadable values".
test("[happy-4] preserves every row even when identifiers repeat or resemble object keys", () => {
  const input = [
    { id: "same", status: "done" }, { id: "same", status: "Draft" },
    { id: "same", status: "unknown" }, { id: "", status: "LIVE" },
    { id: "", status: "assigned" }, { id: "__proto__", status: "in_review" },
    { id: "constructor", status: "complete" }, { id: "toString", status: "review" },
    { id: "01", status: "draft" }, { id: "1", status: "merged" },
  ];
  const result = readStatuses(input);
  assertRows(result.rows, [
    { id: "same", status: "merged" }, { id: "same", status: "draft" },
    { id: "same", status: null }, { id: "", status: "published" },
    { id: "", status: "claimed" }, { id: "__proto__", status: "review" },
    { id: "constructor", status: "merged" }, { id: "toString", status: "review" },
    { id: "01", status: "draft" }, { id: "1", status: "merged" },
  ]);
  assert.deepEqual(result.unreadable, ["unknown"]);
});

// Extends public "reads mixed rows and reports sorted distinct original unreadable values".
test("[happy-4] deduplicates unreadable values while retaining identical repeated rows", () => {
  const rows = Array.from({ length: 128 }, () => ({ id: "duplicate", status: "not a status" }));
  const result = readStatuses(rows);
  assertRows(result.rows, Array.from({ length: 128 }, () => ({ id: "duplicate", status: null })));
  assert.deepEqual(result.unreadable, ["not a status"]);
});

// Extends public "reads mixed rows and reports sorted distinct original unreadable values".
test("[happy-4] distinguishes original unknown values that have identical cleaned text", () => {
  const originals = ["stop", " stop ", "  stop", "stop  ", "stop ", " stop"];
  const rows = [...originals, ...originals.slice().reverse()].map((status, index) => ({
    id: `original-${index}`, status,
  }));
  const expected = rows.map(({ id }) => ({ id, status: null }));
  const result = readStatuses(rows);
  assertRows(result.rows, expected);
  assert.deepEqual(result.unreadable, [...originals].sort());
});

// Extends public "reads mixed rows and reports sorted distinct original unreadable values".
test("[happy-4] sorts distinct unreadable originals independently of first and last occurrence", () => {
  const originals = ["zebra", "lambda", "beta", "zebra", "omicron", "alpha", "lambda", "beta"];
  for (const values of [originals, [...originals].reverse()]) {
    const rows = values.map((status, index) => ({ id: String(index), status }));
    const expected = rows.map(({ id }) => ({ id, status: null }));
    const result = readStatuses(rows);
    assertRows(result.rows, expected);
    assert.deepEqual(result.unreadable, ["alpha", "beta", "lambda", "omicron", "zebra"]);
  }
});

// Extends public "reads mixed rows and reports sorted distinct original unreadable values".
test("[happy-4] reports singleton unknown empty and whitespace originals exactly", () => {
  for (const status of ["another unknown", "", " ", "     ", "_-_--", "\t\r\n"]) {
    const result = readStatuses([{ id: "singleton", status }]);
    assertRows(result.rows, [{ id: "singleton", status: null }]);
    assert.deepEqual(result.unreadable, [status]);
  }
});

// Extends public "returns no unreadable values when every stored value is recognized".
test("[happy-4] reads hundreds of recognized rows spanning every status and legacy spelling", () => {
  const rows: StoredStatusRow[] = [];
  const expected: ReadStatusRow[] = [];
  for (let round = 0; round < 30; round++) {
    for (const [stored, status] of [...readable].reverse()) {
      const id = `known-${rows.length}`;
      rows.push({ id, status: stored });
      expected.push({ id, status });
    }
  }
  const result = readStatuses(rows);
  assertRows(result.rows, expected);
  assert.deepEqual(result.unreadable, []);
});

// Extends public "reads mixed rows and reports sorted distinct original unreadable values".
test("[happy-4] keeps every row in a table with no recognized values", () => {
  const unknowns = ["constructor", "pending", "drafts", "reviewed", "publish", "in/review"];
  const rows = Array.from({ length: 240 }, (_, index) => ({
    id: `invalid-${index}`, status: unknowns[index % unknowns.length],
  }));
  const expected = rows.map(({ id }) => ({ id, status: null }));
  const result = readStatuses(rows);
  assertRows(result.rows, expected);
  assert.deepEqual(result.unreadable, [...unknowns].sort());
});

// Extends public "returns empty rows and unreadable values for an empty table".
test("[happy-4] empty reads stay empty before and after populated batch reads", () => {
  for (let round = 0; round < 3; round++) {
    const empty = readStatuses([]);
    assert.deepEqual(empty.rows, []);
    assert.deepEqual(empty.unreadable, []);
    const populated = readStatuses([
      { id: "known", status: "public" }, { id: "unknown", status: "unreadable" },
    ]);
    assertRows(populated.rows, [{ id: "known", status: "published" }, { id: "unknown", status: null }]);
    assert.deepEqual(populated.unreadable, ["unreadable"]);
  }
  const empty = readStatuses([]);
  assert.deepEqual(empty.rows, []);
  assert.deepEqual(empty.unreadable, []);
});

// Extends public "returns no unreadable values when every stored value is recognized".
test("[happy-4] successive populated batches report only their own unreadable originals", () => {
  const cases = [
    ["first unknown", null], ["DONE", "merged"], ["second unknown", null],
    ["TAKEN", "claimed"], ["first unknown", null], ["under---review", "review"],
  ] as const;
  for (const [stored, status] of cases) {
    const result = readStatuses([{ id: "reused-id", status: stored }]);
    assertRows(result.rows, [{ id: "reused-id", status }]);
    assert.deepEqual(result.unreadable, status === null ? [stored] : []);
  }
});

// Extends public "reads mixed rows and reports sorted distinct original unreadable values".
test("[happy-4] retains long unreadable originals and recognizes long separator runs in the same batch", () => {
  const original = "  INVALID-" + "x".repeat(20000) + "_END  ";
  const result = readStatuses([
    { id: "long-unknown-a", status: original },
    { id: "long-known", status: "UNDER" + "_ - ".repeat(4096) + "REVIEW" },
    { id: "long-unknown-b", status: original },
  ]);
  assertRows(result.rows, [
    { id: "long-unknown-a", status: null }, { id: "long-known", status: "review" },
    { id: "long-unknown-b", status: null },
  ]);
  assert.deepEqual(result.unreadable, [original]);
});

// Extends public "reads mixed rows and reports sorted distinct original unreadable values".
test("[happy-4] does not reuse a preceding row status for later unreadable rows", () => {
  const rows: StoredStatusRow[] = [];
  const expected: ReadStatusRow[] = [];
  const canonical: SandboxStatus[] = ["merged", "claimed", "review", "draft", "published"];
  for (const status of canonical) {
    for (const [suffix, stored, decoded] of [
      ["before", "missing", null], ["known", status, status], ["after", "missing", null],
    ] as const) {
      const id = `${status}-${suffix}`;
      rows.push({ id, status: stored });
      expected.push({ id, status: decoded });
    }
  }
  const result = readStatuses(rows);
  assertRows(result.rows, expected);
  assert.deepEqual(result.unreadable, ["missing"]);
});
