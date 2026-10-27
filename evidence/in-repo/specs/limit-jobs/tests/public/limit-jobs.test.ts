import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  EvaluationCommand,
  EvaluationEnvironment,
  EvaluationExecResult,
  EvaluationJob,
  EvaluationProvider,
  StagedFile,
} from "sandbox-factory";
import { EVALUATION_JOBS_MAX, limitJobs } from "../src/evaluation/limit.js";

type Spec = { readonly label: string; readonly signal: AbortSignal };

/** Lets pending promises run before an observation. */
const settle = () => new Promise<void>((done) => setImmediate(done));

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface Call<A, R> {
  readonly args: A;
  readonly result: Deferred<R>;
}

function nth<T>(list: readonly T[], index: number): T {
  const item = list[index];
  assert.ok(item !== undefined, `expected an entry at ${index}`);
  return item;
}

/** An inner job whose calls are recorded and settle when the test says. */
function fakeJob(id: string) {
  const environment: EvaluationEnvironment = {
    provider: "fake",
    environmentId: null,
    templateDigest: null,
  };
  const stage: Call<readonly StagedFile[], void>[] = [];
  const exec: Call<EvaluationCommand, EvaluationExecResult>[] = [];
  const read: Call<string, string | null>[] = [];
  const destroy: Deferred<void>[] = [];
  const job: EvaluationJob = {
    id,
    environment,
    stage(files) {
      const result = deferred<void>();
      stage.push({ args: files, result });
      return result.promise;
    },
    exec(command) {
      const result = deferred<EvaluationExecResult>();
      exec.push({ args: command, result });
      return result.promise;
    },
    read(path) {
      const result = deferred<string | null>();
      read.push({ args: path, result });
      return result.promise;
    },
    destroy() {
      const result = deferred<void>();
      destroy.push(result);
      return result.promise;
    },
  };
  return { job, stage, exec, read, destroy };
}

type FakeJob = ReturnType<typeof fakeJob>;

/** An inner provider whose creates are recorded and settle when the test says. */
function fakeProvider(name = "fake") {
  const creates: Call<Spec, EvaluationJob>[] = [];
  const provider: EvaluationProvider = {
    name,
    create(spec) {
      const result = deferred<EvaluationJob>();
      creates.push({ args: spec, result });
      return result.promise;
    },
  };
  const labels = () => creates.map((entry) => entry.args.label);
  /** Resolves the inner create for `label` with a fresh fake job. */
  const open = (label: string, id = `job-${label}`): FakeJob => {
    const inner = fakeJob(id);
    nth(creates, labels().indexOf(label)).result.resolve(inner.job);
    return inner;
  };
  return { provider, creates, labels, open };
}

type Fake = ReturnType<typeof fakeProvider>;

function track<T>(promise: Promise<T>) {
  const outcome: {
    state: "pending" | "fulfilled" | "rejected";
    value?: T;
    reason?: unknown;
  } = { state: "pending" };
  promise.then(
    (value) => {
      outcome.state = "fulfilled";
      outcome.value = value;
    },
    (reason: unknown) => {
      outcome.state = "rejected";
      outcome.reason = reason;
    },
  );
  return outcome;
}

function create(
  limited: EvaluationProvider,
  label: string,
  signal = new AbortController().signal,
) {
  const promise = limited.create({ label, signal });
  return { label, promise, outcome: track(promise) };
}

type Created = ReturnType<typeof create>;

function assertWaiting(fake: Fake, created: Created) {
  assert.equal(created.outcome.state, "pending");
  assert.ok(!fake.labels().includes(created.label));
}

async function rejectsWith(promise: Promise<unknown>, expected: unknown) {
  await assert.rejects(promise, (error: unknown) => {
    assert.equal(error, expected);
    return true;
  });
}

/** Resolves an admitted create's inner create and returns both jobs. */
async function take(fake: Fake, created: Created) {
  const inner = fake.open(created.label);
  const job = await created.promise;
  return { job, inner };
}

