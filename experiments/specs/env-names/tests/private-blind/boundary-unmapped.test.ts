import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";
import type { NameTable, SourceFile } from "../../src/index.js";

const lines = (...ls: string[]): string => ls.join("\n");

const PREFIX_TABLE: NameTable = [
  { real: "NORTHWIND_SMTP", public: "SVC_A" },
  { real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" },
];

test("prefix: the spec's NORTHWIND_SMTP and NORTHWIND_SMTP_HOST reads are matched whole", () => {
  const text = lines(
    "const a = process.env.NORTHWIND_SMTP;",
    "const b = process.env.NORTHWIND_SMTP_HOST;",
  );
  const result = mapFiles([{ path: "src/smtp.ts", text }], PREFIX_TABLE, "to public");
  assert.equal(
    result.files[0]!.text,
    lines("const a = process.env.SVC_A;", "const b = process.env.SVC_A_HOST;"),
  );
  assert.deepEqual(result.unmapped, []);
});

test("prefix: names that start other names are matched whole in either table order, in .env and code", () => {
  const entries = [
    { real: "BOREAL_CACHE_TTL", public: "SVC_Z_TTL" },
    { real: "BOREAL_CACHE", public: "SVC_Y" },
    { real: "BOREAL_CACHE_TTL_MAX", public: "SVC_W" },
  ];
  const files: SourceFile[] = [
    {
      path: ".env",
      text: lines("BOREAL_CACHE_TTL_MAX=600", "BOREAL_CACHE=redis", "BOREAL_CACHE_TTL=60"),
    },
    {
      path: "src/cache.ts",
      text: "[process.env['BOREAL_CACHE_TTL'], process.env.BOREAL_CACHE_TTL_MAX, process.env[\"BOREAL_CACHE\"], process.env.BOREAL_CACHE]",
    },
  ];
  const expected: SourceFile[] = [
    { path: ".env", text: lines("SVC_W=600", "SVC_Y=redis", "SVC_Z_TTL=60") },
    {
      path: "src/cache.ts",
      text: "[process.env['SVC_Z_TTL'], process.env.SVC_W, process.env[\"SVC_Y\"], process.env.SVC_Y]",
    },
  ];
  for (const table of [entries, [...entries].reverse()]) {
    const result = mapFiles(files, table, "to public");
    assert.deepEqual(result.files, expected);
    assert.deepEqual(result.unmapped, []);
  }
});

test("prefix: mapping to real matches public names whole", () => {
  const text = lines("SVC_A_HOST=h", "SVC_A=s");
  const code = "process.env.SVC_A_HOST + process.env.SVC_A";
  const result = mapFiles(
    [
      { path: ".env.dev", text },
      { path: "a.ts", text: code },
    ],
    PREFIX_TABLE,
    "to real",
  );
  assert.deepEqual(result.files, [
    { path: ".env.dev", text: lines("NORTHWIND_SMTP_HOST=h", "NORTHWIND_SMTP=s") },
    { path: "a.ts", text: "process.env.NORTHWIND_SMTP_HOST + process.env.NORTHWIND_SMTP" },
  ]);
});

test("prefix: a longer name missing from the table is not renamed by its mapped prefix", () => {
  const table: NameTable = [{ real: "BOREAL_CACHE", public: "SVC_Y" }];
  const files: SourceFile[] = [
    { path: ".env", text: lines("BOREAL_CACHE_SIZE=10", "BOREAL_CACHE=on") },
    { path: "src/c.ts", text: "process.env.BOREAL_CACHE_SIZE ?? process.env.BOREAL_CACHE" },
  ];
  const result = mapFiles(files, table, "to public");
  assert.deepEqual(result.files, [
    { path: ".env", text: lines("BOREAL_CACHE_SIZE=10", "SVC_Y=on") },
    { path: "src/c.ts", text: "process.env.BOREAL_CACHE_SIZE ?? process.env.SVC_Y" },
  ]);
  assert.deepEqual(result.unmapped, ["BOREAL_CACHE_SIZE"]);
});

test("unmapped: the spec's NORTHWIND_API_KEY is left and reported once", () => {
  const table: NameTable = [{ real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" }];
  const files: SourceFile[] = [
    { path: ".env", text: lines("NORTHWIND_API_KEY=abc", "NORTHWIND_SMTP_HOST=localhost") },
    { path: "src/api.ts", text: "const k = process.env.NORTHWIND_API_KEY;" },
  ];
  const result = mapFiles(files, table, "to public");
  assert.deepEqual(result.files, [
    { path: ".env", text: lines("NORTHWIND_API_KEY=abc", "SVC_A_HOST=localhost") },
    { path: "src/api.ts", text: "const k = process.env.NORTHWIND_API_KEY;" },
  ]);
  assert.deepEqual(result.unmapped, ["NORTHWIND_API_KEY"]);
});

test("unmapped: several missing names across files are listed once each, sorted", () => {
  const table: NameTable = [{ real: "TUNDRA_LOG_LEVEL", public: "SVC_L_LEVEL" }];
  const files: SourceFile[] = [
    {
      path: "src/z.ts",
      text: lines(
        "process.env.TUNDRA_ZONE;",
        "process.env['TUNDRA_MAX_CONN'];",
        "process.env.TUNDRA_LOG_LEVEL;",
        "process.env[\"TUNDRA_ZONE\"];",
      ),
    },
    {
      path: "ops/.env.qa",
      text: lines("export TUNDRA_BIND_ADDR=0.0.0.0", "TUNDRA_MAX_CONN=5", "TUNDRA_LOG_LEVEL=info"),
    },
    { path: "lib/q.js", text: "module.exports = process.env.TUNDRA_QUEUE || process.env.TUNDRA_BIND_ADDR;" },
  ];
  const result = mapFiles(files, table, "to public");
  assert.deepEqual(result.unmapped, [
    "TUNDRA_BIND_ADDR",
    "TUNDRA_MAX_CONN",
    "TUNDRA_QUEUE",
    "TUNDRA_ZONE",
  ]);
  assert.deepEqual(result.files, [
    {
      path: "src/z.ts",
      text: lines(
        "process.env.TUNDRA_ZONE;",
        "process.env['TUNDRA_MAX_CONN'];",
        "process.env.SVC_L_LEVEL;",
        "process.env[\"TUNDRA_ZONE\"];",
      ),
    },
    {
      path: "ops/.env.qa",
      text: lines("export TUNDRA_BIND_ADDR=0.0.0.0", "TUNDRA_MAX_CONN=5", "SVC_L_LEVEL=info"),
    },
    { path: "lib/q.js", text: "module.exports = process.env.TUNDRA_QUEUE || process.env.TUNDRA_BIND_ADDR;" },
  ]);
});

test("unmapped: names missing from the table are reported when mapping to real", () => {
  const table: NameTable = [{ real: "TUNDRA_LOG_LEVEL", public: "SVC_L_LEVEL" }];
  const files: SourceFile[] = [
    { path: "src/a.ts", text: "process.env.SVC_L_LEVEL + process.env.SVC_UNKNOWN_B" },
    { path: ".env", text: lines("SVC_UNKNOWN_A=1", "SVC_L_LEVEL=debug", "SVC_UNKNOWN_B=2") },
  ];
  const result = mapFiles(files, table, "to real");
  assert.deepEqual(result.files, [
    { path: "src/a.ts", text: "process.env.TUNDRA_LOG_LEVEL + process.env.SVC_UNKNOWN_B" },
    { path: ".env", text: lines("SVC_UNKNOWN_A=1", "TUNDRA_LOG_LEVEL=debug", "SVC_UNKNOWN_B=2") },
  ]);
  assert.deepEqual(result.unmapped, ["SVC_UNKNOWN_A", "SVC_UNKNOWN_B"]);
});

test("unmapped: with an empty table every found name is left and reported", () => {
  const files: SourceFile[] = [
    { path: ".env", text: "QUASAR_B=2\nQUASAR_A=1\n" },
    { path: "x.ts", text: "process.env.QUASAR_C" },
  ];
  const result = mapFiles(files, [], "to public");
  assert.deepEqual(result.files, files);
  assert.deepEqual(result.unmapped, ["QUASAR_A", "QUASAR_B", "QUASAR_C"]);
});
