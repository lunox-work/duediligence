import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import { buildInfoSchema, type BuildInfoDto } from "@sandbox-factory/shared";

import { parseEnv } from "../src/env.js";
import { resolveImageDigest } from "../src/image-digest.js";
import { createApp } from "../src/routes.js";
import { createInMemoryStore } from "../src/store.js";

const DIGEST_A =
  "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const DIGEST_B =
  "sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

/**
 * Two metadata endpoints "served by the test". There is no real network: the
 * global `fetch` is replaced per test by a fake that answers these URLs from a
 * route table, and refuses the connection for any URL not in it.
 */
const URI_A = "http://169.254.170.2/v4/task-a-container";
const URI_B = "http://169.254.170.2/v4/task-b-container";
/** Nothing is routed here, so the fake refuses the connection. */
const URI_REFUSED = "http://127.0.0.1:9/v4/nothing-listens";

const KEY = "ECS_CONTAINER_METADATA_URI_V4";

/** Never settles; the fake fetch rejects it only when the request is aborted. */
const NEVER = Symbol("never responds");

type Handler = () => Response | typeof NEVER;

interface FakeRequest {
  url: string;
  method: string;
}

interface FakeEndpoints {
  routes: Map<string, Handler>;
  requests: FakeRequest[];
}

function ok(body: unknown): Handler {
  return () => Response.json(body, { status: 200 });
}

/**
 * Replaces the global `fetch` for the duration of one test. `URI_A` and
 * `URI_B` answer as the spec's Background says unless the test overrides them.
 */
function fakeEndpoints(
  t: TestContext,
  overrides: Record<string, Handler> = {},
): FakeEndpoints {
  const routes = new Map<string, Handler>([
    [URI_A, ok({ ImageID: DIGEST_A })],
    [URI_B, ok({ ImageID: DIGEST_B })],
  ]);
  for (const [url, handler] of Object.entries(overrides)) {
    routes.set(url, handler);
  }
  const requests: FakeRequest[] = [];
  const fake = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    // Builds a Request exactly as fetch would, so an invalid URL is rejected
    // with the same TypeError the real fetch gives.
    const req = new Request(input, init);
    requests.push({ url: req.url, method: req.method });
    const signal = req.signal;
    if (signal.aborted) throw signal.reason;
    const handler = routes.get(req.url);
    if (handler === undefined) {
      const cause = Object.assign(new Error("connect ECONNREFUSED"), {
        code: "ECONNREFUSED",
      });
      throw new TypeError("fetch failed", { cause });
    }
    const res = handler();
    if (res !== NEVER) return res;
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
    });
  };
  t.mock.method(globalThis, "fetch", fake);
  return { routes, requests };
}

/** Fails the test if anything is written to the console. */
function silentConsole(t: TestContext) {
  return [
    t.mock.method(console, "log", () => {}),
    t.mock.method(console, "info", () => {}),
    t.mock.method(console, "warn", () => {}),
    t.mock.method(console, "error", () => {}),
    t.mock.method(console, "debug", () => {}),
  ];
}

type Settled =
  | { status: "fulfilled"; value: string | undefined }
  | { status: "rejected"; reason: unknown };

async function settle(p: Promise<string | undefined>): Promise<Settled> {
  try {
    return { status: "fulfilled", value: await p };
  } catch (reason) {
    return { status: "rejected", reason };
  }
}

