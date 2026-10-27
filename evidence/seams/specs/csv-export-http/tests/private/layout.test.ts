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

// Extends "[happy-1] rows are sorted by creation time, not by request order":
// there the ids sorted the same way as the times; here they sort the other way, within one day.
test("[happy-1] rows follow creation time within a day even where the ids sort the other way", async () => {
  const res = await postJson([
    requisition("a", { createdAt: "2026-03-01T22:00:00Z" }),
    requisition("b", { createdAt: "2026-03-01T13:00:00Z" }),
    requisition("c", { createdAt: "2026-03-01T08:00:00Z" }),
    requisition("d", { createdAt: "2026-03-01T08:00:01Z" }),
  ]);
  await assertCsv(res, [
    "c,Nurse,Open,1,0,2026-03-01",
    "d,Nurse,Open,1,0,2026-03-01",
    "b,Nurse,Open,1,0,2026-03-01",
    "a,Nurse,Open,1,0,2026-03-01",
  ]);
});

// Extends "[happy-1] creation time is compared as an instant, offsets and fractional seconds included":
// negative offsets, and an order the written text would get wrong.
test("[happy-1] creation times with negative and positive offsets are ordered as instants", async () => {
  const res = await postJson([
    // 2026-03-01T15:00:00Z
    requisition("a", { createdAt: "2026-03-01T10:00:00-05:00" }),
    // 2026-03-01T14:00:00Z
    requisition("c", { createdAt: "2026-03-01T23:00:00+09:00" }),
    // 2026-03-01T14:00:00Z, the same instant as "c"
    requisition("b", { createdAt: "2026-03-01T14:00:00Z" }),
    // 2026-03-01T14:30:00Z
    requisition("0", { createdAt: "2026-03-01T09:00:00-05:30" }),
  ]);
  await assertCsv(res, [
    "b,Nurse,Open,1,0,2026-03-01",
    "c,Nurse,Open,1,0,2026-03-01",
    "0,Nurse,Open,1,0,2026-03-01",
    "a,Nurse,Open,1,0,2026-03-01",
  ]);
});

// Extends "[happy-1] creation time is compared as an instant, offsets and fractional seconds included":
// fractional seconds of different lengths.
test("[happy-1] fractional seconds of different lengths are compared by their value", async () => {
  const res = await postJson([
    requisition("a", { createdAt: "2026-03-01T00:00:00.1Z" }),
    requisition("b", { createdAt: "2026-03-01T00:00:00.09Z" }),
    requisition("c", { createdAt: "2026-03-01T00:00:00.5Z" }),
    requisition("d", { createdAt: "2026-03-01T00:00:00Z" }),
    requisition("e", { createdAt: "2026-03-01T00:00:00.099999Z" }),
  ]);
  await assertCsv(res, [
    "d,Nurse,Open,1,0,2026-03-01",
    "b,Nurse,Open,1,0,2026-03-01",
    "e,Nurse,Open,1,0,2026-03-01",
    "a,Nurse,Open,1,0,2026-03-01",
    "c,Nurse,Open,1,0,2026-03-01",
  ]);
});

// Extends "[happy-1] creation time is compared as an instant, offsets and fractional seconds included":
// times that differ below the millisecond are still different times.
test("[happy-1] creation times that differ below a millisecond are ordered by time, not by id", async () => {
  const res = await postJson([
    requisition("a", { createdAt: "2026-03-01T00:00:00.0002Z" }),
    requisition("b", { createdAt: "2026-03-01T00:00:00.0001Z" }),
  ]);
  await assertCsv(res, ["b,Nurse,Open,1,0,2026-03-01", "a,Nurse,Open,1,0,2026-03-01"]);
});

// Extends "[happy-1] requisitions created at the same instant are ordered by id compared as strings":
// the same instant written with fractional seconds and an offset, and ids that are prefixes of each other.
test("[happy-1] ties on the instant, written in other ways, are ordered by id with prefixes first", async () => {
  const res = await postJson([
    requisition("b", { createdAt: "2026-03-01T10:00:00.250+01:00" }),
    requisition("ab", { createdAt: "2026-03-01T09:00:00.25Z" }),
    requisition("a1", { createdAt: "2026-03-01T04:00:00.2500-05:00" }),
    requisition("a 1", { createdAt: "2026-03-01T09:00:00.250Z" }),
    requisition("a", { createdAt: "2026-03-01T09:00:00.25+00:00" }),
    requisition("z", { createdAt: "2026-03-01T09:00:00.2Z" }),
  ]);
  await assertCsv(res, [
    "z,Nurse,Open,1,0,2026-03-01",
    "a,Nurse,Open,1,0,2026-03-01",
    "a 1,Nurse,Open,1,0,2026-03-01",
    "a1,Nurse,Open,1,0,2026-03-01",
    "ab,Nurse,Open,1,0,2026-03-01",
    "b,Nurse,Open,1,0,2026-03-01",
  ]);
});

