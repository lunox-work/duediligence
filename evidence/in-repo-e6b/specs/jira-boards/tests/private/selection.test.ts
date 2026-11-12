import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BOARD_MAX_TICKETS_LIMIT,
  InvalidJiraBoardError,
  JiraConnectionNotFoundError,
  normalizeBoardSelection,
} from "../../src/jira-boards.js";
import type {
  InvalidJiraBoardField,
  StoredBoardSelection,
} from "../../src/jira-boards.js";

function raw(value: unknown): StoredBoardSelection {
  return value as StoredBoardSelection;
}

function isInvalid(
  field: InvalidJiraBoardField,
  message?: string,
): (error: unknown) => boolean {
  return (error) => {
    assert.ok(error instanceof InvalidJiraBoardError);
    assert.ok(error instanceof Error);
    assert.equal(error.name, "InvalidJiraBoardError");
    assert.equal(error.field, field);
    if (message !== undefined) {
      assert.equal(error.message, message);
    }
    return true;
  };
}

const MAX_TICKETS = "maxTickets must be a whole number from 1 to 100.";
const EXCLUDE = "excludeAssigned must be true or false.";
const ISSUE_TYPES = "issueTypes must be a list of non-empty names.";
const MIN_AGE = "minAgeDays must be a whole number of days, 0 or more.";
const MAX_AGE = "maxAgeDays must be null or a whole number of days, 0 or more.";
const AGE_ORDER = "maxAgeDays cannot be less than minAgeDays.";
const MIN_SPEC = "minSpecChars must be a whole number, 0 or more.";

// ---- happy-4: a full valid selection -----------------------------------------

// Extends "[happy-4] a full valid selection passes through": other values,
// keys given in reverse interface order.
test("[happy-4] a full selection with other values and reversed key order passes through", () => {
  const input: StoredBoardSelection = {
    minSpecChars: 1,
    maxAgeDays: null,
    minAgeDays: 0,
    issueTypes: ["Story"],
    excludeAssigned: false,
    maxTickets: 100,
  };

  assert.deepEqual(normalizeBoardSelection(input), {
    maxTickets: 100,
    excludeAssigned: false,
    issueTypes: ["Story"],
    minAgeDays: 0,
    maxAgeDays: null,
    minSpecChars: 1,
  });
});

// Extends "[happy-4] a full valid selection passes through": every key is
// normalized at once, and unknown keys among them are dropped.
test("[happy-4] a full selection needing normalization comes back normalized and new", () => {
  const input = raw({
    maxTickets: 37,
    excludeAssigned: true,
    issueTypes: [" Task", "Bug ", "Task", "User Story"],
    minAgeDays: 3,
    maxAgeDays: 90,
    minSpecChars: 5000,
    colour: "red",
    owner: null,
  });

  const output = normalizeBoardSelection(input);

  assert.notEqual(output, input);
  assert.deepEqual(output, {
    maxTickets: 37,
    excludeAssigned: true,
    issueTypes: ["Task", "Bug", "User Story"],
    minAgeDays: 3,
    maxAgeDays: 90,
    minSpecChars: 5000,
  });
});

// Extends "[happy-4] the ticket limit is 100": the limit is the accepted
// maximum, and one above it is rejected.
test("[happy-4] BOARD_MAX_TICKETS_LIMIT is the largest maxTickets accepted", () => {
  assert.deepEqual(
    normalizeBoardSelection({ maxTickets: BOARD_MAX_TICKETS_LIMIT }),
    { maxTickets: 100 },
  );
  assert.throws(
    () => normalizeBoardSelection({ maxTickets: BOARD_MAX_TICKETS_LIMIT + 1 }),
    isInvalid("maxTickets", MAX_TICKETS),
  );
});

// ---- boundary-5: accepted values and their normal form ----------------------

