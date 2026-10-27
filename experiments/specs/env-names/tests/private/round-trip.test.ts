import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";
import type { SourceFile } from "../../src/index.js";

// Extends "round trip: mapping to public and back to real restores every file exactly".
test("round trip private: many names, files of every kind, comments, strings and unmapped names", () => {
  const table = [
    { real: "NORTHWIND_SMTP", public: "SVC_A" },
    { real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" },
    { real: "NORTHWIND_SMTP_PORT", public: "SVC_A_PORT" },
    { real: "NORTHWIND_DB_URL", public: "SVC_B_URL" },
    { real: "ACME_S3_BUCKET", public: "SVC_C_BUCKET" },
  ];
  const files: SourceFile[] = [
    {
      path: "deploy/.env.production",
      text: "# NORTHWIND_SMTP_HOST=old\nNORTHWIND_SMTP=on\nexport NORTHWIND_SMTP_HOST=NORTHWIND_SMTP_PORT\nNORTHWIND_API_KEY=k\nACME_S3_BUCKET=b=c\n",
    },
    { path: ".env", text: "NORTHWIND_DB_URL=postgres://db\r\nNORTHWIND_SMTP_PORT=25" },
    {
      path: "src/conf.ts",
      text: [
        "const a = process.env.NORTHWIND_SMTP + process.env[\"NORTHWIND_SMTP_HOST\"];",
        "const b = `${process.env['NORTHWIND_SMTP_PORT']}`;",
        "const c = process.env.NORTHWIND_API_KEY;",
        "const d = \"NORTHWIND_DB_URL\"; // NORTHWIND_DB_URL",
        "const e = process.env.ACME_S3_BUCKET;",
      ].join("\n"),
    },
    { path: "app.env", text: "NORTHWIND_SMTP=on\n" },
    { path: "lib/empty.js", text: "" },
  ];
  const original = files.map((f) => ({ ...f }));
  const toPublic = mapFiles(files, table, "to public");
  assert.notDeepEqual(toPublic.files, original);
  const back = mapFiles(toPublic.files, table, "to real");
  assert.deepEqual(back.files, original);
});

// Extends "round trip: empty text, CRLF line endings and names that prefix each other are restored exactly".
test("round trip private: a table whose public names are other real names restores exactly", () => {
  const table = [
    { real: "NORTHWIND_A", public: "NORTHWIND_B" },
    { real: "NORTHWIND_B", public: "NORTHWIND_A" },
  ];
  const files: SourceFile[] = [
    { path: ".env", text: "NORTHWIND_A=1\r\nNORTHWIND_B=2\r\n" },
    { path: "src/x.ts", text: "process.env.NORTHWIND_A + process.env['NORTHWIND_B']" },
  ];
  const original = files.map((f) => ({ ...f }));
  const toPublic = mapFiles(files, table, "to public");
  assert.deepEqual(toPublic.files, [
    { path: ".env", text: "NORTHWIND_B=1\r\nNORTHWIND_A=2\r\n" },
    { path: "src/x.ts", text: "process.env.NORTHWIND_B + process.env['NORTHWIND_A']" },
  ]);
  const back = mapFiles(toPublic.files, table, "to real");
  assert.deepEqual(back.files, original);
});

test("round trip private: mapping public files to real and back to public restores them exactly", () => {
  const table = [
    { real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" },
    { real: "NORTHWIND_DB_URL", public: "SVC_B_URL" },
  ];
  const files: SourceFile[] = [
    { path: ".env.example", text: "# SVC_A_HOST\nSVC_A_HOST=SVC_B_URL\nexport SVC_B_URL=x\n" },
    { path: "src/a.ts", text: "const h = process.env.SVC_A_HOST; // SVC_B_URL\nconst d = process.env[\"SVC_B_URL\"];" },
  ];
  const original = files.map((f) => ({ ...f }));
  const toReal = mapFiles(files, table, "to real");
  assert.deepEqual(toReal.files, [
    { path: ".env.example", text: "# SVC_A_HOST\nNORTHWIND_SMTP_HOST=SVC_B_URL\nexport NORTHWIND_DB_URL=x\n" },
    { path: "src/a.ts", text: "const h = process.env.NORTHWIND_SMTP_HOST; // SVC_B_URL\nconst d = process.env[\"NORTHWIND_DB_URL\"];" },
  ]);
  const back = mapFiles(toReal.files, table, "to public");
  assert.deepEqual(back.files, original);
});
