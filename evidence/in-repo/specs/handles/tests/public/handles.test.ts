import assert from "node:assert/strict";
import { test } from "node:test";

import * as handleModule from "../src/handle.js";
import {
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  checkHandle,
  handleStemFromEmail,
  isValidHandle,
  normalizeHandle,
  toHandleCase,
  toHandleStem,
} from "../src/handle.js";
import * as root from "../src/index.js";

const LENGTH_REASON = "Handle must be between 3 and 30 characters.";
const CHARSET_REASON =
  "Handle can use letters, numbers, hyphens and underscores only.";

const LENGTH_REJECTION = {
  status: "invalid",
  problem: "length",
  reason: LENGTH_REASON,
};
const CHARSET_REJECTION = {
  status: "invalid",
  problem: "charset",
  reason: CHARSET_REASON,
};

const HANDLE_EXPORTS = [
  "HANDLE_MAX_LENGTH",
  "HANDLE_MIN_LENGTH",
  "checkHandle",
  "handleStemFromEmail",
  "isValidHandle",
  "normalizeHandle",
  "toHandleCase",
  "toHandleStem",
];

function repeat(char: string, count: number): string {
  return char.repeat(count);
}

function show(value: string): string {
  return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value);
}

// --- Rule: the length limits are the exported constants ---------------------

test("[happy-1] HANDLE_MIN_LENGTH is 3 and HANDLE_MAX_LENGTH is 30", () => {
  assert.equal(HANDLE_MIN_LENGTH, 3);
  assert.equal(HANDLE_MAX_LENGTH, 30);
});

test("[happy-1] the constants are plain numbers with the minimum below the maximum", () => {
  assert.equal(typeof HANDLE_MIN_LENGTH, "number");
  assert.equal(typeof HANDLE_MAX_LENGTH, "number");
  assert.ok(HANDLE_MIN_LENGTH < HANDLE_MAX_LENGTH);
});

test("[happy-2] the handle exports are the same values from the package root", () => {
  const fromRoot = root as unknown as Record<string, unknown>;
  const fromHandle = handleModule as unknown as Record<string, unknown>;

  for (const name of HANDLE_EXPORTS) {
    assert.ok(name in fromRoot, `${name} should be exported from index.ts`);
    assert.equal(fromRoot[name], fromHandle[name], `${name} should be the same value`);
  }
});

test("[happy-2] handle.ts exports exactly the listed values and the root keeps its todo exports", () => {
  assert.deepEqual(Object.keys(handleModule).sort(), [...HANDLE_EXPORTS].sort());

  const fromRoot = root as unknown as Record<string, unknown>;
  for (const name of [
    "TITLE_MAX_LENGTH",
    "TODO_FILTERS",
    "isTodoFilter",
    "InvalidTitleError",
    "normalizeTitle",
    "isValidTitle",
    "toggle",
    "rename",
    "matchesFilter",
    "filterTodos",
    "countTodos",
  ]) {
    assert.ok(name in fromRoot, `${name} should still be exported from index.ts`);
  }
  assert.equal(root.normalizeTitle("  buy milk  "), "buy milk");
  assert.equal(root.isTodoFilter("active"), true);
});

// --- Rule: toHandleCase trims and lowercases, and does nothing else ----------

test("[happy-3] toHandleCase trims surrounding whitespace and lowercases", () => {
  const cases: Array<[string, string]> = [
    ["FeverSoul", "feversoul"],
    ["  FeverSoul  ", "feversoul"],
    ["\tRivers-Dana\n", "rivers-dana"],
    ["a-b_c9", "a-b_c9"],
  ];
  for (const [raw, cased] of cases) {
    assert.equal(toHandleCase(raw), cased, `toHandleCase(${show(raw)})`);
  }
});

test("[happy-3] toHandleCase keeps inner whitespace and disallowed characters and empties blank input", () => {
  const cases: Array<[string, string]> = [
    ["Has Space", "has space"],
    ["has.dot", "has.dot"],
    ["ÉCOLE", "école"],
    ["", ""],
    ["   ", ""],
  ];
  for (const [raw, cased] of cases) {
    assert.equal(toHandleCase(raw), cased, `toHandleCase(${show(raw)})`);
  }
});

test("[boundary-1] toHandleCase applied to its own output is unchanged", () => {
  const once = toHandleCase("  Mixed_Case-9  ");
  assert.equal(once, "mixed_case-9");
  assert.equal(toHandleCase(once), "mixed_case-9");
});

test("[boundary-1] toHandleCase is idempotent on blank and non-ASCII input", () => {
  for (const raw of ["", "   ", "\tRivers-Dana\n", "ÉCOLE", "Has Space"]) {
    const once = toHandleCase(raw);
    assert.equal(toHandleCase(once), once, `toHandleCase twice on ${show(raw)}`);
  }
});