/** Lets pending promise callbacks run. setImmediate is never mocked here. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

// --- @happy -----------------------------------------------------------------

test("[happy-1] the digest reported by the runtime is returned verbatim", async (t) => {
  const endpoints = fakeEndpoints(t);
  const result = await resolveImageDigest({ [KEY]: URI_A });
  assert.deepEqual(endpoints.requests, [{ url: URI_A, method: "GET" }]);
  assert.equal(result, DIGEST_A);
});

test("[happy-1] the request goes to exactly the URI given, path and query included", async (t) => {
  const uri = "http://169.254.170.2/v4/0f1e2d3c-container?probe=1";
  const endpoints = fakeEndpoints(t, { [uri]: ok({ ImageID: DIGEST_B }) });
  const result = await resolveImageDigest({ [KEY]: uri });
  assert.deepEqual(endpoints.requests, [{ url: uri, method: "GET" }]);
  assert.equal(result, DIGEST_B);
});

test("[happy-2] other keys in the environment do not affect the result", async (t) => {
  fakeEndpoints(t);
  const result = await resolveImageDigest({
    [KEY]: URI_B,
    IMAGE_DIGEST: DIGEST_A,
    BUILD_SHA: "7f3a9c1e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a",
    PORT: "4000",
  });
  assert.equal(result, DIGEST_B);
});

test("[happy-2] no key of env other than the metadata URI is read", async (t) => {
  fakeEndpoints(t);
  const target: NodeJS.ProcessEnv = {
    [KEY]: URI_B,
    IMAGE_DIGEST: DIGEST_A,
    BUILD_SHA: "7f3a9c1e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a",
    PORT: "4000",
  };
  const read = new Set<string>();
  const env = new Proxy(target, {
    get(obj, prop, receiver) {
      if (typeof prop === "string") read.add(prop);
      return Reflect.get(obj, prop, receiver);
    },
  });
  const result = await resolveImageDigest(env);
  assert.equal(result, DIGEST_B);
  assert.deepEqual([...read], [KEY]);
});

test("[happy-3] other fields in the metadata body do not affect the result", async (t) => {
  fakeEndpoints(t, {
    [URI_A]: ok({
      DockerId: "abc",
      Name: "api",
      Image: "sandbox-factory-api:latest",
      ImageID: DIGEST_A,
      Labels: {},
    }),
  });
  assert.equal(await resolveImageDigest({ [KEY]: URI_A }), DIGEST_A);
});

test("[happy-3] a digest in a field other than ImageID is not used", async (t) => {
  fakeEndpoints(t, {
    [URI_A]: ok({
      Image: `sandbox-factory-api@${DIGEST_B}`,
      ImageID: DIGEST_A,
      Digest: DIGEST_B,
    }),
  });
  assert.equal(await resolveImageDigest({ [KEY]: URI_A }), DIGEST_A);
});

for (const [name, value] of [
  [
    "an ECR reference",
    `123456789012.dkr.ecr.eu-west-1.amazonaws.com/sandbox-factory-api@${DIGEST_A}`,
  ],
  ["a tagged reference", `sandbox-factory-api:1.4.2@${DIGEST_A}`],
] as const) {
  test(`[happy-4] ${name} with the digest appended is reduced to the digest`, async (t) => {
    fakeEndpoints(t, { [URI_A]: ok({ ImageID: value }) });
    assert.equal(await resolveImageDigest({ [KEY]: URI_A }), DIGEST_A);
  });
}

test("[happy-4] with more than one @ only the part after the last one is kept", async (t) => {
  fakeEndpoints(t, {
    [URI_A]: ok({ ImageID: `proxy@mirror/sandbox-factory-api@${DIGEST_A}` }),
  });
  assert.equal(await resolveImageDigest({ [KEY]: URI_A }), DIGEST_A);
});

test("[happy-5] the result is a Promise that resolves to the digest", async (t) => {
  fakeEndpoints(t);
  const pending = resolveImageDigest({ [KEY]: URI_A });
  assert.ok(pending instanceof Promise);
  assert.equal(await pending, DIGEST_A);
});

test("[happy-5] the result is a Promise even when no request is made", async (t) => {
  const endpoints = fakeEndpoints(t);
  const pending = resolveImageDigest({});
  assert.ok(pending instanceof Promise);
  assert.equal(await pending, undefined);
  assert.equal(endpoints.requests.length, 0);
});

test("[happy-6] with no argument the resolver reads process.env", async (t) => {
  const endpoints = fakeEndpoints(t);
  const had = Object.hasOwn(process.env, KEY);
  const before = process.env[KEY];
  try {
    process.env[KEY] = URI_A;
    assert.equal(await resolveImageDigest(), DIGEST_A);
    delete process.env[KEY];
    assert.equal(await resolveImageDigest(), undefined);
    assert.deepEqual(endpoints.requests, [{ url: URI_A, method: "GET" }]);
  } finally {
    if (had) process.env[KEY] = before;
    else delete process.env[KEY];
  }
});

test("[happy-6] with no argument an empty process.env value resolves to undefined", async (t) => {
  const endpoints = fakeEndpoints(t);
  const had = Object.hasOwn(process.env, KEY);
  const before = process.env[KEY];
  try {
    process.env[KEY] = URI_B;
    assert.equal(await resolveImageDigest(), DIGEST_B);
    process.env[KEY] = "";
    assert.equal(await resolveImageDigest(), undefined);
    assert.equal(endpoints.requests.length, 1);
  } finally {
    if (had) process.env[KEY] = before;
    else delete process.env[KEY];
  }
});

test("[happy-7] the input environment is left unchanged", async (t) => {
  fakeEndpoints(t);
  const env: NodeJS.ProcessEnv = { [KEY]: URI_A, BUILD_SHA: "abc" };
  assert.equal(await resolveImageDigest(env), DIGEST_A);
  assert.deepEqual(env, { [KEY]: URI_A, BUILD_SHA: "abc" });
});

test("[happy-7] the input environment is left unchanged when the endpoint fails", async (t) => {
  fakeEndpoints(t, {
    [URI_A]: () => Response.json({ ImageID: DIGEST_A }, { status: 500 }),
  });
  const env: NodeJS.ProcessEnv = { [KEY]: URI_A, BUILD_SHA: "abc" };
  assert.equal(await resolveImageDigest(env), undefined);
  assert.deepEqual(env, { [KEY]: URI_A, BUILD_SHA: "abc" });
});

/** The required variables from env.test.ts. */
const required = {
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/test",
  BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
  BETTER_AUTH_URL: "http://localhost:4000",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  GITHUB_CLIENT_ID: "github-client-id",
  GITHUB_CLIENT_SECRET: "github-client-secret",
  ATLASSIAN_CLIENT_ID: "atlassian-client-id",
  ATLASSIAN_CLIENT_SECRET: "atlassian-client-secret",
};

