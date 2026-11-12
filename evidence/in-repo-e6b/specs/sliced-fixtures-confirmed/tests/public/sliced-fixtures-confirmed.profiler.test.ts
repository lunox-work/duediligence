import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  EnqueueAnalysisResult,
  NewBountyProfile,
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

import {
  BountyProfiler,
  type BountyProfilerOptions,
} from "../src/pricing/profiler.js";

const OWNER = "org_1";
const HASH = "h".repeat(64);
const stamp = "2026-10-03T00:00:00.000Z";

type Status = StoredAnalysisRun["status"];
type ErrorCode = StoredAnalysisRun["errorCode"];

interface Enqueued {
  snapshotId: string;
  tool: AnalysisTool | undefined;
  params: AnalysisParams;
  requestedBy: string | null;
  maxActive: number | undefined;
}

interface EnqueueInput {
  tool?: AnalysisTool;
  params: AnalysisParams;
  requestedBy: string | null;
  maxActive?: number;
}

/** Short names for the runs a fresh enqueue creates: arn_g, arn_a, arn_d, arn_s. */
const SHORT: Partial<Record<string, string>> = {
  graphify: "g",
  abstractions: "a",
  data_model: "d",
  scope: "s",
};

const graphParams = { deadlineMinutes: 30 };
const readerParams = (
  builder: "abstractions" | "data_model",
  graphRunId = "arn_g",
) => ({ deadlineMinutes: 30, builder, graphRunId });

function storedRun(
  id: string,
  tool: AnalysisTool,
  snapshotId: string,
  params: AnalysisParams,
  status: Status,
  errorCode: ErrorCode = null,
): StoredAnalysisRun {
  return {
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
  };
}

/**
 * An analysis queue that keeps one run per snapshot, tool and params, like
 * the store: an enqueue whose tool and canonical params match a run there
 * is answered with that run.
 */
class FakeRuns {
  readonly runs = new Map<string, StoredAnalysisRun>();
  readonly enqueued: Enqueued[] = [];
  /** Per tool, an answer that replaces the queue's own. */
  readonly answers = new Map<
    AnalysisTool,
    (input: EnqueueInput, snapshotId: string) => EnqueueAnalysisResult
  >();
  /** Per tool, the status a fresh run is created in. */
  readonly startAs = new Map<AnalysisTool, Status>();
  obsoleteLogKey: string | undefined;
  #counts = new Map<string, number>();

  enqueue = async (
    _owner: string,
    snapshotId: string,
    input: EnqueueInput,
  ): Promise<EnqueueAnalysisResult> => {
    this.enqueued.push({
      snapshotId,
      tool: input.tool,
      params: input.params,
      requestedBy: input.requestedBy,
      maxActive: input.maxActive,
    });
    const tool = input.tool ?? "graphify";
    const answer = this.answers.get(tool);
    if (answer !== undefined) {
      const result = answer(input, snapshotId);
      if (result.ok) this.runs.set(result.run.id, result.run);
      return result;
    }
    const existing = [...this.runs.values()].find(
      (run) =>
        run.snapshotId === snapshotId &&
        run.tool === tool &&
        canonicalJson(run.params) === canonicalJson(input.params),
    );
    if (existing !== undefined)
      return {
        ok: true,
        run: existing,
        created: false,
        ...(this.obsoleteLogKey === undefined
          ? {}
          : { obsoleteLogKey: this.obsoleteLogKey }),
      };
    const run = storedRun(
      this.#nextId(tool),
      tool,
      snapshotId,
      input.params,
      this.startAs.get(tool) ?? "queued",
    );
    this.runs.set(run.id, run);
    return {
      ok: true,
      run,
      created: true,
      ...(this.obsoleteLogKey === undefined
        ? {}
        : { obsoleteLogKey: this.obsoleteLogKey }),
    };
  };

  get = async (_owner: string, id: string) => this.runs.get(id) ?? null;

