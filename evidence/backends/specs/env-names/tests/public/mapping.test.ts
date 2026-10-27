import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";

test("[happy-1] maps assignments and exported assignments in .env.example", () => {
  const result = mapFiles(
    [{ path: ".env.example", text: "# mail\nNORTHWIND_SMTP_HOST=localhost\nexport NORTHWIND_SMTP_HOST=localhost\n" }],
    [{ real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" }],
    "to public",
  );

  assert.deepEqual(result.files, [
    { path: ".env.example", text: "# mail\nSVC_A_HOST=localhost\nexport SVC_A_HOST=localhost\n" },
  ]);
  assert.deepEqual(result.unmapped, []);
});

test("[happy-1] recognizes .env basenames and dotted variants while preserving comments and values", () => {
  const text = "# NORTHWIND_SMTP_HOST=comment\nNORTHWIND_SMTP_HOST=NORTHWIND_SMTP_HOST\nexport NORTHWIND_SMTP_HOST=\n";
  const mapped = "# NORTHWIND_SMTP_HOST=comment\nSVC_A_HOST=NORTHWIND_SMTP_HOST\nexport SVC_A_HOST=\n";
  const result = mapFiles(
    [
      { path: ".env", text },
      { path: "config/.env.production", text },
      { path: "config/.environment", text },
      { path: "config/settings.env", text },
    ],
    [{ real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" }],
    "to public",
  );

  assert.deepEqual(result.files, [
    { path: ".env", text: mapped },
    { path: "config/.env.production", text: mapped },
    { path: "config/.environment", text },
    { path: "config/settings.env", text },
  ]);
});

test("[happy-2] maps dot reads and both quoted bracket reads in code", () => {
  const result = mapFiles(
    [{
      path: "src/mail.ts",
      text: 'const host = process.env.NORTHWIND_SMTP_HOST;\nconst again = process.env["NORTHWIND_SMTP_HOST"] ?? process.env[\'NORTHWIND_SMTP_HOST\'];\n// NORTHWIND_SMTP_HOST is documented elsewhere\n',
    }],
    [{ real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" }],
    "to public",
  );

  assert.deepEqual(result.files, [{
    path: "src/mail.ts",
    text: 'const host = process.env.SVC_A_HOST;\nconst again = process.env["SVC_A_HOST"] ?? process.env[\'SVC_A_HOST\'];\n// NORTHWIND_SMTP_HOST is documented elsewhere\n',
  }]);
  assert.deepEqual(result.unmapped, []);
});

test("[happy-2] leaves ordinary occurrences beside a process.env read unchanged", () => {
  const result = mapFiles(
    [{
      path: "src/config.js",
      text: 'const NORTHWIND_SMTP_HOST = "NORTHWIND_SMTP_HOST";\nconst config = { NORTHWIND_SMTP_HOST: "documented" };\n// NORTHWIND_SMTP_HOST\nconst host = process.env.NORTHWIND_SMTP_HOST;',
    }],
    [{ real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" }],
    "to public",
  );

  assert.deepEqual(result.files, [{
    path: "src/config.js",
    text: 'const NORTHWIND_SMTP_HOST = "NORTHWIND_SMTP_HOST";\nconst config = { NORTHWIND_SMTP_HOST: "documented" };\n// NORTHWIND_SMTP_HOST\nconst host = process.env.SVC_A_HOST;',
  }]);
});

test("[happy-3] uses the same two mappings across env files and code files", () => {
  const result = mapFiles(
    [
      { path: ".env", text: "NORTHWIND_SMTP_HOST=localhost\nNORTHWIND_API_KEY=secret\n" },
      { path: ".env.example", text: "export NORTHWIND_API_KEY=example\nNORTHWIND_SMTP_HOST=mail\n" },
      { path: "src/mail.ts", text: 'const host = process.env.NORTHWIND_SMTP_HOST;\nconst key = process.env["NORTHWIND_API_KEY"];\n' },
      { path: "src/client.js", text: "const key = process.env.NORTHWIND_API_KEY;\nconst host = process.env['NORTHWIND_SMTP_HOST'];\n" },
    ],
    [
      { real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" },
      { real: "NORTHWIND_API_KEY", public: "SVC_B_KEY" },
    ],
    "to public",
  );

  assert.deepEqual(result.files, [
    { path: ".env", text: "SVC_A_HOST=localhost\nSVC_B_KEY=secret\n" },
    { path: ".env.example", text: "export SVC_B_KEY=example\nSVC_A_HOST=mail\n" },
    { path: "src/mail.ts", text: 'const host = process.env.SVC_A_HOST;\nconst key = process.env["SVC_B_KEY"];\n' },
    { path: "src/client.js", text: "const key = process.env.SVC_B_KEY;\nconst host = process.env['SVC_A_HOST'];\n" },
  ]);
  assert.deepEqual(result.unmapped, []);
});

test("[happy-3] preserves empty files and input order between files using both names", () => {
  const result = mapFiles(
    [
      { path: "z/.env", text: "NORTHWIND_A=1\nNORTHWIND_B=2" },
      { path: "middle.ts", text: "" },
      { path: "a.ts", text: "process.env.NORTHWIND_B + process.env.NORTHWIND_A" },
      { path: "empty/.env.example", text: "" },
    ],
    [
      { real: "NORTHWIND_A", public: "SVC_A" },
      { real: "NORTHWIND_B", public: "SVC_B" },
    ],
    "to public",
  );

  assert.deepEqual(result.files, [
    { path: "z/.env", text: "SVC_A=1\nSVC_B=2" },
    { path: "middle.ts", text: "" },
    { path: "a.ts", text: "process.env.SVC_B + process.env.SVC_A" },
    { path: "empty/.env.example", text: "" },
  ]);
});

test("[happy-4] mapping to public and back restores exact text in every file", () => {
  const files = [
    { path: ".env.example", text: "# NORTHWIND_SMTP_HOST\nNORTHWIND_SMTP_HOST=NORTHWIND_API_KEY\nexport NORTHWIND_API_KEY='secret'" },
    { path: "src/config.ts", text: 'const host = process.env.NORTHWIND_SMTP_HOST;\nconst key = process.env["NORTHWIND_API_KEY"] ?? process.env[\'NORTHWIND_API_KEY\'];\n// NORTHWIND_API_KEY\n' },
    { path: "notes.txt", text: "NORTHWIND_SMTP_HOST is documented here.\n" },
  ];
  const table = [
    { real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" },
    { real: "NORTHWIND_API_KEY", public: "SVC_B_KEY" },
  ];
  const original = files.map((file) => ({ ...file }));
  const publicResult = mapFiles(files, table, "to public");

  assert.deepEqual(publicResult.files, [
    { path: ".env.example", text: "# NORTHWIND_SMTP_HOST\nSVC_A_HOST=NORTHWIND_API_KEY\nexport SVC_B_KEY='secret'" },
    { path: "src/config.ts", text: 'const host = process.env.SVC_A_HOST;\nconst key = process.env["SVC_B_KEY"] ?? process.env[\'SVC_B_KEY\'];\n// NORTHWIND_API_KEY\n' },
    { path: "notes.txt", text: "NORTHWIND_SMTP_HOST is documented here.\n" },
  ]);
  const restored = mapFiles(publicResult.files, table, "to real");
  assert.deepEqual(restored.files, original);
  assert.deepEqual(restored.unmapped, []);
});

test("[happy-4] an empty file set survives mapping in both directions", () => {
  const table = [{ real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" }];
  const publicResult = mapFiles([], table, "to public");
  assert.deepEqual(publicResult.files, []);
  assert.deepEqual(publicResult.unmapped, []);

  const restored = mapFiles(publicResult.files, table, "to real");
  assert.deepEqual(restored.files, []);
  assert.deepEqual(restored.unmapped, []);
});
