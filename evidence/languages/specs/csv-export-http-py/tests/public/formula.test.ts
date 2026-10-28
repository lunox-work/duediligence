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

test("[unhappy-1] a title starting with = gets a single quote before it", async () => {
  const res = await postJson([requisition("r1", { title: "=SUM(A1:A2)" })]);
  await assertCsv(res, ["r1,'=SUM(A1:A2),Open,1,0,2026-03-01"]);
});

test("[unhappy-1] titles starting with +, -, @ or a tab are defused", async () => {
  const res = await postJson([
    requisition("r1", { title: "+1 nurse", createdAt: "2026-03-01T09:00:00Z" }),
    requisition("r2", { title: "-1 nurse", createdAt: "2026-03-02T09:00:00Z" }),
    requisition("r3", { title: "@nurse", createdAt: "2026-03-03T09:00:00Z" }),
    requisition("r4", { title: "\tnurse", createdAt: "2026-03-04T09:00:00Z" }),
    requisition("r5", { title: "=", createdAt: "2026-03-05T09:00:00Z" }),
  ]);
  await assertCsv(res, [
    "r1,'+1 nurse,Open,1,0,2026-03-01",
    "r2,'-1 nurse,Open,1,0,2026-03-02",
    "r3,'@nurse,Open,1,0,2026-03-03",
    "r4,'\tnurse,Open,1,0,2026-03-04",
    "r5,'=,Open,1,0,2026-03-05",
  ]);
});

test("[unhappy-1] the quoting rule applies to the defused title", async () => {
  const res = await postJson([
    requisition("r1", { title: "\rnurse", createdAt: "2026-03-01T09:00:00Z" }),
    requisition("r2", { title: "-1,5", createdAt: "2026-03-02T09:00:00Z" }),
    requisition("r3", { title: '=HYPERLINK("x")', createdAt: "2026-03-03T09:00:00Z" }),
    requisition("r4", { title: "@nurse ", createdAt: "2026-03-04T09:00:00Z" }),
  ]);
  await assertCsv(res, [
    "r1,\"'\rnurse\",Open,1,0,2026-03-01",
    "r2,\"'-1,5\",Open,1,0,2026-03-02",
    "r3,\"'=HYPERLINK(\"\"x\"\")\",Open,1,0,2026-03-03",
    "r4,\"'@nurse \",Open,1,0,2026-03-04",
  ]);
});

test("[unhappy-1] only the first character of the title is checked", async () => {
  const res = await postJson([
    requisition("r1", { title: "a=b", createdAt: "2026-03-01T09:00:00Z" }),
    requisition("r2", { title: " =1+1", createdAt: "2026-03-02T09:00:00Z" }),
    requisition("r3", { title: "Nurse - @ward +2", createdAt: "2026-03-03T09:00:00Z" }),
  ]);
  await assertCsv(res, [
    "r1,a=b,Open,1,0,2026-03-01",
    'r2," =1+1",Open,1,0,2026-03-02',
    "r3,Nurse - @ward +2,Open,1,0,2026-03-03",
  ]);
});

test("[unhappy-1] the formula rule applies to the title only, not the id", async () => {
  const res = await postJson([
    requisition("=1", { createdAt: "2026-03-01T09:00:00Z" }),
    requisition("-2", { createdAt: "2026-03-02T09:00:00Z" }),
  ]);
  await assertCsv(res, ["=1,Nurse,Open,1,0,2026-03-01", "-2,Nurse,Open,1,0,2026-03-02"]);
});
