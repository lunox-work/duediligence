import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";
import type { NameTable } from "../../src/index.js";

const TABLE: NameTable = [{ real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" }];

const lines = (...ls: string[]): string => ls.join("\n");

test("code: the spec's src/mail.ts reads are mapped and the comment is left", () => {
  const text = lines(
    "const host = process.env.NORTHWIND_SMTP_HOST;",
    "const again = process.env[\"NORTHWIND_SMTP_HOST\"] ?? process.env['NORTHWIND_SMTP_HOST'];",
    "// NORTHWIND_SMTP_HOST is documented elsewhere",
  );
  const result = mapFiles([{ path: "src/mail.ts", text }], TABLE, "to public");
  assert.deepEqual(result.files, [
    {
      path: "src/mail.ts",
      text: lines(
        "const host = process.env.SVC_A_HOST;",
        "const again = process.env[\"SVC_A_HOST\"] ?? process.env['SVC_A_HOST'];",
        "// NORTHWIND_SMTP_HOST is documented elsewhere",
      ),
    },
  ]);
  assert.deepEqual(result.unmapped, []);
});

test("code: dot and bracket reads of other names are mapped in a .js file", () => {
  const table: NameTable = [
    { real: "ACME_QUEUE_URL", public: "SVC_K_URL" },
    { real: "ACME_RETRY_MAX", public: "SVC_K_RETRIES" },
  ];
  const text = lines(
    "export function config() {",
    "  const retries = Number(process.env['ACME_RETRY_MAX'] || 3);",
    "  return { url: process.env.ACME_QUEUE_URL.trim(), retries,",
    "    fallback: process.env[\"ACME_QUEUE_URL\"] };",
    "}",
    "",
  );
  const result = mapFiles([{ path: "lib/queue/config.js", text }], table, "to public");
  assert.deepEqual(result.files, [
    {
      path: "lib/queue/config.js",
      text: lines(
        "export function config() {",
        "  const retries = Number(process.env['SVC_K_RETRIES'] || 3);",
        "  return { url: process.env.SVC_K_URL.trim(), retries,",
        "    fallback: process.env[\"SVC_K_URL\"] };",
        "}",
        "",
      ),
    },
  ]);
  assert.deepEqual(result.unmapped, []);
});

test("code: mentions that are not reads of process.env are left as they are", () => {
  const table: NameTable = [{ real: "ACME_QUEUE_URL", public: "SVC_K_URL" }];
  const text = lines(
    "/* ACME_QUEUE_URL must be set */",
    "const label = \"ACME_QUEUE_URL\";",
    "const ACME_QUEUE_URL = 1;",
    "const url = process.env.ACME_QUEUE_URL; // ACME_QUEUE_URL",
  );
  const result = mapFiles([{ path: "src/queue.ts", text }], table, "to public");
  assert.equal(
    result.files[0]!.text,
    lines(
      "/* ACME_QUEUE_URL must be set */",
      "const label = \"ACME_QUEUE_URL\";",
      "const ACME_QUEUE_URL = 1;",
      "const url = process.env.SVC_K_URL; // ACME_QUEUE_URL",
    ),
  );
});

test("code: mapping to real renames public names in process.env reads", () => {
  const table: NameTable = [
    { real: "ACME_QUEUE_URL", public: "SVC_K_URL" },
    { real: "ACME_RETRY_MAX", public: "SVC_K_RETRIES" },
  ];
  const text = lines(
    "// SVC_K_URL",
    "const a = process.env.SVC_K_RETRIES;",
    "const b = process.env['SVC_K_URL'] + process.env[\"SVC_K_RETRIES\"];",
  );
  const result = mapFiles([{ path: "src/a.ts", text }], table, "to real");
  assert.deepEqual(result.files, [
    {
      path: "src/a.ts",
      text: lines(
        "// SVC_K_URL",
        "const a = process.env.ACME_RETRY_MAX;",
        "const b = process.env['ACME_QUEUE_URL'] + process.env[\"ACME_RETRY_MAX\"];",
      ),
    },
  ]);
  assert.deepEqual(result.unmapped, []);
});

test("code: files come back one per input, in the same order, with their paths", () => {
  const table: NameTable = [{ real: "ACME_QUEUE_URL", public: "SVC_K_URL" }];
  const files = [
    { path: "z/last.ts", text: "process.env.ACME_QUEUE_URL" },
    { path: "a/first.ts", text: "no reads here" },
    { path: ".env", text: "ACME_QUEUE_URL=x" },
    { path: "m/mid.ts", text: "" },
  ];
  const result = mapFiles(files, table, "to public");
  assert.deepEqual(result.files, [
    { path: "z/last.ts", text: "process.env.SVC_K_URL" },
    { path: "a/first.ts", text: "no reads here" },
    { path: ".env", text: "SVC_K_URL=x" },
    { path: "m/mid.ts", text: "" },
  ]);
});

test("code: an empty set of files maps to an empty result", () => {
  assert.deepEqual(mapFiles([], TABLE, "to public"), { files: [], unmapped: [] });
});
