import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequisitionsCsv, type Requisition } from "../../src/index.js";

const header = "\uFEFFRequisition ID,Title,Status,Openings,Filled,Created\r\n";

function record(overrides: Partial<Requisition> = {}): Requisition {
  return {
    id: "private-layout",
    title: "Coordinator",
    status: "open",
    openings: 8,
    filled: 2,
    createdAt: new Date("2032-02-29T12:34:56.789Z"),
    ...overrides,
  };
}

// Extends public: One requisition follows the BOM and fixed header with a final CRLF.
test("[happy-1] Several distinct rows have one BOM, the exact header, and a final CRLF each", () => {
  assert.equal(buildRequisitionsCsv([
    record({ id: "third", title: "Third", createdAt: new Date("2032-03-02T00:00:00Z") }),
    record({ id: "first", title: "First", createdAt: new Date("2032-02-28T23:59:59Z") }),
    record({ id: "second", title: "Second" }),
  ]), header +
    "first,First,Open,8,2,2032-02-28\r\n" +
    "second,Second,Open,8,2,2032-02-29\r\n" +
    "third,Third,Open,8,2,2032-03-02\r\n");
});

// Extends public: Rows sort by creation time and then id when times are equal.
test("[happy-1] A shuffled batch sorts all time groups and all ids within each group", () => {
  const ordered = Array.from({ length: 72 }, (_, i) => record({
    id: `item-${String(i % 12).padStart(2, "0")}`,
    title: `Role ${i}`,
    createdAt: new Date(Date.UTC(2032, 1, 24 + Math.floor(i / 12))),
  }));
  // Multiplication by 29 permutes all 72 positions.
  const shuffled = ordered.map((_, i) => ordered[(i * 29) % ordered.length]);
  const expected = ordered.map((r) =>
    `${r.id},${r.title},Open,8,2,${r.createdAt.toISOString().slice(0, 10)}\r\n`).join("");
  assert.equal(buildRequisitionsCsv(shuffled), header + expected);
});

// Extends public: Distinct instants on the same UTC date sort before applying the id tie breaker.
test("[happy-1] Millisecond ordering works before and after the Unix epoch with opposing ids", () => {
  const ordered = [
    record({ id: "z", createdAt: new Date(-1001) }),
    record({ id: "y", createdAt: new Date(-1000) }),
    record({ id: "x", createdAt: new Date(-1) }),
    record({ id: "c", createdAt: new Date(0) }),
    record({ id: "b", createdAt: new Date(1) }),
    record({ id: "a", createdAt: new Date(1000) }),
  ];
  assert.equal(buildRequisitionsCsv([...ordered].reverse()), header +
    "z,Coordinator,Open,8,2,1969-12-31\r\n" +
    "y,Coordinator,Open,8,2,1969-12-31\r\n" +
    "x,Coordinator,Open,8,2,1969-12-31\r\n" +
    "c,Coordinator,Open,8,2,1970-01-01\r\n" +
    "b,Coordinator,Open,8,2,1970-01-01\r\n" +
    "a,Coordinator,Open,8,2,1970-01-01\r\n");
});

// Extends public: Rows sort by creation time and then id when times are equal.
test("[happy-1] Different offset representations of the same instant use the id tie breaker", () => {
  assert.equal(buildRequisitionsCsv([
    record({ id: "zeta", createdAt: new Date("2030-06-01T03:45:00+05:45") }),
    record({ id: "alpha", createdAt: new Date("2030-05-31T18:00:00-04:00") }),
    record({ id: "middle", createdAt: new Date("2030-05-31T22:00:00Z") }),
  ]), header +
    "alpha,Coordinator,Open,8,2,2030-05-31\r\n" +
    "middle,Coordinator,Open,8,2,2030-05-31\r\n" +
    "zeta,Coordinator,Open,8,2,2030-05-31\r\n");
});