type Held = Awaited<ReturnType<typeof take>>;

/** A create that has been admitted and resolved with a limited job. */
async function hold(
  fake: Fake,
  limited: EvaluationProvider,
  label: string,
  signal?: AbortSignal,
) {
  const created = create(limited, label, signal);
  await settle();
  return take(fake, created);
}

/** Destroys a limited job and resolves its inner destroy. */
async function release(held: Held) {
  const done = held.job.destroy();
  await settle();
  nth(held.inner.destroy, held.inner.destroy.length - 1).resolve();
  await done;
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

// --- @happy -----------------------------------------------------------------

test("[happy-1] EVALUATION_JOBS_MAX is 2", () => {
  assert.equal(EVALUATION_JOBS_MAX, 2);
});

test("[happy-1] a provider limited to EVALUATION_JOBS_MAX admits two creates and queues the third", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, EVALUATION_JOBS_MAX);
  create(limited, "j1");
  create(limited, "j2");
  const third = create(limited, "j3");
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assertWaiting(fake, third);
});

test("[happy-2] the limited provider keeps the name and is a new object", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  assert.equal(limited.name, "fake");
  assert.notEqual(limited, fake.provider);
  await settle();
  assert.equal(fake.creates.length, 0);
});

test("[happy-2] an empty inner name passes through as it is", async () => {
  const fake = fakeProvider("");
  const limited = limitJobs(fake.provider, 1);
  assert.equal(limited.name, "");
  assert.notEqual(limited, fake.provider);
  await settle();
  assert.equal(fake.creates.length, 0);
});

test("[happy-3] a create under the cap reaches the inner provider with the same label and signal", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const c = new AbortController();
  create(limited, "sbv_1", c.signal);
  await settle();
  assert.equal(fake.creates.length, 1);
  const spec = nth(fake.creates, 0).args;
  assert.equal(spec.label, "sbv_1");
  assert.equal(spec.signal, c.signal);
});

test("[happy-3] with max 1 the single free slot passes an odd label and its signal straight through", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const c = new AbortController();
  create(limited, "sbv_1/odd label", c.signal);
  await settle();
  assert.equal(fake.creates.length, 1);
  const spec = nth(fake.creates, 0).args;
  assert.equal(spec.label, "sbv_1/odd label");
  assert.equal(spec.signal, c.signal);
});

test("[happy-4] the limited job forwards stage, exec and read and keeps the inner id and environment", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const created = create(limited, "x");
  await settle();
  const inner = fake.open("x", "sandbox-eval-x-1");
  const job = await created.promise;
  assert.equal(job.id, "sandbox-eval-x-1");
  assert.equal(job.environment, inner.job.environment);
  assert.deepEqual(job.environment, {
    provider: "fake",
    environmentId: null,
    templateDigest: null,
  });
  assert.notEqual(job, inner.job);

  const files = [{ path: "a.txt", text: "a" }];
  const staged = job.stage(files);
  await settle();
  assert.equal(inner.stage.length, 1);
  assert.equal(nth(inner.stage, 0).args, files);
  nth(inner.stage, 0).result.resolve();
  assert.equal(await staged, undefined);

  const command = { argv: ["npm", "test"] };
  const ran = job.exec(command);
  await settle();
  assert.equal(inner.exec.length, 1);
  assert.equal(nth(inner.exec, 0).args, command);
  nth(inner.exec, 0).result.resolve(okResult);
  assert.equal(await ran, okResult);

  const lock = job.read("package-lock.json");
  await settle();
  assert.equal(inner.read.length, 1);
  assert.equal(nth(inner.read, 0).args, "package-lock.json");
  nth(inner.read, 0).result.resolve(null);
  assert.equal(await lock, null);
});