test("[happy-8] parseEnv neither validates nor keeps the metadata URI", () => {
  const env = parseEnv({
    ...required,
    [KEY]: "not a url",
    IMAGE_DIGEST: "not-a-digest",
  });
  assert.equal(Object.hasOwn(env, KEY), false);
  assert.equal(Object.hasOwn(env, "IMAGE_DIGEST"), false);
});

test("[happy-8] parseEnv drops a well-formed metadata URI and digest too", () => {
  const env = parseEnv({ ...required, [KEY]: URI_A, IMAGE_DIGEST: DIGEST_A });
  assert.equal(Object.hasOwn(env, KEY), false);
  assert.equal(Object.hasOwn(env, "IMAGE_DIGEST"), false);
});

const build: BuildInfoDto = {
  version: "1.4.2",
  gitSha: "7f3a9c1e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a",
  gitShortSha: "7f3a9c1",
  buildTime: "2026-11-01T12:00:00Z",
  gitRef: "v1.4.2",
  dirty: false,
};

/** The record the server entry point hands to createApp. */
type BuildRecord = BuildInfoDto & { imageDigest?: string | undefined };

function versionApp(buildInfo: BuildRecord) {
  return createApp({
    store: createInMemoryStore([]),
    corsOrigins: ["http://localhost:5173"],
    buildInfo,
  });
}

test("[happy-9] GET /version returns exactly the BuildInfoDto it was given", async () => {
  const res = await versionApp(build).request("/version");
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.deepEqual(body, build);
  assert.equal(Object.hasOwn(body, "imageDigest"), false);
});

test("[happy-9] GET /version has no imageDigest key when it is undefined in the record", async () => {
  const record: BuildRecord = { ...build, imageDigest: undefined };
  const res = await versionApp(record).request("/version");
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.deepEqual(body, build);
  assert.equal(Object.hasOwn(body, "imageDigest"), false);
});

