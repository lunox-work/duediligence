import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  JiraConnectionInput,
  JiraConnectionStore,
  JiraConnectionSummary,
  OrganizationStore,
} from "@sandbox-factory/db";

import type { Auth } from "../../src/auth.js";
import { signState } from "../../src/jira/state.js";
import { createApp, type AppOptions } from "../../src/routes.js";
import { createInMemoryStore } from "../../src/store.js";

/**
 * Hidden suite: the Jira OAuth callback re-checks membership, for the
 * organization named in the verified state, before it spends the code.
 */

const dana = { id: "user_1", email: "dana@example.test", name: "Dana" };
const eve = { id: "user_7", email: "eve@example.test", name: "Eve" };

const SECRET = "0123456789abcdef0123456789abcdef";
const OTHER_SECRET = "a-different-secret-that-is-long-enough";
const API_URL = "https://api.test";
const APP_URL = "https://app.test";
/** A fixed clock, shared by the signed states and the routes. */
const NOW = Date.UTC(2026, 10, 4, 12, 0, 0);
const TEN_MINUTES = 10 * 60 * 1000;
const FULL_SCOPE =
  "read:jira-work read:jira-user read:board-scope:jira-software read:sprint:jira-software offline_access";

const signedIn = { cookie: "session=1" };

const CONNECTED = "https://app.test/settings/jira?jira=connected";
const FORBIDDEN = "https://app.test/settings/jira?jira=forbidden";

function fakeAuth(user = dana): Auth {
  return {
    api: {
      getSession: ({ headers }: { headers: Headers }) =>
        Promise.resolve(
          headers.get("cookie") !== null
            ? { user, session: { id: `session_${user.id}` } }
            : null,
        ),
    },
    handler: () => Promise.resolve(new Response(null, { status: 404 })),
  } as unknown as Auth;
}

/** Role per `${userId}:${organizationId}`; absent means not a member. */
type RoleTable = Map<string, string>;
type Calls = Array<[string, string]>;

function key(userId: string, organizationId: string): string {
  return `${userId}:${organizationId}`;
}

function baseOrganizations(): Omit<OrganizationStore, "roleOf"> {
  return {
    get: (organizationId) =>
      Promise.resolve({ id: organizationId, name: "Acme", slug: "acme" }),
    listForUser: () => Promise.resolve([]),
    listMembers: () => Promise.resolve([]),
    findBySlug: () => Promise.resolve(undefined),
    slugOwner: () => Promise.resolve(undefined),
    pendingFor: () => Promise.resolve([]),
    findUserByHandle: () => Promise.resolve(undefined),
    touch: () => Promise.resolve(),
  };
}

/** An organization store whose roleOf answers from the table and records calls. */
function fakeOrganizations(roles: RoleTable, calls: Calls): OrganizationStore {
  return {
    ...baseOrganizations(),
    roleOf: (userId, organizationId) => {
      calls.push([userId, organizationId]);
      return Promise.resolve(roles.get(key(userId, organizationId)));
    },
  };
}

/** The same store as a class, whose roleOf only works when called as a method. */
class ThisBoundOrganizations implements OrganizationStore {
  readonly #roles: RoleTable;
  readonly #calls: Calls;

  constructor(roles: RoleTable, calls: Calls) {
    this.#roles = roles;
    this.#calls = calls;
  }

  roleOf(userId: string, organizationId: string): Promise<string | undefined> {
    this.#calls.push([userId, organizationId]);
    return Promise.resolve(this.#roles.get(key(userId, organizationId)));
  }
  get(organizationId: string) {
    return Promise.resolve({ id: organizationId, name: "Acme", slug: "acme" });
  }
  listForUser() {
    return Promise.resolve([]);
  }
  listMembers() {
    return Promise.resolve([]);
  }
  findBySlug() {
    return Promise.resolve(undefined);
  }
  slugOwner() {
    return Promise.resolve(undefined);
  }
  pendingFor() {
    return Promise.resolve([]);
  }
  findUserByHandle() {
    return Promise.resolve(undefined);
  }
  touch() {
    return Promise.resolve();
  }
}

/** A plain object whose roleOf delegates to another method through `this`. */
function plainThisOrganizations(roles: RoleTable, calls: Calls): OrganizationStore {
  const store = {
    ...baseOrganizations(),
    table: roles,
    log: calls,
    lookup(userId: string, organizationId: string): string | undefined {
      return this.table.get(key(userId, organizationId));
    },
    roleOf(userId: string, organizationId: string): Promise<string | undefined> {
      this.log.push([userId, organizationId]);
      return Promise.resolve(this.lookup(userId, organizationId));
    },
  };
  return store;
}

function rejectingOrganizations(message: string) {
  return (roles: RoleTable, calls: Calls): OrganizationStore => ({
    ...fakeOrganizations(roles, calls),
    roleOf: (userId, organizationId) => {
      calls.push([userId, organizationId]);
      return Promise.reject(new Error(message));
    },
  });
}

interface Pending {
  userId: string;
  organizationId: string;
  resolve: (role: string | undefined) => void;
}

/** A store whose roleOf answers only when the test says so. */
function gatedOrganizations(pending: Pending[]) {
  return (roles: RoleTable, calls: Calls): OrganizationStore => ({
    ...fakeOrganizations(roles, calls),
    roleOf: (userId, organizationId) => {
      calls.push([userId, organizationId]);
      return new Promise<string | undefined>((resolve) => {
        pending.push({ userId, organizationId, resolve });
      });
    },
  });
}

/** Lets queued work run until `done` holds, without any timer. */
async function settle(done: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !done(); i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

type Upsert = [string, JiraConnectionInput];

/** Records each upsert as [organizationId, input]. */
function fakeConnections(onUpsert?: (count: number) => void): JiraConnectionStore & {
  upserts: Upsert[];
} {
  const upserts: Upsert[] = [];
  const summary: JiraConnectionSummary = {
    id: "jrc_1",
    cloudId: "cloud-1",
    siteUrl: "https://acme.atlassian.net",
    siteName: "Acme",
    email: null,
    healthy: true,
    scopes: ["read:jira-work"],
    createdAt: "2026-09-21T00:00:00.000Z",
  };
  return {
    upserts,
    list: () => Promise.resolve([summary]),
    get: () => Promise.resolve(summary),
    upsert: (organizationId, input) => {
      upserts.push([organizationId, input]);
      onUpsert?.(upserts.length);
      return Promise.resolve(summary);
    },
    tokens: () => Promise.resolve(null),
    saveTokens: () => Promise.resolve(),
    markUnhealthy: () => Promise.resolve(),
    remove: (_organizationId, id) => Promise.resolve(id === "jrc_1"),
  };
}

function site(cloudId: string) {
  return {
    id: cloudId,
    url: `https://${cloudId}.atlassian.net`,
    name: `Site ${cloudId}`,
    scopes: ["read:jira-work"],
  };
}

/** Atlassian, faked: records each request it receives. */
function fakeAtlassian(
  requests: string[],
  options: {
    sites?: string[];
    scope?: string;
    tokenStatus?: number;
    onToken?: () => void;
    onSites?: () => void;
  },
): typeof globalThis.fetch {
  return (async (url: string | URL | Request) => {
    const href = url instanceof Request ? url.url : String(url);
    requests.push(href);
    if (href.endsWith("/accessible-resources")) {
      options.onSites?.();
      return new Response(
        JSON.stringify((options.sites ?? ["cloud-1"]).map(site)),
        { status: 200 },
      );
    }
    if (href.endsWith("/oauth/token")) {
      options.onToken?.();
      if (options.tokenStatus !== undefined) {
        return new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: "Code already used",
          }),
          { status: options.tokenStatus },
        );
      }
      return new Response(
        JSON.stringify({
          access_token: "access-1",
          refresh_token: "refresh-1",
          expires_in: 3600,
          scope: options.scope ?? FULL_SCOPE,
        }),
        { status: 200 },
      );
    }
    throw new Error(`unexpected request to ${href}`);
  }) as typeof globalThis.fetch;
}