test("[happy-4] an empty staged list, a null exit code and an empty file text forward unchanged", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const { job, inner } = await hold(fake, limited, "x");

  const files: StagedFile[] = [];
  const staged = job.stage(files);
  await settle();
  assert.equal(nth(inner.stage, 0).args, files);
  nth(inner.stage, 0).result.resolve();
  assert.equal(await staged, undefined);

  const killed: EvaluationExecResult = { ...okResult, exitCode: null };
  const command = { argv: ["npm", "ci"], cwd: "pkg", env: { A: "1" } };
  const ran = job.exec(command);
  await settle();
  assert.equal(nth(inner.exec, 0).args, command);
  nth(inner.exec, 0).result.resolve(killed);
  assert.equal(await ran, killed);

  const text = job.read("empty.txt");
  await settle();
  assert.equal(nth(inner.read, 0).args, "empty.txt");
  nth(inner.read, 0).result.resolve("");
  assert.equal(await text, "");
});

test("[happy-5] destroy forwards to the inner job once and resolves with undefined", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const { job, inner } = await hold(fake, limited, "j1");
  const done = job.destroy();
  await settle();
  assert.equal(inner.destroy.length, 1);
  nth(inner.destroy, 0).resolve();
  assert.equal(await done, undefined);
  await settle();
  assert.equal(inner.destroy.length, 1);
});

test("[happy-5] destroying one of two live jobs calls only that job's inner destroy", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const first = await hold(fake, limited, "j1");
  const second = await hold(fake, limited, "j2");
  const done = first.job.destroy();
  await settle();
  assert.equal(first.inner.destroy.length, 1);
  assert.equal(second.inner.destroy.length, 0);
  nth(first.inner.destroy, 0).resolve();
  assert.equal(await done, undefined);
  await settle();
  assert.equal(second.inner.destroy.length, 0);
});

// --- @unhappy ---------------------------------------------------------------

test("[unhappy-1] an invalid max throws a RangeError synchronously", async () => {
  for (const max of [0, -1, 1.5, NaN, Infinity, 9007199254740992]) {
    const fake = fakeProvider();
    assert.throws(
      () => limitJobs(fake.provider, max),
      (error: unknown) => {
        assert.ok(error instanceof RangeError, `max ${max}`);
        assert.match(error.message, /positive whole number/);
        return true;
      },
    );
    await settle();
    assert.equal(fake.creates.length, 0, `max ${max}`);
  }
});

test("[unhappy-1] negative zero and the smallest positive fraction are rejected too", async () => {
  for (const max of [-0, Number.MIN_VALUE, -Infinity]) {
    const fake = fakeProvider();
    assert.throws(
      () => limitJobs(fake.provider, max),
      (error: unknown) => {
        assert.ok(error instanceof RangeError, `max ${max}`);
        assert.match(error.message, /positive whole number/);
        return true;
      },
    );
    await settle();
    assert.equal(fake.creates.length, 0, `max ${max}`);
  }
});

type Forwarded = "stage" | "exec" | "read";

function invoke(job: EvaluationJob, call: Forwarded): Promise<unknown> {
  switch (call) {
    case "stage":
      return job.stage([{ path: "a.txt", text: "a" }]);
    case "exec":
      return job.exec({ argv: ["npm", "test"] });
    case "read":
      return job.read("a.txt");
  }
}

function lastCall(
  inner: FakeJob,
  call: Forwarded,
): { reject(error: unknown): void } {
  const calls: readonly {
    readonly result: { reject(error: unknown): void };
  }[] = inner[call];
  return nth(calls, calls.length - 1).result;
}

test("[unhappy-2] a failing stage, exec or read passes its error through and keeps the slot", async () => {
  for (const call of ["stage", "exec", "read"] as const) {
    const fake = fakeProvider();
    const limited = limitJobs(fake.provider, 1);
    const a = await hold(fake, limited, "A");
    const b = create(limited, "B");
    await settle();
    const failure = new Error(`${call} failed`);
    const pending = invoke(a.job, call);
    await settle();
    lastCall(a.inner, call).reject(failure);
    await rejectsWith(pending, failure);
    await settle();
    assertWaiting(fake, b);
    assert.equal(fake.creates.length, 1, call);
  }
});

