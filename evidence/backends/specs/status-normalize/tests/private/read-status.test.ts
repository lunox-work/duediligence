import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatus } from "../../src/index.js";

const statuses = ["draft", "review", "published", "claimed", "merged"] as const;
const aliases = [
  ["in review", "review"],
  ["under review", "review"],
  ["reviewing", "review"],
  ["live", "published"],
  ["public", "published"],
  ["assigned", "claimed"],
  ["taken", "claimed"],
  ["done", "merged"],
  ["complete", "merged"],
  ["completed", "merged"],
] as const;

// Extends public "reads canonical statuses with the example spellings".
test("[happy-1] reads every ASCII case combination of each canonical status", () => {
  for (const status of statuses) {
    for (let mask = 0; mask < 2 ** status.length; mask++) {
      const stored = [...status].map((letter, index) =>
        mask & (1 << index) ? letter.toUpperCase() : letter,
      ).join("");
      assert.equal(readStatus(stored), status, JSON.stringify(stored));
    }
  }
});

// Extends public "trims both ends and normalizes case for every canonical status".
test("[happy-1] trims one-sided padding and whitespace at the ends", () => {
  for (const status of statuses) {
    const mixed = status[0].toUpperCase() + status.slice(1);
    for (const stored of [
      ` ${mixed}`, `${mixed} `, `   ${mixed}`, `${mixed}     `,
      `\t${mixed}`, `${mixed}\r\n`, `\n\t ${mixed} \r\n`,
    ]) {
      assert.equal(readStatus(stored), status, JSON.stringify(stored));
    }
  }
});

// Extends public "trims both ends and normalizes case for every canonical status".
test("[happy-1] reads canonical values beyond a fixed short padding limit", () => {
  for (const status of [...statuses].reverse()) {
    assert.equal(readStatus(" ".repeat(8192) + status.toUpperCase() + " ".repeat(4097)), status);
  }
});

// Extends public "reads every documented legacy spelling and the example variants".
test("[happy-2] applies case and end cleaning to every legacy alias", () => {
  for (const [alias, expected] of [...aliases].reverse()) {
    const mixed = [...alias].map((letter, index) =>
      index % 2 === 0 ? letter.toUpperCase() : letter,
    ).join("");
    for (const stored of [mixed, `   ${mixed}`, `${mixed}   `, `\t${mixed.toUpperCase()}\n`]) {
      assert.equal(readStatus(stored), expected, JSON.stringify(stored));
    }
  }
});

// Extends public "collapses repeated mixed separators before looking up legacy spellings".
test("[happy-2] accepts every short mixed separator run for both two-word aliases", () => {
  let runs = [""];
  for (let length = 1; length <= 6; length++) {
    runs = runs.flatMap((prefix) => [prefix + " ", prefix + "-", prefix + "_"]);
    for (const separator of runs) {
      for (const first of ["iN", "uNdEr"]) {
        const stored = `  ${first}${separator}rEvIeW   `;
        assert.equal(readStatus(stored), "review", JSON.stringify(stored));
      }
    }
  }
});

// Extends public "collapses repeated mixed separators before looking up legacy spellings".
test("[happy-2] collapses long separator runs without truncating the alias", () => {
  for (const separator of ["-".repeat(16385), "_".repeat(8193), " -__-- ".repeat(2048)]) {
    for (const first of ["IN", "UNDER"]) {
      assert.equal(readStatus(`  ${first}${separator}REVIEW  `), "review");
    }
  }
});

// Extends public "returns null for unrecognized values without guessing".
test("[unhappy-1] requires the entire cleaned value to match a status or alias", () => {
  for (const known of [...statuses, ...aliases.map(([alias]) => alias)]) {
    for (const stored of [`x${known}`, `${known}x`, `before ${known}`, `${known} after`]) {
      assert.equal(readStatus(stored), null, JSON.stringify(stored));
    }
  }
});

// Extends public "returns null for empty values and unknown values after cleaning".
test("[unhappy-1] preserves word boundaries instead of deleting separators inside canonical words", () => {
  for (const status of statuses) {
    for (let split = 1; split < status.length; split++) {
      for (const separator of [" ", "-", "_", " -__- "]) {
        const stored = ` ${status.slice(0, split)}${separator}${status.slice(split)} `;
        assert.equal(readStatus(stored), null, JSON.stringify(stored));
      }
    }
  }
});

// Extends public "returns null for unrecognized values without guessing".
test("[unhappy-1] rejects additional near misses plurals truncations and transpositions", () => {
  for (const stored of [
    "draff", "drat", "draf", "drfat", "reviews", "reviewed", "reivew",
    "publised", "publish", "publishedd", "claim", "claimedd", "merge",
    "mergd", "merging", "in reviews", "under reveiw", "reviewings",
    "lives", "takne", "don", "complet",
  ]) {
    assert.equal(readStatus(stored), null, JSON.stringify(stored));
  }
});

// Extends public "returns null for empty values and unknown values after cleaning".
test("[unhappy-1] does not treat other punctuation as a documented separator", () => {
  for (const stored of [
    "in.review", "under/review", "in:review", "under\\review",
    "in+review", "under=review", "in\u2014review", "under\u2013review",
    "draft!", "(review)", '"published"', "claimed\0", "merged\0done",
  ]) {
    assert.equal(readStatus(stored), null, JSON.stringify(stored));
  }
});

// Extends public "returns null for unrecognized values without guessing".
test("[unhappy-1] rejects names inherited by ordinary JavaScript lookup objects", () => {
  for (const stored of [
    "constructor", "prototype", "toString", "valueOf", "hasOwnProperty",
    "isPrototypeOf", "propertyIsEnumerable", "toLocaleString", "__proto__",
    "__defineGetter__", "__lookupSetter__",
  ]) {
    assert.equal(readStatus(stored), null, JSON.stringify(stored));
  }
});

// Extends public "returns null for empty values and unknown values after cleaning".
test("[unhappy-1] reads long blank separator-only and trimmed-empty strings as null", () => {
  for (const stored of [
    " ".repeat(16384), "_- ".repeat(4096), "\t", "\r\n", "\n\t \r\n",
  ]) {
    assert.equal(readStatus(stored), null);
  }
});

// Extends public "returns null for unrecognized values without guessing".
test("[unhappy-1] does not truncate long unknown values into recognized prefixes", () => {
  for (const stored of [
    "draft" + "x".repeat(16384),
    "x".repeat(16384) + "completed",
    "in" + "-".repeat(8192) + "reviews",
    "review " + "unknown ".repeat(2048),
  ]) {
    assert.equal(readStatus(stored), null);
  }
});

// Extends public "returns null for unrecognized values without guessing".
test("[unhappy-1] does not repair accents fullwidth letters or lookalike characters", () => {
  for (const stored of ["dr\u00e1ft", "rev\u00efew", "merg\u00e9d", "\uff52\uff45\uff56\uff49\uff45\uff57", "cl\u0430imed"]) {
    assert.equal(readStatus(stored), null, JSON.stringify(stored));
  }
});
