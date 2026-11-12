import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  JiraConnectionInput,
  JiraConnectionStore,
  JiraConnectionSummary,
  OrganizationStore,
} from "@sandbox-factory/db";

import type { Auth } from "../src/auth.js";
import { signState } from "../src/jira/state.js";
import { createApp, type AppOptions } from "../src/routes.js";
import { createInMemoryStore } from "../src/store.js";

/**
 * The Jira OAuth callback re-checks membership, for the organization named in
 * the verified state, before it spends the authorization code.
 */

const dana = { id: "user_1", email: "dana@example.test", name: "Dana" };

const SECRET = "0123456789abcdef0123456789abcdef";
const API_URL = "https://api.test";
const APP_URL = "https://app.test";
/** A fixed clock, shared by the signed states and the routes. */
const NOW = Date.UTC(2026, 10, 4, 12, 0, 0);
const FULL_SCOPE =
  "read:jira-work read:jira-user read:board-scope:jira-software read:sprint:jira-software offline_access";

const signedIn = { cookie: "session=1" };

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

function key(userId: string, organizationId: string): string {
  return `${userId}:${organizationId}`;
}

function roleTable(entries: Record<string, string> = {}): RoleTable {
  return new Map(Object.entries(entries));
}

/** An organization store whose roleOf answers from the table and records calls. */
function fakeOrganizations(
  roles: RoleTable,
  calls: Array<[string, string]>,
): OrganizationStore {
  return {
    roleOf: (userId, organizationId) => {
      calls.push([userId, organizationId]);
      return Promise.resolve(roles.get(key(userId, organizationId)));
    },
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

/** The same store as a class, whose roleOf only works when called as a method. */
class ThisBoundOrganizations implements OrganizationStore {
  constructor(
    private readonly roles: RoleTable,
    private readonly calls: Array<[string, string]>,
  ) {}

  roleOf(userId: string, organizationId: string): Promise<string | undefined> {
    this.calls.push([userId, organizationId]);
    return Promise.resolve(this.roles.get(key(userId, organizationId)));
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

/** Records each upsert as [organizationId, input]. */
function fakeConnections(): JiraConnectionStore & {
  upserts: Array<[string, JiraConnectionInput]>;
} {
  const upserts: Array<[string, JiraConnectionInput]> = [];
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
    name: cloudId,
    scopes: ["read:jira-work"],
  };
}

/** Atlassian, faked: records each request it receives. */
function fakeAtlassian(
  requests: string[],
  options: {
    sites?: string[];
    scope?: string;
    onToken?: () => void;
    onSites?: () => void;
  } = {},
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
  roleOfCalls: Array<[string, string]>;
  requests: string[];
  connections: ReturnType<typeof fakeConnections>;
}

function build(
  options: {
    roles?: Record<string, string>;
    organizations?: (
      roles: RoleTable,
      calls: Array<[string, string]>,
    ) => OrganizationStore;
    withoutOrganizations?: boolean;
    withoutJira?: boolean;
    sites?: string[];
    scope?: string;
    onToken?: (roles: RoleTable) => void;
    onSites?: (roles: RoleTable) => void;
    extraJira?: Record<string, unknown>;
  } = {},
): Built {
  const roles = roleTable(options.roles);
  const roleOfCalls: Array<[string, string]> = [];
  const requests: string[] = [];
  const connections = fakeConnections();
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
    auth: fakeAuth(),
    ...(options.withoutOrganizations === true ? {} : { organizations }),
    ...(options.withoutJira === true ? {} : { jira }),
  });
  return { app, roles, roleOfCalls, requests, connections };
}

function stateFor(
  organizationId: string,
  overrides: { userId?: string; returnTo?: string; secret?: string } = {},
): string {
  return signState(overrides.secret ?? SECRET, {
    organizationId,
    userId: overrides.userId ?? dana.id,
    returnTo: overrides.returnTo ?? "/settings/jira",
    issuedAt: NOW,
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

const CONNECTED = "https://app.test/settings/jira?jira=connected";
const FORBIDDEN = "https://app.test/settings/jira?jira=forbidden";

// ---------------------------------------------------------------------------
// Rule: createApp supplies roleOf from the organization store, and the
// callback calls it once with the session user and the state's organization
// ---------------------------------------------------------------------------

test("[happy-1] the callback asks the organization store about the state's organization", async () => {
  const built = build({ roles: { "user_1:org_1": "owner" } });

  const response = await callback(
    built.app,
    `code=code-1&state=${q(stateFor("org_1"))}`,
  );

  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), CONNECTED);
});

test("[happy-1] a state for another organization is checked against that organization", async () => {
  const built = build({ roles: { "user_1:org_2": "owner" } });

  const response = await callback(
    built.app,
    `code=code-1&state=${q(stateFor("org_2"))}`,
  );

  assert.deepEqual(built.roleOfCalls, [["user_1", "org_2"]]);
  assert.equal(jiraParam(response), "connected");
  assert.equal(built.connections.upserts.length, 1);
  assert.equal(built.connections.upserts[0]?.[0], "org_2");
});

test("[happy-2] the organization id comes from the state even when the query names another", async () => {
  const built = build({ roles: { "user_1:org_1": "owner" } });

  await callback(
    built.app,
    `code=c&orgId=org_evil&organizationId=org_evil&state=${q(stateFor("org_1"))}`,
  );

  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.equal(built.connections.upserts.length, 1);
  assert.equal(built.connections.upserts[0]?.[0], "org_1");
});

test("[happy-2] being an owner of the organization named in the query does not pass the check", async () => {
  const built = build({ roles: { "user_1:org_evil": "owner" } });

  const response = await callback(
    built.app,
    `code=c&orgId=org_evil&organizationId=org_evil&state=${q(stateFor("org_1"))}`,
  );

  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.equal(jiraParam(response), "forbidden");
  assert.equal(built.connections.upserts.length, 0);
});

test("[boundary-1] a store whose roleOf relies on this is called as a method", async () => {
  const built = build({
    roles: { "user_1:org_1": "admin" },
    organizations: (roles, calls) => new ThisBoundOrganizations(roles, calls),
  });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.notEqual(response.status, 500);
  assert.equal(response.status, 302);
  assert.equal(jiraParam(response), "connected");
});

test("[boundary-1] a this-bound store refuses a non-member with a redirect, not a 500", async () => {
  const built = build({
    organizations: (roles, calls) => new ThisBoundOrganizations(roles, calls),
  });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.notEqual(response.status, 500);
  assert.equal(response.status, 302);
  assert.equal(jiraParam(response), "forbidden");
  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
});

test("[boundary-2] a roleOf on the jira options is ignored in favour of the store's", async () => {
  const smuggled: Array<[string, string]> = [];
  const built = build({
    extraJira: {
      roleOf: (userId: string, organizationId: string) => {
        smuggled.push([userId, organizationId]);
        return Promise.resolve("owner");
      },
    },
  });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.deepEqual(smuggled, []);
  assert.equal(response.status, 302);
  assert.equal(jiraParam(response), "forbidden");
  assert.equal(built.connections.upserts.length, 0);
});

test("[boundary-2] a smuggled roleOf refusing everyone does not stop a store-approved owner", async () => {
  const smuggled: Array<[string, string]> = [];
  const built = build({
    roles: { "user_1:org_1": "owner" },
    extraJira: {
      roleOf: (userId: string, organizationId: string) => {
        smuggled.push([userId, organizationId]);
        return Promise.resolve(undefined);
      },
    },
  });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.deepEqual(smuggled, []);
  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.equal(jiraParam(response), "connected");
  assert.equal(built.connections.upserts.length, 1);
});

// ---------------------------------------------------------------------------
// Rule: An owner or admin at callback time connects exactly as before
// ---------------------------------------------------------------------------

for (const role of ["owner", "admin", "member,admin", "admin,member", "member, owner"]) {
  test(`[happy-3] role "${role}" still allows connecting and finishes the flow`, async () => {
    const built = build({ roles: { "user_1:org_1": role } });

    const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), CONNECTED);
    assert.equal(built.connections.upserts.length, 1);
    const [organizationId, input] = built.connections.upserts[0] ?? [];
    assert.equal(organizationId, "org_1");
    assert.equal(input?.cloudId, "cloud-1");
    assert.equal(input?.refreshToken, "refresh-1");
  });
}

