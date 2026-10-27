import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";

const table = [
  { real: "NORTHWIND_A", public: "SVC_X" },
  { real: "NORTHWIND_B", public: "SVC_X" },
];

test("duplicate public name: mapping files to public fails with an error naming it", () => {
  const files = [
    { path: ".env", text: "NORTHWIND_A=1\nNORTHWIND_B=2\n" },
    { path: "src/app.ts", text: "const a = process.env.NORTHWIND_A;\n" },
  ];
  assert.throws(
    () => mapFiles(files, table, "to public"),
    (err: unknown) => err instanceof Error && err.message.includes("SVC_X"),
  );
});

test("duplicate public name: mapping no files to real still fails with an error naming it", () => {
  assert.throws(
    () => mapFiles([], table, "to real"),
    (err: unknown) => err instanceof Error && err.message.includes("SVC_X"),
  );
});
