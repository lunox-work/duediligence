import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";
import type { StoredAnalysisRun } from "@sandbox-factory/db";
import {
  mountAnalysisRoutes,
  type AnalysisRouteOptions,
} from "../src/analysis/routes.js";
import type { AuthVariables } from "../src/routes.js";

const stamp = "2026-10-01T00:00:00.000Z";
const run: StoredAnalysisRun = {
  id: "arn_1",
  snapshotId: "rsn_1",
  repoId: "ghr_1",
  tool: "graphify",
  toolVersion: "test",
  params: { deadlineMinutes: 30 },
  status: "succeeded",
  attempt: 0,
  maxAttempts: 2,
  errorCode: null,
  errorDetail: null,
  progress: null,
  startedAt: stamp,
  finishedAt: stamp,
  deadlineAt: stamp,
  createdAt: stamp,
};
const scopeRun: StoredAnalysisRun = {
  ...run,
  id: "arn_scope",
  tool: "scope",
  status: "queued",
  params: {
    deadlineMinutes: 60,
    agent: "scope",
    graphRunId: run.id,
    proposalId: "bpr_1",
    specRevision: 2,
    specHash: "h2",
  },
};

interface EnqueueInput {
  tool?: string;
  params: unknown;
  maxActive?: number;
}
type Enqueue = (
  owner: string,
  snapshot: string,
  input: EnqueueInput,
) => Promise<unknown>;

/**
 * An owner of "org_1" with repository "ghr_1", whose current snapshot is
 * "rsn_1". Every enqueue is answered `{ ok: true, created: false, run }`
 * with run "arn_1" succeeded, unless a test answers otherwise.
 */
function fixture(maxActive?: number) {
  const enqueued: {
    tool: string;
    snapshot: string;
    params: unknown;
    maxActive: number | undefined;
  }[] = [];
  const contexts: [string, string, string][] = [];
  const asked: string[] = [];
  /** The snapshot's latest succeeded context runs, by tool. */
  const latest = new Map<string, string>();
  let launches = 0;
  let answer: Enqueue = async (_owner, _snapshot, input) => ({
    ok: true,
    created: false,
    run: input.tool === "scope" ? scopeRun : run,
  });
  const options = {
    runs: {
      enqueue: async (owner: string, snapshot: string, input: EnqueueInput) => {
        enqueued.push({
          tool: input.tool ?? "graphify",
          snapshot,
          params: input.params,
          maxActive: input.maxActive,
        });
        return answer(owner, snapshot, input);
      },
      latestSucceeded: async (owner: string, snapshot: string, tool: string) => {
        asked.push(tool);
        const id = owner === "org_1" ? latest.get(tool) : undefined;
        return id === undefined
          ? null
          : { ...run, id, tool, snapshotId: snapshot };
      },
      get: async () => null,
      list: async () => [],
      logKey: async () => null,
    },
    repos: {
      get: async (owner: string, id: string) =>
        owner === "org_1" && id === "ghr_1" ? { id } : null,
      setContextSnapshot: async (
        owner: string,
        id: string,
        snapshotId: string,
      ) => {
        contexts.push([owner, id, snapshotId]);
        return true;
      },
    },
    snapshots: {
      current: async () => ({ id: "rsn_1", repoId: "ghr_1", treeKey: "t" }),
      get: async (_owner: string, id: string) =>
        id === "rsn_1" ? { id, repoId: "ghr_1", treeKey: "t" } : null,
    },
    tree: async () => null,
    artifacts: { list: async () => [], get: async () => null },
    objects: {
      remove: async () => {},
      get: async () => undefined,
      signedUrl: async () => "https://objects.test/signed",
    },
    ensureWorker: async () => {
      launches += 1;
    },
    proposals: {
      get: async (owner: string, id: string) =>
        owner === "org_1" && id === "bpr_1" ? { id, specRevision: 2 } : null,
      list: async () => [],
    },
    specs: {
      get: async (_owner: string, proposalId: string, revision: number) =>
        proposalId === "bpr_1" && revision === 2
          ? { revision, specHash: "h2" }
          : null,
    },
    boards: { list: async () => [] },
    ...(maxActive === undefined ? {} : { maxActive }),
  } as unknown as AnalysisRouteOptions;
  const app = new Hono<{ Variables: AuthVariables }>();
  app.use("/api/v1/orgs/:orgId/*", async (c, next) => {
    c.set("user", {
      id: "user_1",
      email: "test@example.test",
      name: "User",
    } as never);
    c.set("member", {
      role: "owner",
      organizationId: c.req.param("orgId"),
    } as never);
    await next();
  });
  mountAnalysisRoutes(app, options);
  const request = (path: string, body: unknown) =>
    app.request(`/api/v1/orgs/org_1/github/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  return {
    request,
    enqueued,
    contexts,
    asked,
    launches: () => launches,
    answer: (next: Enqueue) => {
      answer = next;
    },
    withLatest: (tool: string, id: string) => {
      latest.set(tool, id);
    },
  };
}

/**
 * A queue that creates each run queued, with id `arn_<tool>`, while fewer
 * than its maxActive are active.
 */
function creating(f: ReturnType<typeof fixture>, active: number) {
  f.answer(async (_owner, _snapshot, input) => {
    const cap = input.maxActive ?? 3;
    if (active >= cap) return { ok: false, reason: "run_limit" };
    active += 1;
    const tool = input.tool ?? "graphify";
    return {
      ok: true,
      created: true,
      run: {
        ...run,
        id: `arn_${tool}`,
        tool,
        params: input.params,
        status: "queued",
      },
    };
  });
}

// --- Rule: each context builder's default deadline is GRAPH_DEADLINE_MINUTES ---

const builderCases: {
  name: string;
  body: unknown;
  enqueued: { tool: string; params: unknown }[];
}[] = [
  {
    name: "graphify with no deadline gets 30 minutes",
    body: { tool: "graphify" },
    enqueued: [{ tool: "graphify", params: { deadlineMinutes: 30 } }],
  },
  {
    name: "graphify keeps an asked deadline",
    body: { tool: "graphify", params: { deadlineMinutes: 45 } },
    enqueued: [{ tool: "graphify", params: { deadlineMinutes: 45 } }],
  },
  {
    name: "abstractions with no deadline gets 30 minutes and names the graph run",
    body: { tool: "abstractions" },
    enqueued: [
      { tool: "graphify", params: { deadlineMinutes: 30 } },
      {
        tool: "abstractions",
        params: {
          deadlineMinutes: 30,
          builder: "abstractions",
          graphRunId: "arn_1",
        },
      },
    ],
  },
  {
    name: "data_model keeps an asked deadline, and its graph run keeps the default",
    body: { tool: "data_model", params: { deadlineMinutes: 120 } },
    enqueued: [
      { tool: "graphify", params: { deadlineMinutes: 30 } },
      {
        tool: "data_model",
        params: {
          deadlineMinutes: 120,
          builder: "data_model",
          graphRunId: "arn_1",
        },
      },
    ],
  },
];

for (const { name, body, enqueued } of builderCases)
  test(`[happy-5] the builder's parameters, from the request body: ${name}`, async () => {
    const f = fixture();
    const response = await f.request("repositories/ghr_1/runs", body);
    assert.equal(response.status, 202);
    assert.deepEqual(
      f.enqueued.map(({ tool, params }) => ({ tool, params })),
      enqueued,
    );
  });

