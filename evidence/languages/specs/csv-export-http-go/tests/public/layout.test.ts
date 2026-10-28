import { test } from "node:test";
import assert from "node:assert/strict";
import type { Requisition } from "./contract.js";

const BOM = [0xef, 0xbb, 0xbf];
const HEADER = "Requisition ID,Title,Status,Openings,Filled,Created";
const CSV_TYPE = "text/csv; charset=utf-8";
const CSV_DISPOSITION = 'attachment; filename="requisitions.csv"';

/** A valid requisition, written as the row "<id>,Nurse,Open,1,0,2026-03-01". */
function requisition(id: string, overrides: Record<string, unknown> = {}): Requisition {
  return {
    id,
    title: "Nurse",
    status: "open",
    openings: 1,
    filled: 0,
    createdAt: "2026-03-01T09:00:00Z",
    ...overrides,
  } as Requisition;
}

function send(path: string, init: Record<string, unknown> = {}): Promise<any> {
  return fetch(new URL(path, process.env.BOUNDARY_URL), init);
}

/** POSTs the raw text as the body of /requisitions.csv. */
function postText(text: string): Promise<any> {
  return send("/requisitions.csv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: text,
  });
}

/** POSTs the value, written as JSON, to /requisitions.csv. */
function postJson(body: unknown): Promise<any> {
  return postText(JSON.stringify(body));
}

/** Asserts a 200 CSV answer whose body is the BOM, the header and the rows, each ending "\r\n". */
async function assertCsv(res: any, rows: string[]): Promise<void> {
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), CSV_TYPE);
  assert.equal(res.headers.get("content-disposition"), CSV_DISPOSITION);
  assert.deepEqual([...bytes.subarray(0, 3)], BOM, "the body starts with the byte order mark");
  const text = [HEADER, ...rows].map((row) => `${row}\r\n`).join("");
  assert.equal(bytes.subarray(3).toString("utf8"), text);
  assert.ok(bytes.equals(Buffer.concat([Buffer.from(BOM), Buffer.from(text, "utf8")])));
}

test("[happy-1] the BOM, the header row and one row per requisition, each ending CRLF", async () => {
  const res = await postJson([
    requisition("r1", { title: "Nurse", createdAt: "2026-03-01T09:00:00Z" }),
    requisition("r2", { title: "Welder", createdAt: "2026-03-02T09:00:00Z" }),
  ]);
  await assertCsv(res, ["r1,Nurse,Open,1,0,2026-03-01", "r2,Welder,Open,1,0,2026-03-02"]);
});

test("[happy-1] rows are sorted by creation time, not by request order", async () => {
  const res = await postJson([
    requisition("c", { createdAt: "2026-03-03T09:00:00Z" }),
    requisition("a", { createdAt: "2026-03-01T09:00:00Z" }),
    requisition("b", { createdAt: "2026-03-02T09:00:00Z" }),
  ]);
  await assertCsv(res, [
    "a,Nurse,Open,1,0,2026-03-01",
    "b,Nurse,Open,1,0,2026-03-02",
    "c,Nurse,Open,1,0,2026-03-03",
  ]);
});

test("[happy-1] creation time is compared as an instant, offsets and fractional seconds included", async () => {
  const res = await postJson([
    // 2026-03-01T00:00:00.5Z
    requisition("z", { createdAt: "2026-03-01T00:00:00.500Z" }),
    // 2026-03-01T00:00:00Z
    requisition("y", { createdAt: "2026-03-01T00:00:00Z" }),
    // 2026-02-28T23:30:00Z: the earliest, though it reads latest
    requisition("x", { createdAt: "2026-03-01T01:30:00+02:00" }),
  ]);
  await assertCsv(res, [
    "x,Nurse,Open,1,0,2026-02-28",
    "y,Nurse,Open,1,0,2026-03-01",
    "z,Nurse,Open,1,0,2026-03-01",
  ]);
});

test("[happy-1] requisitions created at the same instant are ordered by id compared as strings", async () => {
  const res = await postJson([
    requisition("9", { createdAt: "2026-03-01T10:00:00Z" }),
    requisition("10", { createdAt: "2026-03-01T12:00:00+02:00" }),
    requisition("100", { createdAt: "2026-03-01T10:00:00.000Z" }),
  ]);
  await assertCsv(res, [
    "10,Nurse,Open,1,0,2026-03-01",
    "100,Nurse,Open,1,0,2026-03-01",
    "9,Nurse,Open,1,0,2026-03-01",
  ]);
});

test("[happy-2] statuses, numbers, dates and titles are written for people to read", async () => {
  const res = await postJson([
    requisition("r1", { title: "Nurse", status: "open", openings: 3, filled: 1, createdAt: "2026-03-01T09:00:00Z" }),
    requisition("r2", { title: "Welder", status: "on_hold", openings: 2, filled: 0, createdAt: "2026-03-02T09:00:00Z" }),
    requisition("r3", { title: "Driver", status: "filled", openings: 1000000, filled: 1000000, createdAt: "2026-03-03T09:00:00Z" }),
    requisition("r4", { title: "Cook", status: "cancelled", openings: 12, filled: 7, createdAt: "2026-03-04T09:00:00Z" }),
  ]);
  await assertCsv(res, [
    "r1,Nurse,Open,3,1,2026-03-01",
    "r2,Welder,On hold,2,0,2026-03-02",
    "r3,Driver,Filled,1000000,1000000,2026-03-03",
    "r4,Cook,Cancelled,12,7,2026-03-04",
  ]);
});

test("[happy-2] a null or absent title is an empty field", async () => {
  const absent = requisition("r2", { createdAt: "2026-03-02T09:00:00Z" });
  delete absent.title;
  const res = await postJson([requisition("r1", { title: null }), absent]);
  await assertCsv(res, ["r1,,Open,1,0,2026-03-01", "r2,,Open,1,0,2026-03-02"]);
});

test("[happy-2] the creation date is the UTC date, across a day, a month and a year", async () => {
  const res = await postJson([
    requisition("a", { createdAt: "2026-01-01T00:30:00+01:00" }),
    requisition("b", { createdAt: "2026-03-01T01:30:00+02:00" }),
    requisition("c", { createdAt: "2026-03-01T23:59:59.999Z" }),
    requisition("d", { createdAt: "2026-12-31T23:30:00-01:00" }),
  ]);
  await assertCsv(res, [
    "a,Nurse,Open,1,0,2025-12-31",
    "b,Nurse,Open,1,0,2026-02-28",
    "c,Nurse,Open,1,0,2026-03-01",
    "d,Nurse,Open,1,0,2027-01-01",
  ]);
});

test("[happy-2] zero openings and zero filled are written 0, and a leap day is a real date", async () => {
  const res = await postJson([requisition("r1", { openings: 0, filled: 0, createdAt: "2028-02-29T12:00:00Z" })]);
  await assertCsv(res, ["r1,Nurse,Open,0,0,2028-02-29"]);
});

test("[boundary-1] an empty array gives the BOM and the header row alone", async () => {
  const res = await postJson([]);
  await assertCsv(res, []);
});

test("[boundary-1] an empty array surrounded by JSON whitespace gives the header row alone", async () => {
  const res = await postText(" \r\n[ \n ]\t\n");
  await assertCsv(res, []);
});
