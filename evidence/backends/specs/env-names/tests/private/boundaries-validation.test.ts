import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFiles } from "../../src/index.js";

// Extends "[boundary-1] maps a shorter name and its longer counterpart as whole dot-read names".
test("[boundary-1] maps four prefix-related names regardless of table or occurrence order", () => {
  const result = mapFiles([
    { path: "prefix.ts", text: "process.env.ORCHARD_A_B_C_D + process.env.ORCHARD_A + process.env.ORCHARD_A_B_C + process.env.ORCHARD_A_B + process.env.ORCHARD_A_B_C_D" },
  ], [
    { real: "ORCHARD_A", public: "APP_P" },
    { real: "ORCHARD_A_B_C", public: "APP_P_Q_R" },
    { real: "ORCHARD_A_B", public: "APP_P_Q" },
    { real: "ORCHARD_A_B_C_D", public: "APP_P_Q_R_S" },
  ], "to public");
  assert.deepEqual(result.files, [{
    path: "prefix.ts", text: "process.env.APP_P_Q_R_S + process.env.APP_P + process.env.APP_P_Q_R + process.env.APP_P_Q + process.env.APP_P_Q_R_S",
  }]);
  assert.deepEqual(result.unmapped, []);
});

// Extends "[boundary-1] quoted reads match whole names and leave an unlisted longer name intact".
test("[boundary-1] quoted names with digit and underscore suffixes are never partly replaced", () => {
  const result = mapFiles([
    { path: "prefix.js", text: 'process.env["ORCHARD_KEY2"] + process.env[\'ORCHARD_KEY\'] + process.env["ORCHARD_KEY_EXTRA"] + process.env.ORCHARD_KEY20 + process.env.ORCHARD_KEY_' },
  ], [
    { real: "ORCHARD_KEY", public: "APP_K" },
    { real: "ORCHARD_KEY2", public: "APP_K2" },
  ], "to public");
  assert.deepEqual(result.files, [{
    path: "prefix.js", text: 'process.env["APP_K2"] + process.env[\'APP_K\'] + process.env["ORCHARD_KEY_EXTRA"] + process.env.ORCHARD_KEY20 + process.env.ORCHARD_KEY_',
  }]);
  assert.deepEqual(result.unmapped, ["ORCHARD_KEY20", "ORCHARD_KEY_", "ORCHARD_KEY_EXTRA"]);
});

test("[boundary-1] whole-name matching also applies to reverse dot and quoted reads", () => {
  const result = mapFiles([
    { path: "reverse.ts", text: 'process.env.APP_P_Q + process.env["APP_P"] + process.env[\'APP_P_Q_R\'] + process.env.APP_P_Q_R_EXTRA' },
  ], [
    { real: "ORCHARD_FIRST", public: "APP_P" },
    { real: "ORCHARD_SECOND", public: "APP_P_Q" },
    { real: "ORCHARD_THIRD", public: "APP_P_Q_R" },
  ], "to real");
  assert.deepEqual(result.files, [{
    path: "reverse.ts", text: 'process.env.ORCHARD_SECOND + process.env["ORCHARD_FIRST"] + process.env[\'ORCHARD_THIRD\'] + process.env.APP_P_Q_R_EXTRA',
  }]);
  assert.deepEqual(result.unmapped, ["APP_P_Q_R_EXTRA"]);
});

test("[boundary-1] prefix-related assignment names are matched whole before equals", () => {
  const result = mapFiles([
    { path: ".env", text: "ORCHARD_KEY_EXTRA=3\nORCHARD_KEY2=2\nexport ORCHARD_KEY=1\nORCHARD_KEY_EXTRA_MORE=4" },
  ], [
    { real: "ORCHARD_KEY", public: "APP_K" },
    { real: "ORCHARD_KEY_EXTRA", public: "APP_K_EXTRA" },
    { real: "ORCHARD_KEY2", public: "APP_K2" },
  ], "to public");
  assert.deepEqual(result.files, [{
    path: ".env", text: "APP_K_EXTRA=3\nAPP_K2=2\nexport APP_K=1\nORCHARD_KEY_EXTRA_MORE=4",
  }]);
  assert.deepEqual(result.unmapped, ["ORCHARD_KEY_EXTRA_MORE"]);
});