// --- Rule: checkHandle checks an already-cased handle as given ---------------

test("[happy-4] checkHandle accepts handles made of a-z, 0-9, hyphen and underscore", () => {
  for (const handle of ["abc", "feversoul", "a-b_c9", "123", "dana--rivers"]) {
    assert.deepEqual(checkHandle(handle), { status: "ok" }, `checkHandle(${show(handle)})`);
  }
});

test("[happy-4] checkHandle accepts leading hyphens and all-underscore handles, as a new unfrozen object", () => {
  for (const handle of ["-ab", "___"]) {
    assert.deepEqual(checkHandle(handle), { status: "ok" }, `checkHandle(${show(handle)})`);
  }
  const first = checkHandle("abc");
  const second = checkHandle("abc");
  assert.notEqual(first, second, "each call returns a new object");
  assert.equal(Object.isFrozen(first), false);
});

test("[boundary-2] checkHandle accepts handles of exactly 3 and exactly 30 characters", () => {
  assert.deepEqual(checkHandle(repeat("x", 3)), { status: "ok" });
  assert.deepEqual(checkHandle(repeat("x", 30)), { status: "ok" });
});

test("[boundary-2] checkHandle rejects handles of 0, 2 and 31 characters for length", () => {
  for (const length of [0, 2, 31]) {
    assert.deepEqual(
      checkHandle(repeat("x", length)),
      LENGTH_REJECTION,
      `${length} characters`,
    );
  }
});

test("[unhappy-1] checkHandle rejects spaces, slashes, at signs and dots for charset", () => {
  for (const handle of ["has space", "has/slash", "has@at", "has.dot"]) {
    assert.deepEqual(checkHandle(handle), CHARSET_REJECTION, `checkHandle(${show(handle)})`);
  }
});

test("[unhappy-1] checkHandle does not lowercase or trim, and rejects non-ASCII for charset", () => {
  for (const handle of ["FeverSoul", " abc", "abc\n", "école", "😀😀"]) {
    assert.deepEqual(checkHandle(handle), CHARSET_REJECTION, `checkHandle(${show(handle)})`);
  }
});

test("[boundary-3] checkHandle reports length, not charset, when a handle is too short or long and has bad characters", () => {
  const spaced = Array.from({ length: 16 }, () => "x").join(" ");
  assert.equal(spaced.length, 31);

  for (const handle of ["a.", "éé", spaced]) {
    const result = checkHandle(handle);
    assert.equal(result.status, "invalid", `checkHandle(${show(handle)})`);
    assert.deepEqual(result, LENGTH_REJECTION, `checkHandle(${show(handle)})`);
  }
});

test("[boundary-3] checkHandle reports charset when the length is right but a character is bad", () => {
  const result = checkHandle("a.b");
  assert.equal(result.status, "invalid");
  assert.deepEqual(result, CHARSET_REJECTION);
});

// --- Rule: normalizeHandle trims, lowercases, then checks --------------------

test("[happy-5] normalizeHandle returns the lowercased handle and the typed casing for display", () => {
  assert.deepEqual(normalizeHandle("  FeverSoul  "), {
    status: "ok",
    handle: "feversoul",
    display: "FeverSoul",
  });
  assert.deepEqual(normalizeHandle("A-B_C9"), {
    status: "ok",
    handle: "a-b_c9",
    display: "A-B_C9",
  });
});

test("[happy-5] normalizeHandle trims tabs and newlines from display and leaves lowercase input alone", () => {
  assert.deepEqual(normalizeHandle("dana"), {
    status: "ok",
    handle: "dana",
    display: "dana",
  });
  assert.deepEqual(normalizeHandle("\tRivers-Dana\n"), {
    status: "ok",
    handle: "rivers-dana",
    display: "Rivers-Dana",
  });
  const first = normalizeHandle("dana");
  assert.notEqual(first, normalizeHandle("dana"), "each call returns a new object");
  assert.equal(Object.isFrozen(first), false);
});

test("[boundary-4] normalizeHandle accepts input that fits the limits once trimmed", () => {
  assert.equal(normalizeHandle("  abc  ").status, "ok");

  const padded = `  ${repeat("X", 30)}  `;
  assert.deepEqual(normalizeHandle(padded), {
    status: "ok",
    handle: repeat("x", 30),
    display: repeat("X", 30),
  });
});

test("[boundary-4] normalizeHandle rejects input that is too short or too long once trimmed", () => {
  for (const raw of [" ab ", repeat("x", 31), "", "    "]) {
    assert.equal(normalizeHandle(raw).status, "invalid", `normalizeHandle(${show(raw)})`);
  }
});

