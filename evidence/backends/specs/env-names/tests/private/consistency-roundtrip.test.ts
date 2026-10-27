import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";

// Extends "[happy-3] uses the same two mappings across env files and code files".
test("[happy-3] applies a large reversed table consistently across many files and read styles", () => {
  const entries = Array.from({ length: 32 }, (_, index) => ({
    real: `ORCHARD_SETTING_${index}`, public: `APP_OPTION_${100 + index}`,
  }));
  const files = Array.from({ length: 18 }, (_, index) => ({
    path: index % 2 === 0 ? `config/${index}/.env.production` : `src/config${index}.ts`,
    text: entries.map((entry, entryIndex) => index % 2 === 0
      ? `${entryIndex % 2 === 0 ? "export " : ""}${entry.real}=value-${index}-${entryIndex}`
      : `const v${entryIndex} = process.env.${entry.real} ?? process.env["${entry.real}"] ?? process.env['${entry.real}'];`,
    ).join("\n"),
  }));
  const expected = files.map((file, index) => ({
    path: file.path,
    text: entries.map((entry, entryIndex) => index % 2 === 0
      ? `${entryIndex % 2 === 0 ? "export " : ""}${entry.public}=value-${index}-${entryIndex}`
      : `const v${entryIndex} = process.env.${entry.public} ?? process.env["${entry.public}"] ?? process.env['${entry.public}'];`,
    ).join("\n"),
  }));
  const result = mapFiles(files, [...entries].reverse(), "to public");
  assert.deepEqual(result.files, expected);
  assert.deepEqual(result.unmapped, []);
});

// Extends "[happy-3] preserves empty files and input order between files using both names".
test("[happy-3] retains all files in order including repeated paths and several empty files", () => {
  const table = [
    { real: "ORCHARD_A", public: "APP_A" },
    { real: "ORCHARD_B", public: "APP_B" },
    { real: "ORCHARD_C", public: "APP_C" },
  ];
  const result = mapFiles([
    { path: "last.ts", text: "" },
    { path: "same/.env", text: "ORCHARD_C=3\nORCHARD_A=1" },
    { path: "same/.env", text: "export ORCHARD_B=2" },
    { path: "last.ts", text: "process.env.ORCHARD_B + process.env.ORCHARD_C + process.env.ORCHARD_A" },
    { path: "middle/.env.test", text: "" },
    { path: "first.ts", text: "// no reads here\n" },
    { path: "empty.ts", text: "" },
  ], table, "to public");
  assert.deepEqual(result.files, [
    { path: "last.ts", text: "" },
    { path: "same/.env", text: "APP_C=3\nAPP_A=1" },
    { path: "same/.env", text: "export APP_B=2" },
    { path: "last.ts", text: "process.env.APP_B + process.env.APP_C + process.env.APP_A" },
    { path: "middle/.env.test", text: "" },
    { path: "first.ts", text: "// no reads here\n" },
    { path: "empty.ts", text: "" },
  ]);
  assert.deepEqual(result.unmapped, []);
});

test("[happy-3] reverses three mappings consistently across env and code in a different order", () => {
  const result = mapFiles([
    { path: "z.ts", text: 'process.env.APP_C + process.env["APP_A"] + process.env[\'APP_B\']' },
    { path: "config/.env", text: "APP_B=2\nAPP_A=1\nexport APP_C=3\n" },
    { path: "a.js", text: "process.env.APP_A + process.env.APP_B + process.env.APP_C" },
    { path: ".env.sample", text: "APP_C=3\nAPP_B=2\nAPP_A=1" },
  ], [
    { real: "ORCHARD_B", public: "APP_B" },
    { real: "ORCHARD_C", public: "APP_C" },
    { real: "ORCHARD_A", public: "APP_A" },
  ], "to real");
  assert.deepEqual(result.files, [
    { path: "z.ts", text: 'process.env.ORCHARD_C + process.env["ORCHARD_A"] + process.env[\'ORCHARD_B\']' },
    { path: "config/.env", text: "ORCHARD_B=2\nORCHARD_A=1\nexport ORCHARD_C=3\n" },
    { path: "a.js", text: "process.env.ORCHARD_A + process.env.ORCHARD_B + process.env.ORCHARD_C" },
    { path: ".env.sample", text: "ORCHARD_C=3\nORCHARD_B=2\nORCHARD_A=1" },
  ]);
  assert.deepEqual(result.unmapped, []);
});

test("[happy-3] separate calls use their own tables for the same input names", () => {
  const makeFiles = () => [
    { path: ".env", text: "ORCHARD_PORT=8080" },
    { path: "port.js", text: "const port = process.env.ORCHARD_PORT;" },
  ];
  const first = mapFiles(makeFiles(), [
    { real: "ORCHARD_PORT", public: "APP_FIRST_PORT" },
  ], "to public");
  assert.deepEqual(first.files, [
    { path: ".env", text: "APP_FIRST_PORT=8080" },
    { path: "port.js", text: "const port = process.env.APP_FIRST_PORT;" },
  ]);
  assert.deepEqual(first.unmapped, []);
  const second = mapFiles(makeFiles(), [
    { real: "ORCHARD_PORT", public: "APP_SECOND_PORT" },
  ], "to public");
  assert.deepEqual(second.files, [
    { path: ".env", text: "APP_SECOND_PORT=8080" },
    { path: "port.js", text: "const port = process.env.APP_SECOND_PORT;" },
  ]);
  assert.deepEqual(second.unmapped, []);
});

