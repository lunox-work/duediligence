import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";

// Extends "consistency: each real name becomes the same public name in .env files and code alike".
test("consistency private: many names across many files of every kind map the same way everywhere", () => {
  const count = 40;
  const table = Array.from({ length: count }, (_, i) => ({
    real: `NORTHWIND_SVC${i}_URL`,
    public: `PUB_${String.fromCharCode(65 + (i % 26))}${i}_URL`,
  }));
  const kinds = ["envFile", "envDot", "dot", "double", "single"] as const;
  const render = (kind: (typeof kinds)[number], name: string) => {
    switch (kind) {
      case "envFile":
      case "envDot":
        return `${name}=value\nexport ${name}=value\n`;
      case "dot":
        return `const v = process.env.${name};\n`;
      case "double":
        return `const v = process.env["${name}"];\n`;
      case "single":
        return `const v = process.env['${name}'];\n`;
    }
  };
  const pathOf = (kind: (typeof kinds)[number], f: number) =>
    kind === "envFile" ? `app${f}/.env` : kind === "envDot" ? `app${f}/.env.local` : `app${f}/src/${kind}.ts`;
  const files: { path: string; text: string }[] = [];
  const expected: { path: string; text: string }[] = [];
  for (let f = 0; f < 6; f++) {
    for (const kind of kinds) {
      // Each file uses the names in a different order.
      const order = table.map((_, i) => (i * (f + 1) + f) % count);
      files.push({ path: pathOf(kind, f), text: order.map((i) => render(kind, table[i].real)).join("") });
      expected.push({ path: pathOf(kind, f), text: order.map((i) => render(kind, table[i].public)).join("") });
    }
  }
  const result = mapFiles(files, table, "to public");
  assert.deepEqual(result, { files: expected, unmapped: [] });
});

test("consistency private: file order and paths are kept, one result per input file", () => {
  const table = [{ real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" }];
  const files = [
    { path: "z/last.ts", text: "process.env.NORTHWIND_SMTP_HOST" },
    { path: "a/.env", text: "NORTHWIND_SMTP_HOST=1" },
    { path: "z/last.ts", text: "process.env['NORTHWIND_SMTP_HOST']" },
    { path: "m/empty.ts", text: "" },
  ];
  const result = mapFiles(files, table, "to public");
  assert.deepEqual(result.files, [
    { path: "z/last.ts", text: "process.env.SVC_A_HOST" },
    { path: "a/.env", text: "SVC_A_HOST=1" },
    { path: "z/last.ts", text: "process.env['SVC_A_HOST']" },
    { path: "m/empty.ts", text: "" },
  ]);
});

// Extends "consistency: an empty set of files maps to no files and no unmapped names".
test("consistency private: an empty set of files mapped to real gives no files and no unmapped names", () => {
  const table = [
    { real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" },
    { real: "NORTHWIND_DB_URL", public: "SVC_B_URL" },
  ];
  assert.deepEqual(mapFiles([], table, "to real"), { files: [], unmapped: [] });
  assert.deepEqual(mapFiles([], [], "to public"), { files: [], unmapped: [] });
});