test("[happy-10] GET /version passes an imageDigest in the build record through unchanged", async () => {
  const record: BuildRecord = { ...build, imageDigest: DIGEST_A };
  const res = await versionApp(record).request("/version");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ...build, imageDigest: DIGEST_A });
});

test("[happy-10] GET /version still satisfies the shared schema with an imageDigest", async () => {
  const record: BuildRecord = { ...build, imageDigest: DIGEST_B };
  const res = await versionApp(record).request("/version");
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body["imageDigest"], DIGEST_B);
  assert.deepEqual(buildInfoSchema.parse(body), build);
});

// --- @unhappy ---------------------------------------------------------------

test("[unhappy-1] the metadata URI is not set", async (t) => {
  const endpoints = fakeEndpoints(t);
  assert.equal(await resolveImageDigest({}), undefined);
  assert.equal(endpoints.requests.length, 0);
});

test("[unhappy-1] the older ECS_CONTAINER_METADATA_URI is not used in its place", async (t) => {
  const endpoints = fakeEndpoints(t);
  const result = await resolveImageDigest({
    ECS_CONTAINER_METADATA_URI: URI_A,
  });
  assert.equal(result, undefined);
  assert.equal(endpoints.requests.length, 0);
});

test("[unhappy-2] the metadata URI is the empty string", async (t) => {
  const endpoints = fakeEndpoints(t);
  assert.equal(await resolveImageDigest({ [KEY]: "" }), undefined);
  assert.equal(endpoints.requests.length, 0);
});

test("[unhappy-2] a whitespace-only metadata URI resolves to undefined", async (t) => {
  fakeEndpoints(t);
  const outcome = await settle(resolveImageDigest({ [KEY]: " " }));
  assert.deepEqual(outcome, { status: "fulfilled", value: undefined });
});

test("[unhappy-3] the metadata URI is explicitly undefined", async (t) => {
  const endpoints = fakeEndpoints(t);
  assert.equal(await resolveImageDigest({ [KEY]: undefined }), undefined);
  assert.equal(endpoints.requests.length, 0);
});

test("[unhappy-3] an explicitly undefined URI alongside a valid digest resolves to undefined", async (t) => {
  const endpoints = fakeEndpoints(t);
  const result = await resolveImageDigest({
    [KEY]: undefined,
    IMAGE_DIGEST: DIGEST_A,
    BUILD_SHA: "7f3a9c1e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a",
  });
  assert.equal(result, undefined);
  assert.equal(endpoints.requests.length, 0);
});

test("[unhappy-4] IMAGE_DIGEST alone is ignored", async (t) => {
  const endpoints = fakeEndpoints(t);
  assert.equal(await resolveImageDigest({ IMAGE_DIGEST: DIGEST_A }), undefined);
  assert.equal(endpoints.requests.length, 0);
});

test("[unhappy-4] IMAGE_DIGEST with an empty metadata URI is ignored", async (t) => {
  const endpoints = fakeEndpoints(t);
  const result = await resolveImageDigest({ [KEY]: "", IMAGE_DIGEST: DIGEST_A });
  assert.equal(result, undefined);
  assert.equal(endpoints.requests.length, 0);
});

const unusable: ReadonlyArray<
  readonly [string, string, Record<string, Handler>]
> = [
  ["connection refused", URI_REFUSED, {}],
  ["not a URL", "not a url", {}],
  [
    "non-2xx status",
    URI_A,
    { [URI_A]: () => Response.json({ ImageID: DIGEST_A }, { status: 500 }) },
  ],
  [
    "not found",
    URI_A,
    { [URI_A]: () => Response.json({ ImageID: DIGEST_A }, { status: 404 }) },
  ],
  [
    "body is not JSON",
    URI_A,
    { [URI_A]: () => new Response("ok", { status: 200 }) },
  ],
  ["body is JSON null", URI_A, { [URI_A]: ok(null) }],
  [
    "no ImageID field",
    URI_A,
    { [URI_A]: ok({ Image: "sandbox-factory-api:latest" }) },
  ],
  ["ImageID is not a string", URI_A, { [URI_A]: ok({ ImageID: 42 }) }],
];