interface Built {
  app: ReturnType<typeof createApp>;
  roles: RoleTable;
  roleOfCalls: Calls;
  requests: string[];
  connections: ReturnType<typeof fakeConnections>;
}

function build(
  options: {
    user?: typeof dana;
    roles?: Record<string, string>;
    organizations?: (roles: RoleTable, calls: Calls) => OrganizationStore;
    withoutOrganizations?: boolean;
    withoutJira?: boolean;
    sites?: string[];
    scope?: string;
    tokenStatus?: number;
    onToken?: (roles: RoleTable) => void;
    onSites?: (roles: RoleTable) => void;
    onUpsert?: (roles: RoleTable, count: number) => void;
    extraJira?: Record<string, unknown>;
  } = {},
): Built {
  const roles: RoleTable = new Map(Object.entries(options.roles ?? {}));
  const roleOfCalls: Calls = [];
  const requests: string[] = [];
  const connections = fakeConnections(
    options.onUpsert === undefined
      ? undefined
      : (count) => options.onUpsert?.(roles, count),
  );
  const organizations = (options.organizations ?? fakeOrganizations)(
    roles,
    roleOfCalls,
  );
  const jira = {
    connections,
    clientId: "jira-client-id",
    clientSecret: "jira-client-secret",
    secret: SECRET,
    apiUrl: API_URL,
    appUrl: APP_URL,
    now: () => NOW,
    fetch: fakeAtlassian(requests, {
      ...(options.sites === undefined ? {} : { sites: options.sites }),
      ...(options.scope === undefined ? {} : { scope: options.scope }),
      ...(options.tokenStatus === undefined
        ? {}
        : { tokenStatus: options.tokenStatus }),
      ...(options.onToken === undefined
        ? {}
        : { onToken: () => options.onToken?.(roles) }),
      ...(options.onSites === undefined
        ? {}
        : { onSites: () => options.onSites?.(roles) }),
    }),
    ...(options.extraJira ?? {}),
  } as AppOptions["jira"];
  const app = createApp({
    store: createInMemoryStore(),
    corsOrigins: [APP_URL],
    auth: fakeAuth(options.user ?? dana),
    ...(options.withoutOrganizations === true ? {} : { organizations }),
    ...(options.withoutJira === true ? {} : { jira }),
  });
  return { app, roles, roleOfCalls, requests, connections };
}

function stateFor(
  organizationId: string,
  overrides: {
    userId?: string;
    returnTo?: string;
    secret?: string;
    issuedAt?: number;
  } = {},
): string {
  return signState(overrides.secret ?? SECRET, {
    organizationId,
    userId: overrides.userId ?? dana.id,
    returnTo: overrides.returnTo ?? "/settings/jira",
    issuedAt: overrides.issuedAt ?? NOW,
    nonce: "fixed-nonce",
  });
}

function callback(app: Built["app"], query: string, signed = true) {
  return app.request(
    `/api/v1/jira/callback?${query}`,
    signed ? { headers: signedIn } : {},
  );
}

function q(state: string): string {
  return encodeURIComponent(state);
}

function locationOf(response: Response): URL {
  return new URL(response.headers.get("location") ?? "");
}

function jiraParam(response: Response): string | null {
  return locationOf(response).searchParams.get("jira");
}

function sortedCalls(calls: Calls): Calls {
  return [...calls].sort((a, b) =>
    `${a[0]}:${a[1]}`.localeCompare(`${b[0]}:${b[1]}`),
  );
}

/** What an upsert carries for a site listed by the fake Atlassian. */
function expectedInput(cloudId: string, scope = FULL_SCOPE): JiraConnectionInput {
  return {
    cloudId,
    siteUrl: `https://${cloudId}.atlassian.net`,
    siteName: `Site ${cloudId}`,
    accessToken: "access-1",
    refreshToken: "refresh-1",
    expiresAt: new Date(NOW + 3600 * 1000).toISOString(),
    scopes: scope.split(" "),
  };
}

// ---------------------------------------------------------------------------
// [happy-1] The callback asks the organization store about the state's
// organization
// ---------------------------------------------------------------------------

// Extends "[happy-1] the callback asks the organization store about the
// state's organization": another session user and another organization id.
test("[happy-1] the store is asked about the session user, whoever that is, and the state's organization", async () => {
  const built = build({ user: eve, roles: { "user_7:org_42": "owner" } });

  const response = await callback(
    built.app,
    `code=code-9&state=${q(stateFor("org_42", { userId: eve.id }))}`,
  );

  assert.deepEqual(built.roleOfCalls, [["user_7", "org_42"]]);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), CONNECTED);
  assert.deepEqual(
    built.connections.upserts.map(([organizationId]) => organizationId),
    ["org_42"],
  );
});

