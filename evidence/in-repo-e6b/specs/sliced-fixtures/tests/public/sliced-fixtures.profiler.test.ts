import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  EnqueueAnalysisResult,
  ProfileTransition,
  StoredAnalysisRun,
  StoredBountyProfile,
} from "@sandbox-factory/db";
import { canonicalJson } from "sandbox-factory";
import type {
  AnalysisParams,
  AnalysisTool,
  ProfileStatus,
} from "sandbox-factory";

import { BountyProfiler } from "../src/pricing/profiler.js";

const OWNER = "org_1";
const stamp = "2026-10-03T00:00:00.000Z";
const SPEC_HASH = "h".repeat(64);

/** The ids a fresh run of each tool is created with: `arn_g`, then `arn_g2`… */
const PREFIX: Partial<Record<AnalysisTool, string>> = {
  graphify: "arn_g",
  abstractions: "arn_a",
  data_model: "arn_d",
  scope: "arn_s",
};

const graphParams = { deadlineMinutes: 30 };
const abstractionsParams = (graphRunId: string) => ({
  deadlineMinutes: 30,
  builder: "abstractions",
  graphRunId,
});
const dataModelParams = (graphRunId: string) => ({
  deadlineMinutes: 30,
  builder: "data_model",
  graphRunId,
});
const scopeParams = (proposalId = "bpr_1") => ({
  deadlineMinutes: 60,
  agent: "scope",
  graphRunId: "arn_g",
  proposalId,
  specRevision: 2,
  specHash: SPEC_HASH,
});

interface Enqueued {
  snapshotId: string;
  tool: AnalysisTool | undefined;
  params: AnalysisParams;
  requestedBy: string | null;
  maxActive: number | undefined;
}

/**
 * An analysis queue that keeps one run per snapshot, tool and params, like
 * the store: an existing run is answered as is.
 */
class FakeRuns {
  readonly runs = new Map<string, StoredAnalysisRun>();
  readonly enqueued: Enqueued[] = [];
  /** Per tool, an answer other than a fresh run. */
  readonly refuse = new Map<AnalysisTool, EnqueueAnalysisResult>();
  /** Per tool, the status (and code) a fresh run is created in. */
  readonly startAs = new Map<
    AnalysisTool,
    {
      status: StoredAnalysisRun["status"];
      errorCode?: StoredAnalysisRun["errorCode"];
    }
  >();
  /** Per tool, the obsolete log a fresh run's enqueue answers with. */
  readonly obsoleteLogKeys = new Map<AnalysisTool, string>();
  readonly #created = new Map<string, number>();

