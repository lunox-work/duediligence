import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";
import type { StoredAnalysisRun } from "@sandbox-factory/db";
import { CONTEXT_BUILDERS, readsGraph } from "sandbox-factory";
import {
  mountAnalysisRoutes,
  type AnalysisRouteOptions,
} from "../../src/analysis/routes.js";
import type { AuthVariables } from "../../src/routes.js";

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
 * A member of "org_1" with repository "ghr_1", whose current snapshot is
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
// happy-5

// Extends "[happy-5] graphify's parameters take the graph deadline by
// default…" and "[happy-5] a map reader names the graph run…": every
// builder there is, by default and with an asked deadline, under a graph
// run id other than the stock one.
test("[happy-5] every context builder defaults to the graph deadline, an asked one wins, and a map reader names the graph run", async () => {
  for (const tool of CONTEXT_BUILDERS) {
    for (const asked of [undefined, 7, 120]) {
      const f = fixture();
      f.answer(async (input) => ({
        ok: true,
        created: false,
        run: {
          ...run,
          id: (input.tool ?? "graphify") === "graphify" ? "arn_graph_z" : "arn_other",
          tool: input.tool ?? "graphify",
          params: input.params,
        },
      }));
      const response = await f.request(
        "repositories/ghr_1/runs",
        asked === undefined ? { tool } : { tool, params: { deadlineMinutes: asked } },
      );
      const label = `${tool}/${asked}`;
      assert.equal(response.status, 202, label);
      const deadlineMinutes = asked ?? 30;
      const expected =
        tool === "graphify"
          ? [{ tool, params: { deadlineMinutes } }]
          : readsGraph(tool)
            ? [
                { tool: "graphify", params: { deadlineMinutes: 30 } },
                {
                  tool,
                  params: { deadlineMinutes, builder: tool, graphRunId: "arn_graph_z" },
                },
              ]
            : [{ tool, params: { deadlineMinutes, builder: tool } }];
      assert.deepEqual(
        f.enqueued.map(({ tool, params }) => ({ tool, params })),
        expected,
        label,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// unhappy-5

// Extends "[unhappy-5] deepwiki is an invalid analysis request" and the
// dependency_cruiser one: other bodies, and an admin rather than an owner.
test("[unhappy-5] a removed builder is invalid for an admin too, whatever else the body names", async () => {
  for (const tool of ["deepwiki", "dependency_cruiser"]) {
    for (const body of [
      { tool, params: { deadlineMinutes: 60 } },
      { tool, params: {} },
      { tool, snapshotId: "rsn_1" },
    ]) {
      const f = fixture("admin");
      const response = await f.request("repositories/ghr_1/runs", body);
      const label = JSON.stringify(body);
      assert.equal(response.status, 400, label);
      assert.deepEqual(
        await response.json(),
        { error: "Invalid analysis request." },
        label,
      );
      assert.deepEqual(f.enqueued, [], label);
      assert.equal(f.launches(), 0, label);
    }
  }
});

// ---------------------------------------------------------------------------
// happy-6

// Extends "[happy-6] after its first created run the set's cap is the
// organization's cap plus the three builders": a cap of one, none active.
test("[happy-6] with a cap of one, the set's first run is held to one and the rest to four", async () => {
  const f = fixture();
  Object.assign(f.options, { maxActive: 1 });
  creating(f, 0);
  const response = await f.request("repositories/ghr_1/builds", {
    snapshotId: "rsn_1",
  });
  assert.equal(response.status, 202);
  const { runs } = (await response.json()) as { runs: StoredAnalysisRun[] };
  assert.deepEqual(
    runs.map((each) => each.tool),
    ["graphify", "abstractions", "data_model"],
  );
  assert.deepEqual(tools(f), ["graphify", "abstractions", "data_model"]);
  assert.deepEqual(caps(f), [1, 4, 4]);
  assert.deepEqual(f.contexts, ["org_1/ghr_1@rsn_1"]);
  assert.equal(f.launches(), 1);
});

// Extends "[happy-6] a fresh set is queued whole…": the graph is found
// built, so the set's first created run is abstractions.
test("[happy-6] with the graph found built, abstractions is the set's first created run and data_model follows it in", async () => {
  const f = fixture();
  f.answer(async (input) => {
    const tool = input.tool ?? "graphify";
    return tool === "graphify"
      ? { ok: true, created: false, run: { ...run, id: "arn_graph_b" } }
      : {
          ok: true,
          created: true,
          run: { ...run, id: `arn_${tool}`, tool, params: input.params, status: "queued" },
        };
  });
  const response = await f.request("repositories/ghr_1/builds", {});
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
        params: { deadlineMinutes: 30, builder: "abstractions", graphRunId: "arn_graph_b" },
      },
      {
        tool: "data_model",
        params: { deadlineMinutes: 30, builder: "data_model", graphRunId: "arn_graph_b" },
      },
    ],
  );
  assert.deepEqual(caps(f), [3, 3, 6]);
  assert.deepEqual(f.contexts, ["org_1/ghr_1@rsn_1"]);
  assert.equal(f.launches(), 1);
});

// ---------------------------------------------------------------------------
// boundary-6

// Extends "[boundary-6] a set already built is answered as is…": another
// cap, and the snapshot named in the body.
test("[boundary-6] a set already built under a cap of five is held to five throughout and wakes no worker", async () => {
  const f = fixture();
  Object.assign(f.options, { maxActive: 5 });
  const response = await f.request("repositories/ghr_1/builds", {
    snapshotId: "rsn_1",
  });
  assert.equal(response.status, 202);
  const { runs } = (await response.json()) as { runs: StoredAnalysisRun[] };
  assert.deepEqual(
    runs.map((each) => each.tool),
    ["graphify", "abstractions", "data_model"],
  );
  assert.deepEqual(tools(f), ["graphify", "abstractions", "data_model"]);
  assert.deepEqual(caps(f), [5, 5, 5]);
  assert.equal(f.launches(), 0);
  assert.deepEqual(f.contexts, ["org_1/ghr_1@rsn_1"]);
});

// ---------------------------------------------------------------------------
// boundary-7

// Extends "[boundary-7] with the graph out of retries, only the graph is
// enqueued": another cap, the snapshot named, and the run answered as is.
test("[boundary-7] a graph out of retries is answered alone, under any cap", async () => {
  const f = fixture();
  Object.assign(f.options, { maxActive: 5 });
  f.answer(async (input) => ({
    ok: true,
    created: false,
    run:
      (input.tool ?? "graphify") === "graphify"
        ? { ...run, status: "failed", attempt: 2, errorCode: "tool_failed" }
        : { ...run, tool: input.tool, params: input.params },
  }));
  const response = await f.request("repositories/ghr_1/builds", {
    snapshotId: "rsn_1",
  });
  assert.equal(response.status, 202);
  assert.deepEqual(tools(f), ["graphify"]);
  const { runs } = (await response.json()) as { runs: StoredAnalysisRun[] };
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.tool, "graphify");
  assert.equal(runs[0]?.status, "failed");
});

// ---------------------------------------------------------------------------
// unhappy-6

// Extends "[unhappy-6] no slot left refuses the set at its first run": the
// graph is found, so the first run the set would create is abstractions.
test("[unhappy-6] with the graph found and no slot left, the set is refused at abstractions", async () => {
  for (const cap of [undefined, 2]) {
    const f = fixture();
    if (cap !== undefined) Object.assign(f.options, { maxActive: cap });
    f.answer(async (input) =>
      (input.tool ?? "graphify") === "graphify"
        ? { ok: true, created: false, run }
        : { ok: false, reason: "run_limit" },
    );
    const response = await f.request("repositories/ghr_1/builds", {});
    const label = `cap ${cap}`;
    assert.equal(response.status, 409, label);
    assert.equal(
      ((await response.json()) as { code: string }).code,
      "run_limit",
      label,
    );
    assert.deepEqual(tools(f), ["graphify", "abstractions"], label);
    const held = cap ?? 3;
    assert.deepEqual(caps(f), [held, held], label);
  }
});

// ---------------------------------------------------------------------------
// happy-7

// Extends "[happy-7] a scope request with only a succeeded data_model run
// names just that run": the map readers were just queued by Build all, and
// only the abstractions run has a succeeded one.
test("[happy-7] after Build all, a scope request enqueues only graphify and scope, and names just the latest succeeded abstractions run", async () => {
  const f = fixture();
  const built = await f.request("repositories/ghr_1/builds", {});
  assert.equal(built.status, 202);
  f.withLatest("abstractions", "arn_abs_latest");
  const response = await f.request("repositories/ghr_1/scope", {
    proposalId: "bpr_1",
  });
  assert.equal(response.status, 202);
  assert.deepEqual(tools(f), [
    "graphify",
    "abstractions",
    "data_model",
    "graphify",
    "scope",
  ]);
  const params = f.enqueued[4]?.params as Record<string, unknown>;
  assert.equal(params["abstractionsRunId"], "arn_abs_latest");
  assert.equal("dataModelRunId" in params, false);
});
