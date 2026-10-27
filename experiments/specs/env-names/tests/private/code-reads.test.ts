import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";

const table = [{ real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" }];

// Extends "code: dot and bracket reads of process.env are mapped, the comment is not".
test("code private: a string naming the variable on the same line as a read is kept", () => {
  const text = "log(\"NORTHWIND_SMTP_HOST\", process.env.NORTHWIND_SMTP_HOST, 'NORTHWIND_SMTP_HOST');\n";
  const result = mapFiles([{ path: "src/log.js", text }], table, "to public");
  assert.deepEqual(result.files, [
    { path: "src/log.js", text: "log(\"NORTHWIND_SMTP_HOST\", process.env.SVC_A_HOST, 'NORTHWIND_SMTP_HOST');\n" },
  ]);
});

// Extends "code: dot and bracket reads of process.env are mapped, the comment is not".
test("code private: many reads of several names on one line and across lines", () => {
  const big = [
    { real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" },
    { real: "NORTHWIND_SMTP_PORT", public: "SVC_A_PORT" },
    { real: "NORTHWIND_DB_URL", public: "SVC_B_URL" },
  ];
  const text = [
    "const url = process.env.NORTHWIND_SMTP_HOST+':'+process.env['NORTHWIND_SMTP_PORT'];",
    "const db = process.env[\"NORTHWIND_DB_URL\"]||process.env.NORTHWIND_DB_URL;",
    "const msg = `${process.env.NORTHWIND_SMTP_HOST}:${process.env.NORTHWIND_SMTP_PORT}`;",
    "/* NORTHWIND_DB_URL */",
  ].join("\n");
  const result = mapFiles([{ path: "lib/conf.mjs", text }], big, "to public");
  assert.deepEqual(result, {
    files: [
      {
        path: "lib/conf.mjs",
        text: [
          "const url = process.env.SVC_A_HOST+':'+process.env['SVC_A_PORT'];",
          "const db = process.env[\"SVC_B_URL\"]||process.env.SVC_B_URL;",
          "const msg = `${process.env.SVC_A_HOST}:${process.env.SVC_A_PORT}`;",
          "/* NORTHWIND_DB_URL */",
        ].join("\n"),
      },
    ],
    unmapped: [],
  });
});

// Extends "code: a string that is not a process.env read is kept, a read at the very end of the text is mapped".
test("code private: a text that is only a bracket read is mapped", () => {
  const result = mapFiles(
    [
      { path: "a.ts", text: "process.env[\"NORTHWIND_SMTP_HOST\"]" },
      { path: "b.ts", text: "process.env['NORTHWIND_SMTP_HOST']" },
      { path: "c.ts", text: "process.env.NORTHWIND_SMTP_HOST" },
    ],
    table,
    "to public",
  );
  assert.deepEqual(result.files, [
    { path: "a.ts", text: "process.env[\"SVC_A_HOST\"]" },
    { path: "b.ts", text: "process.env['SVC_A_HOST']" },
    { path: "c.ts", text: "process.env.SVC_A_HOST" },
  ]);
});

test("code private: an assignment-like line in code is not renamed", () => {
  const text = "const line = \"NORTHWIND_SMTP_HOST=localhost\";\nNORTHWIND_SMTP_HOST = 1;\nconst h = process.env.NORTHWIND_SMTP_HOST;\n";
  const result = mapFiles([{ path: "src/x.ts", text }], table, "to public");
  assert.deepEqual(result.files, [
    {
      path: "src/x.ts",
      text: "const line = \"NORTHWIND_SMTP_HOST=localhost\";\nNORTHWIND_SMTP_HOST = 1;\nconst h = process.env.SVC_A_HOST;\n",
    },
  ]);
});

test("code private: mapping code to real renames public reads and leaves other text", () => {
  const text = [
    "const host = process.env.SVC_A_HOST;",
    "const again = process.env[\"SVC_A_HOST\"] ?? process.env['SVC_A_HOST'];",
    "// SVC_A_HOST is documented elsewhere",
    "const label = \"SVC_A_HOST\";",
  ].join("\n");
  const result = mapFiles([{ path: "src/mail.ts", text }], table, "to real");
  assert.deepEqual(result.files, [
    {
      path: "src/mail.ts",
      text: [
        "const host = process.env.NORTHWIND_SMTP_HOST;",
        "const again = process.env[\"NORTHWIND_SMTP_HOST\"] ?? process.env['NORTHWIND_SMTP_HOST'];",
        "// SVC_A_HOST is documented elsewhere",
        "const label = \"SVC_A_HOST\";",
      ].join("\n"),
    },
  ]);
});

test("code private: mapping to real does not rename real names", () => {
  const text = "const a = process.env.NORTHWIND_SMTP_HOST;\nconst b = process.env.SVC_A_HOST;\n";
  const result = mapFiles([{ path: "src/a.ts", text }], table, "to real");
  assert.deepEqual(result.files, [
    { path: "src/a.ts", text: "const a = process.env.NORTHWIND_SMTP_HOST;\nconst b = process.env.NORTHWIND_SMTP_HOST;\n" },
  ]);
});

test("code private: mapping to public does not rename public names", () => {
  const text = "const a = process.env.NORTHWIND_SMTP_HOST;\nconst b = process.env.SVC_A_HOST;\n";
  const result = mapFiles([{ path: "src/a.ts", text }], table, "to public");
  assert.deepEqual(result.files, [
    { path: "src/a.ts", text: "const a = process.env.SVC_A_HOST;\nconst b = process.env.SVC_A_HOST;\n" },
  ]);
});

test("code private: names with digits and without a common prefix are mapped", () => {
  const other = [
    { real: "ACME_S3_BUCKET", public: "SVC_S3" },
    { real: "NORTHWIND_V2_TOKEN", public: "SVC_V2" },
  ];
  const text = "const b = process.env.ACME_S3_BUCKET;\nconst t = process.env['NORTHWIND_V2_TOKEN'];\n";
  const result = mapFiles([{ path: "src/s3.ts", text }], other, "to public");
  assert.deepEqual(result, {
    files: [{ path: "src/s3.ts", text: "const b = process.env.SVC_S3;\nconst t = process.env['SVC_V2'];\n" }],
    unmapped: [],
  });
});

test("code private: CRLF line endings are kept in code when mapping to public", () => {
  const text = "const a = process.env.NORTHWIND_SMTP_HOST;\r\n// NORTHWIND_SMTP_HOST\r\n";
  const result = mapFiles([{ path: "src/a.ts", text }], table, "to public");
  assert.deepEqual(result.files, [{ path: "src/a.ts", text: "const a = process.env.SVC_A_HOST;\r\n// NORTHWIND_SMTP_HOST\r\n" }]);
});

test("code private: a read followed by a property access maps only the name", () => {
  const text = "const n = process.env.NORTHWIND_SMTP_HOST.length;\n";
  const result = mapFiles([{ path: "src/a.js", text }], table, "to public");
  assert.deepEqual(result.files, [{ path: "src/a.js", text: "const n = process.env.SVC_A_HOST.length;\n" }]);
});