  #nextId(tool: string): string {
    const short = SHORT[tool] ?? tool;
    const count = (this.#counts.get(short) ?? 0) + 1;
    this.#counts.set(short, count);
    const id = count === 1 ? `arn_${short}` : `arn_${short}${count}`;
    return this.runs.has(id) ? this.#nextId(tool) : id;
  }

  /** Puts a run in the queue, as an earlier sweep or the repository page left it. */
  seed(run: StoredAnalysisRun) {
    this.runs.set(run.id, run);
  }

  set(id: string, status: Status, errorCode: ErrorCode = null) {
    const run = this.runs.get(id);
    assert.ok(run, `no run ${id}`);
    this.runs.set(id, { ...run, status, errorCode });
  }

  tools(): (AnalysisTool | undefined)[] {
    return this.enqueued.map((each) => each.tool);
  }

  ofTool(tool: AnalysisTool): Enqueued[] {
    return this.enqueued.filter((each) => each.tool === tool);
  }
}

/** The profile store, in memory, with its compare-and-set step. */
class FakeProfiles {
  readonly rows = new Map<string, StoredBountyProfile>();
  /** Set to make `advance` behave as though another sweep moved first. */
  raced = false;
  pendingAsked = 0;

  request = async (_owner: string, _input: NewBountyProfile) => null;

  pending = async (owner: string) =>
    [...this.rows.values()].filter(
      (row) =>
        row.organizationId === owner &&
        ["queued", "scoping", "slicing"].includes(row.status),
    );

  organizationsWithPending = async () => {
    this.pendingAsked += 1;
    return [
      ...new Set(
        [...this.rows.values()]
          .filter((row) =>
            ["queued", "scoping", "slicing"].includes(row.status),
          )
          .map((row) => row.organizationId),
      ),
    ];
  };

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

  add(
    id: string,
    proposalId: string,
    snapshotId: string | null,
  ): StoredBountyProfile {
    const row: StoredBountyProfile = {
      id,
      organizationId: OWNER,
      proposalId,
      specRevision: 2,
      specHash: HASH,
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
    };
    this.rows.set(id, row);
    return row;
  }

  row(id: string): StoredBountyProfile {
    const row = this.rows.get(id);
    assert.ok(row, `no profile ${id}`);
    return row;
  }
}

/**
 * A profiler over in-memory stores. `maxActive` is 4 unless given; pass
 * `"unset"` to leave it out of the options.
 */
