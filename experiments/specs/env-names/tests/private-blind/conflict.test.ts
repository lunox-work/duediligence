import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";
import type { NameTable, SourceFile } from "../../src/index.js";

function assertFailsNaming(run: () => unknown, name: string): void {
  assert.throws(run, (err: unknown) => {
    assert.ok(err instanceof Error, `expected an Error, got: ${String(err)}`);
    const message = (err as Error).message;
    assert.ok(message.includes(name), `expected the error to name ${name}, got: ${message}`);
    assert.ok(!message.includes("not implemented"));
    return true;
  });
}

test("conflict: the spec's NORTHWIND_A and NORTHWIND_B both mapped to SVC_X is refused", () => {
  const table: NameTable = [
    { real: "NORTHWIND_A", public: "SVC_X" },
    { real: "NORTHWIND_B", public: "SVC_X" },
  ];
  const files: SourceFile[] = [{ path: ".env", text: "NORTHWIND_A=1\n" }];
  assertFailsNaming(() => mapFiles(files, table, "to public"), "SVC_X");
});

test("conflict: a shared public name among other entries is refused in both directions", () => {
  const table: NameTable = [
    { real: "GLACIER_HOST", public: "SVC_G_HOST" },
    { real: "GLACIER_PRIMARY_URL", public: "SVC_SHARED_URL" },
    { real: "GLACIER_PORT", public: "SVC_G_PORT" },
    { real: "GLACIER_REPLICA_URL", public: "SVC_SHARED_URL" },
  ];
  const files: SourceFile[] = [
    { path: "src/g.ts", text: "process.env.GLACIER_HOST" },
    { path: ".env.local", text: "SVC_G_PORT=1" },
  ];
  assertFailsNaming(() => mapFiles(files, table, "to public"), "SVC_SHARED_URL");
  assertFailsNaming(() => mapFiles(files, table, "to real"), "SVC_SHARED_URL");
});

test("conflict: the table is refused even when no file uses the shared name", () => {
  const table: NameTable = [
    { real: "PIKE_ONE", public: "SVC_DUP" },
    { real: "PIKE_TWO", public: "SVC_DUP" },
  ];
  assertFailsNaming(() => mapFiles([], table, "to public"), "SVC_DUP");
  assertFailsNaming(
    () => mapFiles([{ path: "README.md", text: "nothing to see" }], table, "to real"),
    "SVC_DUP",
  );
});