for (const tool of ["deepwiki", "dependency_cruiser"])
  test(`[unhappy-4] a removed builder's name is an invalid request: ${tool}`, async () => {
    const f = fixture();
    const response = await f.request("repositories/ghr_1/runs", { tool });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "Invalid analysis request.",
    });
    assert.deepEqual(f.enqueued, []);
    assert.equal(f.launches(), 0);
  });

// --- Rule: Build all queues graphify, abstractions and data_model ---

test("[happy-6] a fresh set is queued whole, and the snapshot becomes the repository's context", async () => {
  const f = fixture();
  creating(f, 2);
  const response = await f.request("repositories/ghr_1/builds", {
    snapshotId: "rsn_1",
  });
  assert.equal(response.status, 202);
  const { runs } = (await response.json()) as { runs: StoredAnalysisRun[] };
  assert.deepEqual(
    runs.map((each) => each.tool),
    ["graphify", "abstractions", "data_model"],
  );
  assert.deepEqual(
    f.enqueued.map(({ tool, params }) => ({ tool, params })),
    [
      { tool: "graphify", params: { deadlineMinutes: 30 } },
      {
        tool: "abstractions",
        params: {
          deadlineMinutes: 30,
          builder: "abstractions",
          graphRunId: "arn_graphify",
        },
      },
      {
        tool: "data_model",
        params: {
          deadlineMinutes: 30,
          builder: "data_model",
          graphRunId: "arn_graphify",
        },
      },
    ],
  );
  assert.deepEqual(
    f.enqueued.map((each) => each.maxActive),
    [3, 6, 6],
  );
  assert.deepEqual(f.contexts, [["org_1", "ghr_1", "rsn_1"]]);
  assert.equal(f.launches(), 1);
});

test("[happy-6] with a cap of 5, the runs after the first created one are held to 5 plus the three builders", async () => {
  const f = fixture(5);
  creating(f, 4);
  const response = await f.request("repositories/ghr_1/builds", {});
  assert.equal(response.status, 202);
  const { runs } = (await response.json()) as { runs: StoredAnalysisRun[] };
  assert.deepEqual(
    runs.map((each) => each.tool),
    ["graphify", "abstractions", "data_model"],
  );
  assert.deepEqual(
    f.enqueued.map((each) => each.maxActive),
    [5, 8, 8],
  );
});

