import assert from "node:assert/strict";
import { test } from "node:test";

import {
  githubConnectionDtoSchema,
  githubGrantDtoSchema,
  githubInstallationRepositoryDtoSchema,
  githubRepoDtoSchema,
} from "../src/index.js";

/*
 * The DTOs we produce are strict: every field required, unknown keys refused,
 * and their strings carry no format or length check.
 */

const connection = {
  id: "ghc_1",
  installationId: "42",
  accountLogin: "octo-org",
  accountType: "Organization",
  repositorySelection: "selected",
  healthy: true,
  suspendedAt: null,
  uninstalledAt: null,
  settingsUrl:
    "https://github.com/organizations/octo-org/settings/installations/42",
  createdAt: "2026-11-01T00:00:00.000Z",
};

const installationRepository = {
  externalId: "7",
  fullName: "octo/hello",
  defaultBranch: "main",
  isPrivate: true,
  registeredId: null,
};

const repo = {
  id: "ghr_1",
  connectionId: "ghc_1",
  role: "source",
  externalId: "7",
  fullName: "Octo/Hello",
  defaultBranch: "main",
  isPrivate: true,
  sizeKb: null,
  headSha: null,
  pushedAt: null,
  lastSyncedAt: null,
  syncStatus: "pending",
  syncError: null,
  createdAt: "2026-11-01T00:00:00.000Z",
};

const without = (value: Record<string, unknown>, key: string) => {
  const copy = { ...value };
  delete copy[key];
  return copy;
};

test("[happy-13] a complete connection DTO round-trips", () => {
  assert.deepEqual(githubConnectionDtoSchema.parse(connection), connection);
});

test("[happy-13] a connection DTO with suspension and uninstall times round-trips", () => {
  const suspended = {
    ...connection,
    healthy: false,
    suspendedAt: "2026-11-02T00:00:00.000Z",
    uninstalledAt: "2026-11-03T00:00:00.000Z",
  };
  assert.deepEqual(githubConnectionDtoSchema.parse(suspended), suspended);
});

test("[unhappy-9] a connection DTO missing or mistyping a field is refused", () => {
  const changed = [
    ...[
      "id",
      "installationId",
      "accountLogin",
      "accountType",
      "repositorySelection",
      "healthy",
      "suspendedAt",
      "uninstalledAt",
      "settingsUrl",
      "createdAt",
    ].map((key) => without(connection, key)),
    { ...connection, installationId: 42 },
    { ...connection, healthy: null },
  ];
  for (const dto of changed) {
    assert.equal(
      githubConnectionDtoSchema.safeParse(dto).success,
      false,
      JSON.stringify(dto),
    );
  }
});

test("[unhappy-9] a nullable connection field set to undefined is refused, since nullable is not optional", () => {
  for (const key of ["suspendedAt", "uninstalledAt"]) {
    assert.equal(
      githubConnectionDtoSchema.safeParse({ ...connection, [key]: undefined })
        .success,
      false,
      key,
    );
  }
});

test("[boundary-4] DTO strings carry no format or length check", () => {
  const parsed = githubConnectionDtoSchema.parse({
    ...connection,
    id: "",
    createdAt: "yesterday",
  });

  assert.equal(parsed.id, "");
  assert.equal(parsed.createdAt, "yesterday");
});

test("[boundary-4] DTO id and URL fields are plain strings, not GitHub id text", () => {
  const odd = {
    ...connection,
    installationId: "0123",
    settingsUrl: "not a url",
    accountLogin: "",
  };
  assert.deepEqual(githubConnectionDtoSchema.parse(odd), odd);

  const repoOdd = { ...repo, externalId: "abc", defaultBranch: "" };
  assert.deepEqual(githubRepoDtoSchema.parse(repoOdd), repoOdd);
});

