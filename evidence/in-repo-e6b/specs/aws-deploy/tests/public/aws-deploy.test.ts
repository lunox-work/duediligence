import assert from "node:assert/strict";
import { test } from "node:test";

import type { BuildInfoDto } from "@sandbox-factory/shared";

import type { Auth } from "../src/auth.js";
import { createApp, type AppOptions } from "../src/routes.js";
import { createInMemoryStore, type SeedTodo } from "../src/store.js";

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

/** A fresh seed per app, so no test can see another's writes. */
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

/** Call counts for the fake below, for the "never reaches" scenarios. */
interface Calls {
  getSession: number;
  handler: number;
}

/**
 * A stand-in for Better Auth, as in routes.test.ts: `getSession` returns
 * user_1 when a "cookie" header is present, and `handler` echoes the path.
 * Both count their calls into `calls` when one is given.
 */
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

/** Headers the fake above accepts as a signed-in browser session. */
const signedIn = { cookie: "better-auth.session_token=test-token" };

/**
 * The Background's app. `options` is spread last, so a test can override any
 * field, including `auth: undefined` for the no-auth app. `originVerify` is
 * left out unless the test passes it.
 */
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

/**
 * The todos list holds exactly todo_1. Asserted field by field rather than
 * against the whole object: the spec's sample body includes `userId`, but it
 * also says the response is unchanged from today, and the in-memory store
 * strips the owner from what it returns.
 */
async function assertOnlyTodo1(res: Response) {
  const body = (await res.json()) as { todos: Record<string, unknown>[] };
  assert.equal(body.todos.length, 1);
  const [todo] = body.todos;
  assert.equal(todo?.["id"], todo1.id);
  assert.equal(todo?.["title"], todo1.title);
  assert.equal(todo?.["done"], todo1.done);
  assert.equal(todo?.["createdAt"], todo1.createdAt);
}

async function assertForbidden(res: Response) {
  assert.equal(res.status, 403);
  assert.match(res.headers.get("content-type") ?? "", /^application\/json/);
  assert.deepEqual(await res.json(), FORBIDDEN);
}

// ---- Rule: originVerify undefined installs no check ------------------------

test("[happy-1] an app without originVerify serves /version whatever X-Origin-Verify holds", async () => {
  const app = appWith();
  const cases: (string | undefined)[] = [undefined, "anything", ""];
  for (const header of cases) {
    const res = await app.request(
      "/version",
      header === undefined ? {} : { headers: { [HEADER]: header } },
    );
    assert.equal(res.status, 200, `header ${String(header)}`);
    assert.deepEqual(await res.json(), build);
  }
});

test("[happy-1] boundary: without originVerify an unknown route with the header is still the JSON 404", async () => {
  const res = await appWith().request("/nowhere", {
    headers: { [HEADER]: "anything" },
  });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "Not found." });
});

test("[happy-2] originVerify explicitly undefined serves the todos with no header", async () => {
  const res = await appWith({ originVerify: undefined }).request(
    "/api/v1/todos",
    { headers: signedIn },
  );
  assert.equal(res.status, 200);
  await assertOnlyTodo1(res);
});

test("[happy-2] boundary: originVerify explicitly undefined still has the session guard's 401", async () => {
  const res = await appWith({ originVerify: undefined }).request(
    "/api/v1/todos",
  );
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "Authentication required." });
});

// ---- Rule: originVerify set rejects without the exact header ---------------

test("[happy-3] a request with the matching header is served as it would be without the check", async () => {
  const app = guarded();
  const headers = { ...signedIn, [HEADER]: SECRET };

  const version = await app.request("/version", { headers });
  assert.equal(version.status, 200);
  assert.deepEqual(await version.json(), build);

  const todos = await app.request("/api/v1/todos", { headers });
  assert.equal(todos.status, 200);
  await assertOnlyTodo1(todos);

  const missing = await app.request("/api/v1/todos/nope", { headers });
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'No todo with id "nope".' });

  const apiNope = await app.request("/api/v1/nope", { headers });
  assert.equal(apiNope.status, 404);
  assert.deepEqual(await apiNope.json(), { error: "Not found." });

  const nowhere = await app.request("/nowhere", { headers });
  assert.equal(nowhere.status, 404);
  assert.deepEqual(await nowhere.json(), { error: "Not found." });
});