// ---------------------------------------------------------------------------
// Rule: A caller who is no longer a member is sent back with jira=forbidden,
// and nothing is exchanged or stored
// ---------------------------------------------------------------------------

test("[unhappy-1] removed from the organization after starting the flow", async () => {
  const built = build();

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), FORBIDDEN);
  assert.deepEqual(built.requests, []);
  assert.equal(built.connections.upserts.length, 0);
});

test("[unhappy-1] another user's ownership of the organization does not count for the session user", async () => {
  const built = build({ roles: { "user_2:org_1": "owner" } });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), FORBIDDEN);
  assert.deepEqual(built.requests, []);
  assert.equal(built.connections.upserts.length, 0);
});

test("[unhappy-2] the forbidden redirect honours the signed returnTo", async () => {
  const built = build();

  const response = await callback(
    built.app,
    `code=c&state=${q(stateFor("org_1", { returnTo: "/orgs/acme/jira" }))}`,
  );

  const location = locationOf(response);
  assert.equal(location.origin, APP_URL);
  assert.equal(location.pathname, "/orgs/acme/jira");
  assert.equal(location.search, "?jira=forbidden");
  assert.equal(location.searchParams.has("missing"), false);
});

test("[unhappy-2] a demoted member's forbidden redirect also honours the signed returnTo", async () => {
  const built = build({ roles: { "user_1:org_1": "member" } });

  const response = await callback(
    built.app,
    `code=c&state=${q(stateFor("org_1", { returnTo: "/orgs/acme/jira" }))}`,
  );

  const location = locationOf(response);
  assert.equal(location.origin, APP_URL);
  assert.equal(location.pathname, "/orgs/acme/jira");
  assert.equal(location.search, "?jira=forbidden");
});

