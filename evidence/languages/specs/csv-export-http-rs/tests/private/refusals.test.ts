import { test } from "node:test";
import assert from "node:assert/strict";
import type { Requisition } from "./contract.js";

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

/** Asserts a JSON error answer: the status, the content type, a JSON object body (no CSV) with a string "error" and, when given, the "id". */
async function assertJsonError(res: any, status: number, id?: string): Promise<void> {
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.equal(res.status, status);
  assert.equal(res.headers.get("content-type"), JSON_TYPE);
  const body = JSON.parse(bytes.toString("utf8"));
  assert.equal(typeof body, "object");
  assert.notEqual(body, null);
  assert.ok(!Array.isArray(body));
  assert.equal(typeof body.error, "string");
  if (id !== undefined) assert.equal(body.id, id);
}

/** Sends a valid requisition and then a bad one with the given fields, and asserts the 422 names the bad one. */
async function assertRefused(id: string, overrides: Record<string, unknown>): Promise<void> {
  const res = await postJson([requisition("ok"), requisition(id, overrides)]);
  await assertJsonError(res, 422, id);
}

/** A valid requisition without the named field. */
function without(id: string, field: string): Record<string, unknown> {
  const item = requisition(id) as unknown as Record<string, unknown>;
  delete item[field];
  return item;
}

// Extends "[unhappy-2] a requisition with an unknown status is refused with 422 naming its id":
// the bad requisition first, with valid ones after it.
test("[unhappy-2] a bad requisition first in the request is named, valid ones after it", async () => {
  const res = await postJson([
    requisition("first", { status: "archived", createdAt: "2026-03-09T09:00:00Z" }),
    requisition("second"),
    requisition("third"),
  ]);
  await assertJsonError(res, 422, "first");
});

// Extends "[unhappy-2] statuses written as in the CSV, or missing, are unknown":
// other spellings, cases, spaces and types.
test("[unhappy-2] statuses in other cases, spellings, padded, empty or not strings are unknown", async () => {
  await assertRefused("status-upper", { status: "OPEN" });
  await assertRefused("status-padded", { status: " open" });
  await assertRefused("status-dash", { status: "on-hold" });
  await assertRefused("status-Cancelled", { status: "Cancelled" });
  await assertRefused("status-empty", { status: "" });
  await assertRefused("status-number", { status: 1 });
  await assertRefused("status-array", { status: ["open"] });
});

// Extends "[unhappy-2] openings or filled that is not a whole number of at least 0 is refused":
// missing, boolean, infinite, and other fractions.
test("[unhappy-2] openings or filled missing, boolean, infinite or fractional is refused", async () => {
  await assertJsonError(await postJson([requisition("ok"), without("openings-missing", "openings")]), 422, "openings-missing");
  await assertJsonError(await postJson([requisition("ok"), without("filled-missing", "filled")]), 422, "filled-missing");
  await assertRefused("openings-true", { openings: true, filled: 0 });
  await assertRefused("filled-false", { openings: 1, filled: false });
  await assertRefused("filled-null", { openings: 1, filled: null });
  await assertRefused("openings-array", { openings: [1], filled: 0 });
  await assertRefused("openings-tiny-fraction", { openings: 2.25, filled: 1 });
  const infinite =
    '[{"id":"ok","title":"Nurse","status":"open","openings":1,"filled":0,"createdAt":"2026-03-01T09:00:00Z"},' +
    '{"id":"openings-infinite","title":"Nurse","status":"open","openings":1e400,"filled":0,"createdAt":"2026-03-01T09:00:00Z"}]';
  await assertJsonError(await postText(infinite), 422, "openings-infinite");
});

// Extends "[unhappy-2] filled one more than openings is refused, filled equal to openings is not":
// numbers with more digits, compared as numbers.
test("[unhappy-2] filled is compared with openings as a number", async () => {
  await assertRefused("nine-over-ten", { openings: 9, filled: 10 });
  await assertRefused("over-a-million", { openings: 1000000, filled: 1000001 });
  const res = await postJson([requisition("ten-nine", { openings: 10, filled: 9 })]);
  await assertCsv(res, ["ten-nine,Nurse,Open,10,9,2026-03-01"]);
});