// Extends the "[boundary-5] normalizeBoardSelection(...)" outline with more
// accepted values.
const ACCEPTED: ReadonlyArray<readonly [string, unknown, StoredBoardSelection]> = [
  ["maxTickets 2", { maxTickets: 2 }, { maxTickets: 2 }],
  ["maxTickets 99", { maxTickets: 99 }, { maxTickets: 99 }],
  ["excludeAssigned true", { excludeAssigned: true }, { excludeAssigned: true }],
  [
    "minAgeDays at the largest safe integer",
    { minAgeDays: Number.MAX_SAFE_INTEGER },
    { minAgeDays: Number.MAX_SAFE_INTEGER },
  ],
  ["minSpecChars a million", { minSpecChars: 1_000_000 }, { minSpecChars: 1_000_000 }],
  ["maxAgeDays large", { maxAgeDays: 3650 }, { maxAgeDays: 3650 }],
  [
    "maxAgeDays null beside minAgeDays 30 skips the cross-field check",
    { minAgeDays: 30, maxAgeDays: null },
    { minAgeDays: 30, maxAgeDays: null },
  ],
  [
    "maxAgeDays one above minAgeDays",
    { minAgeDays: 7, maxAgeDays: 8 },
    { minAgeDays: 7, maxAgeDays: 8 },
  ],
  [
    "minAgeDays 0 and maxAgeDays 0",
    { minAgeDays: 0, maxAgeDays: 0 },
    { minAgeDays: 0, maxAgeDays: 0 },
  ],
  [
    "maxAgeDays alone below what a minAgeDays would be",
    { maxAgeDays: 1 },
    { maxAgeDays: 1 },
  ],
  [
    "issueTypes whose duplicates differ only in whitespace",
    { issueTypes: ["Bug", " Bug", "Bug ", "\tBug\n"] },
    { issueTypes: ["Bug"] },
  ],
  [
    "issueTypes keep the first occurrence's position",
    { issueTypes: ["Task", " Bug", "Task ", "Bug", "Epic"] },
    { issueTypes: ["Task", "Bug", "Epic"] },
  ],
  [
    "issueTypes keep inner spaces and case variants",
    { issueTypes: ["User Story", "user story", "USER STORY"] },
    { issueTypes: ["User Story", "user story", "USER STORY"] },
  ],
  [
    "issueTypes of one already-normal entry",
    { issueTypes: ["Bug"] },
    { issueTypes: ["Bug"] },
  ],
  [
    "every key undefined",
    {
      maxTickets: undefined,
      excludeAssigned: undefined,
      issueTypes: undefined,
      minAgeDays: undefined,
      maxAgeDays: undefined,
      minSpecChars: undefined,
    },
    {},
  ],
  [
    "only unknown keys",
    { colour: "red", size: 3, nested: { maxTickets: 5 } },
    {},
  ],
  [
    "issueTypes [] beside other keys",
    { issueTypes: [], maxTickets: 4 },
    { maxTickets: 4 },
  ],
  [
    "undefined maxAgeDays beside minAgeDays",
    { minAgeDays: 30, maxAgeDays: undefined },
    { minAgeDays: 30 },
  ],
];

for (const [label, input, output] of ACCEPTED) {
  test(`[boundary-5] normalizeBoardSelection accepts ${label}`, () => {
    assert.deepEqual(normalizeBoardSelection(raw(input)), output);
  });
}

// Extends "[boundary-5] normalizeBoardSelection({"issueTypes":[]}) returns {}":
// the key is omitted, not kept as an empty list.
test("[boundary-5] an issueTypes list that normalizes to nothing leaves no issueTypes key", () => {
  const output = normalizeBoardSelection({ issueTypes: [], minAgeDays: 1 });

  assert.ok(!("issueTypes" in output));
  assert.deepEqual(Object.keys(output), ["minAgeDays"]);
});

