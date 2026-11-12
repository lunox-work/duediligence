import assert from "node:assert/strict";
import { test } from "node:test";

import { githubSetupCallbackSchema } from "../../src/index.js";

const ID_MESSAGE = "Must be a positive whole number.";
const CALLBACK_ID_MESSAGE =
  "installation_id is required unless setup_action is request.";

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

/** The parse failed, and one of its issues carries `message`. */
function assertFailsWithMessage(
  result: SafeResult,
  message: string,
  label?: string,
): void {
  assert.equal(result.success, false, label ?? "expected the parse to fail");
  const issues = result.error?.issues ?? [];
  assert.ok(
    issues.some((issue) => issue.message === message),
    `${label ?? ""} expected "${message}", got ${describeIssues(issues)}`,
  );
}

// Extends "[happy-5] an install or update yields GitHub's installation id as a
// number": other ids, so a hard-coded 42 or a numeric shortcut is caught.
test("[happy-5] install and update turn other installation ids into the same number", () => {
  for (const action of ["install", "update"] as const) {
    for (const [text, number] of [
      ["1", 1],
      ["7", 7],
      ["100", 100],
      ["123456789", 123456789],
      ["9007199254740990", 9007199254740990],
    ] as const) {
      const parsed = githubSetupCallbackSchema.parse({
        installation_id: text,
        setup_action: action,
        state: "s1",
      });
      assert.deepEqual(parsed, {
        installationId: number,
        setupAction: action,
        state: "s1",
      });
      assert.equal(typeof parsed.installationId, "number");
    }
  }
});

// Extends "[happy-5] the largest safe installation id becomes that number":
// the state comes through unchanged, whatever its content.
test("[happy-5] an update hands the state back unchanged", () => {
  const state = "aB3-_.~xyzZYX0987654321abcdefABCDEF0123456789abcdef0123456789ab";
  assert.deepEqual(
    githubSetupCallbackSchema.parse({
      state,
      setup_action: "update",
      installation_id: "55",
    }),
    { installationId: 55, setupAction: "update", state },
  );
});

// Extends "[happy-6] a request without an installation id yields a null id":
// the null is a real null, not undefined or a missing key.
test("[happy-6] a request without an id yields installationId as an own key set to null", () => {
  const parsed = githubSetupCallbackSchema.parse({
    setup_action: "request",
    state: "csrf-token-123",
  });
  assert.equal(parsed.installationId, null);
  assert.ok(Object.hasOwn(parsed, "installationId"));
  assert.deepEqual(parsed, {
    installationId: null,
    setupAction: "request",
    state: "csrf-token-123",
  });
});

// Extends "[happy-6]": an explicitly undefined installation_id is the same as
// no installation_id.
test("[happy-6] a request with installation_id undefined yields a null id", () => {
  assert.deepEqual(
    githubSetupCallbackSchema.parse({
      installation_id: undefined,
      setup_action: "request",
      state: "s1",
    }),
    { installationId: null, setupAction: "request", state: "s1" },
  );
});

// Extends "[boundary-3] a request that does carry an id still yields a null id".
test("[boundary-3] a request carrying the smallest or any other id still yields a null id", () => {
  for (const installation_id of ["1", "7", "123456789"]) {
    assert.deepEqual(
      githubSetupCallbackSchema.parse({
        installation_id,
        setup_action: "request",
        state: "s2",
      }),
      { installationId: null, setupAction: "request", state: "s2" },
      installation_id,
    );
  }
});

// Extends "[unhappy-5] an install or update without an id is refused": an
// explicitly undefined id is still missing, whatever the state.
test("[unhappy-5] install or update with installation_id undefined is refused with the callback message", () => {
  for (const action of ["install", "update"] as const) {
    assertFailsAt(
      githubSetupCallbackSchema.safeParse({
        installation_id: undefined,
        setup_action: action,
        state: "another-state",
      }),
      ["installation_id"],
      CALLBACK_ID_MESSAGE,
      action,
    );
  }
});