// Extends "[unhappy-2] a creation time not written as YYYY-MM-DDTHH:MM:SS with Z or an offset is refused":
// other writings a lenient date parser accepts.
test("[unhappy-2] creation times without padding, padded with spaces, or in other ISO forms are refused", async () => {
  await assertRefused("unpadded-date", { createdAt: "2026-3-1T09:00:00Z" });
  await assertRefused("unpadded-hour", { createdAt: "2026-03-01T9:00:00Z" });
  await assertRefused("two-digit-year", { createdAt: "26-03-01T09:00:00Z" });
  await assertRefused("extended-year", { createdAt: "+002026-03-01T09:00:00Z" });
  await assertRefused("leading-space", { createdAt: " 2026-03-01T09:00:00Z" });
  await assertRefused("trailing-space", { createdAt: "2026-03-01T09:00:00Z " });
  await assertRefused("fraction-no-zone", { createdAt: "2026-03-01T09:00:00.123" });
  await assertRefused("offset-and-z", { createdAt: "2026-03-01T09:00:00+02:00Z" });
  await assertRefused("space-before-offset", { createdAt: "2026-03-01T09:00:00 +02:00" });
  await assertRefused("basic-format", { createdAt: "20260301T090000Z" });
  await assertRefused("gmt", { createdAt: "2026-03-01T09:00:00GMT" });
  await assertRefused("two-fractions", { createdAt: "2026-03-01T09:00:00.5.5Z" });
  await assertRefused("null", { createdAt: null });
  await assertJsonError(await postJson([requisition("ok"), without("missing", "createdAt")]), 422, "missing");
});

// Extends "[unhappy-2] a creation time that names no real time is refused":
// other impossible days, months, hours and seconds, a century that is not a leap year included.
test("[unhappy-2] creation times naming impossible days, months, hours or seconds are refused", async () => {
  await assertRefused("feb-29-2100", { createdAt: "2100-02-29T09:00:00Z" });
  await assertRefused("jun-31", { createdAt: "2026-06-31T09:00:00Z" });
  await assertRefused("nov-31", { createdAt: "2026-11-31T09:00:00Z" });
  await assertRefused("jan-32", { createdAt: "2026-01-32T09:00:00Z" });
  await assertRefused("month-0", { createdAt: "2026-00-10T09:00:00Z" });
  await assertRefused("hour-24-30", { createdAt: "2026-03-01T24:30:00Z" });
  await assertRefused("second-61", { createdAt: "2026-03-01T09:00:61Z" });
  await assertRefused("feb-30-with-offset", { createdAt: "2028-02-30T01:00:00+02:00" });
});

// Extends "[unhappy-2] a creation time that names no real time is refused":
// the real days beside the impossible ones are not refused.
test("[unhappy-2] 29 February 2000, 31 December and fractional seconds are real times", async () => {
  const res = await postJson([
    requisition("a", { createdAt: "2000-02-29T09:00:00Z" }),
    requisition("b", { createdAt: "2026-12-31T23:59:59.123456789Z" }),
    requisition("c", { createdAt: "2026-01-31T00:00:00.5-00:00" }),
  ]);
  await assertCsv(res, ["a,Nurse,Open,1,0,2000-02-29", "c,Nurse,Open,1,0,2026-01-31", "b,Nurse,Open,1,0,2026-12-31"]);
});

// Extends "[unhappy-2] when several requisitions are bad, the first in the request's order is named":
// the first bad one fails a check that may be made after the one the second fails.
test("[unhappy-2] the first bad requisition is named whichever check each one fails", async () => {
  await assertJsonError(
    await postJson([
      requisition("ok"),
      requisition("bad-time", { createdAt: "2026-02-30T09:00:00Z" }),
      requisition("bad-status", { status: "closed" }),
    ]),
    422,
    "bad-time",
  );
  await assertJsonError(
    await postJson([
      requisition("bad-filled", { openings: 1, filled: 2 }),
      requisition("bad-title", { title: 7 }),
      requisition("bad-openings", { openings: -1 }),
    ]),
    422,
    "bad-filled",
  );
  await assertJsonError(
    await postJson([
      requisition("b", { createdAt: "2026-03-05T09:00:00Z" }),
      requisition("y-bad-title", { title: true, createdAt: "2026-03-09T09:00:00Z" }),
      requisition("a-bad-status", { status: "Open", createdAt: "2026-03-01T09:00:00Z" }),
    ]),
    422,
    "y-bad-title",
  );
});

// Extends "[unhappy-2] a requisition with an unknown status is refused with 422 naming its id":
// one bad requisition among many valid ones.
test("[unhappy-2] one bad requisition among a hundred valid ones is named", async () => {
  const items = Array.from({ length: 100 }, (_, k) =>
    k === 73 ? requisition("number-73", { filled: 5, openings: 4 }) : requisition(`number-${k}`),
  );
  await assertJsonError(await postJson(items), 422, "number-73");
});

// Extends "[unhappy-2] a requisition with an unknown status is refused with 422 naming its id":
// the id is given back as sent, neither quoted nor defused, the empty id included.
test("[unhappy-2] the id is named as it was sent, not as a CSV field", async () => {
  await assertRefused('a,"b" ', { status: "closed" });
  await assertRefused("=x", { status: "closed" });
  await assertRefused("", { status: "closed" });
  await assertRefused("line\r\nbreak", { status: "closed" });
});

// Extends "[unhappy-2] statuses written as in the CSV, or missing, are unknown":
// an object with a string id and nothing else is a bad requisition, not a bad body.
test("[unhappy-2] an object with a string id and no other field is refused with 422", async () => {
  await assertJsonError(await postJson([{ id: "bare" }]), 422, "bare");
});

