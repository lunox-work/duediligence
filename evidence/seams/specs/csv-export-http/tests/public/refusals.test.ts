import { test } from "node:test";
import assert from "node:assert/strict";
import type { Requisition } from "../../src/server.js";

const BOM = [0xef, 0xbb, 0xbf];
const HEADER = "Requisition ID,Title,Status,Openings,Filled,Created";
const CSV_TYPE = "text/csv; charset=utf-8";
const CSV_DISPOSITION = 'attachment; filename="requisitions.csv"';
const JSON_TYPE = "application/json; charset=utf-8";

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

/** Asserts a JSON error answer: the status, the content type, and a body of exactly "error" (a string) and, when given, "id". */
async function assertJsonError(res: any, status: number, id?: string): Promise<void> {
  const text: string = await res.text();
  assert.equal(res.status, status);
  assert.equal(res.headers.get("content-type"), JSON_TYPE);
  const body = JSON.parse(text);
  assert.equal(typeof body, "object");
  assert.notEqual(body, null);
  assert.equal(typeof body.error, "string");
  if (id === undefined) {
    assert.deepEqual(Object.keys(body), ["error"]);
  } else {
    assert.deepEqual(Object.keys(body).sort(), ["error", "id"]);
    assert.equal(body.id, id);
  }
}

/** Sends a valid requisition and then a bad one with the given fields, and asserts the 422 names the bad one. */
async function assertRefused(id: string, overrides: Record<string, unknown>): Promise<void> {
  const res = await postJson([requisition("ok"), requisition(id, overrides)]);
  await assertJsonError(res, 422, id);
}

test("[unhappy-2] a requisition with an unknown status is refused with 422 naming its id", async () => {
  const res = await postJson([requisition("r1"), requisition("r2", { status: "closed" })]);
  await assertJsonError(res, 422, "r2");
});

test("[unhappy-2] statuses written as in the CSV, or missing, are unknown", async () => {
  await assertRefused("status-Open", { status: "Open" });
  await assertRefused("status-on-hold", { status: "on hold" });
  await assertRefused("status-null", { status: null });
  const missing = requisition("status-missing") as unknown as Record<string, unknown>;
  delete missing.status;
  await assertJsonError(await postJson([requisition("ok"), missing]), 422, "status-missing");
});

test("[unhappy-2] a title that is neither a string nor null is refused", async () => {
  await assertRefused("title-number", { title: 42 });
  await assertRefused("title-boolean", { title: false });
  await assertRefused("title-object", { title: { text: "Nurse" } });
  await assertRefused("title-array", { title: ["Nurse"] });
});

test("[unhappy-2] openings or filled that is not a whole number of at least 0 is refused", async () => {
  await assertRefused("openings-negative", { openings: -1, filled: 0 });
  await assertRefused("openings-fraction", { openings: 1.5, filled: 0 });
  await assertRefused("openings-string", { openings: "1", filled: 0 });
  await assertRefused("openings-null", { openings: null, filled: 0 });
  await assertRefused("filled-negative", { openings: 1, filled: -1 });
  await assertRefused("filled-fraction", { openings: 1, filled: 0.5 });
  await assertRefused("filled-string", { openings: 1, filled: "0" });
});

test("[unhappy-2] filled one more than openings is refused, filled equal to openings is not", async () => {
  await assertRefused("over-by-one", { openings: 2, filled: 3 });
  await assertRefused("over-zero", { openings: 0, filled: 1 });
  const res = await postJson([requisition("equal", { status: "filled", openings: 2, filled: 2 })]);
  await assertCsv(res, ["equal,Nurse,Filled,2,2,2026-03-01"]);
});

test("[unhappy-2] a creation time not written as YYYY-MM-DDTHH:MM:SS with Z or an offset is refused", async () => {
  await assertRefused("no-seconds", { createdAt: "2026-03-01T09:00Z" });
  await assertRefused("no-zone", { createdAt: "2026-03-01T09:00:00" });
  await assertRefused("space", { createdAt: "2026-03-01 09:00:00Z" });
  await assertRefused("date-only", { createdAt: "2026-03-01" });
  await assertRefused("offset-no-colon", { createdAt: "2026-03-01T09:00:00+0200" });
  await assertRefused("offset-hours-only", { createdAt: "2026-03-01T09:00:00+02" });
  await assertRefused("empty-fraction", { createdAt: "2026-03-01T09:00:00.Z" });
  await assertRefused("other-format", { createdAt: "Sun, 01 Mar 2026 09:00:00 GMT" });
  await assertRefused("epoch-ms", { createdAt: 1772355600000 });
  await assertRefused("empty", { createdAt: "" });
});