// Extends "[happy-1] a state for another organization is checked against
// that organization": a connected outcome after the re-check still uses the
// signed returnTo.
test("[happy-1] after the re-check passes, the connected redirect honours the signed returnTo", async () => {
  const built = build({ roles: { "user_1:org_1": "owner" } });

  const response = await callback(
    built.app,
    `code=c&state=${q(stateFor("org_1", { returnTo: "/orgs/beta/jira" }))}`,
  );

  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.equal(
    response.headers.get("location"),
    "https://app.test/orgs/beta/jira?jira=connected",
  );
});

test("[happy-1] an owner whose grant lists no Jira site is asked about once and gets no-sites", async () => {
  const built = build({ roles: { "user_1:org_1": "owner" }, sites: [] });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.equal(jiraParam(response), "no-sites");
  assert.equal(built.connections.upserts.length, 0);
});

test("[happy-1] an owner whose code Atlassian refuses is asked about once and gets denied", async () => {
  const built = build({ roles: { "user_1:org_1": "admin" }, tokenStatus: 400 });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.equal(jiraParam(response), "denied");
  assert.equal(built.connections.upserts.length, 0);
});

// ---------------------------------------------------------------------------
// [happy-2] The organization id comes from the state even when the query
// names another
// ---------------------------------------------------------------------------

// Extends "[happy-2] being an owner of the organization named in the query
// does not pass the check": the query names a real organization the caller
// owns, under every name an implementation might read.
test("[happy-2] owning the organization every query parameter names does not pass a check for the state's", async () => {
  const built = build({ roles: { "user_1:org_2": "owner", "user_1:org_1": "member" } });

  const response = await callback(
    built.app,
    `orgId=org_2&organizationId=org_2&org=org_2&code=c&state=${q(stateFor("org_1"))}`,
  );

  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.equal(response.headers.get("location"), FORBIDDEN);
  assert.deepEqual(built.requests, []);
  assert.equal(built.connections.upserts.length, 0);
});

// Extends "[happy-2] the organization id comes from the state even when the
// query names another": the state names org_2, the query names org_1.
test("[happy-2] a state for org_2 is checked and stored for org_2 though the query names org_1", async () => {
  const built = build({ roles: { "user_1:org_2": "admin" } });

  const response = await callback(
    built.app,
    `code=c&orgId=org_1&organizationId=org_1&state=${q(stateFor("org_2"))}`,
  );

  assert.deepEqual(built.roleOfCalls, [["user_1", "org_2"]]);
  assert.equal(jiraParam(response), "connected");
  assert.deepEqual(
    built.connections.upserts.map(([organizationId]) => organizationId),
    ["org_2"],
  );
});

// ---------------------------------------------------------------------------
// [boundary-1] A store whose roleOf relies on `this` is called as a method
// ---------------------------------------------------------------------------

// Extends "[boundary-1] a this-bound store refuses a non-member with a
// redirect, not a 500": a demoted member, through a store with private fields.
test("[boundary-1] a this-bound store refuses a demoted member with a forbidden redirect, not a 500", async () => {
  const built = build({
    roles: { "user_1:org_1": "member" },
    organizations: (roles, calls) => new ThisBoundOrganizations(roles, calls),
  });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), FORBIDDEN);
  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.equal(built.connections.upserts.length, 0);
});

// Extends "[boundary-1] a store whose roleOf relies on this is called as a
// method": another role and a returnTo.
test("[boundary-1] a this-bound store passes a multi-role owner who then connects", async () => {
  const built = build({
    roles: { "user_1:org_1": "member, owner" },
    organizations: (roles, calls) => new ThisBoundOrganizations(roles, calls),
  });

  const response = await callback(
    built.app,
    `code=c&state=${q(stateFor("org_1", { returnTo: "/orgs/acme/jira" }))}`,
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://app.test/orgs/acme/jira?jira=connected",
  );
  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.equal(built.connections.upserts.length, 1);
});

test("[boundary-1] a plain object whose roleOf reaches its table through this works for an admin", async () => {
  const built = build({
    roles: { "user_1:org_1": "admin" },
    organizations: plainThisOrganizations,
  });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.notEqual(response.status, 500);
  assert.equal(response.status, 302);
  assert.equal(jiraParam(response), "connected");
  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
});

// ---------------------------------------------------------------------------
// [boundary-2] A roleOf on the jira options is ignored in favour of the store's
// ---------------------------------------------------------------------------

// Extends "[boundary-2] a roleOf on the jira options is ignored in favour of
// the store's": the store holds a demoted member rather than nothing.
test("[boundary-2] a smuggled roleOf answering owner does not rescue a member the store demoted", async () => {
  const smuggled: Calls = [];
  const built = build({
    roles: { "user_1:org_1": "member" },
    extraJira: {
      roleOf: (userId: string, organizationId: string) => {
        smuggled.push([userId, organizationId]);
        return Promise.resolve("owner");
      },
    },
  });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.deepEqual(smuggled, []);
  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.equal(response.headers.get("location"), FORBIDDEN);
  assert.deepEqual(built.requests, []);
  assert.equal(built.connections.upserts.length, 0);
});

// Extends "[boundary-2] a smuggled roleOf refusing everyone does not stop a
// store-approved owner": a smuggled roleOf that would blow up if called.
test("[boundary-2] a smuggled roleOf that throws is never called, and a store-approved admin connects", async () => {
  let smuggledCalls = 0;
  const built = build({
    roles: { "user_1:org_1": "admin" },
    extraJira: {
      roleOf: () => {
        smuggledCalls++;
        throw new Error("smuggled roleOf was called");
      },
    },
  });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.equal(smuggledCalls, 0);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), CONNECTED);
  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
});

// ---------------------------------------------------------------------------
// [happy-3] A role that still allows connecting finishes the flow
// ---------------------------------------------------------------------------

// Extends "[happy-3] role ... still allows connecting and finishes the flow":
// more spellings that the split-trim-exact rule accepts, including entries
// named after Object.prototype members, which a rank lookup mishandles.
for (const role of [
  "owner,member",
  " admin ",
  "billing,owner",
  "member , admin",
  "admin,",
  ",owner",
  "member,member,owner",
  "\towner\t",
  "toString,admin",
  "constructor, owner",
]) {
  test(`[happy-3] role ${JSON.stringify(role)} has an owner or admin entry and connects with the full input`, async () => {
    const built = build({ roles: { "user_1:org_1": role } });

    const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), CONNECTED);
    assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
    assert.deepEqual(built.connections.upserts, [["org_1", expectedInput("cloud-1")]]);
  });
}

