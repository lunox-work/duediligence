import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";
import type { NameTable, SourceFile } from "../../src/index.js";

const lines = (...ls: string[]): string => ls.join("\n");

test("consistency: two real names become the same public names in every kind of file", () => {
  const table: NameTable = [
    { real: "KESTREL_API_SECRET", public: "SVC_P_SECRET" },
    { real: "KESTREL_API_BASE", public: "SVC_P_BASE" },
  ];
  const files: SourceFile[] = [
    { path: ".env", text: lines("KESTREL_API_BASE=https://api", "KESTREL_API_SECRET=s3cr3t") },
    { path: "ops/.env.staging", text: lines("export KESTREL_API_SECRET=x", "export KESTREL_API_BASE=y") },
    {
      path: "src/client.ts",
      text: "fetch(process.env.KESTREL_API_BASE, { key: process.env['KESTREL_API_SECRET'] });",
    },
    {
      path: "scripts/check.mjs",
      text: "if (!process.env[\"KESTREL_API_SECRET\"] || !process.env.KESTREL_API_BASE) exit(1);",
    },
  ];
  const result = mapFiles(files, table, "to public");
  assert.deepEqual(result.files, [
    { path: ".env", text: lines("SVC_P_BASE=https://api", "SVC_P_SECRET=s3cr3t") },
    { path: "ops/.env.staging", text: lines("export SVC_P_SECRET=x", "export SVC_P_BASE=y") },
    {
      path: "src/client.ts",
      text: "fetch(process.env.SVC_P_BASE, { key: process.env['SVC_P_SECRET'] });",
    },
    {
      path: "scripts/check.mjs",
      text: "if (!process.env[\"SVC_P_SECRET\"] || !process.env.SVC_P_BASE) exit(1);",
    },
  ]);
  assert.deepEqual(result.unmapped, []);
});

test("consistency: the result does not depend on the order of the table entries", () => {
  const entries = [
    { real: "KESTREL_API_SECRET", public: "SVC_P_SECRET" },
    { real: "KESTREL_API_BASE", public: "SVC_P_BASE" },
    { real: "KESTREL_REGION", public: "SVC_P_REGION" },
  ];
  const files: SourceFile[] = [
    { path: ".env.local", text: lines("KESTREL_REGION=eu", "KESTREL_API_BASE=b", "KESTREL_API_SECRET=s") },
    { path: "src/r.ts", text: "process.env.KESTREL_REGION + process.env.KESTREL_API_SECRET" },
  ];
  const expected: SourceFile[] = [
    { path: ".env.local", text: lines("SVC_P_REGION=eu", "SVC_P_BASE=b", "SVC_P_SECRET=s") },
    { path: "src/r.ts", text: "process.env.SVC_P_REGION + process.env.SVC_P_SECRET" },
  ];
  assert.deepEqual(mapFiles(files, entries, "to public").files, expected);
  assert.deepEqual(mapFiles(files, [...entries].reverse(), "to public").files, expected);
});

test("round trip: the spec's files map to public and back to exactly the originals", () => {
  const table: NameTable = [{ real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" }];
  const files: SourceFile[] = [
    {
      path: ".env.example",
      text: lines("# mail", "NORTHWIND_SMTP_HOST=localhost", "export NORTHWIND_SMTP_HOST=localhost"),
    },
    {
      path: "src/mail.ts",
      text: lines(
        "const host = process.env.NORTHWIND_SMTP_HOST;",
        "const again = process.env[\"NORTHWIND_SMTP_HOST\"] ?? process.env['NORTHWIND_SMTP_HOST'];",
        "// NORTHWIND_SMTP_HOST is documented elsewhere",
      ),
    },
  ];
  const there = mapFiles(files, table, "to public");
  const back = mapFiles(there.files, table, "to real");
  assert.deepEqual(back.files, files);
});

test("round trip: mixed files with several names, unmapped names and comments come back exactly", () => {
  const table: NameTable = [
    { real: "HALCYON_DB_HOST", public: "SVC_D_HOST" },
    { real: "HALCYON_DB", public: "SVC_D" },
    { real: "HALCYON_MQ_URL", public: "SVC_M_URL" },
    { real: "HALCYON_FEATURE_X2", public: "SVC_F_X2" },
  ];
  const files: SourceFile[] = [
    {
      path: "services/api/.env.production",
      text: lines(
        "# HALCYON_DB_HOST is the primary",
        "HALCYON_DB=main",
        "HALCYON_DB_HOST=HALCYON_DB",
        "",
        "export HALCYON_MQ_URL=amqp://mq",
        "HALCYON_UNLISTED=1",
        "HALCYON_FEATURE_X2=true",
        "",
      ),
    },
    {
      path: "services/api/src/db.ts",
      text: lines(
        "// reads HALCYON_DB and HALCYON_DB_HOST",
        "export const db = { name: process.env.HALCYON_DB, host: process.env['HALCYON_DB_HOST'] };",
        "export const mq = process.env[\"HALCYON_MQ_URL\"] ?? process.env.HALCYON_UNLISTED;",
        "export const x2 = process.env.HALCYON_FEATURE_X2 === 'true';",
      ),
    },
    { path: "docs/README.md", text: "Set HALCYON_DB_HOST=... before starting.\n" },
  ];
  const there = mapFiles(files, table, "to public");
  assert.notDeepEqual(there.files, files);
  const back = mapFiles(there.files, table, "to real");
  assert.deepEqual(back.files, files);
});

test("to real: public names are mapped back across .env and code files", () => {
  const table: NameTable = [
    { real: "HALCYON_DB_HOST", public: "SVC_D_HOST" },
    { real: "HALCYON_MQ_URL", public: "SVC_M_URL" },
  ];
  const files: SourceFile[] = [
    { path: ".env", text: lines("SVC_M_URL=amqp://mq", "SVC_D_HOST=db") },
    { path: "src/x.ts", text: "const h = process.env.SVC_D_HOST, m = process.env['SVC_M_URL'];" },
  ];
  const result = mapFiles(files, table, "to real");
  assert.deepEqual(result.files, [
    { path: ".env", text: lines("HALCYON_MQ_URL=amqp://mq", "HALCYON_DB_HOST=db") },
    { path: "src/x.ts", text: "const h = process.env.HALCYON_DB_HOST, m = process.env['HALCYON_MQ_URL'];" },
  ]);
  assert.deepEqual(result.unmapped, []);
});
