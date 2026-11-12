import assert from "node:assert/strict";
import { test } from "node:test";

import type { BuildInfoDto } from "@sandbox-factory/shared";
import type { EmailStore, UserProfileStore } from "@sandbox-factory/db";

import type { Auth } from "../../src/auth.js";
import { createApp, type AppOptions } from "../../src/routes.js";
import { createInMemoryStore, type SeedTodo } from "../../src/store.js";

// ---- fixtures (the spec's Background) --------------------------------------

const SECRET = "s3cret-Value";
const HEADER = "X-Origin-Verify";
const ORIGIN = "http://localhost:5173";
const FORBIDDEN = { error: "Forbidden." };

const sessionUser = {
  id: "user_1",
  email: "signed-in@example.test",
  name: "Signed In",
};

const todo1: SeedTodo = {
  id: "todo_1",
  userId: sessionUser.id,
  title: "write tests",
  done: false,
  createdAt: "2026-09-16T00:00:00.000Z",
};

function seed(): SeedTodo[] {
  return [{ ...todo1 }];
}

const build: BuildInfoDto = {
  version: "1.4.2",
  gitSha: "7f3a9c1e5b2d8a4f6c0e9b3a1d7f5c2e8a4b6d09",
  gitShortSha: "7f3a9c1",
  buildTime: "2026-09-17T09:14:00.000Z",
  gitRef: "main",
  dirty: false,
};

const healthBody = {
  status: "ok",
  version: "1.4.2",
  sha: "7f3a9c1e5b2d8a4f6c0e9b3a1d7f5c2e8a4b6d09",
};

interface Calls {
  getSession: number;
  handler: number;
  stores: number;
}

function newCalls(): Calls {
  return { getSession: 0, handler: 0, stores: 0 };
}

/** As in routes.test.ts: a session when a "cookie" header is present. */
function fakeAuth(calls?: Calls): Auth {
  return {
    api: {
      getSession: ({ headers }: { headers: Headers }) => {
        if (calls !== undefined) calls.getSession += 1;
        return Promise.resolve(
          headers.get("cookie") !== null
            ? { user: sessionUser, session: { id: `session_${sessionUser.id}` } }
            : null,
        );
      },
    },
    handler: (request: Request) => {
      if (calls !== undefined) calls.handler += 1;
      return Promise.resolve(
        Response.json({ handled: new URL(request.url).pathname }),
      );
    },
  } as unknown as Auth;
}

/** Email and profile stores that count every call into `calls.stores`. */
function fakeEmails(calls?: Calls): EmailStore {
  const bump = () => {
    if (calls !== undefined) calls.stores += 1;
  };
  return {
    primaryFor: () => {
      bump();
      return Promise.resolve(undefined);
    },
    list: () => {
      bump();
      return Promise.resolve([]);
    },
    record: () => {
      bump();
      return Promise.resolve(null);
    },
    setPrimary: () => {
      bump();
      return Promise.resolve(undefined);
    },
    remove: () => {
      bump();
      return Promise.resolve("not-found");
    },
  } as unknown as EmailStore;
}

function fakeProfiles(calls?: Calls): UserProfileStore {
  const bump = () => {
    if (calls !== undefined) calls.stores += 1;
  };
  return {
    get: () => {
      bump();
      return Promise.resolve({ username: "dana" });
    },
    suggest: () => {
      bump();
      return Promise.resolve("dana");
    },
    setUsername: (_userId: string, raw: string) => {
      bump();
      return Promise.resolve({
        status: "ok",
        username: raw.toLowerCase(),
        displayUsername: raw,
      });
    },
  } as unknown as UserProfileStore;
}

const signedIn = { cookie: "better-auth.session_token=test-token" };

function appWith(options: Partial<AppOptions> = {}) {
  return createApp({
    store: createInMemoryStore(seed()),
    corsOrigins: [ORIGIN],
    auth: fakeAuth(),
    buildInfo: build,
    ...options,
  });
}

function guarded(options: Partial<AppOptions> = {}) {
  return appWith({ originVerify: SECRET, ...options });
}

type App = ReturnType<typeof appWith>;

/** Request init with an optional X-Origin-Verify value merged into headers. */
function init(
  header: string | undefined,
  rest: { method?: string; headers?: Record<string, string>; body?: string } = {},
): RequestInit {
  const headers: Record<string, string> = { ...rest.headers };
  if (header !== undefined) headers[HEADER] = header;
  return {
    ...(rest.method === undefined ? {} : { method: rest.method }),
    ...(rest.body === undefined ? {} : { body: rest.body }),
    headers,
  };
}

async function assertForbidden(res: Response, maybeLabel?: string) {
  const label = maybeLabel as string;
  assert.equal(res.status, 403, label);
  assert.match(
    res.headers.get("content-type") ?? "",
    /^application\/json/,
    label,
  );
  assert.deepEqual(await res.json(), FORBIDDEN, label);
}

/**
 * Control: the app's check is installed, i.e. a request for /version without
 * the header is refused. Tests whose outcome is "served" use this so that the
 * outcome they assert is the check *passing*, not the check being absent.
 */