// ---------------------------------------------------------------------------
// [unhappy-1] Removed from the organization after starting the flow
// ---------------------------------------------------------------------------

// Extends "[unhappy-1] another user's ownership of the organization does not
// count for the session user": a different session user, while user_1 still
// owns the organization.
test("[unhappy-1] a removed session user is refused though someone else still owns the organization", async () => {
  const built = build({
    user: eve,
    roles: { "user_1:org_1": "owner", "user_7:org_2": "owner" },
  });

  const response = await callback(
    built.app,
    `code=c&state=${q(stateFor("org_1", { userId: eve.id }))}`,
  );

  assert.deepEqual(built.roleOfCalls, [["user_7", "org_1"]]);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), FORBIDDEN);
  assert.deepEqual(built.requests, []);
  assert.equal(built.connections.upserts.length, 0);
});

// Extends "[unhappy-1] removed from the organization after starting the
// flow": the state is nine minutes old, still inside the window.
test("[unhappy-1] a removed member is refused with a state nine minutes into its window", async () => {
  const built = build();

  const response = await callback(
    built.app,
    `code=c&state=${q(stateFor("org_1", { issuedAt: NOW - 9 * 60 * 1000 }))}`,
  );

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), FORBIDDEN);
  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.deepEqual(built.requests, []);
  assert.equal(built.connections.upserts.length, 0);
});

// ---------------------------------------------------------------------------
// [unhappy-2] The forbidden redirect honours the signed returnTo
// ---------------------------------------------------------------------------

// Extends "[unhappy-2] the forbidden redirect honours the signed returnTo":
// another, deeper path, and a deployment whose grants come back partial.
test("[unhappy-2] the forbidden redirect goes to a deeper signed returnTo and carries no missing parameter", async () => {
  const built = build({ scope: "read:jira-work offline_access" });

  const response = await callback(
    built.app,
    `code=c&state=${q(stateFor("org_1", { returnTo: "/orgs/beta-co/integrations/jira" }))}`,
  );

  const location = locationOf(response);
  assert.equal(location.origin, APP_URL);
  assert.equal(location.pathname, "/orgs/beta-co/integrations/jira");
  assert.equal(location.search, "?jira=forbidden");
  assert.equal(location.searchParams.has("missing"), false);
});

test("[unhappy-2] the forbidden redirect honours a signed returnTo of the root path", async () => {
  const built = build({ roles: { "user_1:org_1": "billing" } });

  const response = await callback(
    built.app,
    `code=c&state=${q(stateFor("org_1", { returnTo: "/" }))}`,
  );

  assert.equal(response.headers.get("location"), "https://app.test/?jira=forbidden");
});

// ---------------------------------------------------------------------------
// [unhappy-3] A member of another organization only cannot complete a flow
// for this one
// ---------------------------------------------------------------------------

// Extends "[unhappy-3] a member of another organization only cannot complete
// a flow for this one": many organizations, some with ids that share org_1's
// prefix.
test("[unhappy-3] owning org_10, org_1x and org_2 does not let a non-member of org_1 connect it", async () => {
  const built = build({
    roles: {
      "user_1:org_10": "owner",
      "user_1:org_1x": "owner",
      "user_1:org_2": "admin",
      "user_1:org_11": "owner",
    },
  });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.equal(response.headers.get("location"), FORBIDDEN);
  assert.deepEqual(built.requests, []);
  assert.equal(built.connections.upserts.length, 0);
});

// Extends "[unhappy-3] an owner of org_1 cannot complete a flow signed for
// org_2": a third organization.
test("[unhappy-3] an owner of org_1 and org_2 cannot complete a flow signed for org_3", async () => {
  const built = build({
    roles: { "user_1:org_1": "owner", "user_1:org_2": "owner" },
  });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_3"))}`);

  assert.deepEqual(built.roleOfCalls, [["user_1", "org_3"]]);
  assert.equal(jiraParam(response), "forbidden");
  assert.equal(built.connections.upserts.length, 0);
});

// ---------------------------------------------------------------------------
// [unhappy-4] A role that does not allow connecting is forbidden
// ---------------------------------------------------------------------------

// Extends "[unhappy-4] role ... does not allow connecting and is forbidden":
// other cases, plurals, prefixes, suffixes and separators other than a comma.
for (const role of [
  "Admin",
  "OWNER",
  " Owner ",
  "owners",
  "admins",
  "co-owner",
  "superadmin",
  "own",
  "adm",
  "owner-admin",
  "owner admin",
  "member;owner",
  "member|admin",
  "member owner",
  '"owner"',
  "member, billing, viewer",
]) {
  test(`[unhappy-4] role ${JSON.stringify(role)} has no entry exactly owner or admin and is forbidden`, async () => {
    const built = build({ roles: { "user_1:org_1": role } });

    const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), FORBIDDEN);
    assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
    assert.deepEqual(built.requests, []);
    assert.equal(built.connections.upserts.length, 0);
  });
}

// ---------------------------------------------------------------------------
// [boundary-3] An empty role string is not a role
// ---------------------------------------------------------------------------

// Extends "[boundary-3] a role of only separators and spaces is not a role":
// whitespace alone, a lone comma, several commas, a tab.
for (const role of ["   ", ",", ",,,", "\t", " ,\t, "]) {
  test(`[boundary-3] role ${JSON.stringify(role)} holds no entry and is forbidden`, async () => {
    const built = build({ roles: { "user_1:org_1": role } });

    const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

    assert.equal(response.headers.get("location"), FORBIDDEN);
    assert.deepEqual(built.requests, []);
    assert.equal(built.connections.upserts.length, 0);
  });
}

test("[boundary-3] an empty role is forbidden even with no code, rather than error", async () => {
  const built = build({ roles: { "user_1:org_1": "" } });

  const response = await callback(built.app, `state=${q(stateFor("org_1"))}`);

  assert.equal(response.headers.get("location"), FORBIDDEN);
  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
});

// ---------------------------------------------------------------------------
// [boundary-4] Atlassian's own refusal is reported without asking the store
// ---------------------------------------------------------------------------

