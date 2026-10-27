import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  EvaluationCommand,
  EvaluationExecResult,
  EvaluationJob,
  EvaluationProvider,
  StagedFile,
} from "sandbox-factory";
import { EVALUATION_JOBS_MAX, limitJobs } from "../src/evaluation/limit.js";

type Spec = { readonly label: string; readonly signal: AbortSignal };

/** One recorded call whose promise the test resolves or rejects. */
interface Call<A, R> {
  readonly args: A;
  resolve(value: R): void;
  reject(error: unknown): void;
}

function record<A, R>(calls: Call<A, R>[], args: A): Promise<R> {
  return new Promise<R>((resolve, reject) => {
    calls.push({ args, resolve, reject });
  });
}

interface FakeJob extends EvaluationJob {
  readonly stages: Call<readonly StagedFile[], void>[];
  readonly execs: Call<EvaluationCommand, EvaluationExecResult>[];
  readonly reads: Call<string, string | null>[];
  readonly destroys: Call<undefined, void>[];
}

function fakeJob(id: string): FakeJob {
  const stages: Call<readonly StagedFile[], void>[] = [];
  const execs: Call<EvaluationCommand, EvaluationExecResult>[] = [];
  const reads: Call<string, string | null>[] = [];
  const destroys: Call<undefined, void>[] = [];
  return {
    id,
    environment: { provider: "fake", environmentId: null, templateDigest: null },
    stages,
    execs,
    reads,
    destroys,
    stage: (files) => record(stages, files),
    exec: (command) => record(execs, command),
    read: (path) => record(reads, path),
    destroy: () => record(destroys, undefined),
  };
}

interface FakeProvider extends EvaluationProvider {
  readonly creates: Call<Spec, EvaluationJob>[];
  labels(): string[];
  /** The inner create call made for a label. */
  call(label: string): Call<Spec, EvaluationJob>;
}

function fakeProvider(name = "fake"): FakeProvider {
  const creates: Call<Spec, EvaluationJob>[] = [];
  return {
    name,
    creates,
    create: (spec) => record(creates, spec),
    labels: () => creates.map((call) => call.args.label),
    call: (label) => {
      const found = creates.find((call) => call.args.label === label);
      assert.ok(found, `inner create was not called for ${label}`);
      return found;
    },
  };
}

/** Lets pending promises run. */
const settle = () => new Promise<void>((done) => setImmediate(done));

interface Tracked<T> {
  state: "pending" | "resolved" | "rejected";
  value?: T;
  error?: unknown;
  readonly promise: Promise<T>;
}

function track<T>(promise: Promise<T>): Tracked<T> {
  const tracked: Tracked<T> = { state: "pending", promise };
  promise.then(
    (value) => {
      tracked.state = "resolved";
      tracked.value = value;
    },
    (error: unknown) => {
      tracked.state = "rejected";
      tracked.error = error;
    },
  );
  return tracked;
}

function freshSignal(): AbortSignal {
  return new AbortController().signal;
}

function create(
  limited: EvaluationProvider,
  label: string,
  signal: AbortSignal = freshSignal(),
): Tracked<EvaluationJob> {
  return track(limited.create({ label, signal }));
}

function assertWaiting(
  fake: FakeProvider,
  tracked: Tracked<EvaluationJob>,
  label: string,
): void {
  assert.equal(tracked.state, "pending");
  assert.ok(!fake.labels().includes(label), `${label} reached the inner create`);
}

// Both settle first and then check, so a promise that never settles fails
// the test instead of hanging it.

/** What a promise resolved with, once settled. */
async function resolves<T>(promise: Promise<T>): Promise<T> {
  const tracked = track(promise);
  await settle();
  assert.equal(tracked.state, "resolved", `rejected with ${String(tracked.error)}`);
  return tracked.value as T;
}

/** That a promise, once settled, rejected with this very value. */
async function rejectsWith(promise: Promise<unknown>, expected: unknown) {
  const tracked = track(promise);
  await settle();
  assert.equal(tracked.state, "rejected");
  assert.equal(tracked.error, expected);
}

function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  assert.ok(item !== undefined, `no item at ${index}`);
  return item;
}