async function assertCheckInstalled(app: App) {
  const res = await app.request("/version");
  assert.equal(res.status, 403, "control: the check is installed");
}

function corsHeaders(res: Response): [string, string][] {
  const out: [string, string][] = [];
  res.headers.forEach((value, name) => {
    if (name.toLowerCase().startsWith("access-control-")) {
      out.push([name.toLowerCase(), value]);
    }
  });
  return out.sort(([a], [b]) => a.localeCompare(b));
}

async function assertOnlyTodo1(res: Response, maybeLabel?: string) {
  const label = maybeLabel as string;
  assert.equal(res.status, 200, label);
  const body = (await res.json()) as { todos: Record<string, unknown>[] };
  assert.equal(body.todos.length, 1, label);
  const [todo] = body.todos;
  assert.equal(todo?.["id"], todo1.id, label);
  assert.equal(todo?.["title"], todo1.title, label);
  assert.equal(todo?.["done"], todo1.done, label);
  assert.equal(todo?.["createdAt"], todo1.createdAt, label);
}

// ---- Rule: originVerify undefined installs no check ------------------------

// Extends "[happy-1] an app without originVerify serves /version whatever
// X-Origin-Verify holds" with other values, each of which a guarded app
// refuses (the control), so the header really is ignored rather than accepted.
test("[happy-1] without originVerify, /version serves header values a guarded app refuses", async () => {
  const values = [
    "wrong",
    "s3cret-value",
    "s3cret-Value, s3cret-Value",
    "x".repeat(300),
  ];
  for (const value of values) {
    const control = await guarded().request("/version", init(value));
    assert.equal(control.status, 403, `control ${value}`);

    const res = await appWith().request("/version", init(value));
    assert.equal(res.status, 200, value);
    assert.deepEqual(await res.json(), build, value);
  }
});

// Extends "[happy-1] boundary: without originVerify an unknown route ..." to
// the auth, session-guarded and CORS paths, with a header a guarded app refuses.
test("[happy-1] without originVerify, auth, todos and CORS ignore a wrong header", async () => {
  const control = await guarded().request(
    "/api/v1/todos",
    init("wrong", { headers: signedIn }),
  );
  assert.equal(control.status, 403, "control");

  const calls = newCalls();
  const app = appWith({ auth: fakeAuth(calls) });

  const todos = await app.request(
    "/api/v1/todos",
    init("wrong", { headers: { ...signedIn, Origin: ORIGIN } }),
  );
  assert.equal(todos.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  await assertOnlyTodo1(todos);

  const authRes = await app.request("/api/auth/session", init("wrong"));
  assert.equal(authRes.status, 200);
  assert.deepEqual(await authRes.json(), { handled: "/api/auth/session" });
  assert.equal(calls.handler, 1);

  const unauth = await app.request("/api/v1/todos", init("wrong"));
  assert.equal(unauth.status, 401);
  assert.deepEqual(await unauth.json(), { error: "Authentication required." });
});

// Extends "[happy-2] originVerify explicitly undefined serves the todos with
// no header": with a wrong header too, and on the no-auth app.
test("[happy-2] originVerify explicitly undefined serves todos with a wrong header and keeps the no-auth 503", async () => {
  const control = await guarded().request(
    "/api/v1/todos",
    init("wrong", { headers: signedIn }),
  );
  assert.equal(control.status, 403, "control");

  const app = appWith({ originVerify: undefined });
  await assertOnlyTodo1(
    await app.request("/api/v1/todos", init("wrong", { headers: signedIn })),
  );
  await assertOnlyTodo1(
    await app.request("/api/v1/todos", init(undefined, { headers: signedIn })),
  );

  const noAuth = appWith({ originVerify: undefined, auth: undefined });
  const res = await noAuth.request("/api/v1/todos", init("wrong"));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), {
    error: "Authentication is not configured.",
  });
  const version = await noAuth.request("/version");
  assert.equal(version.status, 200);
  assert.deepEqual(await version.json(), build);
});

// ---- Rule: originVerify set rejects without the exact header ---------------