// Extends "[happy-1] requisitions created at the same instant are ordered by id compared as strings":
// the ids compared are the ids as sent, not as written in the CSV.
test("[happy-1] ties are ordered by the id as sent, not by the quoted field", async () => {
  const res = await postJson([
    requisition("!a", { createdAt: "2026-03-01T09:00:00Z" }),
    requisition(" z", { createdAt: "2026-03-01T09:00:00Z" }),
  ]);
  await assertCsv(res, ['" z",Nurse,Open,1,0,2026-03-01', "!a,Nurse,Open,1,0,2026-03-01"]);
});

// Extends "[happy-1] the BOM, the header row and one row per requisition, each ending CRLF":
// many more requisitions, shuffled, with offsets and ties on the instant.
test("[happy-1] two hundred shuffled requisitions come out one row each, in order", async () => {
  const offsets = [
    ["Z", 0],
    ["+05:30", 330],
    ["-08:00", -480],
    ["+14:00", 840],
    ["-09:30", -570],
  ] as const;
  const base = Date.UTC(2025, 11, 30, 0, 0, 0);
  const items: { id: string; ms: number; createdAt: string }[] = [];
  for (let k = 0; k < 200; k++) {
    // every two requisitions share an instant, three hours and seven minutes apart
    const ms = base + Math.floor(k / 2) * (3 * 3600 + 7 * 60) * 1000;
    const [suffix, minutes] = offsets[k % offsets.length];
    const local = new Date(ms + minutes * 60_000).toISOString().slice(0, 19);
    items.push({ id: `id${(k * 53) % 200}`, ms, createdAt: `${local}${suffix}` });
  }
  const order = items.map((_, k) => (k * 77) % 200);
  const res = await postJson(order.map((k) => requisition(items[k].id, { createdAt: items[k].createdAt })));
  const sorted = [...items].sort((x, y) => (x.ms !== y.ms ? x.ms - y.ms : x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  await assertCsv(
    res,
    sorted.map((item) => `${item.id},Nurse,Open,1,0,${new Date(item.ms).toISOString().slice(0, 10)}`),
  );
});

// Extends "[happy-1] the BOM, the header row and one row per requisition, each ending CRLF":
// each answer holds only the requisitions of its own request.
test("[happy-1] each answer holds the rows of its own request only", async () => {
  await assertCsv(await postJson([requisition("first", { title: "Welder" })]), ["first,Welder,Open,1,0,2026-03-01"]);
  await assertCsv(await postJson([requisition("second", { title: "Cook", createdAt: "2026-04-01T09:00:00Z" })]), [
    "second,Cook,Open,1,0,2026-04-01",
  ]);
});

// Extends "[happy-2] the creation date is the UTC date, across a day, a month and a year":
// offsets with minutes, and the largest offsets either way.
test("[happy-2] the UTC date is found for offsets with minutes and for the largest offsets", async () => {
  const res = await postJson([
    // 2026-02-28T23:30:00Z
    requisition("a", { createdAt: "2026-03-01T05:00:00+05:30" }),
    // 2026-03-01T00:30:00Z
    requisition("b", { createdAt: "2026-02-28T15:00:00-09:30" }),
    // 2026-05-31T23:59:59Z
    requisition("c", { createdAt: "2026-06-01T13:59:59+14:00" }),
    // 2026-07-01T00:00:00Z
    requisition("d", { createdAt: "2026-06-30T12:00:00-12:00" }),
  ]);
  await assertCsv(res, [
    "a,Nurse,Open,1,0,2026-02-28",
    "b,Nurse,Open,1,0,2026-03-01",
    "c,Nurse,Open,1,0,2026-05-31",
    "d,Nurse,Open,1,0,2026-07-01",
  ]);
});

// Extends "[happy-2] zero openings and zero filled are written 0, and a leap day is a real date":
// the day before 1 March in leap and common years, centuries included.
test("[happy-2] the UTC date before 1 March is 29 February only in leap years", async () => {
  const res = await postJson([
    requisition("a", { createdAt: "2100-03-01T00:30:00+01:00" }),
    requisition("b", { createdAt: "2028-03-01T00:30:00+01:00" }),
    requisition("c", { createdAt: "2027-03-01T00:30:00+01:00" }),
    requisition("d", { createdAt: "2000-03-01T00:30:00+01:00" }),
  ]);
  await assertCsv(res, [
    "d,Nurse,Open,1,0,2000-02-29",
    "c,Nurse,Open,1,0,2027-02-28",
    "b,Nurse,Open,1,0,2028-02-29",
    "a,Nurse,Open,1,0,2100-02-28",
  ]);
});

// Extends "[happy-2] statuses, numbers, dates and titles are written for people to read":
// the statuses in another order, repeated, with other numbers.
test("[happy-2] every status is written for people in any order and repeated", async () => {
  const res = await postJson([
    requisition("r1", { status: "cancelled", openings: 0, filled: 0, createdAt: "2026-03-01T09:00:00Z" }),
    requisition("r2", { status: "filled", openings: 4, filled: 4, createdAt: "2026-03-02T09:00:00Z" }),
    requisition("r3", { status: "on_hold", openings: 25, filled: 9, createdAt: "2026-03-03T09:00:00Z" }),
    requisition("r4", { status: "on_hold", openings: 7, filled: 0, createdAt: "2026-03-04T09:00:00Z" }),
    requisition("r5", { status: "open", openings: 100, filled: 99, createdAt: "2026-03-05T09:00:00Z" }),
    requisition("r6", { status: "cancelled", openings: 3, filled: 2, createdAt: "2026-03-06T09:00:00Z" }),
  ]);
  await assertCsv(res, [
    "r1,Nurse,Cancelled,0,0,2026-03-01",
    "r2,Nurse,Filled,4,4,2026-03-02",
    "r3,Nurse,On hold,25,9,2026-03-03",
    "r4,Nurse,On hold,7,0,2026-03-04",
    "r5,Nurse,Open,100,99,2026-03-05",
    "r6,Nurse,Cancelled,3,2,2026-03-06",
  ]);
});

// Extends "[happy-2] statuses, numbers, dates and titles are written for people to read":
// whole numbers sent in JSON with a fraction part or an exponent.
test("[happy-2] whole numbers sent as 2.0 or 1e1 are written as plain digits", async () => {
  const res = await postText(
    '[{"id":"r1","title":"Nurse","status":"open","openings":1e1,"filled":2.0,"createdAt":"2026-03-01T09:00:00Z"},' +
      '{"id":"r2","title":"Cook","status":"open","openings":3.000,"filled":0E0,"createdAt":"2026-03-02T09:00:00Z"}]',
  );
  await assertCsv(res, ["r1,Nurse,Open,10,2,2026-03-01", "r2,Cook,Open,3,0,2026-03-02"]);
});

// Extends "[happy-2] statuses, numbers, dates and titles are written for people to read":
// a whole number large enough that its default text is in exponent form.
test("[happy-2] a very large whole number is written as plain digits, not in exponent form", async () => {
  const res = await postJson([requisition("r1", { openings: 1e21, filled: 123456789012345 })]);
  await assertCsv(res, ["r1,Nurse,Open,1000000000000000000000,123456789012345,2026-03-01"]);
});

// Extends "[happy-2] a null or absent title is an empty field":
// a title whose text is "null" or "undefined" is a title, not a missing one.
test("[happy-2] a missing title is empty while the titles null and undefined are written as text", async () => {
  const absent = requisition("r3", { createdAt: "2026-03-03T09:00:00Z" });
  delete absent.title;
  const res = await postJson([
    requisition("r1", { title: "null", createdAt: "2026-03-01T09:00:00Z" }),
    requisition("r2", { title: null, createdAt: "2026-03-02T09:00:00Z" }),
    absent,
    requisition("r4", { title: "undefined", createdAt: "2026-03-04T09:00:00Z" }),
  ]);
  await assertCsv(res, [
    "r1,null,Open,1,0,2026-03-01",
    "r2,,Open,1,0,2026-03-02",
    "r3,,Open,1,0,2026-03-03",
    "r4,undefined,Open,1,0,2026-03-04",
  ]);
});

// Extends "[boundary-1] an empty array gives the BOM and the header row alone":
// an empty array right after a request with rows.
test("[boundary-1] an empty array after a request with rows still gives the header row alone", async () => {
  await assertCsv(await postJson([requisition("r1"), requisition("r2")]), [
    "r1,Nurse,Open,1,0,2026-03-01",
    "r2,Nurse,Open,1,0,2026-03-01",
  ]);
  await assertCsv(await postJson([]), []);
});

// Extends "[boundary-1] an empty array surrounded by JSON whitespace gives the header row alone":
// an empty array right after a refused request.
test("[boundary-1] an empty array after a refused request gives the header row alone", async () => {
  const refused = await postJson([requisition("bad", { status: "closed" })]);
  await refused.arrayBuffer();
  assert.equal(refused.status, 422);
  await assertCsv(await postText("[]"), []);
});