interface Live {
  readonly job: EvaluationJob;
  readonly inner: FakeJob;
}

/** Creates a job through the limited provider and resolves its inner create. */
async function open(
  limited: EvaluationProvider,
  fake: FakeProvider,
  label: string,
  signal: AbortSignal = freshSignal(),
): Promise<Live> {
  const created = limited.create({ label, signal });
  await settle();
  const inner = fakeJob(`sandbox-eval-${label}-1`);
  fake.call(label).resolve(inner);
  return { job: await resolves(created), inner };
}

/** Resolves a waiting create that has since been admitted. */
async function admit(
  fake: FakeProvider,
  tracked: Tracked<EvaluationJob>,
  label: string,
): Promise<Live> {
  const inner = fakeJob(`sandbox-eval-${label}-1`);
  fake.call(label).resolve(inner);
  return { job: await resolves(tracked.promise), inner };
}

/** Destroys a limited job and resolves its latest inner destroy. */
async function close(live: Live): Promise<void> {
  const destroyed = live.job.destroy();
  await settle();
  nth(live.inner.destroys, live.inner.destroys.length - 1).resolve();
  await resolves(destroyed);
  await settle();
}

const okResult: EvaluationExecResult = {
  exitCode: 0,
  timedOut: false,
  outputTruncated: false,
  stdout: "ok",
  stderr: "",
  durationMs: 5,
};

// --- @happy -------------------------------------------------------------

test("[happy-1] EVALUATION_JOBS_MAX is 2", () => {
  assert.equal(EVALUATION_JOBS_MAX, 2);
});

test("[happy-1] EVALUATION_JOBS_MAX used as max admits two creates and queues the third", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, EVALUATION_JOBS_MAX);
  create(limited, "j1");
  create(limited, "j2");
  const j3 = create(limited, "j3");
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assertWaiting(fake, j3, "j3");
});

test("[happy-2] the limited provider keeps the name and is a new object", () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 2);
  assert.equal(limited.name, "fake");
  assert.notEqual(limited, fake);
  assert.equal(fake.creates.length, 0);
});

test("[happy-2] the name passes through for another name and max 0", () => {
  const fake = fakeProvider("local-process");
  const limited = limitJobs(fake, 0);
  assert.equal(limited.name, "local-process");
  assert.notEqual(limited, fake);
  assert.equal(fake.creates.length, 0);
});

test("[happy-3] a create under the cap reaches the inner provider with the same label and signal", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 2);
  const c = new AbortController();
  create(limited, "sbv_1", c.signal);
  await settle();
  assert.equal(fake.creates.length, 1);
  const call = nth(fake.creates, 0);
  assert.equal(call.args.label, "sbv_1");
  assert.equal(call.args.signal, c.signal);
});

test("[happy-3] the create that takes the last free slot reaches the inner provider before the first resolves", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 2);
  const first = new AbortController();
  const second = new AbortController();
  const j1 = create(limited, "j1", first.signal);
  create(limited, "j2", second.signal);
  await settle();
  assert.equal(j1.state, "pending");
  assert.equal(fake.creates.length, 2);
  assert.equal(nth(fake.creates, 1).args.label, "j2");
  assert.equal(nth(fake.creates, 1).args.signal, second.signal);
  assert.equal(nth(fake.creates, 0).args.signal, first.signal);
});

test("[happy-4] the limited job forwards to the inner job and keeps its id and environment", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 2);
  const created = limited.create({ label: "x", signal: freshSignal() });
  await settle();
  const inner = fakeJob("sandbox-eval-x-1");
  fake.call("x").resolve(inner);
  const job = await resolves(created);
  assert.equal(job.id, "sandbox-eval-x-1");
  assert.equal(job.environment, inner.environment);
  assert.deepEqual(job.environment, {
    provider: "fake",
    environmentId: null,
    templateDigest: null,
  });
  assert.notEqual(job, inner);

  const files = [{ path: "a.txt", text: "a" }];
  const staged = job.stage(files);
  await settle();
  assert.equal(inner.stages.length, 1);
  assert.equal(nth(inner.stages, 0).args, files);
  nth(inner.stages, 0).resolve(undefined);
  assert.equal(await resolves(staged), undefined);

  const command = { argv: ["npm", "test"] };
  const executed = job.exec(command);
  await settle();
  assert.equal(inner.execs.length, 1);
  assert.equal(nth(inner.execs, 0).args, command);
  const result = { ...okResult };
  nth(inner.execs, 0).resolve(result);
  assert.equal(await resolves(executed), result);

  const read = job.read("package-lock.json");
  await settle();
  assert.equal(inner.reads.length, 1);
  assert.equal(nth(inner.reads, 0).args, "package-lock.json");
  nth(inner.reads, 0).resolve(null);
  assert.equal(await resolves(read), null);
});