test("[happy-3] boundary: a write with the matching header goes through", async () => {
  const app = guarded();
  const headers = { ...signedIn, [HEADER]: SECRET };

  const res = await app.request("/api/v1/todos/todo_1", {
    method: "DELETE",
    headers,
  });
  assert.equal(res.status, 204);

  const after = await app.request("/api/v1/todos", { headers });
  assert.equal(after.status, 200);
  assert.deepEqual(await after.json(), { todos: [] });
});

test("[unhappy-1] a missing or non-matching header is rejected on every non-exempt path and method", async () => {
  const app = guarded();
  const cases: [string, string, string | undefined][] = [
    ["GET", "/version", undefined],
    ["GET", "/api/v1/todos", undefined],
    ["POST", "/api/v1/todos", "wrong"],
    ["PATCH", "/api/v1/todos/todo_1", ""],
    ["DELETE", "/api/v1/todos/todo_1", "s3cret-value"],
    ["GET", "/api/v1/me", "s3cret-Value2"],
    ["GET", "/api/auth/session", "s3cret-Valu"],
    ["GET", "/api/v1/nope", undefined],
    ["GET", "/nowhere", undefined],
  ];
  for (const [method, path, header] of cases) {
    const headers: Record<string, string> = { ...signedIn };
    if (header !== undefined) headers[HEADER] = header;
    const res = await app.request(path, { method, headers });
    assert.equal(res.status, 403, `${method} ${path} with ${String(header)}`);
    assert.match(res.headers.get("content-type") ?? "", /^application\/json/);
    assert.deepEqual(await res.json(), FORBIDDEN);
  }
});

test("[unhappy-1] boundary: the secret under a different header name is rejected", async () => {
  const res = await guarded().request("/version", {
    headers: { ...signedIn, "X-Origin-Verified": SECRET },
  });
  await assertForbidden(res);
});

test("[boundary-1] the comparison is case-sensitive on the value", async () => {
  const res = await guarded().request("/version", {
    headers: { [HEADER]: "S3CRET-VALUE" },
  });
  assert.equal(res.status, 403);
});

test("[boundary-1] boundary: a single differing letter case is rejected", async () => {
  const res = await guarded().request("/version", {
    headers: { [HEADER]: "s3cret-ValuE" },
  });
  assert.equal(res.status, 403);
});

test("[boundary-2] the header name is matched case-insensitively", async () => {
  const app = guarded();
  for (const name of ["X-Origin-Verify", "x-origin-verify", "X-ORIGIN-VERIFY"]) {
    const res = await app.request("/version", { headers: { [name]: SECRET } });
    assert.equal(res.status, 200, name);
  }
});

test("[boundary-2] boundary: a mixed-case header name is matched", async () => {
  const res = await guarded().request("/version", {
    headers: { "x-Origin-VERIFY": SECRET },
  });
  assert.equal(res.status, 200);
});

test("[boundary-3] surrounding spaces stripped by the Headers API do not cause a rejection", async () => {
  const res = await guarded().request("/version", {
    headers: { [HEADER]: "  s3cret-Value  " },
  });
  assert.equal(res.status, 200);
});

test("[boundary-3] boundary: surrounding tabs stripped by the Headers API do not cause a rejection", async () => {
  const res = await guarded().request("/version", {
    headers: { [HEADER]: "\ts3cret-Value\t" },
  });
  assert.equal(res.status, 200);
});

test("[boundary-4] a header sent twice is compared as the combined value and rejected", async () => {
  const headers = new Headers();
  headers.append(HEADER, SECRET);
  headers.append(HEADER, SECRET);
  assert.equal(headers.get(HEADER), "s3cret-Value, s3cret-Value");

  const res = await guarded().request("/version", { headers });
  assert.equal(res.status, 403);
});

test("[boundary-4] boundary: the secret followed by an empty repeat is rejected", async () => {
  const headers = new Headers();
  headers.append(HEADER, SECRET);
  headers.append(HEADER, "");
  assert.notEqual(headers.get(HEADER), SECRET);

  const res = await guarded().request("/version", { headers });
  assert.equal(res.status, 403);
});

test("[unhappy-2] an unknown route without the header is 403, not 404", async () => {
  const res = await guarded().request("/api/v1/does-not-exist");
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), FORBIDDEN);
});

test("[unhappy-2] boundary: an unknown route outside /api with a wrong header is 403, not 404", async () => {
  const res = await guarded().request("/does-not-exist", {
    method: "POST",
    headers: { [HEADER]: "wrong" },
  });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), FORBIDDEN);
});