// Extends "[boundary-5] normalizeBoardSelection({"maxTickets":undefined,...})":
// undefined keys are dropped, not kept as present-but-undefined.
test("[boundary-5] undefined keys are absent from the result, not present as undefined", () => {
  const output = normalizeBoardSelection({
    maxTickets: undefined,
    excludeAssigned: undefined,
    minSpecChars: 10,
  });

  assert.deepEqual(Object.keys(output), ["minSpecChars"]);
});

// Extends "[boundary-5] normalizeBoardSelection({"maxAgeDays":null})": null
// stays a present key, distinct from absent.
test("[boundary-5] maxAgeDays null is kept as a present key", () => {
  const output = normalizeBoardSelection({ maxAgeDays: null });

  assert.ok("maxAgeDays" in output);
  assert.equal(output.maxAgeDays, null);
});

// ---- unhappy-2: a rejected value -------------------------------------------

// Extends the "[unhappy-2] normalizeBoardSelection(...) throws naming ..."
// outline with more rejected values for every key.
const REJECTED: ReadonlyArray<
  readonly [string, unknown, InvalidJiraBoardField, string]
> = [
  ["maxTickets -1", { maxTickets: -1 }, "maxTickets", MAX_TICKETS],
  ["maxTickets 1000", { maxTickets: 1000 }, "maxTickets", MAX_TICKETS],
  ["maxTickets 100.5", { maxTickets: 100.5 }, "maxTickets", MAX_TICKETS],
  ["maxTickets 0.5", { maxTickets: 0.5 }, "maxTickets", MAX_TICKETS],
  ["maxTickets Infinity", { maxTickets: Number.POSITIVE_INFINITY }, "maxTickets", MAX_TICKETS],
  ["maxTickets the string 5", { maxTickets: "5" }, "maxTickets", MAX_TICKETS],
  ["maxTickets null", { maxTickets: null }, "maxTickets", MAX_TICKETS],
  ["excludeAssigned 1", { excludeAssigned: 1 }, "excludeAssigned", EXCLUDE],
  ["excludeAssigned 0", { excludeAssigned: 0 }, "excludeAssigned", EXCLUDE],
  ["excludeAssigned the string true", { excludeAssigned: "true" }, "excludeAssigned", EXCLUDE],
  ["excludeAssigned null", { excludeAssigned: null }, "excludeAssigned", EXCLUDE],
  ["issueTypes with an empty string", { issueTypes: ["Bug", ""] }, "issueTypes", ISSUE_TYPES],
  ["issueTypes of one tab", { issueTypes: ["\t"] }, "issueTypes", ISSUE_TYPES],
  ["issueTypes with a blank entry first", { issueTypes: [" ", "Bug"] }, "issueTypes", ISSUE_TYPES],
  ["issueTypes with a number", { issueTypes: ["Bug", 7] }, "issueTypes", ISSUE_TYPES],
  ["issueTypes with a null", { issueTypes: [null] }, "issueTypes", ISSUE_TYPES],
  ["issueTypes an object", { issueTypes: { 0: "Bug" } }, "issueTypes", ISSUE_TYPES],
  ["issueTypes null", { issueTypes: null }, "issueTypes", ISSUE_TYPES],
  ["minAgeDays 2.5", { minAgeDays: 2.5 }, "minAgeDays", MIN_AGE],
  ["minAgeDays NaN", { minAgeDays: Number.NaN }, "minAgeDays", MIN_AGE],
  ["minAgeDays 2^53", { minAgeDays: 2 ** 53 }, "minAgeDays", MIN_AGE],
  ["minAgeDays the string 3", { minAgeDays: "3" }, "minAgeDays", MIN_AGE],
  ["minAgeDays null", { minAgeDays: null }, "minAgeDays", MIN_AGE],
  ["minAgeDays -Infinity", { minAgeDays: Number.NEGATIVE_INFINITY }, "minAgeDays", MIN_AGE],
  ["maxAgeDays Infinity", { maxAgeDays: Number.POSITIVE_INFINITY }, "maxAgeDays", MAX_AGE],
  ["maxAgeDays NaN", { maxAgeDays: Number.NaN }, "maxAgeDays", MAX_AGE],
  ["maxAgeDays the string 7", { maxAgeDays: "7" }, "maxAgeDays", MAX_AGE],
  ["maxAgeDays -100", { maxAgeDays: -100 }, "maxAgeDays", MAX_AGE],
  ["maxAgeDays false", { maxAgeDays: false }, "maxAgeDays", MAX_AGE],
  ["maxAgeDays one below minAgeDays", { minAgeDays: 8, maxAgeDays: 7 }, "maxAgeDays", AGE_ORDER],
  ["maxAgeDays 0 below minAgeDays 1", { minAgeDays: 1, maxAgeDays: 0 }, "maxAgeDays", AGE_ORDER],
  ["minSpecChars 1.5", { minSpecChars: 1.5 }, "minSpecChars", MIN_SPEC],
  ["minSpecChars NaN", { minSpecChars: Number.NaN }, "minSpecChars", MIN_SPEC],
  ["minSpecChars Infinity", { minSpecChars: Number.POSITIVE_INFINITY }, "minSpecChars", MIN_SPEC],
  ["minSpecChars 2^53", { minSpecChars: 2 ** 53 }, "minSpecChars", MIN_SPEC],
  ["minSpecChars the string 200", { minSpecChars: "200" }, "minSpecChars", MIN_SPEC],
  ["minSpecChars null", { minSpecChars: null }, "minSpecChars", MIN_SPEC],
  ["minSpecChars -1", { minSpecChars: -1 }, "minSpecChars", MIN_SPEC],
];