test("[unhappy-2] after a forwarded call fails, destroy still hands the slot to the waiter", async () => {
  for (const call of ["stage", "exec", "read"] as const) {
    const fake = fakeProvider();
    const limited = limitJobs(fake.provider, 1);
    const a = await hold(fake, limited, "A");
    const b = create(limited, "B");
    const failure = new Error(`${call} failed`);
    const pending = invoke(a.job, call);
    await settle();
    lastCall(a.inner, call).reject(failure);
    await rejectsWith(pending, failure);
    await release(a);
    assert.deepEqual(fake.labels(), ["A", "B"], call);
    assert.equal(b.outcome.state, "pending");
  }
});

test("[unhappy-3] an inner create that rejects passes its error through and frees its slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = create(limited, "j1");
  const j2 = create(limited, "j2");
  await settle();
  assert.deepEqual(fake.labels(), ["j1"]);
  const failure = new Error("provider down");
  nth(fake.creates, 0).result.reject(failure);
  await rejectsWith(j1.promise, failure);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assert.equal(j2.outcome.state, "pending");
});

test("[unhappy-3] a rejected inner create frees exactly one slot for two waiters", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = create(limited, "j1");
  create(limited, "j2");
  const j3 = create(limited, "j3");
  await settle();
  const failure = new Error("provider down");
  nth(fake.creates, 0).result.reject(failure);
  await rejectsWith(j1.promise, failure);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assertWaiting(fake, j3);
});

/** An inner provider whose create is a plain function the test can swap. */
function swappableProvider() {
  const labels: string[] = [];
  let impl: (spec: Spec) => Promise<EvaluationJob> = () => {
    throw new Error("unset");
  };
  const provider: EvaluationProvider = {
    name: "fake",
    create(spec) {
      labels.push(spec.label);
      return impl(spec);
    },
  };
  return {
    provider,
    labels,
    use(next: (spec: Spec) => Promise<EvaluationJob>) {
      impl = next;
    },
  };
}

test("[unhappy-4] an inner create that throws synchronously is a rejection that frees the slot", async () => {
  const inner = swappableProvider();
  const failure = new Error("thrown");
  inner.use(() => {
    throw failure;
  });
  const limited = limitJobs(inner.provider, 1);
  let first: Promise<EvaluationJob> | undefined;
  assert.doesNotThrow(() => {
    first = limited.create({
      label: "j1",
      signal: new AbortController().signal,
    });
  });
  assert.ok(first !== undefined);
  assert.equal(typeof first.then, "function");
  await rejectsWith(first, failure);
  inner.use(async () => fakeJob("job-j2").job);
  const second = limited.create({
    label: "j2",
    signal: new AbortController().signal,
  });
  await settle();
  assert.deepEqual(inner.labels, ["j1", "j2"]);
  assert.equal((await second).id, "job-j2");
});

test("[unhappy-4] a synchronous throw hands the slot to a create already waiting", async () => {
  const inner = swappableProvider();
  const failure = new Error("thrown");
  inner.use((spec) => {
    if (spec.label === "j1") throw failure;
    return deferred<EvaluationJob>().promise;
  });
  const limited = limitJobs(inner.provider, 1);
  const j1 = create(limited, "j1");
  const j2 = create(limited, "j2");
  const j3 = create(limited, "j3");
  await rejectsWith(j1.promise, failure);
  await settle();
  assert.deepEqual(inner.labels, ["j1", "j2"]);
  assert.equal(j2.outcome.state, "pending");
  assert.equal(j3.outcome.state, "pending");
});

test("[unhappy-5] an abort the inner create rejects on passes its reason through and frees the slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const c = new AbortController();
  const j1 = create(limited, "j1", c.signal);
  const j2 = create(limited, "j2");
  await settle();
  assert.deepEqual(fake.labels(), ["j1"]);
  const reason = new Error("aborted");
  c.abort(reason);
  nth(fake.creates, 0).result.reject(reason);
  await rejectsWith(j1.promise, reason);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assert.equal(j2.outcome.state, "pending");
});

