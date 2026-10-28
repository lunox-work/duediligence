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

/** Asserts a 200 CSV answer whose body is exactly the BOM, the header and the rows, each ending "\r\n". */
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

// Extends "[boundary-2] the quoting rule applies to the id too":
// an id holding a CR, ending with a space, holding a comma and a quote, or nothing but quotes.
test("[boundary-2] ids with a CR, a trailing space, a comma and a quote, or only quotes are quoted", async () => {
  const res = await postJson([
    requisition("a\r1", { createdAt: "2026-03-01T09:00:00Z" }),
    requisition("b2 ", { createdAt: "2026-03-02T09:00:00Z" }),
    requisition('c,"3"', { createdAt: "2026-03-03T09:00:00Z" }),
    requisition('""', { createdAt: "2026-03-04T09:00:00Z" }),
    requisition("e\r\n5", { createdAt: "2026-03-05T09:00:00Z" }),
  ]);
  await assertCsv(res, [
    '"a\r1",Nurse,Open,1,0,2026-03-01',
    '"b2 ",Nurse,Open,1,0,2026-03-02',
    '"c,""3""",Nurse,Open,1,0,2026-03-03',
    '"""""",Nurse,Open,1,0,2026-03-04',
    '"e\r\n5",Nurse,Open,1,0,2026-03-05',
  ]);
});

// Extends "[boundary-2] a double quote inside a field is written twice and the field is quoted":
// more quotes, quotes side by side, and quotes with commas.
test("[boundary-2] every double quote is written twice, side by side and beside commas", async () => {
  const res = await postJson([
    requisition("r1", { title: '""', createdAt: "2026-03-01T09:00:00Z" }),
    requisition("r2", { title: 'a""b"c', createdAt: "2026-03-02T09:00:00Z" }),
    requisition("r3", { title: 'He said, "hi"', createdAt: "2026-03-03T09:00:00Z" }),
    requisition("r4", { title: ",", createdAt: "2026-03-04T09:00:00Z" }),
    requisition("r5", { title: '"a","b","c"', createdAt: "2026-03-05T09:00:00Z" }),
  ]);
  await assertCsv(res, [
    'r1,"""""",Open,1,0,2026-03-01',
    'r2,"a""""b""c",Open,1,0,2026-03-02',
    'r3,"He said, ""hi""",Open,1,0,2026-03-03',
    'r4,",",Open,1,0,2026-03-04',
    'r5,"""a"",""b"",""c""",Open,1,0,2026-03-05',
  ]);
});

// Extends "[boundary-2] a field starting or ending with a space is quoted, one with a space inside is not":
// spaces with quotes inside, several spaces, and a tab that is not a space.
test("[boundary-2] leading and trailing spaces combine with quotes, and a trailing tab needs no quotes", async () => {
  const res = await postJson([
    requisition("r1", { title: ' "x" ', createdAt: "2026-03-01T09:00:00Z" }),
    requisition("r2", { title: "   ", createdAt: "2026-03-02T09:00:00Z" }),
    requisition("r3", { title: "Night  nurse", createdAt: "2026-03-03T09:00:00Z" }),
    requisition("r4", { title: "Nurse\t", createdAt: "2026-03-04T09:00:00Z" }),
    requisition("r5", { title: "Night\tnurse", createdAt: "2026-03-05T09:00:00Z" }),
  ]);
  await assertCsv(res, [
    'r1," ""x"" ",Open,1,0,2026-03-01',
    'r2,"   ",Open,1,0,2026-03-02',
    "r3,Night  nurse,Open,1,0,2026-03-03",
    "r4,Nurse\t,Open,1,0,2026-03-04",
    "r5,Night\tnurse,Open,1,0,2026-03-05",
  ]);
});

// Extends "[boundary-2] a field holding a CR or an LF is quoted, the line break kept as it is":
// line breaks alone, repeated, and at either end.
test("[boundary-2] fields that are or end with line breaks are quoted with the breaks kept", async () => {
  const res = await postJson([
    requisition("r1", { title: "\n", createdAt: "2026-03-01T09:00:00Z" }),
    requisition("r2", { title: "a\n\nb\r\r", createdAt: "2026-03-02T09:00:00Z" }),
    requisition("r3", { title: "Nurse\r\n", createdAt: "2026-03-03T09:00:00Z" }),
    requisition("r4", { title: "\nNurse", createdAt: "2026-03-04T09:00:00Z" }),
  ]);
  await assertCsv(res, [
    'r1,"\n",Open,1,0,2026-03-01',
    'r2,"a\n\nb\r\r",Open,1,0,2026-03-02',
    'r3,"Nurse\r\n",Open,1,0,2026-03-03',
    'r4,"\nNurse",Open,1,0,2026-03-04',
  ]);
});

// Extends "[boundary-2] a title holding a comma is wrapped in double quotes":
// a long title holding many commas and quotes.
test("[boundary-2] a long title with many commas and quotes is quoted once, every quote doubled", async () => {
  const piece = 'Nurse, "night" shift; ';
  const title = piece.repeat(500);
  const res = await postJson([requisition("r1", { title })]);
  await assertCsv(res, [`r1,"${'Nurse, ""night"" shift; '.repeat(500)}",Open,1,0,2026-03-01`]);
});

// Extends "[boundary-2] a field that needs no quoting is written as it is, without quotes":
// an empty id and characters near the ones that need quoting.
test("[boundary-2] an empty id and fields with semicolons, apostrophes and tabs are written as they are", async () => {
  const res = await postJson([
    requisition("", { title: "a;b|c'd`e", createdAt: "2026-03-01T09:00:00Z" }),
    requisition("x'y;z", { title: "Nurseé— ICU", createdAt: "2026-03-02T09:00:00Z" }),
  ]);
  await assertCsv(res, [",a;b|c'd`e,Open,1,0,2026-03-01", "x'y;z,Nurseé— ICU,Open,1,0,2026-03-02"]);
});

// Extends "[boundary-2] the quoting rule applies to the id too":
// the id and the title of one row both quoted, beside rows that need none.
test("[boundary-2] the id and the title of one row are each quoted on their own", async () => {
  const res = await postJson([
    requisition("plain", { title: "Plain", createdAt: "2026-03-01T09:00:00Z" }),
    requisition("x,y", { title: 'say "x"', createdAt: "2026-03-02T09:00:00Z" }),
    requisition(" lead", { title: "trail ", createdAt: "2026-03-03T09:00:00Z" }),
    requisition("also plain", { title: "Also plain", createdAt: "2026-03-04T09:00:00Z" }),
  ]);
  await assertCsv(res, [
    "plain,Plain,Open,1,0,2026-03-01",
    '"x,y","say ""x""",Open,1,0,2026-03-02',
    '" lead","trail ",Open,1,0,2026-03-03',
    "also plain,Also plain,Open,1,0,2026-03-04",
  ]);
});
