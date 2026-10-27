import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";

const table = [{ real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" }];

// Extends "unmapped: a name missing from the table is left as it is and reported".
test("unmapped private: export lines and both bracket forms are left as they are and reported", () => {
  const files = [
    { path: ".env.example", text: "export NORTHWIND_API_KEY=abc\nNORTHWIND_SMTP_HOST=h\n" },
    { path: "src/api.ts", text: "const a = process.env[\"NORTHWIND_API_KEY\"];\nconst b = process.env['NORTHWIND_API_KEY'];\n" },
  ];
  const result = mapFiles(files, table, "to public");
  assert.deepEqual(result, {
    files: [
      { path: ".env.example", text: "export NORTHWIND_API_KEY=abc\nSVC_A_HOST=h\n" },
      files[1],
    ],
    unmapped: ["NORTHWIND_API_KEY"],
  });
});

// Extends "unmapped: a name found many times is listed once, sorted alphabetically with the others".
test("unmapped private: names found in reverse order across many files are listed once each, sorted", () => {
  const letters = "ZYXWVUTSRQPONMLKJIHGFEDCBA".split("");
  const files = letters.map((l, i) => ({
    path: i % 2 === 0 ? `pkg${i}/.env` : `pkg${i}/index.ts`,
    text: i % 2 === 0
      ? `NORTHWIND_${l}KEY=1\nNORTHWIND_SMTP_HOST=h\nexport NORTHWIND_${l}KEY=2\n`
      : `const v = process.env.NORTHWIND_${l}KEY ?? process.env['NORTHWIND_${l}KEY'];\n`,
  }));
  const result = mapFiles([...files, ...files], table, "to public");
  assert.deepEqual(
    result.unmapped,
    [...letters].reverse().map((l) => `NORTHWIND_${l}KEY`),
  );
});

test("unmapped private: mapped names are not listed, and none are listed when all are in the table", () => {
  const two = [
    { real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" },
    { real: "NORTHWIND_DB_URL", public: "SVC_B_URL" },
  ];
  const files = [
    { path: ".env", text: "NORTHWIND_DB_URL=x\nNORTHWIND_SMTP_HOST=y\n" },
    { path: "src/a.ts", text: "process.env.NORTHWIND_DB_URL; process.env['NORTHWIND_SMTP_HOST'];" },
  ];
  assert.deepEqual(mapFiles(files, two, "to public").unmapped, []);
  const withExtra = [...files, { path: "src/b.ts", text: "process.env.NORTHWIND_CACHE_TTL;" }];
  assert.deepEqual(mapFiles(withExtra, two, "to public").unmapped, ["NORTHWIND_CACHE_TTL"]);
});

test("unmapped private: an empty table leaves every file as it is and reports every name", () => {
  const files = [
    { path: ".env", text: "NORTHWIND_SMTP_HOST=h\nNORTHWIND_DB_URL=d\n" },
    { path: "src/a.ts", text: "const x = process.env.NORTHWIND_CACHE_TTL;\n" },
  ];
  const result = mapFiles(files, [], "to public");
  assert.deepEqual(result, {
    files,
    unmapped: ["NORTHWIND_CACHE_TTL", "NORTHWIND_DB_URL", "NORTHWIND_SMTP_HOST"],
  });
});

test("unmapped private: a name missing from the table is reported when mapping to real", () => {
  const files = [
    { path: ".env", text: "SVC_A_HOST=h\nSVC_Q_PORT=1\n" },
    { path: "src/a.ts", text: "const p = process.env.SVC_Q_PORT;\nconst m = process.env['SVC_M_KEY'];\n" },
  ];
  const result = mapFiles(files, table, "to real");
  assert.deepEqual(result, {
    files: [{ path: ".env", text: "NORTHWIND_SMTP_HOST=h\nSVC_Q_PORT=1\n" }, files[1]],
    unmapped: ["SVC_M_KEY", "SVC_Q_PORT"],
  });
});
