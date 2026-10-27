import assert from "node:assert/strict";
import { test } from "node:test";

import { clampTicketTitle } from "../../src/ticket.js";

/**
 * clampTicketTitle trims; a trimmed title of at most 255 UTF-16 code units is
 * returned as it is; a longer one is cut to 254 code units, a high surrogate
 * left at the cut is dropped, trailing whitespace is removed and "…" is
 * appended.
 */

const SMILE = "😀"; // two code units: a high then a low surrogate

// Extends "[happy-9] a title within the limit is trimmed and keeps its inner whitespace":
// trim removes every kind of JavaScript whitespace at the edges.
test("[happy-9] Unicode whitespace at the edges of a title is trimmed", () => {
  assert.equal(clampTicketTitle(" ﻿Add export　"), "Add export");
  assert.equal(clampTicketTitle("\r\n\tAdd export\r\n"), "Add export");
});

// Extends "[happy-9] a title within the limit is trimmed and keeps its inner whitespace":
// inner tabs and "\r\n" are not normalized, and an existing ellipsis is not added to.
test("[happy-9] a short title keeps inner tabs, line breaks and punctuation as written", () => {
  assert.equal(clampTicketTitle("Add\t\texport\r\nnow"), "Add\t\texport\r\nnow");
  assert.equal(clampTicketTitle("Wait…"), "Wait…");
  assert.equal(clampTicketTitle("Wait..."), "Wait...");
  assert.equal(clampTicketTitle(`Ship it ${SMILE}`), `Ship it ${SMILE}`);
});

// Extends "[boundary-5] a title of exactly 255 characters is kept and one of 256 is cut":
// every length from 0 to 600.
test("[boundary-5] titles of every length up to 600 keep or cut at exactly 255", () => {
  for (let n = 1; n <= 600; n++) {
    const result = clampTicketTitle("x".repeat(n));
    const want = n <= 255 ? "x".repeat(n) : "x".repeat(254) + "…";
    assert.equal(result, want, `length ${n}`);
  }
});

// Extends "[boundary-5] a title of exactly 255 characters is kept and one of 256 is cut":
// inner whitespace of a title at the limit is untouched.
test("[boundary-5] a 255-unit title with inner runs of whitespace is kept as it is", () => {
  const title = "a" + " ".repeat(126) + "\t\n" + " ".repeat(125) + "b";
  assert.equal(title.length, 255);
  assert.equal(clampTicketTitle(title), title);
});

// Extends "[boundary-5] the limit counts the trimmed title and caps a long one at 255":
// padding of other kinds, and a trimmed title one over the limit.
test("[boundary-5] the limit is applied to the title after trimming", () => {
  const exact = clampTicketTitle("\n\t " + "x".repeat(255) + "\r\n ");
  assert.equal(exact, "x".repeat(255));
  const over = clampTicketTitle("  " + "x".repeat(256) + "  ");
  assert.equal(over, "x".repeat(254) + "…");
  assert.equal(over.length, 255);
});

// Extends "[boundary-5] a title of exactly 255 characters is kept and one of 256 is cut":
// lengths are UTF-16 code units, not code points.
test("[boundary-5] the limit counts UTF-16 code units, not characters", () => {
  const kept = SMILE.repeat(127) + "a";
  assert.equal(kept.length, 255);
  assert.equal(clampTicketTitle(kept), kept);

  // 128 emoji are 128 characters but 256 code units, so the title is cut.
  const over = SMILE.repeat(128);
  const result = clampTicketTitle(over);
  assert.equal(result, SMILE.repeat(127) + "…");
  assert.equal(result.length, 255);
});

// Extends "[boundary-6] a blank title clamps to the empty string":
// other whitespace kinds and blank titles far over the limit.
test("[boundary-6] long and Unicode blank titles clamp to the empty string", () => {
  for (const title of [" ".repeat(1000), " 　﻿\r\n", "\t".repeat(300), "\r"]) {
    assert.equal(clampTicketTitle(title), "", JSON.stringify(title.slice(0, 10)));
  }
});

// Extends "[boundary-7] whitespace before the cut is not kept before the ellipsis":
// every kind of whitespace is removed before the ellipsis, not only spaces.
test("[boundary-7] tabs, line breaks and Unicode spaces before the cut are removed", () => {
  const title = "x".repeat(250) + "\t\n  " + "y".repeat(10);
  assert.equal(title.length, 264);
  const result = clampTicketTitle(title);
  assert.equal(result, "x".repeat(250) + "…");
  assert.equal(result.length, 251);
});