// Extends "[boundary-4] Atlassian's own refusal (access_denied alongside a
// code and a valid state)": a store that would fail if asked.
test("[boundary-4] access_denied with a valid state is cancelled, not a 500, even when the store would reject", async () => {
  const built = build({ organizations: rejectingOrganizations("database is on fire") });

  const response = await callback(
    built.app,
    `error=access_denied&code=c&state=${q(stateFor("org_1"))}`,
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://app.test/settings/jira?jira=cancelled",
  );
  assert.deepEqual(built.roleOfCalls, []);
  assert.deepEqual(built.requests, []);

  // Without the error parameter, the same state does reach the store.
  const asked = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);
  assert.equal(asked.status, 500);
  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
});

// Extends "[boundary-4] Atlassian's own refusal (invalid_scope)": another
// error value, with a valid state for a non-member, which is error and not
// forbidden.
test("[boundary-4] a non-member's server_error with a valid state is error, not forbidden", async () => {
  const built = build();

  const response = await callback(
    built.app,
    `error=server_error&code=c&state=${q(stateFor("org_1", { returnTo: "/orgs/acme/jira" }))}`,
  );

  assert.equal(
    response.headers.get("location"),
    "https://app.test/settings/jira?jira=error",
  );
  assert.deepEqual(built.roleOfCalls, []);
  assert.deepEqual(built.connections.upserts, []);

  // Without the error parameter, the same state is checked and refused.
  const asked = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);
  assert.equal(asked.headers.get("location"), FORBIDDEN);
  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
});

test("[boundary-4] an empty error parameter with a non-member's valid state is error without asking the store", async () => {
  const built = build({ roles: { "user_1:org_1": "member" } });

  const response = await callback(
    built.app,
    `error=&code=c&state=${q(stateFor("org_1"))}`,
  );

  assert.equal(
    response.headers.get("location"),
    "https://app.test/settings/jira?jira=error",
  );
  assert.deepEqual(built.roleOfCalls, []);
  assert.deepEqual(built.requests, []);

  // Without the error parameter, the same state is checked and refused.
  const asked = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);
  assert.equal(asked.headers.get("location"), FORBIDDEN);
  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
});

// ---------------------------------------------------------------------------
// [boundary-5] A refused state is reported without asking the store
// ---------------------------------------------------------------------------

function swapBody(stateWithBody: string, stateWithSignature: string): string {
  const body = stateWithBody.slice(0, stateWithBody.lastIndexOf("."));
  const signature = stateWithSignature.slice(stateWithSignature.lastIndexOf(".") + 1);
  return `${body}.${signature}`;
}

// Extends "[boundary-5] a refused state (...) is reported without asking the
// store": expired, from the future, tampered, garbage, and a state naming a
// user the store would approve.
const moreRefusedStates: Array<[string, () => string]> = [
  ["expired by one millisecond", () => stateFor("org_1", { issuedAt: NOW - TEN_MINUTES - 1 })],
  ["issued more than a minute in the future", () => stateFor("org_1", { issuedAt: NOW + 60_001 })],
  ["a body for org_2 under org_1's signature", () => swapBody(stateFor("org_2"), stateFor("org_1"))],
  ["not a state at all", () => "not-a-state"],
  ["a state for user_2, who owns org_1", () => stateFor("org_1", { userId: "user_2" })],
];

for (const [name, state] of moreRefusedStates) {
  test(`[boundary-5] a refused state (${name}) is reported as state without asking the store`, async () => {
    const built = build({
      roles: { "user_1:org_1": "owner", "user_1:org_2": "owner", "user_2:org_1": "owner" },
    });

    const response = await callback(built.app, `code=c&state=${q(state())}`);

    assert.equal(
      response.headers.get("location"),
      "https://app.test/settings/jira?jira=state",
    );
    assert.deepEqual(built.roleOfCalls, []);
    assert.deepEqual(built.requests, []);
    assert.equal(built.connections.upserts.length, 0);

    // A valid state on the same app is asked about exactly once: the refused
    // one added no lookup of its own.
    const accepted = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);
    assert.equal(accepted.headers.get("location"), CONNECTED);
    assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  });
}

test("[boundary-5] a state signed with another secret is state, not a 500, even when the store would reject", async () => {
  const built = build({ organizations: rejectingOrganizations("database is on fire") });

  const response = await callback(
    built.app,
    `code=c&state=${q(stateFor("org_1", { secret: OTHER_SECRET, returnTo: "/orgs/acme/jira" }))}`,
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://app.test/settings/jira?jira=state",
  );
  assert.deepEqual(built.roleOfCalls, []);

  // A valid state on the same app does reach the store, and fails there.
  const asked = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);
  assert.equal(asked.status, 500);
  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
});

// ---------------------------------------------------------------------------
// [boundary-6] With a valid state and no code, membership decides the
// outcome first
// ---------------------------------------------------------------------------

// Extends "[boundary-6] with a valid state, role ... and code part ...":
// other allowing and refusing roles, both code parts.
const moreMissingCodes: Array<[string, string, string]> = [
  ["admin", "", "error"],
  ["member,admin", "&code=", "error"],
  ["billing", "", "forbidden"],
  ["Owner", "&code=", "forbidden"],
  ["administrator", "", "forbidden"],
];

for (const [role, codePart, outcome] of moreMissingCodes) {
  test(`[boundary-6] role ${JSON.stringify(role)} with code part "${codePart}" and no code gives ${outcome}`, async () => {
    const built = build({ roles: { "user_1:org_1": role } });

    const response = await callback(built.app, `state=${q(stateFor("org_1"))}${codePart}`);

    assert.equal(
      response.headers.get("location"),
      `https://app.test/settings/jira?jira=${outcome}`,
    );
    assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
    assert.deepEqual(built.requests, []);
    assert.equal(built.connections.upserts.length, 0);
  });
}

test("[boundary-6] a non-member with no code is sent to the signed returnTo with forbidden", async () => {
  const built = build();

  const response = await callback(
    built.app,
    `state=${q(stateFor("org_1", { returnTo: "/orgs/acme/jira" }))}`,
  );

  assert.equal(
    response.headers.get("location"),
    "https://app.test/orgs/acme/jira?jira=forbidden",
  );
  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.deepEqual(built.requests, []);
});