// Extends public: One requisition follows the BOM and fixed header with a final CRLF.
test("[happy-1] One row per input preserves duplicate requisitions and repeated ids", () => {
  const duplicate = record({ id: "repeated", title: "Same" });
  assert.equal(buildRequisitionsCsv([
    record({ id: "repeated", title: "Later", createdAt: new Date("2032-03-01T00:00:00Z") }),
    duplicate,
    { ...duplicate, createdAt: new Date(duplicate.createdAt.getTime()) },
  ]), header +
    "repeated,Same,Open,8,2,2032-02-29\r\n" +
    "repeated,Same,Open,8,2,2032-02-29\r\n" +
    "repeated,Later,Open,8,2,2032-03-01\r\n");
});

// Extends public: All four statuses use their human readable labels.
test("[happy-2] Labels stay attached to records when every status appears repeatedly in a shuffled batch", () => {
  const statuses = ["cancelled", "filled", "on_hold", "open"];
  const labels = ["Cancelled", "Filled", "On hold", "Open"];
  const ordered = Array.from({ length: 16 }, (_, i) => record({
    id: `status-${String(i).padStart(2, "0")}`,
    status: statuses[i % 4],
    title: `Position ${i}`,
    openings: i,
    filled: i,
  }));
  const expected = ordered.map((r, i) =>
    `${r.id},Position ${i},${labels[i % 4]},${i},${i},2032-02-29\r\n`).join("");
  assert.equal(buildRequisitionsCsv([...ordered].reverse()), header + expected);
});

// Extends public: An absent title, null title and empty title are empty fields.
test("[happy-2] Missing titles mixed with literal null and undefined text do not leak previous titles", () => {
  const { title: omitted, ...missing } = record({ id: "b" });
  const records = [
    record({ id: "a", title: "null" }), missing,
    record({ id: "c", title: "undefined" }), record({ id: "d", title: null }),
    record({ id: "e", title: "0" }), record({ id: "f", title: "" }),
    record({ id: "g", title: "false" }), record({ id: "h", title: undefined }),
  ];
  assert.equal(buildRequisitionsCsv([...records].reverse()), header +
    "a,null,Open,8,2,2032-02-29\r\n" +
    "b,,Open,8,2,2032-02-29\r\n" +
    "c,undefined,Open,8,2,2032-02-29\r\n" +
    "d,,Open,8,2,2032-02-29\r\n" +
    "e,0,Open,8,2,2032-02-29\r\n" +
    "f,,Open,8,2,2032-02-29\r\n" +
    "g,false,Open,8,2,2032-02-29\r\n" +
    "h,,Open,8,2,2032-02-29\r\n");
});

// Extends public: Creation dates use UTC across a year boundary and pad month and day.
test("[happy-2] UTC dates cross leap day and month boundaries with non-hour offsets", () => {
  assert.equal(buildRequisitionsCsv([
    record({ id: "d", createdAt: new Date("2032-03-01T00:15:00-03:30") }),
    record({ id: "b", createdAt: new Date("2032-03-01T00:15:00+05:45") }),
    record({ id: "a", createdAt: new Date("2032-02-29T00:15:00+05:45") }),
    record({ id: "c", createdAt: new Date("2032-02-29T23:45:00-03:30") }),
  ]), header +
    "a,Coordinator,Open,8,2,2032-02-28\r\n" +
    "b,Coordinator,Open,8,2,2032-02-29\r\n" +
    "c,Coordinator,Open,8,2,2032-03-01\r\n" +
    "d,Coordinator,Open,8,2,2032-03-01\r\n");
});

// Extends public: Creation dates use UTC across a year boundary and pad month and day.
test("[happy-2] Four digit UTC years preserve leading zeroes and the full century", () => {
  const dates = ["0001-01-02", "0099-09-09", "1900-03-01", "2000-02-29", "9999-12-31"];
  const records = dates.map((date, i) => record({ id: `year-${i}`, createdAt: new Date(`${date}T00:00:00Z`) }));
  assert.equal(buildRequisitionsCsv([...records].reverse()), header +
    dates.map((date, i) => `year-${i},Coordinator,Open,8,2,${date}\r\n`).join(""));
});