// ---- Rule: the check runs before CORS, auth and every handler --------------

test("[unhappy-3] a rejected request never reaches the session guard", async () => {
  const calls: Calls = { getSession: 0, handler: 0 };
  const res = await guarded({ auth: fakeAuth(calls) }).request(
    "/api/v1/todos",
    { headers: signedIn },
  );
  assert.equal(res.status, 403);
  assert.equal(calls.getSession, 0);
});

test("[unhappy-3] boundary: a wrong header never reaches the session guard either", async () => {
  const calls: Calls = { getSession: 0, handler: 0 };
  const res = await guarded({ auth: fakeAuth(calls) }).request(
    "/api/v1/todos",
    { headers: { ...signedIn, [HEADER]: "wrong" } },
  );
  assert.equal(res.status, 403);
  assert.equal(calls.getSession, 0);
});

test("[unhappy-4] a rejected unauthenticated request is 403, not 401", async () => {
  const res = await guarded().request("/api/v1/todos");
  assert.equal(res.status, 403);
});

test("[unhappy-4] boundary: an unauthenticated request with a wrong header is 403 with the Forbidden body", async () => {
  const res = await guarded().request("/api/v1/todos", {
    headers: { [HEADER]: "wrong" },
  });
  await assertForbidden(res);
});

test("[happy-4] an accepted unauthenticated request still gets the session guard's 401", async () => {
  const res = await guarded().request("/api/v1/todos", {
    headers: { [HEADER]: SECRET },
  });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "Authentication required." });
});

test("[happy-4] boundary: an accepted unauthenticated write still gets the 401", async () => {
  const res = await guarded().request("/api/v1/todos", {
    method: "POST",
    headers: { "Content-Type": "application/json", [HEADER]: SECRET },
    body: JSON.stringify({ title: "buy milk" }),
  });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "Authentication required." });
});

test("[unhappy-5] a rejected request never reaches the Better Auth handler", async () => {
  const calls: Calls = { getSession: 0, handler: 0 };
  const res = await guarded({ auth: fakeAuth(calls) }).request(
    "/api/auth/session",
  );
  assert.equal(res.status, 403);
  assert.equal(calls.handler, 0);
});

test("[unhappy-5] boundary: a wrong-case header on an auth POST never reaches the handler", async () => {
  const calls: Calls = { getSession: 0, handler: 0 };
  const res = await guarded({ auth: fakeAuth(calls) }).request(
    "/api/auth/sign-out",
    { method: "POST", headers: { [HEADER]: "S3CRET-VALUE" } },
  );
  assert.equal(res.status, 403);
  assert.equal(calls.handler, 0);
});

test("[unhappy-6] a rejected delete does not change the store", async () => {
  const app = guarded();
  const res = await app.request("/api/v1/todos/todo_1", {
    method: "DELETE",
    headers: signedIn,
  });
  assert.equal(res.status, 403);

  const after = await app.request("/api/v1/todos", {
    headers: { ...signedIn, [HEADER]: SECRET },
  });
  assert.equal(after.status, 200);
  await assertOnlyTodo1(after);
});

test("[unhappy-6] boundary: a rejected create with a wrong header adds nothing", async () => {
  const app = guarded();
  const res = await app.request("/api/v1/todos", {
    method: "POST",
    headers: {
      ...signedIn,
      "Content-Type": "application/json",
      [HEADER]: "wrong",
    },
    body: JSON.stringify({ title: "buy milk" }),
  });
  assert.equal(res.status, 403);

  const after = await app.request("/api/v1/todos", {
    headers: { ...signedIn, [HEADER]: SECRET },
  });
  assert.equal(after.status, 200);
  await assertOnlyTodo1(after);
});

test("[unhappy-7] a rejected request carries no CORS headers", async () => {
  const res = await guarded().request("/api/v1/todos", {
    headers: { ...signedIn, Origin: ORIGIN },
  });
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
});

test("[unhappy-7] boundary: a rejected request with a wrong header carries no CORS headers", async () => {
  const res = await guarded().request("/api/v1/todos", {
    headers: { ...signedIn, Origin: ORIGIN, [HEADER]: "wrong" },
  });
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(res.headers.get("Access-Control-Allow-Credentials"), null);
});