test("[unhappy-5] when the waiter shares the aborted signal both reject with its reason and the slot is free", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const c = new AbortController();
  const j1 = create(limited, "j1", c.signal);
  const j2 = create(limited, "j2", c.signal);
  await settle();
  const reason = new Error("aborted");
  c.abort(reason);
  nth(fake.creates, 0).result.reject(reason);
  await rejectsWith(j1.promise, reason);
  await rejectsWith(j2.promise, reason);
  await settle();
  assert.deepEqual(fake.labels(), ["j1"]);
  create(limited, "j3");
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j3"]);
});

test("[unhappy-6] a signal already aborted at call time rejects with its reason even with a slot free", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const c = new AbortController();
  const gone = new Error("gone");
  c.abort(gone);
  const j1 = create(limited, "j1", c.signal);
  await rejectsWith(j1.promise, gone);
  await settle();
  assert.equal(fake.creates.length, 0);
  create(limited, "j2");
  await settle();
  assert.deepEqual(fake.labels(), ["j2"]);
});

test("[unhappy-6] an already aborted signal without a given reason rejects with signal.reason and takes no slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const c = new AbortController();
  c.abort();
  const j1 = create(limited, "j1", c.signal);
  await rejectsWith(j1.promise, c.signal.reason);
  await settle();
  assert.equal(fake.creates.length, 0);
  create(limited, "j2");
  await settle();
  assert.deepEqual(fake.labels(), ["j2"]);
});

test("[unhappy-7] an inner destroy that rejects passes its error through and still frees the slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  const j2 = create(limited, "j2");
  await settle();
  const failure = new Error("teardown failed");
  const done = j1.job.destroy();
  await settle();
  nth(j1.inner.destroy, 0).reject(failure);
  await rejectsWith(done, failure);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assert.equal(j2.outcome.state, "pending");
});

test("[unhappy-7] a rejected inner destroy frees exactly one slot for two waiters", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  create(limited, "j2");
  const j3 = create(limited, "j3");
  const failure = new Error("teardown failed");
  const done = j1.job.destroy();
  await settle();
  nth(j1.inner.destroy, 0).reject(failure);
  await rejectsWith(done, failure);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assertWaiting(fake, j3);
});

// --- @boundary --------------------------------------------------------------

test("[boundary-1] max 1 and Number.MAX_SAFE_INTEGER are accepted", () => {
  for (const max of [1, 9007199254740991]) {
    const fake = fakeProvider();
    let limited: EvaluationProvider | undefined;
    assert.doesNotThrow(() => {
      limited = limitJobs(fake.provider, max);
    });
    assert.ok(limited !== undefined);
    assert.equal(typeof limited.create, "function");
  }
});

test("[boundary-1] max 1 admits one create and Number.MAX_SAFE_INTEGER admits every create", async () => {
  const one = fakeProvider();
  const single = limitJobs(one.provider, 1);
  create(single, "j1");
  const second = create(single, "j2");
  await settle();
  assert.deepEqual(one.labels(), ["j1"]);
  assertWaiting(one, second);

  const many = fakeProvider();
  const unbounded = limitJobs(many.provider, 9007199254740991);
  const labels = ["j1", "j2", "j3", "j4", "j5"];
  for (const label of labels) create(unbounded, label);
  await settle();
  assert.deepEqual(many.labels(), labels);
});

test("[boundary-2] an abort after admission leaves the job holding its slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const c = new AbortController();
  const j1 = await hold(fake, limited, "j1", c.signal);
  c.abort(new Error("late"));
  await settle();
  const j2 = create(limited, "j2");
  await settle();
  assertWaiting(fake, j2);
  assert.deepEqual(fake.labels(), ["j1"]);
  await release(j1);
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
});

test("[boundary-2] an abort while the admitted inner create is pending is left for the inner create to answer", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const c = new AbortController();
  const j1 = create(limited, "j1", c.signal);
  await settle();
  c.abort(new Error("late"));
  await settle();
  assert.equal(j1.outcome.state, "pending");
  const j2 = create(limited, "j2");
  await settle();
  assertWaiting(fake, j2);
  fake.open("j1", "job-1");
  const job = await j1.promise;
  assert.equal(job.id, "job-1");
  await settle();
  assertWaiting(fake, j2);
});

