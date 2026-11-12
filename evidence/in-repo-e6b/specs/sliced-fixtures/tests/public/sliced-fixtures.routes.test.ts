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

interface EnqueueInput {
  tool?: string;
  params: unknown;
  maxActive?: number;
}

/**
 * An owner of "org_1" with repository "ghr_1", whose current snapshot is
 * "rsn_1". Every enqueue is answered, by default, with the built run
 * "arn_1" in status "succeeded".
 */
function fixture(role = "owner") {
  const enqueued: { tool: string; params: unknown; maxActive?: number }[] = [];
  let launches = 0;
  /** Each move of a repository's context, as `owner/repo@snapshot`. */
  const contexts: string[] = [];
  /** The snapshot's succeeded context runs, by tool. */
  const latest = new Map<string, string>();
  let answer = async (input: EnqueueInput): Promise<unknown> => ({
    ok: true,
    created: false,
    run: {
      ...run,
      tool: input.tool ?? "graphify",
      params: input.params,
    },
  });
  const options = {
    runs: {
      enqueue: async (_owner: string, _snapshot: string, input: EnqueueInput) => {
        enqueued.push({
          tool: input.tool ?? "graphify",
          params: input.params,
          maxActive: input.maxActive,
        });
        return answer(input);
      },
      latestSucceeded: async (owner: string, snapshot: string, tool: string) => {
        const id = owner === "org_1" ? latest.get(tool) : undefined;
        return id === undefined
          ? null
          : {
              ...run,
              id,
              tool,
              snapshotId: snapshot,
              params: { deadlineMinutes: 30, builder: tool, graphRunId: "arn_1" },
            };
      },
      list: async () => [],
      get: async () => null,
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
        contexts.push(`${owner}/${id}@${snapshotId}`);
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
      get: async () => undefined,
      remove: async () => {},
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
  } as unknown as AnalysisRouteOptions;
  const app = new Hono<{ Variables: AuthVariables }>();
  app.use("/api/v1/orgs/:orgId/*", async (c, next) => {
    c.set("user", {
      id: "user_1",
      email: "test@example.test",
      name: "User",
    } as never);
    c.set("member", {
      role,
      organizationId: c.req.param("orgId"),
    } as never);
    await next();
  });
  mountAnalysisRoutes(app, options);
  const request = (path: string, body?: unknown, org = "org_1") =>
    app.request(
      `/api/v1/orgs/${org}/github/${path}`,
      body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
    );
  return {
    request,
    options,
    enqueued,
    contexts,
    launches: () => launches,
    /** Replaces how the runs store answers an enqueue. */
    answer: (next: (input: EnqueueInput) => Promise<unknown>) => {
      answer = next;
    },
    withLatest: (tool: string, id: string) => {
      latest.set(tool, id);
    },
  };
}

/**
 * A store that creates each run in status "queued" with id `arn_<tool>`
 * while fewer than its `maxActive` are active.
 */
function creating(f: ReturnType<typeof fixture>, active: number) {
  f.answer(async (input) => {
    const cap = input.maxActive ?? 3;
    if (active >= cap) return { ok: false, reason: "run_limit" };
    active++;
    const tool = input.tool ?? "graphify";
    return {
      ok: true,
      created: true,
      run: { ...run, id: `arn_${tool}`, tool, params: input.params, status: "queued" },
    };
  });
}

const tools = (f: ReturnType<typeof fixture>) => f.enqueued.map((e) => e.tool);
const caps = (f: ReturnType<typeof fixture>) =>
  f.enqueued.map((e) => e.maxActive);

// ---------------------------------------------------------------------------
// POST .../repositories/:id/runs

test("[happy-5] graphify's parameters take the graph deadline by default, and an asked deadline wins", async () => {
  const f = fixture();
  const plain = await f.request("repositories/ghr_1/runs", {
    tool: "graphify",
  });
  assert.equal(plain.status, 202);
  assert.deepEqual(
    f.enqueued.map(({ tool, params }) => ({ tool, params })),
    [{ tool: "graphify", params: { deadlineMinutes: 30 } }],
  );
  const asked = fixture();
  const response = await asked.request("repositories/ghr_1/runs", {
    tool: "graphify",
    params: { deadlineMinutes: 45 },
  });
  assert.equal(response.status, 202);
  assert.deepEqual(
    asked.enqueued.map(({ tool, params }) => ({ tool, params })),
    [{ tool: "graphify", params: { deadlineMinutes: 45 } }],
  );
});

test("[happy-5] a map reader names the graph run and takes the graph deadline unless one is asked", async () => {
  const f = fixture();
  const abstractions = await f.request("repositories/ghr_1/runs", {
    tool: "abstractions",
  });
  assert.equal(abstractions.status, 202);
  assert.deepEqual(
    f.enqueued.map(({ tool, params }) => ({ tool, params })),
    [
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
  );
  const asked = fixture();
  const dataModel = await asked.request("repositories/ghr_1/runs", {
    tool: "data_model",
    params: { deadlineMinutes: 120 },
  });
  assert.equal(dataModel.status, 202);
  assert.deepEqual(
    asked.enqueued.map(({ tool, params }) => ({ tool, params })),
    [
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
  );
});

test("[unhappy-5] deepwiki is an invalid analysis request", async () => {
  const f = fixture();
  const response = await f.request("repositories/ghr_1/runs", {
    tool: "deepwiki",
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Invalid analysis request.",
  });
  assert.deepEqual(f.enqueued, []);
  assert.equal(f.launches(), 0);
});

test("[unhappy-5] dependency_cruiser is an invalid analysis request, even with a snapshot and parameters", async () => {
  const f = fixture();
  const response = await f.request("repositories/ghr_1/runs", {
    tool: "dependency_cruiser",
    snapshotId: "rsn_1",
    params: { deadlineMinutes: 30 },
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Invalid analysis request.",
  });
  assert.deepEqual(f.enqueued, []);
  assert.equal(f.launches(), 0);
});

// ---------------------------------------------------------------------------
// POST .../repositories/:id/builds

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
  assert.deepEqual(caps(f), [3, 6, 6]);
  assert.deepEqual(f.contexts, ["org_1/ghr_1@rsn_1"]);
  assert.equal(f.launches(), 1);
});

test("[happy-6] after its first created run the set's cap is the organization's cap plus the three builders", async () => {
  const f = fixture();
  Object.assign(f.options, { maxActive: 5 });
  creating(f, 4);
  const response = await f.request("repositories/ghr_1/builds", {});
  assert.equal(response.status, 202);
  assert.deepEqual(tools(f), ["graphify", "abstractions", "data_model"]);
  assert.deepEqual(caps(f), [5, 8, 8]);
  assert.deepEqual(f.contexts, ["org_1/ghr_1@rsn_1"]);
});

test("[boundary-6] a set already built is answered as is, held to the cap throughout, and wakes no worker", async () => {
  const f = fixture();
  const response = await f.request("repositories/ghr_1/builds", {});
  assert.equal(response.status, 202);
  const { runs } = (await response.json()) as { runs: StoredAnalysisRun[] };
  assert.equal(runs.length, 3);
  assert.deepEqual(caps(f), [3, 3, 3]);
  assert.equal(f.launches(), 0);
  assert.deepEqual(f.contexts, ["org_1/ghr_1@rsn_1"]);
});

test("[boundary-6] a set found whole with its graph still queued is held to the cap and wakes a worker", async () => {
  const f = fixture();
  f.answer(async (input) => ({
    ok: true,
    created: false,
    run: {
      ...run,
      tool: input.tool ?? "graphify",
      params: input.params,
      status: (input.tool ?? "graphify") === "graphify" ? "queued" : "succeeded",
    },
  }));
  const response = await f.request("repositories/ghr_1/builds", {});
  assert.equal(response.status, 202);
  assert.deepEqual(tools(f), ["graphify", "abstractions", "data_model"]);
  assert.deepEqual(caps(f), [3, 3, 3]);
  assert.equal(f.launches(), 1);
  assert.deepEqual(f.contexts, ["org_1/ghr_1@rsn_1"]);
});

test("[boundary-7] with the graph out of retries, only the graph is enqueued", async () => {
  const f = fixture();
  f.answer(async (input) => ({
    ok: true,
    created: false,
    run:
      (input.tool ?? "graphify") === "graphify"
        ? { ...run, status: "failed", attempt: 2 }
        : run,
  }));
  const response = await f.request("repositories/ghr_1/builds", {});
  assert.equal(response.status, 202);
  assert.deepEqual(tools(f), ["graphify"]);
  assert.equal(((await response.json()) as { runs: unknown[] }).runs.length, 1);
});

test("[boundary-7] with the graph still running, both map readers are enqueued behind it", async () => {
  const f = fixture();
  f.answer(async (input) => ({
    ok: true,
    created: false,
    run: {
      ...run,
      tool: input.tool ?? "graphify",
      params: input.params,
      status: (input.tool ?? "graphify") === "graphify" ? "running" : "succeeded",
    },
  }));
  const response = await f.request("repositories/ghr_1/builds", {});
  assert.equal(response.status, 202);
  assert.deepEqual(tools(f), ["graphify", "abstractions", "data_model"]);
  assert.equal(((await response.json()) as { runs: unknown[] }).runs.length, 3);
});

test("[unhappy-6] no slot left refuses the set at its first run", async () => {
  const f = fixture();
  creating(f, 3);
  const response = await f.request("repositories/ghr_1/builds", {});
  assert.equal(response.status, 409);
  assert.equal(((await response.json()) as { code: string }).code, "run_limit");
  assert.deepEqual(caps(f), [3]);
  assert.deepEqual(f.contexts, []);
});

test("[unhappy-6] a cap of one already met refuses the set at its first run", async () => {
  const f = fixture();
  Object.assign(f.options, { maxActive: 1 });
  creating(f, 1);
  const response = await f.request("repositories/ghr_1/builds", {
    snapshotId: "rsn_1",
  });
  assert.equal(response.status, 409);
  assert.equal(((await response.json()) as { code: string }).code, "run_limit");
  assert.deepEqual(caps(f), [1]);
  assert.deepEqual(tools(f), ["graphify"]);
  assert.deepEqual(f.contexts, []);
});

// ---------------------------------------------------------------------------
// POST .../repositories/:id/scope

test("[happy-7] a scope request with only a succeeded data_model run names just that run", async () => {
  const f = fixture();
  f.withLatest("data_model", "arn_model");
  const response = await f.request("repositories/ghr_1/scope", {
    proposalId: "bpr_1",
  });
  assert.equal(response.status, 202);
  assert.deepEqual(tools(f), ["graphify", "scope"]);
  const params = f.enqueued[1]?.params as Record<string, unknown>;
  assert.equal(params["dataModelRunId"], "arn_model");
  assert.equal("abstractionsRunId" in params, false);
});

test("[happy-7] a scope request with no succeeded map reader names neither and enqueues neither", async () => {
  const f = fixture();
  const response = await f.request("repositories/ghr_1/scope", {
    proposalId: "bpr_1",
  });
  assert.equal(response.status, 202);
  assert.deepEqual(tools(f), ["graphify", "scope"]);
  const params = f.enqueued[1]?.params as Record<string, unknown>;
  assert.equal("abstractionsRunId" in params, false);
  assert.equal("dataModelRunId" in params, false);
});