test("[unhappy-8] a CORS preflight without the header is rejected", async () => {
  const res = await guarded().request("/api/v1/todos", {
    method: "OPTIONS",
    headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST" },
  });
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
});

test("[unhappy-8] boundary: a CORS preflight with a wrong header is rejected", async () => {
  const res = await guarded().request("/api/v1/todos", {
    method: "OPTIONS",
    headers: {
      Origin: ORIGIN,
      "Access-Control-Request-Method": "POST",
      [HEADER]: "s3cret-value",
    },
  });
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
});

test("[happy-5] an accepted request gets the usual CORS headers", async () => {
  const res = await guarded().request("/api/v1/todos", {
    headers: { ...signedIn, Origin: ORIGIN, [HEADER]: SECRET },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
});

test("[happy-5] boundary: an accepted CORS preflight gets the usual CORS headers", async () => {
  const res = await guarded().request("/api/v1/todos", {
    method: "OPTIONS",
    headers: {
      Origin: ORIGIN,
      "Access-Control-Request-Method": "POST",
      [HEADER]: SECRET,
    },
  });
  assert.notEqual(res.status, 403);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
});

// ---- Rule: the check is installed whether or not auth is configured --------

test("[unhappy-9] with no auth, a request without the header is 403 rather than 503", async () => {
  const res = await guarded({ auth: undefined }).request("/api/v1/todos");
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), FORBIDDEN);
});

test("[unhappy-9] boundary: with no auth, an auth route with a wrong header is 403 rather than 503", async () => {
  const res = await guarded({ auth: undefined }).request("/api/auth/session", {
    headers: { [HEADER]: "wrong" },
  });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), FORBIDDEN);
});

test("[happy-6] with no auth, an accepted request still gets the 503", async () => {
  const res = await guarded({ auth: undefined }).request("/api/v1/todos", {
    headers: { [HEADER]: SECRET },
  });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), {
    error: "Authentication is not configured.",
  });
});

test("[happy-6] boundary: with no auth, an accepted auth route still gets the 503", async () => {
  const res = await guarded({ auth: undefined }).request("/api/auth/session", {
    headers: { [HEADER]: SECRET },
  });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), {
    error: "Authentication is not configured.",
  });
});

test("[unhappy-10] with no auth, /version without the header is 403", async () => {
  const res = await guarded({ auth: undefined }).request("/version");
  assert.equal(res.status, 403);
});

test("[unhappy-10] boundary: with no auth, /version with a wrong header is 403", async () => {
  const res = await guarded({ auth: undefined }).request("/version", {
    headers: { [HEADER]: "wrong" },
  });
  assert.equal(res.status, 403);
});

// ---- Rule: only the exact path /health is exempt ---------------------------

test("[happy-7] /health answers without a valid header", async () => {
  const app = guarded();
  const cases: (string | undefined)[] = [undefined, "wrong", SECRET];
  for (const header of cases) {
    const res = await app.request(
      "/health",
      header === undefined ? {} : { headers: { [HEADER]: header } },
    );
    assert.equal(res.status, 200, `header ${String(header)}`);
    assert.deepEqual(await res.json(), healthBody);
  }
});

test("[happy-7] boundary: /health answers with an empty header", async () => {
  const res = await guarded().request("/health", { headers: { [HEADER]: "" } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), healthBody);
});

test("[boundary-5] a query string does not remove the /health exemption", async () => {
  const res = await guarded().request("/health?probe=1");
  assert.equal(res.status, 200);
});

test("[boundary-5] boundary: a multi-parameter query with a wrong header keeps the exemption", async () => {
  const res = await guarded().request("/health?probe=1&x-origin-verify=no", {
    headers: { [HEADER]: "wrong" },
  });
  assert.equal(res.status, 200);
});

test("[boundary-6] the exemption is by path, not by method: POST /health is the JSON 404", async () => {
  const res = await guarded().request("/health", { method: "POST" });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "Not found." });
});

test("[boundary-6] boundary: DELETE /health without the header is the JSON 404", async () => {
  const res = await guarded().request("/health", { method: "DELETE" });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "Not found." });
});

test("[boundary-7] paths that only look like /health are not exempt", async () => {
  const app = guarded();
  for (const path of [
    "/health/",
    "/healthz",
    "/HEALTH",
    "/api/health",
    "/health/extra",
  ]) {
    const res = await app.request(path);
    assert.equal(res.status, 403, path);
  }
});

