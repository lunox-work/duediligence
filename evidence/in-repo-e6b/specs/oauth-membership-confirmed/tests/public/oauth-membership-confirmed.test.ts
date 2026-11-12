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
 * The Jira OAuth callback re-checks membership, through the organization
 * store `createApp` was given, before it spends the authorization code.
 */

const dana = { id: "user_1", email: "dana@example.test", name: "Dana" };

const SECRET = "0123456789abcdef0123456789abcdef";
const API_URL = "https://api.test";
const APP_URL = "https://app.test";

/** The fixed clock: every state is issued at it, and the routes read it. */
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);

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

/** A state, signed at the fixed clock with a fixed nonce. */
function stateFor(
  organizationId: string,
  options: {
    userId?: string;
    returnTo?: string;
    secret?: string;
    issuedAt?: number;
  } = {},
): string {
  return signState(options.secret ?? SECRET, {
    organizationId,
    userId: options.userId ?? dana.id,
    returnTo: options.returnTo ?? "/settings/jira",
    issuedAt: options.issuedAt ?? NOW,
    nonce: "nonce-1",
  });
}

function callback(query: string): string {
  return `/api/v1/jira/callback?${query}`;
}

function withState(state: string): string {
  return `state=${encodeURIComponent(state)}`;
}

/** Role per `${userId}:${organizationId}`; absent means not a member. */
type RoleTable = Record<string, string>;

function key(userId: string, organizationId: string): string {
  return `${userId}:${organizationId}`;
}

/** Every roleOf call, as [userId, organizationId]. */
type RoleCalls = Array<[string, string]>;

function organizationStore(
  roleOf: OrganizationStore["roleOf"],
): OrganizationStore {
  return {
    roleOf,
    listForUser: () => Promise.resolve([]),
    get: () => Promise.resolve({ id: "org_1", name: "Acme", slug: "acme" }),
    findBySlug: () => Promise.resolve(undefined),
    slugOwner: () => Promise.resolve(undefined),
    listMembers: () => Promise.resolve([]),
    pendingFor: () => Promise.resolve([]),
    findUserByHandle: () => Promise.resolve(undefined),
    touch: () => Promise.resolve(),
  };
}

/** Answers from a role table and records every call. */
function fakeOrganizations(roles: RoleTable, calls: RoleCalls) {
  return organizationStore((userId, organizationId) => {
    calls.push([userId, organizationId]);
    return Promise.resolve(roles[key(userId, organizationId)]);
  });
}

/** A store whose roleOf only works when called as a method. */
class ThisBoundOrganizations implements OrganizationStore {
  readonly calls: RoleCalls = [];
  constructor(private readonly roles: RoleTable) {}

