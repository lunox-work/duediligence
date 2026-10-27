import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";

test("[boundary-1] maps a shorter name and its longer counterpart as whole dot-read names", () => {
  const result = mapFiles(
    [{ path: "src/mail.ts", text: "const service = process.env.NORTHWIND_SMTP;\nconst host = process.env.NORTHWIND_SMTP_HOST;\n" }],
    [
      { real: "NORTHWIND_SMTP", public: "SVC_A" },
      { real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" },
    ],
    "to public",
  );

  assert.deepEqual(result.files, [
    { path: "src/mail.ts", text: "const service = process.env.SVC_A;\nconst host = process.env.SVC_A_HOST;\n" },
  ]);
  assert.deepEqual(result.unmapped, []);
});

test("[boundary-1] quoted reads match whole names and leave an unlisted longer name intact", () => {
  const result = mapFiles(
    [{
      path: "src/mail.ts",
      text: 'process.env["NORTHWIND_SMTP_HOST"] + process.env[\'NORTHWIND_SMTP\'] + process.env.NORTHWIND_SMTP_HOST_EXTRA',
    }],
    [
      { real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" },
      { real: "NORTHWIND_SMTP", public: "SVC_A" },
    ],
    "to public",
  );

  assert.deepEqual(result.files, [{
    path: "src/mail.ts",
    text: 'process.env["SVC_A_HOST"] + process.env[\'SVC_A\'] + process.env.NORTHWIND_SMTP_HOST_EXTRA',
  }]);
  assert.deepEqual(result.unmapped, ["NORTHWIND_SMTP_HOST_EXTRA"]);
});

test("[boundary-2] leaves missing names unchanged and reports them once in alphabetical order", () => {
  const result = mapFiles(
    [
      { path: ".env", text: "NORTHWIND_Z_TOKEN=z\nNORTHWIND_API_KEY=a\nexport NORTHWIND_API_KEY=b\nNORTHWIND_SMTP_HOST=localhost\n" },
      { path: "src/config.ts", text: 'process.env.NORTHWIND_Z_TOKEN;\nprocess.env["NORTHWIND_API_KEY"];\nprocess.env[\'NORTHWIND_Z_TOKEN\'];\nprocess.env.NORTHWIND_SMTP_HOST;\n' },
    ],
    [{ real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" }],
    "to public",
  );

  assert.deepEqual(result.files, [
    { path: ".env", text: "NORTHWIND_Z_TOKEN=z\nNORTHWIND_API_KEY=a\nexport NORTHWIND_API_KEY=b\nSVC_A_HOST=localhost\n" },
    { path: "src/config.ts", text: 'process.env.NORTHWIND_Z_TOKEN;\nprocess.env["NORTHWIND_API_KEY"];\nprocess.env[\'NORTHWIND_Z_TOKEN\'];\nprocess.env.SVC_A_HOST;\n' },
  ]);
  assert.deepEqual(result.unmapped, ["NORTHWIND_API_KEY", "NORTHWIND_Z_TOKEN"]);
});

test("[boundary-2] an empty table reports names only from assignments and process.env reads", () => {
  const files = [
    { path: ".env", text: "# DOCUMENTED_TOKEN=comment\nZEBRA_TOKEN=VALUE_TOKEN\nexport ALPHA_TOKEN=ZEBRA_TOKEN\n" },
    { path: "src/config.ts", text: 'process.env.ZEBRA_TOKEN;\nprocess.env["ALPHA_TOKEN"];\nprocess.env[\'ZEBRA_TOKEN\'];\nconst label = "DOCUMENTED_TOKEN";\n// COMMENT_TOKEN\n' },
  ];
  const original = files.map((file) => ({ ...file }));
  const result = mapFiles(files, [], "to public");

  assert.deepEqual(result.files, original);
  assert.deepEqual(result.unmapped, ["ALPHA_TOKEN", "ZEBRA_TOKEN"]);
});