test("[boundary-3] destroying the same job twice forwards both and frees only one slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  create(limited, "j2");
  const j3 = create(limited, "j3");
  await release(j1);
  await release(j1);
  assert.equal(j1.inner.destroy.length, 2);
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assertWaiting(fake, j3);
});

test("[boundary-3] a second destroy whose inner destroy rejects passes the error through and frees nothing more", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  create(limited, "j2");
  const j3 = create(limited, "j3");
  await release(j1);
  const failure = new Error("already gone");
  const again = j1.job.destroy();
  await settle();
  assert.equal(j1.inner.destroy.length, 2);
  nth(j1.inner.destroy, 1).reject(failure);
  await rejectsWith(again, failure);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assertWaiting(fake, j3);
});

test("[boundary-4] a job that is never destroyed keeps its slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  await hold(fake, limited, "j1");
  const j2 = create(limited, "j2");
  await settle();
  assertWaiting(fake, j2);
  assert.equal(fake.creates.length, 1);
});

test("[boundary-4] jobs never destroyed keep every slot however long the queue waits", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const first = await hold(fake, limited, "j1");
  await hold(fake, limited, "j2");
  const ran = first.job.exec({ argv: ["npm", "test"] });
  await settle();
  nth(first.inner.exec, 0).result.resolve(okResult);
  await ran;
  const j3 = create(limited, "j3");
  for (let round = 0; round < 20; round += 1) await settle();
  assertWaiting(fake, j3);
  assert.equal(fake.creates.length, 2);
});

test("[boundary-5] read still forwards after destroy", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  await release(j1);
  const text = j1.job.read("a.txt");
  await settle();
  assert.equal(j1.inner.read.length, 1);
  assert.equal(nth(j1.inner.read, 0).args, "a.txt");
  nth(j1.inner.read, 0).result.resolve("contents");
  assert.equal(await text, "contents");
});

test("[boundary-5] stage and exec still forward after destroy, results and errors unchanged", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  await release(j1);

  const files = [{ path: "b.txt", text: "b" }];
  const staged = j1.job.stage(files);
  await settle();
  assert.equal(nth(j1.inner.stage, 0).args, files);
  const failure = new Error("gone");
  nth(j1.inner.stage, 0).result.reject(failure);
  await rejectsWith(staged, failure);

  const command = { argv: ["npm", "test"] };
  const ran = j1.job.exec(command);
  await settle();
  assert.equal(nth(j1.inner.exec, 0).args, command);
  nth(j1.inner.exec, 0).result.resolve(okResult);
  assert.equal(await ran, okResult);
});

// --- @concurrency -----------------------------------------------------------

test("[concurrency-1] only max creates reach the inner provider at once", async () => {
  const rows = [
    { max: 1, calls: 1, labels: ["j1"], waiting: 0 },
    { max: 1, calls: 3, labels: ["j1"], waiting: 2 },
    { max: 2, calls: 2, labels: ["j1", "j2"], waiting: 0 },
    { max: 2, calls: 3, labels: ["j1", "j2"], waiting: 1 },
    { max: 2, calls: 5, labels: ["j1", "j2"], waiting: 3 },
    { max: 3, calls: 5, labels: ["j1", "j2", "j3"], waiting: 2 },
  ];
  for (const row of rows) {
    const fake = fakeProvider();
    const limited = limitJobs(fake.provider, row.max);
    const created: Created[] = [];
    for (let index = 1; index <= row.calls; index += 1) {
      created.push(create(limited, `j${index}`));
    }
    await settle();
    assert.deepEqual(fake.labels(), row.labels, `max ${row.max}`);
    const waiting = created.filter(
      (entry) =>
        entry.outcome.state === "pending" &&
        !fake.labels().includes(entry.label),
    );
    assert.equal(waiting.length, row.waiting, `max ${row.max}`);
  }
});