function harness(maxActive: number | "unset" = 4) {
  const runs = new FakeRuns();
  const profiles = new FakeProfiles();
  const errors: string[] = [];
  const removed: string[] = [];
  const settled: StoredBountyProfile[] = [];
  let launches = 0;
  const base: BountyProfilerOptions = {
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
    intervalMs: 60_000,
    onSettled: async (_owner, profile) => {
      settled.push(profile);
    },
    onError: (code) => errors.push(code),
  };
  const profiler = new BountyProfiler(
    maxActive === "unset" ? base : { ...base, maxActive },
  );
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

type Harness = ReturnType<typeof harness>;

/** Profile "bpf_1" for "bpr_1", queued on "rsn_1". */
function withProfile(h: Harness, snapshotId: string | null = "rsn_1") {
  return h.profiles.add("bpf_1", "bpr_1", snapshotId);
}

/** The snapshot's graph and map readers, as earlier runs left them. */
function seedMap(
  h: Harness,
  statuses: { g?: Status; a?: Status; d?: Status },
  codes: { a?: ErrorCode; d?: ErrorCode } = {},
  snapshotId = "rsn_1",
) {
  h.runs.seed(
    storedRun(
      "arn_g",
      "graphify",
      snapshotId,
      graphParams,
      statuses.g ?? "succeeded",
    ),
  );
  if (statuses.a !== undefined)
    h.runs.seed(
      storedRun(
        "arn_a",
        "abstractions",
        snapshotId,
        readerParams("abstractions"),
        statuses.a,
        codes.a ?? (statuses.a === "failed" ? "tool_failed" : null),
      ),
    );
  if (statuses.d !== undefined)
    h.runs.seed(
      storedRun(
        "arn_d",
        "data_model",
        snapshotId,
        readerParams("data_model"),
        statuses.d,
        codes.d ?? (statuses.d === "failed" ? "tool_failed" : null),
      ),
    );
}

const scopeBase = {
  deadlineMinutes: 60,
  agent: "scope",
  graphRunId: "arn_g",
  proposalId: "bpr_1",
  specRevision: 2,
  specHash: HASH,
};

function scopeEnqueue(h: Harness): Enqueued {
  const scopes = h.runs.ofTool("scope");
  assert.equal(scopes.length, 1);
  const [scope] = scopes;
  assert.ok(scope);
  return scope;
}

/** A refusal for one tool's enqueue. */
function refuse(
  reason: "not-found" | "graph_mismatch" | "run_limit",
): () => EnqueueAnalysisResult {
  return () => ({ ok: false, reason });
}

/** An answer with one run, whatever is asked. */
function answerWith(
  id: string,
  tool: AnalysisTool,
  status: Status,
  errorCode: ErrorCode = null,
  created = true,
) {
  return (input: EnqueueInput, snapshotId: string): EnqueueAnalysisResult => ({
    ok: true,
    created,
    run: storedRun(id, tool, snapshotId, input.params, status, errorCode),
  });
}

// --- Rule: the queued step enqueues or finds graphify, abstractions, data_model ---

test("[happy-1] the first sweep queues the graph and both map readers, in order, and leaves the row queued", async () => {
  const h = harness();
  withProfile(h);
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
  assert.equal(h.profiles.row("bpf_1").status, "queued");
  assert.equal(h.profiles.row("bpf_1").scopeRunId, null);
  assert.equal(h.launches(), 1);
  assert.deepEqual(h.errors, []);
});

test("[happy-1] a graph run found rather than created is the one the map readers name", async () => {
  const h = harness();
  withProfile(h);
  h.runs.answers.set(
    "graphify",
    answerWith("arn_found", "graphify", "queued", null, false),
  );
  await h.profiler.sweep();
  assert.deepEqual(h.runs.tools(), ["graphify", "abstractions", "data_model"]);
  assert.deepEqual(
    h.runs.ofTool("abstractions")[0]?.params,
    readerParams("abstractions", "arn_found"),
  );
  assert.deepEqual(
    h.runs.ofTool("data_model")[0]?.params,
    readerParams("data_model", "arn_found"),
  );
  assert.equal(h.profiles.row("bpf_1").status, "queued");
});

test("[happy-2] once both map readers have succeeded, the scope names both and the row moves to scoping", async () => {
  const h = harness();
  withProfile(h);
  await h.profiler.sweep();
  for (const id of ["arn_g", "arn_a", "arn_d"]) h.runs.set(id, "succeeded");
  h.runs.enqueued.length = 0;
  await h.profiler.sweep();
  assert.deepEqual(h.runs.tools(), [
    "graphify",
    "abstractions",
    "data_model",
    "scope",
  ]);
  assert.deepEqual(h.runs.enqueued[0]?.params, { deadlineMinutes: 30 });
  assert.deepEqual(
    h.runs.enqueued[1]?.params,
    readerParams("abstractions"),
  );
  assert.deepEqual(h.runs.enqueued[2]?.params, readerParams("data_model"));
  const scope = h.runs.enqueued[3];
  assert.ok(scope);
  assert.equal(scope.tool, "scope");
  assert.equal(scope.requestedBy, null);
  assert.equal(scope.maxActive, 3);
  assert.deepEqual(scope.params, {
    deadlineMinutes: 60,
    agent: "scope",
    graphRunId: "arn_g",
    proposalId: "bpr_1",
    specRevision: 2,
    specHash: HASH,
    abstractionsRunId: "arn_a",
    dataModelRunId: "arn_d",
  });
  const row = h.profiles.row("bpf_1");
  assert.equal(row.status, "scoping");
  assert.ok(row.scopeRunId !== null);
  assert.equal(h.runs.runs.get(row.scopeRunId)?.tool, "scope");
  assert.equal(h.runs.runs.get(row.scopeRunId)?.snapshotId, "rsn_1");
});

test("[happy-2] once the row is scoping, a sweep while its scope runs asks for no map reader again", async () => {
  const h = harness();
  withProfile(h);
  seedMap(h, { a: "succeeded", d: "succeeded" });
  await h.profiler.sweep();
  assert.equal(h.profiles.row("bpf_1").status, "scoping");
  const scopeRunId = h.profiles.row("bpf_1").scopeRunId;
  assert.ok(scopeRunId !== null);
  h.runs.set(scopeRunId, "running");
  h.runs.enqueued.length = 0;
  await h.profiler.sweep();
  assert.deepEqual(h.runs.enqueued, []);
  assert.equal(h.profiles.row("bpf_1").status, "scoping");
});

const waitCases: {
  a: Status;
  d: Status;
  named: { abstractionsRunId?: string; dataModelRunId?: string } | null;
}[] = [
  { a: "queued", d: "queued", named: null },
  { a: "running", d: "succeeded", named: null },
  { a: "succeeded", d: "queued", named: null },
  { a: "failed", d: "running", named: null },
  {
    a: "succeeded",
    d: "succeeded",
    named: { abstractionsRunId: "arn_a", dataModelRunId: "arn_d" },
  },
  { a: "succeeded", d: "failed", named: { abstractionsRunId: "arn_a" } },
  { a: "failed", d: "succeeded", named: { dataModelRunId: "arn_d" } },
  { a: "failed", d: "failed", named: {} },
];

for (const { a, d, named } of waitCases)
  test(`[boundary-1] abstractions ${a} and data_model ${d}: ${
    named === null
      ? "no scope, the row stays queued"
      : `the scope names ${Object.keys(named).join(" and ") || "neither"} and the row is scoping`
  }`, async () => {
    const h = harness();
    withProfile(h);
    seedMap(h, { g: "succeeded", a, d });
    await h.profiler.sweep();
    if (named === null) {
      assert.equal(h.runs.ofTool("scope").length, 0);
      assert.equal(h.profiles.row("bpf_1").status, "queued");
      return;
    }
    assert.deepEqual(scopeEnqueue(h).params, { ...scopeBase, ...named });
    assert.equal(h.profiles.row("bpf_1").status, "scoping");
  });

test("[boundary-2] a context key the profiler does not name is absent, not undefined or null", async () => {
  const h = harness();
  withProfile(h);
  seedMap(
    h,
    { g: "succeeded", a: "failed", d: "failed" },
    { a: "tool_failed", d: "tool_failed" },
  );
  await h.profiler.sweep();
  const params = scopeEnqueue(h).params as unknown as Record<string, unknown>;
  assert.deepEqual(params, scopeBase);
  assert.equal("abstractionsRunId" in params, false);
  assert.equal("dataModelRunId" in params, false);
  const row = h.profiles.row("bpf_1");
  assert.equal(row.status, "scoping");
  assert.equal(row.errorCode, null);
  assert.equal(row.runErrorCode, null);
  assert.deepEqual(h.errors, []);
});

test("[boundary-2] one map reader that failed is absent while the other is named", async () => {
  const h = harness();
  withProfile(h);
  seedMap(
    h,
    { g: "succeeded", a: "failed", d: "succeeded" },
    { a: "tool_timeout" },
  );
  await h.profiler.sweep();
  const params = scopeEnqueue(h).params as unknown as Record<string, unknown>;
  assert.equal("abstractionsRunId" in params, false);
  assert.equal(params["dataModelRunId"], "arn_d");
  const row = h.profiles.row("bpf_1");
  assert.equal(row.status, "scoping");
  assert.equal(row.errorCode, null);
  assert.equal(row.runErrorCode, null);
  assert.deepEqual(h.errors, []);
});

test("[happy-3] the map readers are queued while the graph itself is still queued", async () => {
  const h = harness();
  withProfile(h);
  h.runs.answers.set("graphify", answerWith("arn_g", "graphify", "queued"));
  await h.profiler.sweep();
  assert.equal(h.runs.ofTool("abstractions").length, 1);
  assert.equal(h.runs.ofTool("data_model").length, 1);
  for (const each of [
    ...h.runs.ofTool("abstractions"),
    ...h.runs.ofTool("data_model"),
  ])
    assert.equal(
      (each.params as unknown as { graphRunId: string }).graphRunId,
      "arn_g",
    );
  assert.equal(h.profiles.row("bpf_1").status, "queued");
});

test("[happy-3] the map readers are queued while the graph is running", async () => {
  const h = harness();
  withProfile(h);
  h.runs.answers.set(
    "graphify",
    answerWith("arn_g", "graphify", "running", null, false),
  );
  await h.profiler.sweep();
  assert.deepEqual(h.runs.ofTool("abstractions")[0]?.params, readerParams("abstractions"));
  assert.deepEqual(h.runs.ofTool("data_model")[0]?.params, readerParams("data_model"));
  assert.equal(h.runs.ofTool("scope").length, 0);
  assert.equal(h.profiles.row("bpf_1").status, "queued");
});

// --- Rule: a failed graph, a missing snapshot, a reader that cannot be enqueued ---

test("[unhappy-1] a graph out of retries fails the profile and queues nothing behind it", async () => {
  const h = harness();
  withProfile(h);
  h.runs.answers.set(
    "graphify",
    answerWith("arn_g", "graphify", "failed", "tool_failed"),
  );
  await h.profiler.sweep();
  assert.deepEqual(h.runs.tools(), ["graphify"]);
  const row = h.profiles.row("bpf_1");
  assert.equal(row.status, "failed");
  assert.equal(row.errorCode, "scope_failed");
  assert.equal(row.runErrorCode, "tool_failed");
  assert.equal(h.launches(), 0);
  assert.equal(h.settled.length, 1);
  assert.equal(h.settled[0]?.id, "bpf_1");
  assert.equal(h.settled[0]?.status, "failed");
  assert.equal(h.settled[0]?.errorCode, "scope_failed");
  assert.equal(h.settled[0]?.runErrorCode, "tool_failed");
});

test("[unhappy-1] a failed graph that was found, not created, fails the profile with its own code", async () => {
  const h = harness();
  withProfile(h);
  h.runs.answers.set(
    "graphify",
    answerWith("arn_g", "graphify", "failed", "tool_timeout", false),
  );
  await h.profiler.sweep();
  assert.deepEqual(h.runs.tools(), ["graphify"]);
  const row = h.profiles.row("bpf_1");
  assert.equal(row.status, "failed");
  assert.equal(row.errorCode, "scope_failed");
  assert.equal(row.runErrorCode, "tool_timeout");
  assert.equal(h.settled.length, 1);
});

const refusedCases = [
  { tool: "abstractions", reason: "not-found", other: "arn_d" },
  { tool: "abstractions", reason: "graph_mismatch", other: "arn_d" },
  { tool: "data_model", reason: "not-found", other: "arn_a" },
  { tool: "data_model", reason: "graph_mismatch", other: "arn_a" },
] as const;

for (const { tool, reason, other } of refusedCases)
  test(`[boundary-3] ${tool} answered ${reason} is left out, and the scope runs with ${other} alone`, async () => {
    const h = harness();
    withProfile(h);
    h.runs.answers.set(
      "graphify",
      answerWith("arn_g", "graphify", "succeeded", null, false),
    );
    h.runs.answers.set(tool, refuse(reason));
    const otherTool = tool === "abstractions" ? "data_model" : "abstractions";
    h.runs.answers.set(
      otherTool,
      answerWith(other, otherTool, "succeeded", null, false),
    );
    await h.profiler.sweep();
    const named =
      otherTool === "abstractions"
        ? { abstractionsRunId: other }
        : { dataModelRunId: other };
    assert.deepEqual(scopeEnqueue(h).params, { ...scopeBase, ...named });
    const row = h.profiles.row("bpf_1");
    assert.equal(row.status, "scoping");
    assert.equal(row.errorCode, null);
    assert.equal(row.runErrorCode, null);
    assert.deepEqual(h.errors, []);
  });

test("[boundary-4] a map reader the store will not enqueue does not end the wait for the other", async () => {
  const h = harness();
  withProfile(h);
  h.runs.answers.set(
    "graphify",
    answerWith("arn_g", "graphify", "succeeded", null, false),
  );
  h.runs.answers.set("abstractions", refuse("not-found"));
  h.runs.answers.set(
    "data_model",
    answerWith("arn_d", "data_model", "running", null, false),
  );
  await h.profiler.sweep();
  assert.equal(h.runs.ofTool("scope").length, 0);
  assert.equal(h.profiles.row("bpf_1").status, "queued");
});

test("[boundary-4] a data_model answered graph_mismatch does not end the wait for a queued abstractions", async () => {
  const h = harness();
  withProfile(h);
  h.runs.answers.set(
    "graphify",
    answerWith("arn_g", "graphify", "succeeded", null, false),
  );
  h.runs.answers.set(
    "abstractions",
    answerWith("arn_a", "abstractions", "queued"),
  );
  h.runs.answers.set("data_model", refuse("graph_mismatch"));
  await h.profiler.sweep();
  assert.equal(h.runs.ofTool("scope").length, 0);
  const row = h.profiles.row("bpf_1");
  assert.equal(row.status, "queued");
  assert.equal(row.errorCode, null);
  assert.deepEqual(h.errors, []);
});

test("[unhappy-2] a profile with no snapshot fails before anything is enqueued", async () => {
  const h = harness();
  withProfile(h, null);
  await h.profiler.sweep();
  assert.deepEqual(h.runs.enqueued, []);
  const row = h.profiles.row("bpf_1");
  assert.equal(row.status, "failed");
  assert.equal(row.errorCode, "source_unavailable");
});

test("[unhappy-2] a profile with no snapshot fails alone; the next queued row still asks for its graph and map readers", async () => {
  const h = harness();
  withProfile(h, null);
  h.profiles.add("bpf_2", "bpr_2", "rsn_2");
  await h.profiler.sweep();
  assert.equal(h.profiles.row("bpf_1").status, "failed");
  assert.equal(h.profiles.row("bpf_1").errorCode, "source_unavailable");
  assert.deepEqual(h.runs.tools(), ["graphify", "abstractions", "data_model"]);
  assert.ok(h.runs.enqueued.every((each) => each.snapshotId === "rsn_2"));
  assert.equal(h.profiles.row("bpf_2").status, "queued");
});

test("[unhappy-3] a scope that fails after the map readers finished fails the profile as before", async () => {
  const h = harness();
  withProfile(h);
  seedMap(h, { g: "succeeded", a: "succeeded", d: "succeeded" });
  h.runs.answers.set(
    "scope",
    answerWith("arn_s", "scope", "failed", "agent_unavailable"),
  );
  await h.profiler.sweep();
  const row = h.profiles.row("bpf_1");
  assert.equal(row.status, "failed");
  assert.equal(row.errorCode, "scope_failed");
  assert.equal(row.runErrorCode, "agent_unavailable");
});

test("[unhappy-3] a failed scope's code is the profile's even when a map reader also failed", async () => {
  const h = harness();
  withProfile(h);
  seedMap(
    h,
    { g: "succeeded", a: "failed", d: "succeeded" },
    { a: "tool_failed" },
  );
  h.runs.answers.set(
    "scope",
    answerWith("arn_s", "scope", "failed", "agent_unavailable"),
  );
  await h.profiler.sweep();
  const row = h.profiles.row("bpf_1");
  assert.equal(row.status, "failed");
  assert.equal(row.errorCode, "scope_failed");
  assert.equal(row.runErrorCode, "agent_unavailable");
});

// --- Rule: every enqueue in the queued step is held one slot under the cap ---

const capCases: { cap: number | "unset"; held: number }[] = [
  { cap: "unset", held: 2 },
  { cap: 1, held: 1 },
  { cap: 2, held: 1 },
  { cap: 4, held: 3 },
];

for (const { cap, held } of capCases)
  test(`[boundary-5] with maxActive ${cap === "unset" ? "undefined" : cap}, the graph and map-reader enqueues each pass maxActive ${held}`, async () => {
    const h = harness(cap);
    withProfile(h);
    await h.profiler.sweep();
    assert.deepEqual(h.runs.tools(), [
      "graphify",
      "abstractions",
      "data_model",
    ]);
    assert.deepEqual(
      h.runs.enqueued.map((each) => each.maxActive),
      [held, held, held],
    );
  });

const fullCases = [
  { tool: "abstractions", calls: 2 },
  { tool: "data_model", calls: 3 },
] as const;

for (const { tool, calls } of fullCases)
  test(`[boundary-6] ${tool} refused at the cap leaves the row queued, and the next queued row is not tried`, async () => {
    const h = harness();
    h.profiles.add("bpf_1", "bpr_1", "rsn_1");
    h.profiles.add("bpf_2", "bpr_2", "rsn_1");
    h.runs.answers.set("graphify", answerWith("arn_g", "graphify", "queued"));
    h.runs.answers.set(tool, refuse("run_limit"));
    await h.profiler.sweep();
    assert.equal(h.runs.enqueued.length, calls);
    assert.deepEqual(
      h.runs.tools(),
      ["graphify", "abstractions", "data_model"].slice(0, calls),
    );
    assert.equal(h.runs.ofTool("scope").length, 0);
    assert.equal(h.profiles.row("bpf_1").status, "queued");
    assert.equal(h.profiles.row("bpf_2").status, "queued");
    assert.equal(h.launches(), 1);
    assert.deepEqual(h.errors, []);
  });

test("[boundary-7] a row waiting on its map readers does not stop the next queued row", async () => {
  const h = harness();
  h.profiles.add("bpf_1", "bpr_1", "rsn_1");
  h.profiles.add("bpf_2", "bpr_2", "rsn_2");
  await h.profiler.sweep();
  assert.deepEqual(
    h.runs.enqueued.map((each) => [each.tool, each.snapshotId]),
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

test("[boundary-7] a row behind one still waiting moves to scoping once its own map readers have finished", async () => {
  const h = harness();
  h.profiles.add("bpf_1", "bpr_1", "rsn_1");
  h.profiles.add("bpf_2", "bpr_2", "rsn_2");
  h.runs.seed(storedRun("arn_g1", "graphify", "rsn_1", graphParams, "queued"));
  h.runs.seed(storedRun("arn_g2", "graphify", "rsn_2", graphParams, "succeeded"));
  h.runs.seed(
    storedRun(
      "arn_a2",
      "abstractions",
      "rsn_2",
      readerParams("abstractions", "arn_g2"),
      "succeeded",
    ),
  );
  h.runs.seed(
    storedRun(
      "arn_d2",
      "data_model",
      "rsn_2",
      readerParams("data_model", "arn_g2"),
      "succeeded",
    ),
  );
  await h.profiler.sweep();
  assert.equal(h.profiles.row("bpf_1").status, "queued");
  assert.equal(h.profiles.row("bpf_2").status, "scoping");
  assert.deepEqual(scopeEnqueue(h).params, {
    ...scopeBase,
    graphRunId: "arn_g2",
    proposalId: "bpr_2",
    abstractionsRunId: "arn_a2",
    dataModelRunId: "arn_d2",
  });
});

// --- Rule: a map reader's re-queue removes its previous log ---

test("[happy-4] each re-queued run's obsolete log is removed in the queued step", async () => {
  const h = harness();
  withProfile(h);
  h.runs.obsoleteLogKey = "logs/old.txt";
  await h.profiler.sweep();
  assert.deepEqual(h.runs.tools(), ["graphify", "abstractions", "data_model"]);
  assert.deepEqual(h.removed, [
    "logs/old.txt",
    "logs/old.txt",
    "logs/old.txt",
  ]);
});

test("[happy-4] only the map reader whose re-queue carries an obsolete log has it removed", async () => {
  const h = harness();
  withProfile(h);
  h.runs.answers.set("abstractions", (input, snapshotId) => ({
    ok: true,
    created: true,
    run: storedRun("arn_a", "abstractions", snapshotId, input.params, "queued"),
    obsoleteLogKey: "logs/abstractions-old.txt",
  }));
  await h.profiler.sweep();
  assert.deepEqual(h.removed, ["logs/abstractions-old.txt"]);
});

// --- Rule: profiles on one snapshot share its graph and map readers ---

test("[concurrency-1] two profiles on one snapshot ask for identical map-reader runs and name the same ones", async () => {
  const h = harness();
  h.profiles.add("bpf_1", "bpr_1", "rsn_1");
  h.profiles.add("bpf_2", "bpr_2", "rsn_1");
  seedMap(h, { g: "succeeded", a: "succeeded", d: "succeeded" });
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
  const one = h.profiles.row("bpf_1");
  const two = h.profiles.row("bpf_2");
  assert.equal(one.status, "scoping");
  assert.equal(two.status, "scoping");
  assert.ok(one.scopeRunId !== null && two.scopeRunId !== null);
  assert.notEqual(one.scopeRunId, two.scopeRunId);
});

test("[concurrency-1] two profiles on one snapshot both leave out the same failed map reader", async () => {
  const h = harness();
  h.profiles.add("bpf_1", "bpr_1", "rsn_1");
  h.profiles.add("bpf_2", "bpr_2", "rsn_1");
  seedMap(h, { g: "succeeded", a: "failed", d: "succeeded" });
  await h.profiler.sweep();
  const scopes = h.runs.ofTool("scope");
  assert.equal(scopes.length, 2);
  for (const scope of scopes) {
    const params = scope.params as unknown as Record<string, unknown>;
    assert.equal("abstractionsRunId" in params, false);
    assert.equal(params["dataModelRunId"], "arn_d");
  }
  assert.equal(h.profiles.row("bpf_1").status, "scoping");
  assert.equal(h.profiles.row("bpf_2").status, "scoping");
});

test("[concurrency-2] a sweep asked for during a sweep returns that sweep and runs one more after it", async () => {
  const h = harness();
  withProfile(h);
  const first = h.profiler.sweep();
  const second = h.profiler.sweep();
  await Promise.all([first, second]);
  assert.equal(h.profiles.pendingAsked, 2);
});

test("[concurrency-2] several sweeps asked for during one sweep still run only one more after it", async () => {
  const h = harness();
  withProfile(h);
  const sweeps = [h.profiler.sweep(), h.profiler.sweep(), h.profiler.sweep()];
  await Promise.all(sweeps);
  assert.equal(h.profiles.pendingAsked, 2);
});

test("[concurrency-3] a row another sweep moved to scoping first is left alone", async () => {
  const h = harness();
  withProfile(h);
  seedMap(h, { g: "succeeded", a: "succeeded", d: "succeeded" });
  h.profiles.raced = true;
  await h.profiler.sweep();
  assert.equal(h.runs.ofTool("scope").length, 1);
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.settled, []);
});

test("[concurrency-3] a row another sweep moved first is not settled when its graph has failed", async () => {
  const h = harness();
  withProfile(h);
  h.runs.answers.set(
    "graphify",
    answerWith("arn_g", "graphify", "failed", "tool_failed"),
  );
  h.profiles.raced = true;
  await h.profiler.sweep();
  assert.deepEqual(h.runs.tools(), ["graphify"]);
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.settled, []);
});
