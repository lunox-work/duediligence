import assert from "node:assert/strict";
import { test } from "node:test";

import {
  linkInstallationRequestSchema,
  registerRepoRequestSchema,
} from "../src/index.js";

/*
 * Bodies our own clients send: ids are GitHub id text (1 to 19 digits, no
 * leading zero), kept as strings, and unknown keys are stripped.
 */

const samePath = (path: readonly PropertyKey[], expected: readonly string[]) =>
  JSON.stringify(path) === JSON.stringify(expected);

test("[happy-4] a canonical id is accepted and kept as a string", () => {
  for (const id of [
    "1",
    "123456789",
    "9007199254740991",
    "9007199254740992",
    "9999999999999999999",
  ]) {
    const result = registerRepoRequestSchema.safeParse({
      externalId: id,
      role: "source",
    });
    assert.equal(result.success, true, id);
    assert.equal(result.data?.externalId, id);
    assert.equal(typeof result.data?.externalId, "string");
  }
});

test("[happy-4] zeros after the first digit and the smallest nineteen-digit id are accepted", () => {
  for (const id of ["10", "100", "1000000000000000000", "9007199254740993"]) {
    const parsed = registerRepoRequestSchema.parse({
      externalId: id,
      role: "source",
    });
    assert.equal(parsed.externalId, id);
  }
});

test("[boundary-1] a twenty-digit id is refused", () => {
  const result = registerRepoRequestSchema.safeParse({
    externalId: "10000000000000000000",
    role: "source",
  });
  assert.equal(result.success, false);
  assert.ok(
    result.error?.issues.some(
      (issue) =>
        issue.message === "Expected a GitHub id." &&
        samePath(issue.path, ["externalId"]),
    ),
  );
});

test("[boundary-1] the largest twenty-digit id is refused like the smallest", () => {
  const result = registerRepoRequestSchema.safeParse({
    externalId: "99999999999999999999",
    role: "source",
  });
  assert.equal(result.success, false);
  assert.ok(
    result.error?.issues.some(
      (issue) =>
        issue.message === "Expected a GitHub id." &&
        samePath(issue.path, ["externalId"]),
    ),
  );
});

test("[unhappy-3] a non-canonical id is refused rather than normalised", () => {
  for (const id of ["", "0", "0123", "-1", "+1", "1.5", "1e3", " 12", "abc"]) {
    const result = registerRepoRequestSchema.safeParse({
      externalId: id,
      role: "source",
    });
    assert.equal(result.success, false, JSON.stringify(id));
    assert.ok(
      result.error?.issues.some(
        (issue) =>
          issue.message === "Expected a GitHub id." &&
          samePath(issue.path, ["externalId"]),
      ),
      JSON.stringify(id),
    );
  }
});

test("[unhappy-3] trailing whitespace and a trailing newline are refused, not trimmed", () => {
  for (const id of ["12 ", "12\n", "00"]) {
    const result = registerRepoRequestSchema.safeParse({
      externalId: id,
      role: "source",
    });
    assert.equal(result.success, false, JSON.stringify(id));
    assert.ok(
      result.error?.issues.some(
        (issue) =>
          issue.message === "Expected a GitHub id." &&
          samePath(issue.path, ["externalId"]),
      ),
      JSON.stringify(id),
    );
  }
});

test("[unhappy-4] a numeric externalId is refused, not coerced", () => {
  const result = registerRepoRequestSchema.safeParse({
    externalId: 123,
    role: "source",
  });
  assert.equal(result.success, false);
  assert.ok(
    result.error?.issues.some((issue) => samePath(issue.path, ["externalId"])),
  );
});

test("[unhappy-4] a missing or null externalId is refused at its path", () => {
  for (const body of [{ role: "source" }, { externalId: null, role: "source" }]) {
    const result = registerRepoRequestSchema.safeParse(body);
    assert.equal(result.success, false);
    assert.ok(
      result.error?.issues.some((issue) =>
        samePath(issue.path, ["externalId"]),
      ),
    );
  }
});

test("[happy-5] the link body takes GitHub's installation id as text", () => {
  assert.deepEqual(linkInstallationRequestSchema.parse({ installationId: "42" }), {
    installationId: "42",
  });
});

test("[happy-5] the link body takes a nineteen-digit id and strips unknown keys", () => {
  assert.deepEqual(
    linkInstallationRequestSchema.parse({
      installationId: "9999999999999999999",
      accountLogin: "octo-org",
    }),
    { installationId: "9999999999999999999" },
  );
});

test("[unhappy-5] the link body refuses an id that is not GitHub id text", () => {
  for (const installationId of [42, "0", "042", ""]) {
    const result = linkInstallationRequestSchema.safeParse({ installationId });
    assert.equal(result.success, false, JSON.stringify(installationId));
    assert.ok(
      result.error?.issues.some((issue) =>
        samePath(issue.path, ["installationId"]),
      ),
    );
  }
});

test("[unhappy-5] the link body refuses a twenty-digit id with the GitHub id message", () => {
  const result = linkInstallationRequestSchema.safeParse({
    installationId: "10000000000000000000",
  });
  assert.equal(result.success, false);
  assert.ok(
    result.error?.issues.some(
      (issue) =>
        issue.message === "Expected a GitHub id." &&
        samePath(issue.path, ["installationId"]),
    ),
  );
});

test("[happy-17] a register body parses unchanged", () => {
  assert.deepEqual(
    registerRepoRequestSchema.parse({ externalId: "7", role: "source" }),
    { externalId: "7", role: "source" },
  );
});

test("[happy-17] a register body with an id beyond the safe integers parses to the same text", () => {
  // Never round-tripped through a number, so no digit is lost.
  assert.deepEqual(
    registerRepoRequestSchema.parse({
      externalId: "9999999999999999999",
      role: "source",
    }),
    { externalId: "9999999999999999999", role: "source" },
  );
});

test("[happy-18] unknown keys in a register body are stripped", () => {
  const parsed = registerRepoRequestSchema.parse({
    externalId: "7",
    role: "source",
    fullName: "octo/hello",
    connectionId: "ghc_1",
  });
  assert.deepEqual(parsed, { externalId: "7", role: "source" });
  assert.deepEqual(Object.keys(parsed).sort(), ["externalId", "role"]);
});

test("[happy-18] a stripped key is not validated, whatever its value", () => {
  assert.deepEqual(
    registerRepoRequestSchema.parse({
      externalId: "7",
      role: "source",
      fullName: 123,
      connectionId: null,
    }),
    { externalId: "7", role: "source" },
  );
});

test("[unhappy-12] a register body without a valid role is refused", () => {
  for (const body of [
    { externalId: "7" },
    { externalId: "7", role: "sandbox" },
  ]) {
    const result = registerRepoRequestSchema.safeParse(body);
    assert.equal(result.success, false);
    assert.ok(
      result.error?.issues.some((issue) => samePath(issue.path, ["role"])),
    );
  }
});

test("[unhappy-12] a register body with the role in another casing or empty is refused", () => {
  for (const role of ["Source", "", null]) {
    const result = registerRepoRequestSchema.safeParse({ externalId: "7", role });
    assert.equal(result.success, false, JSON.stringify(role));
    assert.ok(
      result.error?.issues.some((issue) => samePath(issue.path, ["role"])),
    );
  }
});