// Extends "[unhappy-5] an update without an id is refused even with other
// query parameters": an install with GitHub's other parameters, including a
// camelCase installationId that must not stand in for installation_id.
test("[unhappy-5] an install whose id is only under another key is refused with the callback message", () => {
  for (const extra of [
    { installationId: "42" },
    { installationId: 42 },
    { id: "42" },
    { code: "abc" },
  ]) {
    assertFailsAt(
      githubSetupCallbackSchema.safeParse({
        setup_action: "install",
        state: "s1",
        ...extra,
      }),
      ["installation_id"],
      CALLBACK_ID_MESSAGE,
      JSON.stringify(extra),
    );
  }
});

// Extends "[unhappy-6] a malformed callback is refused": the installation id
// is GitHub id text, so non-canonical ids are refused with the id message.
test("[unhappy-6] a non-canonical installation id on an install or update is refused with the id message", () => {
  for (const action of ["install", "update"] as const) {
    for (const installation_id of [
      "0",
      "0123",
      "-1",
      "+1",
      "1.5",
      "1e3",
      " 42",
      "42 ",
      "abc",
      "9007199254740992",
      "10000000000000000",
    ]) {
      assertFailsWithMessage(
        githubSetupCallbackSchema.safeParse({
          installation_id,
          setup_action: action,
          state: "s1",
        }),
        ID_MESSAGE,
        `${action} ${JSON.stringify(installation_id)}`,
      );
    }
  }
});

// Extends "[unhappy-6] an empty state or a zero installation id is refused".
test("[unhappy-6] an empty installation id, a non-string state or a missing state is refused", () => {
  for (const query of [
    { installation_id: "", setup_action: "install", state: "s1" },
    { installation_id: "42", setup_action: "update", state: "" },
    { installation_id: "42", setup_action: "update" },
    { installation_id: "42", setup_action: "install", state: 1 },
    { installation_id: "42", setup_action: "install", state: null },
    { setup_action: "request", state: "" },
    { setup_action: "request" },
    { installation_id: "42", setup_action: null, state: "s1" },
    { installation_id: 7, setup_action: "update", state: "s1" },
    { installation_id: ["42"], setup_action: "install", state: "s1" },
  ]) {
    assert.equal(
      githubSetupCallbackSchema.safeParse(query).success,
      false,
      JSON.stringify(query),
    );
  }
});

// Extends "[unhappy-6] a malformed callback is refused": an absent state is
// refused at its own key.
test("[unhappy-6] a request without a state is refused at state", () => {
  assertFailsAt(
    githubSetupCallbackSchema.safeParse({ setup_action: "request" }),
    ["state"],
  );
});

// Extends "[happy-7] extra query parameters are dropped": several extras and
// GitHub's own snake_case keys never reach the output.
test("[happy-7] the output has exactly the three camelCase keys, with no snake_case keys left", () => {
  const parsed = githubSetupCallbackSchema.parse({
    installation_id: "42",
    setup_action: "update",
    state: "s1",
    code: "abc",
    installationId: "99",
    extra: { nested: true },
  });
  assert.deepEqual(parsed, { installationId: 42, setupAction: "update", state: "s1" });
  assert.deepEqual(Object.keys(parsed).sort(), [
    "installationId",
    "setupAction",
    "state",
  ]);
});

// Extends "[happy-7] extra query parameters on a request are dropped too": a
// request carrying an id and extras.
test("[happy-7] a request carrying an id and extras yields exactly the three keys", () => {
  const parsed = githubSetupCallbackSchema.parse({
    installation_id: "42",
    setup_action: "request",
    state: "s1",
    code: "abc",
    setup_action_extra: "x",
  });
  assert.deepEqual(parsed, { installationId: null, setupAction: "request", state: "s1" });
  assert.deepEqual(Object.keys(parsed).sort(), [
    "installationId",
    "setupAction",
    "state",
  ]);
});
