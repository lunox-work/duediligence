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

const LENGTH_REASON = "Must be between 3 and 30 characters.";
const CHARSET_REASON = "Can use letters, numbers, hyphens and underscores only.";

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

function lengthRejection() {
  return { status: "invalid", problem: "length", reason: LENGTH_REASON };
}

function charsetRejection() {
  return { status: "invalid", problem: "charset", reason: CHARSET_REASON };
}

// Rule: The length limits are the exported constants

test("[happy-1] HANDLE_MIN_LENGTH is 3 and HANDLE_MAX_LENGTH is 30", () => {
  assert.equal(HANDLE_MIN_LENGTH, 3);
  assert.equal(HANDLE_MAX_LENGTH, 30);
});

test("[happy-1] handle.ts exports exactly the two constants and six functions, not the pattern", () => {
  assert.deepEqual(Object.keys(handleModule).sort(), [...HANDLE_EXPORTS].sort());
});

test("[happy-2] every handle export is reachable from the package root as the same value", () => {
  const fromRoot = root as unknown as Record<string, unknown>;
  const fromHandle = handleModule as unknown as Record<string, unknown>;
  for (const name of HANDLE_EXPORTS) {
    assert.ok(name in fromRoot, `${name} should be exported from index.ts`);
    assert.equal(fromRoot[name], fromHandle[name], `${name} should be the same value`);
  }
});

test("[happy-2] the package root keeps its existing exports alongside the handle exports", () => {
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
    assert.ok(name in fromRoot, `${name} should still be exported`);
  }
  assert.equal(root.normalizeTitle("  buy milk  "), "buy milk");
  assert.equal(fromRoot.checkHandle, checkHandle);
});

// Rule: toHandleCase trims surrounding whitespace and lowercases, and does nothing else

test("[happy-3] toHandleCase trims and lowercases, keeping every other character", () => {
  const cases: Array<[string, string]> = [
    ["FeverSoul", "feversoul"],
    ["  FeverSoul  ", "feversoul"],
    ["\tRivers-Dana\n", "rivers-dana"],
    ["a-b_c9", "a-b_c9"],
    ["Has Space", "has space"],
    ["has.dot", "has.dot"],
    ["ÉCOLE", "école"],
  ];
  for (const [raw, cased] of cases) {
    assert.equal(toHandleCase(raw), cased, JSON.stringify(raw));
  }
});

test("[happy-3] toHandleCase returns an empty string for empty and whitespace-only input", () => {
  assert.equal(toHandleCase(""), "");
  assert.equal(toHandleCase("   "), "");
});

test("[boundary-1] toHandleCase applied to its own output is unchanged", () => {
  const once = toHandleCase("  Mixed_Case-9  ");
  assert.equal(once, "mixed_case-9");
  assert.equal(toHandleCase(once), "mixed_case-9");
});

test("[boundary-1] toHandleCase is idempotent for whitespace-only and inner-space input", () => {
  assert.equal(toHandleCase(toHandleCase("   ")), "");
  assert.equal(toHandleCase(toHandleCase("  Has Space  ")), "has space");
});

// Rule: checkHandle checks an already-cased handle as given

test("[happy-4] checkHandle accepts ordinary lowercase handles", () => {
  for (const handle of ["abc", "feversoul", "a-b_c9", "123"]) {
    assert.deepEqual(checkHandle(handle), { status: "ok" }, handle);
  }
});

test("[happy-4] checkHandle accepts leading hyphens, all underscores and doubled hyphens", () => {
  for (const handle of ["-ab", "___", "dana--rivers"]) {
    assert.deepEqual(checkHandle(handle), { status: "ok" }, handle);
  }
  const first = checkHandle("-ab");
  const second = checkHandle("-ab");
  assert.notEqual(first, second);
  assert.equal(Object.isFrozen(first), false);
});

test("[boundary-2] checkHandle accepts handles of exactly 3 and exactly 30 characters", () => {
  assert.deepEqual(checkHandle("x".repeat(3)), { status: "ok" });
  assert.deepEqual(checkHandle("x".repeat(30)), { status: "ok" });
});

test("[boundary-2] checkHandle rejects handles of 0, 2 and 31 characters as length", () => {
  for (const length of [0, 2, 31]) {
    assert.deepEqual(checkHandle("x".repeat(length)), lengthRejection(), `length ${length}`);
  }
});

test("[unhappy-1] checkHandle rejects punctuation and spaces as charset", () => {
  for (const handle of ["has space", "has/slash", "has@at", "has.dot"]) {
    assert.deepEqual(checkHandle(handle), charsetRejection(), handle);
  }
});

test("[unhappy-1] checkHandle rejects uppercase, untrimmed whitespace and non-ASCII as charset", () => {
  for (const handle of ["FeverSoul", " abc", "abc\n", "école", "😀😀"]) {
    assert.deepEqual(checkHandle(handle), charsetRejection(), JSON.stringify(handle));
  }
});