// Extends "[happy-3] a request with the matching header is served as it would
// be without the check": more routes and methods, each compared with an app
// built without originVerify.
test("[happy-3] with the matching header, every route answers exactly as the unguarded app does", async () => {
  const requests: [string, string, Record<string, string>, string?][] = [
    ["GET", "/health", {}],
    ["GET", "/version", {}],
    ["GET", "/api/v1/me", signedIn],
    ["GET", "/api/v1/me/username", signedIn],
    [
      "PUT",
      "/api/v1/me/username",
      { ...signedIn, "Content-Type": "application/json" },
      JSON.stringify({ username: "Dana" }),
    ],
    ["PUT", "/api/v1/me/username", signedIn, "not json"],
    ["GET", "/api/v1/me/emails", signedIn],
    ["POST", "/api/v1/me/emails/e_1/primary", signedIn],
    ["DELETE", "/api/v1/me/emails/e_1", signedIn],
    ["GET", "/api/v1/todos/todo_1", signedIn],
    [
      "PATCH",
      "/api/v1/todos/todo_1",
      { ...signedIn, "Content-Type": "application/json" },
      JSON.stringify({ done: true }),
    ],
    [
      "POST",
      "/api/v1/todos",
      { ...signedIn, "Content-Type": "application/json" },
      JSON.stringify({ title: "" }),
    ],
    ["DELETE", "/api/v1/todos/nope", signedIn],
    ["GET", "/api/auth/session", {}],
    ["POST", "/api/auth/sign-out", {}],
    ["GET", "/api/v2/anything", signedIn],
    ["POST", "/health", {}],
  ];
  const options = { emails: fakeEmails(), profiles: fakeProfiles() };
  const app = guarded(options);
  const plain = appWith(options);
  await assertCheckInstalled(app);

  for (const [method, path, headers, body] of requests) {
    const label = `${method} ${path}`;
    const rest = body === undefined ? { method, headers } : { method, headers, body };
    const got = await app.request(path, init(SECRET, rest));
    const want = await plain.request(path, init(SECRET, rest));
    assert.equal(got.status, want.status, label);
    assert.notEqual(got.status, 403, label);
    assert.equal(await got.text(), await want.text(), label);
  }
});

// Extends "[happy-3] ..." with secrets other than the Background's: a
// hard-coded "s3cret-Value" passes the public suite but not this.
test("[happy-3] other secrets are served when matched and the Background secret is refused by them", async () => {
  const secrets = [
    "x",
    "Zq9-long-" + "AbC123".repeat(60),
    "a, a",
    "tok=en/with+base64==",
  ];
  for (const secret of secrets) {
    const app = appWith({ originVerify: secret });
    const wrong = await app.request("/version", init(SECRET));
    assert.equal(wrong.status, 403, `${secret} refuses the Background secret`);

    const res = await app.request(
      "/api/v1/todos",
      init(secret, { headers: signedIn }),
    );
    await assertOnlyTodo1(res, secret);

    const version = await app.request("/version", init(secret));
    assert.equal(version.status, 200, secret);
    assert.deepEqual(await version.json(), build, secret);
  }
});

// Extends "[unhappy-1] a missing or non-matching header is rejected on every
// non-exempt path and method": near misses the public table does not use.
test("[unhappy-1] near-miss values are rejected with the Forbidden JSON", async () => {
  const app = guarded();
  const values = [
    "s3cret-ValuX",
    "S3cret-Value",
    "xs3cret-Value",
    "s3cret-Value-",
    "s3cret Value",
    "s3cret-Value,s3cret-Value",
    "wrong, s3cret-Value",
    "s3cret-Value, wrong",
    "s",
    "s3cret-Value".repeat(2),
    "alpha",
  ];
  for (const value of values) {
    await assertForbidden(
      await app.request("/version", init(value, { headers: signedIn })),
      value,
    );
  }
});

// Extends "[unhappy-1] ...": routes and methods the public table does not
// cover, including the account routes, none of whose stores may be touched.
test("[unhappy-1] account, auth and unknown-method requests are rejected before any handler runs", async () => {
  const calls = newCalls();
  const app = guarded({
    auth: fakeAuth(calls),
    emails: fakeEmails(calls),
    profiles: fakeProfiles(calls),
  });
  const json = { ...signedIn, "Content-Type": "application/json" };
  const cases: [string, string, string | undefined, string?][] = [
    ["PUT", "/api/v1/me/username", undefined, JSON.stringify({ username: "x" })],
    ["GET", "/api/v1/me/username", "wrong"],
    ["GET", "/api/v1/me/emails", ""],
    ["POST", "/api/v1/me/emails/e_1/primary", "S3CRET-VALUE"],
    ["DELETE", "/api/v1/me/emails/e_1", "s3cret-Value2"],
    ["GET", "/api/v1/todos/todo_1", "s3cret-Valu"],
    ["POST", "/api/auth/sign-in/social", undefined, JSON.stringify({ provider: "github" })],
    ["PUT", "/version", undefined],
    ["DELETE", "/version", "wrong"],
    ["PATCH", "/nowhere", "wrong"],
  ];
  for (const [method, path, header, body] of cases) {
    const rest = body === undefined ? { method, headers: json } : { method, headers: json, body };
    await assertForbidden(
      await app.request(path, init(header, rest)),
      `${method} ${path} with ${String(header)}`,
    );
  }
  assert.deepEqual(calls, { getSession: 0, handler: 0, stores: 0 });
});

// Extends "[boundary-1] the comparison is case-sensitive on the value": other
// case mixes, and a secret other than the Background's.
test("[boundary-1] other case mixes are rejected, for another secret too", async () => {
  const app = guarded();
  for (const value of ["s3CRET-vALUE", "S3cret-Value", "s3cret-VALUE"]) {
    assert.equal((await app.request("/version", init(value))).status, 403, value);
  }
  const other = appWith({ originVerify: "Alpha-Key" });
  for (const value of ["alpha-key", "ALPHA-KEY", "Alpha-key", "aLPHA-kEY"]) {
    assert.equal((await other.request("/version", init(value))).status, 403, value);
  }
  assert.equal((await other.request("/version", init("Alpha-Key"))).status, 200);
});