test("[happy-4] empty stage lists and empty read results pass through unchanged", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 2);
  const { job, inner } = await open(limited, fake, "x");
  const files: StagedFile[] = [];
  const staged = job.stage(files);
  await settle();
  assert.equal(nth(inner.stages, 0).args, files);
  nth(inner.stages, 0).resolve(undefined);
  assert.equal(await resolves(staged), undefined);
  const read = job.read("empty.txt");
  await settle();
  assert.equal(nth(inner.reads, 0).args, "empty.txt");
  nth(inner.reads, 0).resolve("");
  assert.equal(await resolves(read), "");
});

test("[happy-5] destroy forwards to the inner job and resolves with undefined", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const { job, inner } = await open(limited, fake, "j1");
  const destroyed = job.destroy();
  await settle();
  assert.equal(inner.destroys.length, 1);
  nth(inner.destroys, 0).resolve();
  assert.equal(await resolves(destroyed), undefined);
  assert.equal(inner.destroys.length, 1);
});

test("[happy-5] destroy does not settle before the inner destroy does", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const { job, inner } = await open(limited, fake, "j1");
  const destroyed = track(job.destroy());
  await settle();
  await settle();
  assert.equal(destroyed.state, "pending");
  nth(inner.destroys, 0).resolve();
  await settle();
  assert.equal(destroyed.state, "resolved");
  assert.equal(destroyed.value, undefined);
});

// --- @boundary ----------------------------------------------------------

test("[boundary-1] max 1 is accepted without throwing", () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  assert.equal(typeof limited.create, "function");
  assert.equal(fake.creates.length, 0);
});

test("[boundary-1] any max is accepted without throwing", () => {
  for (const max of [0, -1, 1.5, NaN, Infinity, 9007199254740991]) {
    const fake = fakeProvider();
    let limited: EvaluationProvider | undefined;
    assert.doesNotThrow(() => {
      limited = limitJobs(fake, max);
    }, `max ${max}`);
    assert.equal(typeof limited?.create, "function", `max ${max}`);
    assert.equal(fake.creates.length, 0, `max ${max}`);
  }
});

test("[boundary-2] with max 0 a create is never admitted", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 0);
  const j1 = create(limited, "j1");
  await settle();
  assertWaiting(fake, j1, "j1");
  assert.equal(fake.creates.length, 0);
});

test("[boundary-2] with max 0 several creates all keep waiting", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 0);
  const waiting = ["j1", "j2", "j3"].map((label) => create(limited, label));
  await settle();
  await settle();
  for (const [index, tracked] of waiting.entries()) {
    assertWaiting(fake, tracked, `j${index + 1}`);
  }
  assert.equal(fake.creates.length, 0);
});

test("[boundary-3] a signal already aborted at call time is admitted when a slot is free", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 2);
  const c = new AbortController();
  const gone = new Error("gone");
  c.abort(gone);
  const j1 = limited.create({ label: "j1", signal: c.signal });
  await settle();
  assert.equal(fake.creates.length, 1);
  assert.equal(nth(fake.creates, 0).args.label, "j1");
  assert.equal(nth(fake.creates, 0).args.signal, c.signal);
  nth(fake.creates, 0).reject(gone);
  await rejectsWith(j1, gone);
  create(limited, "j2");
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
});

test("[boundary-3] an already aborted create taking the last free slot resolves when the inner create does", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const c = new AbortController();
  c.abort(new Error("gone"));
  const j1 = limited.create({ label: "j1", signal: c.signal });
  await settle();
  assert.equal(nth(fake.creates, 0).args.signal, c.signal);
  const inner = fakeJob("sandbox-eval-j1-1");
  fake.call("j1").resolve(inner);
  const job = await resolves(j1);
  assert.equal(job.id, "sandbox-eval-j1-1");
});

