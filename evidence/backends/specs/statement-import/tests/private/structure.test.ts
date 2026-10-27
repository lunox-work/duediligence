import { test } from "node:test";
import assert from "node:assert/strict";
import { importStatement, type StatementError } from "../../src/index.js";

const HEADER = "id;date;amount;currency;reference";
const TODAY = "2026-03-31";
const GOOD = "good;2026-03-31;4.29;SGD;kept";

function reject(statement: string, errors: StatementError[]): void {
  assert.deepEqual(importStatement(statement, new Set(["SGD"]), TODAY), { ok: false, errors, total: errors.length });
}

// Extends public: reports only the wrong header despite invalid later lines.
test("[unhappy-1] header validation takes precedence over an oversized and invalid body", () => {
  const header = "reference;currency;amount;date;id";
  const lines = Array.from({ length: 10020 }, (_, i) => `row-${i};bad;0.00;XXX;`);
  reject([header, ...lines].join("\n"), [{ line: 1, field: null, code: "header", text: header }]);
});

// Extends public: reports a header error for an empty statement.
test("[unhappy-1] a missing header is not repaired by a correct header later in the text", () => {
  for (const statement of [`\n${HEADER}\n${GOOD}`, `\n\n${HEADER}`, "\n", "\r\n"]) {
    reject(statement, [{ line: 1, field: null, code: "header", text: "" }]);
  }
});

// Extends public: requires the header exactly including case field count and spaces.
test("[unhappy-1] rejects duplicated renamed quoted and tabbed header fields", () => {
  const headers = [
    "id;date;amount;currency;Reference", "id;date;amount;currency;memo",
    "id;date;amount;currency;reference;reference", '"id";date;amount;currency;reference',
    "id;date ;amount;currency;reference", `${HEADER}\t`, "\tid;date;amount;currency;reference",
    "id,date,amount,currency,reference",
  ];
  for (const header of headers) {
    reject(`${header}\n${GOOD}\ninvalid`, [{ line: 1, field: null, code: "header", text: header }]);
  }
});

// Extends public: reports a four-field line without checking its invalid fields.
test("[unhappy-2] field counts of one two three and many produce only whole-line errors", () => {
  const lines = ["bad_id", ";bad", ";bad;0.00", ";bad;0.00;XXX", ";bad;0.00;XXX;\t;extra;another", ";".repeat(30)];
  reject([HEADER, ...lines].join("\n"), lines.map((text, i) => ({ line: i + 2, field: null, code: "fields", text })));
});

// Extends public: reports a six-field line including its trailing empty field.
test("[unhappy-2] nonempty sixth fields and quoted semicolons still violate field count", () => {
  const lines = [";bad;-2.00;XXX;\t;extra", 'q;2026-03-31;1.00;SGD;"semi;colon"', `${GOOD};;`];
  reject([HEADER, ...lines].join("\n"), lines.map((text, i) => ({ line: i + 2, field: null, code: "fields", text })));
});

test("[unhappy-2] a malformed row does not contribute an id to duplicate detection", () => {
  const malformed = "reused;2026-03-31;1.00;SGD;reference;extra";
  reject(`${HEADER}\n${malformed}\nreused;2026-03-31;1.00;SGD;`, [
    { line: 2, field: null, code: "fields", text: malformed },
  ]);
});

// Extends public: continues checking later lines after a field-count error.
test("[unhappy-2] validates after multiple malformed rows and preserves original line numbers", () => {
  reject(`${HEADER}\n${GOOD}\nthree;bad;bad\nnext;bad;1.00;SGD;\nwrong\nlast;2026-03-31;2.00;ZZZ;`, [
    { line: 3, field: null, code: "fields", text: "three;bad;bad" },
    { line: 4, field: "date", code: "date", text: "bad" },
    { line: 5, field: null, code: "fields", text: "wrong" },
    { line: 6, field: "currency", code: "currency", text: "ZZZ" },
  ]);
});

