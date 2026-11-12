import assert from "node:assert/strict";
import { test } from "node:test";

import type { BuildInfoDto } from "@sandbox-factory/shared";

import type { Auth } from "../src/auth.js";
import { createApp } from "../src/routes.js";
import { createInMemoryStore } from "../src/store.js";

/**
 * Origin verification on `createApp`: with `originVerify` set, every request
 * but `/health` must carry the matching `X-Origin-Verify` header or get
 * 404 `{"error":"Not found"}`, ahead of CORS, auth and every route.
 */

const SECRET = "s3cret-Value";
const ORIGIN = "http://localhost:5173";

const sessionUser = {
  id: "user_1",
  email: "signed-in@example.test",
  name: "Signed In",
};

const todo1 = {
  id: "todo_1",
  userId: "user_1",
  title: "write tests",
  done: false,
  createdAt: "2026-09-16T00:00:00.000Z",
};

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

const rejectedBody = { error: "Not found" };

/** Headers the fake auth accepts as a signed-in session. */
const cookie = { cookie: "better-auth.session_token=test-token" };

/**
 * A stand-in for Better Auth: `getSession` returns `sessionUser` when a
 * "cookie" header is present, and both members count their calls.
 */
function fakeAuth() {
  const calls = { getSession: 0, handler: 0 };
  const auth = {
    api: {
      getSession: ({ headers }: { headers: Headers }) => {
        calls.getSession += 1;
        return Promise.resolve(
          headers.get("cookie") !== null
            ? { user: sessionUser, session: { id: "session_user_1" } }
            : null,
        );
      },
    },
    handler: (request: Request) => {
      calls.handler += 1;
      return Promise.resolve(
        Response.json({ handled: new URL(request.url).pathname }),
      );
    },
  } as unknown as Auth;
  return { auth, calls };
}

interface Setup {
  /** Omit the key entirely when not given. */
  originVerify?: string | undefined;
  withOriginVerifyKey?: boolean;
  noAuth?: boolean;
}

function setup(options: Setup = {}) {
  const store = createInMemoryStore([todo1]);
  const { auth, calls } = fakeAuth();
  const base = {
    store,
    corsOrigins: [ORIGIN],
    buildInfo: build,
    ...(options.noAuth === true ? {} : { auth }),
  };
  const app =
    options.withOriginVerifyKey === true || options.originVerify !== undefined
      ? createApp({ ...base, originVerify: options.originVerify })
      : createApp(base);
  return { app, store, calls };
}

/** Builds request headers; `verify` undefined means the header is absent. */
function headers(
  verify: string | undefined,
  extra: Record<string, string> = {},
): Record<string, string> {
  return verify === undefined
    ? { ...extra }
    : { ...extra, "X-Origin-Verify": verify };
}

function mediaType(res: Response): string | undefined {
  return res.headers.get("content-type")?.split(";")[0]?.trim();
}

/**
 * Asserts the body is `{ todos: [todo_1] }`. The spec's literal body lists
 * `userId`, but it also requires today's behaviour unchanged, and today the
 * store strips the owner from responses; so `userId` is not asserted either way.
 */
async function assertOnlyTodo1(res: Response): Promise<void> {
  const body = (await res.json()) as { todos: Record<string, unknown>[] };
  assert.equal(body.todos.length, 1);
  const [only] = body.todos;
  assert.ok(only);
  assert.equal(only["id"], todo1.id);
  assert.equal(only["title"], todo1.title);
  assert.equal(only["done"], todo1.done);
  assert.equal(only["createdAt"], todo1.createdAt);
}

// ---- happy-1 -------------------------------------------------------------

test("[happy-1] without originVerify, GET /version with no X-Origin-Verify header returns the build record", async () => {
  const { app } = setup();
  const res = await app.request("/version");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), build);
});

test("[happy-1] without originVerify, GET /version with X-Origin-Verify \"anything\" or \"\" returns the build record", async () => {
  const { app } = setup();
  for (const value of ["anything", ""]) {
    const res = await app.request("/version", { headers: headers(value) });
    assert.equal(res.status, 200, `header ${JSON.stringify(value)}`);
    assert.deepEqual(await res.json(), build);
  }
});

// ---- happy-2 -------------------------------------------------------------

test("[happy-2] originVerify passed as undefined serves GET /api/v1/todos without the header", async () => {
  const { app } = setup({ withOriginVerifyKey: true, originVerify: undefined });
  const res = await app.request("/api/v1/todos", { headers: cookie });
  assert.equal(res.status, 200);
  await assertOnlyTodo1(res);
});

