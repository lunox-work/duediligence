import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";

const table = [{ real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" }];

test(".env file: names before = are mapped to public, comments and values kept", () => {
  const text = [
    "# mail",
    "NORTHWIND_SMTP_HOST=localhost",
    "export NORTHWIND_SMTP_HOST=localhost",
  ].join("\n");
  const result = mapFiles([{ path: ".env.example", text }], table, "to public");
  assert.deepEqual(result.files, [
    {
      path: ".env.example",
      text: ["# mail", "SVC_A_HOST=localhost", "export SVC_A_HOST=localhost"].join("\n"),
    },
  ]);
});

test(".env file named exactly .env: a value or comment equal to a real name is left as it is", () => {
  const text = [
    "# NORTHWIND_SMTP_HOST is the relay",
    "NORTHWIND_SMTP_HOST=NORTHWIND_SMTP_HOST",
    "",
  ].join("\n");
  const result = mapFiles([{ path: "deploy/.env", text }], table, "to public");
  assert.deepEqual(result.files, [
    {
      path: "deploy/.env",
      text: ["# NORTHWIND_SMTP_HOST is the relay", "SVC_A_HOST=NORTHWIND_SMTP_HOST", ""].join("\n"),
    },
  ]);
});
