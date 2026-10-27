import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";
import type { NameTable } from "../../src/index.js";

const TABLE: NameTable = [{ real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" }];

const lines = (...ls: string[]): string => ls.join("\n");

test("env file: the spec's .env.example is mapped to public", () => {
  const text = lines(
    "# mail",
    "NORTHWIND_SMTP_HOST=localhost",
    "export NORTHWIND_SMTP_HOST=localhost",
  );
  const result = mapFiles([{ path: ".env.example", text }], TABLE, "to public");
  assert.deepEqual(result.files, [
    {
      path: ".env.example",
      text: lines("# mail", "SVC_A_HOST=localhost", "export SVC_A_HOST=localhost"),
    },
  ]);
  assert.deepEqual(result.unmapped, []);
});

test("env file: other names, values and a nested .env file are mapped to public", () => {
  const table: NameTable = [
    { real: "ACME_DB_URL", public: "SVC_Q_URL" },
    { real: "ACME_S3_BUCKET", public: "SVC_R_BUCKET" },
  ];
  const text = lines(
    "export ACME_S3_BUCKET=assets-prod",
    "",
    "ACME_DB_URL=postgres://db:5432/app",
    "",
  );
  const result = mapFiles([{ path: "deploy/config/.env", text }], table, "to public");
  assert.deepEqual(result.files, [
    {
      path: "deploy/config/.env",
      text: lines(
        "export SVC_R_BUCKET=assets-prod",
        "",
        "SVC_Q_URL=postgres://db:5432/app",
        "",
      ),
    },
  ]);
  assert.deepEqual(result.unmapped, []);
});

test("env file: names in files named .env.<anything> are mapped", () => {
  const table: NameTable = [{ real: "ZEPHYR_TOKEN", public: "SVC_T_TOKEN" }];
  const paths = [".env", ".env.local", ".env.production.local", "apps/web/.env.test"];
  const files = paths.map((path) => ({ path, text: "ZEPHYR_TOKEN=abc123\n" }));
  const result = mapFiles(files, table, "to public");
  assert.deepEqual(
    result.files,
    paths.map((path) => ({ path, text: "SVC_T_TOKEN=abc123\n" })),
  );
});

test("env file: values and comments that mention a name are left as they are", () => {
  const table: NameTable = [
    { real: "ORBIT_CACHE_HOST", public: "SVC_C_HOST" },
    { real: "ORBIT_CACHE_PORT", public: "SVC_C_PORT" },
  ];
  const text = lines(
    "# ORBIT_CACHE_HOST points at the cache",
    "#ORBIT_CACHE_PORT=6380",
    "ORBIT_CACHE_HOST=ORBIT_CACHE_PORT",
    "export ORBIT_CACHE_PORT=\"ORBIT_CACHE_HOST:6379\"",
  );
  const result = mapFiles([{ path: ".env.sample", text }], table, "to public");
  assert.equal(
    result.files[0]!.text,
    lines(
      "# ORBIT_CACHE_HOST points at the cache",
      "#ORBIT_CACHE_PORT=6380",
      "SVC_C_HOST=ORBIT_CACHE_PORT",
      "export SVC_C_PORT=\"ORBIT_CACHE_HOST:6379\"",
    ),
  );
});

test("env file: mapping to real renames public names before '=' back to real ones", () => {
  const table: NameTable = [
    { real: "ACME_DB_URL", public: "SVC_Q_URL" },
    { real: "ACME_DB_POOL", public: "SVC_Q_POOL" },
  ];
  const text = lines("# db SVC_Q_URL", "SVC_Q_POOL=10", "export SVC_Q_URL=SVC_Q_POOL");
  const result = mapFiles([{ path: ".env.ci", text }], table, "to real");
  assert.deepEqual(result.files, [
    {
      path: ".env.ci",
      text: lines("# db SVC_Q_URL", "ACME_DB_POOL=10", "export ACME_DB_URL=SVC_Q_POOL"),
    },
  ]);
  assert.deepEqual(result.unmapped, []);
});

test("env file: files whose name is not .env or .env.* are not treated as .env files", () => {
  const table: NameTable = [{ real: "ZEPHYR_TOKEN", public: "SVC_T_TOKEN" }];
  const paths = [".envrc", "settings.env", "env.example", "notes/.environment", "README.md"];
  const files = paths.map((path) => ({ path, text: "ZEPHYR_TOKEN=abc123\n" }));
  const result = mapFiles(files, table, "to public");
  assert.deepEqual(result.files, files);
});

test("env file: a file with no names in it is unchanged", () => {
  const files = [{ path: ".env.empty", text: "# nothing here\n\n" }];
  const result = mapFiles(files, TABLE, "to public");
  assert.deepEqual(result, { files, unmapped: [] });
});