test("[happy-2] originVerify passed as undefined ignores an arbitrary X-Origin-Verify header", async () => {
  const { app } = setup({ withOriginVerifyKey: true, originVerify: undefined });
  const res = await app.request("/api/v1/todos", {
    headers: headers("anything", cookie),
  });
  assert.equal(res.status, 200);
  await assertOnlyTodo1(res);
});

// ---- happy-3 -------------------------------------------------------------

test("[happy-3] with the matching header, /version and /api/v1/todos are served as usual", async () => {
  const { app } = setup({ originVerify: SECRET });

  const version = await app.request("/version", {
    headers: headers(SECRET, cookie),
  });
  assert.equal(version.status, 200);
  assert.deepEqual(await version.json(), build);

  const todos = await app.request("/api/v1/todos", {
    headers: headers(SECRET, cookie),
  });
  assert.equal(todos.status, 200);
  await assertOnlyTodo1(todos);
});

test("[happy-3] with the matching header, unknown ids and routes get the app's own 404 bodies", async () => {
  const { app } = setup({ originVerify: SECRET });

  const missingTodo = await app.request("/api/v1/todos/nope", {
    headers: headers(SECRET, cookie),
  });
  assert.equal(missingTodo.status, 404);
  assert.deepEqual(await missingTodo.json(), {
    error: 'No todo with id "nope".',
  });

  for (const path of ["/api/v1/nope", "/nowhere"]) {
    const res = await app.request(path, { headers: headers(SECRET, cookie) });
    assert.equal(res.status, 404, path);
    assert.deepEqual(await res.json(), { error: "Not found." }, path);
  }
});

// ---- happy-4 -------------------------------------------------------------

test("[happy-4] an accepted request without a cookie gets the session guard's 401", async () => {
  const { app } = setup({ originVerify: SECRET });
  const res = await app.request("/api/v1/todos", { headers: headers(SECRET) });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "Authentication required." });
});

test("[happy-4] an accepted request without a cookie on /api/v1/me also gets the 401", async () => {
  const { app } = setup({ originVerify: SECRET });
  const res = await app.request("/api/v1/me", { headers: headers(SECRET) });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "Authentication required." });
});

// ---- happy-5 -------------------------------------------------------------

test("[happy-5] an accepted request gets the usual Access-Control-Allow-Origin header", async () => {
  const { app } = setup({ originVerify: SECRET });
  const res = await app.request("/api/v1/todos", {
    headers: headers(SECRET, { ...cookie, Origin: ORIGIN }),
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
});

test("[happy-5] an accepted CORS preflight gets the usual Access-Control-Allow-Origin header", async () => {
  const { app } = setup({ originVerify: SECRET });
  const res = await app.request("/api/v1/todos", {
    method: "OPTIONS",
    headers: headers(SECRET, {
      Origin: ORIGIN,
      "Access-Control-Request-Method": "POST",
    }),
  });
  assert.notEqual(res.status, 404);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
});

// ---- happy-6 -------------------------------------------------------------

test("[happy-6] with no auth, an accepted GET /api/v1/todos still gets the 503", async () => {
  const { app } = setup({ originVerify: SECRET, noAuth: true });
  const res = await app.request("/api/v1/todos", { headers: headers(SECRET) });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), {
    error: "Authentication is not configured.",
  });
});

test("[happy-6] with no auth, an accepted request under /api/auth also gets the 503", async () => {
  const { app } = setup({ originVerify: SECRET, noAuth: true });
  const res = await app.request("/api/auth/session", {
    headers: headers(SECRET),
  });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), {
    error: "Authentication is not configured.",
  });
});

// ---- happy-7 -------------------------------------------------------------

test("[happy-7] /health answers with no X-Origin-Verify header", async () => {
  const { app } = setup({ originVerify: SECRET });
  const res = await app.request("/health");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), healthBody);
});

test("[happy-7] /health answers whether the header is wrong or right", async () => {
  const { app } = setup({ originVerify: SECRET });
  for (const value of ["wrong", SECRET]) {
    const res = await app.request("/health", { headers: headers(value) });
    assert.equal(res.status, 200, `header ${JSON.stringify(value)}`);
    assert.deepEqual(await res.json(), healthBody);
  }
});

// ---- unhappy-1 -----------------------------------------------------------