test("[concurrency-1] exactly max creates are all admitted and the next one waits", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 4);
  for (const label of ["j1", "j2", "j3", "j4"]) create(limited, label);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3", "j4"]);
  const fifth = create(limited, "j5");
  await settle();
  assertWaiting(fake, fifth);
});

test("[concurrency-2] a slot is held until destroy settles, not until create resolves", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const j1 = await hold(fake, limited, "j1");
  await hold(fake, limited, "j2");
  create(limited, "j3");
  await settle();
  assert.equal(fake.creates.length, 2);

  const staged = j1.job.stage([{ path: "a.txt", text: "a" }]);
  const ran = j1.job.exec({ argv: ["npm", "test"] });
  const read = j1.job.read("a.txt");
  await settle();
  nth(j1.inner.stage, 0).result.resolve();
  nth(j1.inner.exec, 0).result.resolve(okResult);
  nth(j1.inner.read, 0).result.resolve("a");
  await Promise.all([staged, ran, read]);
  await settle();
  assert.equal(fake.creates.length, 2);

  const done = j1.job.destroy();
  await settle();
  assert.equal(fake.creates.length, 2);

  nth(j1.inner.destroy, 0).resolve();
  await done;
  await settle();
  assert.equal(fake.creates.length, 3);
  assert.equal(nth(fake.creates, 2).args.label, "j3");
});

test("[concurrency-2] a slot is held from admission while the inner create is still pending", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const j1 = create(limited, "j1");
  const j2 = create(limited, "j2");
  const j3 = create(limited, "j3");
  await settle();
  assert.equal(j1.outcome.state, "pending");
  assert.equal(j2.outcome.state, "pending");
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assertWaiting(fake, j3);
  await take(fake, j1);
  await settle();
  assertWaiting(fake, j3);
});

test("[concurrency-3] waiting creates are admitted in the order they were called", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  const j2 = create(limited, "j2");
  const j3 = create(limited, "j3");
  create(limited, "j4");
  await settle();
  await release(j1);
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  await release(await take(fake, j2));
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3"]);
  await release(await take(fake, j3));
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3", "j4"]);
});

test("[concurrency-3] the oldest waiter is admitted whichever live job frees its slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  await hold(fake, limited, "j1");
  const j2 = await hold(fake, limited, "j2");
  create(limited, "j3");
  const j4 = create(limited, "j4");
  const j5 = create(limited, "j5");
  await settle();
  await release(j2);
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3"]);
  assertWaiting(fake, j4);
  assertWaiting(fake, j5);
});

test("[concurrency-4] a freed slot goes to the oldest waiter, not a create called right after it frees", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  create(limited, "j2");
  await settle();
  const done = j1.job.destroy();
  await settle();
  nth(j1.inner.destroy, 0).resolve();
  await done;
  const j3 = create(limited, "j3");
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assertWaiting(fake, j3);
});

test("[concurrency-4] a slot freed by a failed create goes to the oldest waiter, not a create called right after", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = create(limited, "j1");
  create(limited, "j2");
  await settle();
  const failure = new Error("provider down");
  nth(fake.creates, 0).result.reject(failure);
  await rejectsWith(j1.promise, failure);
  const j3 = create(limited, "j3");
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assertWaiting(fake, j3);
});

test("[concurrency-5] each destroy frees exactly one slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const j1 = await hold(fake, limited, "j1");
  const j2 = await hold(fake, limited, "j2");
  create(limited, "j3");
  create(limited, "j4");
  const j5 = create(limited, "j5");
  await settle();
  await Promise.all([release(j1), release(j2)]);
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3", "j4"]);
  assertWaiting(fake, j5);
});

test("[concurrency-5] two destroys with one waiter admit it and leave one slot free", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const j1 = await hold(fake, limited, "j1");
  const j2 = await hold(fake, limited, "j2");
  create(limited, "j3");
  await settle();
  await Promise.all([release(j1), release(j2)]);
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3"]);
  create(limited, "j4");
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3", "j4"]);
  const j5 = create(limited, "j5");
  await settle();
  assertWaiting(fake, j5);
});