test("[unhappy-3] a member of another organization only cannot complete a flow for this one", async () => {
  const built = build({ roles: { "user_1:org_2": "owner" } });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.equal(jiraParam(response), "forbidden");
  assert.equal(built.connections.upserts.length, 0);
});

test("[unhappy-3] an owner of org_1 cannot complete a flow signed for org_2", async () => {
  const built = build({ roles: { "user_1:org_1": "owner" } });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_2"))}`);

  assert.deepEqual(built.roleOfCalls, [["user_1", "org_2"]]);
  assert.equal(jiraParam(response), "forbidden");
  assert.equal(built.connections.upserts.length, 0);
});

// ---------------------------------------------------------------------------
// Rule: A caller who is still a member but neither owner nor admin is refused
// the same way
// ---------------------------------------------------------------------------

for (const role of [
  "member",
  "billing",
  "Owner",
  "ADMIN",
  "member,member",
  "administrator",
]) {
  test(`[unhappy-4] role "${role}" does not allow connecting and is forbidden`, async () => {
    const built = build({ roles: { "user_1:org_1": role } });

    const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), FORBIDDEN);
    assert.deepEqual(built.requests, []);
    assert.equal(built.connections.upserts.length, 0);
  });
}

test("[boundary-3] an empty role string is not a role", async () => {
  const built = build({ roles: { "user_1:org_1": "" } });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.equal(jiraParam(response), "forbidden");
  assert.equal(built.connections.upserts.length, 0);
});

test("[boundary-3] a role of only separators and spaces is not a role", async () => {
  const built = build({ roles: { "user_1:org_1": " , " } });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.equal(jiraParam(response), "forbidden");
  assert.deepEqual(built.requests, []);
  assert.equal(built.connections.upserts.length, 0);
});

