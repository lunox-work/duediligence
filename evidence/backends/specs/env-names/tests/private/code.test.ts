import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";

// Extends "[happy-2] maps dot reads and both quoted bracket reads in code".
test("[happy-2] maps every repeated read of three arbitrary names on the same line", () => {
  const result = mapFiles(
    [{ path: "src/storage.ts", text: 'const values = [process.env.ORCHARD_DB2_URL, process.env["ORCHARD_TOKEN_7"], process.env[\'ORCHARD_REGION\'], process.env["ORCHARD_DB2_URL"], process.env.ORCHARD_TOKEN_7, process.env[\'ORCHARD_REGION\']];' }],
    [
      { real: "ORCHARD_REGION", public: "APP_ZONE" },
      { real: "ORCHARD_DB2_URL", public: "APP_STORAGE_URL" },
      { real: "ORCHARD_TOKEN_7", public: "APP_CREDENTIAL_9" },
    ],
    "to public",
  );
  assert.deepEqual(result.files, [{
    path: "src/storage.ts",
    text: 'const values = [process.env.APP_STORAGE_URL, process.env["APP_CREDENTIAL_9"], process.env[\'APP_ZONE\'], process.env["APP_STORAGE_URL"], process.env.APP_CREDENTIAL_9, process.env[\'APP_ZONE\']];',
  }]);
  assert.deepEqual(result.unmapped, []);
});

// Extends "[happy-2] leaves ordinary occurrences beside a process.env read unchanged".
test("[happy-2] read-shaped text in strings and comments is preserved beside actual reads", () => {
  const before = [
    "// process.env.ORCHARD_KEY and process.env.UNKNOWN_COMMENT",
    '/* process.env["ORCHARD_KEY"] and process.env.UNKNOWN_BLOCK */',
    'const example = "process.env.ORCHARD_KEY";',
    'const example2 = \'process.env["ORCHARD_KEY"]\';',
    "const ORCHARD_KEY = { ORCHARD_KEY: 'ORCHARD_KEY' };",
    "const key = process.env.ORCHARD_KEY; // process.env.ORCHARD_KEY",
    'const again = process.env["ORCHARD_KEY"];',
  ];
  const expected = [...before];
  expected[5] = "const key = process.env.APP_KEY; // process.env.ORCHARD_KEY";
  expected[6] = 'const again = process.env["APP_KEY"];';
  const result = mapFiles([{ path: "config.js", text: before.join("\n") }], [
    { real: "ORCHARD_KEY", public: "APP_KEY" },
  ], "to public");
  assert.deepEqual(result.files, [{ path: "config.js", text: expected.join("\n") }]);
  assert.deepEqual(result.unmapped, []);
});

test("[happy-2] maps both bracket quote styles and dot reads directly to real names", () => {
  const result = mapFiles(
    [{ path: "src/runtime.js", text: 'const values = [process.env.APP_FIRST, process.env["APP_SECOND"], process.env[\'APP_FIRST\'], process.env.APP_SECOND];\n// APP_FIRST\n' }],
    [
      { real: "ORCHARD_PRIMARY", public: "APP_FIRST" },
      { real: "ORCHARD_SECONDARY", public: "APP_SECOND" },
    ],
    "to real",
  );
  assert.deepEqual(result.files, [{
    path: "src/runtime.js",
    text: 'const values = [process.env.ORCHARD_PRIMARY, process.env["ORCHARD_SECONDARY"], process.env[\'ORCHARD_PRIMARY\'], process.env.ORCHARD_SECONDARY];\n// APP_FIRST\n',
  }]);
  assert.deepEqual(result.unmapped, []);
});

test("[happy-2] ordinary identifiers object keys and other environment objects remain unchanged", () => {
  const text = [
    "const ORCHARD_KEY = 'ORCHARD_KEY';",
    "const config = { ORCHARD_KEY: ORCHARD_KEY };",
    'const unrelated = [config.ORCHARD_KEY, config["ORCHARD_KEY"], other.env.ORCHARD_KEY];',
    "const actual = process.env.ORCHARD_KEY;",
  ].join("\n");
  const result = mapFiles([{ path: "reader.ts", text }], [
    { real: "ORCHARD_KEY", public: "APP_KEY" },
  ], "to public");
  assert.deepEqual(result.files, [{
    path: "reader.ts",
    text: text.replace("const actual = process.env.ORCHARD_KEY;", "const actual = process.env.APP_KEY;"),
  }]);
});

test("[happy-2] reads in multiple JavaScript and TypeScript file kinds use the same table", () => {
  const paths = ["a.ts", "b.js", "nested/c.mjs", "nested/d.cjs", "ui/e.tsx"];
  const text = 'const x = process.env.ORCHARD_A + process.env["ORCHARD_B"];';
  const result = mapFiles(paths.map((path) => ({ path, text })), [
    { real: "ORCHARD_A", public: "APP_A" },
    { real: "ORCHARD_B", public: "APP_B" },
  ], "to public");
  assert.deepEqual(result.files, paths.map((path) => ({
    path, text: 'const x = process.env.APP_A + process.env["APP_B"];',
  })));
  assert.deepEqual(result.unmapped, []);
});

test("[happy-2] cyclic code mappings replace each original read exactly once", () => {
  const result = mapFiles(
    [{ path: "cycle.ts", text: 'process.env.ORCHARD_A + process.env["ORCHARD_B"] + process.env[\'ORCHARD_C\']' }],
    [
      { real: "ORCHARD_A", public: "ORCHARD_B" },
      { real: "ORCHARD_B", public: "ORCHARD_C" },
      { real: "ORCHARD_C", public: "ORCHARD_A" },
    ],
    "to public",
  );
  assert.deepEqual(result.files, [{
    path: "cycle.ts", text: 'process.env.ORCHARD_B + process.env["ORCHARD_C"] + process.env[\'ORCHARD_A\']',
  }]);
  assert.deepEqual(result.unmapped, []);
});

test("[happy-2] treats names shared with JavaScript object properties as ordinary table keys", () => {
  const result = mapFiles([
    { path: "properties.js", text: 'process.env.constructor + process.env["__proto__"] + process.env[\'toString\']' },
  ], [
    { real: "constructor", public: "APP_CONSTRUCTOR" },
    { real: "__proto__", public: "APP_PROTO" },
    { real: "toString", public: "APP_STRING" },
  ], "to public");
  assert.deepEqual(result.files, [{
    path: "properties.js", text: 'process.env.APP_CONSTRUCTOR + process.env["APP_PROTO"] + process.env[\'APP_STRING\']',
  }]);
  assert.deepEqual(result.unmapped, []);
});