test("[boundary-4] an abort after admission is left to the inner provider", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const c = new AbortController();
  const j1 = await open(limited, fake, "j1", c.signal);
  c.abort(new Error("R"));
  await settle();
  const j2 = create(limited, "j2");
  await settle();
  assertWaiting(fake, j2, "j2");
  assert.equal(fake.creates.length, 1);
  await close(j1);
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
});

test("[boundary-4] an abort while the admitted inner create is pending does not reject the create", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const c = new AbortController();
  const j1 = create(limited, "j1", c.signal);
  await settle();
  c.abort(new Error("R"));
  await settle();
  assert.equal(j1.state, "pending");
  const j2 = create(limited, "j2");
  await settle();
  assertWaiting(fake, j2, "j2");
  const inner = fakeJob("sandbox-eval-j1-1");
  fake.call("j1").resolve(inner);
  const job = await resolves(j1.promise);
  assert.equal(job.id, "sandbox-eval-j1-1");
  await settle();
  assertWaiting(fake, j2, "j2");
});

test("[boundary-5] destroying the same job twice frees only one slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const j1 = await open(limited, fake, "j1");
  const j2 = create(limited, "j2");
  const j3 = create(limited, "j3");
  await settle();
  await close(j1);
  await close(j1);
  assert.equal(j1.inner.destroys.length, 2);
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assert.equal(j2.state, "pending");
  assertWaiting(fake, j3, "j3");
});

test("[boundary-5] with max 2, destroying one job twice frees only one slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 2);
  const j1 = await open(limited, fake, "j1");
  await open(limited, fake, "j2");
  create(limited, "j3");
  const j4 = create(limited, "j4");
  await settle();
  await close(j1);
  await close(j1);
  assert.equal(j1.inner.destroys.length, 2);
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3"]);
  assertWaiting(fake, j4, "j4");
});

test("[boundary-6] a job that is never destroyed keeps its slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  await open(limited, fake, "j1");
  const j2 = create(limited, "j2");
  await settle();
  await settle();
  assertWaiting(fake, j2, "j2");
  assert.equal(fake.creates.length, 1);
});

test("[boundary-6] an admitted create whose inner create never settles keeps its slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const j1 = create(limited, "j1");
  const j2 = create(limited, "j2");
  await settle();
  await settle();
  assert.equal(j1.state, "pending");
  assertWaiting(fake, j2, "j2");
  assert.equal(fake.creates.length, 1);
});

test("[boundary-7] read still forwards after destroy", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const j1 = await open(limited, fake, "j1");
  await close(j1);
  const read = j1.job.read("a.txt");
  await settle();
  assert.equal(j1.inner.reads.length, 1);
  assert.equal(nth(j1.inner.reads, 0).args, "a.txt");
  nth(j1.inner.reads, 0).resolve("text");
  assert.equal(await resolves(read), "text");
});

test("[boundary-7] stage and exec still forward after a destroy that rejected", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const { job, inner } = await open(limited, fake, "j1");
  const destroyed = job.destroy();
  await settle();
  const E = new Error("teardown");
  nth(inner.destroys, 0).reject(E);
  await rejectsWith(destroyed, E);
  const files = [{ path: "a.txt", text: "a" }];
  const staged = job.stage(files);
  await settle();
  assert.equal(nth(inner.stages, 0).args, files);
  nth(inner.stages, 0).resolve(undefined);
  assert.equal(await resolves(staged), undefined);
  const command = { argv: ["npm", "test"] };
  const executed = job.exec(command);
  await settle();
  assert.equal(nth(inner.execs, 0).args, command);
  const result = { ...okResult };
  nth(inner.execs, 0).resolve(result);
  assert.equal(await resolves(executed), result);
});

// --- @unhappy -----------------------------------------------------------

type Forwarded = "stage" | "exec" | "read";