test("[unhappy-2] a creation time that names no real time is refused", async () => {
  await assertRefused("feb-29-not-leap", { createdAt: "2026-02-29T09:00:00Z" });
  await assertRefused("apr-31", { createdAt: "2026-04-31T09:00:00Z" });
  await assertRefused("month-13", { createdAt: "2026-13-01T09:00:00Z" });
  await assertRefused("day-0", { createdAt: "2026-03-00T09:00:00Z" });
  await assertRefused("hour-25", { createdAt: "2026-03-01T25:00:00Z" });
  await assertRefused("minute-60", { createdAt: "2026-03-01T09:60:00Z" });
  await assertRefused("offset-minute-60", { createdAt: "2026-03-01T09:00:00+02:60" });
});

test("[unhappy-2] when several requisitions are bad, the first in the request's order is named", async () => {
  const res = await postJson([
    requisition("b-good", { createdAt: "2026-03-01T09:00:00Z" }),
    requisition("z-first-bad", { status: "closed", createdAt: "2026-03-05T09:00:00Z" }),
    requisition("a-second-bad", { openings: 1, filled: 2, createdAt: "2026-03-02T09:00:00Z" }),
    requisition("0-third-bad", { createdAt: "2026-02-30T09:00:00Z" }),
  ]);
  await assertJsonError(res, 422, "z-first-bad");
});

test("[unhappy-3] a body that is not JSON is refused with 400", async () => {
  const res = await postText("[{\"id\": \"r1\",");
  await assertJsonError(res, 400);
});

test("[unhappy-3] an empty body or plain text is not JSON", async () => {
  await assertJsonError(await postText(""), 400);
  await assertJsonError(await postText("id,title\r\nr1,Nurse\r\n"), 400);
});

test("[unhappy-3] JSON that is not an array is refused with 400", async () => {
  await assertJsonError(await postJson(requisition("r1")), 400);
  await assertJsonError(await postJson({ requisitions: [requisition("r1")] }), 400);
  await assertJsonError(await postText("null"), 400);
  await assertJsonError(await postText("42"), 400);
  await assertJsonError(await postText('"[]"'), 400);
});

test("[unhappy-3] an item that is not an object with a string id is refused with 400", async () => {
  await assertJsonError(await postJson([requisition("r1"), null]), 400);
  await assertJsonError(await postJson([requisition("r1"), "r2"]), 400);
  await assertJsonError(await postJson([requisition("r1"), 7]), 400);
  await assertJsonError(await postJson([requisition("r1"), [requisition("r2")]]), 400);
  await assertJsonError(await postJson([requisition("r1"), { ...requisition("r2"), id: 2 }]), 400);
  await assertJsonError(await postJson([requisition("r1"), { ...requisition("r2"), id: null }]), 400);
  const noId = requisition("r2") as unknown as Record<string, unknown>;
  delete noId.id;
  await assertJsonError(await postJson([requisition("r1"), noId]), 400);
});

test("[unhappy-4] GET on /requisitions.csv is answered 405 with Allow: POST", async () => {
  const res = await send("/requisitions.csv", { method: "GET" });
  await res.arrayBuffer();
  assert.equal(res.status, 405);
  assert.equal(res.headers.get("allow"), "POST");
});

test("[unhappy-4] PUT, PATCH and DELETE on /requisitions.csv are answered 405 with Allow: POST", async () => {
  for (const method of ["PUT", "PATCH", "DELETE"]) {
    const res = await send("/requisitions.csv", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([requisition("r1")]),
    });
    await res.arrayBuffer();
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.get("allow"), "POST", method);
  }
});

test("[unhappy-4] a request to any other path is answered 404", async () => {
  const body = JSON.stringify([requisition("r1")]);
  for (const [method, path] of [
    ["POST", "/requisitions"],
    ["POST", "/requisitions.json"],
    ["POST", "/requisitions.csv/x"],
    ["POST", "/"],
    ["GET", "/other"],
  ]) {
    const init: Record<string, unknown> = { method };
    if (method === "POST") Object.assign(init, { headers: { "Content-Type": "application/json" }, body });
    const res = await send(path, init);
    await res.arrayBuffer();
    assert.equal(res.status, 404, `${method} ${path}`);
  }
});
