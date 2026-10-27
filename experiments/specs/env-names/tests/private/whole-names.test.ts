import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";

// Extends "whole names: a name that is the start of another table name is matched whole".
test("whole private: longer name listed first in the table, three nested prefixes, all read forms", () => {
  const table = [
    { real: "NORTHWIND_SMTP_HOST_IP", public: "SVC_A_HOST_IP" },
    { real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" },
    { real: "NORTHWIND_SMTP", public: "SVC_A" },
  ];
  const text = [
    "const a = process.env.NORTHWIND_SMTP_HOST_IP;",
    "const b = process.env[\"NORTHWIND_SMTP\"];",
    "const c = process.env['NORTHWIND_SMTP_HOST'];",
    "const d = process.env.NORTHWIND_SMTP;",
    "const e = process.env[\"NORTHWIND_SMTP_HOST_IP\"];",
  ].join("\n");
  const result = mapFiles([{ path: "src/mail.ts", text }], table, "to public");
  assert.deepEqual(result, {
    files: [
      {
        path: "src/mail.ts",
        text: [
          "const a = process.env.SVC_A_HOST_IP;",
          "const b = process.env[\"SVC_A\"];",
          "const c = process.env['SVC_A_HOST'];",
          "const d = process.env.SVC_A;",
          "const e = process.env[\"SVC_A_HOST_IP\"];",
        ].join("\n"),
      },
    ],
    unmapped: [],
  });
});

// Extends "whole names: a name that is the start of another table name is matched whole" to .env files.
test("whole private: prefix names in a .env file are matched whole", () => {
  const table = [
    { real: "NORTHWIND_SMTP", public: "SVC_A" },
    { real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" },
  ];
  const text = "NORTHWIND_SMTP_HOST=localhost\nexport NORTHWIND_SMTP=on\nNORTHWIND_SMTP=off\n";
  const result = mapFiles([{ path: ".env", text }], table, "to public");
  assert.deepEqual(result.files, [{ path: ".env", text: "SVC_A_HOST=localhost\nexport SVC_A=on\nSVC_A=off\n" }]);
});

// Extends "whole names: a longer name missing from the table is not partly renamed through its prefix".
test("whole private: a longer name missing from the table is kept whole in bracket reads and .env files", () => {
  const table = [{ real: "NORTHWIND_SMTP", public: "SVC_A" }];
  const files = [
    { path: "src/a.ts", text: "const p = process.env[\"NORTHWIND_SMTP_PORT\"] ?? process.env['NORTHWIND_SMTP_TLS'];\n" },
    { path: ".env", text: "NORTHWIND_SMTP_USER=me\nexport NORTHWIND_SMTP_AUTH=x\nNORTHWIND_SMTP=on\n" },
  ];
  const result = mapFiles(files, table, "to public");
  assert.deepEqual(result, {
    files: [
      files[0],
      { path: ".env", text: "NORTHWIND_SMTP_USER=me\nexport NORTHWIND_SMTP_AUTH=x\nSVC_A=on\n" },
    ],
    unmapped: ["NORTHWIND_SMTP_AUTH", "NORTHWIND_SMTP_PORT", "NORTHWIND_SMTP_TLS", "NORTHWIND_SMTP_USER"],
  });
});

test("whole private: a longer name without a separator after the prefix is kept whole", () => {
  const table = [{ real: "NORTHWIND_SMTP", public: "SVC_A" }];
  const files = [
    { path: "src/a.ts", text: "const s = process.env.NORTHWIND_SMTPS;\nconst t = process.env[\"NORTHWIND_SMTP2\"];\n" },
    { path: ".env.test", text: "NORTHWIND_SMTPS=1\nNORTHWIND_SMTP2=2\nNORTHWIND_SMTP=3\n" },
  ];
  const result = mapFiles(files, table, "to public");
  assert.deepEqual(result.files, [files[0], { path: ".env.test", text: "NORTHWIND_SMTPS=1\nNORTHWIND_SMTP2=2\nSVC_A=3\n" }]);
  assert.equal(result.unmapped.length, 2);
  assert.ok(result.unmapped.includes("NORTHWIND_SMTPS"));
  assert.ok(result.unmapped.includes("NORTHWIND_SMTP2"));
});

test("whole private: a shorter name missing from the table is not mapped through a longer table name", () => {
  const table = [{ real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" }];
  const files = [
    { path: "src/a.ts", text: "const on = process.env.NORTHWIND_SMTP;\nconst h = process.env.NORTHWIND_SMTP_HOST;\n" },
    { path: ".env", text: "NORTHWIND_SMTP=on\nNORTHWIND_SMTP_HOST=h\n" },
  ];
  const result = mapFiles(files, table, "to public");
  assert.deepEqual(result, {
    files: [
      { path: "src/a.ts", text: "const on = process.env.NORTHWIND_SMTP;\nconst h = process.env.SVC_A_HOST;\n" },
      { path: ".env", text: "NORTHWIND_SMTP=on\nSVC_A_HOST=h\n" },
    ],
    unmapped: ["NORTHWIND_SMTP"],
  });
});

test("whole private: mapping to real matches public names whole", () => {
  const table = [
    { real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" },
    { real: "NORTHWIND_SMTP", public: "SVC_A" },
  ];
  const files = [
    { path: "src/a.ts", text: "const a = process.env.SVC_A;\nconst b = process.env['SVC_A_HOST'];\n" },
    { path: ".env", text: "SVC_A_HOST=h\nexport SVC_A=on\n" },
  ];
  const result = mapFiles(files, table, "to real");
  assert.deepEqual(result.files, [
    { path: "src/a.ts", text: "const a = process.env.NORTHWIND_SMTP;\nconst b = process.env['NORTHWIND_SMTP_HOST'];\n" },
    { path: ".env", text: "NORTHWIND_SMTP_HOST=h\nexport NORTHWIND_SMTP=on\n" },
  ]);
});

test("whole private: names are replaced at once, not one table entry after another", () => {
  // The public name of one entry is the real name of the next: each name maps once.
  const table = [
    { real: "NORTHWIND_A", public: "NORTHWIND_B" },
    { real: "NORTHWIND_B", public: "NORTHWIND_C" },
  ];
  const files = [
    { path: "src/a.ts", text: "const a = process.env.NORTHWIND_A;\nconst b = process.env.NORTHWIND_B;\n" },
    { path: ".env", text: "NORTHWIND_A=1\nNORTHWIND_B=2\n" },
  ];
  const result = mapFiles(files, table, "to public");
  assert.deepEqual(result.files, [
    { path: "src/a.ts", text: "const a = process.env.NORTHWIND_B;\nconst b = process.env.NORTHWIND_C;\n" },
    { path: ".env", text: "NORTHWIND_B=1\nNORTHWIND_C=2\n" },
  ]);
  const back = mapFiles(result.files, table, "to real");
  assert.deepEqual(back.files, files);
});