// Extends "[boundary-7] a single space at the cut is dropped before the ellipsis":
// whitespace just past the cut, a long whitespace run, and whitespace well inside the cut.
test("[boundary-7] only whitespace at the end of the cut is removed", () => {
  assert.equal(clampTicketTitle("x".repeat(254) + "   " + "y"), "x".repeat(254) + "…");

  const run = clampTicketTitle("a" + " ".repeat(300) + "b");
  assert.equal(run, "a…");
  assert.equal(run.length, 2);

  const inner = clampTicketTitle("x".repeat(100) + "  " + "x".repeat(200));
  assert.equal(inner, "x".repeat(100) + "  " + "x".repeat(152) + "…");
  assert.equal(inner.length, 255);
});

// Extends "[boundary-8] a cut on a high surrogate drops it rather than split the pair":
// the dropped surrogate exposes whitespace, which is then removed too.
test("[boundary-8] whitespace before a dropped high surrogate is removed as well", () => {
  const title = "a".repeat(252) + " " + SMILE + "b".repeat(5);
  const result = clampTicketTitle(title);
  assert.equal(result, "a".repeat(252) + "…");
  assert.equal(result.length, 253);
});

// Extends "[boundary-8] a surrogate pair wholly before the cut is kept":
// a whole pair followed by whitespace at the cut keeps the pair.
test("[boundary-8] a whole pair followed by whitespace at the cut keeps the pair", () => {
  const result = clampTicketTitle("a".repeat(251) + SMILE + " " + "b".repeat(5));
  assert.equal(result, "a".repeat(251) + SMILE + "…");
  assert.equal(result.length, 254);
});

// Extends "[boundary-8] a cut on a high surrogate drops it rather than split the pair":
// a run of emoji, cut on either half of a pair depending on its offset.
test("[boundary-8] a run of emoji is cut only between pairs", () => {
  const even = clampTicketTitle(SMILE.repeat(200));
  assert.equal(even, SMILE.repeat(127) + "…");
  assert.equal(even.length, 255);

  const odd = clampTicketTitle("a" + SMILE.repeat(200));
  assert.equal(odd, "a" + SMILE.repeat(126) + "…");
  assert.equal(odd.length, 254);
});

// Extends "[boundary-8] a cut on a high surrogate drops it rather than split the pair":
// the high-surrogate range ends are U+D800 and U+DBFF; other units at the cut are kept.
test("[boundary-8] only a high surrogate at the cut is dropped", () => {
  for (const pair of ["𐀀", "􏿿", "😀"]) {
    assert.equal(
      clampTicketTitle("a".repeat(253) + pair + "b"),
      "a".repeat(253) + "…",
      JSON.stringify(pair),
    );
  }
  assert.equal(clampTicketTitle("a".repeat(253) + "\ud800" + "bb"), "a".repeat(253) + "…");
  for (const unit of ["\udc00", "\udfff", "퟿", ""]) {
    const result = clampTicketTitle("a".repeat(253) + unit + "bb");
    assert.equal(result, "a".repeat(253) + unit + "…", JSON.stringify(unit));
    assert.equal(result.length, 255);
  }
});

// Extends "[boundary-8] a cut on a high surrogate drops it rather than split the pair":
// the result is never longer than 255 code units, across varied inputs.
test("[boundary-8] clamped titles never exceed 255 code units nor end on a high surrogate", () => {
  for (let prefix = 0; prefix < 12; prefix++) {
    for (let n = 120; n < 140; n++) {
      const title = "a".repeat(prefix) + SMILE.repeat(n) + " tail";
      const result = clampTicketTitle(title);
      assert.ok(result.length <= 255, `prefix ${prefix}, n ${n}`);
      const beforeEllipsis = result.endsWith("…") ? result.slice(0, -1) : result;
      const last = beforeEllipsis.charCodeAt(beforeEllipsis.length - 1);
      assert.ok(!(last >= 0xd800 && last <= 0xdbff), `prefix ${prefix}, n ${n}`);
      if (title.length > 255) {
        assert.ok(result.endsWith("…"));
        assert.ok(title.startsWith(beforeEllipsis));
      }
    }
  }
});

// Extends "[boundary-9] clamping a long title twice equals clamping it once":
// idempotence for cuts at whitespace and at surrogates, and at the limit.
test("[boundary-9] clamping is idempotent for every kind of cut", () => {
  const titles = [
    "x".repeat(250) + " ".repeat(5) + "y".repeat(10),
    "a".repeat(253) + SMILE + "b",
    SMILE.repeat(200),
    "a" + " ".repeat(300) + "b",
    "x".repeat(255),
    "x".repeat(254) + "…",
    "  " + "x".repeat(256) + "  ",
    " Short　",
  ];
  for (const title of titles) {
    const once = clampTicketTitle(title);
    assert.equal(clampTicketTitle(once), once, JSON.stringify(title.slice(0, 10)));
  }
  assert.equal(clampTicketTitle(clampTicketTitle(SMILE.repeat(200))), SMILE.repeat(127) + "…");
});
