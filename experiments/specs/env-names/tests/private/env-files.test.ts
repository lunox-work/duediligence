import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";

const table = [{ real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" }];

// Extends ".env file: names before = are mapped to public, comments and values kept".
test("env private: several names, export lines and comments in a nested .env.production", () => {
  const twoTable = [
    { real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" },
    { real: "NORTHWIND_SMTP_PORT", public: "SVC_A_PORT" },
    { real: "NORTHWIND_DB_URL", public: "SVC_B_URL" },
  ];
  const text = [
    "# production settings",
    "NORTHWIND_DB_URL=postgres://prod",
    "",
    "# mail",
    "export NORTHWIND_SMTP_PORT=587",
    "NORTHWIND_SMTP_HOST=smtp.example.com",
    "export NORTHWIND_DB_URL=postgres://other",
  ].join("\n");
  const result = mapFiles([{ path: "deploy/prod/.env.production", text }], twoTable, "to public");
  assert.deepEqual(result, {
    files: [
      {
        path: "deploy/prod/.env.production",
        text: [
          "# production settings",
          "SVC_B_URL=postgres://prod",
          "",
          "# mail",
          "export SVC_A_PORT=587",
          "SVC_A_HOST=smtp.example.com",
          "export SVC_B_URL=postgres://other",
        ].join("\n"),
      },
    ],
    unmapped: [],
  });
});

// Extends ".env file named exactly .env: a value or comment equal to a real name is left as it is".
test("env private: a commented-out assignment is a comment and is left as it is", () => {
  const text = "# NORTHWIND_SMTP_HOST=old\n#NORTHWIND_SMTP_HOST=older\nNORTHWIND_SMTP_HOST=new\n";
  const result = mapFiles([{ path: ".env", text }], table, "to public");
  assert.deepEqual(result.files, [
    { path: ".env", text: "# NORTHWIND_SMTP_HOST=old\n#NORTHWIND_SMTP_HOST=older\nSVC_A_HOST=new\n" },
  ]);
});

// Extends ".env file named exactly .env: a value or comment equal to a real name is left as it is".
test("env private: a value that itself contains NAME= is left as it is", () => {
  const text = "NORTHWIND_SMTP_HOST=NORTHWIND_SMTP_HOST=x\n";
  const result = mapFiles([{ path: ".env", text }], table, "to public");
  assert.deepEqual(result.files, [{ path: ".env", text: "SVC_A_HOST=NORTHWIND_SMTP_HOST=x\n" }]);
});

test("env private: a value that looks like a process.env read is left as it is", () => {
  const text = "NORTHWIND_SMTP_HOST=process.env.NORTHWIND_SMTP_HOST\nexport NORTHWIND_SMTP_HOST=\"process.env['NORTHWIND_SMTP_HOST']\"\n";
  const result = mapFiles([{ path: ".env.local", text }], table, "to public");
  assert.deepEqual(result.files, [
    {
      path: ".env.local",
      text: "SVC_A_HOST=process.env.NORTHWIND_SMTP_HOST\nexport SVC_A_HOST=\"process.env['NORTHWIND_SMTP_HOST']\"\n",
    },
  ]);
});

test("env private: an empty value and a quoted value are handled, only the name renamed", () => {
  const text = "NORTHWIND_SMTP_HOST=\nexport NORTHWIND_SMTP_HOST=\"NORTHWIND_SMTP_HOST\"";
  const result = mapFiles([{ path: ".env", text }], table, "to public");
  assert.deepEqual(result.files, [
    { path: ".env", text: "SVC_A_HOST=\nexport SVC_A_HOST=\"NORTHWIND_SMTP_HOST\"" },
  ]);
});

test("env private: CRLF line endings are kept when mapping to public", () => {
  const text = "# mail\r\nNORTHWIND_SMTP_HOST=localhost\r\nexport NORTHWIND_SMTP_HOST=localhost\r\n";
  const result = mapFiles([{ path: ".env.example", text }], table, "to public");
  assert.deepEqual(result.files, [
    { path: ".env.example", text: "# mail\r\nSVC_A_HOST=localhost\r\nexport SVC_A_HOST=localhost\r\n" },
  ]);
});

test("env private: files whose name only resembles .env are not .env files", () => {
  const text = "NORTHWIND_SMTP_HOST=localhost\n";
  const paths = ["app.env", ".envrc", ".environment", "env", "config/x.env.local", ".env/settings", ".env.d/settings"];
  const files = paths.map((path) => ({ path, text }));
  const result = mapFiles(files, table, "to public");
  assert.deepEqual(result.files, files.map((f) => ({ ...f })));
});

test("env private: a file named .env. counts as a .env file", () => {
  const result = mapFiles([{ path: "a/b/.env.", text: "NORTHWIND_SMTP_HOST=x\n" }], table, "to public");
  assert.deepEqual(result.files, [{ path: "a/b/.env.", text: "SVC_A_HOST=x\n" }]);
});

test("env private: a code file inside a .env.d directory gets code rules, not .env rules", () => {
  const text = "NORTHWIND_SMTP_HOST=localhost\nconst h = process.env.NORTHWIND_SMTP_HOST;\n";
  const result = mapFiles([{ path: ".env.d/app.ts", text }], table, "to public");
  assert.deepEqual(result.files, [
    { path: ".env.d/app.ts", text: "NORTHWIND_SMTP_HOST=localhost\nconst h = process.env.SVC_A_HOST;\n" },
  ]);
});

test("env private: mapping a .env file to real renames public names before =", () => {
  const text = "# SVC_A_HOST is public\nSVC_A_HOST=SVC_A_HOST\nexport SVC_A_HOST=localhost\n";
  const result = mapFiles([{ path: ".env.staging", text }], table, "to real");
  assert.deepEqual(result.files, [
    {
      path: ".env.staging",
      text: "# SVC_A_HOST is public\nNORTHWIND_SMTP_HOST=SVC_A_HOST\nexport NORTHWIND_SMTP_HOST=localhost\n",
    },
  ]);
});

test("env private: table names need not share a prefix", () => {
  const other = [
    { real: "ACME_TOKEN", public: "SVC_T" },
    { real: "BILLING9_KEY", public: "SVC_K" },
  ];
  const text = "ACME_TOKEN=t\nexport BILLING9_KEY=k\n";
  const result = mapFiles([{ path: ".env", text }], other, "to public");
  assert.deepEqual(result, {
    files: [{ path: ".env", text: "SVC_T=t\nexport SVC_K=k\n" }],
    unmapped: [],
  });
});