// Extends "[boundary-2] leaves missing names unchanged and reports them once in alphabetical order".
test("[boundary-2] deduplicates eight missing names globally across many files and read styles", () => {
  const encounterOrder = ["ZETA_TOKEN", "MU_TOKEN", "BETA_TOKEN", "YAK_TOKEN", "ALPHA_TOKEN", "GAMMA_TOKEN", "DELTA_TOKEN", "EPSILON_TOKEN"];
  const files = Array.from({ length: 24 }, (_, index) => ({
    path: index % 2 === 0 ? `config/${index}/.env` : `src/reader${index}.js`,
    text: index % 2 === 0
      ? "KNOWN_REAL=1\n" + encounterOrder.map((name) => `${name}=KNOWN_REAL\nexport ${name}=again`).join("\n")
      : "process.env.KNOWN_REAL;\n" + encounterOrder.map((name) =>
        `process.env.${name}; process.env["${name}"]; process.env['${name}'];`,
      ).join("\n"),
  }));
  const result = mapFiles(files, [{ real: "KNOWN_REAL", public: "KNOWN_PUBLIC" }], "to public");
  assert.deepEqual(result.files, files.map((file, index) => ({
    path: file.path,
    text: index % 2 === 0
      ? "KNOWN_PUBLIC=1\n" + encounterOrder.map((name) => `${name}=KNOWN_REAL\nexport ${name}=again`).join("\n")
      : "process.env.KNOWN_PUBLIC;\n" + encounterOrder.map((name) =>
        `process.env.${name}; process.env["${name}"]; process.env['${name}'];`,
      ).join("\n"),
  })));
  assert.deepEqual(result.unmapped, ["ALPHA_TOKEN", "BETA_TOKEN", "DELTA_TOKEN", "EPSILON_TOKEN", "GAMMA_TOKEN", "MU_TOKEN", "YAK_TOKEN", "ZETA_TOKEN"]);
});

// Extends "[boundary-2] an empty table reports names only from assignments and process.env reads".
test("[boundary-2] an empty reverse table reports only actual names and preserves their text", () => {
  const files = [
    { path: ".env.example", text: "# COMMENT_ONLY=value\nZZ_UNKNOWN=VALUE_ONLY\nexport AA_UNKNOWN=process.env.VALUE_READ_SHAPE\nZZ_UNKNOWN=last" },
    { path: "config.js", text: 'const text = "LABEL_ONLY";\n// COMMENT_ONLY\nprocess.env[\'ZZ_UNKNOWN\']; process.env.AA_UNKNOWN; process.env["MM_UNKNOWN"];' },
    { path: "notes.txt", text: "DOCUMENT_ONLY=not an env file\n" },
  ];
  const original = files.map((file) => ({ ...file }));
  const result = mapFiles(files, [], "to real");
  assert.deepEqual(result.files, original);
  assert.deepEqual(result.unmapped, ["AA_UNKNOWN", "MM_UNKNOWN", "ZZ_UNKNOWN"]);
});

test("[boundary-2] reverse mapping reports missing public names once across env and code", () => {
  const result = mapFiles([
    { path: ".env", text: "ZZ_UNKNOWN=1\nAPP_KEY=2\nexport AA_UNKNOWN=3\nZZ_UNKNOWN=4" },
    { path: "config.ts", text: 'process.env["ZZ_UNKNOWN"] + process.env.APP_KEY + process.env[\'AA_UNKNOWN\'] + process.env.MM_UNKNOWN' },
  ], [{ real: "ORCHARD_KEY", public: "APP_KEY" }], "to real");
  assert.deepEqual(result.files, [
    { path: ".env", text: "ZZ_UNKNOWN=1\nORCHARD_KEY=2\nexport AA_UNKNOWN=3\nZZ_UNKNOWN=4" },
    { path: "config.ts", text: 'process.env["ZZ_UNKNOWN"] + process.env.ORCHARD_KEY + process.env[\'AA_UNKNOWN\'] + process.env.MM_UNKNOWN' },
  ]);
  assert.deepEqual(result.unmapped, ["AA_UNKNOWN", "MM_UNKNOWN", "ZZ_UNKNOWN"]);
});

test("[boundary-2] a missing name seen only in code is reported without any env files", () => {
  const text = 'process.env.ZZ_MISSING + process.env["AA_MISSING"] + process.env[\'ZZ_MISSING\']';
  const result = mapFiles([{ path: "only.js", text }], [
    { real: "ORCHARD_UNUSED", public: "APP_UNUSED" },
  ], "to public");
  assert.deepEqual(result.files, [{ path: "only.js", text }]);
  assert.deepEqual(result.unmapped, ["AA_MISSING", "ZZ_MISSING"]);
});

