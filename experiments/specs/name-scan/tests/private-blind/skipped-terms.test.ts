import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "../../src/index.js";
import type { Match } from "../../src/index.js";

/** Scans one file and returns its matches as term and text. */
function found(terms: string[], text: string, path = "f.txt") {
  const result = scan(terms, [{ path, text }]);
  return result.matches.map((m: Match) => ({ term: m.term, text: m.text }));
}

test("api, Web, x1, core, demo and 12345 are never reported", () => {
  const terms = ["api", "Web", "x1", "core", "demo", "12345"];
  const text = "api Web x1 core demo 12345\nAPI_WEB coreDemo X1 12345";
  assert.deepEqual(found(terms, text, "api/web/core/demo/x1/12345.ts"), []);
});

test("generic words are skipped whatever their case", () => {
  const terms = ["Admin", "CLIENT", "Example", "INTERNAL", "Main", "Server", "TEST", "App"];
  const text =
    "admin client example internal main server test app\nADMIN Client EXAMPLE Internal MAIN SERVER Test APP";
  assert.deepEqual(found(terms, text), []);
});

test("generic words are skipped while other terms in the same list are still found", () => {
  const terms = ["server", "nimbus", "internal", "demo"];
  const text = "server internal demo nimbus";
  assert.deepEqual(found(terms, text), [{ term: "nimbus", text: "nimbus" }]);
});

test("terms with fewer than four letters and digits are skipped", () => {
  const terms = ["a-b-c", "x_9", "Q.R", "ab1", "--zz--"];
  const text = "a-b-c x_9 Q.R ab1 zz AB1 a.b.c";
  assert.deepEqual(found(terms, text), []);
});

test("terms with exactly four letters and digits are scanned for", () => {
  const terms = ["abc1", "a-b-c-d", "Kiwi"];
  const text = "ABC1 a.b.c.d kiwiFruit";
  assert.deepEqual(found(terms, text), [
    { term: "abc1", text: "ABC1" },
    { term: "a-b-c-d", text: "a.b.c.d" },
    { term: "Kiwi", text: "kiwi" },
  ]);
});

test("letters are counted, not UTF-16 code units, when deciding a term is too short", () => {
  // Each of these letters takes two UTF-16 code units.
  const three = "\u{20000}\u{20001}\u{20002}";
  const four = "\u{20000}\u{20001}\u{20002}\u{20003}";
  assert.deepEqual(found([three], `x ${three} y`), []);
  assert.deepEqual(found([four], `x ${four} y`), [{ term: four, text: four }]);
});

test("terms with no letter at all are skipped", () => {
  const terms = ["2024", "1234-5678", "000000", "--"];
  const text = "2024 1234-5678 000000 1234_5678 --";
  assert.deepEqual(found(terms, text), []);
});

test("a term of digits with one letter is scanned for", () => {
  assert.deepEqual(found(["v2024"], "release V2024"), [{ term: "v2024", text: "V2024" }]);
});

test("terms that only resemble generic words are scanned for", () => {
  const terms = ["servers", "webapp", "maintenance", "admin-portal"];
  const text = "servers\nWEBAPP\nmaintenance\nAdminPortal";
  assert.deepEqual(found(terms, text), [
    { term: "servers", text: "servers" },
    { term: "webapp", text: "WEBAPP" },
    { term: "maintenance", text: "maintenance" },
    { term: "admin-portal", text: "AdminPortal" },
  ]);
});