for (const [label, input, field, message] of REJECTED) {
  test(`[unhappy-2] normalizeBoardSelection rejects ${label}, naming ${field}`, () => {
    assert.throws(
      () => normalizeBoardSelection(raw(input)),
      isInvalid(field, message),
    );
  });
}

// Extends the "[unhappy-2]" outline: the error type itself carries the field
// and message it was built with.
test("[unhappy-2] InvalidJiraBoardError carries its field, message and name", () => {
  const error = new InvalidJiraBoardError("minSpecChars", "a message");

  assert.ok(error instanceof Error);
  assert.ok(error instanceof InvalidJiraBoardError);
  assert.equal(error.name, "InvalidJiraBoardError");
  assert.equal(error.field, "minSpecChars");
  assert.equal(error.message, "a message");
});

// ---- unhappy-3: the first failing key in interface order -------------------

// Extends "[unhappy-3] the first failing key in interface order is the one
// reported": every adjacent pair, given in reverse order.
const FIRST_FAILING: ReadonlyArray<readonly [string, unknown, InvalidJiraBoardField]> = [
  [
    "excludeAssigned before maxTickets is reported as maxTickets",
    { excludeAssigned: "yes", maxTickets: 0 },
    "maxTickets",
  ],
  [
    "issueTypes before excludeAssigned is reported as excludeAssigned",
    { issueTypes: "Bug", excludeAssigned: "yes" },
    "excludeAssigned",
  ],
  [
    "minAgeDays before issueTypes is reported as issueTypes",
    { minAgeDays: -1, issueTypes: [""] },
    "issueTypes",
  ],
  [
    "maxAgeDays before minAgeDays is reported as minAgeDays",
    { maxAgeDays: -1, minAgeDays: -1 },
    "minAgeDays",
  ],
  [
    "minSpecChars before maxAgeDays is reported as maxAgeDays",
    { minSpecChars: -1, maxAgeDays: 1.5 },
    "maxAgeDays",
  ],
  [
    "all six invalid in reverse order is reported as maxTickets",
    {
      minSpecChars: -1,
      maxAgeDays: -1,
      minAgeDays: -1,
      issueTypes: "Bug",
      excludeAssigned: "yes",
      maxTickets: 101,
    },
    "maxTickets",
  ],
  [
    "a bad excludeAssigned beside an inverted age range is reported as excludeAssigned",
    { minAgeDays: 30, maxAgeDays: 7, excludeAssigned: "no" },
    "excludeAssigned",
  ],
];