  roleOf(userId: string, organizationId: string): Promise<string | undefined> {
    this.calls.push([userId, organizationId]);
    return Promise.resolve(this.roles[key(userId, organizationId)]);
  }
  listForUser() {
    return Promise.resolve([]);
  }
  get() {
    return Promise.resolve({ id: "org_1", name: "Acme", slug: "acme" });
  }
  findBySlug() {
    return Promise.resolve(undefined);
  }
  slugOwner() {
    return Promise.resolve(undefined);
  }
  listMembers() {
    return Promise.resolve([]);
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

/** Records each upsert as [organizationId, input], and each removal. */
function fakeConnections(): JiraConnectionStore & {
  upserts: Array<[string, JiraConnectionInput]>;
  removed: string[];
} {
  const upserts: Array<[string, JiraConnectionInput]> = [];
  const removed: string[] = [];
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
    removed,
    list: () => Promise.resolve([summary]),
    get: () => Promise.resolve(summary),
    upsert: (organizationId, input) => {
      upserts.push([organizationId, input]);
      return Promise.resolve(summary);
    },
    tokens: () => Promise.resolve(null),
    saveTokens: () => Promise.resolve(),
    markUnhealthy: () => Promise.resolve(),
    remove: (_organizationId, id) => {
      removed.push(id);
      return Promise.resolve(id === "jrc_1");
    },
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

/**
 * Atlassian, faked: records each request, answers the token exchange with
 * refresh token "refresh-1" and the full scope, and lists the given sites.
 */
function fakeAtlassian(
  options: {
    sites?: string[];
    onRequest?: (href: string) => void;
  } = {},
) {
  const requests: string[] = [];
  const fetch = (async (url: string | URL | Request) => {
    const href = url instanceof Request ? url.url : String(url);
    requests.push(href);
    options.onRequest?.(href);
    // By suffix, and the site list first: its path contains `/oauth/token`.
    if (href.endsWith("/accessible-resources")) {
      return new Response(
        JSON.stringify((options.sites ?? ["cloud-1"]).map(site)),
        { status: 200 },
      );
    }
    if (href.endsWith("/oauth/token")) {
      return new Response(
        JSON.stringify({
          access_token: "access-1",
          refresh_token: "refresh-1",
          expires_in: 3600,
          scope: FULL_SCOPE,
        }),
        { status: 200 },
      );
    }
    throw new Error(`unexpected request to ${href}`);
  }) as typeof globalThis.fetch;
  return { fetch, requests };
}

function jiraOptions(
  connections: JiraConnectionStore,
  fetch: typeof globalThis.fetch,
): NonNullable<AppOptions["jira"]> {
  return {
    connections,
    clientId: "jira-client-id",
    clientSecret: "jira-client-secret",
    secret: SECRET,
    apiUrl: API_URL,
    appUrl: APP_URL,
    fetch,
    now: () => NOW,
  };
}

/** The Background: an app with every option, over a mutable role table. */
function appWith(
  options: {
    roles?: RoleTable;
    sites?: string[];
    onRequest?: (href: string, roles: RoleTable) => void;
    organizations?: OrganizationStore;
  } = {},
) {
  const roles: RoleTable = options.roles ?? {};
  const roleCalls: RoleCalls = [];
  const connections = fakeConnections();
  const atlassian = fakeAtlassian({
    ...(options.sites === undefined ? {} : { sites: options.sites }),
    onRequest: (href) => options.onRequest?.(href, roles),
  });
  const app = createApp({
    store: createInMemoryStore(),
    corsOrigins: [APP_URL],
    auth: fakeAuth(),
    organizations: options.organizations ?? fakeOrganizations(roles, roleCalls),
    jira: jiraOptions(connections, atlassian.fetch),
  });
  return { app, roles, roleCalls, connections, atlassian };
}

function get(app: ReturnType<typeof createApp>, path: string) {
  return app.request(path, { headers: signedIn });
}

function locationOf(response: Response): URL {
  return new URL(response.headers.get("location") ?? "");
}

function jiraParam(response: Response): string | null {
  return locationOf(response).searchParams.get("jira");
}

const owner = (organizationId = "org_1"): RoleTable => ({
  [key(dana.id, organizationId)]: "owner",
});

// ---------------------------------------------------------------------------
// Rule: createApp supplies roleOf from the organization store, and the
// callback calls it once with the session user and the state's organization.

test("[happy-1] the callback asks the organization store about the state's organization", async () => {
  const { app, roleCalls } = appWith({ roles: owner() });

  const response = await get(
    app,
    callback(`code=code-1&${withState(stateFor("org_1"))}`),
  );

  assert.deepEqual(roleCalls, [["user_1", "org_1"]]);
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://app.test/settings/jira?jira=connected",
  );
});

test("[happy-1] the store is asked about whichever organization the state names", async () => {
  const { app, roleCalls, connections } = appWith({
    roles: { [key(dana.id, "org_9")]: "admin" },
  });

  const response = await get(
    app,
    callback(`code=code-1&${withState(stateFor("org_9"))}`),
  );

  assert.deepEqual(roleCalls, [["user_1", "org_9"]]);
  assert.equal(jiraParam(response), "connected");
  assert.deepEqual(
    connections.upserts.map(([organizationId]) => organizationId),
    ["org_9"],
  );
});

test("[happy-2] the organization id comes from the state even when the query names another", async () => {
  const { app, roleCalls, connections } = appWith({ roles: owner() });

  await get(
    app,
    callback(
      `code=c&orgId=org_evil&organizationId=org_evil&${withState(stateFor("org_1"))}`,
    ),
  );

  assert.deepEqual(roleCalls, [["user_1", "org_1"]]);
  assert.equal(connections.upserts.length, 1);
  assert.equal(connections.upserts[0]?.[0], "org_1");
});

test("[happy-2] a query naming an organization the caller owns does not rescue a state for one they do not", async () => {
  const { app, roleCalls, connections, atlassian } = appWith({
    roles: owner("org_1"),
  });

  const response = await get(
    app,
    callback(
      `code=c&orgId=org_1&organizationId=org_1&${withState(stateFor("org_2"))}`,
    ),
  );

  assert.deepEqual(roleCalls, [["user_1", "org_2"]]);
  assert.equal(jiraParam(response), "forbidden");
  assert.equal(connections.upserts.length, 0);
  assert.equal(atlassian.requests.length, 0);
});

test("[boundary-1] a store whose roleOf relies on `this` is called as a method", async () => {
  const organizations = new ThisBoundOrganizations({
    [key(dana.id, "org_1")]: "admin",
  });
  const { app } = appWith({ organizations });

  const response = await get(
    app,
    callback(`code=c&${withState(stateFor("org_1"))}`),
  );

  assert.notEqual(response.status, 500);
  assert.equal(response.status, 302);
  assert.equal(jiraParam(response), "connected");
  assert.deepEqual(organizations.calls, [["user_1", "org_1"]]);
});

test("[boundary-1] a `this`-bound store answering no membership forbids rather than failing", async () => {
  const organizations = new ThisBoundOrganizations({});
  const { app, connections } = appWith({ organizations });

  const response = await get(
    app,
    callback(`code=c&${withState(stateFor("org_1"))}`),
  );

  assert.notEqual(response.status, 500);
  assert.equal(response.status, 302);
  assert.equal(jiraParam(response), "forbidden");
  assert.equal(connections.upserts.length, 0);
});

function appWithSmuggledRoleOf(roles: RoleTable, smuggled: string | undefined) {
  const roleCalls: RoleCalls = [];
  const smuggledCalls: RoleCalls = [];
  const connections = fakeConnections();
  const atlassian = fakeAtlassian();
  const app = createApp({
    store: createInMemoryStore(),
    corsOrigins: [APP_URL],
    auth: fakeAuth(),
    organizations: fakeOrganizations(roles, roleCalls),
    jira: {
      ...jiraOptions(connections, atlassian.fetch),
      roleOf: (userId: string, organizationId: string) => {
        smuggledCalls.push([userId, organizationId]);
        return Promise.resolve(smuggled);
      },
    } as AppOptions["jira"],
  });
  return { app, roleCalls, smuggledCalls, connections };
}

test("[boundary-2] a roleOf on the jira options is ignored in favour of the store's", async () => {
  const { app, smuggledCalls, connections } = appWithSmuggledRoleOf(
    {},
    "owner",
  );

  const response = await get(
    app,
    callback(`code=c&${withState(stateFor("org_1"))}`),
  );

  assert.deepEqual(smuggledCalls, []);
  assert.equal(response.status, 302);
  assert.equal(jiraParam(response), "forbidden");
  assert.equal(connections.upserts.length, 0);
});

test("[boundary-2] a smuggled roleOf refusing everyone does not stop an owner the store vouches for", async () => {
  const { app, roleCalls, smuggledCalls, connections } = appWithSmuggledRoleOf(
    owner(),
    undefined,
  );

  const response = await get(
    app,
    callback(`code=c&${withState(stateFor("org_1"))}`),
  );

  assert.deepEqual(smuggledCalls, []);
  assert.deepEqual(roleCalls, [["user_1", "org_1"]]);
  assert.equal(jiraParam(response), "connected");
  assert.equal(connections.upserts.length, 1);
});

// ---------------------------------------------------------------------------
// Rule: an owner or admin at callback time connects exactly as before.

for (const role of [
  "owner",
  "admin",
  "member,admin",
  "admin,member",
  "member, owner",
]) {
  test(`[happy-3] role ${JSON.stringify(role)} still allows connecting and finishes the flow`, async () => {
    const { app, connections } = appWith({
      roles: { [key(dana.id, "org_1")]: role },
    });

    const response = await get(
      app,
      callback(`code=c&${withState(stateFor("org_1"))}`),
    );

    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get("location"),
      "https://app.test/settings/jira?jira=connected",
    );
    assert.equal(connections.upserts.length, 1);
    const [organizationId, input] = connections.upserts[0] ?? [];
    assert.equal(organizationId, "org_1");
    assert.equal(input?.cloudId, "cloud-1");
    assert.equal(input?.refreshToken, "refresh-1");
  });
}

test("[happy-3] an entry padded with whitespace on both sides is trimmed and still allows connecting", async () => {
  const { app, connections } = appWith({
    roles: { [key(dana.id, "org_1")]: "  admin  " },
  });

  const response = await get(
    app,
    callback(`code=c&${withState(stateFor("org_1"))}`),
  );

  assert.equal(
    response.headers.get("location"),
    "https://app.test/settings/jira?jira=connected",
  );
  assert.equal(connections.upserts.length, 1);
  assert.equal(connections.upserts[0]?.[0], "org_1");
});

// ---------------------------------------------------------------------------
// Rule: a caller who is no longer a member is sent back with jira=forbidden,
// and nothing is exchanged or stored.

test("[unhappy-1] a caller removed from the organization after starting the flow is forbidden", async () => {
  const { app, connections, atlassian } = appWith({ roles: {} });

  const response = await get(
    app,
    callback(`code=c&${withState(stateFor("org_1"))}`),
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://app.test/settings/jira?jira=forbidden",
  );
  assert.deepEqual(atlassian.requests, []);
  assert.equal(connections.upserts.length, 0);
});

test("[unhappy-1] someone else owning the organization does not let a removed caller through", async () => {
  const { app, connections, atlassian, roleCalls } = appWith({
    roles: { [key("user_2", "org_1")]: "owner" },
  });

  const response = await get(
    app,
    callback(`code=c&${withState(stateFor("org_1"))}`),
  );

  assert.deepEqual(roleCalls, [["user_1", "org_1"]]);
  assert.equal(
    response.headers.get("location"),
    "https://app.test/settings/jira?jira=forbidden",
  );
  assert.deepEqual(atlassian.requests, []);
  assert.equal(connections.upserts.length, 0);
});

test("[unhappy-2] the forbidden redirect honours the signed returnTo", async () => {
  const { app } = appWith({ roles: {} });

  const response = await get(
    app,
    callback(
      `code=c&${withState(stateFor("org_1", { returnTo: "/orgs/acme/jira" }))}`,
    ),
  );

  const location = locationOf(response);
  assert.equal(location.origin, "https://app.test");
  assert.equal(location.pathname, "/orgs/acme/jira");
  assert.equal(location.search, "?jira=forbidden");
  assert.equal(location.searchParams.has("missing"), false);
});

test("[unhappy-2] a demoted member's forbidden redirect also honours the signed returnTo", async () => {
  const { app } = appWith({ roles: { [key(dana.id, "org_1")]: "member" } });

  const response = await get(
    app,
    callback(
      `code=c&${withState(stateFor("org_1", { returnTo: "/orgs/acme/jira" }))}`,
    ),
  );

  const location = locationOf(response);
  assert.equal(location.origin, "https://app.test");
  assert.equal(location.pathname, "/orgs/acme/jira");
  assert.equal(location.search, "?jira=forbidden");
});

test("[unhappy-3] a member of another organization only cannot complete a flow for this one", async () => {
  const { app, connections } = appWith({ roles: owner("org_2") });

  const response = await get(
    app,
    callback(`code=c&${withState(stateFor("org_1"))}`),
  );

  assert.equal(jiraParam(response), "forbidden");
  assert.equal(connections.upserts.length, 0);
});

test("[unhappy-3] owning another organization does not lift a plain membership in this one", async () => {
  const { app, connections, atlassian } = appWith({
    roles: {
      [key(dana.id, "org_2")]: "owner",
      [key(dana.id, "org_1")]: "member",
    },
  });

  const response = await get(
    app,
    callback(`code=c&${withState(stateFor("org_1"))}`),
  );

  assert.equal(jiraParam(response), "forbidden");
  assert.equal(connections.upserts.length, 0);
  assert.deepEqual(atlassian.requests, []);
});

// ---------------------------------------------------------------------------
// Rule: a caller who is still a member but neither owner nor admin is refused
// the same way.

for (const [role, why] of [
  ["member", "demoted after starting the flow"],
  ["billing", "a role this code does not know"],
  ["Owner", "the match is case-sensitive"],
  ["ADMIN", "the match is case-sensitive"],
  ["member,member", "no entry is owner or admin"],
  ["administrator", "a whole entry must match, not a prefix"],
] as const) {
  test(`[unhappy-4] role ${JSON.stringify(role)} is forbidden: ${why}`, async () => {
    const { app, connections, atlassian } = appWith({
      roles: { [key(dana.id, "org_1")]: role },
    });

    const response = await get(
      app,
      callback(`code=c&${withState(stateFor("org_1"))}`),
    );

    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get("location"),
      "https://app.test/settings/jira?jira=forbidden",
    );
    assert.deepEqual(atlassian.requests, []);
    assert.equal(connections.upserts.length, 0);
  });
}