for (const [name, uri, overrides] of unusable) {
  test(`[unhappy-5] the endpoint cannot be used: ${name}`, async (t) => {
    fakeEndpoints(t, overrides);
    const consoleSpies = silentConsole(t);
    const outcome = await settle(resolveImageDigest({ [KEY]: uri }));
    assert.deepEqual(outcome, { status: "fulfilled", value: undefined });
    for (const method of consoleSpies) assert.equal(method.mock.callCount(), 0);
  });
}

test("[unhappy-5] a 3xx status just outside 2xx resolves to undefined", async (t) => {
  fakeEndpoints(t, {
    [URI_A]: () => Response.json({ ImageID: DIGEST_A }, { status: 300 }),
  });
  const outcome = await settle(resolveImageDigest({ [KEY]: URI_A }));
  assert.deepEqual(outcome, { status: "fulfilled", value: undefined });
});

/**
 * Drives the 1000 ms timeout on a mocked clock. `setTimeout` is mocked, and
 * `AbortSignal.timeout` (which the timer mock does not cover) is replaced by
 * one built on the mocked `setTimeout`, so either way of writing the timeout
 * fires when the mocked clock reaches it.
 */
function mockClock(t: TestContext) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(AbortSignal, "timeout", (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort(
        new DOMException("The operation was aborted due to timeout", "TimeoutError"),
      );
    }, ms);
    return controller.signal;
  });
}

test("[unhappy-6] an endpoint that never answers times out after 1000 ms", async (t) => {
  fakeEndpoints(t, { [URI_A]: () => NEVER });
  mockClock(t);
  let outcome: Settled | undefined;
  void settle(resolveImageDigest({ [KEY]: URI_A })).then((o) => {
    outcome = o;
  });
  await flush();
  t.mock.timers.tick(1000);
  await flush();
  t.mock.timers.tick(1000);
  await flush();
  assert.deepEqual(outcome, { status: "fulfilled", value: undefined });
});

test("[unhappy-6] an endpoint that never answers is still pending at 999 ms", async (t) => {
  fakeEndpoints(t, { [URI_A]: () => NEVER });
  mockClock(t);
  let outcome: Settled | undefined;
  void settle(resolveImageDigest({ [KEY]: URI_A })).then((o) => {
    outcome = o;
  });
  await flush();
  t.mock.timers.tick(999);
  await flush();
  assert.equal(outcome, undefined);
  t.mock.timers.tick(1001);
  await flush();
  assert.deepEqual(outcome, { status: "fulfilled", value: undefined });
});

// --- @boundary --------------------------------------------------------------

const HEX64 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const notOneDigest: ReadonlyArray<readonly [string, string]> = [
  ["63 hex characters", `sha256:${HEX64.slice(0, 63)}`],
  ["65 hex characters", `sha256:${HEX64}0`],
  ["non-hex character", `sha256:${HEX64.slice(0, 63)}g`],
  ["uppercase hex", `sha256:${HEX64.toUpperCase()}`],
  ["uppercase algorithm", `SHA256:${HEX64}`],
  ["no algorithm prefix", HEX64],
  ["prefix without hex", "sha256:"],
  ["other algorithm", `sha512:${HEX64}`],
  [
    "tag instead of digest",
    "sandbox-factory-api:7f3a9c1e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a",
  ],
  ["reference ending in @", `sandbox-factory-api@sha256:${HEX64}@`],
  ["placeholder", "unknown"],
  ["empty string", ""],
  ["trailing newline", `sha256:${HEX64}\n`],
  ["surrounding spaces", `  sha256:${HEX64}  `],
  ["whitespace inside", `sha256: ${HEX64}`],
];

for (const [name, value] of notOneDigest) {
  test(`[boundary-1] an ImageID that is not exactly one digest: ${name}`, async (t) => {
    fakeEndpoints(t, { [URI_A]: ok({ ImageID: value }) });
    const outcome = await settle(resolveImageDigest({ [KEY]: URI_A }));
    assert.deepEqual(outcome, { status: "fulfilled", value: undefined });
  });
}