// ---------------------------------------------------------------------------
// Rule: The re-check comes after the Atlassian error and state checks, and
// before the code check
// ---------------------------------------------------------------------------

const atlassianRefusals: Array<[string, () => string, string]> = [
  ["access_denied with a description", () => "error=access_denied&error_description=User+denied", "cancelled"],
  ["invalid_scope", () => "error=invalid_scope", "error"],
  ["access_denied alongside a code and a valid state", () => `error=access_denied&code=c&state=${q(stateFor("org_1"))}`, "cancelled"],
];

for (const [name, query, outcome] of atlassianRefusals) {
  test(`[boundary-4] Atlassian's own refusal (${name}) is reported without asking the store`, async () => {
    const built = build();

    const response = await callback(built.app, query());

    assert.equal(
      response.headers.get("location"),
      `https://app.test/settings/jira?jira=${outcome}`,
    );
    assert.deepEqual(built.roleOfCalls, []);
  });
}

const refusedStates: Array<[string, () => string]> = [
  ["no state", () => ""],
  ["an empty state", () => "&state="],
  ["a state signed with another secret", () => `&state=${q(stateFor("org_1", { secret: "a-different-secret-that-is-long-enough" }))}`],
  ["a state for another user", () => `&state=${q(stateFor("org_1", { userId: "user_2" }))}`],
];

for (const [name, statePart] of refusedStates) {
  test(`[boundary-5] a refused state (${name}) is reported without asking the store`, async () => {
    const built = build({ roles: { "user_1:org_1": "owner" } });

    const response = await callback(built.app, `code=c${statePart()}`);

    assert.equal(
      response.headers.get("location"),
      "https://app.test/settings/jira?jira=state",
    );
    assert.deepEqual(built.roleOfCalls, []);
    assert.equal(built.connections.upserts.length, 0);
  });
}

const missingCodes: Array<[string, string | undefined, string, string]> = [
  ["no entry", undefined, "", "forbidden"],
  ["no entry", undefined, "&code=", "forbidden"],
  ['"member"', "member", "", "forbidden"],
  ['"owner"', "owner", "", "error"],
  ['"owner"', "owner", "&code=", "error"],
];

for (const [label, role, codePart, outcome] of missingCodes) {
  test(`[boundary-6] with a valid state, role ${label} and code part "${codePart}", membership decides first: ${outcome}`, async () => {
    const built = build({
      roles: role === undefined ? {} : { "user_1:org_1": role },
    });

    const response = await callback(
      built.app,
      `state=${q(stateFor("org_1"))}${codePart}`,
    );

    assert.equal(jiraParam(response), outcome);
    assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
    assert.deepEqual(built.requests, []);
  });
}

// ---------------------------------------------------------------------------
// Rule: A failing membership lookup is a 500, not a redirect
// ---------------------------------------------------------------------------

function rejectingOrganizations(
  roles: RoleTable,
  calls: Array<[string, string]>,
): OrganizationStore {
  return {
    ...fakeOrganizations(roles, calls),
    roleOf: (userId, organizationId) => {
      calls.push([userId, organizationId]);
      return Promise.reject(new Error("database is on fire"));
    },
  };
}

test("[unhappy-5] roleOf rejects", async () => {
  const built = build({ organizations: rejectingOrganizations });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Internal server error." });
  assert.deepEqual(built.requests, []);
  assert.equal(built.connections.upserts.length, 0);
});

test("[unhappy-5] roleOf rejecting on a callback with no code is still a 500", async () => {
  const built = build({ organizations: rejectingOrganizations });

  const response = await callback(built.app, `state=${q(stateFor("org_1"))}`);

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Internal server error." });
  assert.deepEqual(built.requests, []);
  assert.equal(built.connections.upserts.length, 0);
});

