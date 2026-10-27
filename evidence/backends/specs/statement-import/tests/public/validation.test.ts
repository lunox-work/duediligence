import { test } from "node:test";
import assert from "node:assert/strict";
import { importStatement, type StatementError } from "../../src/index.js";

const HEADER = "id;date;amount;currency;reference";
const TODAY = "2026-03-31";

function checkErrors(lines: string[], errors: StatementError[]): void {
  assert.deepEqual(
    importStatement([HEADER, ...lines].join("\n"), new Set(["SGD"]), TODAY),
    { ok: false, errors, total: errors.length },
  );
}

test("[happy-1] imports payouts in input order and converts amounts to cents", () => {
  assert.deepEqual(
    importStatement(
      `${HEADER}\np-2;2026-03-31;120.50;SGD;March payout\np-1;2026-03-30;7.29;USD;Earlier payout`,
      new Set(["SGD", "USD"]),
      TODAY,
    ),
    {
      ok: true,
      payouts: [
        { id: "p-2", date: "2026-03-31", amount: 12050, currency: "SGD", reference: "March payout" },
        { id: "p-1", date: "2026-03-30", amount: 729, currency: "USD", reference: "Earlier payout" },
      ],
    },
  );
});

test("[happy-1] imports a single payout with an empty reference", () => {
  assert.deepEqual(
    importStatement(`${HEADER}\np-1;2026-03-31;1.00;SGD;`, new Set(["SGD"]), TODAY),
    { ok: true, payouts: [{ id: "p-1", date: TODAY, amount: 100, currency: "SGD", reference: "" }] },
  );
});

test("[unhappy-3] rejects empty ids and characters outside letters digits and hyphens", () => {
  for (const id of ["", "p_1", "p 1", "p.1", " p-1", "p-1 "]) {
    checkErrors([`${id};2026-03-31;1.00;SGD;`], [{ line: 2, field: "id", code: "id", text: id }]);
  }
});

test("[unhappy-3] rejects an id of 33 characters", () => {
  const id = "a".repeat(33);
  checkErrors([`${id};2026-03-31;1.00;SGD;`], [{ line: 2, field: "id", code: "id", text: id }]);
});

test("[unhappy-3] accepts ids of one and 32 allowed characters", () => {
  const longest = `Az0-${"b".repeat(28)}`;
  assert.deepEqual(
    importStatement(`${HEADER}\nA;2026-03-31;1.00;SGD;\n${longest};2026-03-31;2.00;SGD;`, new Set(["SGD"]), TODAY),
    {
      ok: true,
      payouts: [
        { id: "A", date: TODAY, amount: 100, currency: "SGD", reference: "" },
        { id: longest, date: TODAY, amount: 200, currency: "SGD", reference: "" },
      ],
    },
  );
});

test("[unhappy-4] reports only the later occurrence of a repeated id even across another payout", () => {
  checkErrors(
    ["p-1;2026-03-31;1.00;SGD;first", "p-2;2026-03-31;2.00;SGD;middle", "p-1;2026-03-30;3.00;SGD;last"],
    [{ line: 4, field: "id", code: "duplicate", text: "p-1" }],
  );
});

test("[unhappy-4] treats differently cased ids as distinct", () => {
  assert.deepEqual(
    importStatement(`${HEADER}\nP-1;2026-03-31;1.00;SGD;\np-1;2026-03-31;2.00;SGD;`, new Set(["SGD"]), TODAY),
    {
      ok: true,
      payouts: [
        { id: "P-1", date: TODAY, amount: 100, currency: "SGD", reference: "" },
        { id: "p-1", date: TODAY, amount: 200, currency: "SGD", reference: "" },
      ],
    },
  );
});

test("[unhappy-5] rejects malformed dates and nonexistent calendar days", () => {
  for (const date of ["", "2026-3-01", "2026-03-1", "2026/03/01", "2026-03-01T00:00:00", " 2026-03-01", "2026-00-01", "2026-13-01", "2026-01-00", "2026-04-31", "2026-02-30", "2025-02-29", "1900-02-29"]) {
    checkErrors([`p-1;${date};1.00;SGD;`], [{ line: 2, field: "date", code: "date", text: date }]);
  }
});

test("[unhappy-5] accepts leap days including the divisible-by-400 century", () => {
  assert.deepEqual(
    importStatement(`${HEADER}\np-1;2024-02-29;1.00;SGD;\np-2;2000-02-29;1.00;SGD;`, new Set(["SGD"]), TODAY),
    {
      ok: true,
      payouts: [
        { id: "p-1", date: "2024-02-29", amount: 100, currency: "SGD", reference: "" },
        { id: "p-2", date: "2000-02-29", amount: 100, currency: "SGD", reference: "" },
      ],
    },
  );
});

