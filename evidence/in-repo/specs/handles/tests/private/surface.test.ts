import assert from "node:assert/strict";
import { test } from "node:test";

import * as handleModule from "../../src/handle.js";
import {
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  checkHandle,
  isValidHandle,
  normalizeHandle,
} from "../../src/handle.js";
import * as root from "../../src/index.js";

const LENGTH_REASON = "Handle must be between 3 and 30 characters.";

type RootHandleApi = {
  HANDLE_MIN_LENGTH: number;
  HANDLE_MAX_LENGTH: number;
  checkHandle: (handle: string) => unknown;
  normalizeHandle: (raw: string) => unknown;
  isValidHandle: (raw: string) => boolean;
  toHandleCase: (raw: string) => string;
  toHandleStem: (text: string) => string;
  handleStemFromEmail: (email: string) => string;
};

function fromRoot(): RootHandleApi {
  return root as unknown as RootHandleApi;
}

// Extends "[happy-1] HANDLE_MIN_LENGTH is 3 and HANDLE_MAX_LENGTH is 30":
// the constants are the limits checkHandle actually enforces.
test("[happy-1] the constants are 3 and 30 and are exactly the limits checkHandle enforces", () => {
  assert.equal(HANDLE_MIN_LENGTH, 3);
  assert.equal(HANDLE_MAX_LENGTH, 30);
  assert.deepEqual(checkHandle("a".repeat(HANDLE_MIN_LENGTH)), { status: "ok" });
  assert.deepEqual(checkHandle("a".repeat(HANDLE_MAX_LENGTH)), { status: "ok" });
  assert.equal(checkHandle("a".repeat(HANDLE_MIN_LENGTH - 1)).status, "invalid");
  assert.equal(checkHandle("a".repeat(HANDLE_MAX_LENGTH + 1)).status, "invalid");
});

// Extends "[happy-1] the constants are plain numbers ...": the length reason
// names the same numbers as the constants.
test("[happy-1] the length reason names the constant values", () => {
  const result = checkHandle("a".repeat(HANDLE_MAX_LENGTH + 1));
  assert.ok(result.status === "invalid");
  assert.equal(
    result.reason,
    `Handle must be between ${HANDLE_MIN_LENGTH} and ${HANDLE_MAX_LENGTH} characters.`,
  );
  assert.equal(result.reason, LENGTH_REASON);
});

// Extends "[happy-2] the handle exports are the same values from the package
// root": the root functions behave as the handle functions on other inputs.
test("[happy-2] the root exports behave like the handle.ts exports on fresh inputs", () => {
  const api = fromRoot();
  assert.equal(api.HANDLE_MIN_LENGTH, 3);
  assert.equal(api.HANDLE_MAX_LENGTH, 30);
  assert.equal(api.toHandleCase("  ROOT_Handle "), "root_handle");
  assert.deepEqual(api.checkHandle("org-24"), { status: "ok" });
  assert.deepEqual(api.normalizeHandle(" Org_24 "), {
    status: "ok",
    handle: "org_24",
    display: "Org_24",
  });
  assert.equal(api.isValidHandle("x"), false);
  assert.equal(api.toHandleStem("Acme Holdings Ltd."), "acme-holdings-ltd");
  assert.equal(api.handleStemFromEmail("Ops.Team@acme.test"), "ops-team");
});

// Extends "[happy-2] handle.ts exports exactly the listed values ...": the
// private pattern is not exported from either module, and the existing todo
// exports keep their behaviour next to the new ones.
test("[happy-2] no RegExp is exported and existing todo exports keep their behaviour alongside the handle exports", () => {
  const api = fromRoot();
  assert.equal(api.checkHandle, handleModule.checkHandle);
  assert.equal(api.handleStemFromEmail, handleModule.handleStemFromEmail);

  for (const value of Object.values(handleModule)) {
    assert.equal(value instanceof RegExp, false, "the pattern is private");
  }
  for (const value of Object.values(root)) {
    assert.equal(value instanceof RegExp, false, "the pattern is private");
  }

  assert.equal(root.TITLE_MAX_LENGTH, 200);
  assert.deepEqual([...root.TODO_FILTERS], ["all", "active", "completed"]);
  assert.throws(() => root.normalizeTitle("   "), root.InvalidTitleError);
  assert.equal(root.isValidTitle("x".repeat(201)), false);
  assert.deepEqual(root.countTodos([]), { total: 0, active: 0, completed: 0 });
  assert.equal(isValidHandle("dana"), true);
  assert.equal(normalizeHandle("dana").status, "ok");
});