async function assertRejected(res: Response, label: string): Promise<void> {
  assert.equal(res.status, 404, label);
  assert.equal(mediaType(res), "application/json", label);
  assert.deepEqual(await res.json(), rejectedBody, label);
}

test("[unhappy-1] requests with no or a plainly wrong header are rejected on every path and method", async () => {
  const { app } = setup({ originVerify: SECRET });
  const rows: [string, string, string | undefined][] = [
    ["GET", "/version", undefined],
    ["GET", "/api/v1/todos", undefined],
    ["POST", "/api/v1/todos", "wrong"],
    ["PATCH", "/api/v1/todos/todo_1", ""],
    ["GET", "/api/v1/nope", undefined],
    ["GET", "/nowhere", undefined],
  ];
  for (const [method, path, value] of rows) {
    const body =
      method === "POST"
        ? JSON.stringify({ title: "new" })
        : method === "PATCH"
          ? JSON.stringify({ done: true })
          : undefined;
    const res = await app.request(path, {
      method,
      headers: headers(value, {
        ...cookie,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      }),
      ...(body === undefined ? {} : { body }),
    });
    await assertRejected(res, `${method} ${path} with ${String(value)}`);
  }
});

test("[unhappy-1] near-miss header values are rejected", async () => {
  const { app } = setup({ originVerify: SECRET });
  const rows: [string, string, string][] = [
    ["DELETE", "/api/v1/todos/todo_1", "s3cret-value"],
    ["GET", "/api/v1/me", "s3cret-Value2"],
    ["GET", "/api/auth/session", "s3cret-Valu"],
  ];
  for (const [method, path, value] of rows) {
    const res = await app.request(path, {
      method,
      headers: headers(value, cookie),
    });
    await assertRejected(res, `${method} ${path} with ${value}`);
  }
});

// ---- unhappy-2 -----------------------------------------------------------

test("[unhappy-2] an unknown route without the header gets the check's 404 body", async () => {
  const { app } = setup({ originVerify: SECRET });
  const res = await app.request("/api/v1/does-not-exist");
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), rejectedBody);
});

test("[unhappy-2] an unknown top-level route with a wrong header gets the check's 404 body", async () => {
  const { app } = setup({ originVerify: SECRET });
  const res = await app.request("/does-not-exist", {
    headers: headers("wrong"),
  });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), rejectedBody);
});

// ---- unhappy-3 -----------------------------------------------------------

test("[unhappy-3] a rejected request never calls getSession", async () => {
  const { app, calls } = setup({ originVerify: SECRET });
  const res = await app.request("/api/v1/todos", { headers: cookie });
  assert.equal(res.status, 404);
  assert.equal(calls.getSession, 0);
});

test("[unhappy-3] a request with a near-miss header never calls getSession", async () => {
  const { app, calls } = setup({ originVerify: SECRET });
  const res = await app.request("/api/v1/todos", {
    headers: headers("s3cret-Valu", cookie),
  });
  assert.equal(res.status, 404);
  assert.equal(calls.getSession, 0);
});

// ---- unhappy-4 -----------------------------------------------------------

test("[unhappy-4] a request with no cookie and no header is 404, not 401", async () => {
  const { app } = setup({ originVerify: SECRET });
  const res = await app.request("/api/v1/todos");
  assert.equal(res.status, 404);
});

test("[unhappy-4] a request with no cookie and an empty header is 404 with the check's body", async () => {
  const { app } = setup({ originVerify: SECRET });
  const res = await app.request("/api/v1/todos", { headers: headers("") });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), rejectedBody);
});

// ---- unhappy-5 -----------------------------------------------------------

test("[unhappy-5] a rejected GET /api/auth/session never calls the auth handler", async () => {
  const { app, calls } = setup({ originVerify: SECRET });
  const res = await app.request("/api/auth/session");
  assert.equal(res.status, 404);
  assert.equal(calls.handler, 0);
});

test("[unhappy-5] a rejected POST under /api/auth with a wrong header never calls the auth handler", async () => {
  const { app, calls } = setup({ originVerify: SECRET });
  const res = await app.request("/api/auth/sign-out", {
    method: "POST",
    headers: headers("wrong", cookie),
  });
  assert.equal(res.status, 404);
  assert.equal(calls.handler, 0);
});

// ---- unhappy-6 -----------------------------------------------------------