// --- @concurrency -----------------------------------------------------------

test("[concurrency-1] changing env after the call does not change the pending result", async (t) => {
  fakeEndpoints(t);
  const env: NodeJS.ProcessEnv = { [KEY]: URI_A };
  const pending = resolveImageDigest(env);
  env[KEY] = URI_B;
  assert.equal(await pending, DIGEST_A);
});

test("[concurrency-1] deleting the URI after the call does not change the pending result", async (t) => {
  fakeEndpoints(t);
  const env: NodeJS.ProcessEnv = { [KEY]: URI_A };
  const pending = resolveImageDigest(env);
  delete env[KEY];
  assert.equal(await pending, DIGEST_A);
});

test("[concurrency-2] overlapping calls each see the environment as it was when they were made", async (t) => {
  const endpoints = fakeEndpoints(t);
  const env: NodeJS.ProcessEnv = { [KEY]: URI_A };
  const p1 = resolveImageDigest(env);
  env[KEY] = URI_B;
  const p2 = resolveImageDigest(env);
  delete env[KEY];
  const p3 = resolveImageDigest(env);
  assert.deepEqual(await Promise.all([p1, p2, p3]), [
    DIGEST_A,
    DIGEST_B,
    undefined,
  ]);
  assert.deepEqual(
    endpoints.requests.map((r) => r.url).sort(),
    [URI_A, URI_B].sort(),
  );
});

test("[concurrency-2] overlapping calls starting from an unset URI each see their own env", async (t) => {
  fakeEndpoints(t);
  const env: NodeJS.ProcessEnv = {};
  const p1 = resolveImageDigest(env);
  env[KEY] = URI_A;
  const p2 = resolveImageDigest(env);
  env[KEY] = URI_B;
  const p3 = resolveImageDigest(env);
  assert.deepEqual(await Promise.all([p1, p2, p3]), [
    undefined,
    DIGEST_A,
    DIGEST_B,
  ]);
});

test("[concurrency-3] concurrent calls on the same environment agree and each make their own request", async (t) => {
  const endpoints = fakeEndpoints(t);
  const env: NodeJS.ProcessEnv = { [KEY]: URI_B };
  const results = await Promise.all(
    Array.from({ length: 10 }, () => resolveImageDigest(env)),
  );
  assert.deepEqual(results, Array.from({ length: 10 }, () => DIGEST_B));
  assert.equal(endpoints.requests.length, 10);
  for (const r of endpoints.requests) {
    assert.deepEqual(r, { url: URI_B, method: "GET" });
  }
});

test("[concurrency-3] sequential calls each make their own request", async (t) => {
  const endpoints = fakeEndpoints(t);
  const env: NodeJS.ProcessEnv = { [KEY]: URI_B };
  assert.equal(await resolveImageDigest(env), DIGEST_B);
  assert.equal(await resolveImageDigest(env), DIGEST_B);
  assert.equal(endpoints.requests.length, 2);
});

test("[concurrency-4] a later call sees a changed endpoint response", async (t) => {
  const endpoints = fakeEndpoints(t);
  const env: NodeJS.ProcessEnv = { [KEY]: URI_A };
  assert.equal(await resolveImageDigest(env), DIGEST_A);
  endpoints.routes.set(URI_A, ok({ ImageID: DIGEST_B }));
  assert.equal(await resolveImageDigest(env), DIGEST_B);
});

test("[concurrency-4] a later call sees an endpoint that has started failing", async (t) => {
  const endpoints = fakeEndpoints(t);
  const env: NodeJS.ProcessEnv = { [KEY]: URI_A };
  assert.equal(await resolveImageDigest(env), DIGEST_A);
  endpoints.routes.set(URI_A, () =>
    Response.json({ ImageID: DIGEST_A }, { status: 500 }),
  );
  assert.equal(await resolveImageDigest(env), undefined);
});