test("[boundary-3] checkHandle reports length before charset, and charset at a valid length", () => {
  const short = checkHandle("a.");
  assert.equal(short.status, "invalid");
  assert.equal(short.status === "invalid" && short.problem, "length");
  assert.deepEqual(short, lengthRejection());

  const rightLength = checkHandle("a.b");
  assert.equal(rightLength.status, "invalid");
  assert.equal(rightLength.status === "invalid" && rightLength.problem, "charset");
});

test("[boundary-3] checkHandle reports only length for a 2-code-unit or 31-character handle with bad characters", () => {
  assert.deepEqual(checkHandle("éé"), lengthRejection());
  const spaced = Array(16).fill("x").join(" ");
  assert.equal(spaced.length, 31);
  assert.deepEqual(checkHandle(spaced), lengthRejection());
});

// Rule: normalizeHandle trims and lowercases raw input, then applies checkHandle

test("[happy-5] normalizeHandle lowercases the handle and keeps the typed casing as display", () => {
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

test("[happy-5] normalizeHandle accepts already-lowercase input and trims tabs and newlines", () => {
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
});

test("[boundary-4] normalizeHandle measures length after trimming for accepted input", () => {
  assert.equal(normalizeHandle("  abc  ").status, "ok");
  assert.equal(normalizeHandle(`  ${"X".repeat(30)}  `).status, "ok");
});

test("[boundary-4] normalizeHandle rejects input too short after trimming or over 30 characters", () => {
  for (const raw of [" ab ", "x".repeat(31), "", "    "]) {
    assert.equal(normalizeHandle(raw).status, "invalid", JSON.stringify(raw));
  }
});

test("[unhappy-2] normalizeHandle returns the checkHandle rejection with no handle or display", () => {
  const cases: Array<[string, object]> = [
    ["ab", lengthRejection()],
    ["Has Space", charsetRejection()],
    ["rivers.dana", charsetRejection()],
  ];
  for (const [raw, expected] of cases) {
    const result = normalizeHandle(raw);
    assert.deepEqual(result, expected, raw);
    assert.equal("handle" in result, false);
    assert.equal("display" in result, false);
  }
});

test("[unhappy-2] normalizeHandle rejects whitespace-only input as length and a non-ASCII letter as charset", () => {
  const blank = normalizeHandle("   ");
  assert.deepEqual(blank, lengthRejection());
  assert.equal("handle" in blank, false);
  assert.equal("display" in blank, false);

  const accented = normalizeHandle("École");
  assert.deepEqual(accented, charsetRejection());
  assert.equal("handle" in accented, false);
  assert.equal("display" in accented, false);
});

test("[boundary-5] the normalized handle equals toHandleCase of the input and passes checkHandle", () => {
  const raw = "  Rivers_Dana-9 ";
  const result = normalizeHandle(raw);
  assert.equal(result.status, "ok");
  assert.equal(result.status === "ok" && result.handle, "rivers_dana-9");
  assert.equal(result.status === "ok" && result.handle, toHandleCase(raw));
  assert.deepEqual(checkHandle("rivers_dana-9"), { status: "ok" });
});

test("[boundary-5] at 30 characters with padding the normalized handle equals toHandleCase and passes checkHandle", () => {
  const raw = `  ${"X".repeat(30)}  `;
  const result = normalizeHandle(raw);
  assert.equal(result.status, "ok");
  const handle = result.status === "ok" ? result.handle : "";
  assert.equal(handle, toHandleCase(raw));
  assert.equal(handle, "x".repeat(30));
  assert.deepEqual(checkHandle(handle), { status: "ok" });
});

// Rule: isValidHandle is true exactly when normalizeHandle would return status "ok"

test("[happy-6] isValidHandle agrees with normalizeHandle on typical input", () => {
  for (const raw of ["feversoul", "  FeverSoul  ", "a-b_c9"]) {
    assert.equal(isValidHandle(raw), true, raw);
    assert.equal(normalizeHandle(raw).status, "ok");
  }
  for (const raw of ["has space", "has.dot"]) {
    assert.equal(isValidHandle(raw), false, raw);
    assert.equal(normalizeHandle(raw).status, "invalid");
  }
});

test("[happy-6] isValidHandle is true at 30 characters and false at 31, 2 and 0", () => {
  assert.equal(isValidHandle("x".repeat(30)), true);
  assert.equal(isValidHandle("x".repeat(31)), false);
  assert.equal(isValidHandle("ab"), false);
  assert.equal(isValidHandle(""), false);
});

// Rule: toHandleStem derives a handle that always passes checkHandle

test("[happy-7] toHandleStem lowercases and replaces runs of disallowed characters with one hyphen", () => {
  const cases: Array<[string, string]> = [
    ["Acme Corp", "acme-corp"],
    ["  Acme, Inc.  ", "acme-inc"],
    ["rivers.dana+work", "rivers-dana-work"],
    ["dana@example.test", "dana-example-test"],
  ];
  for (const [text, stem] of cases) {
    assert.equal(toHandleStem(text), stem, text);
  }
});

test("[happy-7] toHandleStem keeps existing hyphens and underscores, strips only outer hyphens, and drops non-ASCII", () => {
  const cases: Array<[string, string]> = [
    ["--dana--rivers--", "dana--rivers"],
    ["a -b", "a--b"],
    ["_dana_", "_dana_"],
    ["Zoë Café", "zo-caf"],
  ];
  for (const [text, stem] of cases) {
    assert.equal(toHandleStem(text), stem, text);
  }
});

test("[boundary-6] toHandleStem pads stems shorter than 3 characters with -user", () => {
  assert.equal(toHandleStem("jo"), "jo-user");
  assert.equal(toHandleStem("QA"), "qa-user");
  assert.equal(toHandleStem("x"), "x-user");
  assert.equal(toHandleStem("abc"), "abc");
});

test("[boundary-6] toHandleStem returns -user when nothing usable remains", () => {
  assert.equal(toHandleStem(""), "-user");
  assert.equal(toHandleStem("日本"), "-user");
  assert.equal(toHandleStem("!!!"), "-user");
  assert.equal(toHandleStem("-a-"), "a-user");
});

test("[boundary-7] toHandleStem keeps the first 30 characters of a long stem", () => {
  assert.equal(toHandleStem("x".repeat(60)), "x".repeat(30));
  assert.equal(toHandleStem("x".repeat(30)), "x".repeat(30));
});

test("[boundary-7] toHandleStem strips hyphens before cutting and may leave a trailing hyphen", () => {
  assert.equal(toHandleStem(`${"x".repeat(29)}.y`), `${"x".repeat(29)}-`);
  assert.equal(toHandleStem(`${"-".repeat(29)}abcdef`), "abcdef");
  assert.equal(toHandleStem(`ab${"-".repeat(40)}cd`), `ab${"-".repeat(28)}`);
});

test("[boundary-8] toHandleStem returns -user for 100000 hyphens", () => {
  assert.equal(toHandleStem("-".repeat(100000)), "-user");
});

test("[boundary-8] toHandleStem strips a 100000-hyphen prefix and collapses a 100000-character disallowed run", () => {
  assert.equal(toHandleStem(`${"-".repeat(100000)}abc`), "abc");
  assert.equal(toHandleStem(".".repeat(100000)), "-user");
});

test("[boundary-9] stems from ordinary and short text pass checkHandle and are unchanged by toHandleCase", () => {
  for (const text of ["Acme Corp", "", "jo"]) {
    const stem = toHandleStem(text);
    assert.deepEqual(checkHandle(stem), { status: "ok" }, JSON.stringify(text));
    assert.equal(toHandleCase(stem), stem);
  }
});

test("[boundary-9] stems from cut, all-hyphen and non-ASCII text pass checkHandle and are unchanged by toHandleCase", () => {
  for (const text of [`${"x".repeat(29)}.y`, "-".repeat(200), "日本"]) {
    const stem = toHandleStem(text);
    assert.deepEqual(checkHandle(stem), { status: "ok" }, text.slice(0, 12));
    assert.equal(toHandleCase(stem), stem);
  }
});

// Rule: handleStemFromEmail applies toHandleStem to the local part of the address

test("[happy-8] handleStemFromEmail derives the stem from the local part", () => {
  const cases: Array<[string, string]> = [
    ["dana@example.test", "dana"],
    ["rivers.dana+work@example.test", "rivers-dana-work"],
    ["Rivers.Dana@example.test", "rivers-dana"],
    ["--dana--rivers--@example.test", "dana--rivers"],
  ];
  for (const [email, stem] of cases) {
    assert.equal(handleStemFromEmail(email), stem, email);
  }
});

test("[happy-8] handleStemFromEmail pads a two-character local part with -user", () => {
  assert.equal(handleStemFromEmail("jo@example.test"), "jo-user");
});

test("[boundary-10] handleStemFromEmail uses the whole string without @, splits on the first @, and cuts to 30", () => {
  assert.equal(handleStemFromEmail("no-at-sign"), "no-at-sign");
  assert.equal(handleStemFromEmail("a@b@example.test"), "a-user");
  assert.equal(handleStemFromEmail(`${"x".repeat(60)}@example.test`), "x".repeat(30));
});

test("[boundary-10] handleStemFromEmail returns -user for an empty or all-hyphen local part", () => {
  assert.equal(handleStemFromEmail("@example.test"), "-user");
  assert.equal(handleStemFromEmail(""), "-user");
  assert.equal(handleStemFromEmail(`${"-".repeat(200)}@example.test`), "-user");
});

test("[boundary-11] handleStemFromEmail equals toHandleStem of the local part", () => {
  const fromEmail = handleStemFromEmail("Rivers.Dana+Work@Example.Test");
  assert.equal(fromEmail, toHandleStem("Rivers.Dana+Work"));
  assert.equal(fromEmail, "rivers-dana-work");
});

test("[boundary-11] handleStemFromEmail equals toHandleStem of the text before the first @, or of the whole string", () => {
  assert.equal(handleStemFromEmail("no-at-sign"), toHandleStem("no-at-sign"));
  assert.equal(handleStemFromEmail("a@b@example.test"), toHandleStem("a"));
});