test("[concurrency-6] a waiter whose signal aborts rejects with its reason and leaves the queue", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  const c = new AbortController();
  const j2 = create(limited, "j2", c.signal);
  const j3 = create(limited, "j3");
  await settle();
  const stop = new Error("stop");
  c.abort(stop);
  await rejectsWith(j2.promise, stop);
  await settle();
  assert.deepEqual(fake.labels(), ["j1"]);
  await release(j1);
  assert.deepEqual(fake.labels(), ["j1", "j3"]);
  assert.equal(j3.outcome.state, "pending");
});

test("[concurrency-6] when the only waiter aborts, the freed slot stays free for a later create", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  const c = new AbortController();
  const j2 = create(limited, "j2", c.signal);
  await settle();
  const stop = new Error("stop");
  c.abort(stop);
  await rejectsWith(j2.promise, stop);
  await release(j1);
  assert.deepEqual(fake.labels(), ["j1"]);
  create(limited, "j3");
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j3"]);
});

test("[concurrency-7] two overlapping destroys of the same job free only one slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  create(limited, "j2");
  const j3 = create(limited, "j3");
  const first = j1.job.destroy();
  const second = j1.job.destroy();
  await settle();
  assert.equal(j1.inner.destroy.length, 2);
  nth(j1.inner.destroy, 0).resolve();
  nth(j1.inner.destroy, 1).resolve();
  await Promise.all([first, second]);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assertWaiting(fake, j3);
});

test("[concurrency-7] of two overlapping destroys, whichever settles first frees the slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  create(limited, "j2");
  const j3 = create(limited, "j3");
  const first = track(j1.job.destroy());
  const second = j1.job.destroy();
  await settle();
  nth(j1.inner.destroy, 1).resolve();
  await second;
  await settle();
  assert.equal(first.state, "pending");
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assertWaiting(fake, j3);
});

test("[concurrency-8] two limited providers over the same inner provider do not share slots", async () => {
  const fake = fakeProvider();
  const l1 = limitJobs(fake.provider, 1);
  const l2 = limitJobs(fake.provider, 1);
  create(l1, "a1");
  create(l2, "b1");
  await settle();
  assert.deepEqual(fake.labels(), ["a1", "b1"]);
  const a2 = create(l1, "a2");
  await settle();
  assertWaiting(fake, a2);
});

test("[concurrency-8] a slot freed in one limited provider does not admit the other's waiter", async () => {
  const fake = fakeProvider();
  const l1 = limitJobs(fake.provider, 1);
  const l2 = limitJobs(fake.provider, 1);
  const a1 = await hold(fake, l1, "a1");
  const b1 = await hold(fake, l2, "b1");
  const a2 = create(l1, "a2");
  await settle();
  await release(b1);
  assertWaiting(fake, a2);
  await release(a1);
  assert.deepEqual(fake.labels(), ["a1", "b1", "a2"]);
});

test("[concurrency-9] wrapping a limited provider again applies the tighter cap", async () => {
  const fake = fakeProvider();
  const l1 = limitJobs(fake.provider, 2);
  const l2 = limitJobs(l1, 1);
  create(l2, "j1");
  const j2 = create(l2, "j2");
  await settle();
  assert.deepEqual(fake.labels(), ["j1"]);
  assertWaiting(fake, j2);
});

test("[concurrency-9] a looser outer cap over a tighter inner one is held to the inner cap", async () => {
  const fake = fakeProvider();
  const l1 = limitJobs(fake.provider, 1);
  const l2 = limitJobs(l1, 3);
  create(l2, "j1");
  const j2 = create(l2, "j2");
  const j3 = create(l2, "j3");
  await settle();
  assert.deepEqual(fake.labels(), ["j1"]);
  assertWaiting(fake, j2);
  assertWaiting(fake, j3);
});