test("[unhappy-10] an unknown key on a DTO is refused", () => {
  const result = githubConnectionDtoSchema.safeParse({
    ...connection,
    token: "secret",
  });
  assert.equal(result.success, false);
  assert.ok(
    result.error?.issues.some(
      (issue) => issue.message === 'Unrecognized key: "token"',
    ),
  );
});

test("[unhappy-10] an unknown key on the repo DTO is refused with its own name", () => {
  const result = githubRepoDtoSchema.safeParse({ ...repo, contents: "" });
  assert.equal(result.success, false);
  assert.ok(
    result.error?.issues.some(
      (issue) => issue.message === 'Unrecognized key: "contents"',
    ),
  );
});

test("[happy-14] a complete installation repository DTO round-trips", () => {
  assert.deepEqual(
    githubInstallationRepositoryDtoSchema.parse(installationRepository),
    installationRepository,
  );
});

test("[happy-14] a registered, public installation repository DTO round-trips", () => {
  const registered = {
    ...installationRepository,
    isPrivate: false,
    registeredId: "ghr_1",
  };
  assert.deepEqual(
    githubInstallationRepositoryDtoSchema.parse(registered),
    registered,
  );
});

test("[happy-15] a complete registered repository DTO round-trips", () => {
  assert.deepEqual(githubRepoDtoSchema.parse(repo), repo);
});

test("[happy-15] a synced repository DTO with every nullable field filled round-trips", () => {
  const synced = {
    ...repo,
    isPrivate: false,
    sizeKb: 0,
    headSha: "0123456789abcdef0123456789abcdef01234567",
    pushedAt: "2026-11-01T00:00:00.000Z",
    lastSyncedAt: "2026-11-02T00:00:00.000Z",
    syncStatus: "gone",
    syncError: "Not Found",
  };
  assert.deepEqual(githubRepoDtoSchema.parse(synced), synced);
});

test("[happy-16] the grant DTO carries the login and health, never tokens", () => {
  assert.deepEqual(
    githubGrantDtoSchema.parse({ githubLogin: "octocat", healthy: true }),
    { githubLogin: "octocat", healthy: true },
  );
  assert.equal(
    githubGrantDtoSchema.safeParse({
      githubLogin: "octocat",
      healthy: true,
      accessToken: "t",
    }).success,
    false,
  );
});

test("[happy-16] an unhealthy grant parses, and a refresh token is refused like an access token", () => {
  assert.deepEqual(
    githubGrantDtoSchema.parse({ githubLogin: "octocat", healthy: false }),
    { githubLogin: "octocat", healthy: false },
  );
  assert.equal(
    githubGrantDtoSchema.safeParse({
      githubLogin: "octocat",
      healthy: false,
      refreshToken: "r",
    }).success,
    false,
  );
});

test("[unhappy-11] a repository DTO with a bad field is refused", () => {
  const installationCases = [
    { ...installationRepository, externalId: 7 },
    without(installationRepository, "isPrivate"),
    without(installationRepository, "registeredId"),
    { ...installationRepository, archived: false },
  ];
  for (const dto of installationCases) {
    assert.equal(
      githubInstallationRepositoryDtoSchema.safeParse(dto).success,
      false,
      JSON.stringify(dto),
    );
  }

  const repoCases = [
    { ...repo, externalId: 7 },
    { ...repo, connectionId: 42 },
    { ...repo, role: "sandbox" },
    { ...repo, syncStatus: "stale" },
    without(repo, "headSha"),
    without(repo, "defaultBranch"),
  ];
  for (const dto of repoCases) {
    assert.equal(
      githubRepoDtoSchema.safeParse(dto).success,
      false,
      JSON.stringify(dto),
    );
  }
});

test("[unhappy-11] a repo DTO with a textual size or another casing of a status is refused", () => {
  for (const dto of [
    { ...repo, sizeKb: "12" },
    { ...repo, syncStatus: "OK" },
    { ...repo, role: "Source" },
  ]) {
    assert.equal(
      githubRepoDtoSchema.safeParse(dto).success,
      false,
      JSON.stringify(dto),
    );
  }
});