test("[unhappy-4] roles separated by a space rather than a comma are one entry, and forbidden", async () => {
  const { app, connections, atlassian } = appWith({
    roles: { [key(dana.id, "org_1")]: "owner admin" },
  });

  const response = await get(
    app,
    callback(`code=c&${withState(stateFor("org_1"))}`),
  );

  assert.equal(
    response.headers.get("location"),
    "https://app.test/settings/jira?jira=forbidden",
  );
  assert.deepEqual(atlassian.requests, []);
  assert.equal(connections.upserts.length, 0);
});

test("[boundary-3] an empty role string is not a role", async () => {
  const { app, connections } = appWith({
    roles: { [key(dana.id, "org_1")]: "" },
  });

  const response = await get(
    app,
    callback(`code=c&${withState(stateFor("org_1"))}`),
  );

  assert.equal(jiraParam(response), "forbidden");
  assert.equal(connections.upserts.length, 0);
});

test("[boundary-3] a role of only separators and whitespace is not a role", async () => {
  const { app, connections, atlassian } = appWith({
    roles: { [key(dana.id, "org_1")]: " , " },
  });

  const response = await get(
    app,
    callback(`code=c&${withState(stateFor("org_1"))}`),
  );

  assert.equal(jiraParam(response), "forbidden");
  assert.equal(connections.upserts.length, 0);
  assert.deepEqual(atlassian.requests, []);
});