test("[boundary-6] an owner with no code is sent to the signed returnTo with error after one check", async () => {
  const built = build({ roles: { "user_1:org_1": "owner" } });

  const response = await callback(
    built.app,
    `state=${q(stateFor("org_1", { returnTo: "/orgs/acme/jira" }))}&code=`,
  );

  assert.equal(
    response.headers.get("location"),
    "https://app.test/orgs/acme/jira?jira=error",
  );
  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.deepEqual(built.requests, []);
});

// ---------------------------------------------------------------------------
// [unhappy-5] roleOf rejects
// ---------------------------------------------------------------------------

// Extends "[unhappy-5] roleOf rejects": another message, a signed returnTo,
// and a role table that would otherwise allow the caller.
test("[unhappy-5] a rejection with another message, for a caller the table would allow, is a 500", async () => {
  const built = build({
    roles: { "user_1:org_1": "owner" },
    organizations: rejectingOrganizations("connection reset by peer"),
  });

  const response = await callback(
    built.app,
    `code=c&state=${q(stateFor("org_1", { returnTo: "/orgs/acme/jira" }))}`,
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Internal server error." });
  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.deepEqual(built.requests, []);
  assert.equal(built.connections.upserts.length, 0);
});

// Extends "[unhappy-5] roleOf rejecting on a callback with no code is still a
// 500": an empty code, and a rejection that arrives a few turns later.
test("[unhappy-5] a late rejection on a callback with an empty code is a 500", async () => {
  const built = build({
    organizations: (roles, calls) => ({
      ...fakeOrganizations(roles, calls),
      roleOf: async (userId, organizationId) => {
        calls.push([userId, organizationId]);
        await Promise.resolve();
        await Promise.resolve();
        throw new Error("database is on fire");
      },
    }),
  });

  const response = await callback(built.app, `code=&state=${q(stateFor("org_1"))}`);

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Internal server error." });
  assert.deepEqual(built.requests, []);
  assert.equal(built.connections.upserts.length, 0);
});

// ---------------------------------------------------------------------------
// [boundary-7] A grant covering two sites checks membership once and stores
// both
// ---------------------------------------------------------------------------

// Extends "[boundary-7] a grant covering two sites checks membership once and
// stores both": three sites, every field of every upsert, in order.
test("[boundary-7] a grant covering three sites checks membership once and stores all three in order", async () => {
  const built = build({
    roles: { "user_1:org_1": "owner" },
    sites: ["cloud-a", "cloud-b", "cloud-c"],
  });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.deepEqual(built.connections.upserts, [
    ["org_1", expectedInput("cloud-a")],
    ["org_1", expectedInput("cloud-b")],
    ["org_1", expectedInput("cloud-c")],
  ]);
  assert.equal(response.headers.get("location"), CONNECTED);
});

test("[boundary-7] a store that would refuse any second question still sees both sites stored", async () => {
  let asked = 0;
  const built = build({
    sites: ["cloud-1", "cloud-2"],
    organizations: (roles, calls) => ({
      ...fakeOrganizations(roles, calls),
      roleOf: (userId, organizationId) => {
        calls.push([userId, organizationId]);
        asked++;
        return Promise.resolve(asked === 1 ? "admin" : undefined);
      },
    }),
  });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.deepEqual(
    built.connections.upserts.map(([organizationId, input]) => [organizationId, input.cloudId]),
    [
      ["org_1", "cloud-1"],
      ["org_1", "cloud-2"],
    ],
  );
  assert.equal(jiraParam(response), "connected");
});

// ---------------------------------------------------------------------------
// [concurrency-1] Membership revoked while the token exchange is in flight
// does not stop the flow
// ---------------------------------------------------------------------------

// Extends "[concurrency-1] membership revoked while the token exchange is in
// flight does not stop the flow": demoted rather than removed.
test("[concurrency-1] a demotion to member during the token exchange does not stop the flow", async () => {
  const built = build({
    roles: { "user_1:org_1": "owner" },
    onToken: (roles) => {
      roles.set(key("user_1", "org_1"), "member");
    },
  });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.deepEqual(built.connections.upserts, [["org_1", expectedInput("cloud-1")]]);
  assert.equal(jiraParam(response), "connected");
});

// Extends "[concurrency-1] membership revoked while the sites are listed does
// not stop the flow": revoked after the first of three upserts.
test("[concurrency-1] removal after the first of three upserts still stores all three", async () => {
  const built = build({
    roles: { "user_1:org_1": "admin" },
    sites: ["cloud-1", "cloud-2", "cloud-3"],
    onUpsert: (roles, count) => {
      if (count === 1) roles.delete(key("user_1", "org_1"));
    },
  });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.deepEqual(
    built.connections.upserts.map(([organizationId, input]) => [organizationId, input.cloudId]),
    [
      ["org_1", "cloud-1"],
      ["org_1", "cloud-2"],
      ["org_1", "cloud-3"],
    ],
  );
  assert.equal(jiraParam(response), "connected");
});

// ---------------------------------------------------------------------------
// [concurrency-2] Overlapping callbacks for two organizations are each
// decided by their own organization
// ---------------------------------------------------------------------------

// Extends "[concurrency-2] overlapping callbacks for two organizations ...":
// both lookups are held open and answered in a chosen order, so a decision
// kept anywhere but in the request itself would leak across.
for (const firstAnswered of ["org_2", "org_1"]) {
  test(`[concurrency-2] overlapping callbacks whose lookups are answered ${firstAnswered} first are each decided by their own organization`, async () => {
    const pending: Pending[] = [];
    const built = build({ organizations: gatedOrganizations(pending) });

    const inflight = Promise.all([
      callback(built.app, `code=c1&state=${q(stateFor("org_1", { returnTo: "/orgs/one/jira" }))}`),
      callback(built.app, `code=c2&state=${q(stateFor("org_2", { returnTo: "/orgs/two/jira" }))}`),
    ]);
    await settle(() => pending.length >= 2);
    assert.equal(pending.length, 2);

    const answers: Record<string, string | undefined> = { org_1: "owner", org_2: undefined };
    const order = firstAnswered === "org_2" ? ["org_2", "org_1"] : ["org_1", "org_2"];
    for (const organizationId of order) {
      const entry = pending.find((p) => p.organizationId === organizationId);
      assert.ok(entry, `no lookup for ${organizationId}`);
      entry.resolve(answers[organizationId]);
      await settle(() => false);
    }
    const [first, second] = await inflight;

    assert.equal(first.headers.get("location"), "https://app.test/orgs/one/jira?jira=connected");
    assert.equal(second.headers.get("location"), "https://app.test/orgs/two/jira?jira=forbidden");
    assert.deepEqual(
      built.connections.upserts.map(([organizationId]) => organizationId),
      ["org_1"],
    );
    assert.deepEqual(sortedCalls(built.roleOfCalls), [
      ["user_1", "org_1"],
      ["user_1", "org_2"],
    ]);
  });
}

test("[concurrency-2] three overlapping callbacks for three organizations are each decided by their own", async () => {
  const built = build({ roles: { "user_1:org_1": "owner", "user_1:org_3": "admin", "user_1:org_2": "member" } });

  const responses = await Promise.all([
    callback(built.app, `code=c1&state=${q(stateFor("org_1"))}`),
    callback(built.app, `code=c2&state=${q(stateFor("org_2"))}`),
    callback(built.app, `code=c3&state=${q(stateFor("org_3"))}`),
  ]);

  assert.deepEqual(responses.map(jiraParam), ["connected", "forbidden", "connected"]);
  assert.deepEqual(
    built.connections.upserts.map(([organizationId]) => organizationId).sort(),
    ["org_1", "org_3"],
  );
  assert.deepEqual(sortedCalls(built.roleOfCalls), [
    ["user_1", "org_1"],
    ["user_1", "org_2"],
    ["user_1", "org_3"],
  ]);
});

// ---------------------------------------------------------------------------
// [concurrency-3] The same state redeemed twice in parallel is checked on
// each request
// ---------------------------------------------------------------------------

// Extends "[concurrency-3] the same state redeemed twice in a row is checked
// on each request": the membership changes between the two redemptions, so a
// decision remembered per state would give the wrong answer.
test("[concurrency-3] a state redeemed again after the caller was removed is refused the second time", async () => {
  const built = build({ roles: { "user_1:org_1": "owner" } });
  const state = stateFor("org_1");

  const first = await callback(built.app, `code=c&state=${q(state)}`);
  built.roles.delete(key("user_1", "org_1"));
  const second = await callback(built.app, `code=c&state=${q(state)}`);

  assert.equal(jiraParam(first), "connected");
  assert.equal(jiraParam(second), "forbidden");
  assert.deepEqual(built.roleOfCalls, [
    ["user_1", "org_1"],
    ["user_1", "org_1"],
  ]);
  assert.equal(built.connections.upserts.length, 1);
});

test("[concurrency-3] a state refused for a member is accepted once the caller is promoted to admin", async () => {
  const built = build({ roles: { "user_1:org_1": "member" } });
  const state = stateFor("org_1");

  const first = await callback(built.app, `code=c&state=${q(state)}`);
  built.roles.set(key("user_1", "org_1"), "admin");
  const second = await callback(built.app, `code=c&state=${q(state)}`);

  assert.equal(jiraParam(first), "forbidden");
  assert.equal(jiraParam(second), "connected");
  assert.deepEqual(built.roleOfCalls, [
    ["user_1", "org_1"],
    ["user_1", "org_1"],
  ]);
  assert.deepEqual(
    built.connections.upserts.map(([organizationId]) => organizationId),
    ["org_1"],
  );
});

// Extends "[concurrency-3] the same state redeemed twice in parallel is
// checked on each request": three at once.
test("[concurrency-3] the same state redeemed three times in parallel is checked on each request", async () => {
  const built = build({ roles: { "user_1:org_1": "owner" } });
  const state = stateFor("org_1");

  const responses = await Promise.all([
    callback(built.app, `code=c&state=${q(state)}`),
    callback(built.app, `code=c&state=${q(state)}`),
    callback(built.app, `code=c&state=${q(state)}`),
  ]);

  assert.deepEqual(responses.map(jiraParam), ["connected", "connected", "connected"]);
  assert.deepEqual(built.roleOfCalls, [
    ["user_1", "org_1"],
    ["user_1", "org_1"],
    ["user_1", "org_1"],
  ]);
  assert.deepEqual(
    built.connections.upserts.map(([organizationId]) => organizationId),
    ["org_1", "org_1", "org_1"],
  );
});

test("[concurrency-3] two parallel redemptions whose lookups answer differently are each decided by their own answer", async () => {
  const pending: Pending[] = [];
  const built = build({ organizations: gatedOrganizations(pending) });
  const state = stateFor("org_1");

  const inflight = Promise.all([
    callback(built.app, `code=c&state=${q(state)}`),
    callback(built.app, `code=c&state=${q(state)}`),
  ]);
  await settle(() => pending.length >= 2);
  assert.equal(pending.length, 2);

  pending[0]?.resolve("owner");
  await settle(() => false);
  pending[1]?.resolve(undefined);
  const responses = await inflight;

  assert.deepEqual(responses.map(jiraParam).sort(), ["connected", "forbidden"]);
  assert.deepEqual(built.roleOfCalls, [
    ["user_1", "org_1"],
    ["user_1", "org_1"],
  ]);
  assert.deepEqual(
    built.connections.upserts.map(([organizationId]) => organizationId),
    ["org_1"],
  );
});

// ---------------------------------------------------------------------------
// [happy-4] Connect still consults the store once, through the membership
// guard
// ---------------------------------------------------------------------------

function stateFromConnect(response: Response): string {
  return locationOf(response).searchParams.get("state") ?? "";
}

// Extends "[happy-4] connect still consults the store once, through the
// membership guard": the state connect issues is then redeemed, so connect's
// single lookup is told apart from the callback's own.
test("[happy-4] connect consults the store once, and redeeming its state adds exactly one more lookup", async () => {
  const built = build({ roles: { "user_1:org_1": "owner" } });

  const connect = await built.app.request("/api/v1/orgs/org_1/jira/connect", {
    headers: signedIn,
  });

  assert.equal(connect.status, 302);
  assert.equal(locationOf(connect).origin, "https://auth.atlassian.com");
  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);

  const response = await callback(built.app, `code=c&state=${q(stateFromConnect(connect))}`);

  assert.equal(response.headers.get("location"), CONNECTED);
  assert.deepEqual(built.roleOfCalls, [
    ["user_1", "org_1"],
    ["user_1", "org_1"],
  ]);
});