test("[unhappy-5] accepts today using the supplied date", () => {
  assert.deepEqual(
    importStatement(`${HEADER}\np-1;2024-02-29;1.00;SGD;`, new Set(["SGD"]), "2024-02-29"),
    { ok: true, payouts: [{ id: "p-1", date: "2024-02-29", amount: 100, currency: "SGD", reference: "" }] },
  );
});

test("[unhappy-5] reports the next calendar day as future", () => {
  checkErrors(["p-1;2026-04-01;1.00;SGD;"], [{ line: 2, field: "date", code: "future", text: "2026-04-01" }]);
});

test("[unhappy-6] rejects zero and amounts outside the required decimal format", () => {
  for (const amount of ["", "0.00", "1", ".50", "1.", "1.0", "1.000", "+1.00", "-1.00", " 1.00", "1.00 ", "1 000.00", "1,000.00", "1e2", "1x00"]) {
    checkErrors([`p-1;2026-03-31;${amount};SGD;`], [{ line: 2, field: "amount", code: "amount", text: amount }]);
  }
});

test("[unhappy-6] accepts one cent and the specified large amount", () => {
  assert.deepEqual(
    importStatement(`${HEADER}\np-1;2026-03-31;0.01;SGD;\np-2;2026-03-31;1234567.89;SGD;`, new Set(["SGD"]), TODAY),
    {
      ok: true,
      payouts: [
        { id: "p-1", date: TODAY, amount: 1, currency: "SGD", reference: "" },
        { id: "p-2", date: TODAY, amount: 123456789, currency: "SGD", reference: "" },
      ],
    },
  );
});

test("[unhappy-6] accepts leading zero digits in a positive amount", () => {
  assert.deepEqual(
    importStatement(`${HEADER}\np-1;2026-03-31;0001.20;SGD;`, new Set(["SGD"]), TODAY),
    { ok: true, payouts: [{ id: "p-1", date: TODAY, amount: 120, currency: "SGD", reference: "" }] },
  );
});

test("[unhappy-7] rejects unaccepted currencies with exact case and spacing", () => {
  for (const currency of ["USD", "sgd", "", " SGD", "SGD "]) {
    checkErrors([`p-1;2026-03-31;1.00;${currency};`], [{ line: 2, field: "currency", code: "currency", text: currency }]);
  }
});

test("[unhappy-7] accepts a currency according to the supplied set", () => {
  assert.deepEqual(
    importStatement(`${HEADER}\np-1;2026-03-31;1.00;sgd;`, new Set(["sgd"]), TODAY),
    { ok: true, payouts: [{ id: "p-1", date: TODAY, amount: 100, currency: "sgd", reference: "" }] },
  );
});

test("[unhappy-7] rejects a currency when the accepted set is empty", () => {
  assert.deepEqual(
    importStatement(`${HEADER}\np-1;2026-03-31;1.00;SGD;`, new Set<string>(), TODAY),
    { ok: false, errors: [{ line: 2, field: "currency", code: "currency", text: "SGD" }], total: 1 },
  );
});

test("[unhappy-8] rejects a reference of 141 characters", () => {
  const reference = "r".repeat(141);
  checkErrors([`p-1;2026-03-31;1.00;SGD;${reference}`], [{ line: 2, field: "reference", code: "reference", text: reference }]);
});

test("[unhappy-8] rejects references containing characters below code 32", () => {
  for (const code of [0, 9, 31]) {
    const reference = `before${String.fromCharCode(code)}after`;
    checkErrors([`p-1;2026-03-31;1.00;SGD;${reference}`], [{ line: 2, field: "reference", code: "reference", text: reference }]);
  }
});

test("[unhappy-8] accepts empty and 140-character references including spaces", () => {
  const reference = ` ${"r".repeat(138)} `;
  assert.deepEqual(
    importStatement(`${HEADER}\np-1;2026-03-31;1.00;SGD;\np-2;2026-03-31;1.00;SGD;${reference}`, new Set(["SGD"]), TODAY),
    {
      ok: true,
      payouts: [
        { id: "p-1", date: TODAY, amount: 100, currency: "SGD", reference: "" },
        { id: "p-2", date: TODAY, amount: 100, currency: "SGD", reference },
      ],
    },
  );
});