test("[unhappy-6] a rejected DELETE leaves todo_1 in the store", async () => {
  const { app } = setup({ originVerify: SECRET });
  const del = await app.request("/api/v1/todos/todo_1", {
    method: "DELETE",
    headers: cookie,
  });
  assert.equal(del.status, 404);

  const list = await app.request("/api/v1/todos", {
    headers: headers(SECRET, cookie),
  });
  assert.equal(list.status, 200);
  await assertOnlyTodo1(list);
});

test("[unhappy-6] a rejected POST with a wrong header adds nothing to the store", async () => {
  const { app } = setup({ originVerify: SECRET });
  const post = await app.request("/api/v1/todos", {
    method: "POST",
    headers: headers("wrong", { ...cookie, "Content-Type": "application/json" }),
    body: JSON.stringify({ title: "sneaked in" }),
  });
  assert.equal(post.status, 404);

  const list = await app.request("/api/v1/todos", {
    headers: headers(SECRET, cookie),
  });
  assert.equal(list.status, 200);
  await assertOnlyTodo1(list);
});

// ---- unhappy-7 -----------------------------------------------------------

test("[unhappy-7] a rejected request from an allowed Origin carries no Access-Control-Allow-Origin", async () => {
  const { app } = setup({ originVerify: SECRET });
  const res = await app.request("/api/v1/todos", {
    headers: { ...cookie, Origin: ORIGIN },
  });
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
});

test("[unhappy-7] a request with a wrong header from an allowed Origin carries no Access-Control-Allow-Origin", async () => {
  const { app } = setup({ originVerify: SECRET });
  const res = await app.request("/api/v1/todos", {
    headers: headers("wrong", { ...cookie, Origin: ORIGIN }),
  });
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
});

// ---- unhappy-8 -----------------------------------------------------------

test("[unhappy-8] a CORS preflight without the header is 404 with no Access-Control-Allow-Origin", async () => {
  const { app } = setup({ originVerify: SECRET });
  const res = await app.request("/api/v1/todos", {
    method: "OPTIONS",
    headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST" },
  });
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
});

test("[unhappy-8] a CORS preflight with a case-changed header value is 404 with no Access-Control-Allow-Origin", async () => {
  const { app } = setup({ originVerify: SECRET });
  const res = await app.request("/api/v1/todos", {
    method: "OPTIONS",
    headers: headers("S3CRET-VALUE", {
      Origin: ORIGIN,
      "Access-Control-Request-Method": "POST",
    }),
  });
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
});

// ---- unhappy-9 -----------------------------------------------------------

test("[unhappy-9] with no auth, GET /api/v1/todos without the header is 404, not 503", async () => {
  const { app } = setup({ originVerify: SECRET, noAuth: true });
  const res = await app.request("/api/v1/todos");
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), rejectedBody);
});

test("[unhappy-9] with no auth, /api/auth/session with a wrong header is 404, not 503", async () => {
  const { app } = setup({ originVerify: SECRET, noAuth: true });
  const res = await app.request("/api/auth/session", {
    headers: headers("wrong"),
  });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), rejectedBody);
});

// ---- unhappy-10 ----------------------------------------------------------

test("[unhappy-10] with no auth, GET /version without the header is 404", async () => {
  const { app } = setup({ originVerify: SECRET, noAuth: true });
  const res = await app.request("/version");
  assert.equal(res.status, 404);
});

test("[unhappy-10] with no auth, GET /version with a lower-cased header value is 404", async () => {
  const { app } = setup({ originVerify: SECRET, noAuth: true });
  const res = await app.request("/version", {
    headers: headers("s3cret-value"),
  });
  assert.equal(res.status, 404);
});

// ---- boundary-1 ----------------------------------------------------------

test("[boundary-1] an upper-cased header value is rejected", async () => {
  const { app } = setup({ originVerify: SECRET });
  const res = await app.request("/version", {
    headers: headers("S3CRET-VALUE"),
  });
  assert.equal(res.status, 404);
});

test("[boundary-1] a header value differing in one letter's case is rejected with the check's body", async () => {
  const { app } = setup({ originVerify: SECRET });
  const res = await app.request("/version", {
    headers: headers("s3cret-value"),
  });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), rejectedBody);
});

// ---- boundary-2 ----------------------------------------------------------

test("[boundary-2] the header named X-Origin-Verify is accepted", async () => {
  const { app } = setup({ originVerify: SECRET });
  const res = await app.request("/version", {
    headers: { "X-Origin-Verify": SECRET },
  });
  assert.equal(res.status, 200);
});