test("[boundary-7] boundary: a capitalised /Health is not exempt", async () => {
  const res = await guarded().request("/Health");
  assert.equal(res.status, 403);
});

// ---- Rule: an unmatchable originVerify is refused at construction ----------

test("[unhappy-11] createApp throws for an empty or whitespace-padded secret", () => {
  for (const value of ["", " ", " s3cret-Value", "s3cret-Value\t"]) {
    let app: unknown;
    assert.throws(
      () => {
        app = appWith({ originVerify: value });
      },
      (error: unknown) =>
        error instanceof Error && error.message.includes("originVerify"),
      JSON.stringify(value),
    );
    assert.equal(app, undefined);
  }
});

test("[unhappy-11] boundary: createApp throws for a secret with a single trailing space", () => {
  let app: unknown;
  assert.throws(
    () => {
      app = appWith({ originVerify: "s3cret-Value " });
    },
    (error: unknown) =>
      error instanceof Error && error.message.includes("originVerify"),
  );
  assert.equal(app, undefined);
});

test("[boundary-8] a secret with interior spaces and punctuation is accepted verbatim", async () => {
  const res = await appWith({ originVerify: "a b:c/d=e" }).request(
    "/version",
    { headers: { [HEADER]: "a b:c/d=e" } },
  );
  assert.equal(res.status, 200);
});

test("[boundary-8] boundary: the interior spaces are not collapsed, so a doubled space is rejected", async () => {
  const res = await appWith({ originVerify: "a b:c/d=e" }).request(
    "/version",
    { headers: { [HEADER]: "a  b:c/d=e" } },
  );
  assert.equal(res.status, 403);
});

// ---- Rule: the check keeps no state ----------------------------------------

test("[concurrency-1] overlapping requests are each decided on their own header", async () => {
  const app = guarded();
  const requests: [string, string | undefined][] = [
    ["/version", SECRET],
    ["/version", undefined],
    ["/version", "wrong"],
    ["/health", undefined],
    ["/version", SECRET],
  ];
  const responses = await Promise.all(
    requests.map(([path, header]) =>
      app.request(
        path,
        header === undefined ? {} : { headers: { [HEADER]: header } },
      ),
    ),
  );
  assert.deepEqual(
    responses.map((res) => res.status),
    [200, 403, 403, 200, 200],
  );
});

test("[concurrency-1] boundary: ten alternating overlapping requests are each decided on their own header", async () => {
  const app = guarded();
  const withHeader = Array.from({ length: 10 }, (_, i) => i % 2 === 1);
  const responses = await Promise.all(
    withHeader.map((has) =>
      app.request("/version", has ? { headers: { [HEADER]: SECRET } } : {}),
    ),
  );
  assert.deepEqual(
    responses.map((res) => res.status),
    withHeader.map((has) => (has ? 200 : 403)),
  );
});

test("[concurrency-2] two apps with different secrets do not share them", async () => {
  const a = appWith({ originVerify: "alpha" });
  const b = appWith({ originVerify: "beta" });
  const [resA, resB] = await Promise.all([
    a.request("/version", { headers: { [HEADER]: "alpha" } }),
    b.request("/version", { headers: { [HEADER]: "alpha" } }),
  ]);
  assert.equal(resA.status, 200);
  assert.equal(resB.status, 403);
});

test("[concurrency-2] boundary: the other app's secret is refused in the other direction too", async () => {
  const a = appWith({ originVerify: "alpha" });
  const b = appWith({ originVerify: "beta" });
  const [resA, resB] = await Promise.all([
    a.request("/version", { headers: { [HEADER]: "beta" } }),
    b.request("/version", { headers: { [HEADER]: "beta" } }),
  ]);
  assert.equal(resA.status, 403);
  assert.equal(resB.status, 200);
});

test("[boundary-9] a rejected request does not affect the next one", async () => {
  const app = guarded();
  const first = await app.request("/version");
  const second = await app.request("/version", {
    headers: { [HEADER]: SECRET },
  });
  assert.equal(first.status, 403);
  assert.equal(second.status, 200);
});

test("[boundary-9] boundary: an accepted request does not let the next unheadered one through", async () => {
  const app = guarded();
  const first = await app.request("/version", {
    headers: { [HEADER]: SECRET },
  });
  const second = await app.request("/version");
  assert.equal(first.status, 200);
  assert.equal(second.status, 403);
});
