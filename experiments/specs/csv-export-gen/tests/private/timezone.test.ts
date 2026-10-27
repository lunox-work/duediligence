import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequisitionsCsv, type Requisition } from "../../src/index.js";

const BOM = "﻿";
const HEADER = "Requisition ID,Title,Status,Openings,Filled,Created\r\n";

function req(overrides: Partial<Requisition> = {}): Requisition {
  return {
    id: "REQ-1",
    title: "Engineer",
    status: "open",
    openings: 3,
    filled: 1,
    createdAt: new Date("2026-01-15T10:00:00.000Z"),
    ...overrides,
  };
}

/** Runs `fn` with the process in a fixed time zone, restoring the zone after. */
function inTimeZone<T>(zone: string, fn: () => T): T {
  const before = process.env.TZ;
  process.env.TZ = zone;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}

// Extends "[happy-2] the creation time is written as its UTC date, whatever the offset it was given in":
// that test passes when the process runs in UTC even if local dates are written; here local time is UTC+14.
test("[happy-2] the UTC date is written when the local date is a day ahead", () => {
  const csv = inTimeZone("Pacific/Kiritimati", () =>
    buildRequisitionsCsv([
      req({ id: "REQ-1", createdAt: new Date("2026-07-01T12:00:00.000Z") }),
      req({ id: "REQ-2", createdAt: new Date("2026-12-31T23:00:00.000Z") }),
    ]),
  );
  assert.equal(
    csv,
    BOM + HEADER + "REQ-1,Engineer,Open,3,1,2026-07-01\r\n" + "REQ-2,Engineer,Open,3,1,2026-12-31\r\n",
  );
});

// Extends "[happy-2] the creation time is written as its UTC date, whatever the offset it was given in":
// local time is UTC-12 here.
test("[happy-2] the UTC date is written when the local date is a day behind", () => {
  const csv = inTimeZone("Etc/GMT+12", () =>
    buildRequisitionsCsv([
      req({ id: "REQ-1", createdAt: new Date("2026-01-01T03:00:00.000Z") }),
      req({ id: "REQ-2", createdAt: new Date("2026-03-01T08:00:00.000Z") }),
    ]),
  );
  assert.equal(
    csv,
    BOM + HEADER + "REQ-1,Engineer,Open,3,1,2026-01-01\r\n" + "REQ-2,Engineer,Open,3,1,2026-03-01\r\n",
  );
});