test("[unhappy-2] normalizeHandle returns exactly the checkHandle rejection with no handle or display", () => {
  const cases: Array<[string, object]> = [
    ["ab", LENGTH_REJECTION],
    ["Has Space", CHARSET_REJECTION],
    ["rivers.dana", CHARSET_REJECTION],
  ];
  for (const [raw, rejection] of cases) {
    const result = normalizeHandle(raw);
    assert.deepEqual(result, rejection, `normalizeHandle(${show(raw)})`);
    assert.equal("handle" in result, false);
    assert.equal("display" in result, false);
  }
});

test("[unhappy-2] normalizeHandle rejects blank input for length and uppercase non-ASCII for charset", () => {
  const cases: Array<[string, object]> = [
    ["   ", LENGTH_REJECTION],
    ["École", CHARSET_REJECTION],
  ];
  for (const [raw, rejection] of cases) {
    const result = normalizeHandle(raw);
    assert.deepEqual(result, rejection, `normalizeHandle(${show(raw)})`);
    assert.equal("handle" in result, false);
    assert.equal("display" in result, false);
  }
});

test("[boundary-5] the normalized handle equals toHandleCase of the input and passes checkHandle", () => {
  const raw = "  Rivers_Dana-9 ";
  const result = normalizeHandle(raw);
  assert.ok(result.status === "ok");
  assert.equal(result.handle, "rivers_dana-9");
  assert.equal(result.handle, toHandleCase(raw));
  assert.deepEqual(checkHandle("rivers_dana-9"), { status: "ok" });
});

test("[boundary-5] every accepted handle at the length limits equals toHandleCase and passes checkHandle", () => {
  for (const raw of [" ABC ", `\t${repeat("Q", 30)}\n`]) {
    const result = normalizeHandle(raw);
    assert.ok(result.status === "ok", `normalizeHandle(${show(raw)})`);
    assert.equal(result.handle, toHandleCase(raw));
    assert.deepEqual(checkHandle(result.handle), { status: "ok" });
  }
});

// --- Rule: isValidHandle agrees with normalizeHandle -------------------------

test("[happy-6] isValidHandle is true for valid input and false for invalid input", () => {
  for (const raw of ["feversoul", "  FeverSoul  ", "a-b_c9"]) {
    assert.equal(isValidHandle(raw), true, `isValidHandle(${show(raw)})`);
  }
  for (const raw of ["ab", "has space", "has.dot"]) {
    assert.equal(isValidHandle(raw), false, `isValidHandle(${show(raw)})`);
  }
});

test("[happy-6] isValidHandle agrees with normalizeHandle at the length limits and on empty input", () => {
  const cases: Array<[string, boolean]> = [
    [repeat("x", 30), true],
    [repeat("x", 31), false],
    ["", false],
  ];
  for (const [raw, valid] of cases) {
    assert.equal(isValidHandle(raw), valid, `isValidHandle(${show(raw)})`);
    assert.equal(isValidHandle(raw), normalizeHandle(raw).status === "ok");
  }
});

// --- Rule: toHandleStem derives a handle that always passes checkHandle -------

test("[happy-7] toHandleStem lowercases and joins words with a hyphen", () => {
  const cases: Array<[string, string]> = [
    ["Acme Corp", "acme-corp"],
    ["  Acme, Inc.  ", "acme-inc"],
    ["rivers.dana+work", "rivers-dana-work"],
    ["dana@example.test", "dana-example-test"],
  ];
  for (const [text, stem] of cases) {
    assert.equal(toHandleStem(text), stem, `toHandleStem(${show(text)})`);
  }
});

test("[happy-7] toHandleStem keeps inner hyphens and underscores and drops non-ASCII letters", () => {
  const cases: Array<[string, string]> = [
    ["--dana--rivers--", "dana--rivers"],
    ["a -b", "a--b"],
    ["_dana_", "_dana_"],
    ["Zoë Café", "zo-caf"],
  ];
  for (const [text, stem] of cases) {
    assert.equal(toHandleStem(text), stem, `toHandleStem(${show(text)})`);
  }
});

test("[boundary-6] toHandleStem pads stems shorter than 3 characters with -user", () => {
  const cases: Array<[string, string]> = [
    ["jo", "jo-user"],
    ["QA", "qa-user"],
    ["x", "x-user"],
    ["abc", "abc"],
  ];
  for (const [text, stem] of cases) {
    assert.equal(toHandleStem(text), stem, `toHandleStem(${show(text)})`);
  }
});

test("[boundary-6] toHandleStem turns empty, non-ASCII-only and punctuation-only text into -user", () => {
  const cases: Array<[string, string]> = [
    ["", "-user"],
    ["日本", "-user"],
    ["!!!", "-user"],
    ["-a-", "a-user"],
  ];
  for (const [text, stem] of cases) {
    assert.equal(toHandleStem(text), stem, `toHandleStem(${show(text)})`);
  }
});