// ---------------------------------------------------------------------------
// Rule: Membership is checked once per callback, before the exchange, and is
// not re-checked during it
// ---------------------------------------------------------------------------

test("[boundary-7] a grant covering two sites checks membership once and stores both", async () => {
  const built = build({
    roles: { "user_1:org_1": "admin" },
    sites: ["cloud-1", "cloud-2"],
  });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.deepEqual(
    built.connections.upserts.map(([organizationId, input]) => [
      organizationId,
      input.cloudId,
    ]),
    [
      ["org_1", "cloud-1"],
      ["org_1", "cloud-2"],
    ],
  );
  assert.equal(jiraParam(response), "connected");
});

test("[boundary-7] a two-site grant with partial scopes still checks membership once", async () => {
  const built = build({
    roles: { "user_1:org_1": "admin" },
    sites: ["cloud-1", "cloud-2"],
    scope: "read:jira-work read:jira-user offline_access",
  });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.equal(built.connections.upserts.length, 2);
  assert.equal(jiraParam(response), "partial-scopes");
});

test("[concurrency-1] membership revoked while the token exchange is in flight does not stop the flow", async () => {
  const built = build({
    roles: { "user_1:org_1": "owner" },
    onToken: (roles) => {
      roles.delete(key("user_1", "org_1"));
    },
  });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.equal(built.connections.upserts.length, 1);
  assert.equal(built.connections.upserts[0]?.[0], "org_1");
  assert.equal(jiraParam(response), "connected");
});

test("[concurrency-1] membership revoked while the sites are listed does not stop the flow", async () => {
  const built = build({
    roles: { "user_1:org_1": "owner" },
    sites: ["cloud-1", "cloud-2"],
    onSites: (roles) => {
      roles.delete(key("user_1", "org_1"));
    },
  });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
  assert.equal(built.connections.upserts.length, 2);
  assert.equal(jiraParam(response), "connected");
});

function sortedCalls(calls: Array<[string, string]>): Array<[string, string]> {
  return [...calls].sort((a, b) => a[1].localeCompare(b[1]));
}

test("[concurrency-2] overlapping callbacks for two organizations are each decided by their own organization", async () => {
  const built = build({ roles: { "user_1:org_1": "owner" } });

  const [first, second] = await Promise.all([
    callback(built.app, `code=c1&state=${q(stateFor("org_1"))}`),
    callback(built.app, `code=c2&state=${q(stateFor("org_2"))}`),
  ]);

  assert.equal(jiraParam(first), "connected");
  assert.equal(jiraParam(second), "forbidden");
  assert.equal(built.connections.upserts.length, 1);
  assert.equal(built.connections.upserts[0]?.[0], "org_1");
  assert.deepEqual(sortedCalls(built.roleOfCalls), [
    ["user_1", "org_1"],
    ["user_1", "org_2"],
  ]);
});

test("[concurrency-2] overlapping callbacks issued in the other order are still each decided by their own organization", async () => {
  const built = build({ roles: { "user_1:org_1": "owner" } });

  const [forOrg2, forOrg1] = await Promise.all([
    callback(built.app, `code=c2&state=${q(stateFor("org_2"))}`),
    callback(built.app, `code=c1&state=${q(stateFor("org_1"))}`),
  ]);

  assert.equal(jiraParam(forOrg2), "forbidden");
  assert.equal(jiraParam(forOrg1), "connected");
  assert.equal(built.connections.upserts.length, 1);
  assert.equal(built.connections.upserts[0]?.[0], "org_1");
  assert.deepEqual(sortedCalls(built.roleOfCalls), [
    ["user_1", "org_1"],
    ["user_1", "org_2"],
  ]);
});