// ---------------------------------------------------------------------------
// Rule: the re-check comes after the Atlassian error and state checks, and
// before the code check.

for (const [query, outcome] of [
  ["error=access_denied&error_description=User+denied", "cancelled"],
  ["error=invalid_scope", "error"],
  [`error=access_denied&code=c&${withState(stateFor("org_1"))}`, "cancelled"],
] as const) {
  test(`[boundary-4] Atlassian's own refusal is reported as ${outcome} without asking the store: ${query.split("&")[0] ?? ""}${query.includes("state=") ? " with a valid state" : ""}`, async () => {
    const { app, roleCalls } = appWith({ roles: {} });

    const response = await get(app, callback(query));

    assert.equal(
      response.headers.get("location"),
      `https://app.test/settings/jira?jira=${outcome}`,
    );
    assert.deepEqual(roleCalls, []);
  });
}

test("[boundary-4] a non-cancel Atlassian error alongside a valid state and code asks nothing and stores nothing", async () => {
  const { app, roleCalls, connections, atlassian } = appWith({ roles: {} });

  const response = await get(
    app,
    callback(`error=server_error&code=c&${withState(stateFor("org_1"))}`),
  );

  assert.equal(
    response.headers.get("location"),
    "https://app.test/settings/jira?jira=error",
  );
  assert.deepEqual(roleCalls, []);
  assert.deepEqual(atlassian.requests, []);
  assert.equal(connections.upserts.length, 0);
});

