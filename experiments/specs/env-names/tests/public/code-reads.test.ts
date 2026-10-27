import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";

const table = [{ real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" }];

test("code: dot and bracket reads of process.env are mapped, the comment is not", () => {
  const text = [
    "const host = process.env.NORTHWIND_SMTP_HOST;",
    "const again = process.env[\"NORTHWIND_SMTP_HOST\"] ?? process.env['NORTHWIND_SMTP_HOST'];",
    "// NORTHWIND_SMTP_HOST is documented elsewhere",
  ].join("\n");
  const result = mapFiles([{ path: "src/mail.ts", text }], table, "to public");
  assert.deepEqual(result.files, [
    {
      path: "src/mail.ts",
      text: [
        "const host = process.env.SVC_A_HOST;",
        "const again = process.env[\"SVC_A_HOST\"] ?? process.env['SVC_A_HOST'];",
        "// NORTHWIND_SMTP_HOST is documented elsewhere",
      ].join("\n"),
    },
  ]);
});

test("code: a string that is not a process.env read is kept, a read at the very end of the text is mapped", () => {
  const text = [
    "const label = \"NORTHWIND_SMTP_HOST\";",
    "const host = process.env.NORTHWIND_SMTP_HOST",
  ].join("\n");
  const result = mapFiles([{ path: "src/labels.ts", text }], table, "to public");
  assert.deepEqual(result.files, [
    {
      path: "src/labels.ts",
      text: [
        "const label = \"NORTHWIND_SMTP_HOST\";",
        "const host = process.env.SVC_A_HOST",
      ].join("\n"),
    },
  ]);
});