test("[concurrency-3] the same state redeemed twice in parallel is checked on each request", async () => {
  const built = build({ roles: { "user_1:org_1": "owner" } });
  const state = stateFor("org_1");

  const responses = await Promise.all([
    callback(built.app, `code=c&state=${q(state)}`),
    callback(built.app, `code=c&state=${q(state)}`),
  ]);

  assert.deepEqual(responses.map(jiraParam), ["connected", "connected"]);
  assert.deepEqual(built.roleOfCalls, [
    ["user_1", "org_1"],
    ["user_1", "org_1"],
  ]);
  assert.deepEqual(
    built.connections.upserts.map(([organizationId]) => organizationId),
    ["org_1", "org_1"],
  );
});

test("[concurrency-3] the same state redeemed twice in a row is checked on each request", async () => {
  const built = build({ roles: { "user_1:org_1": "owner" } });
  const state = stateFor("org_1");

  const first = await callback(built.app, `code=c&state=${q(state)}`);
  const second = await callback(built.app, `code=c&state=${q(state)}`);

  assert.equal(jiraParam(first), "connected");
  assert.equal(jiraParam(second), "connected");
  assert.deepEqual(built.roleOfCalls, [
    ["user_1", "org_1"],
    ["user_1", "org_1"],
  ]);
  assert.equal(built.connections.upserts.length, 2);
});

// ---------------------------------------------------------------------------
// Rule: Every other route keeps its behaviour
// ---------------------------------------------------------------------------

test("[happy-4] connect still consults the store once, through the membership guard", async () => {
  const built = build({ roles: { "user_1:org_1": "owner" } });

  const response = await built.app.request("/api/v1/orgs/org_1/jira/connect", {
    headers: signedIn,
  });

  assert.equal(response.status, 302);
  assert.equal(locationOf(response).origin, "https://auth.atlassian.com");
  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
});

test("[happy-4] connect as an admin also consults the store exactly once", async () => {
  const built = build({ roles: { "user_1:org_1": "admin" } });

  const response = await built.app.request("/api/v1/orgs/org_1/jira/connect", {
    headers: signedIn,
  });

  assert.equal(response.status, 302);
  assert.equal(locationOf(response).origin, "https://auth.atlassian.com");
  assert.deepEqual(built.roleOfCalls, [["user_1", "org_1"]]);
});

const unchangedRefusals: Array<[string, string, number]> = [
  ["GET", "/api/v1/orgs/org_1/jira/connect", 403],
  ["DELETE", "/api/v1/orgs/org_1/jira/connections/jrc_1", 403],
  ["GET", "/api/v1/orgs/org_2/jira/connect", 404],
  ["GET", "/api/v1/orgs/org_1/jira/connections", 200],
];

for (const [method, path, status] of unchangedRefusals) {
  test(`[unhappy-6] a plain member's ${method} ${path} is still ${status}`, async () => {
    const built = build({ roles: { "user_1:org_1": "member" } });

    const response = await built.app.request(path, {
      method,
      headers: signedIn,
    });

    assert.equal(response.status, status);
  });
}

test("[unhappy-7] a callback without a session is still a 401 and asks nothing", async () => {
  const built = build({ roles: { "user_1:org_1": "owner" } });

  const response = await callback(
    built.app,
    `code=c&state=${q(stateFor("org_1"))}`,
    false,
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required." });
  assert.deepEqual(built.roleOfCalls, []);
});

test("[unhappy-7] a callback without a session and with no code is still a 401 and asks nothing", async () => {
  const built = build({ roles: { "user_1:org_1": "owner" } });

  const response = await callback(
    built.app,
    `state=${q(stateFor("org_1"))}`,
    false,
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required." });
  assert.deepEqual(built.roleOfCalls, []);
  assert.deepEqual(built.requests, []);
});

test("[boundary-8] with organizations but not jira the callback is not mounted", async () => {
  const built = build({
    roles: { "user_1:org_1": "owner" },
    withoutJira: true,
  });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Not found." });
});

test("[boundary-8] with jira but not organizations the callback is not mounted", async () => {
  const built = build({
    roles: { "user_1:org_1": "owner" },
    withoutOrganizations: true,
  });

  const response = await callback(built.app, `code=c&state=${q(stateFor("org_1"))}`);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Not found." });
});
