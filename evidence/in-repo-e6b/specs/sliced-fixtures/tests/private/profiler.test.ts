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
  AnalysisErrorCode,
  AnalysisParams,
  AnalysisTool,
  ProfileStatus,
} from "sandbox-factory";

import { BountyProfiler } from "../../src/pricing/profiler.js";

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
const scopeParams = (
  overrides: Partial<{
    graphRunId: string;
    proposalId: string;
    specRevision: number;
    specHash: string;
  }> = {},
) => ({
  deadlineMinutes: 60,
  agent: "scope",
  graphRunId: "arn_g",
  proposalId: "bpr_1",
  specRevision: 2,
  specHash: SPEC_HASH,
  ...overrides,
});

const QUEUED_STEP: readonly AnalysisTool[] = [
  "graphify",
  "abstractions",
  "data_model",
];

interface Enqueued {
  owner: string;
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
  /** An answer other than a fresh or found run, when it returns one. */
  refuse: (
    owner: string,
    snapshotId: string,
    tool: AnalysisTool,
  ) => EnqueueAnalysisResult | undefined = () => undefined;
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
    owner: string,
    snapshotId: string,
    input: {
      tool?: AnalysisTool;
      params: AnalysisParams;
      requestedBy: string | null;
      maxActive?: number;
    },
  ): Promise<EnqueueAnalysisResult> => {
    this.enqueued.push({
      owner,
      snapshotId,
      tool: input.tool,
      params: input.params,
      requestedBy: input.requestedBy,
      maxActive: input.maxActive,
    });
    const tool = input.tool ?? "graphify";
    const refused = this.refuse(owner, snapshotId, tool);
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

  runsOf(tool: AnalysisTool) {
    return [...this.runs.values()].filter((run) => run.tool === tool);
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
  queue(
    id: string,
    proposalId: string,
    snapshotId: string | null,
    options: {
      organizationId?: string;
      specRevision?: number;
      specHash?: string;
    } = {},
  ) {
    this.rows.set(id, {
      id,
      organizationId: options.organizationId ?? OWNER,
      proposalId,
      specRevision: options.specRevision ?? 2,
      specHash: options.specHash ?? SPEC_HASH,
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

const codeOf = (status: StoredAnalysisRun["status"]) =>
  status === "failed" ? ("tool_failed" as const) : null;

/** The snapshot's graph and map readers, already in the queue. */
function built(
  h: ReturnType<typeof harness>,
  abstractions: StoredAnalysisRun["status"] = "succeeded",
  dataModel: StoredAnalysisRun["status"] = "succeeded",
  ids: { snapshot?: string; graph?: string; abs?: string; dm?: string } = {},
) {
  const graph = ids.graph ?? "arn_g";
  const snapshot = ids.snapshot ?? "rsn_1";
  h.runs.seed(graph, snapshot, "graphify", graphParams, "succeeded");
  h.runs.seed(
    ids.abs ?? "arn_a",
    snapshot,
    "abstractions",
    abstractionsParams(graph),
    abstractions,
    codeOf(abstractions),
  );
  h.runs.seed(
    ids.dm ?? "arn_d",
    snapshot,
    "data_model",
    dataModelParams(graph),
    dataModel,
    codeOf(dataModel),
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

const paramsOf = (each: Enqueued | undefined) =>
  each?.params as unknown as Record<string, unknown> | undefined;

// ---------------------------------------------------------------------------
// happy-1

// Extends "[happy-1] the first sweep queues the graph and both map readers and
// leaves the row queued": another snapshot and another cap.
test("[happy-1] on another snapshot and cap, the first sweep queues graph, abstractions and data_model there with the held-back cap", async () => {
  const h = harness({ maxActive: 7 });
  h.profiles.queue("bpf_1", "bpr_1", "rsn_9");
  await h.profiler.sweep();
  assert.deepEqual(
    h.runs.enqueued.map(({ snapshotId, tool, params, requestedBy, maxActive }) => ({
      snapshotId,
      tool,
      params,
      requestedBy,
      maxActive,
    })),
    [
      {
        snapshotId: "rsn_9",
        tool: "graphify",
        params: graphParams,
        requestedBy: null,
        maxActive: 6,
      },
      {
        snapshotId: "rsn_9",
        tool: "abstractions",
        params: abstractionsParams("arn_g"),
        requestedBy: null,
        maxActive: 6,
      },
      {
        snapshotId: "rsn_9",
        tool: "data_model",
        params: dataModelParams("arn_g"),
        requestedBy: null,
        maxActive: 6,
      },
    ],
  );
  assert.equal(h.runs.ofTool("scope").length, 0);
  assert.equal(h.profiles.row().status, "queued");
  assert.equal(h.profiles.row().scopeRunId, null);
  assert.equal(h.launches(), 1);
  assert.deepEqual(h.errors, []);
});

// Extends "[happy-1] the first sweep queues…": the graph is found, not
// created, under an id the map readers must carry as given.
test("[happy-1] map readers name the graph run the store found, whatever its id", async () => {
  const h = withProfile();
  h.runs.seed("arn_graph_x7", "rsn_1", "graphify", graphParams, "succeeded");
  await h.profiler.sweep();
  assert.deepEqual(h.runs.toolsSince(), QUEUED_STEP);
  assert.deepEqual(paramsOf(h.runs.ofTool("abstractions")[0]), abstractionsParams("arn_graph_x7"));
  assert.deepEqual(paramsOf(h.runs.ofTool("data_model")[0]), dataModelParams("arn_graph_x7"));
  assert.equal(h.runs.ofTool("scope").length, 0);
  assert.equal(h.profiles.row().status, "queued");
  assert.equal(h.profiles.row().scopeRunId, null);
  assert.equal(h.launches(), 1);
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.settled, []);
});

// ---------------------------------------------------------------------------
// happy-2

// Extends "[happy-2] once both map readers have succeeded…": another
// proposal, revision, hash, snapshot and cap, over three sweeps.
test("[happy-2] after a sweep spent waiting, the scope names both readers with the profile's own proposal, revision and hash", async () => {
  const h = harness({ maxActive: 10 });
  const hash = "a".repeat(64);
  h.profiles.queue("bpf_7", "bpr_7", "rsn_3", {
    specRevision: 5,
    specHash: hash,
  });
  await h.profiler.sweep();
  h.runs.set("arn_a", "running");
  await h.profiler.sweep();
  assert.equal(h.runs.ofTool("scope").length, 0);
  assert.equal(h.profiles.row("bpf_7").status, "queued");
  for (const id of ["arn_g", "arn_a", "arn_d"]) h.runs.set(id, "succeeded");
  const before = h.runs.enqueued.length;
  await h.profiler.sweep();
  assert.deepEqual(h.runs.toolsSince(before), [...QUEUED_STEP, "scope"]);
  const scope = h.runs.enqueued[before + 3];
  assert.ok(scope !== undefined);
  assert.equal(scope.snapshotId, "rsn_3");
  assert.equal(scope.requestedBy, null);
  assert.equal(scope.maxActive, 9);
  assert.deepEqual(scope.params, {
    ...scopeParams({ proposalId: "bpr_7", specRevision: 5, specHash: hash }),
    abstractionsRunId: "arn_a",
    dataModelRunId: "arn_d",
  });
  assert.equal(h.profiles.row("bpf_7").status, "scoping");
  assert.equal(h.profiles.row("bpf_7").scopeRunId, scopeRunId(h, "bpr_7"));
  assert.deepEqual(h.errors, []);
});

// Extends "[happy-2] map readers that already succeeded are found…": the
// found runs' ids are not the ones a fresh run would get.
test("[happy-2] the scope names the very graph and reader runs the store answered with", async () => {
  const h = withProfile();
  built(h, "succeeded", "succeeded", {
    graph: "arn_graph_old",
    abs: "arn_abs_old",
    dm: "arn_dm_old",
  });
  await h.profiler.sweep();
  assert.deepEqual(h.runs.toolsSince(), [...QUEUED_STEP, "scope"]);
  assert.deepEqual(h.runs.ofTool("scope")[0]?.params, {
    ...scopeParams({ graphRunId: "arn_graph_old" }),
    abstractionsRunId: "arn_abs_old",
    dataModelRunId: "arn_dm_old",
  });
  assert.equal(h.profiles.row().status, "scoping");
  assert.equal(h.profiles.row().scopeRunId, scopeRunId(h));
});

// ---------------------------------------------------------------------------
// happy-3

// Extends "[happy-3] the map readers are queued while the graph itself is
// still queued": the queued graph is one the store already held.
test("[happy-3] a graph found still queued has both map readers queued behind it under its id", async () => {
  const h = withProfile();
  h.runs.seed("arn_gq", "rsn_1", "graphify", graphParams, "queued");
  await h.profiler.sweep();
  assert.deepEqual(h.runs.toolsSince(), QUEUED_STEP);
  assert.deepEqual(
    h.runs.ofTool("abstractions").map(({ params }) => params),
    [abstractionsParams("arn_gq")],
  );
  assert.deepEqual(
    h.runs.ofTool("data_model").map(({ params }) => params),
    [dataModelParams("arn_gq")],
  );
  assert.equal(h.runs.ofTool("scope").length, 0);
  assert.equal(h.profiles.row().status, "queued");
  assert.equal(h.profiles.row().scopeRunId, null);
});

// ---------------------------------------------------------------------------
// happy-4

// Extends "[happy-4] each re-queued run's obsolete log is removed…": each
// tool's enqueue carries its own key.
test("[happy-4] each of graphify, abstractions and data_model has its own obsolete log removed once", async () => {
  const h = withProfile();
  h.runs.obsoleteLogKeys.set("graphify", "logs/graph.txt");
  h.runs.obsoleteLogKeys.set("abstractions", "logs/abstractions.txt");
  h.runs.obsoleteLogKeys.set("data_model", "logs/data-model.txt");
  await h.profiler.sweep();
  assert.deepEqual([...h.removed].sort(), [
    "logs/abstractions.txt",
    "logs/data-model.txt",
    "logs/graph.txt",
  ]);
});

// Extends "[happy-4] only the map reader whose enqueue carries…": the
// abstractions run alone, and in a sweep that goes on to the scope.
test("[happy-4] in a sweep that reaches the scope, the abstractions run's obsolete log is removed with the others", async () => {
  const h = withProfile();
  for (const tool of QUEUED_STEP) h.runs.startAs.set(tool, { status: "succeeded" });
  h.runs.obsoleteLogKeys.set("abstractions", "logs/abstractions.txt");
  h.runs.obsoleteLogKeys.set("scope", "logs/scope.txt");
  await h.profiler.sweep();
  assert.deepEqual([...h.removed].sort(), [
    "logs/abstractions.txt",
    "logs/scope.txt",
  ]);
  assert.equal(h.profiles.row().status, "scoping");
});

// ---------------------------------------------------------------------------
// boundary-1

// Extends "[boundary-1] while either map reader has not finished…": the
// unfinished combinations the public test leaves out.
test("[boundary-1] every other combination with an unfinished map reader queues no scope", async () => {
  for (const [abstractions, dataModel] of [
    ["queued", "succeeded"],
    ["queued", "failed"],
    ["running", "running"],
    ["running", "failed"],
    ["running", "queued"],
    ["succeeded", "running"],
    ["failed", "queued"],
  ] as const) {
    const h = withProfile();
    built(h, abstractions, dataModel);
    await h.profiler.sweep();
    const label = `${abstractions}/${dataModel}`;
    assert.deepEqual(h.runs.toolsSince(), QUEUED_STEP, label);
    assert.equal(h.profiles.row().status, "queued", label);
    assert.equal(h.profiles.row().scopeRunId, null, label);
    assert.deepEqual(h.errors, [], label);
    assert.deepEqual(h.settled, [], label);
  }
});

// Extends "[boundary-1] once both have finished, only the map readers that
// succeeded are named": the readers finish in different sweeps.
test("[boundary-1] a reader that finishes failed after a sweep spent waiting is left out of the scope", async () => {
  const h = withProfile();
  built(h, "running", "succeeded");
  await h.profiler.sweep();
  assert.equal(h.runs.ofTool("scope").length, 0);
  assert.equal(h.profiles.row().status, "queued");
  h.runs.set("arn_a", "failed", "tool_timeout");
  await h.profiler.sweep();
  const scopes = h.runs.ofTool("scope");
  assert.equal(scopes.length, 1);
  assert.deepEqual(scopes[0]?.params, {
    ...scopeParams(),
    dataModelRunId: "arn_d",
  });
  assert.equal(h.profiles.row().status, "scoping");
  assert.equal(h.profiles.row().scopeRunId, scopeRunId(h));
});

// Extends "[boundary-1] once both have finished…": readers created already
// finished in the very sweep that enqueues them.
test("[boundary-1] readers that come back finished from their own enqueue are named or left out in that sweep", async () => {
  for (const [abstractions, dataModel, named] of [
    ["succeeded", "failed", { abstractionsRunId: "arn_a" }],
    ["failed", "succeeded", { dataModelRunId: "arn_d" }],
  ] as const) {
    const h = withProfile();
    h.runs.startAs.set("graphify", { status: "succeeded" });
    h.runs.startAs.set("abstractions", {
      status: abstractions,
      errorCode: codeOf(abstractions),
    });
    h.runs.startAs.set("data_model", {
      status: dataModel,
      errorCode: codeOf(dataModel),
    });
    await h.profiler.sweep();
    const label = `${abstractions}/${dataModel}`;
    assert.deepEqual(h.runs.toolsSince(), [...QUEUED_STEP, "scope"], label);
    assert.deepEqual(
      h.runs.ofTool("scope")[0]?.params,
      { ...scopeParams(), ...named },
      label,
    );
    assert.equal(h.profiles.row().status, "scoping", label);
  }
});

// ---------------------------------------------------------------------------
// boundary-2

// Extends "[boundary-2] with only the data model failed…": the other side.
test("[boundary-2] with only the abstractions run failed, its key alone is absent and nothing is reported", async () => {
  const h = withProfile();
  built(h, "failed", "succeeded");
  await h.profiler.sweep();
  const params = paramsOf(h.runs.ofTool("scope")[0]);
  assert.ok(params !== undefined);
  assert.equal("abstractionsRunId" in params, false);
  assert.equal(params["dataModelRunId"], "arn_d");
  assert.equal(h.profiles.row().status, "scoping");
  assert.equal(h.profiles.row().errorCode, null);
  assert.equal(h.profiles.row().runErrorCode, null);
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.settled, []);
});

// Extends "[boundary-2] a context key the profiler does not name is absent":
// readers that failed with other codes, after they were asked for.
test("[boundary-2] readers failed with any code leave both keys absent, after both were asked for", async () => {
  for (const [absCode, dmCode] of [
    ["tool_timeout", "worker_lost"],
    ["cancelled", "too_large"],
  ] as const satisfies readonly (readonly [AnalysisErrorCode, AnalysisErrorCode])[]) {
    const h = withProfile();
    built(h, "failed", "failed");
    h.runs.set("arn_a", "failed", absCode);
    h.runs.set("arn_d", "failed", dmCode);
    await h.profiler.sweep();
    const label = `${absCode}/${dmCode}`;
    assert.deepEqual(h.runs.toolsSince(), [...QUEUED_STEP, "scope"], label);
    const params = paramsOf(h.runs.ofTool("scope")[0]);
    assert.ok(params !== undefined, label);
    assert.deepEqual(params, scopeParams(), label);
    assert.equal("abstractionsRunId" in params, false, label);
    assert.equal("dataModelRunId" in params, false, label);
    assert.equal(h.profiles.row().status, "scoping", label);
    assert.equal(h.profiles.row().errorCode, null, label);
    assert.equal(h.profiles.row().runErrorCode, null, label);
    assert.deepEqual(h.errors, [], label);
  }
});

// ---------------------------------------------------------------------------
// boundary-3

// Extends "[boundary-3] the map readers' enqueues use the same held-back cap
// as the graph": caps the public tests do not try.
test("[boundary-3] other caps are held one slot back on graphify, abstractions and data_model alike", async () => {
  for (const [cap, held] of [
    [3, 2],
    [6, 5],
    [10, 9],
  ] as const) {
    const h = harness({ maxActive: cap });
    h.profiles.queue("bpf_1", "bpr_1", "rsn_1");
    await h.profiler.sweep();
    assert.deepEqual(h.runs.toolsSince(), QUEUED_STEP, `cap ${cap}`);
    assert.deepEqual(
      h.runs.enqueued.map((each) => each.maxActive),
      [held, held, held],
      `cap ${cap}`,
    );
  }
});

// Extends "[boundary-3] a cap of one or two…": a sweep that goes on to the
// scope holds all four enqueues to the same cap.
test("[boundary-3] graph, both readers and the scope share one held-back cap in a single sweep", async () => {
  for (const [cap, held] of [
    [undefined, 2],
    [1, 1],
    [5, 4],
  ] as const) {
    const h = harness(cap === undefined ? {} : { maxActive: cap });
    h.profiles.queue("bpf_1", "bpr_1", "rsn_1");
    built(h);
    await h.profiler.sweep();
    assert.deepEqual(h.runs.toolsSince(), [...QUEUED_STEP, "scope"], `cap ${cap}`);
    assert.deepEqual(
      h.runs.enqueued.map((each) => each.maxActive),
      [held, held, held, held],
      `cap ${cap}`,
    );
  }
});

// ---------------------------------------------------------------------------
// boundary-4

// Extends "[boundary-4] an abstractions run refused at the cap…": more
// rows, on more snapshots, behind the refused one.
test("[boundary-4] an abstractions refusal at the cap stops every later queued row in the organization", async () => {
  const h = harness();
  h.profiles.queue("bpf_1", "bpr_1", "rsn_1");
  h.profiles.queue("bpf_2", "bpr_2", "rsn_2");
  h.profiles.queue("bpf_3", "bpr_3", "rsn_3");
  h.runs.refuse = (_owner, _snapshot, tool) =>
    tool === "abstractions" ? { ok: false, reason: "run_limit" } : undefined;
  await h.profiler.sweep();
  assert.deepEqual(
    h.runs.enqueued.map(({ tool, snapshotId }) => [tool, snapshotId]),
    [
      ["graphify", "rsn_1"],
      ["abstractions", "rsn_1"],
    ],
  );
  for (const id of ["bpf_1", "bpf_2", "bpf_3"])
    assert.equal(h.profiles.row(id).status, "queued", id);
  assert.equal(h.launches(), 1);
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.settled, []);
});

// Extends "[boundary-4] a data_model run refused at the cap…": the row is
// only held back, and moves on the next sweep once a slot is free.
test("[boundary-4] a row held back by a data_model refusal is tried again on the next sweep", async () => {
  const h = harness();
  h.profiles.queue("bpf_1", "bpr_1", "rsn_1");
  h.profiles.queue("bpf_2", "bpr_2", "rsn_1");
  let full = true;
  h.runs.refuse = (_owner, _snapshot, tool) =>
    full && tool === "data_model"
      ? { ok: false, reason: "run_limit" }
      : undefined;
  await h.profiler.sweep();
  assert.deepEqual(h.runs.toolsSince(), QUEUED_STEP);
  assert.equal(h.profiles.row("bpf_1").status, "queued");
  assert.equal(h.profiles.row("bpf_2").status, "queued");
  full = false;
  const before = h.runs.enqueued.length;
  await h.profiler.sweep();
  assert.deepEqual(h.runs.toolsSince(before), [...QUEUED_STEP, ...QUEUED_STEP]);
  assert.deepEqual(
    h.runs.ofTool("data_model", before).map(({ params }) => params),
    [dataModelParams("arn_g"), dataModelParams("arn_g")],
  );
  assert.equal(h.profiles.row("bpf_1").status, "queued");
  assert.equal(h.profiles.row("bpf_2").status, "queued");
  assert.deepEqual(h.errors, []);
});

// Extends "[boundary-4] … the next queued row is not tried": the cap is the
// organization's, so another organization's row still moves.
test("[boundary-4] a map reader refused at one organization's cap does not hold back another organization", async () => {
  const h = harness();
  h.profiles.queue("bpf_1", "bpr_1", "rsn_1");
  h.profiles.queue("bpf_2", "bpr_2", "rsn_1");
  h.profiles.queue("bpf_9", "bpr_9", "rsn_9", { organizationId: "org_2" });
  h.runs.refuse = (owner, _snapshot, tool) =>
    owner === OWNER && tool === "abstractions"
      ? { ok: false, reason: "run_limit" }
      : undefined;
  await h.profiler.sweep();
  assert.deepEqual(
    h.runs.enqueued
      .filter((each) => each.owner === OWNER)
      .map(({ tool, snapshotId }) => [tool, snapshotId]),
    [
      ["graphify", "rsn_1"],
      ["abstractions", "rsn_1"],
    ],
  );
  assert.deepEqual(
    h.runs.enqueued
      .filter((each) => each.owner === "org_2")
      .map(({ tool, snapshotId }) => [tool, snapshotId]),
    [
      ["graphify", "rsn_9"],
      ["abstractions", "rsn_9"],
      ["data_model", "rsn_9"],
    ],
  );
  assert.equal(h.profiles.row("bpf_1").status, "queued");
  assert.equal(h.profiles.row("bpf_2").status, "queued");
  assert.equal(h.profiles.row("bpf_9").status, "queued");
  assert.deepEqual(h.errors, []);
});

// ---------------------------------------------------------------------------
// boundary-5

// Extends "[boundary-5] a row waiting on its map readers does not stop the
// next queued row": three rows on three snapshots.
test("[boundary-5] three waiting rows on three snapshots are each tried in one sweep", async () => {
  const h = harness();
  h.profiles.queue("bpf_1", "bpr_1", "rsn_1");
  h.profiles.queue("bpf_2", "bpr_2", "rsn_2");
  h.profiles.queue("bpf_3", "bpr_3", "rsn_3");
  await h.profiler.sweep();
  assert.deepEqual(
    h.runs.enqueued.map(({ tool, snapshotId }) => [tool, snapshotId]),
    ["rsn_1", "rsn_2", "rsn_3"].flatMap((snapshot) =>
      QUEUED_STEP.map((tool) => [tool, snapshot]),
    ),
  );
  for (const id of ["bpf_1", "bpf_2", "bpf_3"])
    assert.equal(h.profiles.row(id).status, "queued", id);
  assert.equal(h.runs.ofTool("scope").length, 0);
  assert.equal(h.launches(), 1);
  assert.deepEqual(h.errors, []);
});

// Extends "[boundary-5] …": the row behind a waiting one has its readers
// finished, and goes on to its scope in the same sweep.
test("[boundary-5] a row behind a waiting one is scoped in the same sweep once its readers have finished", async () => {
  const h = harness();
  h.profiles.queue("bpf_1", "bpr_1", "rsn_1");
  h.profiles.queue("bpf_2", "bpr_2", "rsn_2");
  built(h, "succeeded", "succeeded", {
    snapshot: "rsn_2",
    graph: "arn_g_2",
    abs: "arn_a_2",
    dm: "arn_d_2",
  });
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
      ["scope", "rsn_2"],
    ],
  );
  assert.deepEqual(h.runs.ofTool("scope")[0]?.params, {
    ...scopeParams({ graphRunId: "arn_g_2", proposalId: "bpr_2" }),
    abstractionsRunId: "arn_a_2",
    dataModelRunId: "arn_d_2",
  });
  assert.equal(h.profiles.row("bpf_1").status, "queued");
  assert.equal(h.profiles.row("bpf_2").status, "scoping");
});

// ---------------------------------------------------------------------------
// unhappy-1

// Extends "[unhappy-1] a graph that fails after its map readers were
// queued…": the readers have even succeeded, and the graph's code differs.
test("[unhappy-1] a graph that fails once its readers succeeded fails the profile before they are asked for again", async () => {
  const h = withProfile();
  await h.profiler.sweep();
  h.runs.set("arn_a", "succeeded");
  h.runs.set("arn_d", "succeeded");
  h.runs.set("arn_g", "failed", "worker_lost");
  const before = h.runs.enqueued.length;
  await h.profiler.sweep();
  assert.deepEqual(h.runs.toolsSince(before), ["graphify"]);
  assert.equal(h.runs.ofTool("scope").length, 0);
  assert.equal(h.profiles.row().status, "failed");
  assert.equal(h.profiles.row().errorCode, "scope_failed");
  assert.equal(h.profiles.row().runErrorCode, "worker_lost");
  assert.equal(h.settled.length, 1);
  assert.equal(h.settled[0]?.id, "bpf_1");
  assert.equal(h.settled[0]?.status, "failed");
  assert.equal(h.settled[0]?.errorCode, "scope_failed");
  assert.equal(h.settled[0]?.runErrorCode, "worker_lost");
});

// ---------------------------------------------------------------------------
// unhappy-2

// Extends "[unhappy-2] an abstractions run the store will not enqueue…":
// the refusal comes on a later sweep, after the readers were queued.
test("[unhappy-2] a map reader refused as not there on a later sweep fails the profile as unavailable", async () => {
  for (const tool of ["abstractions", "data_model"] as const) {
    for (const reason of ["not-found", "graph_mismatch"] as const) {
      const h = withProfile();
      await h.profiler.sweep();
      assert.deepEqual(h.runs.toolsSince(), QUEUED_STEP);
      h.runs.set("arn_g", "succeeded");
      h.runs.refuse = (_owner, _snapshot, asked) =>
        asked === tool ? { ok: false, reason } : undefined;
      await h.profiler.sweep();
      const label = `${tool}/${reason}`;
      assert.equal(h.runs.ofTool("scope").length, 0, label);
      assert.equal(h.profiles.row().status, "failed", label);
      assert.equal(h.profiles.row().errorCode, "source_unavailable", label);
      assert.equal(h.profiles.row().runErrorCode, null, label);
      assert.equal(h.settled.length, 1, label);
      assert.equal(h.settled[0]?.errorCode, "source_unavailable", label);
    }
  }
});

// Extends "[unhappy-2] a data_model run the store will not enqueue…": the
// abstractions run has already succeeded, and still nothing is scoped.
test("[unhappy-2] a data_model refusal fails the profile even when the abstractions run already succeeded", async () => {
  for (const reason of ["not-found", "graph_mismatch"] as const) {
    const h = withProfile();
    h.runs.startAs.set("graphify", { status: "queued" });
    h.runs.startAs.set("abstractions", { status: "succeeded" });
    h.runs.refuse = (_owner, _snapshot, tool) =>
      tool === "data_model" ? { ok: false, reason } : undefined;
    await h.profiler.sweep();
    assert.deepEqual(h.runs.toolsSince(), QUEUED_STEP, reason);
    assert.equal(h.profiles.row().status, "failed", reason);
    assert.equal(h.profiles.row().errorCode, "source_unavailable", reason);
    assert.equal(h.profiles.row().runErrorCode, null, reason);
    assert.equal(h.launches(), 1, reason);
  }
});

// ---------------------------------------------------------------------------
// unhappy-3

// Extends "[unhappy-3] a profile with no snapshot fails before anything is
// enqueued": a row beside it still has its runs asked for.
test("[unhappy-3] a profile with no snapshot asks for nothing, while the next row's graph and readers are asked for", async () => {
  const h = harness();
  h.profiles.queue("bpf_1", "bpr_1", null);
  h.profiles.queue("bpf_2", "bpr_2", "rsn_1");
  await h.profiler.sweep();
  assert.deepEqual(
    h.runs.enqueued.map(({ tool, snapshotId }) => [tool, snapshotId]),
    [
      ["graphify", "rsn_1"],
      ["abstractions", "rsn_1"],
      ["data_model", "rsn_1"],
    ],
  );
  assert.equal(h.profiles.row("bpf_1").status, "failed");
  assert.equal(h.profiles.row("bpf_1").errorCode, "source_unavailable");
  assert.equal(h.profiles.row("bpf_2").status, "queued");
});

// ---------------------------------------------------------------------------
// unhappy-4

// Extends "[unhappy-4] a scope that fails after the map readers finished…":
// over two sweeps, with another code.
test("[unhappy-4] a scope that fails once the readers it waited for succeeded fails the profile with the scope's code", async () => {
  const h = withProfile();
  await h.profiler.sweep();
  for (const id of ["arn_g", "arn_a", "arn_d"]) h.runs.set(id, "succeeded");
  h.runs.startAs.set("scope", { status: "failed", errorCode: "tool_timeout" });
  const before = h.runs.enqueued.length;
  await h.profiler.sweep();
  assert.deepEqual(h.runs.toolsSince(before), [...QUEUED_STEP, "scope"]);
  assert.deepEqual(h.runs.ofTool("scope")[0]?.params, {
    ...scopeParams(),
    abstractionsRunId: "arn_a",
    dataModelRunId: "arn_d",
  });
  assert.equal(h.profiles.row().status, "failed");
  assert.equal(h.profiles.row().errorCode, "scope_failed");
  assert.equal(h.profiles.row().runErrorCode, "tool_timeout");
  assert.equal(h.settled.length, 1);
  assert.equal(h.settled[0]?.errorCode, "scope_failed");
  assert.equal(h.settled[0]?.runErrorCode, "tool_timeout");
});

// Extends "[unhappy-4] a failed scope behind two failed map readers…": one
// reader failed, the other succeeded.
test("[unhappy-4] a failed scope that named one succeeded reader fails with the scope's own code", async () => {
  const h = withProfile();
  built(h, "failed", "succeeded");
  h.runs.startAs.set("scope", {
    status: "failed",
    errorCode: "agent_unavailable",
  });
  await h.profiler.sweep();
  assert.deepEqual(h.runs.ofTool("scope")[0]?.params, {
    ...scopeParams(),
    dataModelRunId: "arn_d",
  });
  assert.equal(h.profiles.row().status, "failed");
  assert.equal(h.profiles.row().errorCode, "scope_failed");
  assert.equal(h.profiles.row().runErrorCode, "agent_unavailable");
});

// ---------------------------------------------------------------------------
// concurrency-1

// Extends "[concurrency-1] two profiles on one snapshot ask for identical
// map-reader runs…": three profiles, starting from nothing built.
test("[concurrency-1] three profiles on one fresh snapshot share one graph and one run of each reader, and all name them", async () => {
  const h = harness();
  h.profiles.queue("bpf_1", "bpr_1", "rsn_1");
  h.profiles.queue("bpf_2", "bpr_2", "rsn_1", { specRevision: 4 });
  h.profiles.queue("bpf_3", "bpr_3", "rsn_1");
  await h.profiler.sweep();
  const abstractions = h.runs.ofTool("abstractions");
  const dataModel = h.runs.ofTool("data_model");
  assert.equal(abstractions.length, 3);
  assert.equal(dataModel.length, 3);
  for (const each of abstractions)
    assert.deepEqual(each.params, abstractionsParams("arn_g"));
  for (const each of dataModel)
    assert.deepEqual(each.params, dataModelParams("arn_g"));
  assert.equal(h.runs.runsOf("graphify").length, 1);
  assert.equal(h.runs.runsOf("abstractions").length, 1);
  assert.equal(h.runs.runsOf("data_model").length, 1);
  for (const id of ["arn_g", "arn_a", "arn_d"]) h.runs.set(id, "succeeded");
  await h.profiler.sweep();
  const scopes = h.runs.ofTool("scope");
  assert.equal(scopes.length, 3);
  for (const scope of scopes) {
    const params = paramsOf(scope);
    assert.equal(params?.["abstractionsRunId"], "arn_a");
    assert.equal(params?.["dataModelRunId"], "arn_d");
  }
  const ids = ["bpr_1", "bpr_2", "bpr_3"].map((proposal) =>
    scopeRunId(h, proposal),
  );
  assert.equal(new Set(ids).size, 3);
  for (const [index, id] of ["bpf_1", "bpf_2", "bpf_3"].entries()) {
    assert.equal(h.profiles.row(id).status, "scoping", id);
    assert.equal(h.profiles.row(id).scopeRunId, ids[index], id);
  }
});

// ---------------------------------------------------------------------------
// concurrency-2

// Extends "[concurrency-2] several sweeps asked for during one sweep
// coalesce into one more": four sweeps, and what the two passes asked for.
test("[concurrency-2] four overlapping sweeps make two passes, each finding the same graph and readers", async () => {
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
    h.profiler.sweep(),
  ]);
  assert.equal(passes, 2);
  assert.deepEqual(h.runs.toolsSince(), [...QUEUED_STEP, ...QUEUED_STEP]);
  assert.equal(h.runs.runsOf("abstractions").length, 1);
  assert.equal(h.runs.runsOf("data_model").length, 1);
  assert.equal(h.profiles.row().status, "queued");
});