test("[boundary-2] the header name is matched in lower and upper case", async () => {
  const { app } = setup({ originVerify: SECRET });
  for (const name of ["x-origin-verify", "X-ORIGIN-VERIFY"]) {
    const res = await app.request("/version", { headers: { [name]: SECRET } });
    assert.equal(res.status, 200, name);
  }
});

// ---- boundary-3 ----------------------------------------------------------

test("[boundary-3] surrounding spaces stripped by the Headers API do not cause a rejection", async () => {
  const { app } = setup({ originVerify: SECRET });
  const res = await app.request("/version", {
    headers: headers(`  ${SECRET}  `),
  });
  assert.equal(res.status, 200);
});

test("[boundary-3] surrounding tabs stripped by the Headers API do not cause a rejection", async () => {
  const { app } = setup({ originVerify: SECRET });
  const sent = new Headers({ "X-Origin-Verify": `\t${SECRET}\t` });
  assert.equal(sent.get("X-Origin-Verify"), SECRET);
  const res = await app.request("/version", { headers: sent });
  assert.equal(res.status, 200);
});

// ---- boundary-4 ----------------------------------------------------------

test("[boundary-4] the matching header sent twice is seen combined and rejected", async () => {
  const { app } = setup({ originVerify: SECRET });
  const sent = new Headers();
  sent.append("X-Origin-Verify", SECRET);
  sent.append("X-Origin-Verify", SECRET);
  assert.equal(sent.get("X-Origin-Verify"), `${SECRET}, ${SECRET}`);
  const res = await app.request("/version", { headers: sent });
  assert.equal(res.status, 404);
});

test("[boundary-4] a wrong value and the matching value sent together are rejected", async () => {
  const { app } = setup({ originVerify: SECRET });
  const sent = new Headers();
  sent.append("X-Origin-Verify", "wrong");
  sent.append("X-Origin-Verify", SECRET);
  assert.equal(sent.get("X-Origin-Verify"), `wrong, ${SECRET}`);
  const res = await app.request("/version", { headers: sent });
  assert.equal(res.status, 404);
});

// ---- boundary-5 ----------------------------------------------------------

test("[boundary-5] GET /health?probe=1 without the header is still exempt", async () => {
  const { app } = setup({ originVerify: SECRET });
  const res = await app.request("/health?probe=1");
  assert.equal(res.status, 200);
});

test("[boundary-5] GET /health with a multi-key query and a wrong header is still exempt", async () => {
  const { app } = setup({ originVerify: SECRET });
  const res = await app.request("/health?probe=1&from=elb", {
    headers: headers("wrong"),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), healthBody);
});

// ---- boundary-6 ----------------------------------------------------------

test("[boundary-6] POST /health without the header gets the app's own 404, not the check's", async () => {
  const { app } = setup({ originVerify: SECRET });
  const res = await app.request("/health", { method: "POST" });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "Not found." });
});

test("[boundary-6] DELETE /health with a wrong header gets the app's own 404, not the check's", async () => {
  const { app } = setup({ originVerify: SECRET });
  const res = await app.request("/health", {
    method: "DELETE",
    headers: headers("wrong"),
  });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "Not found." });
});

// ---- boundary-7 ----------------------------------------------------------

test("[boundary-7] /healthz, /HEALTH and /api/health without the header are not exempt", async () => {
  const { app } = setup({ originVerify: SECRET });
  for (const path of ["/healthz", "/HEALTH", "/api/health"]) {
    const res = await app.request(path);
    assert.equal(res.status, 404, path);
  }
});

test("[boundary-7] /health/ and /health/extra without the header are not exempt", async () => {
  const { app } = setup({ originVerify: SECRET });
  for (const path of ["/health/", "/health/extra"]) {
    const res = await app.request(path);
    assert.equal(res.status, 404, path);
    assert.deepEqual(await res.json(), rejectedBody, path);
  }
});

// ---- boundary-8 ----------------------------------------------------------

test("[boundary-8] an empty secret installs the check: no header is rejected, an empty header is accepted", async () => {
  let app: ReturnType<typeof setup>["app"] | undefined;
  assert.doesNotThrow(() => {
    app = setup({ originVerify: "" }).app;
  });
  assert.ok(app);

  const missing = await app.request("/version");
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), rejectedBody);

  const empty = await app.request("/version", { headers: headers("") });
  assert.equal(empty.status, 200);
});