// Extends "[boundary-2] the header name is matched case-insensitively": on a
// session-guarded route and with another secret.
test("[boundary-2] header-name case does not matter on the todos route or for another secret", async () => {
  const app = guarded();
  await assertCheckInstalled(app);
  for (const name of ["x-origin-verify", "X-ORIGIN-VERIFY", "X-origin-Verify", "x-ORIGIN-verify"]) {
    await assertOnlyTodo1(
      await app.request("/api/v1/todos", {
        headers: { ...signedIn, [name]: SECRET },
      }),
      name,
    );
  }
  const other = appWith({ originVerify: "beta" });
  await assertCheckInstalled(other);
  for (const name of ["x-origin-verify", "X-ORIGIN-VERIFY"]) {
    const res = await other.request("/version", { headers: { [name]: "beta" } });
    assert.equal(res.status, 200, name);
  }
});

// Extends "[boundary-3] surrounding spaces stripped by the Headers API ...":
// mixed padding, on another route, and with an interior-space secret.
test("[boundary-3] mixed surrounding whitespace is stripped for other routes and secrets", async () => {
  const app = guarded();
  await assertCheckInstalled(app);
  await assertOnlyTodo1(
    await app.request(
      "/api/v1/todos",
      init(" \t s3cret-Value \t ", { headers: signedIn }),
    ),
  );
  const version = await app.request("/version", init("\t\t s3cret-Value"));
  assert.equal(version.status, 200);

  const spaced = appWith({ originVerify: "a b:c/d=e" });
  await assertCheckInstalled(spaced);
  const res = await spaced.request("/version", init("   a b:c/d=e \t"));
  assert.equal(res.status, 200);
});

// Extends "[boundary-4] a header sent twice is compared as the combined value
// and rejected": orders with a wrong value, three copies, and tuple init. An
// implementation that accepts any one comma-separated value fails these.
test("[boundary-4] repeated headers in any order or count are rejected", async () => {
  const lists: string[][] = [
    ["wrong", SECRET],
    [SECRET, "wrong"],
    [SECRET, SECRET, SECRET],
    ["", SECRET],
  ];
  const calls = newCalls();
  const app = guarded({ auth: fakeAuth(calls) });
  for (const values of lists) {
    const headers = new Headers(signedIn);
    for (const value of values) headers.append(HEADER, value);
    assert.notEqual(headers.get(HEADER), SECRET);
    const res = await app.request("/api/v1/todos", { headers });
    await assertForbidden(res, values.join("|"));
  }
  const tuples = await app.request("/version", {
    headers: [
      [HEADER, SECRET],
      ["x-origin-verify", SECRET],
    ],
  });
  assert.equal(tuples.status, 403);
  assert.equal(calls.getSession, 0);
});

// Extends "[unhappy-2] an unknown route without the header is 403, not 404":
// other unknown paths, methods and values, and the no-auth app.
test("[unhappy-2] unknown routes of every shape are 403 with the Forbidden body", async () => {
  const app = guarded();
  const cases: [string, string, string | undefined][] = [
    ["GET", "/api/v2/anything", undefined],
    ["POST", "/api/v1/todos/todo_1/extra", "wrong"],
    ["PUT", "/a/b/c/d", "S3CRET-VALUE"],
    ["GET", "/api", undefined],
    ["GET", "/", ""],
  ];
  for (const [method, path, header] of cases) {
    await assertForbidden(
      await app.request(path, init(header, { method, headers: signedIn })),
      `${method} ${path}`,
    );
  }
  const noAuth = guarded({ auth: undefined });
  await assertForbidden(await noAuth.request("/nowhere"), "no auth /nowhere");
  await assertForbidden(
    await noAuth.request("/x/y", init("wrong", { method: "DELETE" })),
    "no auth DELETE /x/y",
  );
});

// ---- Rule: the check runs before CORS, auth and every handler --------------

// Extends "[unhappy-3] a rejected request never reaches the session guard":
// every session-guarded route and method, with several bad values.
test("[unhappy-3] no rejected request on any /api/v1 route calls getSession", async () => {
  const calls = newCalls();
  const app = guarded({
    auth: fakeAuth(calls),
    emails: fakeEmails(),
    profiles: fakeProfiles(),
  });
  const cases: [string, string, string | undefined][] = [
    ["GET", "/api/v1/me", undefined],
    ["GET", "/api/v1/me/username", "wrong"],
    ["PUT", "/api/v1/me/username", ""],
    ["GET", "/api/v1/me/emails", "S3CRET-VALUE"],
    ["POST", "/api/v1/todos", "s3cret-Value, s3cret-Value"],
    ["GET", "/api/v1/todos/todo_1", "s3cret-Valu"],
    ["PATCH", "/api/v1/todos/todo_1", undefined],
    ["DELETE", "/api/v1/todos/todo_1", "s3cret-Value "+ "x"],
    ["GET", "/api/v1/unknown", undefined],
  ];
  for (const [method, path, header] of cases) {
    const res = await app.request(path, init(header, { method, headers: signedIn }));
    assert.equal(res.status, 403, `${method} ${path}`);
  }
  assert.equal(calls.getSession, 0);
});