  enqueue = async (
    _owner: string,
    snapshotId: string,
    input: {
      tool?: AnalysisTool;
      params: AnalysisParams;
      requestedBy: string | null;
      maxActive?: number;
    },
  ): Promise<EnqueueAnalysisResult> => {
    this.enqueued.push({
      snapshotId,
      tool: input.tool,
      params: input.params,
      requestedBy: input.requestedBy,
      maxActive: input.maxActive,
    });
    const tool = input.tool ?? "graphify";
    const refused = this.refuse.get(tool);
    if (refused !== undefined) return refused;
    const existing = [...this.runs.values()].find(
      (run) =>
        run.snapshotId === snapshotId &&
        run.tool === tool &&
        canonicalJson(run.params) === canonicalJson(input.params),
    );
    if (existing !== undefined)
      return { ok: true, run: existing, created: false };
    const count = (this.#created.get(tool) ?? 0) + 1;
    this.#created.set(tool, count);
    const prefix = PREFIX[tool] ?? `arn_${tool}`;
    const id = count === 1 ? prefix : `${prefix}${count}`;
    const start = this.startAs.get(tool);
    const run = this.seed(
      id,
      snapshotId,
      tool,
      input.params,
      start?.status ?? "queued",
      start?.errorCode ?? null,
    );
    const obsoleteLogKey = this.obsoleteLogKeys.get(tool);
    return {
      ok: true,
      run,
      created: true,
      ...(obsoleteLogKey === undefined ? {} : { obsoleteLogKey }),
    };
  };

  get = async (_owner: string, id: string) => this.runs.get(id) ?? null;

  /** A run the queue already holds. */
  seed(
    id: string,
    snapshotId: string,
    tool: AnalysisTool,
    params: unknown,
    status: StoredAnalysisRun["status"],
    errorCode: StoredAnalysisRun["errorCode"] = null,
  ): StoredAnalysisRun {
    const run = {
      id,
      snapshotId,
      repoId: "ghr_1",
      tool,
      toolVersion: `${tool}@1`,
      params,
      status,
      attempt: 0,
      maxAttempts: 2,
      errorCode,
      errorDetail: null,
      progress: null,
      startedAt: null,
      finishedAt: null,
      deadlineAt: null,
      createdAt: stamp,
    } as StoredAnalysisRun;
    this.runs.set(id, run);
    return run;
  }

  set(
    id: string,
    status: StoredAnalysisRun["status"],
    errorCode: StoredAnalysisRun["errorCode"] = null,
  ) {
    const run = this.runs.get(id);
    assert.ok(run, `no run ${id}`);
    this.runs.set(id, { ...run, status, errorCode });
  }

  toolsSince(from = 0) {
    return this.enqueued.slice(from).map((each) => each.tool);
  }

  ofTool(tool: AnalysisTool, from = 0) {
    return this.enqueued.slice(from).filter((each) => each.tool === tool);
  }
}

/** The profile store, in memory, with its compare-and-set step. */
class FakeProfiles {
  readonly rows = new Map<string, StoredBountyProfile>();
  /** Set to make `advance` behave as though another sweep moved first. */
  raced = false;

  request = async () => null;

  pending = async (owner: string) =>
    [...this.rows.values()].filter(
      (row) =>
        row.organizationId === owner &&
        ["queued", "scoping", "slicing"].includes(row.status),
    );

  organizationsWithPending = async () => [
    ...new Set(
      [...this.rows.values()]
        .filter((row) => ["queued", "scoping", "slicing"].includes(row.status))
        .map((row) => row.organizationId),
    ),
  ];

  advance = async (
    _owner: string,
    id: string,
    from: ProfileStatus,
    to: ProfileTransition,
  ) => {
    const row = this.rows.get(id);
    if (this.raced || row === undefined || row.status !== from) return false;
    this.rows.set(id, {
      ...row,
      status: to.status,
      ...(to.status === "scoping" ? { scopeRunId: to.scopeRunId } : {}),
      ...(to.status === "slicing" ? { sliceRunId: to.sliceRunId } : {}),
      ...(to.status === "ready" ? { profile: to.profile } : {}),
      ...(to.status === "failed"
        ? { errorCode: to.errorCode, runErrorCode: to.runErrorCode ?? null }
        : {}),
    });
    return true;
  };

  /** A queued row, as `request` would have stored it. */
  queue(id: string, proposalId: string, snapshotId: string | null) {
    this.rows.set(id, {
      id,
      organizationId: OWNER,
      proposalId,
      specRevision: 2,
      specHash: SPEC_HASH,
      snapshotId,
      repository: "acme/app",
      status: "queued",
      errorCode: null,
      runErrorCode: null,
      scopeRunId: null,
      sliceRunId: null,
      profile: null,
      createdAt: stamp,
      updatedAt: stamp,
    });
  }