// Extends "[happy-4] connect as an admin also consults the store exactly
// once": a smuggled roleOf is present and is called by neither route.
test("[happy-4] with a smuggled roleOf, connect and callback each consult only the store, once", async () => {
  const smuggled: Calls = [];
  const built = build({
    roles: { "user_1:org_1": "admin" },
    extraJira: {
      roleOf: (userId: string, organizationId: string) => {
        smuggled.push([userId, organizationId]);
        return Promise.resolve(undefined);
      },
    },
  });

  const connect = await built.app.request("/api/v1/orgs/org_1/jira/connect", {
    headers: signedIn,
  });
  assert.equal(connect.status, 302);
  assert.equal(locationOf(connect).origin, "https://auth.atlassian.com");
  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);

  const response = await callback(built.app, `code=c&state=${q(stateFromConnect(connect))}`);

  assert.equal(jiraParam(response), "connected");
  assert.deepEqual(smuggled, []);
  assert.equal(built.roleOfCalls.length, 2);
});

// ---------------------------------------------------------------------------
// [unhappy-6] Connect and disconnect refusals are unchanged
// ---------------------------------------------------------------------------

// Extends "[unhappy-6] a plain member's ... is still ...": an owner who
// started the flow is demoted; every route then answers as before for a
// member, and the flow they started can no longer finish.
test("[unhappy-6] after a demotion to member, connect and disconnect refuse as before and the started flow is forbidden", async () => {
  const built = build({ roles: { "user_1:org_1": "owner" } });

  const started = await built.app.request("/api/v1/orgs/org_1/jira/connect", {
    headers: signedIn,
  });
  assert.equal(started.status, 302);
  built.roles.set(key("user_1", "org_1"), "member");

  const statuses: Array<[string, string, number]> = [
    ["GET", "/api/v1/orgs/org_1/jira/connect", 403],
    ["DELETE", "/api/v1/orgs/org_1/jira/connections/jrc_1", 403],
    ["GET", "/api/v1/orgs/org_2/jira/connect", 404],
    ["GET", "/api/v1/orgs/org_1/jira/connections", 200],
  ];
  for (const [method, path, status] of statuses) {
    const response = await built.app.request(path, { method, headers: signedIn });
    assert.equal(response.status, status, `${method} ${path}`);
  }

  const finished = await callback(built.app, `code=c&state=${q(stateFromConnect(started))}`);
  assert.equal(finished.headers.get("location"), FORBIDDEN);
  assert.equal(built.connections.upserts.length, 0);
});