for (const [label, input, field] of FIRST_FAILING) {
  test(`[unhappy-3] ${label}`, () => {
    assert.throws(() => normalizeBoardSelection(raw(input)), isInvalid(field));
  });
}

// Extends "[unhappy-3] a per-key failure is reported before the
// minAgeDays/maxAgeDays check": a valid minSpecChars lets the cross-field
// check run last and be the one reported.
test("[unhappy-3] the minAgeDays/maxAgeDays check runs after every per-key check passes", () => {
  assert.throws(
    () =>
      normalizeBoardSelection({
        maxTickets: 5,
        minAgeDays: 30,
        maxAgeDays: 7,
        minSpecChars: 10,
      }),
    isInvalid("maxAgeDays", AGE_ORDER),
  );
});

// ---- boundary-6: the input is not mutated -----------------------------------

// Extends "[boundary-6] the input is not mutated": a larger input with
// duplicates, unknown keys and undefined values keeps every one of them.
test("[boundary-6] a larger input keeps its duplicates, unknown keys and undefined values", () => {
  const issueTypes = [" Task ", "Bug", "Task", "  Bug"];
  const input = raw({
    maxTickets: undefined,
    issueTypes,
    minAgeDays: 3,
    colour: "red",
  });

  const output = normalizeBoardSelection(input);

  assert.deepEqual(output, { issueTypes: ["Task", "Bug"], minAgeDays: 3 });
  assert.equal((input as { issueTypes?: unknown }).issueTypes, issueTypes);
  assert.deepEqual(issueTypes, [" Task ", "Bug", "Task", "  Bug"]);
  assert.deepEqual(Object.keys(input).sort(), [
    "colour",
    "issueTypes",
    "maxTickets",
    "minAgeDays",
  ]);
  assert.equal((input as Record<string, unknown>)["colour"], "red");
});

// Extends "[boundary-6] the input is not mutated": a rejected input is not
// mutated either.
test("[boundary-6] a rejected input is left as it was", () => {
  const input = { issueTypes: [" Bug ", "Bug"], minAgeDays: 30, maxAgeDays: 7 };

  assert.throws(() => normalizeBoardSelection(input), isInvalid("maxAgeDays"));
  assert.deepEqual(input, {
    issueTypes: [" Bug ", "Bug"],
    minAgeDays: 30,
    maxAgeDays: 7,
  });
});

// Extends "[boundary-6] a deeply frozen input normalizes without throwing":
// every key frozen at once.
test("[boundary-6] a frozen full selection normalizes without throwing", () => {
  const input = Object.freeze({
    maxTickets: 3,
    excludeAssigned: true,
    issueTypes: Object.freeze([" Bug", "Task "]),
    minAgeDays: 1,
    maxAgeDays: 2,
    minSpecChars: 4,
  });

  assert.deepEqual(normalizeBoardSelection(input), {
    maxTickets: 3,
    excludeAssigned: true,
    issueTypes: ["Bug", "Task"],
    minAgeDays: 1,
    maxAgeDays: 2,
    minSpecChars: 4,
  });
});

// ---- unhappy-6: the connection error ----------------------------------------

// Extends "[unhappy-6] the refusal names the connection id it was given": the
// error type itself builds the message from any id.
test("[unhappy-6] JiraConnectionNotFoundError names the id in its message", () => {
  const error = new JiraConnectionNotFoundError("jrc_abc123");

  assert.ok(error instanceof Error);
  assert.ok(error instanceof JiraConnectionNotFoundError);
  assert.equal(error.name, "JiraConnectionNotFoundError");
  assert.equal(error.message, 'No Jira connection with id "jrc_abc123".');
});
