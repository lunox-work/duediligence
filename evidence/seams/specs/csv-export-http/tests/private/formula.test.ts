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

// Extends "[unhappy-1] titles starting with +, -, @ or a tab are defused":
// titles that are nothing but the one character, "\r" included.
test("[unhappy-1] titles of a single +, -, @, tab or CR get a single quote before them", async () => {
  const res = await postJson([
    requisition("r1", { title: "+", createdAt: "2026-03-01T09:00:00Z" }),
    requisition("r2", { title: "-", createdAt: "2026-03-02T09:00:00Z" }),
    requisition("r3", { title: "@", createdAt: "2026-03-03T09:00:00Z" }),
    requisition("r4", { title: "\t", createdAt: "2026-03-04T09:00:00Z" }),
    requisition("r5", { title: "\r", createdAt: "2026-03-05T09:00:00Z" }),
  ]);
  await assertCsv(res, [
    "r1,'+,Open,1,0,2026-03-01",
    "r2,'-,Open,1,0,2026-03-02",
    "r3,'@,Open,1,0,2026-03-03",
    "r4,'\t,Open,1,0,2026-03-04",
    "r5,\"'\r\",Open,1,0,2026-03-05",
  ]);
});

// Extends "[unhappy-1] a title starting with = gets a single quote before it":
// one single quote however many formula characters follow.
test("[unhappy-1] a title starting with several formula characters gets one single quote", async () => {
  const res = await postJson([
    requisition("r1", { title: "==1", createdAt: "2026-03-01T09:00:00Z" }),
    requisition("r2", { title: "-=+@", createdAt: "2026-03-02T09:00:00Z" }),
    requisition("r3", { title: "@@SUM(1)", createdAt: "2026-03-03T09:00:00Z" }),
    requisition("r4", { title: "+-1", createdAt: "2026-03-04T09:00:00Z" }),
  ]);
  await assertCsv(res, [
    "r1,'==1,Open,1,0,2026-03-01",
    "r2,'-=+@,Open,1,0,2026-03-02",
    "r3,'@@SUM(1),Open,1,0,2026-03-03",
    "r4,'+-1,Open,1,0,2026-03-04",
  ]);
});

// Extends "[unhappy-1] only the first character of the title is checked":
// first characters outside the list are left alone, a leading LF and single quote included.
test("[unhappy-1] titles starting with a character outside the list are not defused", async () => {
  const res = await postJson([
    requisition("r1", { title: "'=x", createdAt: "2026-03-01T09:00:00Z" }),
    requisition("r2", { title: "\n=1", createdAt: "2026-03-02T09:00:00Z" }),
    requisition("r3", { title: "|cmd", createdAt: "2026-03-03T09:00:00Z" }),
    requisition("r4", { title: "%1", createdAt: "2026-03-04T09:00:00Z" }),
    requisition("r5", { title: "＝SUM(A1)", createdAt: "2026-03-05T09:00:00Z" }),
    requisition("r6", { title: "1+1", createdAt: "2026-03-06T09:00:00Z" }),
  ]);
  await assertCsv(res, [
    "r1,'=x,Open,1,0,2026-03-01",
    'r2,"\n=1",Open,1,0,2026-03-02',
    "r3,|cmd,Open,1,0,2026-03-03",
    "r4,%1,Open,1,0,2026-03-04",
    "r5,＝SUM(A1),Open,1,0,2026-03-05",
    "r6,1+1,Open,1,0,2026-03-06",
  ]);
});

// Extends "[unhappy-1] the quoting rule applies to the defused title":
// a line break, a trailing space, a quote, many commas, and CRLF after the defused character.
test("[unhappy-1] the defused title is quoted for line breaks, trailing spaces, quotes and commas", async () => {
  const res = await postJson([
    requisition("r1", { title: "=a\nb", createdAt: "2026-03-01T09:00:00Z" }),
    requisition("r2", { title: "+ ", createdAt: "2026-03-02T09:00:00Z" }),
    requisition("r3", { title: "\t ", createdAt: "2026-03-03T09:00:00Z" }),
    requisition("r4", { title: '-"', createdAt: "2026-03-04T09:00:00Z" }),
    requisition("r5", { title: "@a,b,c", createdAt: "2026-03-05T09:00:00Z" }),
    requisition("r6", { title: "\r\n=1", createdAt: "2026-03-06T09:00:00Z" }),
  ]);
  await assertCsv(res, [
    "r1,\"'=a\nb\",Open,1,0,2026-03-01",
    "r2,\"'+ \",Open,1,0,2026-03-02",
    "r3,\"'\t \",Open,1,0,2026-03-03",
    "r4,\"'-\"\"\",Open,1,0,2026-03-04",
    "r5,\"'@a,b,c\",Open,1,0,2026-03-05",
    "r6,\"'\r\n=1\",Open,1,0,2026-03-06",
  ]);
});

// Extends "[unhappy-1] the formula rule applies to the title only, not the id":
// ids starting with +, @, a tab or a CR, beside titles that are defused.
test("[unhappy-1] ids starting with +, @, a tab or a CR are not defused while their titles are", async () => {
  const res = await postJson([
    requisition("+3", { title: "+3", createdAt: "2026-03-01T09:00:00Z" }),
    requisition("@4", { title: "@4", createdAt: "2026-03-02T09:00:00Z" }),
    requisition("\t5", { title: "\t5", createdAt: "2026-03-03T09:00:00Z" }),
    requisition("\r6", { title: "Nurse", createdAt: "2026-03-04T09:00:00Z" }),
  ]);
  await assertCsv(res, [
    "+3,'+3,Open,1,0,2026-03-01",
    "@4,'@4,Open,1,0,2026-03-02",
    "\t5,'\t5,Open,1,0,2026-03-03",
    '"\r6",Nurse,Open,1,0,2026-03-04',
  ]);
});

// Extends "[unhappy-1] titles starting with +, -, @ or a tab are defused":
// more rows, sent out of order, defused and plain titles mixed.
test("[unhappy-1] defused and plain titles mixed over many rows sent out of order", async () => {
  const titles = ["=1", "Nurse", "+2", "a=b", "-3", "", "@4", "\t5", " =6", "=7,8", "Cook", "-"];
  const expected = ["'=1", "Nurse", "'+2", "a=b", "'-3", "", "'@4", "'\t5", '" =6"', "\"'=7,8\"", "Cook", "'-"];
  const items = titles.map((title, k) =>
    requisition(`r${String(k).padStart(2, "0")}`, { title, createdAt: `2026-03-${String(k + 1).padStart(2, "0")}T09:00:00Z` }),
  );
  const res = await postJson([...items].reverse());
  await assertCsv(
    res,
    expected.map((field, k) => `r${String(k).padStart(2, "0")},${field},Open,1,0,2026-03-${String(k + 1).padStart(2, "0")}`),
  );
});