test("[boundary-2] a missing name seen only in env assignments is reported without code files", () => {
  const text = "ZZ_MISSING=1\nexport AA_MISSING=2\nZZ_MISSING=3";
  const result = mapFiles([{ path: "config/.env.local", text }], [
    { real: "ORCHARD_UNUSED", public: "APP_UNUSED" },
  ], "to public");
  assert.deepEqual(result.files, [{ path: "config/.env.local", text }]);
  assert.deepEqual(result.unmapped, ["AA_MISSING", "ZZ_MISSING"]);
});

test("[boundary-2] absent names appearing only in comments or values are not reported", () => {
  const files = [
    { path: ".env", text: "# COMMENT_NAME=IGNORED\nKNOWN_REAL=VALUE_NAME\nexport KNOWN_REAL=process.env.VALUE_READ_SHAPE" },
    { path: "config.ts", text: 'const label = "LABEL_NAME";\n// COMMENT_NAME\nconst actual = process.env.KNOWN_REAL;' },
  ];
  const result = mapFiles(files, [{ real: "KNOWN_REAL", public: "KNOWN_PUBLIC" }], "to public");
  assert.deepEqual(result.files, [
    { path: ".env", text: "# COMMENT_NAME=IGNORED\nKNOWN_PUBLIC=VALUE_NAME\nexport KNOWN_PUBLIC=process.env.VALUE_READ_SHAPE" },
    { path: "config.ts", text: 'const label = "LABEL_NAME";\n// COMMENT_NAME\nconst actual = process.env.KNOWN_PUBLIC;' },
  ]);
  assert.deepEqual(result.unmapped, []);
});

test("[boundary-2] inherited JavaScript property names are missing unless explicitly in the table", () => {
  const files = [
    { path: ".env", text: "constructor=1\nexport hasOwnProperty=2\ntoString=3" },
    { path: "properties.ts", text: 'process.env.toString + process.env["constructor"] + process.env[\'hasOwnProperty\']' },
  ];
  const original = files.map((file) => ({ ...file }));
  const result = mapFiles(files, [{ real: "ORCHARD_UNUSED", public: "APP_UNUSED" }], "to public");
  assert.deepEqual(result.files, original);
  assert.deepEqual(result.unmapped, ["constructor", "hasOwnProperty", "toString"]);
});

// Extends "[unhappy-1] rejects two real names sharing a public name and names the collision".
test("[unhappy-1] rejects a nonadjacent arbitrary collision even when no colliding name occurs", () => {
  assert.throws(() => mapFiles(
    [{ path: "unrelated.ts", text: "const value = process.env.ORCHARD_GOOD;" }],
    [
      { real: "ORCHARD_ONE", public: "APP_SHARED_79" },
      { real: "ORCHARD_GOOD", public: "APP_GOOD" },
      { real: "ORCHARD_TWO", public: "APP_DISTINCT" },
      { real: "ORCHARD_THREE", public: "APP_SHARED_79" },
    ],
    "to public",
  ), /APP_SHARED_79/);
});

// Extends "[unhappy-1] rejects a duplicate public name even for empty input mapped to real".
test("[unhappy-1] rejects a collision late in a large reverse table with empty input", () => {
  const table = Array.from({ length: 40 }, (_, index) => ({
    real: `ORCHARD_${index}`, public: `APP_${index}`,
  }));
  table.push(
    { real: "ORCHARD_LATE_ONE", public: "APP_LATE_SHARED" },
    { real: "ORCHARD_SEPARATOR", public: "APP_SEPARATOR" },
    { real: "ORCHARD_LATE_TWO", public: "APP_LATE_SHARED" },
  );
  assert.throws(() => mapFiles([], table, "to real"), /APP_LATE_SHARED/);
});

test("[unhappy-1] validates a conflicting table before mapping empty input to public", () => {
  assert.throws(() => mapFiles([], [
    { real: "ORCHARD_LEFT", public: "APP_CONFLICT" },
    { real: "ORCHARD_RIGHT", public: "APP_CONFLICT" },
  ], "to public"), /APP_CONFLICT/);
});

test("[unhappy-1] rejects three names sharing one public name when reversing populated files", () => {
  assert.throws(() => mapFiles([
    { path: ".env", text: "APP_SHARED_THREE=1" },
    { path: "reader.ts", text: 'process.env["APP_SHARED_THREE"]' },
  ], [
    { real: "ORCHARD_RED", public: "APP_SHARED_THREE" },
    { real: "ORCHARD_GREEN", public: "APP_SHARED_THREE" },
    { real: "ORCHARD_BLUE", public: "APP_SHARED_THREE" },
  ], "to real"), /APP_SHARED_THREE/);
});