function callForwarded(job: EvaluationJob, call: Forwarded): Promise<unknown> {
  switch (call) {
    case "stage":
      return job.stage([{ path: "a.txt", text: "a" }]);
    case "exec":
      return job.exec({ argv: ["npm", "test"] });
    case "read":
      return job.read("a.txt");
  }
}

function innerCalls(
  inner: FakeJob,
  call: Forwarded,
): readonly { reject(error: unknown): void }[] {
  switch (call) {
    case "stage":
      return inner.stages;
    case "exec":
      return inner.execs;
    case "read":
      return inner.reads;
  }
}

test("[unhappy-1] a failure of a forwarded job call passes through unchanged and does not touch the slot", async () => {
  for (const call of ["stage", "exec", "read"] as const) {
    const fake = fakeProvider();
    const limited = limitJobs(fake, 1);
    const a = await open(limited, fake, "A");
    const b = create(limited, "B");
    await settle();
    const E = new Error(`${call} failed`);
    const pending = callForwarded(a.job, call);
    await settle();
    nth(innerCalls(a.inner, call), 0).reject(E);
    await rejectsWith(pending, E);
    await settle();
    assertWaiting(fake, b, "B");
    assert.equal(fake.creates.length, 1, call);
  }
});

test("[unhappy-1] a forwarded call rejecting with a non-Error value passes it through and the slot is freed only by destroy", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const a = await open(limited, fake, "A");
  const b = create(limited, "B");
  await settle();
  const E = { reason: "not an Error" };
  const pending = a.job.exec({ argv: ["npm", "test"] });
  await settle();
  nth(a.inner.execs, 0).reject(E);
  await rejectsWith(pending, E);
  await settle();
  assertWaiting(fake, b, "B");
  await close(a);
  assert.deepEqual(fake.labels(), ["A", "B"]);
});

test("[unhappy-2] an inner create that rejects frees its slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const j1 = limited.create({ label: "j1", signal: freshSignal() });
  const j2 = create(limited, "j2");
  await settle();
  assertWaiting(fake, j2, "j2");
  const E = new Error("create failed");
  fake.call("j1").reject(E);
  await rejectsWith(j1, E);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
});

test("[unhappy-2] an inner create that rejects frees exactly one slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const j1 = limited.create({ label: "j1", signal: freshSignal() });
  create(limited, "j2");
  const j3 = create(limited, "j3");
  await settle();
  const E = new Error("create failed");
  fake.call("j1").reject(E);
  await rejectsWith(j1, E);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assertWaiting(fake, j3, "j3");
});

test("[unhappy-3] an inner create that throws synchronously is treated as a rejection", async () => {
  const fake = fakeProvider();
  const E = new Error("thrown");
  const inner: { readonly name: string; create: EvaluationProvider["create"] } = {
    name: "fake",
    create: () => {
      throw E;
    },
  };
  const limited = limitJobs(inner, 1);
  let returned: Promise<EvaluationJob> | undefined;
  assert.doesNotThrow(() => {
    returned = limited.create({ label: "j1", signal: freshSignal() });
  });
  assert.ok(returned !== undefined);
  assert.equal(typeof returned.then, "function");
  await rejectsWith(returned, E);
  inner.create = (spec) => fake.create(spec);
  create(limited, "j2");
  await settle();
  assert.deepEqual(fake.labels(), ["j2"]);
});

test("[unhappy-3] a synchronous throw from a create admitted from the queue frees the slot for the next waiter", async () => {
  const fake = fakeProvider();
  const E = new Error("thrown");
  const inner: { readonly name: string; create: EvaluationProvider["create"] } = {
    name: "fake",
    create: (spec) => fake.create(spec),
  };
  const limited = limitJobs(inner, 1);
  const j1 = await open(limited, fake, "j1");
  const j2 = create(limited, "j2");
  const j3 = create(limited, "j3");
  await settle();
  inner.create = (spec) => {
    if (spec.label === "j2") throw E;
    return fake.create(spec);
  };
  await close(j1);
  await rejectsWith(j2.promise, E);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j3"]);
  assert.equal(j3.state, "pending");
});

test("[unhappy-4] an abort the inner create reacts to is the inner create's rejection", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const c = new AbortController();
  const j1 = limited.create({ label: "j1", signal: c.signal });
  const j2 = create(limited, "j2");
  await settle();
  assertWaiting(fake, j2, "j2");
  const R = new Error("R");
  c.abort(R);
  fake.call("j1").reject(R);
  await rejectsWith(j1, R);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
});