// Extends "[unhappy-3] a body that is not JSON is refused with 400":
// other near-JSON texts.
test("[unhappy-3] trailing commas, single quotes, NaN, unclosed or extra brackets are not JSON", async () => {
  await assertJsonError(await postText("[1,]"), 400);
  await assertJsonError(await postText("[{'id':'r1'}]"), 400);
  await assertJsonError(await postText("NaN"), 400);
  await assertJsonError(await postText("["), 400);
  await assertJsonError(await postText("[]]"), 400);
  await assertJsonError(await postText("[] []"), 400);
  await assertJsonError(await postText("undefined"), 400);
});

// Extends "[unhappy-3] JSON that is not an array is refused with 400":
// booleans, an empty object, and other numbers and strings.
test("[unhappy-3] JSON booleans, an empty object, numbers and strings are not arrays", async () => {
  await assertJsonError(await postText("true"), 400);
  await assertJsonError(await postText("false"), 400);
  await assertJsonError(await postText("{}"), 400);
  await assertJsonError(await postText("0"), 400);
  await assertJsonError(await postText("-1.5"), 400);
  await assertJsonError(await postText('"requisitions"'), 400);
});

// Extends "[unhappy-3] an item that is not an object with a string id is refused with 400":
// the bad item first, and other shapes of item and id.
test("[unhappy-3] a first item that is not an object with a string id is refused with 400", async () => {
  await assertJsonError(await postJson([true, requisition("r1")]), 400);
  await assertJsonError(await postJson([false]), 400);
  await assertJsonError(await postJson([{}]), 400);
  await assertJsonError(await postJson([{ ...requisition("r1"), id: ["r1"] }]), 400);
  await assertJsonError(await postJson([{ ...requisition("r1"), id: { value: "r1" } }]), 400);
  await assertJsonError(await postJson([{ ...requisition("r1"), id: true }]), 400);
  await assertJsonError(await postJson([without("r1", "id"), requisition("r2")]), 400);
});

// Extends "[unhappy-3] an item that is not an object with a string id is refused with 400":
// the bad item last after many valid ones.
test("[unhappy-3] an item without a string id after fifty valid ones is refused with 400", async () => {
  const items: unknown[] = Array.from({ length: 50 }, (_, k) => requisition(`r${k}`));
  items.push({ ...requisition("r50"), id: 50 });
  await assertJsonError(await postJson(items), 400);
});

// Extends "[unhappy-4] GET on /requisitions.csv is answered 405 with Allow: POST":
// HEAD and OPTIONS.
test("[unhappy-4] HEAD and OPTIONS on /requisitions.csv are answered 405 with Allow: POST", async () => {
  for (const method of ["HEAD", "OPTIONS"]) {
    const res = await send("/requisitions.csv", { method });
    await res.arrayBuffer();
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.get("allow"), "POST", method);
  }
});

// Extends "[unhappy-4] PUT, PATCH and DELETE on /requisitions.csv are answered 405 with Allow: POST":
// bodies that are not JSON, or none.
test("[unhappy-4] other methods are answered 405 whatever their body", async () => {
  for (const [method, body] of [
    ["PUT", "not json"],
    ["PATCH", "{}"],
    ["DELETE", undefined],
    ["PUT", "[]"],
  ] as const) {
    const init: Record<string, unknown> = { method };
    if (body !== undefined) Object.assign(init, { headers: { "Content-Type": "application/json" }, body });
    const res = await send("/requisitions.csv", init);
    await res.arrayBuffer();
    assert.equal(res.status, 405, `${method} ${body}`);
    assert.equal(res.headers.get("allow"), "POST", `${method} ${body}`);
  }
});

// Extends "[unhappy-4] a request to any other path is answered 404":
// paths that end, start or differ in case like the served one, and other methods.
test("[unhappy-4] paths near /requisitions.csv and other methods on other paths are answered 404", async () => {
  for (const [method, path] of [
    ["POST", "/api/requisitions.csv"],
    ["POST", "/requisitions.csvx"],
    ["POST", "/requisitions.csv/"],
    ["POST", "/Requisitions.csv"],
    ["POST", "/requisitions.CSV"],
    ["POST", "/requisitions-csv"],
    ["DELETE", "/requisitions"],
    ["PUT", "/other"],
    ["HEAD", "/other"],
    ["GET", "/"],
  ]) {
    const init: Record<string, unknown> = { method };
    if (method === "POST" || method === "PUT")
      Object.assign(init, { headers: { "Content-Type": "application/json" }, body: JSON.stringify([requisition("r1")]) });
    const res = await send(path, init);
    await res.arrayBuffer();
    assert.equal(res.status, 404, `${method} ${path}`);
  }
});

// Extends "[unhappy-4] a request to any other path is answered 404":
// a body that is not JSON does not turn the 404 into a 400.
test("[unhappy-4] a POST to another path with a body that is not JSON is answered 404", async () => {
  const res = await send("/requisitions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not json",
  });
  await res.arrayBuffer();
  assert.equal(res.status, 404);
});