test("[boundary-8] an empty secret rejects any non-empty header value", async () => {
  const { app } = setup({ originVerify: "" });
  const res = await app.request("/version", { headers: headers("anything") });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), rejectedBody);
});

// ---- boundary-9 ----------------------------------------------------------

test("[boundary-9] a space-prefixed secret is not trimmed, so the same value sent is rejected but /health answers", async () => {
  let app: ReturnType<typeof setup>["app"] | undefined;
  assert.doesNotThrow(() => {
    app = setup({ originVerify: ` ${SECRET}` }).app;
  });
  assert.ok(app);

  const res = await app.request("/version", { headers: headers(` ${SECRET}`) });
  assert.equal(res.status, 404);

  const health = await app.request("/health");
  assert.equal(health.status, 200);
});

test("[boundary-9] a space-prefixed secret also rejects the unpadded value", async () => {
  const { app } = setup({ originVerify: ` ${SECRET}` });
  const res = await app.request("/version", { headers: headers(SECRET) });
  assert.equal(res.status, 404);
});

// ---- boundary-10 ---------------------------------------------------------

test("[boundary-10] a secret with interior spaces and punctuation is matched verbatim", async () => {
  const { app } = setup({ originVerify: "a b:c/d=e" });
  const res = await app.request("/version", { headers: headers("a b:c/d=e") });
  assert.equal(res.status, 200);
});

test("[boundary-10] a prefix of a punctuated secret is rejected", async () => {
  const { app } = setup({ originVerify: "a b:c/d=e" });
  const res = await app.request("/version", { headers: headers("a b:c/d") });
  assert.equal(res.status, 404);
});

// ---- boundary-11 ---------------------------------------------------------

test("[boundary-11] a rejected request does not affect the next accepted one", async () => {
  const { app } = setup({ originVerify: SECRET });
  const first = await app.request("/version");
  const second = await app.request("/version", { headers: headers(SECRET) });
  assert.equal(first.status, 404);
  assert.equal(second.status, 200);
});

test("[boundary-11] an accepted request does not let the next unverified one through", async () => {
  const { app } = setup({ originVerify: SECRET });
  const first = await app.request("/version", { headers: headers(SECRET) });
  const second = await app.request("/version");
  const third = await app.request("/version", { headers: headers(SECRET) });
  assert.deepEqual(
    [first.status, second.status, third.status],
    [200, 404, 200],
  );
});

// ---- concurrency-1 -------------------------------------------------------

test("[concurrency-1] overlapping requests are each decided on their own header", async () => {
  const { app } = setup({ originVerify: SECRET });
  const responses = await Promise.all([
    app.request("/version", { headers: headers(SECRET) }),
    app.request("/version"),
    app.request("/version", { headers: headers("wrong") }),
    app.request("/health"),
    app.request("/version", { headers: headers(SECRET) }),
  ]);
  assert.deepEqual(
    responses.map((r) => r.status),
    [200, 404, 404, 200, 200],
  );
});

test("[concurrency-1] overlapping requests starting with rejected ones are each decided on their own header", async () => {
  const { app } = setup({ originVerify: SECRET });
  const responses = await Promise.all([
    app.request("/version"),
    app.request("/version", { headers: headers("wrong") }),
    app.request("/version", { headers: headers(SECRET) }),
    app.request("/version"),
    app.request("/health", { headers: headers("wrong") }),
    app.request("/version", { headers: headers(SECRET) }),
  ]);
  assert.deepEqual(
    responses.map((r) => r.status),
    [404, 404, 200, 404, 200, 200],
  );
});

// ---- concurrency-2 -------------------------------------------------------

test("[concurrency-2] two apps with different secrets do not share them: alpha passes A only", async () => {
  const a = setup({ originVerify: "alpha" }).app;
  const b = setup({ originVerify: "beta" }).app;
  const [resA, resB] = await Promise.all([
    a.request("/version", { headers: headers("alpha") }),
    b.request("/version", { headers: headers("alpha") }),
  ]);
  assert.equal(resA.status, 200);
  assert.equal(resB.status, 404);
});

test("[concurrency-2] two apps with different secrets do not share them: beta passes B only", async () => {
  const a = setup({ originVerify: "alpha" }).app;
  const b = setup({ originVerify: "beta" }).app;
  const [resA, resB] = await Promise.all([
    a.request("/version", { headers: headers("beta") }),
    b.request("/version", { headers: headers("beta") }),
  ]);
  assert.equal(resA.status, 404);
  assert.equal(resB.status, 200);
});