test("[unhappy-6] a removed member's org routes are 404 as before, while their callback is a forbidden redirect", async () => {
  const built = build();

  for (const [method, path] of [
    ["GET", "/api/v1/orgs/org_1/jira/connect"],
    ["DELETE", "/api/v1/orgs/org_1/jira/connections/jrc_1"],
    ["GET", "/api/v1/orgs/org_1/jira/connections"],
  ] as const) {
    const response = await built.app.request(path, { method, headers: signedIn });
    assert.equal(response.status, 404, `${method} ${path}`);
  }

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), FORBIDDEN);
});

// ---------------------------------------------------------------------------
// [unhappy-7] A callback without a session is still a 401 and asks nothing
// ---------------------------------------------------------------------------

// Extends "[unhappy-7] a callback without a session is still a 401 and asks
// nothing": a store that would reject is not reached without a session, and
// is reached, once, with one.
test("[unhappy-7] without a session a rejecting store is never asked and the answer is 401, not 500", async () => {
  const built = build({ organizations: rejectingOrganizations("database is on fire") });
  const query = `code=c&state=${q(stateFor("org_1"))}`;

  const anonymous = await callback(built.app, query, false);
  assert.equal(anonymous.status, 401);
  assert.deepEqual(await anonymous.json(), { error: "Authentication required." });
  assert.deepEqual(built.roleOfCalls, []);
  assert.deepEqual(built.requests, []);

  const signedInResponse = await callback(built.app, query);
  assert.equal(signedInResponse.status, 500);
  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
});

// Extends "[unhappy-7] a callback without a session and with no code ...":
// a non-member, so the session check is what decides, not the membership one.
test("[unhappy-7] a non-member without a session gets 401, and with one gets the forbidden redirect", async () => {
  const built = build({ roles: { "user_1:org_2": "owner" } });
  const query = `code=c&state=${q(stateFor("org_1"))}`;

  const anonymous = await callback(built.app, query, false);
  assert.equal(anonymous.status, 401);
  assert.deepEqual(await anonymous.json(), { error: "Authentication required." });
  assert.deepEqual(built.roleOfCalls, []);

  const signedInResponse = await callback(built.app, query);
  assert.equal(signedInResponse.headers.get("location"), FORBIDDEN);
  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
});

// ---------------------------------------------------------------------------
// [boundary-8] Without both stores the callback is not mounted
// ---------------------------------------------------------------------------

// Extends "[boundary-8] with organizations but not jira the callback is not
// mounted": the same request on an app with both stores is answered by the
// re-check, so the 404 is the missing mount and not a refusal.
test("[boundary-8] with organizations but not jira the callback is a 404 that asks nothing, unlike with both", async () => {
  const query = `code=c&state=${q(stateFor("org_1"))}`;

  const withoutJira = build({ withoutJira: true });
  const missing = await callback(withoutJira.app, query);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "Not found." });
  assert.deepEqual(withoutJira.roleOfCalls, []);

  const both = build();
  const refused = await callback(both.app, query);
  assert.equal(refused.status, 302);
  assert.equal(refused.headers.get("location"), FORBIDDEN);
  assert.deepEqual(both.roleOfCalls, [["user_1", "org_1"]]);
});

// Extends "[boundary-8] with jira but not organizations the callback is not
// mounted": nothing reaches Atlassian either.
test("[boundary-8] with jira but not organizations the callback is a 404 that reaches no one, unlike with both", async () => {
  const query = `code=c&state=${q(stateFor("org_1"))}`;

  const withoutOrganizations = build({
    roles: { "user_1:org_1": "member" },
    withoutOrganizations: true,
  });
  const missing = await callback(withoutOrganizations.app, query);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "Not found." });
  assert.deepEqual(withoutOrganizations.requests, []);
  assert.equal(withoutOrganizations.connections.upserts.length, 0);

  const both = build({ roles: { "user_1:org_1": "member" } });
  const refused = await callback(both.app, query);
  assert.equal(refused.headers.get("location"), FORBIDDEN);
  assert.deepEqual(both.requests, []);
});