for (const [label, statePart] of [
  ["no state", ""],
  ["an empty state", "&state="],
  [
    "a state signed with another secret",
    `&${withState(
      stateFor("org_1", { secret: "a-different-secret-that-is-long-enough" }),
    )}`,
  ],
  [
    "a state signed for another user",
    `&${withState(stateFor("org_1", { userId: "user_2" }))}`,
  ],
] as const) {
  test(`[boundary-5] a refused state is reported without asking the store: ${label}`, async () => {
    const { app, roleCalls, connections } = appWith({ roles: owner() });

    const response = await get(app, callback(`code=c${statePart}`));

    assert.equal(
      response.headers.get("location"),
      "https://app.test/settings/jira?jira=state",
    );
    assert.deepEqual(roleCalls, []);
    assert.equal(connections.upserts.length, 0);
  });
}

test("[boundary-5] a state just past its ten minutes is refused without asking the store", async () => {
  const { app, roleCalls, connections, atlassian } = appWith({
    roles: owner(),
  });

  const response = await get(
    app,
    callback(
      `code=c&${withState(stateFor("org_1", { issuedAt: NOW - 10 * 60 * 1000 - 1 }))}`,
    ),
  );

  assert.equal(
    response.headers.get("location"),
    "https://app.test/settings/jira?jira=state",
  );
  assert.deepEqual(roleCalls, []);
  assert.deepEqual(atlassian.requests, []);
  assert.equal(connections.upserts.length, 0);
});