test("[unhappy-4] after an abort, an admitted create rejects with the inner create's own error", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const c = new AbortController();
  const j1 = limited.create({ label: "j1", signal: c.signal });
  create(limited, "j2");
  await settle();
  c.abort(new Error("R"));
  const own = new Error("inner aborted");
  fake.call("j1").reject(own);
  await rejectsWith(j1, own);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
});

test("[unhappy-5] a signal already aborted at call time rejects at once when no slot is free", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const j1 = await open(limited, fake, "j1");
  const c = new AbortController();
  const gone = new Error("gone");
  c.abort(gone);
  const j2 = limited.create({ label: "j2", signal: c.signal });
  await rejectsWith(j2, gone);
  assert.deepEqual(fake.labels(), ["j1"]);
  create(limited, "j3");
  await settle();
  await close(j1);
  assert.deepEqual(fake.labels(), ["j1", "j3"]);
  assert.ok(!fake.labels().includes("j2"));
});

test("[unhappy-5] with max 0 a signal already aborted at call time rejects with its reason without reaching the inner create", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 0);
  const c = new AbortController();
  const gone = new Error("gone");
  c.abort(gone);
  const j1 = track(limited.create({ label: "j1", signal: c.signal }));
  await settle();
  assert.equal(j1.state, "rejected");
  assert.equal(j1.error, gone);
  assert.equal(fake.creates.length, 0);
});

test("[unhappy-6] an inner destroy that rejects still frees the slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const { job, inner } = await open(limited, fake, "j1");
  const j2 = create(limited, "j2");
  await settle();
  const destroyed = job.destroy();
  await settle();
  const E = new Error("teardown");
  nth(inner.destroys, 0).reject(E);
  await rejectsWith(destroyed, E);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assert.equal(j2.state, "pending");
});

test("[unhappy-6] after an inner destroy rejects with nobody waiting, the next create is admitted at once", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const { job, inner } = await open(limited, fake, "j1");
  const destroyed = job.destroy();
  await settle();
  const E = new Error("teardown");
  nth(inner.destroys, 0).reject(E);
  await rejectsWith(destroyed, E);
  create(limited, "j2");
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
});

// --- @concurrency -------------------------------------------------------

test("[concurrency-1] only max creates reach the inner provider at once", async () => {
  const rows = [
    { max: 1, calls: 1, labels: ["j1"] },
    { max: 1, calls: 3, labels: ["j1"] },
    { max: 2, calls: 2, labels: ["j1", "j2"] },
    { max: 2, calls: 3, labels: ["j1", "j2"] },
    { max: 2, calls: 5, labels: ["j1", "j2"] },
    { max: 3, calls: 5, labels: ["j1", "j2", "j3"] },
  ];
  for (const { max, calls, labels } of rows) {
    const fake = fakeProvider();
    const limited = limitJobs(fake, max);
    const tracked = Array.from({ length: calls }, (_, index) =>
      create(limited, `j${index + 1}`),
    );
    await settle();
    assert.deepEqual(fake.labels(), labels, `max ${max}, ${calls} calls`);
    const waiting = tracked
      .map((entry, index) => ({ entry, label: `j${index + 1}` }))
      .filter(({ label }) => !labels.includes(label));
    assert.equal(waiting.length, calls - labels.length);
    for (const { entry, label } of waiting) assertWaiting(fake, entry, label);
  }
});

test("[concurrency-1] with max Infinity every create reaches the inner provider", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, Infinity);
  for (let index = 1; index <= 5; index += 1) create(limited, `j${index}`);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3", "j4", "j5"]);
});