// Extends "[unhappy-4] a rejected unauthenticated request is 403, not 401":
// writes and other session-guarded routes, with the Forbidden body.
test("[unhappy-4] unauthenticated writes and reads without the header are 403, not 401", async () => {
  const app = guarded();
  const cases: [string, string, string | undefined][] = [
    ["POST", "/api/v1/todos", undefined],
    ["PATCH", "/api/v1/todos/todo_1", ""],
    ["DELETE", "/api/v1/todos/todo_1", "S3CRET-VALUE"],
    ["GET", "/api/v1/me", undefined],
    ["GET", "/api/v1/todos/todo_1", "wrong"],
  ];
  for (const [method, path, header] of cases) {
    await assertForbidden(
      await app.request(path, init(header, { method })),
      `${method} ${path}`,
    );
  }
});

// Extends "[happy-4] an accepted unauthenticated request still gets the
// session guard's 401": other routes and methods, and the store is untouched.
test("[happy-4] accepted unauthenticated requests on other routes get the 401 and change nothing", async () => {
  const calls = newCalls();
  const app = guarded({ auth: fakeAuth(calls) });
  await assertCheckInstalled(app);
  const cases: [string, string][] = [
    ["GET", "/api/v1/me"],
    ["GET", "/api/v1/todos/todo_1"],
    ["DELETE", "/api/v1/todos/todo_1"],
    ["PATCH", "/api/v1/todos/todo_1"],
  ];
  for (const [method, path] of cases) {
    const res = await app.request(path, init(SECRET, { method }));
    assert.equal(res.status, 401, `${method} ${path}`);
    assert.deepEqual(await res.json(), { error: "Authentication required." });
  }
  assert.equal(calls.getSession, cases.length);
  await assertOnlyTodo1(
    await app.request("/api/v1/todos", init(SECRET, { headers: signedIn })),
  );
});

// Extends "[unhappy-5] a rejected request never reaches the Better Auth
// handler": more auth paths, methods and bad values.
test("[unhappy-5] no rejected /api/auth request of any method calls the handler", async () => {
  const calls = newCalls();
  const app = guarded({ auth: fakeAuth(calls) });
  const cases: [string, string, string | undefined][] = [
    ["GET", "/api/auth/session", "wrong"],
    ["GET", "/api/auth/get-session", ""],
    ["POST", "/api/auth/sign-in/social", undefined],
    ["GET", "/api/auth/callback/github", "s3cret-Value2"],
    ["DELETE", "/api/auth/x", "s3cret-value"],
    ["GET", "/api/auth/session", "s3cret-Value, s3cret-Value"],
  ];
  for (const [method, path, header] of cases) {
    await assertForbidden(
      await app.request(path, init(header, { method, headers: signedIn })),
      `${method} ${path}`,
    );
  }
  assert.equal(calls.handler, 0);
  assert.equal(calls.getSession, 0);

  // And the handler is still reached once the header matches.
  const ok = await app.request("/api/auth/session", init(SECRET));
  assert.equal(ok.status, 200);
  assert.equal(calls.handler, 1);
});

// Extends "[unhappy-6] a rejected delete does not change the store": a run of
// rejected writes of every kind, then the accepted read.
test("[unhappy-6] a run of rejected creates, updates and deletes leaves the store unchanged", async () => {
  const app = guarded();
  const json = { ...signedIn, "Content-Type": "application/json" };
  const writes: [string, string, string | undefined, string?][] = [
    ["PATCH", "/api/v1/todos/todo_1", "S3CRET-VALUE", JSON.stringify({ title: "hacked", done: true })],
    ["POST", "/api/v1/todos", undefined, JSON.stringify({ title: "intruder" })],
    ["POST", "/api/v1/todos", "s3cret-Value, s3cret-Value", JSON.stringify({ title: "intruder 2" })],
    ["DELETE", "/api/v1/todos/todo_1", "wrong"],
    ["DELETE", "/api/v1/todos/todo_1", ""],
  ];
  for (const [method, path, header, body] of writes) {
    const rest = body === undefined ? { method, headers: json } : { method, headers: json, body };
    const res = await app.request(path, init(header, rest));
    assert.equal(res.status, 403, `${method} ${path}`);
  }
  await assertOnlyTodo1(
    await app.request("/api/v1/todos", init(SECRET, { headers: signedIn })),
  );
  const one = await app.request("/api/v1/todos/todo_1", init(SECRET, { headers: signedIn }));
  assert.equal(one.status, 200);
  const body = (await one.json()) as Record<string, unknown>;
  assert.equal(body["title"], "write tests");
  assert.equal(body["done"], false);
});