for (const [label, roles, codePart, outcome] of [
  ["no entry, no code", {}, "", "forbidden"],
  ["no entry, an empty code", {}, "&code=", "forbidden"],
  ['"member", no code', { [key(dana.id, "org_1")]: "member" }, "", "forbidden"],
  ['"owner", no code', owner(), "", "error"],
  ['"owner", an empty code', owner(), "&code=", "error"],
] as const) {
  test(`[boundary-6] with a valid state and no code, membership decides first: ${label} is ${outcome}`, async () => {
    const { app, roleCalls, atlassian } = appWith({ roles: { ...roles } });

    const response = await get(
      app,
      callback(`${withState(stateFor("org_1"))}${codePart}`),
    );

    assert.equal(jiraParam(response), outcome);
    assert.deepEqual(roleCalls, [["user_1", "org_1"]]);
    assert.deepEqual(atlassian.requests, []);
  });
}

test("[boundary-6] a case-mismatched role with no code is forbidden, not error", async () => {
  const { app, roleCalls, atlassian, connections } = appWith({
    roles: { [key(dana.id, "org_1")]: "Owner" },
  });

  const response = await get(app, callback(withState(stateFor("org_1"))));

  assert.equal(jiraParam(response), "forbidden");
  assert.deepEqual(roleCalls, [["user_1", "org_1"]]);
  assert.deepEqual(atlassian.requests, []);
  assert.equal(connections.upserts.length, 0);
});

// ---------------------------------------------------------------------------
// Rule: a failing membership lookup is a 500, not a redirect.

function appWithRejectingStore() {
  const connections = fakeConnections();
  const atlassian = fakeAtlassian();
  const app = createApp({
    store: createInMemoryStore(),
    corsOrigins: [APP_URL],
    auth: fakeAuth(),
    organizations: organizationStore(() =>
      Promise.reject(new Error("database is on fire")),
    ),
    jira: jiraOptions(connections, atlassian.fetch),
  });
  return { app, connections, atlassian };
}