test("[unhappy-2] whitespace-only lines are nonempty lines with the wrong field count", () => {
  const lines = [" ", "\t", "  \t  "];
  reject([HEADER, ...lines, GOOD].join("\n"), lines.map((text, i) => ({ line: i + 2, field: null, code: "fields", text })));
});

// Extends public: reports date amount and currency errors together in field order.
test("[boundary-1] aggregates three errors on each of three rows around valid payouts", () => {
  const bad = [
    ["bad-a", "2026-06-31", "+0.02", "EUR"],
    ["bad-b", "2027-01-01", "2.999", "CAD"],
    ["bad-c", "2026-3-31", "0.00", "sgd"],
  ];
  const lines = [GOOD, ...bad.map(([id, date, amount, currency]) => `${id};${date};${amount};${currency};`), "end;2026-03-31;1.00;SGD;"];
  const errors: StatementError[] = [];
  bad.forEach(([, date, amount, currency], i) => errors.push(
    { line: i + 3, field: "date", code: i === 1 ? "future" : "date", text: date },
    { line: i + 3, field: "amount", code: "amount", text: amount },
    { line: i + 3, field: "currency", code: "currency", text: currency },
  ));
  reject([HEADER, ...lines].join("\n"), errors);
});

// Extends public: checks every field and orders errors by line while importing nothing.
test("[boundary-1] duplicate errors stay first while later fields and later rows are still checked", () => {
  const reference = `bad\t${"x".repeat(20)}`;
  reject(`${HEADER}\n${GOOD}\ngood;bad;0.00;USD;${reference}\nmiddle;2026-03-31;1.00;SGD;\nnew_id;2026-04-01;1;CAD;${"r".repeat(150)}`, [
    { line: 3, field: "id", code: "duplicate", text: "good" },
    { line: 3, field: "date", code: "date", text: "bad" },
    { line: 3, field: "amount", code: "amount", text: "0.00" },
    { line: 3, field: "currency", code: "currency", text: "USD" },
    { line: 3, field: "reference", code: "reference", text: reference },
    { line: 5, field: "id", code: "id", text: "new_id" },
    { line: 5, field: "date", code: "future", text: "2026-04-01" },
    { line: 5, field: "amount", code: "amount", text: "1" },
    { line: 5, field: "currency", code: "currency", text: "CAD" },
    { line: 5, field: "reference", code: "reference", text: "r".repeat(150) },
  ]);
});

test("[boundary-1] blank structural and field errors are merged in physical line order", () => {
  reject(`${HEADER}\nvalid;2026-03-31;1.00;SGD;\n\n;2026-03-31;1.00;SGD;\nnot;a;payout\nafter;2026-03-31;1.00;SGD;\nlast;2026-03-31;1.00;SGD;bad\0ref`, [
    { line: 3, field: null, code: "blank", text: "" },
    { line: 4, field: "id", code: "id", text: "" },
    { line: 5, field: null, code: "fields", text: "not;a;payout" },
    { line: 7, field: "reference", code: "reference", text: "bad\0ref" },
  ]);
});

// Extends public: accepts a leading BOM with Windows line endings and a final newline.
test("[boundary-2] BOM and CRLF normalize a larger statement with empty and full references", () => {
  const references = ["", " ", "hello", "r".repeat(140), "last"];
  const lines = references.map((r, i) => `win-${i};2026-03-31;0.29;NZD;${r}`);
  const expected = { ok: true, payouts: references.map((reference, i) => ({ id: `win-${i}`, date: TODAY, amount: 29, currency: "NZD", reference })) };
  for (const statement of [[HEADER, ...lines].join("\n"), `\uFEFF${[HEADER, ...lines].join("\r\n")}\r\n`]) {
    assert.deepEqual(importStatement(statement, new Set(["NZD"]), TODAY), expected);
  }
});

