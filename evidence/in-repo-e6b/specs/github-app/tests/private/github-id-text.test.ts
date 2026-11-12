import assert from "node:assert/strict";
import { test } from "node:test";

import { trackRepositorySchema } from "../../src/index.js";

const ID_MESSAGE = "Must be a positive whole number.";

type Issue = { message: string; path: PropertyKey[] };
type SafeResult = { success: boolean; error?: { issues: Issue[] } };

function describeIssues(issues: Issue[]): string {
  return JSON.stringify(issues.map((i) => [i.path.map(String), i.message]));
}

/** The parse failed with an issue at `path` (and, if given, with `message`). */
function assertFailsAt(
  result: SafeResult,
  path: PropertyKey[],
  message?: string,
  label?: string,
): void {
  assert.equal(result.success, false, label ?? "expected the parse to fail");
  const issues = result.error?.issues ?? [];
  assert.ok(
    issues.some(
      (issue) =>
        JSON.stringify(issue.path) === JSON.stringify(path) &&
        (message === undefined || issue.message === message),
    ),
    `${label ?? ""} expected an issue at ${JSON.stringify(path)}${
      message === undefined ? "" : ` with "${message}"`
    }, got ${describeIssues(issues)}`,
  );
}

function track(externalId: unknown) {
  return trackRepositorySchema.safeParse({ installationId: "ghi_1", externalId });
}

// Extends "[happy-3] a canonical id is accepted and kept as a string": more
// lengths, inner zeros, and ids that a lexicographic comparison against
// "9007199254740991" would wrongly refuse.
test("[happy-3] canonical ids of every length up to sixteen digits are kept as the same string", () => {
  for (const id of [
    "2",
    "9",
    "10",
    "100",
    "999",
    "1000000",
    "99999999",
    "100000000000",
    "999999999999999",
    "1000000000000000",
    "8999999999999999",
    "9007199254740990",
    "9007199254740989",
  ]) {
    const parsed = trackRepositorySchema.parse({
      installationId: "ghi_1",
      externalId: id,
    });
    assert.equal(parsed.externalId, id);
    assert.equal(typeof parsed.externalId, "string");
  }
});

// Extends "[happy-3] the largest safe integer is accepted as an id and kept as a string".
test("[happy-3] the largest safe integer is kept as the exact string, not a re-rendered number", () => {
  const parsed = trackRepositorySchema.parse({
    installationId: "ghi_1",
    externalId: "9007199254740991",
  });
  assert.deepEqual(parsed, {
    installationId: "ghi_1",
    externalId: "9007199254740991",
  });
});

// Extends "[boundary-1] one past the largest safe integer is refused": values
// just over the limit, including ones whose Number() rounds back down, and
// longer values a lexicographic or length check would let through.
test("[boundary-1] every id just past the largest safe integer is refused with the id message", () => {
  for (const id of [
    "9007199254740992",
    "9007199254740993",
    "9007199254741000",
    "9100000000000000",
    "9999999999999999",
    "10000000000000000",
    "18014398509481984",
    "123456789012345678901234567890",
  ]) {
    assertFailsAt(track(id), ["externalId"], ID_MESSAGE, id);
  }
});

// Extends "[unhappy-2] a non-canonical id is refused rather than normalised":
// more shapes a loose or unanchored check, or Number()/parseInt, would accept.
test("[unhappy-2] ids that Number or parseInt would read are still refused with the id message", () => {
  for (const id of [
    "00",
    "007",
    "01",
    "12 ",
    "12\n",
    "\t12",
    "1 2",
    "12a",
    "a12",
    "0x1F",
    "1_000",
    "1,000",
    "1.0",
    "1.",
    ".5",
    "-0",
    "+0",
    "Infinity",
    "NaN",
    "1e3",
    "1E3",
    "１２",
    "٣",
  ]) {
    assertFailsAt(track(id), ["externalId"], ID_MESSAGE, JSON.stringify(id));
  }
});

// Extends "[unhappy-2] an empty id is refused with the id message": a
// non-canonical id is refused with the message on its own, whatever the
// installation id.
test("[unhappy-2] a zero id is refused with the id message alongside a different installation id", () => {
  assertFailsAt(
    trackRepositorySchema.safeParse({ installationId: "inst-xyz", externalId: "0" }),
    ["externalId"],
    ID_MESSAGE,
  );
  assertFailsAt(
    trackRepositorySchema.safeParse({ externalId: "-5", installationId: "x" }),
    ["externalId"],
    ID_MESSAGE,
  );
});

// Extends "[unhappy-3] a numeric externalId is refused, not coerced": larger
// numbers, the largest safe integer and other non-string types.
test("[unhappy-3] numbers and other non-strings are refused as externalId, not coerced", () => {
  for (const externalId of [
    7,
    42,
    Number.MAX_SAFE_INTEGER,
    123n,
    true,
    null,
    ["7"],
    { id: "7" },
  ]) {
    assertFailsAt(track(externalId), ["externalId"], undefined, String(externalId));
  }
});
