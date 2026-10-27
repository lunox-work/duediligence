import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";

test("whole names: a name that is the start of another table name is matched whole", () => {
  const table = [
    { real: "NORTHWIND_SMTP", public: "SVC_A" },
    { real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" },
  ];
  const text = "const on = process.env.NORTHWIND_SMTP;\nconst host = process.env.NORTHWIND_SMTP_HOST;\n";
  const result = mapFiles([{ path: "src/mail.ts", text }], table, "to public");
  assert.deepEqual(result.files, [
    { path: "src/mail.ts", text: "const on = process.env.SVC_A;\nconst host = process.env.SVC_A_HOST;\n" },
  ]);
});

test("whole names: a longer name missing from the table is not partly renamed through its prefix", () => {
  const table = [{ real: "NORTHWIND_SMTP", public: "SVC_A" }];
  const text = "const on = process.env.NORTHWIND_SMTP;\nconst port = process.env.NORTHWIND_SMTP_PORT;\n";
  const result = mapFiles([{ path: "src/mail.ts", text }], table, "to public");
  assert.deepEqual(result, {
    files: [
      { path: "src/mail.ts", text: "const on = process.env.SVC_A;\nconst port = process.env.NORTHWIND_SMTP_PORT;\n" },
    ],
    unmapped: ["NORTHWIND_SMTP_PORT"],
  });
});
