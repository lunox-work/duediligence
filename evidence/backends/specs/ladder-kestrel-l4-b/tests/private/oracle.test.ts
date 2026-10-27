import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as subject from "../../src/index.js";

// The oracle's answers as the hidden suite (ladder/README.md): one test
// per case, named by the rule it exercises and its id. Written by
// bin/ladder/build.mjs beside cases.json; never edited by hand.
type Expected = unknown | { throws: string };
type Case = { id: string; rule: string; args: unknown[]; expected: Expected };
const { fn, cases } = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8")) as {
  fn: string;
  cases: Case[];
};
const call = (args: unknown[]) => (subject as Record<string, (...args: unknown[]) => unknown>)[fn](...args);

for (const item of cases)
  test(`${item.rule} ${item.id}`, () => {
    const expected = item.expected;
    if (expected !== null && typeof expected === "object" && "throws" in expected) {
      const word = (expected as { throws: string }).throws;
      assert.throws(
        () => call(item.args),
        (error: unknown) => error instanceof Error && error.message.toLowerCase().includes(word),
      );
    } else assert.deepEqual(call(item.args), expected);
  });
