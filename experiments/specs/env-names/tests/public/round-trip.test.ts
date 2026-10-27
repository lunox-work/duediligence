import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";
import type { SourceFile } from "../../src/index.js";

test("round trip: mapping to public and back to real restores every file exactly", () => {
  const table = [
    { real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" },
    { real: "NORTHWIND_DB_URL", public: "SVC_B_URL" },
  ];
  const files: SourceFile[] = [
    {
      path: ".env.example",
      text: "# mail\nNORTHWIND_SMTP_HOST=localhost\nexport NORTHWIND_SMTP_HOST=localhost\nNORTHWIND_DB_URL=postgres://db\n",
    },
    {
      path: "src/mail.ts",
      text: [
        "const host = process.env.NORTHWIND_SMTP_HOST;",
        "const again = process.env[\"NORTHWIND_SMTP_HOST\"] ?? process.env['NORTHWIND_SMTP_HOST'];",
        "const db = process.env.NORTHWIND_DB_URL;",
        "// NORTHWIND_SMTP_HOST is documented elsewhere",
      ].join("\n"),
    },
  ];
  const original = files.map((f) => ({ ...f }));
  const toPublic = mapFiles(files, table, "to public");
  const back = mapFiles(toPublic.files, table, "to real");
  assert.deepEqual(back.files, original);
});

test("round trip: empty text, CRLF line endings and names that prefix each other are restored exactly", () => {
  const table = [
    { real: "NORTHWIND_SMTP", public: "SVC_A" },
    { real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" },
  ];
  const files: SourceFile[] = [
    { path: ".env", text: "" },
    { path: ".env.local", text: "NORTHWIND_SMTP=on\r\nNORTHWIND_SMTP_HOST=localhost\r\n" },
    { path: "src/empty.ts", text: "" },
    { path: "src/mail.ts", text: "const a = process.env.NORTHWIND_SMTP;\r\nconst b = process.env.NORTHWIND_SMTP_HOST;" },
  ];
  const original = files.map((f) => ({ ...f }));
  const toPublic = mapFiles(files, table, "to public");
  const back = mapFiles(toPublic.files, table, "to real");
  assert.deepEqual(back.files, original);
});
