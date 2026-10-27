import { test } from "node:test";
import assert from "node:assert/strict";
import type { Requisition } from "../../src/server.js";

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

test("[boundary-2] a title holding a comma is wrapped in double quotes", async () => {
  const res = await postJson([requisition("r1", { title: "Nurse, night shift" })]);
  await assertCsv(res, ['r1,"Nurse, night shift",Open,1,0,2026-03-01']);
});

test("[boundary-2] a double quote inside a field is written twice and the field is quoted", async () => {
  const res = await postJson([
    requisition("r1", { title: 'The "best" nurse', createdAt: "2026-03-01T09:00:00Z" }),
    requisition("r2", { title: '"', createdAt: "2026-03-02T09:00:00Z" }),
  ]);
  await assertCsv(res, ['r1,"The ""best"" nurse",Open,1,0,2026-03-01', 'r2,"""",Open,1,0,2026-03-02']);
});

test("[boundary-2] a field holding a CR or an LF is quoted, the line break kept as it is", async () => {
  const res = await postJson([
    requisition("r1", { title: "Line one\nline two", createdAt: "2026-03-01T09:00:00Z" }),
    requisition("r2", { title: "Line one\rline two", createdAt: "2026-03-02T09:00:00Z" }),
    requisition("r3", { title: "Line one\r\nline two", createdAt: "2026-03-03T09:00:00Z" }),
  ]);
  await assertCsv(res, [
    'r1,"Line one\nline two",Open,1,0,2026-03-01',
    'r2,"Line one\rline two",Open,1,0,2026-03-02',
    'r3,"Line one\r\nline two",Open,1,0,2026-03-03',
  ]);
});

test("[boundary-2] a field starting or ending with a space is quoted, one with a space inside is not", async () => {
  const res = await postJson([
    requisition("r1", { title: " Nurse", createdAt: "2026-03-01T09:00:00Z" }),
    requisition("r2", { title: "Nurse ", createdAt: "2026-03-02T09:00:00Z" }),
    requisition("r3", { title: "Night nurse", createdAt: "2026-03-03T09:00:00Z" }),
    requisition("r4", { title: " ", createdAt: "2026-03-04T09:00:00Z" }),
  ]);
  await assertCsv(res, [
    'r1," Nurse",Open,1,0,2026-03-01',
    'r2,"Nurse ",Open,1,0,2026-03-02',
    "r3,Night nurse,Open,1,0,2026-03-03",
    'r4," ",Open,1,0,2026-03-04',
  ]);
});

test("[boundary-2] a field that needs no quoting is written as it is, without quotes", async () => {
  const res = await postJson([
    requisition("r1", { title: "Nurse; ICU 'B' (50%) #2 – Zürich 東京", createdAt: "2026-03-01T09:00:00Z" }),
    requisition("r2", { title: "", createdAt: "2026-03-02T09:00:00Z" }),
  ]);
  await assertCsv(res, ["r1,Nurse; ICU 'B' (50%) #2 – Zürich 東京,Open,1,0,2026-03-01", "r2,,Open,1,0,2026-03-02"]);
});

test("[boundary-2] the quoting rule applies to the id too", async () => {
  const res = await postJson([
    requisition("a,1", { createdAt: "2026-03-01T09:00:00Z" }),
    requisition('b"2', { createdAt: "2026-03-02T09:00:00Z" }),
    requisition(" c3", { createdAt: "2026-03-03T09:00:00Z" }),
    requisition("d\n4", { createdAt: "2026-03-04T09:00:00Z" }),
    requisition("e 5", { createdAt: "2026-03-05T09:00:00Z" }),
  ]);
  await assertCsv(res, [
    '"a,1",Nurse,Open,1,0,2026-03-01',
    '"b""2",Nurse,Open,1,0,2026-03-02',
    '" c3",Nurse,Open,1,0,2026-03-03',
    '"d\n4",Nurse,Open,1,0,2026-03-04',
    "e 5,Nurse,Open,1,0,2026-03-05",
  ]);
});