// ---------------------------------------------------------------------------
// concurrency-3

// Extends "[concurrency-3] a row another sweep moved to scoping first is
// left alone": one reader failed, so its scope names only the other.
test("[concurrency-3] a row moved first by another sweep is left alone after a scope naming only the succeeded reader", async () => {
  const h = withProfile();
  built(h, "succeeded", "failed");
  h.profiles.raced = true;
  await h.profiler.sweep();
  const scopes = h.runs.ofTool("scope");
  assert.equal(scopes.length, 1);
  assert.deepEqual(scopes[0]?.params, {
    ...scopeParams(),
    abstractionsRunId: "arn_a",
  });
  assert.equal(h.profiles.row().status, "queued");
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.settled, []);
});

// Extends "[concurrency-3] a row another sweep moved first is not failed…":
// the unavailable map reader, rather than the graph.
test("[concurrency-3] a row moved first by another sweep is not failed or handed on for an unavailable map reader", async () => {
  const h = withProfile();
  h.runs.refuse = (_owner, _snapshot, tool) =>
    tool === "abstractions" ? { ok: false, reason: "not-found" } : undefined;
  h.profiles.raced = true;
  await h.profiler.sweep();
  assert.deepEqual(h.runs.toolsSince().slice(0, 2), ["graphify", "abstractions"]);
  assert.equal(h.runs.ofTool("scope").length, 0);
  assert.equal(h.profiles.row().status, "queued");
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.settled, []);
});