// Extends public: Zero and multi digit counts are plain digits without separators.
test("[happy-2] Counts beyond 32 bit ranges and at the largest safe integer remain plain digits", () => {
  assert.equal(buildRequisitionsCsv([
    record({ id: "a", openings: 2147483648, filled: 2147483647 }),
    record({ id: "b", openings: 4294967296, filled: 4294967295 }),
    record({ id: "c", openings: Number.MAX_SAFE_INTEGER, filled: 0 }),
  ]), header +
    "a,Coordinator,Open,2147483648,2147483647,2032-02-29\r\n" +
    "b,Coordinator,Open,4294967296,4294967295,2032-02-29\r\n" +
    "c,Coordinator,Open,9007199254740991,0,2032-02-29\r\n");
});

// Extends public: Large whole number counts are digits rather than exponent notation.
test("[happy-2] Multiple exponent-form whole counts use their full decimal digits in both columns", () => {
  assert.equal(buildRequisitionsCsv([
    record({ id: "a", openings: 1e22, filled: 5e21 }),
    record({ id: "b", openings: 5e21, filled: 1e20 }),
  ]), header +
    "a,Coordinator,Open,10000000000000000000000,5000000000000000000000,2032-02-29\r\n" +
    "b,Coordinator,Open,5000000000000000000000,100000000000000000000,2032-02-29\r\n");
});

// Extends public: Zero counts and filled equal to openings are accepted at the validation boundaries.
test("[happy-2] Every status permits zero counts and equality at larger whole counts", () => {
  const statuses = ["open", "on_hold", "filled", "cancelled"];
  const labels = ["Open", "On hold", "Filled", "Cancelled"];
  const records = statuses.flatMap((status, i) => [
    record({ id: `edge-${i}-a`, status, openings: 0, filled: 0 }),
    record({ id: `edge-${i}-b`, status, openings: 4294967296, filled: 4294967296 }),
  ]);
  const expected = labels.map((label, i) =>
    `edge-${i}-a,Coordinator,${label},0,0,2032-02-29\r\n` +
    `edge-${i}-b,Coordinator,${label},4294967296,4294967296,2032-02-29\r\n`).join("");
  assert.equal(buildRequisitionsCsv([...records].reverse()), header + expected);
});

// Extends public: Zero counts and filled equal to openings are accepted at the validation boundaries.
test("[happy-2] Negative zero is a whole zero count and is rendered as a plain zero", () => {
  assert.equal(buildRequisitionsCsv([
    record({ id: "a", openings: -0, filled: -0 }),
    record({ id: "b", openings: 15, filled: -0 }),
  ]), header +
    "a,Coordinator,Open,0,0,2032-02-29\r\n" +
    "b,Coordinator,Open,15,0,2032-02-29\r\n");
});

// Extends public: No requisitions produces exactly the BOM and header row.
test("[boundary-1] Empty exports after several populated exports contain only their own header", () => {
  for (let i = 0; i < 4; i++) {
    const r = record({ id: `previous-${i}`, title: `Previous ${i}` });
    assert.equal(buildRequisitionsCsv([r]), header + `previous-${i},Previous ${i},Open,8,2,2032-02-29\r\n`);
    assert.equal(buildRequisitionsCsv([]), header);
  }
});

// Extends public: The transition from zero records to one adds exactly one data row.
test("[boundary-1] Alternating empty and multiple-row exports never carries rows into an empty export", () => {
  assert.equal(buildRequisitionsCsv([]), header);
  const rows = Array.from({ length: 5 }, (_, i) => record({ id: `transition-${i}` }));
  assert.equal(buildRequisitionsCsv(rows), header + rows.map((r) =>
    `${r.id},Coordinator,Open,8,2,2032-02-29\r\n`).join(""));
  assert.equal(buildRequisitionsCsv([]), header);
  assert.equal(buildRequisitionsCsv([record({ id: "fresh" })]), header + "fresh,Coordinator,Open,8,2,2032-02-29\r\n");
  assert.equal(buildRequisitionsCsv([]), header);
});