test("[boundary-7] toHandleStem cuts long stems to 30 characters", () => {
  assert.equal(toHandleStem(repeat("x", 60)), repeat("x", 30));
  assert.equal(toHandleStem(repeat("x", 30)), repeat("x", 30));
});

test("[boundary-7] toHandleStem never ends a cut stem in a hyphen and trims leading hyphens before cutting", () => {
  const cases: Array<[string, string]> = [
    [`${repeat("x", 29)}.y`, repeat("x", 29)],
    [`${repeat("-", 29)}abcdef`, "abcdef"],
    [`ab${repeat("-", 40)}cd`, "ab-user"],
  ];
  for (const [text, stem] of cases) {
    assert.equal(toHandleStem(text), stem, `toHandleStem(${show(text)})`);
  }
});

test("[boundary-8] toHandleStem turns 100000 hyphens into -user", () => {
  assert.equal(toHandleStem(repeat("-", 100000)), "-user");
});

test("[boundary-8] toHandleStem handles 100000 hyphens before a letter and 100000 disallowed characters", () => {
  assert.equal(toHandleStem(`${repeat("-", 100000)}a`), "a-user");
  assert.equal(toHandleStem(repeat(".", 100000)), "-user");
});

test("[boundary-9] stems from ordinary and short text pass checkHandle and are unchanged by toHandleCase", () => {
  for (const text of ["Acme Corp", "", "jo"]) {
    const stem = toHandleStem(text);
    assert.deepEqual(checkHandle(stem), { status: "ok" }, `stem of ${show(text)}`);
    assert.equal(toHandleCase(stem), stem, `stem of ${show(text)}`);
  }
});

test("[boundary-9] stems from cut, hyphen-only and non-ASCII text pass checkHandle and are unchanged by toHandleCase", () => {
  for (const text of [`${repeat("x", 29)}.y`, repeat("-", 200), "日本"]) {
    const stem = toHandleStem(text);
    assert.deepEqual(checkHandle(stem), { status: "ok" }, `stem of ${show(text)}`);
    assert.equal(toHandleCase(stem), stem, `stem of ${show(text)}`);
  }
});

// --- Rule: handleStemFromEmail uses the local part --------------------------

test("[happy-8] handleStemFromEmail derives the stem from the local part", () => {
  const cases: Array<[string, string]> = [
    ["dana@example.test", "dana"],
    ["rivers.dana+work@example.test", "rivers-dana-work"],
    ["Rivers.Dana@example.test", "rivers-dana"],
  ];
  for (const [email, stem] of cases) {
    assert.equal(handleStemFromEmail(email), stem, `handleStemFromEmail(${show(email)})`);
  }
});

test("[happy-8] handleStemFromEmail trims hyphens and pads a short local part", () => {
  const cases: Array<[string, string]> = [
    ["--dana--rivers--@example.test", "dana--rivers"],
    ["jo@example.test", "jo-user"],
  ];
  for (const [email, stem] of cases) {
    assert.equal(handleStemFromEmail(email), stem, `handleStemFromEmail(${show(email)})`);
  }
});

test("[boundary-10] handleStemFromEmail handles an empty local part, empty input and no at sign", () => {
  const cases: Array<[string, string]> = [
    ["@example.test", "-user"],
    ["", "-user"],
    ["no-at-sign", "no-at-sign"],
  ];
  for (const [email, stem] of cases) {
    assert.equal(handleStemFromEmail(email), stem, `handleStemFromEmail(${show(email)})`);
  }
});

test("[boundary-10] handleStemFromEmail splits on the first at sign and cuts long local parts", () => {
  const cases: Array<[string, string]> = [
    ["a@b@example.test", "a-user"],
    [`${repeat("x", 60)}@example.test`, repeat("x", 30)],
    [`${repeat("-", 200)}@example.test`, "-user"],
  ];
  for (const [email, stem] of cases) {
    assert.equal(handleStemFromEmail(email), stem, `handleStemFromEmail(${show(email)})`);
  }
});

test("[boundary-11] handleStemFromEmail equals toHandleStem of the local part", () => {
  const email = "Rivers.Dana+Work@Example.Test";
  assert.equal(handleStemFromEmail(email), toHandleStem("Rivers.Dana+Work"));
  assert.equal(handleStemFromEmail(email), "rivers-dana-work");
});

test("[boundary-11] handleStemFromEmail equals toHandleStem of everything before the first at sign, or the whole string", () => {
  assert.equal(handleStemFromEmail("Rivers.Dana+Work"), toHandleStem("Rivers.Dana+Work"));
  assert.equal(handleStemFromEmail("a.b@c@example.test"), toHandleStem("a.b"));
});
