import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatus, readStatuses, writeStatus } from "../../src/index.js";

test("[concurrency-1] clearing and editing one readStatuses result does not affect another", () => {
  const rows = [{ id: "a", status: "nope" }];
  const first = readStatuses(rows);
  const second = readStatuses(rows);
  first.unreadable.length = 0;
  first.rows[0].status = "draft";
  assert.deepEqual(second, { rows: [{ id: "a", status: null }], unreadable: ["nope"] });
  assert.deepEqual(readStatuses(rows), second);
});

test("[concurrency-1] growing and renaming in one readStatuses result does not affect later calls", () => {
  const rows = [{ id: "a", status: "nope" }];
  const first = readStatuses(rows);
  first.rows.push({ id: "z", status: "merged" });
  first.rows[0].id = "changed";
  first.unreadable.push("extra");
  const second = readStatuses(rows);
  assert.deepEqual(second, { rows: [{ id: "a", status: null }], unreadable: ["nope"] });
  assert.notEqual(second.rows, first.rows);
  assert.notEqual(second.rows[0], first.rows[0]);
  assert.notEqual(second.unreadable, first.unreadable);
  assert.deepEqual(rows, [{ id: "a", status: "nope" }]);
});

test("[concurrency-2] a failed write does not affect a later read or write", () => {
  assert.throws(() => writeStatus("Draft"), RangeError);
  assert.equal(readStatus("Draft"), "draft");
  assert.equal(writeStatus("draft"), "draft");
});

test("[concurrency-2] a successful write and a read do not make a later write lenient", () => {
  assert.equal(writeStatus("draft"), "draft");
  assert.equal(readStatus(" DRAFT "), "draft");
  assert.throws(
    () => writeStatus("Draft"),
    (err: unknown) => {
      if (!(err instanceof RangeError)) throw new Error("expected a RangeError");
      assert.equal(err.message, 'Invalid sandbox status: "Draft"');
      return true;
    },
  );
  assert.equal(readStatus("Draft"), "draft");
});