// Extends public: accepts BOM and Windows endings independently.
test("[boundary-2] independent BOM and CRLF handling also apply to invalid statements", () => {
  const lines = ["a;2026-03-31;0.00;SGD;", "b;2026-03-31;1.00;XYZ;"];
  const errors: StatementError[] = [
    { line: 2, field: "amount", code: "amount", text: "0.00" },
    { line: 3, field: "currency", code: "currency", text: "XYZ" },
  ];
  reject(`\uFEFF${[HEADER, ...lines].join("\n")}`, errors);
  reject([HEADER, ...lines].join("\r\n"), errors);
});

// Extends public: omits carriage returns from offending field and line text.
test("[boundary-2] CRLF errors retain spaces and control text but omit line-ending CR", () => {
  const reference = " \t ";
  const malformed = "  four;fields;only;here  ";
  reject(`\uFEFF${HEADER}\r\n bad;2026-03-31 ;1.00 ;SGD ;${reference}\r\n${malformed}\r\n\r\nlast;bad;1.00;SGD;\r\n`, [
    { line: 2, field: "id", code: "id", text: " bad" },
    { line: 2, field: "date", code: "date", text: "2026-03-31 " },
    { line: 2, field: "amount", code: "amount", text: "1.00 " },
    { line: 2, field: "currency", code: "currency", text: "SGD " },
    { line: 2, field: "reference", code: "reference", text: reference },
    { line: 3, field: null, code: "fields", text: malformed },
    { line: 4, field: null, code: "blank", text: "" },
    { line: 5, field: "date", code: "date", text: "bad" },
  ]);
});

test("[boundary-2] BOM removal is confined to the beginning of the statement", () => {
  reject(`\uFEFF${HEADER}\n\uFEFFp;2026-03-31;1.00;SGD;\nq;2026-03-31;1.00;\uFEFFSGD;`, [
    { line: 2, field: "id", code: "id", text: "\uFEFFp" },
    { line: 3, field: "currency", code: "currency", text: "\uFEFFSGD" },
  ]);
});

// Extends public: accepts one final newline after the last payout.
test("[boundary-3] one final newline after several empty-reference payouts is ignored", () => {
  const lines = ["tail-1", "tail-2", "tail-3"].map(id => `${id};2026-03-31;0.01;SGD;`);
  assert.deepEqual(importStatement(`${[HEADER, ...lines].join("\n")}\n`, new Set(["SGD"]), TODAY), {
    ok: true, payouts: ["tail-1", "tail-2", "tail-3"].map(id => ({ id, date: TODAY, amount: 1, currency: "SGD", reference: "" })),
  });
});

// Extends public: reports an interior empty line and continues to later errors.
test("[boundary-3] consecutive interior blanks remain distinct and do not stop validation", () => {
  reject(`${HEADER}\n${GOOD}\n\n\n\nb;bad;1.00;SGD;\n\nc;2026-03-31;1.00;SGD;`, [
    { line: 3, field: null, code: "blank", text: "" },
    { line: 4, field: null, code: "blank", text: "" },
    { line: 5, field: null, code: "blank", text: "" },
    { line: 6, field: "date", code: "date", text: "bad" },
    { line: 7, field: null, code: "blank", text: "" },
  ]);
});

// Extends public: reports the empty line left by two final newlines.
test("[boundary-3] only one of five final newlines is ignored", () => {
  for (const ending of ["\n", "\r\n"]) {
    const errors: StatementError[] = [3, 4, 5, 6].map(line => ({ line, field: null, code: "blank", text: "" }));
    reject(`${HEADER}${ending}${GOOD}${ending.repeat(5)}`, errors);
  }
});

// Extends public: reports an empty first payout line with Windows endings.
test("[boundary-3] several leading CRLF blanks survive BOM removal and preserve later line numbers", () => {
  reject(`\uFEFF${HEADER}\r\n\r\n\r\n${GOOD}\r\n\r\nlast;2026-03-31;0.00;SGD;\r\n`, [
    { line: 2, field: null, code: "blank", text: "" },
    { line: 3, field: null, code: "blank", text: "" },
    { line: 5, field: null, code: "blank", text: "" },
    { line: 6, field: "amount", code: "amount", text: "0.00" },
  ]);
});