test("[concurrency-2] a slot is held from admission until destroy settles, not until create resolves", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 2);
  const j1 = await open(limited, fake, "j1");
  await open(limited, fake, "j2");
  const j3 = create(limited, "j3");
  await settle();
  assert.equal(fake.creates.length, 2);

  const staged = j1.job.stage([{ path: "a.txt", text: "a" }]);
  const executed = j1.job.exec({ argv: ["npm", "test"] });
  const read = j1.job.read("a.txt");
  await settle();
  nth(j1.inner.stages, 0).resolve(undefined);
  nth(j1.inner.execs, 0).resolve({ ...okResult });
  nth(j1.inner.reads, 0).resolve("a");
  await resolves(Promise.all([staged, executed, read]));
  await settle();
  assert.equal(fake.creates.length, 2);

  const destroyed = j1.job.destroy();
  await settle();
  assert.equal(fake.creates.length, 2);
  assertWaiting(fake, j3, "j3");

  nth(j1.inner.destroys, 0).resolve();
  await resolves(destroyed);
  await settle();
  assert.equal(fake.creates.length, 3);
  assert.equal(nth(fake.creates, 2).args.label, "j3");
});

test("[concurrency-2] the slot is still held once the inner create resolves", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const j1 = create(limited, "j1");
  const j2 = create(limited, "j2");
  await settle();
  assertWaiting(fake, j2, "j2");
  fake.call("j1").resolve(fakeJob("sandbox-eval-j1-1"));
  await resolves(j1.promise);
  await settle();
  assertWaiting(fake, j2, "j2");
  assert.equal(fake.creates.length, 1);
});

test("[concurrency-3] waiting creates are admitted in the order they were called", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const j1 = await open(limited, fake, "j1");
  const j2 = create(limited, "j2");
  const j3 = create(limited, "j3");
  const j4 = create(limited, "j4");
  await settle();
  await close(j1);
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  await close(await admit(fake, j2, "j2"));
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3"]);
  await close(await admit(fake, j3, "j3"));
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3", "j4"]);
  assert.equal(j4.state, "pending");
});

test("[concurrency-3] the oldest waiter is admitted whichever live job frees the slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 2);
  const j1 = await open(limited, fake, "j1");
  const j2 = await open(limited, fake, "j2");
  create(limited, "j3");
  create(limited, "j4");
  const j5 = create(limited, "j5");
  await settle();
  await close(j2);
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3"]);
  await close(j1);
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3", "j4"]);
  assertWaiting(fake, j5, "j5");
});

test("[concurrency-4] a freed slot goes to the oldest waiter, not to a create called after it was freed", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const j1 = await open(limited, fake, "j1");
  create(limited, "j2");
  await settle();
  const destroyed = j1.job.destroy();
  await settle();
  nth(j1.inner.destroys, 0).resolve();
  await resolves(destroyed);
  const j3 = create(limited, "j3");
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assertWaiting(fake, j3, "j3");
});

test("[concurrency-4] a slot freed by a failed create goes to the oldest waiter, not to a later create", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const j1 = limited.create({ label: "j1", signal: freshSignal() });
  create(limited, "j2");
  await settle();
  const E = new Error("create failed");
  fake.call("j1").reject(E);
  await rejectsWith(j1, E);
  const j3 = create(limited, "j3");
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assertWaiting(fake, j3, "j3");
});

test("[concurrency-5] each destroy frees exactly one slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 2);
  const j1 = await open(limited, fake, "j1");
  const j2 = await open(limited, fake, "j2");
  create(limited, "j3");
  create(limited, "j4");
  const j5 = create(limited, "j5");
  await settle();
  const both = Promise.all([j1.job.destroy(), j2.job.destroy()]);
  await settle();
  nth(j1.inner.destroys, 0).resolve();
  nth(j2.inner.destroys, 0).resolve();
  await resolves(both);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3", "j4"]);
  assertWaiting(fake, j5, "j5");
});

test("[concurrency-5] two destroys with one waiter admit it and leave one slot free", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 2);
  const j1 = await open(limited, fake, "j1");
  const j2 = await open(limited, fake, "j2");
  create(limited, "j3");
  await settle();
  const both = Promise.all([j1.job.destroy(), j2.job.destroy()]);
  await settle();
  nth(j1.inner.destroys, 0).resolve();
  nth(j2.inner.destroys, 0).resolve();
  await resolves(both);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3"]);
  create(limited, "j4");
  const j5 = create(limited, "j5");
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3", "j4"]);
  assertWaiting(fake, j5, "j5");
});

