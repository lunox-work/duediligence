import { test } from "node:test";
import assert from "node:assert/strict";
import { writeStatus } from "../../src/index.js";

function namesValue(value: string) {
  return (err: unknown): boolean => err instanceof Error && err.message.includes(value);
}

test("[happy-3] a status is written as itself", () => {
  assert.equal(writeStatus("review"), "review");
});

test("[happy-3] every status is written as itself", () => {
  for (const status of ["draft", "review", "published", "claimed", "merged"]) {
    assert.equal(writeStatus(status), status);
  }
});

test("[unhappy-2] values other than a status are refused with an error naming them", () => {
  for (const value of ["Review", "in-review", "closed"]) {
    assert.throws(() => writeStatus(value), namesValue(value), value);
  }
});

test("[unhappy-2] a status with a padded end is refused, named as given", () => {
  assert.throws(() => writeStatus(" draft"), namesValue(" draft"));
});

test("[unhappy-2] an old spelling, even already clean, is never accepted on write", () => {
  for (const value of ["in review", "live", "done"]) {
    assert.throws(() => writeStatus(value), namesValue(value), value);
  }
});