// Extends "[happy-4] mapping to public and back restores exact text in every file".
test("[happy-4] a large round trip preserves CRLF Unicode values quotes and unknown reads", () => {
  const table = Array.from({ length: 12 }, (_, index) => ({
    real: `ORCHARD_CONFIG_${index}`, public: `APP_CONFIG_${index}`,
  }));
  const files = Array.from({ length: 10 }, (_, index) => ({
    path: index % 2 === 0 ? `config/${index}/.env.example` : `src/config${index}.js`,
    text: index % 2 === 0
      ? "# café — ORCHARD_CONFIG_0\r\n\r\n" + table.map((entry) =>
        `export ${entry.real}='雪 = ${entry.real}'`,
      ).join("\r\n") + "\r\nUNKNOWN_PORT=7"
      : "// café — ORCHARD_CONFIG_0\r\n" + table.map((entry, entryIndex) =>
        `const x${entryIndex} = process.env.${entry.real} ?? process.env["${entry.real}"] ?? process.env['${entry.real}'];`,
      ).join("\r\n") + "\r\nconst port = process.env.UNKNOWN_PORT;",
  }));
  const original = files.map((file) => ({ ...file }));
  const outward = mapFiles(files, table, "to public");
  assert.deepEqual(outward.unmapped, ["UNKNOWN_PORT"]);
  assert.notDeepEqual(outward.files, original);
  const restored = mapFiles(outward.files, table, "to real");
  assert.deepEqual(restored.files, original);
  assert.deepEqual(restored.unmapped, ["UNKNOWN_PORT"]);
});

// Extends "[happy-4] an empty file set survives mapping in both directions".
test("[happy-4] empty tables and multiple empty files survive both directions", () => {
  const original = [
    { path: "z/.env", text: "" },
    { path: "empty.ts", text: "" },
    { path: "a/.env.example", text: "" },
  ];
  const outward = mapFiles(original, [], "to public");
  assert.deepEqual(outward.files, original);
  assert.deepEqual(outward.unmapped, []);
  const restored = mapFiles(outward.files, [], "to real");
  assert.deepEqual(restored.files, original);
  assert.deepEqual(restored.unmapped, []);
  const emptyOutward = mapFiles([], [], "to public");
  assert.deepEqual(emptyOutward.files, []);
  assert.deepEqual(emptyOutward.unmapped, []);
  const emptyRestored = mapFiles([], [], "to real");
  assert.deepEqual(emptyRestored.files, []);
  assert.deepEqual(emptyRestored.unmapped, []);
});

test("[happy-4] a name chain round trips without cascading in either direction", () => {
  const table = [
    { real: "ORCHARD_C", public: "APP_END" },
    { real: "ORCHARD_B", public: "ORCHARD_C" },
    { real: "ORCHARD_A", public: "ORCHARD_B" },
  ];
  const original = [
    { path: ".env", text: "ORCHARD_A=ORCHARD_B\nORCHARD_B=ORCHARD_C\nORCHARD_C=ORCHARD_A" },
    { path: "chain.js", text: 'process.env.ORCHARD_A + process.env["ORCHARD_B"] + process.env[\'ORCHARD_C\']' },
  ];
  const outward = mapFiles(original, table, "to public");
  assert.deepEqual(outward.files, [
    { path: ".env", text: "ORCHARD_B=ORCHARD_B\nORCHARD_C=ORCHARD_C\nAPP_END=ORCHARD_A" },
    { path: "chain.js", text: 'process.env.ORCHARD_B + process.env["ORCHARD_C"] + process.env[\'APP_END\']' },
  ]);
  assert.deepEqual(outward.unmapped, []);
  const restored = mapFiles(outward.files, table, "to real");
  assert.deepEqual(restored.files, original);
  assert.deepEqual(restored.unmapped, []);
});

test("[happy-4] swapping two names round trips in assignments and all read styles", () => {
  const table = [
    { real: "ORCHARD_LEFT", public: "ORCHARD_RIGHT" },
    { real: "ORCHARD_RIGHT", public: "ORCHARD_LEFT" },
  ];
  const original = [
    { path: ".env", text: "ORCHARD_LEFT=1\nexport ORCHARD_RIGHT=2" },
    { path: "swap.ts", text: 'process.env.ORCHARD_LEFT + process.env["ORCHARD_RIGHT"] + process.env[\'ORCHARD_LEFT\']' },
  ];
  const outward = mapFiles(original, table, "to public");
  assert.deepEqual(outward.files, [
    { path: ".env", text: "ORCHARD_RIGHT=1\nexport ORCHARD_LEFT=2" },
    { path: "swap.ts", text: 'process.env.ORCHARD_RIGHT + process.env["ORCHARD_LEFT"] + process.env[\'ORCHARD_RIGHT\']' },
  ]);
  assert.deepEqual(outward.unmapped, []);
  const restored = mapFiles(outward.files, table, "to real");
  assert.deepEqual(restored.files, original);
  assert.deepEqual(restored.unmapped, []);
});