  row(id = "bpf_1"): StoredBountyProfile {
    const row = this.rows.get(id);
    assert.ok(row, `no profile ${id}`);
    return row;
  }
}

function harness(options: { maxActive?: number } = { maxActive: 4 }) {
  const runs = new FakeRuns();
  const profiles = new FakeProfiles();
  const errors: string[] = [];
  const removed: string[] = [];
  const settled: StoredBountyProfile[] = [];
  let launches = 0;
  const profiler = new BountyProfiler({
    profiles,
    runs,
    artifacts: { list: async () => [] },
    snapshots: { get: async () => null },
    specs: { get: async () => null },
    ensureWorker: async () => {
      launches += 1;
    },
    removeObject: async (key) => {
      removed.push(key);
    },
    ...("maxActive" in options ? { maxActive: options.maxActive } : {}),
    intervalMs: 60_000,
    onSettled: async (_owner, profile) => {
      settled.push(profile);
    },
    onError: (code) => errors.push(code),
  });
  return {
    profiler,
    runs,
    profiles,
    errors,
    removed,
    settled,
    launches: () => launches,
  };
}

/** One queued profile, "bpf_1" for "bpr_1" on "rsn_1". */
function withProfile(options?: { maxActive?: number }) {
  const h = harness(options);
  h.profiles.queue("bpf_1", "bpr_1", "rsn_1");
  return h;
}

/** The snapshot's graph and map readers, already in the queue. */
function built(
  h: ReturnType<typeof harness>,
  abstractions: StoredAnalysisRun["status"] = "succeeded",
  dataModel: StoredAnalysisRun["status"] = "succeeded",
  graph: StoredAnalysisRun["status"] = "succeeded",
) {
  h.runs.seed(
    "arn_g",
    "rsn_1",
    "graphify",
    graphParams,
    graph,
    graph === "failed" ? "tool_failed" : null,
  );
  h.runs.seed(
    "arn_a",
    "rsn_1",
    "abstractions",
    abstractionsParams("arn_g"),
    abstractions,
    abstractions === "failed" ? "tool_failed" : null,
  );
  h.runs.seed(
    "arn_d",
    "rsn_1",
    "data_model",
    dataModelParams("arn_g"),
    dataModel,
    dataModel === "failed" ? "tool_failed" : null,
  );
}

function scopeRunId(h: ReturnType<typeof harness>, proposalId = "bpr_1") {
  const run = [...h.runs.runs.values()].find(
    (each) =>
      each.tool === "scope" &&
      (each.params as { proposalId?: string }).proposalId === proposalId,
  );
  assert.ok(run, `no scope run for ${proposalId}`);
  return run.id;
}

// ---------------------------------------------------------------------------
// The queued step: graphify, then abstractions, then data_model, then scope.

test("[happy-1] the first sweep queues the graph and both map readers and leaves the row queued", async () => {
  const h = withProfile();
  await h.profiler.sweep();
  assert.deepEqual(h.runs.enqueued, [
    {
      snapshotId: "rsn_1",
      tool: "graphify",
      params: { deadlineMinutes: 30 },
      requestedBy: null,
      maxActive: 3,
    },
    {
      snapshotId: "rsn_1",
      tool: "abstractions",
      params: {
        deadlineMinutes: 30,
        builder: "abstractions",
        graphRunId: "arn_g",
      },
      requestedBy: null,
      maxActive: 3,
    },
    {
      snapshotId: "rsn_1",
      tool: "data_model",
      params: {
        deadlineMinutes: 30,
        builder: "data_model",
        graphRunId: "arn_g",
      },
      requestedBy: null,
      maxActive: 3,
    },
  ]);
  assert.equal(h.runs.ofTool("scope").length, 0);
  assert.equal(h.profiles.row().status, "queued");
  assert.equal(h.profiles.row().scopeRunId, null);
  assert.equal(h.launches(), 1);
  assert.deepEqual(h.errors, []);
});

test("[happy-1] a later sweep while all three are still queued finds the same runs and still queues no scope", async () => {
  const h = withProfile();
  await h.profiler.sweep();
  const before = h.runs.enqueued.length;
  await h.profiler.sweep();
  const again = h.runs.enqueued.slice(before);
  assert.deepEqual(
    again.map(({ tool, params }) => ({ tool, params })),
    [
      { tool: "graphify", params: graphParams },
      { tool: "abstractions", params: abstractionsParams("arn_g") },
      { tool: "data_model", params: dataModelParams("arn_g") },
    ],
  );
  assert.equal(h.runs.ofTool("scope").length, 0);
  assert.equal(h.profiles.row().status, "queued");
  assert.equal(h.profiles.row().scopeRunId, null);
  assert.deepEqual(h.errors, []);
});

test("[happy-2] once both map readers have succeeded, the scope names both and the row moves to scoping", async () => {
  const h = withProfile();
  await h.profiler.sweep();
  const first = h.runs.enqueued.map(({ params }) => params);
  for (const id of ["arn_g", "arn_a", "arn_d"]) h.runs.set(id, "succeeded");
  const before = h.runs.enqueued.length;
  await h.profiler.sweep();
  assert.deepEqual(h.runs.toolsSince(before), [
    "graphify",
    "abstractions",
    "data_model",
    "scope",
  ]);
  const sweep = h.runs.enqueued.slice(before);
  assert.deepEqual(
    sweep.slice(0, 3).map(({ params }) => params),
    first,
  );
  const scope = sweep[3];
  assert.ok(scope !== undefined);
  assert.equal(scope.tool, "scope");
  assert.equal(scope.requestedBy, null);
  assert.equal(scope.maxActive, 3);
  assert.deepEqual(scope.params, {
    deadlineMinutes: 60,
    agent: "scope",
    graphRunId: "arn_g",
    proposalId: "bpr_1",
    specRevision: 2,
    specHash: SPEC_HASH,
    abstractionsRunId: "arn_a",
    dataModelRunId: "arn_d",
  });
  assert.equal(h.profiles.row().status, "scoping");
  assert.equal(h.profiles.row().scopeRunId, scopeRunId(h));
});

test("[happy-2] map readers that already succeeded are found and named in the very first sweep", async () => {
  const h = withProfile();
  built(h);
  await h.profiler.sweep();
  assert.deepEqual(h.runs.toolsSince(), [
    "graphify",
    "abstractions",
    "data_model",
    "scope",
  ]);
  assert.deepEqual(h.runs.ofTool("scope")[0]?.params, {
    ...scopeParams(),
    abstractionsRunId: "arn_a",
    dataModelRunId: "arn_d",
  });
  assert.equal(h.profiles.row().status, "scoping");
  assert.equal(h.profiles.row().scopeRunId, scopeRunId(h));
});

test("[boundary-1] while either map reader has not finished, no scope is queued and the row stays queued", async () => {
  for (const [abstractions, dataModel] of [
    ["queued", "queued"],
    ["running", "succeeded"],
    ["succeeded", "queued"],
    ["failed", "running"],
  ] as const) {
    const h = withProfile();
    built(h, abstractions, dataModel);
    await h.profiler.sweep();
    const label = `${abstractions}/${dataModel}`;
    assert.equal(h.runs.ofTool("scope").length, 0, label);
    assert.equal(h.profiles.row().status, "queued", label);
    assert.equal(h.profiles.row().scopeRunId, null, label);
  }
});

test("[boundary-1] once both have finished, only the map readers that succeeded are named", async () => {
  for (const [abstractions, dataModel, named] of [
    [
      "succeeded",
      "succeeded",
      { abstractionsRunId: "arn_a", dataModelRunId: "arn_d" },
    ],
    ["succeeded", "failed", { abstractionsRunId: "arn_a" }],
    ["failed", "succeeded", { dataModelRunId: "arn_d" }],
    ["failed", "failed", {}],
  ] as const) {
    const h = withProfile();
    built(h, abstractions, dataModel);
    await h.profiler.sweep();
    const label = `${abstractions}/${dataModel}`;
    const scopes = h.runs.ofTool("scope");
    assert.equal(scopes.length, 1, label);
    assert.deepEqual(scopes[0]?.params, { ...scopeParams(), ...named }, label);
    assert.equal(h.profiles.row().status, "scoping", label);
  }
});

test("[boundary-2] a context key the profiler does not name is absent, not undefined or null", async () => {
  const h = withProfile();
  built(h, "failed", "failed");
  await h.profiler.sweep();
  const params = h.runs.ofTool("scope")[0]?.params as
    | Record<string, unknown>
    | undefined;
  assert.ok(params !== undefined);
  assert.deepEqual(params, {
    deadlineMinutes: 60,
    agent: "scope",
    graphRunId: "arn_g",
    proposalId: "bpr_1",
    specRevision: 2,
    specHash: SPEC_HASH,
  });
  assert.equal("abstractionsRunId" in params, false);
  assert.equal("dataModelRunId" in params, false);
  assert.equal(h.profiles.row().status, "scoping");
  assert.equal(h.profiles.row().errorCode, null);
  assert.equal(h.profiles.row().runErrorCode, null);
  assert.deepEqual(h.errors, []);
});

test("[boundary-2] with only the data model failed, its key alone is absent and nothing is reported", async () => {
  const h = withProfile();
  built(h, "succeeded", "failed");
  await h.profiler.sweep();
  const params = h.runs.ofTool("scope")[0]?.params as
    | Record<string, unknown>
    | undefined;
  assert.ok(params !== undefined);
  assert.equal(params["abstractionsRunId"], "arn_a");
  assert.equal("dataModelRunId" in params, false);
  assert.equal(h.profiles.row().status, "scoping");
  assert.equal(h.profiles.row().errorCode, null);
  assert.deepEqual(h.errors, []);
});

test("[happy-3] the map readers are queued while the graph itself is still queued", async () => {
  const h = withProfile();
  await h.profiler.sweep();
  assert.equal(h.runs.runs.get("arn_g")?.status, "queued");
  assert.deepEqual(
    h.runs.ofTool("abstractions").map(({ params }) => params),
    [abstractionsParams("arn_g")],
  );
  assert.deepEqual(
    h.runs.ofTool("data_model").map(({ params }) => params),
    [dataModelParams("arn_g")],
  );
  assert.equal(h.profiles.row().status, "queued");
});

test("[happy-3] the map readers are queued while the graph is running", async () => {
  const h = withProfile();
  h.runs.startAs.set("graphify", { status: "running" });
  await h.profiler.sweep();
  assert.deepEqual(
    h.runs.ofTool("abstractions").map(({ params }) => params),
    [abstractionsParams("arn_g")],
  );
  assert.deepEqual(
    h.runs.ofTool("data_model").map(({ params }) => params),
    [dataModelParams("arn_g")],
  );
  assert.equal(h.runs.ofTool("scope").length, 0);
  assert.equal(h.profiles.row().status, "queued");
});

// ---------------------------------------------------------------------------
// A failed graph, or a missing source, fails the profile.

test("[unhappy-1] a graph out of retries fails the profile and queues nothing behind it", async () => {
  const h = withProfile();
  h.runs.startAs.set("graphify", {
    status: "failed",
    errorCode: "tool_failed",
  });
  await h.profiler.sweep();
  assert.deepEqual(h.runs.toolsSince(), ["graphify"]);
  assert.equal(h.profiles.row().status, "failed");
  assert.equal(h.profiles.row().errorCode, "scope_failed");
  assert.equal(h.profiles.row().runErrorCode, "tool_failed");
  assert.equal(h.launches(), 0);
  assert.equal(h.settled.length, 1);
  assert.equal(h.settled[0]?.id, "bpf_1");
  assert.equal(h.settled[0]?.status, "failed");
  assert.equal(h.settled[0]?.errorCode, "scope_failed");
  assert.equal(h.settled[0]?.runErrorCode, "tool_failed");
});

test("[unhappy-1] a graph that fails after its map readers were queued fails the profile before they are asked for again", async () => {
  const h = withProfile();
  await h.profiler.sweep();
  h.runs.set("arn_g", "failed", "tool_timeout");
  const before = h.runs.enqueued.length;
  await h.profiler.sweep();
  assert.deepEqual(h.runs.toolsSince(before), ["graphify"]);
  assert.equal(h.profiles.row().status, "failed");
  assert.equal(h.profiles.row().errorCode, "scope_failed");
  assert.equal(h.profiles.row().runErrorCode, "tool_timeout");
  assert.equal(h.settled.length, 1);
});

test("[unhappy-2] an abstractions run the store will not enqueue fails the profile as unavailable", async () => {
  for (const reason of ["not-found", "graph_mismatch"] as const) {
    const h = withProfile();
    h.runs.refuse.set("abstractions", { ok: false, reason });
    await h.profiler.sweep();
    assert.equal(h.runs.ofTool("scope").length, 0, reason);
    assert.equal(h.profiles.row().status, "failed", reason);
    assert.equal(h.profiles.row().errorCode, "source_unavailable", reason);
    assert.equal(h.profiles.row().runErrorCode, null, reason);
    assert.equal(h.launches(), 1, reason);
  }
});

test("[unhappy-2] a data_model run the store will not enqueue fails the profile as unavailable", async () => {
  for (const reason of ["not-found", "graph_mismatch"] as const) {
    const h = withProfile();
    h.runs.refuse.set("data_model", { ok: false, reason });
    await h.profiler.sweep();
    assert.deepEqual(
      h.runs.toolsSince(),
      ["graphify", "abstractions", "data_model"],
      reason,
    );
    assert.equal(h.profiles.row().status, "failed", reason);
    assert.equal(h.profiles.row().errorCode, "source_unavailable", reason);
    assert.equal(h.profiles.row().runErrorCode, null, reason);
    assert.equal(h.launches(), 1, reason);
  }
});

test("[unhappy-3] a profile with no snapshot fails before anything is enqueued", async () => {
  const h = harness();
  h.profiles.queue("bpf_1", "bpr_1", null);
  await h.profiler.sweep();
  assert.equal(h.runs.enqueued.length, 0);
  assert.equal(h.profiles.row().status, "failed");
  assert.equal(h.profiles.row().errorCode, "source_unavailable");
});

test("[unhappy-3] a profile with no snapshot is handed on as failed and wakes no worker", async () => {
  const h = harness();
  h.profiles.queue("bpf_1", "bpr_1", null);
  await h.profiler.sweep();
  assert.equal(h.runs.enqueued.length, 0);
  assert.equal(h.launches(), 0);
  assert.equal(h.settled.length, 1);
  assert.equal(h.settled[0]?.status, "failed");
  assert.equal(h.settled[0]?.errorCode, "source_unavailable");
});

test("[unhappy-4] a scope that fails after the map readers finished fails the profile as before", async () => {
  const h = withProfile();
  built(h);
  h.runs.startAs.set("scope", {
    status: "failed",
    errorCode: "agent_unavailable",
  });
  await h.profiler.sweep();
  assert.equal(h.profiles.row().status, "failed");
  assert.equal(h.profiles.row().errorCode, "scope_failed");
  assert.equal(h.profiles.row().runErrorCode, "agent_unavailable");
});

test("[unhappy-4] a failed scope behind two failed map readers fails with the scope's own code", async () => {
  const h = withProfile();
  built(h, "failed", "failed");
  h.runs.startAs.set("scope", {
    status: "failed",
    errorCode: "agent_unavailable",
  });
  await h.profiler.sweep();
  assert.equal(h.runs.ofTool("scope").length, 1);
  assert.equal(h.profiles.row().status, "failed");
  assert.equal(h.profiles.row().errorCode, "scope_failed");
  assert.equal(h.profiles.row().runErrorCode, "agent_unavailable");
});

// ---------------------------------------------------------------------------
// The held-back cap.

test("[boundary-3] the map readers' enqueues use the same held-back cap as the graph", async () => {
  for (const [cap, held] of [
    [4, 3],
    [undefined, 2],
  ] as const) {
    const h = harness(cap === undefined ? {} : { maxActive: cap });
    h.profiles.queue("bpf_1", "bpr_1", "rsn_1");
    await h.profiler.sweep();
    const caps = h.runs.enqueued
      .filter((each) =>
        ["graphify", "abstractions", "data_model"].includes(each.tool ?? ""),
      )
      .map((each) => each.maxActive);
    assert.deepEqual(caps, [held, held, held], `cap ${cap}`);
  }
});

test("[boundary-3] a cap of one or two holds every queued-step enqueue to one", async () => {
  for (const cap of [1, 2]) {
    const h = harness({ maxActive: cap });
    h.profiles.queue("bpf_1", "bpr_1", "rsn_1");
    await h.profiler.sweep();
    const caps = h.runs.enqueued
      .filter((each) =>
        ["graphify", "abstractions", "data_model"].includes(each.tool ?? ""),
      )
      .map((each) => each.maxActive);
    assert.deepEqual(caps, [1, 1, 1], `cap ${cap}`);
  }
});

test("[boundary-4] an abstractions run refused at the cap leaves the row queued, and the next queued row is not tried", async () => {
  const h = harness();
  h.profiles.queue("bpf_1", "bpr_1", "rsn_1");
  h.profiles.queue("bpf_2", "bpr_2", "rsn_1");
  h.runs.refuse.set("abstractions", { ok: false, reason: "run_limit" });
  await h.profiler.sweep();
  assert.deepEqual(h.runs.toolsSince(), ["graphify", "abstractions"]);
  assert.equal(h.profiles.row("bpf_1").status, "queued");
  assert.equal(h.profiles.row("bpf_2").status, "queued");
  assert.equal(h.launches(), 1);
  assert.deepEqual(h.errors, []);
});

test("[boundary-4] a data_model run refused at the cap leaves the row queued, and the next queued row is not tried", async () => {
  const h = harness();
  h.profiles.queue("bpf_1", "bpr_1", "rsn_1");
  h.profiles.queue("bpf_2", "bpr_2", "rsn_1");
  h.runs.refuse.set("data_model", { ok: false, reason: "run_limit" });
  await h.profiler.sweep();
  assert.deepEqual(h.runs.toolsSince(), [
    "graphify",
    "abstractions",
    "data_model",
  ]);
  assert.equal(h.profiles.row("bpf_1").status, "queued");
  assert.equal(h.profiles.row("bpf_2").status, "queued");
  assert.equal(h.launches(), 1);
  assert.deepEqual(h.errors, []);
});

test("[boundary-5] a row waiting on its map readers does not stop the next queued row", async () => {
  const h = harness();
  h.profiles.queue("bpf_1", "bpr_1", "rsn_1");
  h.profiles.queue("bpf_2", "bpr_2", "rsn_2");
  await h.profiler.sweep();
  assert.deepEqual(
    h.runs.enqueued.map(({ tool, snapshotId }) => [tool, snapshotId]),
    [
      ["graphify", "rsn_1"],
      ["abstractions", "rsn_1"],
      ["data_model", "rsn_1"],
      ["graphify", "rsn_2"],
      ["abstractions", "rsn_2"],
      ["data_model", "rsn_2"],
    ],
  );
  assert.equal(h.profiles.row("bpf_1").status, "queued");
  assert.equal(h.profiles.row("bpf_2").status, "queued");
});

test("[boundary-5] two waiting rows on one snapshot are both tried in one sweep", async () => {
  const h = harness();
  h.profiles.queue("bpf_1", "bpr_1", "rsn_1");
  h.profiles.queue("bpf_2", "bpr_2", "rsn_1");
  await h.profiler.sweep();
  assert.deepEqual(h.runs.toolsSince(), [
    "graphify",
    "abstractions",
    "data_model",
    "graphify",
    "abstractions",
    "data_model",
  ]);
  assert.equal(h.runs.ofTool("scope").length, 0);
  assert.equal(h.profiles.row("bpf_1").status, "queued");
  assert.equal(h.profiles.row("bpf_2").status, "queued");
});

// ---------------------------------------------------------------------------
// Obsolete logs.

test("[happy-4] each re-queued run's obsolete log is removed in the queued step", async () => {
  const h = withProfile();
  for (const tool of ["graphify", "abstractions", "data_model"] as const)
    h.runs.obsoleteLogKeys.set(tool, "logs/old.txt");
  await h.profiler.sweep();
  assert.deepEqual(h.removed, ["logs/old.txt", "logs/old.txt", "logs/old.txt"]);
});

test("[happy-4] only the map reader whose enqueue carries an obsolete log has it removed", async () => {
  const h = withProfile();
  h.runs.obsoleteLogKeys.set("data_model", "logs/data-model.txt");
  await h.profiler.sweep();
  assert.deepEqual(h.removed, ["logs/data-model.txt"]);
});

// ---------------------------------------------------------------------------
// Concurrency.

test("[concurrency-1] two profiles on one snapshot ask for identical map-reader runs and name the same ones", async () => {
  const h = harness();
  h.profiles.queue("bpf_1", "bpr_1", "rsn_1");
  h.profiles.queue("bpf_2", "bpr_2", "rsn_1");
  built(h);
  await h.profiler.sweep();
  const abstractions = h.runs.ofTool("abstractions");
  const dataModel = h.runs.ofTool("data_model");
  assert.equal(abstractions.length, 2);
  assert.equal(dataModel.length, 2);
  assert.deepEqual(abstractions[0]?.params, abstractions[1]?.params);
  assert.deepEqual(dataModel[0]?.params, dataModel[1]?.params);
  const scopes = h.runs.ofTool("scope");
  assert.equal(scopes.length, 2);
  for (const scope of scopes) {
    const params = scope.params as unknown as Record<string, unknown>;
    assert.equal(params["abstractionsRunId"], "arn_a");
    assert.equal(params["dataModelRunId"], "arn_d");
  }
  const first = h.profiles.row("bpf_1");
  const second = h.profiles.row("bpf_2");
  assert.equal(first.status, "scoping");
  assert.equal(second.status, "scoping");
  assert.equal(first.scopeRunId, scopeRunId(h, "bpr_1"));
  assert.equal(second.scopeRunId, scopeRunId(h, "bpr_2"));
  assert.notEqual(first.scopeRunId, second.scopeRunId);
});

test("[concurrency-1] two profiles on one snapshot both leave out the same failed map reader", async () => {
  const h = harness();
  h.profiles.queue("bpf_1", "bpr_1", "rsn_1");
  h.profiles.queue("bpf_2", "bpr_2", "rsn_1");
  built(h, "succeeded", "failed");
  await h.profiler.sweep();
  const scopes = h.runs.ofTool("scope");
  assert.equal(scopes.length, 2);
  for (const scope of scopes) {
    const params = scope.params as unknown as Record<string, unknown>;
    assert.equal(params["abstractionsRunId"], "arn_a");
    assert.equal("dataModelRunId" in params, false);
  }
  assert.equal(h.profiles.row("bpf_1").status, "scoping");
  assert.equal(h.profiles.row("bpf_2").status, "scoping");
});

test("[concurrency-2] a sweep asked for during a sweep returns that sweep and runs one more after it", async () => {
  const h = withProfile();
  let passes = 0;
  const discover = h.profiles.organizationsWithPending;
  h.profiles.organizationsWithPending = async () => {
    passes += 1;
    return discover();
  };
  const first = h.profiler.sweep();
  const second = h.profiler.sweep();
  await Promise.all([first, second]);
  assert.equal(passes, 2);
});

test("[concurrency-2] several sweeps asked for during one sweep coalesce into one more", async () => {
  const h = withProfile();
  let passes = 0;
  const discover = h.profiles.organizationsWithPending;
  h.profiles.organizationsWithPending = async () => {
    passes += 1;
    return discover();
  };
  await Promise.all([
    h.profiler.sweep(),
    h.profiler.sweep(),
    h.profiler.sweep(),
  ]);
  assert.equal(passes, 2);
});

test("[concurrency-3] a row another sweep moved to scoping first is left alone", async () => {
  const h = withProfile();
  built(h);
  h.profiles.raced = true;
  await h.profiler.sweep();
  assert.equal(h.runs.ofTool("scope").length, 1);
  assert.equal(h.profiles.row().status, "queued");
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.settled, []);
});

test("[concurrency-3] a row another sweep moved first is not failed or handed on for its failed graph", async () => {
  const h = withProfile();
  h.runs.startAs.set("graphify", {
    status: "failed",
    errorCode: "tool_failed",
  });
  h.profiles.raced = true;
  await h.profiler.sweep();
  assert.equal(h.profiles.row().status, "queued");
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.settled, []);
});
