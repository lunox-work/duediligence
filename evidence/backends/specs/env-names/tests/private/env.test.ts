import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";

// Extends "[happy-1] maps assignments and exported assignments in .env.example".
test("[happy-1] maps repeated exported and plain assignments with unrelated names", () => {
  const result = mapFiles(
    [{ path: ".env.example", text: "ORCHARD_DB2_URL=one\nexport ORCHARD_TOKEN_7=two\nORCHARD_DB2_URL=three\nexport ORCHARD_DB2_URL=four\nORCHARD_TOKEN_7=five" }],
    [
      { real: "ORCHARD_TOKEN_7", public: "APP_CREDENTIAL_9" },
      { real: "ORCHARD_DB2_URL", public: "APP_STORAGE_URL" },
    ],
    "to public",
  );
  assert.deepEqual(result.files, [{
    path: ".env.example",
    text: "APP_STORAGE_URL=one\nexport APP_CREDENTIAL_9=two\nAPP_STORAGE_URL=three\nexport APP_STORAGE_URL=four\nAPP_CREDENTIAL_9=five",
  }]);
  assert.deepEqual(result.unmapped, []);
});

// Extends "[happy-1] recognizes .env basenames and dotted variants while preserving comments and values".
test("[happy-1] uses the complete basename even in env-named directories", () => {
  const paths = [
    "deep/config/.env", "deep/config/.env.local.example", ".env.",
    ".env.templates/.env.test", ".env.templates/settings.txt",
    "config/.envrc", "config/.env-production", "config/app.env.local",
  ];
  const text = "# ORCHARD_KEY=comment\nexport ORCHARD_KEY=ORCHARD_KEY\n";
  const mapped = "# ORCHARD_KEY=comment\nexport APP_KEY=ORCHARD_KEY\n";
  const result = mapFiles(
    paths.map((path) => ({ path, text })),
    [{ real: "ORCHARD_KEY", public: "APP_KEY" }],
    "to public",
  );
  assert.deepEqual(result.files, paths.map((path, index) => ({
    path, text: index < 4 ? mapped : text,
  })));
});

test("[happy-1] leaves all text after the assignment equals sign and in comments intact", () => {
  const text = [
    "# ORCHARD_KEY=ORCHARD_OTHER",
    "ORCHARD_KEY=ORCHARD_KEY=ORCHARD_OTHER",
    'export ORCHARD_OTHER="ORCHARD_KEY and ORCHARD_OTHER"',
    "ORCHARD_KEY='process.env.ORCHARD_OTHER' # ORCHARD_KEY",
    "ORCHARD_OTHER=",
    "",
  ].join("\n");
  const result = mapFiles([{ path: ".env.local", text }], [
    { real: "ORCHARD_KEY", public: "APP_KEY" },
    { real: "ORCHARD_OTHER", public: "APP_OTHER" },
  ], "to public");
  assert.deepEqual(result.files, [{ path: ".env.local", text: [
    "# ORCHARD_KEY=ORCHARD_OTHER",
    "APP_KEY=ORCHARD_KEY=ORCHARD_OTHER",
    'export APP_OTHER="ORCHARD_KEY and ORCHARD_OTHER"',
    "APP_KEY='process.env.ORCHARD_OTHER' # ORCHARD_KEY",
    "APP_OTHER=",
    "",
  ].join("\n") }]);
  assert.deepEqual(result.unmapped, []);
});

test("[happy-1] preserves CRLF blank lines and an unterminated last assignment", () => {
  const result = mapFiles(
    [{ path: "nested/.env.test", text: "\r\n# ORCHARD_KEY\r\nORCHARD_KEY=first\r\n\r\nexport ORCHARD_KEY=last" }],
    [{ real: "ORCHARD_KEY", public: "APP_KEY" }],
    "to public",
  );
  assert.deepEqual(result.files, [{
    path: "nested/.env.test",
    text: "\r\n# ORCHARD_KEY\r\nAPP_KEY=first\r\n\r\nexport APP_KEY=last",
  }]);
});

test("[happy-1] maps public assignment names to real names without changing public text in values", () => {
  const result = mapFiles(
    [{ path: ".env.production", text: "# APP_USER\nAPP_USER=APP_USER\nexport APP_PASSWORD='APP_USER=APP_PASSWORD'\nAPP_USER=" }],
    [
      { real: "ORCHARD_LOGIN", public: "APP_USER" },
      { real: "ORCHARD_SECRET", public: "APP_PASSWORD" },
    ],
    "to real",
  );
  assert.deepEqual(result.files, [{
    path: ".env.production",
    text: "# APP_USER\nORCHARD_LOGIN=APP_USER\nexport ORCHARD_SECRET='APP_USER=APP_PASSWORD'\nORCHARD_LOGIN=",
  }]);
  assert.deepEqual(result.unmapped, []);
});

test("[happy-1] assignment replacements do not cascade into another table entry", () => {
  const result = mapFiles(
    [{ path: ".env", text: "ORCHARD_FIRST=1\nORCHARD_SECOND=2\nexport ORCHARD_THIRD=3" }],
    [
      { real: "ORCHARD_FIRST", public: "ORCHARD_SECOND" },
      { real: "ORCHARD_SECOND", public: "ORCHARD_THIRD" },
      { real: "ORCHARD_THIRD", public: "APP_LAST" },
    ],
    "to public",
  );
  assert.deepEqual(result.files, [{
    path: ".env", text: "ORCHARD_SECOND=1\nORCHARD_THIRD=2\nexport APP_LAST=3",
  }]);
  assert.deepEqual(result.unmapped, []);
});

test("[happy-1] an entry with identical real and public names is a mapped assignment", () => {
  const result = mapFiles(
    [{ path: ".env", text: "SHARED_PORT=8080\nexport ORCHARD_KEY=secret" }],
    [
      { real: "SHARED_PORT", public: "SHARED_PORT" },
      { real: "ORCHARD_KEY", public: "APP_KEY" },
    ],
    "to public",
  );
  assert.deepEqual(result.files, [{ path: ".env", text: "SHARED_PORT=8080\nexport APP_KEY=secret" }]);
  assert.deepEqual(result.unmapped, []);
});

test("[happy-1] maps valid single-letter lowercase and mixed-case assignment names", () => {
  const result = mapFiles([
    { path: ".env", text: "x=x\nexport Orchard_Key2=Orchard_Key2\n_ORCHARD_PORT=8080" },
  ], [
    { real: "x", public: "y" },
    { real: "Orchard_Key2", public: "App_Key2" },
    { real: "_ORCHARD_PORT", public: "_APP_PORT" },
  ], "to public");
  assert.deepEqual(result.files, [{
    path: ".env", text: "y=x\nexport App_Key2=Orchard_Key2\n_APP_PORT=8080",
  }]);
  assert.deepEqual(result.unmapped, []);
});
