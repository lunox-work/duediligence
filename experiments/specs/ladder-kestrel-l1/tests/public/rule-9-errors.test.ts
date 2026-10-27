import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

test("[rule-9] an invalid version throws an Error whose message contains version", () => {
  assert.throws(
    () => satisfies("1.2.3.4", ">=1.0"),
    (err: unknown) => err instanceof Error && err.message.includes("version"),
  );
});

test("[rule-9] an invalid range throws an Error whose message contains range", () => {
  assert.throws(
    () => satisfies("1.2.3", ">=1.0,"),
    (err: unknown) => err instanceof Error && err.message.includes("range"),
  );
});

test("[rule-9] when both are invalid the message contains version", () => {
  for (const [version, range] of [
    ["1.02", ">= 1.0"],
    ["v1.2", ""],
    ["1.2:RC", "1.x.x"],
  ]) {
    assert.throws(
      () => satisfies(version, range),
      (err: unknown) => err instanceof Error && err.message.includes("version"),
      JSON.stringify([version, range]),
    );
  }
});
