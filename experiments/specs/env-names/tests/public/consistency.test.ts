import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";

const table = [
  { real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" },
  { real: "NORTHWIND_DB_URL", public: "SVC_B_URL" },
];

test("consistency: each real name becomes the same public name in .env files and code alike", () => {
  const files = [
    { path: ".env", text: "NORTHWIND_SMTP_HOST=localhost\nNORTHWIND_DB_URL=postgres://db\n" },
    { path: "src/mail.ts", text: "const h = process.env.NORTHWIND_SMTP_HOST;\nconst d = process.env[\"NORTHWIND_DB_URL\"];\n" },
    { path: "config/.env.production", text: "export NORTHWIND_DB_URL=postgres://prod\nNORTHWIND_SMTP_HOST=mail\n" },
    { path: "lib/db.js", text: "module.exports = process.env['NORTHWIND_DB_URL'] || process.env.NORTHWIND_SMTP_HOST;\n" },
  ];
  const result = mapFiles(files, table, "to public");
  assert.deepEqual(result, {
    files: [
      { path: ".env", text: "SVC_A_HOST=localhost\nSVC_B_URL=postgres://db\n" },
      { path: "src/mail.ts", text: "const h = process.env.SVC_A_HOST;\nconst d = process.env[\"SVC_B_URL\"];\n" },
      { path: "config/.env.production", text: "export SVC_B_URL=postgres://prod\nSVC_A_HOST=mail\n" },
      { path: "lib/db.js", text: "module.exports = process.env['SVC_B_URL'] || process.env.SVC_A_HOST;\n" },
    ],
    unmapped: [],
  });
});

test("consistency: an empty set of files maps to no files and no unmapped names", () => {
  const result = mapFiles([], table, "to public");
  assert.deepEqual(result, { files: [], unmapped: [] });
});