// Extends "[unhappy-7] a rejected request carries no CORS headers": no
// Access-Control-* header at all, on several /api routes and values.
test("[unhappy-7] rejected /api requests carry no Access-Control header of any kind", async () => {
  const app = guarded();
  const cases: [string, string | undefined][] = [
    ["/api/v1/todos", "S3CRET-VALUE"],
    ["/api/v1/me", undefined],
    ["/api/auth/session", "wrong"],
    ["/api/v1/nope", ""],
  ];
  for (const [path, header] of cases) {
    const res = await app.request(
      path,
      init(header, { headers: { ...signedIn, Origin: ORIGIN } }),
    );
    await assertForbidden(res, path);
    assert.deepEqual(corsHeaders(res), [], path);
  }
});

// Extends "[unhappy-8] a CORS preflight without the header is rejected": other
// requested methods and headers, other paths, and the Forbidden body.
test("[unhappy-8] preflights for other methods and paths are rejected with no CORS headers", async () => {
  const app = guarded();
  const cases: [string, string, string | undefined][] = [
    ["/api/v1/todos/todo_1", "DELETE", undefined],
    ["/api/v1/todos/todo_1", "PATCH", "wrong"],
    ["/api/auth/sign-in/social", "POST", ""],
    ["/api/v1/me", "GET", "S3CRET-VALUE"],
  ];
  for (const [path, method, header] of cases) {
    const res = await app.request(
      path,
      init(header, {
        method: "OPTIONS",
        headers: {
          Origin: ORIGIN,
          "Access-Control-Request-Method": method,
          "Access-Control-Request-Headers": "content-type",
        },
      }),
    );
    await assertForbidden(res, `${method} ${path}`);
    assert.deepEqual(corsHeaders(res), [], `${method} ${path}`);
  }
});

// Extends "[happy-5] an accepted request gets the usual CORS headers": every
// Access-Control-* header equals the unguarded app's, for simple requests and
// preflights, and for an origin that is not on the list.
test("[happy-5] accepted requests carry exactly the CORS headers the unguarded app sends", async () => {
  const app = guarded();
  const plain = appWith();
  await assertCheckInstalled(app);
  const cases: [string, string, Record<string, string>][] = [
    ["GET", "/api/v1/todos", { ...signedIn, Origin: ORIGIN }],
    ["GET", "/api/auth/session", { Origin: ORIGIN }],
    [
      "OPTIONS",
      "/api/v1/todos/todo_1",
      { Origin: ORIGIN, "Access-Control-Request-Method": "PATCH" },
    ],
    ["GET", "/api/v1/todos", { ...signedIn, Origin: "http://evil.example" }],
  ];
  for (const [method, path, headers] of cases) {
    const label = `${method} ${path} ${headers["Origin"] ?? ""}`;
    const got = await app.request(path, init(SECRET, { method, headers }));
    const want = await plain.request(path, init(SECRET, { method, headers }));
    assert.equal(got.status, want.status, label);
    assert.deepEqual(corsHeaders(got), corsHeaders(want), label);
  }
  const allowed = await app.request(
    "/api/v1/todos",
    init(SECRET, { headers: { ...signedIn, Origin: ORIGIN } }),
  );
  assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.equal(allowed.headers.get("Access-Control-Allow-Credentials"), "true");
});

// ---- Rule: the check is installed whether or not auth is configured --------

