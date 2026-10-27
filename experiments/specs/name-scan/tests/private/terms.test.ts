import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "../../src/index.js";

// Extends "a term given in another spelling is the same sequence of words":
// a term written in camelCase or with an uppercase run is split the same way.
test("a term written as an identifier is split into words like the text", () => {
  const result = scan(
    ["harborLights", "ACMEOrders"],
    [{ path: "a.ts", text: "harbor-lights HARBOR_LIGHTS acme_orders acmeorders" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "harborLights", line: 1, column: 1, text: "harbor-lights" },
    { path: "a.ts", term: "harborLights", line: 1, column: 15, text: "HARBOR_LIGHTS" },
    { path: "a.ts", term: "ACMEOrders", line: 1, column: 29, text: "acme_orders" },
  ]);
});

// Extends "a term given in another spelling is the same sequence of words":
// the term is reported exactly as given, punctuation and all.
test("a term with surrounding punctuation is reported as given", () => {
  const result = scan(
    ["@harbor-lights/"],
    [{ path: "a.ts", text: "import x from '@harbor-lights/ui';" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "@harbor-lights/", line: 1, column: 17, text: "harbor-lights" },
  ]);
});

// Extends "short and generic terms are not reported": skipped terms do not
// stop the others from being found.
test("skipped terms do not stop other terms from being found", () => {
  const result = scan(
    ["api", "acme", "core", "harbor", "x1"],
    [{ path: "a.ts", text: "api acme core harbor x1" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "acme", line: 1, column: 5, text: "acme" },
    { path: "a.ts", term: "harbor", line: 1, column: 15, text: "harbor" },
  ]);
});

// Extends "every listed generic word is skipped whatever its case": a term is
// the sequence of its words, so punctuation around a generic word changes nothing.
test("a generic word given with punctuation around it is still skipped", () => {
  const result = scan(
    ["Client!", "@internal", "_EXAMPLE_", "server/", "-Admin-"],
    [{ path: "a.ts", text: "client internal example server admin" }],
  );
  assert.deepEqual(result.matches, []);
});

// Extends "a generic word inside a longer term does not make it skipped":
// a single word that contains or extends a generic word is not that word.
test("a word that contains or extends a generic word is scanned", () => {
  const result = scan(
    ["domain", "tests", "apps", "Servers", "webapp", "examples"],
    [{ path: "a.ts", text: "domain tests apps servers webapp examples" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "domain", line: 1, column: 1, text: "domain" },
    { path: "a.ts", term: "tests", line: 1, column: 8, text: "tests" },
    { path: "a.ts", term: "apps", line: 1, column: 14, text: "apps" },
    { path: "a.ts", term: "Servers", line: 1, column: 19, text: "servers" },
    { path: "a.ts", term: "webapp", line: 1, column: 27, text: "webapp" },
    { path: "a.ts", term: "examples", line: 1, column: 34, text: "examples" },
  ]);
});

// Extends "a term with 4 letters and digits is scanned, one with 3 is not":
// non-ASCII letters count.
test("letters of any script count toward the four letters and digits", () => {
  const result = scan(
    ["été", "über"],
    [{ path: "a.ts", text: "été ÜBER" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "über", line: 1, column: 5, text: "ÜBER" },
  ]);
});

// Extends "a term with 4 letters and digits is scanned, one with 3 is not" and
// "a term with no letter is skipped however long".
test("four letters and digits in all, with a letter among them, are enough", () => {
  const result = scan(
    ["x1y2", "a.b.c.d", "1234a", "1234", "a1b"],
    [{ path: "a.ts", text: "X1Y2 a_b_c_d 1234a 1234 a1b" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "x1y2", line: 1, column: 1, text: "X1Y2" },
    { path: "a.ts", term: "a.b.c.d", line: 1, column: 6, text: "a_b_c_d" },
    { path: "a.ts", term: "1234a", line: 1, column: 14, text: "1234a" },
  ]);
});

// Boundary the public suite skips: terms with no letters or digits at all.
test("terms with no letters or digits are skipped", () => {
  const result = scan(
    ["", "---", "   ", "@/", "acme"],
    [{ path: "a.ts", text: "acme --- @/ \"\"" }],
  );
  assert.deepEqual(result.matches, [
    { path: "a.ts", term: "acme", line: 1, column: 1, text: "acme" },
  ]);
});