test("[boundary-8] a set already built is answered as is, held to the cap throughout, and wakes no worker", async () => {
  const f = fixture();
  const response = await f.request("repositories/ghr_1/builds", {});
  assert.equal(response.status, 202);
  const { runs } = (await response.json()) as { runs: StoredAnalysisRun[] };
  assert.equal(runs.length, 3);
  assert.deepEqual(
    f.enqueued.map((each) => each.tool),
    ["graphify", "abstractions", "data_model"],
  );
  assert.deepEqual(
    f.enqueued.map((each) => each.maxActive),
    [3, 3, 3],
  );
  assert.equal(f.launches(), 0);
  assert.deepEqual(f.contexts, [["org_1", "ghr_1", "rsn_1"]]);
});

test("[boundary-8] a set found with its graph still queued is held to the cap throughout and wakes the worker once", async () => {
  const f = fixture();
  f.answer(async (_owner, _snapshot, input) => ({
    ok: true,
    created: false,
    run:
      (input.tool ?? "graphify") === "graphify"
        ? { ...run, status: "queued" }
        : run,
  }));
  const response = await f.request("repositories/ghr_1/builds", {});
  assert.equal(response.status, 202);
  assert.deepEqual(
    f.enqueued.map((each) => each.maxActive),
    [3, 3, 3],
  );
  assert.equal(f.launches(), 1);
});

test("[boundary-9] with the graph out of retries, only the graph is enqueued", async () => {
  const f = fixture();
  f.answer(async (_owner, _snapshot, input) => ({
    ok: true,
    created: false,
    run:
      (input.tool ?? "graphify") === "graphify"
        ? { ...run, status: "failed", attempt: 2 }
        : run,
  }));
  const response = await f.request("repositories/ghr_1/builds", {});
  assert.equal(response.status, 202);
  assert.deepEqual(
    f.enqueued.map((each) => each.tool),
    ["graphify"],
  );
  assert.equal(
    ((await response.json()) as { runs: unknown[] }).runs.length,
    1,
  );
});

test("[boundary-9] a set whose graph is out of retries answers that graph run and still becomes the context", async () => {
  const f = fixture();
  f.answer(async () => ({
    ok: true,
    created: false,
    run: { ...run, status: "failed", attempt: 2, errorCode: "tool_failed" },
  }));
  const response = await f.request("repositories/ghr_1/builds", {
    snapshotId: "rsn_1",
  });
  assert.equal(response.status, 202);
  const { runs } = (await response.json()) as { runs: StoredAnalysisRun[] };
  assert.deepEqual(
    runs.map(({ tool, status }) => ({ tool, status })),
    [{ tool: "graphify", status: "failed" }],
  );
  assert.equal(f.enqueued.length, 1);
  assert.deepEqual(f.contexts, [["org_1", "ghr_1", "rsn_1"]]);
});

test("[unhappy-5] no slot left refuses the set at its first run", async () => {
  const f = fixture();
  creating(f, 3);
  const response = await f.request("repositories/ghr_1/builds", {});
  assert.equal(response.status, 409);
  assert.equal(((await response.json()) as { code: string }).code, "run_limit");
  assert.deepEqual(
    f.enqueued.map((each) => each.maxActive),
    [3],
  );
  assert.deepEqual(f.contexts, []);
});

test("[unhappy-5] with a cap of 1 and one run active, the set is refused at its first run", async () => {
  const f = fixture(1);
  creating(f, 1);
  const response = await f.request("repositories/ghr_1/builds", {});
  assert.equal(response.status, 409);
  assert.equal(((await response.json()) as { code: string }).code, "run_limit");
  assert.deepEqual(
    f.enqueued.map((each) => each.maxActive),
    [1],
  );
  assert.deepEqual(f.contexts, []);
  assert.equal(f.launches(), 0);
});

// --- Rule: the scope route names latestSucceeded map readers, and enqueues neither ---

test("[happy-7] a scope request with only a succeeded data_model run names just that run", async () => {
  const f = fixture();
  f.withLatest("data_model", "arn_model");
  const response = await f.request("repositories/ghr_1/scope", {
    proposalId: "bpr_1",
  });
  assert.equal(response.status, 202);
  assert.deepEqual(
    f.enqueued.map((each) => each.tool),
    ["graphify", "scope"],
  );
  const params = f.enqueued[1]?.params as Record<string, unknown>;
  assert.equal(params["dataModelRunId"], "arn_model");
  assert.equal("abstractionsRunId" in params, false);
});

test("[happy-7] a scope request with only a succeeded abstractions run names just that run and enqueues no map reader", async () => {
  const f = fixture();
  f.withLatest("abstractions", "arn_abs");
  const response = await f.request("repositories/ghr_1/scope", {
    proposalId: "bpr_1",
  });
  assert.equal(response.status, 202);
  assert.deepEqual(
    f.enqueued.map((each) => each.tool),
    ["graphify", "scope"],
  );
  const params = f.enqueued[1]?.params as Record<string, unknown>;
  assert.equal(params["abstractionsRunId"], "arn_abs");
  assert.equal("dataModelRunId" in params, false);
});
