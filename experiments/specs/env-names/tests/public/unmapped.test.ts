import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";

const table = [{ real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" }];

test("unmapped: a name missing from the table is left as it is and reported", () => {
  const files = [
    { path: ".env", text: "NORTHWIND_API_KEY=abc\nNORTHWIND_SMTP_HOST=localhost\n" },
    { path: "src/api.ts", text: "const key = process.env.NORTHWIND_API_KEY;\n" },
  ];
  const result = mapFiles(files, table, "to public");
  assert.deepEqual(result, {
    files: [
      { path: ".env", text: "NORTHWIND_API_KEY=abc\nSVC_A_HOST=localhost\n" },
      { path: "src/api.ts", text: "const key = process.env.NORTHWIND_API_KEY;\n" },
    ],
    unmapped: ["NORTHWIND_API_KEY"],
  });
});

test("unmapped: a name found many times is listed once, sorted alphabetically with the others", () => {
  const files = [
    { path: ".env", text: "NORTHWIND_ZONE=eu\nNORTHWIND_API_KEY=abc\nexport NORTHWIND_API_KEY=abc\n" },
    {
      path: "src/api.ts",
      text: "const k = process.env.NORTHWIND_API_KEY ?? process.env[\"NORTHWIND_API_KEY\"];\nconst d = process.env['NORTHWIND_DB_URL'];\n",
    },
    { path: ".env.test", text: "NORTHWIND_DB_URL=postgres://test\nNORTHWIND_API_KEY=test\n" },
  ];
  const result = mapFiles(files, table, "to public");
  assert.deepEqual(result.unmapped, ["NORTHWIND_API_KEY", "NORTHWIND_DB_URL", "NORTHWIND_ZONE"]);
  assert.deepEqual(result.files, files);
});
