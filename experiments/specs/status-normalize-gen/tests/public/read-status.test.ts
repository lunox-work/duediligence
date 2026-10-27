import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatus } from "../../src/index.js";

function assertReads(stored: string, expected: string | null): void {
  assert.equal(readStatus(stored), expected, `readStatus(${JSON.stringify(stored)})`);
}

function assertTypeError(value: unknown): void {
  assert.throws(
    () => readStatus(value as string),
    (err: unknown) => {
      if (!(err instanceof TypeError)) throw new Error(`expected a TypeError for ${String(value)}`);
      assert.equal(err.message, "Sandbox status must be a string");
      return true;
    },
  );
}

test("[happy-2] readStatus reads statuses in any case and with plain spaces as the status", () => {
  assertReads("draft", "draft");
  assertReads("Draft", "draft");
  assertReads("DRAFT", "draft");
  assertReads("Review", "review");
  assertReads("  published", "published");
});

test("[happy-2] readStatus trims tabs, line feeds and non-breaking spaces from the ends", () => {
  assertReads("claimed\n", "claimed");
  assertReads("\tMerged \t", "merged");
  assertReads(" draft", "draft");
});

test("[boundary-2] readStatus reads a leading or trailing separator as null", () => {
  assertReads("draft-", null);
  assertReads("_draft", null);
});

test("[boundary-2] readStatus reads separators at both ends, or after a space, as null", () => {
  assertReads("-merged-", null);
  assertReads("draft -", null);
});

test("[boundary-3] readStatus keeps punctuation, quotes and inner spaces, so the value is no status", () => {
  assertReads("draft.", null);
  assertReads("\"draft\"", null);
  assertReads("dr aft", null);
});

test("[boundary-3] readStatus keeps zero-width and full-width characters, so the value is no status", () => {
  assertReads("draft​", null);
  assertReads("ｄｒａｆｔ", null);
});

test("[happy-3] readStatus reads the common in-review spellings as review", () => {
  assertReads("in-review", "review");
  assertReads("In-Review", "review");
  assertReads("in_review", "review");
  assertReads("in review", "review");
});

test("[happy-3] readStatus reads in-review with repeated, mixed and padded separators as review", () => {
  assertReads("IN__REVIEW", "review");
  assertReads("in   review", "review");
  assertReads("in\treview", "review");
  assertReads("in - _review", "review");
  assertReads("  In-Review\n", "review");
});

test("[unhappy-4] readStatus reads other words around review as null", () => {
  assertReads("under review", null);
  assertReads("reviewing", null);
  assertReads("reviewed", null);
  assertReads("in-draft", null);
});

test("[unhappy-4] readStatus reads in review without a separator, or review split, as null", () => {
  assertReads("inreview", null);
  assertReads("InReview", null);
  assertReads("re-view", null);
});

test("[unhappy-5] readStatus reads unknown and partial values as null", () => {
  assertReads("archived", null);
  assertReads("publish", null);
  assertReads("merge", null);
  assertReads("claim", null);
});

test("[unhappy-5] readStatus does not read a near miss or two statuses as the nearest status", () => {
  assertReads("drafts", null);
  assertReads("drat", null);
  assertReads("draft review", null);
});

test("[boundary-4] readStatus reads the empty string and spaces only as null", () => {
  assertReads("", null);
  assertReads("   ", null);
});

test("[boundary-4] readStatus reads tabs and line feeds only, or separators only, as null", () => {
  assertReads("\t\n", null);
  assertReads("-", null);
  assertReads("___", null);
});

test("[boundary-5] readStatus reads x repeated 100000 times as null without throwing", () => {
  assertReads("x".repeat(100000), null);
});

test("[boundary-5] readStatus reads draft followed by 100000 separators as null without throwing", () => {
  assertReads("draft" + "-".repeat(100000), null);
});

test("[unhappy-6] readStatus rejects undefined and null with a TypeError", () => {
  assertTypeError(undefined);
  assertTypeError(null);
});

test("[unhappy-6] readStatus rejects zero and an array holding a status with a TypeError", () => {
  assertTypeError(0);
  assertTypeError(["draft"]);
});