test("[concurrency-6] a waiter whose signal aborts leaves the queue without taking a slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const j1 = await open(limited, fake, "j1");
  const c = new AbortController();
  const j2 = create(limited, "j2", c.signal);
  const j3 = create(limited, "j3");
  await settle();
  const stop = new Error("stop");
  c.abort(stop);
  await settle();
  assert.equal(j2.state, "rejected");
  assert.equal(j2.error, stop);
  assert.deepEqual(fake.labels(), ["j1"]);
  await close(j1);
  assert.deepEqual(fake.labels(), ["j1", "j3"]);
  assert.ok(!fake.labels().includes("j2"));
  assert.equal(j3.state, "pending");
});

test("[concurrency-6] when the only waiter aborts, a freed slot goes to the next create at once", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const j1 = await open(limited, fake, "j1");
  const c = new AbortController();
  const j2 = create(limited, "j2", c.signal);
  await settle();
  const stop = new Error("stop");
  c.abort(stop);
  await rejectsWith(j2.promise, stop);
  await close(j1);
  assert.deepEqual(fake.labels(), ["j1"]);
  create(limited, "j3");
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j3"]);
});

test("[concurrency-7] two overlapping destroys of the same job free only one slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const j1 = await open(limited, fake, "j1");
  create(limited, "j2");
  const j3 = create(limited, "j3");
  await settle();
  const first = j1.job.destroy();
  const second = j1.job.destroy();
  await settle();
  assert.equal(j1.inner.destroys.length, 2);
  nth(j1.inner.destroys, 0).resolve();
  nth(j1.inner.destroys, 1).resolve();
  await resolves(Promise.all([first, second]));
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assertWaiting(fake, j3, "j3");
});

test("[concurrency-7] overlapping destroys where the first inner destroy rejects still free only one slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake, 1);
  const j1 = await open(limited, fake, "j1");
  create(limited, "j2");
  const j3 = create(limited, "j3");
  await settle();
  const first = j1.job.destroy();
  const second = j1.job.destroy();
  await settle();
  const E = new Error("teardown");
  nth(j1.inner.destroys, 0).reject(E);
  nth(j1.inner.destroys, 1).resolve();
  await rejectsWith(first, E);
  await resolves(second);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assertWaiting(fake, j3, "j3");
});

test("[concurrency-8] two limited providers over the same inner provider do not share slots", async () => {
  const fake = fakeProvider();
  const l1 = limitJobs(fake, 1);
  const l2 = limitJobs(fake, 1);
  create(l1, "a1");
  create(l2, "b1");
  await settle();
  assert.deepEqual(fake.labels(), ["a1", "b1"]);
  const a2 = create(l1, "a2");
  await settle();
  assertWaiting(fake, a2, "a2");
});

test("[concurrency-8] destroying one limited provider's job does not free the other's slot", async () => {
  const fake = fakeProvider();
  const l1 = limitJobs(fake, 1);
  const l2 = limitJobs(fake, 1);
  const a1 = await open(l1, fake, "a1");
  const b1 = await open(l2, fake, "b1");
  const a2 = create(l1, "a2");
  await settle();
  await close(b1);
  assertWaiting(fake, a2, "a2");
  await close(a1);
  assert.deepEqual(fake.labels(), ["a1", "b1", "a2"]);
});

test("[concurrency-9] wrapping a limited provider again applies the tighter cap", async () => {
  const fake = fakeProvider();
  const l1 = limitJobs(fake, 2);
  const l2 = limitJobs(l1, 1);
  create(l2, "j1");
  const j2 = create(l2, "j2");
  await settle();
  assert.deepEqual(fake.labels(), ["j1"]);
  assertWaiting(fake, j2, "j2");
});

test("[concurrency-9] wrapping a tighter limited provider in a looser one keeps the inner cap", async () => {
  const fake = fakeProvider();
  const l1 = limitJobs(fake, 1);
  const l2 = limitJobs(l1, 3);
  create(l2, "j1");
  const j2 = create(l2, "j2");
  const j3 = create(l2, "j3");
  await settle();
  assert.deepEqual(fake.labels(), ["j1"]);
  assertWaiting(fake, j2, "j2");
  assertWaiting(fake, j3, "j3");
});