test("[unhappy-5] a roleOf that rejects is a 500, and nothing reaches Atlassian", async () => {
  const { app, connections, atlassian } = appWithRejectingStore();

  const response = await get(
    app,
    callback(`code=c&${withState(stateFor("org_1"))}`),
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Internal server error." });
  assert.deepEqual(atlassian.requests, []);
  assert.equal(connections.upserts.length, 0);
});

test("[unhappy-5] a roleOf that rejects is a 500 even when the code is missing", async () => {
  const { app, connections, atlassian } = appWithRejectingStore();

  const response = await get(app, callback(withState(stateFor("org_1"))));

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Internal server error." });
  assert.deepEqual(atlassian.requests, []);
  assert.equal(connections.upserts.length, 0);
});

// ---------------------------------------------------------------------------
// Rule: membership is checked once per callback, before the exchange, and is
// not re-checked during it.

test("[boundary-7] a grant covering two sites checks membership once and stores both", async () => {
  const { app, roleCalls, connections } = appWith({
    roles: { [key(dana.id, "org_1")]: "admin" },
    sites: ["cloud-1", "cloud-2"],
  });

  const response = await get(
    app,
    callback(`code=c&${withState(stateFor("org_1"))}`),
  );

  assert.deepEqual(roleCalls, [["user_1", "org_1"]]);
  assert.deepEqual(
    connections.upserts.map(([organizationId, input]) => [
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

test("[boundary-7] a grant covering three sites still checks membership once", async () => {
  const { app, roleCalls, connections } = appWith({
    roles: { [key(dana.id, "org_1")]: "admin" },
    sites: ["cloud-1", "cloud-2", "cloud-3"],
  });

  const response = await get(
    app,
    callback(`code=c&${withState(stateFor("org_1"))}`),
  );

  assert.deepEqual(roleCalls, [["user_1", "org_1"]]);
  assert.equal(connections.upserts.length, 3);
  assert.ok(
    connections.upserts.every(([organizationId]) => organizationId === "org_1"),
  );
  assert.equal(jiraParam(response), "connected");
});

test("[concurrency-1] membership revoked while the token exchange is in flight does not stop the flow", async () => {
  const { app, roleCalls, connections } = appWith({
    roles: owner(),
    onRequest: (href, roles) => {
      if (href.endsWith("/oauth/token")) {
        delete roles[key(dana.id, "org_1")];
      }
    },
  });

  const response = await get(
    app,
    callback(`code=c&${withState(stateFor("org_1"))}`),
  );

  assert.deepEqual(roleCalls, [["user_1", "org_1"]]);
  assert.equal(connections.upserts.length, 1);
  assert.equal(connections.upserts[0]?.[0], "org_1");
  assert.equal(jiraParam(response), "connected");
});

test("[concurrency-1] a demotion landing while the sites are listed does not stop the flow", async () => {
  const { app, roleCalls, connections } = appWith({
    roles: owner(),
    onRequest: (href, roles) => {
      if (href.endsWith("/accessible-resources")) {
        roles[key(dana.id, "org_1")] = "member";
      }
    },
  });

  const response = await get(
    app,
    callback(`code=c&${withState(stateFor("org_1"))}`),
  );

  assert.deepEqual(roleCalls, [["user_1", "org_1"]]);
  assert.equal(connections.upserts.length, 1);
  assert.equal(connections.upserts[0]?.[0], "org_1");
  assert.equal(jiraParam(response), "connected");
});

async function overlapping(roles: RoleTable) {
  const harness = appWith({ roles });
  const [first, second] = await Promise.all([
    get(harness.app, callback(`code=c1&${withState(stateFor("org_1"))}`)),
    get(harness.app, callback(`code=c2&${withState(stateFor("org_2"))}`)),
  ]);
  return { ...harness, first, second };
}

function sortedCalls(calls: RoleCalls): RoleCalls {
  return [...calls].sort((a, b) => a.join(":").localeCompare(b.join(":")));
}

test("[concurrency-2] overlapping callbacks for two organizations are each decided by their own organization", async () => {
  const { first, second, connections, roleCalls } = await overlapping(
    owner("org_1"),
  );

  assert.equal(jiraParam(first), "connected");
  assert.equal(jiraParam(second), "forbidden");
  assert.deepEqual(
    connections.upserts.map(([organizationId]) => organizationId),
    ["org_1"],
  );
  assert.deepEqual(sortedCalls(roleCalls), [
    ["user_1", "org_1"],
    ["user_1", "org_2"],
  ]);
});

test("[concurrency-2] with the roles swapped, the second organization connects and the first is forbidden", async () => {
  const { first, second, connections, roleCalls } = await overlapping(
    owner("org_2"),
  );

  assert.equal(jiraParam(first), "forbidden");
  assert.equal(jiraParam(second), "connected");
  assert.deepEqual(
    connections.upserts.map(([organizationId]) => organizationId),
    ["org_2"],
  );
  assert.deepEqual(sortedCalls(roleCalls), [
    ["user_1", "org_1"],
    ["user_1", "org_2"],
  ]);
});

async function redeemedTwice(roles: RoleTable) {
  const harness = appWith({ roles });
  const path = callback(`code=c&${withState(stateFor("org_1"))}`);
  const responses = await Promise.all([
    get(harness.app, path),
    get(harness.app, path),
  ]);
  return { ...harness, responses };
}

test("[concurrency-3] the same state redeemed twice in parallel is checked on each request", async () => {
  const { responses, roleCalls, connections } = await redeemedTwice(owner());

  assert.deepEqual(responses.map(jiraParam), ["connected", "connected"]);
  assert.deepEqual(roleCalls, [
    ["user_1", "org_1"],
    ["user_1", "org_1"],
  ]);
  assert.deepEqual(
    connections.upserts.map(([organizationId]) => organizationId),
    ["org_1", "org_1"],
  );
});

test("[concurrency-3] the same state redeemed twice in parallel by a non-member is refused on each request", async () => {
  const { responses, roleCalls, connections, atlassian } = await redeemedTwice(
    {},
  );

  assert.deepEqual(responses.map(jiraParam), ["forbidden", "forbidden"]);
  assert.deepEqual(roleCalls, [
    ["user_1", "org_1"],
    ["user_1", "org_1"],
  ]);
  assert.equal(connections.upserts.length, 0);
  assert.deepEqual(atlassian.requests, []);
});

// ---------------------------------------------------------------------------
// Rule: every other route keeps its behaviour.

test("[happy-4] connect still consults the store once, through the membership guard", async () => {
  const { app, roleCalls } = appWith({ roles: owner() });

  const response = await get(app, "/api/v1/orgs/org_1/jira/connect");

  assert.equal(response.status, 302);
  assert.equal(locationOf(response).origin, "https://auth.atlassian.com");
  assert.deepEqual(roleCalls, [["user_1", "org_1"]]);
});

test("[happy-4] connect for a multi-role admin still consults the store exactly once", async () => {
  const { app, roleCalls } = appWith({
    roles: { [key(dana.id, "org_1")]: "member,admin" },
  });

  const response = await get(app, "/api/v1/orgs/org_1/jira/connect");

  assert.equal(response.status, 302);
  assert.equal(locationOf(response).origin, "https://auth.atlassian.com");
  assert.deepEqual(roleCalls, [["user_1", "org_1"]]);
});

for (const [method, path, status] of [
  ["GET", "/api/v1/orgs/org_1/jira/connect", 403],
  ["DELETE", "/api/v1/orgs/org_1/jira/connections/jrc_1", 403],
  ["GET", "/api/v1/orgs/org_2/jira/connect", 404],
  ["GET", "/api/v1/orgs/org_1/jira/connections", 200],
] as const) {
  test(`[unhappy-6] a plain member's ${method} ${path} is still ${status}`, async () => {
    const { app } = appWith({ roles: { [key(dana.id, "org_1")]: "member" } });

    const response = await app.request(path, { method, headers: signedIn });

    assert.equal(response.status, status);
  });
}

test("[unhappy-6] a plain member's disconnect in an organization they are not in is a 404 and removes nothing", async () => {
  const { app, connections } = appWith({
    roles: { [key(dana.id, "org_1")]: "member" },
  });

  const response = await app.request(
    "/api/v1/orgs/org_2/jira/connections/jrc_1",
    { method: "DELETE", headers: signedIn },
  );

  assert.equal(response.status, 404);
  assert.deepEqual(connections.removed, []);
});

test("[unhappy-7] a callback without a session is still a 401 and asks nothing", async () => {
  const { app, roleCalls } = appWith({ roles: owner() });

  const response = await app.request(
    callback(`code=c&${withState(stateFor("org_1"))}`),
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Authentication required.",
  });
  assert.deepEqual(roleCalls, []);
});

test("[unhappy-7] an Atlassian refusal without a session is a 401 and asks nothing", async () => {
  const { app, roleCalls } = appWith({ roles: owner() });

  const response = await app.request(callback("error=access_denied"));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Authentication required.",
  });
  assert.deepEqual(roleCalls, []);
});

function appMissing(absent: "jira" | "organizations") {
  const roleCalls: RoleCalls = [];
  const connections = fakeConnections();
  const atlassian = fakeAtlassian();
  return createApp({
    store: createInMemoryStore(),
    corsOrigins: [APP_URL],
    auth: fakeAuth(),
    ...(absent === "organizations"
      ? {}
      : { organizations: fakeOrganizations(owner(), roleCalls) }),
    ...(absent === "jira"
      ? {}
      : { jira: jiraOptions(connections, atlassian.fetch) }),
  });
}

for (const [given, absent] of [
  ["organizations", "jira"],
  ["jira", "organizations"],
] as const) {
  test(`[boundary-8] with ${given} and without ${absent} the callback is not mounted`, async () => {
    const app = appMissing(absent);

    const response = await get(
      app,
      callback(`code=c&${withState(stateFor("org_1"))}`),
    );

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Not found." });
  });
}

test("[boundary-8] with jira and without organizations, connect is not mounted either", async () => {
  const app = appMissing("organizations");

  const response = await get(app, "/api/v1/orgs/org_1/jira/connect");

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Not found." });
});