// Extends "[unhappy-9] with no auth, a request without the header is 403
// rather than 503": other /api paths, methods and values.
test("[unhappy-9] with no auth, other /api requests without the right header are 403", async () => {
  const app = guarded({ auth: undefined });
  const cases: [string, string, string | undefined][] = [
    ["POST", "/api/v1/todos", undefined],
    ["GET", "/api/v1/me", "S3CRET-VALUE"],
    ["DELETE", "/api/v1/todos/todo_1", ""],
    ["POST", "/api/auth/sign-in/social", "s3cret-Value2"],
    ["OPTIONS", "/api/v1/todos", undefined],
  ];
  for (const [method, path, header] of cases) {
    const res = await app.request(
      path,
      init(header, { method, headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST" } }),
    );
    await assertForbidden(res, `${method} ${path}`);
    assert.deepEqual(corsHeaders(res), [], `${method} ${path}`);
  }
});

// Extends "[happy-6] with no auth, an accepted request still gets the 503":
// the rest of the no-auth app with the matching header.
test("[happy-6] with no auth, accepted requests get the no-auth app's usual answers", async () => {
  const app = guarded({ auth: undefined });
  await assertCheckInstalled(app);
  for (const [method, path] of [
    ["POST", "/api/v1/todos"],
    ["GET", "/api/v1/me"],
    ["DELETE", "/api/v1/todos/todo_1"],
  ] as const) {
    const res = await app.request(path, init(SECRET, { method }));
    assert.equal(res.status, 503, `${method} ${path}`);
    assert.deepEqual(await res.json(), {
      error: "Authentication is not configured.",
    });
  }
  const version = await app.request("/version", init(SECRET));
  assert.equal(version.status, 200);
  assert.deepEqual(await version.json(), build);

  const nowhere = await app.request("/nowhere", init(SECRET));
  assert.equal(nowhere.status, 404);
  assert.deepEqual(await nowhere.json(), { error: "Not found." });
});

// Extends "[unhappy-10] with no auth, /version without the header is 403":
// more values, the Forbidden body, and another secret.
test("[unhappy-10] with no auth, /version with other bad values is 403 with the Forbidden body", async () => {
  const app = guarded({ auth: undefined });
  for (const value of ["", "S3CRET-VALUE", "s3cret-Value, s3cret-Value", "s3cret-Valu"]) {
    await assertForbidden(await app.request("/version", init(value)), value);
  }
  const other = appWith({ auth: undefined, originVerify: "gamma" });
  await assertForbidden(await other.request("/version", init(SECRET)), "gamma");
  assert.equal((await other.request("/version", init("gamma"))).status, 200);
});

// ---- Rule: only the exact path /health is exempt ---------------------------

// Extends "[happy-7] /health answers without a valid header": other values,
// a repeated header, other secrets and the no-auth app.
test("[happy-7] /health answers for any header value, on the no-auth app and for other secrets", async () => {
  const apps: [string, App][] = [
    ["guarded", guarded()],
    ["no auth", guarded({ auth: undefined })],
    ["other secret", appWith({ originVerify: "delta" })],
  ];
  for (const [name, app] of apps) {
    await assertCheckInstalled(app);
    const values = [undefined, "S3CRET-VALUE", "x".repeat(500), "s3cret-Value, s3cret-Value"];
    for (const value of values) {
      const res = await app.request(
        "/health",
        init(value, { headers: { ...signedIn, Origin: ORIGIN } }),
      );
      assert.equal(res.status, 200, `${name} ${String(value)}`);
      assert.deepEqual(await res.json(), healthBody, `${name} ${String(value)}`);
    }
    const headers = new Headers();
    headers.append(HEADER, "wrong");
    headers.append(HEADER, "wrong");
    const repeated = await app.request("/health", { headers });
    assert.equal(repeated.status, 200, `${name} repeated`);
  }
});

// Extends "[boundary-5] a query string does not remove the /health exemption":
// other query strings, the body, and the no-auth app.
test("[boundary-5] other query strings keep the /health exemption, body included", async () => {
  const apps: App[] = [guarded(), guarded({ auth: undefined })];
  for (const app of apps) {
    await assertCheckInstalled(app);
    for (const path of ["/health?", "/health?a=1&b=2", "/health?next=/version", "/health?health"]) {
      const res = await app.request(path, init("wrong"));
      assert.equal(res.status, 200, path);
      assert.deepEqual(await res.json(), healthBody, path);
    }
  }
});

// Extends "[boundary-6] the exemption is by path, not by method": other
// methods, a wrong header, and the no-auth app. The control shows the same
// methods on /version are refused, so the 404 is the exemption at work.
test("[boundary-6] other methods on /health are the JSON 404, while the same on /version are 403", async () => {
  const apps: App[] = [guarded(), guarded({ auth: undefined })];
  for (const app of apps) {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      for (const header of [undefined, "wrong"]) {
        const control = await app.request("/version", init(header, { method }));
        assert.equal(control.status, 403, `control ${method} /version`);

        const res = await app.request("/health", init(header, { method }));
        assert.equal(res.status, 404, `${method} /health ${String(header)}`);
        assert.deepEqual(await res.json(), { error: "Not found." });
      }
    }
  }
});

// Extends "[boundary-7] paths that only look like /health are not exempt":
// more lookalikes, other methods, a wrong header and the no-auth app.
test("[boundary-7] more /health lookalikes are 403 with the Forbidden body", async () => {
  const paths = [
    "/healthcheck",
    "/health.json",
    "/api/v1/health",
    "/x/health",
    "/health/health",
    "/hEALTH",
    "/health/?probe=1",
    "/healthz?probe=1",
    "//health",
  ];
  const apps: [string, App][] = [
    ["guarded", guarded()],
    ["no auth", guarded({ auth: undefined })],
  ];
  for (const [name, app] of apps) {
    for (const path of paths) {
      await assertForbidden(await app.request(path, init("wrong")), `${name} ${path}`);
      await assertForbidden(
        await app.request(path, init(undefined, { method: "POST" })),
        `${name} POST ${path}`,
      );
    }
  }
});

// ---- Rule: an unmatchable originVerify is refused at construction ----------

function assertRefused(options: Partial<AppOptions>, label: string) {
  let app: unknown;
  assert.throws(
    () => {
      app = appWith(options);
    },
    (error: unknown) =>
      error instanceof Error && error.message.includes("originVerify"),
    label,
  );
  assert.equal(app, undefined, label);
}

// Extends "[unhappy-11] createApp throws for an empty or whitespace-padded
// secret": other whitespace characters and positions.
test("[unhappy-11] createApp throws for other whitespace-only and whitespace-padded secrets", () => {
  const values = [
    "\t",
    "   ",
    "\n",
    "\r\n",
    " \t ",
    "\ts3cret-Value",
    "s3cret-Value\n",
    "\r\ns3cret-Value",
    " s3cret-Value ",
    "  a b:c/d=e",
    "x ",
  ];
  for (const value of values) {
    assertRefused({ originVerify: value }, JSON.stringify(value));
  }
});

// Extends "[unhappy-11] ...": the refusal does not depend on auth or the other
// options being configured.
test("[unhappy-11] createApp throws for a bad secret when auth and stores are absent or present", () => {
  for (const value of ["", " s3cret-Value", "s3cret-Value\t"]) {
    assertRefused({ originVerify: value, auth: undefined }, `no auth ${JSON.stringify(value)}`);
    assertRefused(
      { originVerify: value, emails: fakeEmails(), profiles: fakeProfiles() },
      `stores ${JSON.stringify(value)}`,
    );
  }
});

// Extends "[boundary-8] a secret with interior spaces and punctuation is
// accepted verbatim": other interior characters, and each refuses a near miss.
test("[boundary-8] secrets with other interior whitespace and punctuation are accepted verbatim", async () => {
  const cases: [string, string][] = [
    ["a  b", "a b"],
    ["x\ty", "x y"],
    ['k=v; q="z", w', 'k=v; q="z",w'],
    ["!#$%&'*+-.^_`|~:;<>?@[]{}()/\\", "!#$%&'*+-.^_`|~:;<>?@[]{}()/"],
    ["a b:c/d=e", "a b:c/d=E"],
  ];
  for (const [secret, nearMiss] of cases) {
    const app = appWith({ originVerify: secret });
    await assertCheckInstalled(app);
    const res = await app.request("/version", init(secret));
    assert.equal(res.status, 200, JSON.stringify(secret));
    assert.deepEqual(await res.json(), build);
    const miss = await app.request("/version", init(nearMiss));
    assert.equal(miss.status, 403, JSON.stringify(nearMiss));
  }
});

// ---- Rule: the check keeps no state ----------------------------------------

// Extends "[concurrency-1] overlapping requests are each decided on their own
// header": more requests, routes and outcomes, all started together.
test("[concurrency-1] thirty overlapping requests across routes are each decided on their own header", async () => {
  const app = guarded();
  const kinds: [string, string, string | undefined, Record<string, string>, number][] = [
    ["GET", "/version", SECRET, {}, 200],
    ["GET", "/api/v1/todos", undefined, signedIn, 403],
    ["GET", "/api/v1/todos", SECRET, signedIn, 200],
    ["GET", "/health", "wrong", {}, 200],
    ["GET", "/nowhere", SECRET, {}, 404],
    ["GET", "/nowhere", undefined, {}, 403],
    ["GET", "/api/v1/todos", SECRET, {}, 401],
    ["POST", "/health", undefined, {}, 404],
    ["GET", "/version", "S3CRET-VALUE", {}, 403],
    ["GET", "/api/auth/session", SECRET, {}, 200],
  ];
  const plan = Array.from({ length: 30 }, (_, i) => kinds[(i * 7) % kinds.length]!);
  const responses = await Promise.all(
    plan.map(([method, path, header, headers]) =>
      app.request(path, init(header, { method, headers })),
    ),
  );
  assert.deepEqual(
    responses.map((res) => res.status),
    plan.map(([, , , , status]) => status),
  );
});

// Extends "[concurrency-2] two apps with different secrets do not share them":
// four apps, including an unguarded one and a no-auth one, each sent every
// secret at once.
test("[concurrency-2] four apps asked at once with every secret each accept only their own", async () => {
  const apps: [string, App, string | undefined][] = [
    ["alpha", appWith({ originVerify: "alpha" }), "alpha"],
    ["beta", appWith({ originVerify: "beta" }), "beta"],
    ["gamma no auth", appWith({ originVerify: "gamma", auth: undefined }), "gamma"],
    ["unguarded", appWith(), undefined],
  ];
  const values = ["alpha", "beta", "gamma", "delta"];
  const plan = apps.flatMap(([name, app, secret]) =>
    values.map((value) => ({ name, app, secret, value })),
  );
  const responses = await Promise.all(
    plan.map(({ app, value }) => app.request("/version", init(value))),
  );
  assert.deepEqual(
    responses.map((res, i) => `${plan[i]!.name}:${plan[i]!.value}:${res.status}`),
    plan.map(
      ({ name, secret, value }) =>
        `${name}:${value}:${secret === undefined || secret === value ? 200 : 403}`,
    ),
  );
});

// Extends "[boundary-9] a rejected request does not affect the next one":
// many rejections in a row, then alternation, on more than one route.
test("[boundary-9] a long run of rejections does not stop the next matching request", async () => {
  const app = guarded();
  for (let i = 0; i < 25; i += 1) {
    const res = await app.request(
      i % 2 === 0 ? "/version" : "/api/v1/todos",
      init(i % 3 === 0 ? undefined : "wrong", { headers: signedIn }),
    );
    assert.equal(res.status, 403, `rejection ${i}`);
  }
  await assertOnlyTodo1(
    await app.request("/api/v1/todos", init(SECRET, { headers: signedIn })),
  );
  const statuses: number[] = [];
  for (const header of [undefined, SECRET, "wrong", SECRET, SECRET, undefined]) {
    statuses.push((await app.request("/version", init(header))).status);
  }
  assert.deepEqual(statuses, [403, 200, 403, 200, 200, 403]);
});
