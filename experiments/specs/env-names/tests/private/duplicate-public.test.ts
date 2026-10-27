import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";

function naming(name: string) {
  return (err: unknown) => err instanceof Error && err.message.includes(name);
}

// Extends "duplicate public name: mapping files to public fails with an error naming it".
test("duplicate private: a shared public name among other entries, not adjacent, is named", () => {
  const table = [
    { real: "NORTHWIND_A", public: "SVC_SHARED" },
    { real: "NORTHWIND_B", public: "SVC_B" },
    { real: "NORTHWIND_C", public: "SVC_C" },
    { real: "NORTHWIND_D", public: "SVC_SHARED" },
  ];
  const files = [{ path: ".env", text: "NORTHWIND_B=1\n" }];
  assert.throws(() => mapFiles(files, table, "to public"), naming("SVC_SHARED"));
});

// Extends "duplicate public name: mapping no files to real still fails with an error naming it".
test("duplicate private: mapping no files to public fails with an error naming the shared name", () => {
  const table = [
    { real: "NORTHWIND_DB_URL", public: "SVC_Y" },
    { real: "NORTHWIND_SMTP_HOST", public: "SVC_Z" },
    { real: "NORTHWIND_CACHE_URL", public: "SVC_Y" },
  ];
  assert.throws(() => mapFiles([], table, "to public"), naming("SVC_Y"));
});

test("duplicate private: mapping files to real fails even when no file uses the shared name", () => {
  const table = [
    { real: "NORTHWIND_SMTP_HOST", public: "SVC_A_HOST" },
    { real: "NORTHWIND_X", public: "SVC_DUP" },
    { real: "NORTHWIND_Y", public: "SVC_DUP" },
  ];
  const files = [
    { path: ".env", text: "SVC_A_HOST=h\n" },
    { path: "src/a.ts", text: "const h = process.env.SVC_A_HOST;\n" },
  ];
  assert.throws(() => mapFiles(files, table, "to real"), naming("SVC_DUP"));
});

test("duplicate private: three names sharing one public name are refused", () => {
  const table = [
    { real: "NORTHWIND_A", public: "SVC_TRIPLE" },
    { real: "NORTHWIND_B", public: "SVC_TRIPLE" },
    { real: "NORTHWIND_C", public: "SVC_TRIPLE" },
  ];
  const files = [{ path: "src/a.ts", text: "process.env.NORTHWIND_A;" }];
  assert.throws(() => mapFiles(files, table, "to public"), naming("SVC_TRIPLE"));
});

test("duplicate private: the error names the shared name even when a unique name comes first", () => {
  const table = [
    { real: "NORTHWIND_UNIQUE_ONE", public: "SVC_ONE" },
    { real: "NORTHWIND_P", public: "SVC_PAIR" },
    { real: "NORTHWIND_Q", public: "SVC_PAIR" },
  ];
  assert.throws(
    () => mapFiles([{ path: ".env", text: "NORTHWIND_P=1\n" }], table, "to public"),
    naming("SVC_PAIR"),
  );
});
