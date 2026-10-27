import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { test } from "node:test";
import type {
  EvaluationCommand,
  EvaluationEnvironment,
  EvaluationExecResult,
  EvaluationJob,
  EvaluationProvider,
  StagedFile,
} from "sandbox-factory";
import { EVALUATION_JOBS_MAX, limitJobs } from "../../src/evaluation/limit.js";

type Spec = { readonly label: string; readonly signal: AbortSignal };

/** Lets pending promises run before an observation. */
const settle = () => new Promise<void>((done) => setImmediate(done));

async function settleMany(rounds: number) {
  for (let round = 0; round < rounds; round += 1) await settle();
}

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
function fakeJob(
  id: string,
  environment: EvaluationEnvironment = {
    provider: "fake",
    environmentId: null,
    templateDigest: null,
  },
) {
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

/**
 * An inner provider whose creates are recorded and settle when the test says.
 * A label in `throwing` makes its create throw that value synchronously.
 */
function fakeProvider(
  name = "fake",
  throwing: ReadonlyMap<string, unknown> = new Map(),
) {
  const creates: Call<Spec, EvaluationJob>[] = [];
  const provider: EvaluationProvider = {
    name,
    create(spec) {
      const result = deferred<EvaluationJob>();
      creates.push({ args: spec, result });
      if (throwing.has(spec.label)) throw throwing.get(spec.label);
      return result.promise;
    },
  };
  const labels = () => creates.map((entry) => entry.args.label);
  /** Resolves the inner create for `label` with a fresh fake job. */
  const open = (
    label: string,
    id = `job-${label}`,
    environment?: EvaluationEnvironment,
  ): FakeJob => {
    const inner = fakeJob(id, environment);
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
  assert.equal(created.outcome.state, "pending", created.label);
  assert.ok(!fake.labels().includes(created.label), created.label);
}

/**
 * Waits for a promise by letting pending promises run a bounded number of
 * times, so a promise that never settles fails the test instead of hanging it.
 */
async function settled<T>(promise: Promise<T>): Promise<T> {
  const outcome = track(promise);
  for (let round = 0; round < 50 && outcome.state === "pending"; round += 1) {
    await settle();
  }
  if (outcome.state === "fulfilled") return outcome.value as T;
  if (outcome.state === "rejected") throw outcome.reason;
  assert.fail("expected the promise to settle");
}

async function rejectsWith(promise: Promise<unknown>, expected: unknown) {
  await assert.rejects(settled(promise), (error: unknown) => {
    assert.equal(error, expected);
    return true;
  });
}

/** Runs `next` straight after `promise` settles, as code after `await promise` would. */
function straightAfter(promise: Promise<unknown>, next: () => void) {
  promise.then(next, next);
}

/** Resolves an admitted create's inner create and returns both jobs. */
async function take(fake: Fake, created: Created) {
  const inner = fake.open(created.label);
  const job = await settled(created.promise);
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
  await settled(done);
  await settle();
}

const labelsOf = (count: number, prefix = "j") =>
  Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);

const okResult: EvaluationExecResult = {
  exitCode: 0,
  timedOut: false,
  outputTruncated: false,
  stdout: "ok",
  stderr: "",
  durationMs: 5,
};

// --- @happy -----------------------------------------------------------------

// Extends public "[happy-1] EVALUATION_JOBS_MAX is 2".
test("[happy-1] EVALUATION_JOBS_MAX is the number 2 and is accepted as a max", async () => {
  assert.equal(typeof EVALUATION_JOBS_MAX, "number");
  assert.equal(EVALUATION_JOBS_MAX, 2);
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, EVALUATION_JOBS_MAX);
  assert.equal(limited.name, "fake");
  await settle();
  assert.equal(fake.creates.length, 0);
});

// Extends public "[happy-1] a provider limited to EVALUATION_JOBS_MAX admits two creates and queues the third".
test("[happy-1] a provider limited to EVALUATION_JOBS_MAX keeps two of six creates live as jobs come and go", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, EVALUATION_JOBS_MAX);
  const created = labelsOf(6).map((label) => create(limited, label));
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  for (const entry of created.slice(2)) assertWaiting(fake, entry);
  await release(await take(fake, nth(created, 0)));
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3"]);
  for (const entry of created.slice(3)) assertWaiting(fake, entry);
});

// Extends public "[happy-2] the limited provider keeps the name and is a new object".
test("[happy-2] another inner name passes through and the inner create is not called", async () => {
  const fake = fakeProvider("local-process");
  const limited = limitJobs(fake.provider, 3);
  assert.equal(limited.name, "local-process");
  assert.notEqual(limited, fake.provider);
  await settle();
  assert.equal(fake.creates.length, 0);
});

// Extends public "[happy-2] an empty inner name passes through as it is".
test("[happy-2] a name with spaces and symbols passes through two wrappings", async () => {
  const fake = fakeProvider("remote pool #2 / é");
  const once = limitJobs(fake.provider, 2);
  const twice = limitJobs(once, 1);
  assert.equal(once.name, "remote pool #2 / é");
  assert.equal(twice.name, "remote pool #2 / é");
  assert.notEqual(twice, once);
  assert.notEqual(twice, fake.provider);
  await settle();
  assert.equal(fake.creates.length, 0);
});

// Extends public "[happy-3] a create under the cap reaches the inner provider with the same label and signal".
test("[happy-3] three creates under a cap of three each reach the inner provider with their own label and signal", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 3);
  const controllers = [
    new AbortController(),
    new AbortController(),
    new AbortController(),
  ];
  const labels = ["sbv_7", "sbv_8/run", "sbv_9"];
  labels.forEach((label, index) =>
    create(limited, label, nth(controllers, index).signal),
  );
  await settle();
  assert.equal(fake.creates.length, 3);
  labels.forEach((label, index) => {
    const spec = nth(fake.creates, index).args;
    assert.equal(spec.label, label);
    assert.equal(spec.signal, nth(controllers, index).signal);
  });
});

// Extends public "[happy-3] with max 1 the single free slot passes an odd label and its signal straight through".
test("[happy-3] an empty label and its signal pass straight through a free slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const c = new AbortController();
  create(limited, "", c.signal);
  await settle();
  assert.equal(fake.creates.length, 1);
  const spec = nth(fake.creates, 0).args;
  assert.equal(spec.label, "");
  assert.equal(spec.signal, c.signal);
});

// Extends public "[happy-4] the limited job forwards stage, exec and read and keeps the inner id and environment".
test("[happy-4] two limited jobs each forward to their own inner job and keep its id and environment", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const a = create(limited, "a");
  const b = create(limited, "b");
  await settle();
  const envA: EvaluationEnvironment = {
    provider: "remote",
    environmentId: "env-a",
    templateDigest: "sha256:aa",
  };
  const envB: EvaluationEnvironment = {
    provider: "remote",
    environmentId: "env-b",
    templateDigest: null,
  };
  const innerB = fake.open("b", "sandbox-eval-b-2", envB);
  const innerA = fake.open("a", "sandbox-eval-a-1", envA);
  const jobA = await settled(a.promise);
  const jobB = await settled(b.promise);
  assert.equal(jobA.id, "sandbox-eval-a-1");
  assert.equal(jobB.id, "sandbox-eval-b-2");
  assert.equal(jobA.environment, envA);
  assert.equal(jobB.environment, envB);
  assert.notEqual(jobA, innerA.job);
  assert.notEqual(jobB, innerB.job);

  const files = [
    { path: "src/index.ts", text: "export {}" },
    { path: "package.json", text: "{}" },
  ];
  const staged = jobB.stage(files);
  await settle();
  assert.equal(innerA.stage.length, 0);
  assert.equal(innerB.stage.length, 1);
  assert.equal(nth(innerB.stage, 0).args, files);
  nth(innerB.stage, 0).result.resolve();
  assert.equal(await settled(staged), undefined);

  const command = { argv: ["npm", "ci"] };
  const ran = jobA.exec(command);
  await settle();
  assert.equal(innerB.exec.length, 0);
  assert.equal(nth(innerA.exec, 0).args, command);
  const failed: EvaluationExecResult = {
    exitCode: 1,
    timedOut: true,
    outputTruncated: true,
    stdout: "",
    stderr: "boom",
    durationMs: 600000,
  };
  nth(innerA.exec, 0).result.resolve(failed);
  assert.equal(await settled(ran), failed);

  const text = jobA.read("package-lock.json");
  await settle();
  assert.equal(innerB.read.length, 0);
  assert.equal(nth(innerA.read, 0).args, "package-lock.json");
  nth(innerA.read, 0).result.resolve('{"lockfileVersion":3}');
  assert.equal(await settled(text), '{"lockfileVersion":3}');
});

// Extends public "[happy-4] an empty staged list, a null exit code and an empty file text forward unchanged".
test("[happy-4] overlapping calls on one job forward each and settle out of order with their own results", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const { job, inner } = await hold(fake, limited, "x");

  const first = { argv: ["npm", "ci"], limits: { timeoutMs: 1, maxOutputBytes: 2 } };
  const second = { argv: ["npm", "test"], cwd: "a/b" };
  const ranFirst = job.exec(first);
  const ranSecond = job.exec(second);
  const readA = job.read("a.txt");
  const readB = job.read("b.txt");
  await settle();
  assert.equal(inner.exec.length, 2);
  assert.equal(nth(inner.exec, 0).args, first);
  assert.equal(nth(inner.exec, 1).args, second);
  assert.equal(nth(inner.read, 0).args, "a.txt");
  assert.equal(nth(inner.read, 1).args, "b.txt");
  const resultSecond = { ...okResult, stdout: "second" };
  const resultFirst = { ...okResult, stdout: "first", exitCode: 2 };
  nth(inner.exec, 1).result.resolve(resultSecond);
  nth(inner.read, 1).result.resolve(null);
  assert.equal(await settled(ranSecond), resultSecond);
  assert.equal(await settled(readB), null);
  nth(inner.exec, 0).result.resolve(resultFirst);
  nth(inner.read, 0).result.resolve("A");
  assert.equal(await settled(ranFirst), resultFirst);
  assert.equal(await settled(readA), "A");
});

// Extends public "[happy-5] destroy forwards to the inner job once and resolves with undefined".
test("[happy-5] destroy stays pending until the inner destroy resolves, then resolves with undefined", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const { job, inner } = await hold(fake, limited, "j1");
  const done = track(job.destroy());
  await settleMany(5);
  assert.equal(inner.destroy.length, 1);
  assert.equal(done.state, "pending");
  nth(inner.destroy, 0).resolve();
  await settle();
  assert.equal(done.state, "fulfilled");
  assert.equal(done.value, undefined);
  assert.equal(inner.destroy.length, 1);
});

// Extends public "[happy-5] destroying one of two live jobs calls only that job's inner destroy".
test("[happy-5] destroying the middle of three live jobs, then the last, calls only those jobs' inner destroys", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 3);
  const first = await hold(fake, limited, "j1");
  const second = await hold(fake, limited, "j2");
  const third = await hold(fake, limited, "j3");
  const done = second.job.destroy();
  await settle();
  assert.equal(first.inner.destroy.length, 0);
  assert.equal(second.inner.destroy.length, 1);
  assert.equal(third.inner.destroy.length, 0);
  nth(second.inner.destroy, 0).resolve();
  assert.equal(await settled(done), undefined);
  const last = third.job.destroy();
  await settle();
  assert.equal(first.inner.destroy.length, 0);
  assert.equal(second.inner.destroy.length, 1);
  assert.equal(third.inner.destroy.length, 1);
  nth(third.inner.destroy, 0).resolve();
  assert.equal(await settled(last), undefined);
});

// --- @unhappy ---------------------------------------------------------------

function assertInvalidMax(values: readonly number[]) {
  return async () => {
    for (const max of values) {
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
  };
}

// Extends public "[unhappy-1] an invalid max throws a RangeError synchronously".
test(
  "[unhappy-1] whole numbers beyond the safe range throw a RangeError",
  assertInvalidMax([
    9007199254740993,
    9007199254740994,
    2 ** 60,
    1e21,
    Number.MAX_VALUE,
  ]),
);

// Extends public "[unhappy-1] negative zero and the smallest positive fraction are rejected too".
test(
  "[unhappy-1] other fractions and negative whole numbers throw a RangeError",
  assertInvalidMax([
    0.5,
    0.999,
    2.5,
    1 + Number.EPSILON,
    Number.EPSILON,
    -2,
    -9007199254740991,
  ]),
);

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

// Extends public "[unhappy-2] a failing stage, exec or read passes its error through and keeps the slot".
test("[unhappy-2] non-Error failures of stage, exec and read pass through unchanged with max 2 and two waiters", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const a = await hold(fake, limited, "A");
  await hold(fake, limited, "B");
  const c = create(limited, "C");
  const d = create(limited, "D");
  await settle();
  const failures: [Forwarded, unknown][] = [
    ["stage", "stage failed"],
    ["exec", { code: "EXEC" }],
    ["read", new TypeError("read failed")],
  ];
  for (const [call, failure] of failures) {
    const pending = invoke(a.job, call);
    await settle();
    lastCall(a.inner, call).reject(failure);
    await rejectsWith(pending, failure);
    await settle();
    assertWaiting(fake, c);
    assertWaiting(fake, d);
    assert.equal(fake.creates.length, 2, call);
  }
});

// Extends public "[unhappy-2] after a forwarded call fails, destroy still hands the slot to the waiter".
test("[unhappy-2] after stage, exec and read all fail, the job keeps one slot and destroy frees only that one", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const a = await hold(fake, limited, "A");
  await hold(fake, limited, "B");
  const w1 = create(limited, "W1");
  const w2 = create(limited, "W2");
  for (const call of ["stage", "exec", "read"] as const) {
    const failure = new Error(`${call} failed`);
    const pending = invoke(a.job, call);
    await settle();
    lastCall(a.inner, call).reject(failure);
    await rejectsWith(pending, failure);
  }
  await settle();
  assertWaiting(fake, w1);
  await release(a);
  assert.deepEqual(fake.labels(), ["A", "B", "W1"]);
  assertWaiting(fake, w2);
});

// Extends public "[unhappy-3] an inner create that rejects passes its error through and frees its slot".
test("[unhappy-3] with max 2 the second admitted create rejecting admits the oldest waiter and leaves the first alone", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const j1 = create(limited, "j1");
  const j2 = create(limited, "j2");
  create(limited, "j3");
  const j4 = create(limited, "j4");
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  const failure = new Error("quota exceeded");
  nth(fake.creates, 1).result.reject(failure);
  await rejectsWith(j2.promise, failure);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3"]);
  assert.equal(j1.outcome.state, "pending");
  assertWaiting(fake, j4);
});

// Extends public "[unhappy-3] a rejected inner create frees exactly one slot for two waiters".
test("[unhappy-3] a cascade of rejected inner creates hands the one slot down the queue, each error passing through", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const created = labelsOf(4).map((label) => create(limited, label));
  await settle();
  const reasons: unknown[] = ["first down", { n: 2 }, new RangeError("third")];
  for (let index = 0; index < reasons.length; index += 1) {
    assert.deepEqual(fake.labels(), labelsOf(index + 1));
    nth(fake.creates, index).result.reject(reasons[index]);
    await rejectsWith(nth(created, index).promise, reasons[index]);
    await settle();
  }
  assert.deepEqual(fake.labels(), labelsOf(4));
  assert.equal(nth(created, 3).outcome.state, "pending");
});

// Extends public "[unhappy-3] an inner create that rejects passes its error through and frees its slot".
test("[unhappy-3] a rejected inner create with nobody waiting leaves exactly one slot free for later creates", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = create(limited, "j1");
  await settle();
  const failure = new Error("provider down");
  nth(fake.creates, 0).result.reject(failure);
  await rejectsWith(j1.promise, failure);
  await settle();
  create(limited, "k1");
  const k2 = create(limited, "k2");
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "k1"]);
  assertWaiting(fake, k2);
});

// Extends public "[unhappy-4] a synchronous throw hands the slot to a create already waiting".
test("[unhappy-4] a waiter whose inner create throws synchronously when admitted rejects and passes the slot on", async () => {
  const failure = new Error("thrown on admission");
  const fake = fakeProvider("fake", new Map([["j2", failure]]));
  const limited = limitJobs(fake.provider, 1);
  const j1 = create(limited, "j1");
  const j2 = create(limited, "j2");
  const j3 = create(limited, "j3");
  const j4 = create(limited, "j4");
  await settle();
  assert.deepEqual(fake.labels(), ["j1"]);
  await release(await take(fake, j1));
  await rejectsWith(j2.promise, failure);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3"]);
  assert.equal(j3.outcome.state, "pending");
  assertWaiting(fake, j4);
});

// Extends public "[unhappy-4] an inner create that throws synchronously is a rejection that frees the slot".
test("[unhappy-4] a synchronous throw of a non-Error value with another job live returns a rejected promise and frees its slot", async () => {
  const thrown = "plain string thrown";
  const fake = fakeProvider("fake", new Map([["j2", thrown]]));
  const limited = limitJobs(fake.provider, 2);
  create(limited, "j1");
  await settle();
  let second: Promise<EvaluationJob> | undefined;
  assert.doesNotThrow(() => {
    second = limited.create({
      label: "j2",
      signal: new AbortController().signal,
    });
  });
  assert.ok(second !== undefined);
  await rejectsWith(second, thrown);
  create(limited, "j3");
  const j4 = create(limited, "j4");
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3"]);
  assertWaiting(fake, j4);
});

// Extends public "[unhappy-5] an abort the inner create rejects on passes its reason through and frees the slot".
test("[unhappy-5] with max 2 an aborted admitted create passes a string reason through and admits only the oldest waiter", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const c = new AbortController();
  const j1 = create(limited, "j1", c.signal);
  const j2 = create(limited, "j2");
  create(limited, "j3");
  const j4 = create(limited, "j4");
  await settle();
  const reason = "cancelled by user";
  c.abort(reason);
  nth(fake.creates, 0).result.reject(reason);
  await rejectsWith(j1.promise, reason);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3"]);
  assert.equal(j2.outcome.state, "pending");
  assertWaiting(fake, j4);
});

// Extends public "[unhappy-5] when the waiter shares the aborted signal both reject with its reason and the slot is free".
test("[unhappy-5] two admitted creates and a waiter sharing one aborted signal all reject and both slots come free", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const c = new AbortController();
  const j1 = create(limited, "j1", c.signal);
  const j2 = create(limited, "j2", c.signal);
  const j3 = create(limited, "j3", c.signal);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  const reason = { aborted: "shutdown" };
  c.abort(reason);
  nth(fake.creates, 1).result.reject(reason);
  nth(fake.creates, 0).result.reject(reason);
  await rejectsWith(j1.promise, reason);
  await rejectsWith(j2.promise, reason);
  await rejectsWith(j3.promise, reason);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  create(limited, "j4");
  create(limited, "j5");
  const j6 = create(limited, "j6");
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2", "j4", "j5"]);
  assertWaiting(fake, j6);
});

// Extends public "[unhappy-6] a signal already aborted at call time rejects with its reason even with a slot free".
test("[unhappy-6] a signal already aborted at call time rejects at once when every slot is taken and takes no place in the queue", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  const c = new AbortController();
  const full = new Error("full and gone");
  c.abort(full);
  const j2 = create(limited, "j2", c.signal);
  await rejectsWith(j2.promise, full);
  const j3 = create(limited, "j3");
  await settle();
  assertWaiting(fake, j3);
  await release(j1);
  assert.deepEqual(fake.labels(), ["j1", "j3"]);
});

// Extends public "[unhappy-6] an already aborted signal without a given reason rejects with signal.reason and takes no slot".
test("[unhappy-6] several creates with already aborted signals each reject with their own reason and consume no slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const reasons: unknown[] = ["text reason", { code: 7 }, new Error("e"), 42];
  const rejected = reasons.map((reason, index) => {
    const c = new AbortController();
    c.abort(reason);
    return create(limited, `x${index}`, c.signal);
  });
  const plain = new AbortController();
  plain.abort();
  const lastAborted = create(limited, "x4", plain.signal);
  for (let index = 0; index < reasons.length; index += 1) {
    await rejectsWith(nth(rejected, index).promise, reasons[index]);
  }
  await rejectsWith(lastAborted.promise, plain.signal.reason);
  await settle();
  assert.equal(fake.creates.length, 0);
  create(limited, "k1");
  const k2 = create(limited, "k2");
  await settle();
  assert.deepEqual(fake.labels(), ["k1"]);
  assertWaiting(fake, k2);
});

// Extends public "[unhappy-7] an inner destroy that rejects passes its error through and still frees the slot".
test("[unhappy-7] an inner destroy rejecting with a non-Error value and nobody waiting leaves exactly one slot free", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  const failure = { teardown: "failed" };
  const done = j1.job.destroy();
  await settle();
  nth(j1.inner.destroy, 0).reject(failure);
  await rejectsWith(done, failure);
  await settle();
  create(limited, "k1");
  const k2 = create(limited, "k2");
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "k1"]);
  assertWaiting(fake, k2);
});

// Extends public "[unhappy-7] a rejected inner destroy frees exactly one slot for two waiters".
test("[unhappy-7] with max 2 a rejected inner destroy of the second job admits only the oldest of three waiters", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const j1 = await hold(fake, limited, "j1");
  const j2 = await hold(fake, limited, "j2");
  create(limited, "j3");
  const j4 = create(limited, "j4");
  const j5 = create(limited, "j5");
  await settle();
  const failure = new Error("teardown failed");
  const done = j2.job.destroy();
  await settle();
  nth(j2.inner.destroy, 0).reject(failure);
  await rejectsWith(done, failure);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3"]);
  assertWaiting(fake, j4);
  assertWaiting(fake, j5);
  assert.equal(j1.inner.destroy.length, 0);
});

// --- @boundary --------------------------------------------------------------

// Extends public "[boundary-1] max 1 and Number.MAX_SAFE_INTEGER are accepted".
test("[boundary-1] other positive safe integers up to one below the largest are accepted", async () => {
  for (const max of [2, 3, 1000, 9007199254740990]) {
    const fake = fakeProvider();
    let limited: EvaluationProvider | undefined;
    assert.doesNotThrow(() => {
      limited = limitJobs(fake.provider, max);
    });
    assert.ok(limited !== undefined);
    assert.equal(limited.name, "fake");
    assert.equal(typeof limited.create, "function");
    await settle();
    assert.equal(fake.creates.length, 0, `max ${max}`);
  }
});

// Extends public "[boundary-1] max 1 admits one create and Number.MAX_SAFE_INTEGER admits every create".
test("[boundary-1] Number.MAX_SAFE_INTEGER admits two hundred creates in call order", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, Number.MAX_SAFE_INTEGER);
  const labels = labelsOf(200);
  for (const label of labels) create(limited, label);
  await settle();
  assert.deepEqual(fake.labels(), labels);
});

// Extends public "[boundary-2] an abort after admission leaves the job holding its slot".
test("[boundary-2] an abort after a waiter was admitted leaves the other waiters queued in order", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j0 = await hold(fake, limited, "j0");
  const c = new AbortController();
  const j1 = create(limited, "j1", c.signal);
  const j2 = create(limited, "j2");
  const j3 = create(limited, "j3");
  await settle();
  await release(j0);
  assert.deepEqual(fake.labels(), ["j0", "j1"]);
  c.abort(new Error("late"));
  await settle();
  assert.equal(j1.outcome.state, "pending");
  assertWaiting(fake, j2);
  assertWaiting(fake, j3);
  await release(await take(fake, j1));
  assert.deepEqual(fake.labels(), ["j0", "j1", "j2"]);
  assertWaiting(fake, j3);
  await release(await take(fake, j2));
  assert.deepEqual(fake.labels(), ["j0", "j1", "j2", "j3"]);
});

// Extends public "[boundary-2] an abort while the admitted inner create is pending is left for the inner create to answer".
test("[boundary-2] an admitted create holds no abort listener on its signal, whether admitted at once or from the queue", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const c1 = new AbortController();
  const j1 = create(limited, "j1", c1.signal);
  await settle();
  assert.deepEqual(fake.labels(), ["j1"]);
  assert.equal(getEventListeners(c1.signal, "abort").length, 0);
  const c2 = new AbortController();
  const j2 = create(limited, "j2", c2.signal);
  await settle();
  await release(await take(fake, j1));
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assert.equal(getEventListeners(c2.signal, "abort").length, 0);
  c2.abort(new Error("late"));
  await settle();
  assert.equal(j2.outcome.state, "pending");
});

// Extends public "[boundary-2] an abort after admission leaves the job holding its slot".
test("[boundary-2] with max 2 an abort shared by both admitted jobs leaves both slots held", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const c = new AbortController();
  const j1 = await hold(fake, limited, "j1", c.signal);
  await hold(fake, limited, "j2", c.signal);
  c.abort(new Error("late"));
  await settle();
  const j3 = create(limited, "j3");
  const j4 = create(limited, "j4");
  await settle();
  assertWaiting(fake, j3);
  assertWaiting(fake, j4);
  await release(j1);
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3"]);
  assertWaiting(fake, j4);
});

// Extends public "[boundary-3] destroying the same job twice forwards both and frees only one slot".
test("[boundary-3] destroying the same job three times forwards all three and frees only one slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  create(limited, "j2");
  const j3 = create(limited, "j3");
  const j4 = create(limited, "j4");
  await release(j1);
  await release(j1);
  await release(j1);
  assert.equal(j1.inner.destroy.length, 3);
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assertWaiting(fake, j3);
  assertWaiting(fake, j4);
});

// Extends public "[boundary-3] destroying the same job twice forwards both and frees only one slot".
test("[boundary-3] with max 2 destroying one job twice does not free the other job's slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const j1 = await hold(fake, limited, "j1");
  const j2 = await hold(fake, limited, "j2");
  create(limited, "j3");
  const j4 = create(limited, "j4");
  const j5 = create(limited, "j5");
  await settle();
  await release(j1);
  await release(j1);
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3"]);
  assertWaiting(fake, j4);
  assertWaiting(fake, j5);
  await release(j2);
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3", "j4"]);
  assertWaiting(fake, j5);
});

// Extends public "[boundary-3] a second destroy whose inner destroy rejects passes the error through and frees nothing more".
test("[boundary-3] a first destroy that rejects frees the slot and a second that resolves frees nothing more", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  create(limited, "j2");
  const j3 = create(limited, "j3");
  const failure = new Error("first teardown failed");
  const first = j1.job.destroy();
  await settle();
  nth(j1.inner.destroy, 0).reject(failure);
  await rejectsWith(first, failure);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  const second = j1.job.destroy();
  await settle();
  assert.equal(j1.inner.destroy.length, 2);
  nth(j1.inner.destroy, 1).resolve();
  assert.equal(await settled(second), undefined);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assertWaiting(fake, j3);
});

// Extends public "[boundary-4] a job that is never destroyed keeps its slot".
test("[boundary-4] with max 3, two jobs never destroyed and one create never resolved keep all three slots", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 3);
  await hold(fake, limited, "j1");
  await hold(fake, limited, "j2");
  const j3 = create(limited, "j3");
  const j4 = create(limited, "j4");
  await settleMany(30);
  assert.equal(j3.outcome.state, "pending");
  assertWaiting(fake, j4);
  assert.equal(fake.creates.length, 3);
});

// Extends public "[boundary-4] jobs never destroyed keep every slot however long the queue waits".
test("[boundary-4] a job never destroyed keeps its slot while the other slot turns over", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  await hold(fake, limited, "j1");
  const j2 = await hold(fake, limited, "j2");
  const j3 = create(limited, "j3");
  const j4 = create(limited, "j4");
  const j5 = create(limited, "j5");
  await settle();
  await release(j2);
  await release(await take(fake, j3));
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3", "j4"]);
  await take(fake, j4);
  await settleMany(20);
  assertWaiting(fake, j5);
});

// Extends public "[boundary-5] read still forwards after destroy".
test("[boundary-5] read and exec still forward after a destroy that rejected, without touching any slot", async () => {
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

  const text = j1.job.read("out/report.json");
  await settle();
  assert.equal(nth(j1.inner.read, 0).args, "out/report.json");
  nth(j1.inner.read, 0).result.resolve("{}");
  assert.equal(await settled(text), "{}");

  const command = { argv: ["npm", "test"] };
  const ran = j1.job.exec(command);
  await settle();
  assert.equal(nth(j1.inner.exec, 0).args, command);
  const execFailure = new Error("sandbox gone");
  nth(j1.inner.exec, 0).result.reject(execFailure);
  await rejectsWith(ran, execFailure);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assertWaiting(fake, j3);
});

// Extends public "[boundary-5] stage and exec still forward after destroy, results and errors unchanged".
test("[boundary-5] stage and read still forward after the job was destroyed twice", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  await release(j1);
  await release(j1);

  const files: StagedFile[] = [{ path: "c.txt", text: "c" }];
  const staged = j1.job.stage(files);
  await settle();
  assert.equal(j1.inner.stage.length, 1);
  assert.equal(nth(j1.inner.stage, 0).args, files);
  nth(j1.inner.stage, 0).result.resolve();
  assert.equal(await settled(staged), undefined);

  const text = j1.job.read("missing.txt");
  await settle();
  assert.equal(nth(j1.inner.read, 0).args, "missing.txt");
  nth(j1.inner.read, 0).result.resolve(null);
  assert.equal(await settled(text), null);
});

// --- @concurrency -----------------------------------------------------------

// Extends public "[concurrency-1] only max creates reach the inner provider at once".
test("[concurrency-1] only max creates reach the inner provider at once, for more caps and longer bursts", async () => {
  const rows = [
    { max: 1, calls: 10 },
    { max: 4, calls: 9 },
    { max: 5, calls: 12 },
    { max: 7, calls: 7 },
    { max: 10, calls: 3 },
  ];
  for (const row of rows) {
    const fake = fakeProvider();
    const limited = limitJobs(fake.provider, row.max);
    const created = labelsOf(row.calls).map((label) => create(limited, label));
    await settle();
    const admitted = Math.min(row.max, row.calls);
    assert.deepEqual(fake.labels(), labelsOf(admitted), `max ${row.max}`);
    const waiting = created.filter(
      (entry) =>
        entry.outcome.state === "pending" &&
        !fake.labels().includes(entry.label),
    );
    assert.equal(waiting.length, row.calls - admitted, `max ${row.max}`);
  }
});

// Extends public "[concurrency-1] exactly max creates are all admitted and the next one waits".
test("[concurrency-1] creates arriving in separate bursts are admitted up to max in call order", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 3);
  create(limited, "j1");
  create(limited, "j2");
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  create(limited, "j3");
  const j4 = create(limited, "j4");
  const j5 = create(limited, "j5");
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3"]);
  assertWaiting(fake, j4);
  assertWaiting(fake, j5);
});

// Extends public "[concurrency-2] a slot is held until destroy settles, not until create resolves".
test("[concurrency-2] with max 1 failed calls and a long-pending destroy keep the slot until the destroy settles", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  const j2 = create(limited, "j2");
  const staged = j1.job.stage([]);
  const ran = j1.job.exec({ argv: ["npm", "test"] });
  const read = j1.job.read("a.txt");
  await settle();
  const failure = new Error("failed");
  nth(j1.inner.stage, 0).result.reject(failure);
  await rejectsWith(staged, failure);
  nth(j1.inner.exec, 0).result.resolve(okResult);
  await settled(ran);
  nth(j1.inner.read, 0).result.reject(failure);
  await rejectsWith(read, failure);
  await settle();
  assertWaiting(fake, j2);
  const done = j1.job.destroy();
  await settleMany(10);
  assertWaiting(fake, j2);
  assert.equal(fake.creates.length, 1);
  nth(j1.inner.destroy, 0).resolve();
  await settled(done);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
});

// Extends public "[concurrency-2] a slot is held from admission while the inner create is still pending".
test("[concurrency-2] with max 3 each of two pending destroys frees its slot only when it settles", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 3);
  const j1 = await hold(fake, limited, "j1");
  const j2 = await hold(fake, limited, "j2");
  await hold(fake, limited, "j3");
  const j4 = create(limited, "j4");
  const j5 = create(limited, "j5");
  const first = track(j1.job.destroy());
  const second = j2.job.destroy();
  await settleMany(5);
  assert.equal(fake.creates.length, 3);
  nth(j2.inner.destroy, 0).resolve();
  await settled(second);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3", "j4"]);
  assert.equal(first.state, "pending");
  assertWaiting(fake, j5);
  nth(j1.inner.destroy, 0).resolve();
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3", "j4", "j5"]);
  assert.equal(j4.outcome.state, "pending");
});

// Extends public "[concurrency-3] waiting creates are admitted in the order they were called".
test("[concurrency-3] eight waiters are admitted in call order, with their own signals, whichever job frees a slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const live: Held[] = [
    await hold(fake, limited, "j1"),
    await hold(fake, limited, "j2"),
  ];
  const signals = new Map<string, AbortSignal>();
  const waiting = new Map<string, Created>();
  for (let index = 3; index <= 10; index += 1) {
    const label = `j${index}`;
    const c = new AbortController();
    signals.set(label, c.signal);
    waiting.set(label, create(limited, label, c.signal));
  }
  await settle();
  for (let index = 3; index <= 10; index += 1) {
    const [freed] = live.splice(index % live.length, 1);
    assert.ok(freed !== undefined);
    await release(freed);
    assert.deepEqual(fake.labels(), labelsOf(index));
    const next = waiting.get(`j${index}`);
    assert.ok(next !== undefined);
    live.push(await take(fake, next));
  }
  for (let index = 3; index <= 10; index += 1) {
    const spec = nth(fake.creates, index - 1).args;
    assert.equal(spec.signal, signals.get(spec.label));
  }
});

// Extends public "[concurrency-3] the oldest waiter is admitted whichever live job frees its slot".
test("[concurrency-3] waiters called between releases still join the back of the queue", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  const j2 = create(limited, "j2");
  const j3 = create(limited, "j3");
  await settle();
  await release(j1);
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  const j4 = create(limited, "j4");
  await release(await take(fake, j2));
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3"]);
  const j5 = create(limited, "j5");
  await release(await take(fake, j3));
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3", "j4"]);
  assertWaiting(fake, j5);
  await release(await take(fake, j4));
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3", "j4", "j5"]);
});

// Extends public "[concurrency-4] a freed slot goes to the oldest waiter, not a create called right after it frees".
test("[concurrency-4] a slot freed by a rejected destroy goes to the oldest waiter, not a create called right after", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  create(limited, "j2");
  await settle();
  const failure = new Error("teardown failed");
  const done = j1.job.destroy();
  await settle();
  const later: { j3?: Created } = {};
  straightAfter(done, () => {
    later.j3 = create(limited, "j3");
  });
  nth(j1.inner.destroy, 0).reject(failure);
  await rejectsWith(done, failure);
  await settle();
  const j3 = later.j3;
  assert.ok(j3 !== undefined);
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assertWaiting(fake, j3);
});

// Extends public "[concurrency-4] a freed slot goes to the oldest waiter, not a create called right after it frees".
test("[concurrency-4] with max 2 a create called right after a destroy queues behind the remaining waiter", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const j1 = await hold(fake, limited, "j1");
  const j2 = await hold(fake, limited, "j2");
  create(limited, "j3");
  const j4 = create(limited, "j4");
  await settle();
  const done = j1.job.destroy();
  await settle();
  const later: { j5?: Created } = {};
  straightAfter(done, () => {
    later.j5 = create(limited, "j5");
  });
  nth(j1.inner.destroy, 0).resolve();
  await settled(done);
  await settle();
  const j5 = later.j5;
  assert.ok(j5 !== undefined);
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3"]);
  assertWaiting(fake, j4);
  assertWaiting(fake, j5);
  await release(j2);
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3", "j4"]);
  assertWaiting(fake, j5);
});

// Extends public "[concurrency-4] a slot freed by a failed create goes to the oldest waiter, not a create called right after".
test("[concurrency-4] after an aborted waiter left, a freed slot goes to the next waiter, not a create called right after", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  const c = new AbortController();
  const j2 = create(limited, "j2", c.signal);
  create(limited, "j3");
  await settle();
  const stop = new Error("stop");
  c.abort(stop);
  await rejectsWith(j2.promise, stop);
  const done = j1.job.destroy();
  await settle();
  const later: { j4?: Created } = {};
  straightAfter(done, () => {
    later.j4 = create(limited, "j4");
  });
  nth(j1.inner.destroy, 0).resolve();
  await settled(done);
  await settle();
  const j4 = later.j4;
  assert.ok(j4 !== undefined);
  assert.deepEqual(fake.labels(), ["j1", "j3"]);
  assertWaiting(fake, j4);
});

// Extends public "[concurrency-5] each destroy frees exactly one slot".
test("[concurrency-5] three destroys together with five waiters admit exactly the three oldest", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 3);
  const held = [
    await hold(fake, limited, "j1"),
    await hold(fake, limited, "j2"),
    await hold(fake, limited, "j3"),
  ];
  const waiting = ["j4", "j5", "j6", "j7", "j8"].map((label) =>
    create(limited, label),
  );
  await settle();
  await Promise.all(held.map(release));
  assert.deepEqual(fake.labels(), labelsOf(6));
  assertWaiting(fake, nth(waiting, 3));
  assertWaiting(fake, nth(waiting, 4));
});

// Extends public "[concurrency-5] two destroys with one waiter admit it and leave one slot free".
test("[concurrency-5] two destroys together, one rejecting and one resolving, each free exactly one slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const j1 = await hold(fake, limited, "j1");
  const j2 = await hold(fake, limited, "j2");
  create(limited, "j3");
  create(limited, "j4");
  const j5 = create(limited, "j5");
  await settle();
  const first = j1.job.destroy();
  const second = j2.job.destroy();
  await settle();
  const failure = new Error("teardown failed");
  nth(j1.inner.destroy, 0).reject(failure);
  nth(j2.inner.destroy, 0).resolve();
  await rejectsWith(first, failure);
  await settled(second);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3", "j4"]);
  assertWaiting(fake, j5);
});

// Extends public "[concurrency-6] a waiter whose signal aborts rejects with its reason and leaves the queue".
test("[concurrency-6] a waiter in the middle of the queue aborts and the others keep their order", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  const c = new AbortController();
  const j2 = create(limited, "j2");
  const j3 = create(limited, "j3", c.signal);
  const j4 = create(limited, "j4");
  await settle();
  const stop = new Error("stop");
  c.abort(stop);
  await rejectsWith(j3.promise, stop);
  await settle();
  assertWaiting(fake, j2);
  assertWaiting(fake, j4);
  await release(j1);
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  await release(await take(fake, j2));
  assert.deepEqual(fake.labels(), ["j1", "j2", "j4"]);
  assert.equal(j4.outcome.state, "pending");
});

// Extends public "[concurrency-6] when the only waiter aborts, the freed slot stays free for a later create".
test("[concurrency-6] all waiters sharing one signal leave together and the freed slot is free exactly once", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  const c = new AbortController();
  const waiting = ["j2", "j3", "j4"].map((label) =>
    create(limited, label, c.signal),
  );
  await settle();
  const reason = { stop: "shutdown" };
  c.abort(reason);
  for (const entry of waiting) await rejectsWith(entry.promise, reason);
  await release(j1);
  assert.deepEqual(fake.labels(), ["j1"]);
  create(limited, "k1");
  const k2 = create(limited, "k2");
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "k1"]);
  assertWaiting(fake, k2);
});

// Extends public "[concurrency-6] a waiter whose signal aborts rejects with its reason and leaves the queue".
test("[concurrency-6] a waiter aborted without a reason rejects with signal.reason and leaves no listener behind", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  const c = new AbortController();
  const j2 = create(limited, "j2", c.signal);
  const j3 = create(limited, "j3");
  await settle();
  c.abort();
  await rejectsWith(j2.promise, c.signal.reason);
  await settle();
  assert.equal(getEventListeners(c.signal, "abort").length, 0);
  assertWaiting(fake, j3);
  await release(j1);
  assert.deepEqual(fake.labels(), ["j1", "j3"]);
});

// Extends public "[concurrency-7] two overlapping destroys of the same job free only one slot".
test("[concurrency-7] three overlapping destroys settling in reverse order free only one slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  create(limited, "j2");
  const j3 = create(limited, "j3");
  const destroys = [j1.job.destroy(), j1.job.destroy(), j1.job.destroy()];
  await settle();
  assert.equal(j1.inner.destroy.length, 3);
  nth(j1.inner.destroy, 2).resolve();
  nth(j1.inner.destroy, 1).resolve();
  nth(j1.inner.destroy, 0).resolve();
  assert.deepEqual(await settled(Promise.all(destroys)), [
    undefined,
    undefined,
    undefined,
  ]);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assertWaiting(fake, j3);
});

// Extends public "[concurrency-7] of two overlapping destroys, whichever settles first frees the slot".
test("[concurrency-7] of two overlapping destroys, a first that rejects frees the slot and the later resolve frees nothing", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const j1 = await hold(fake, limited, "j1");
  create(limited, "j2");
  const j3 = create(limited, "j3");
  const first = j1.job.destroy();
  const second = track(j1.job.destroy());
  await settle();
  const failure = new Error("teardown failed");
  nth(j1.inner.destroy, 0).reject(failure);
  await rejectsWith(first, failure);
  await settle();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assert.equal(second.state, "pending");
  nth(j1.inner.destroy, 1).resolve();
  await settle();
  assert.equal(second.state, "fulfilled");
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assertWaiting(fake, j3);
});

// Extends public "[concurrency-8] two limited providers over the same inner provider do not share slots".
test("[concurrency-8] three limited providers over one inner provider each admit up to their own max", async () => {
  const fake = fakeProvider();
  const l1 = limitJobs(fake.provider, 1);
  const l2 = limitJobs(fake.provider, 2);
  const l3 = limitJobs(fake.provider, 3);
  const created: Created[] = [];
  for (let index = 1; index <= 4; index += 1) {
    created.push(create(l1, `a${index}`));
    created.push(create(l2, `b${index}`));
    created.push(create(l3, `c${index}`));
  }
  await settle();
  assert.deepEqual(fake.labels(), ["a1", "b1", "c1", "b2", "c2", "c3"]);
  const waiting = created.filter((entry) => !fake.labels().includes(entry.label));
  assert.equal(waiting.length, 6);
  for (const entry of waiting) assertWaiting(fake, entry);
});

// Extends public "[concurrency-8] a slot freed in one limited provider does not admit the other's waiter".
test("[concurrency-8] a slot freed in one limited provider admits its own waiter and not the other's", async () => {
  const fake = fakeProvider();
  const l1 = limitJobs(fake.provider, 2);
  const l2 = limitJobs(fake.provider, 1);
  await hold(fake, l1, "a1");
  const a2 = await hold(fake, l1, "a2");
  const b1 = await hold(fake, l2, "b1");
  const a3 = create(l1, "a3");
  const b2 = create(l2, "b2");
  await settle();
  await release(b1);
  assert.deepEqual(fake.labels(), ["a1", "a2", "b1", "b2"]);
  assertWaiting(fake, a3);
  await release(a2);
  assert.deepEqual(fake.labels(), ["a1", "a2", "b1", "b2", "a3"]);
  assert.equal(b2.outcome.state, "pending");
});

// Extends public "[concurrency-9] wrapping a limited provider again applies the tighter cap".
test("[concurrency-9] three wrappings apply the tightest cap and a destroy through them frees every level", async () => {
  const fake = fakeProvider();
  const l1 = limitJobs(fake.provider, 3);
  const l2 = limitJobs(l1, 2);
  const l3 = limitJobs(l2, 1);
  const j1 = create(l3, "j1");
  const j2 = create(l3, "j2");
  const j3 = create(l3, "j3");
  await settle();
  assert.deepEqual(fake.labels(), ["j1"]);
  assertWaiting(fake, j2);
  const held = await take(fake, j1);
  assert.equal(held.job.id, "job-j1");
  await release(held);
  assert.equal(held.inner.destroy.length, 1);
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assertWaiting(fake, j3);
});

// Extends public "[concurrency-9] a looser outer cap over a tighter inner one is held to the inner cap".
test("[concurrency-9] creates made directly on the inner limited provider count against its cap too", async () => {
  const fake = fakeProvider();
  const l1 = limitJobs(fake.provider, 2);
  const l2 = limitJobs(l1, 1);
  await hold(fake, l1, "k1");
  create(l2, "j1");
  const j2 = create(l2, "j2");
  await settle();
  assert.deepEqual(fake.labels(), ["k1", "j1"]);
  assertWaiting(fake, j2);
  const k2 = create(l1, "k2");
  await settle();
  assertWaiting(fake, k2);
  assert.equal(fake.creates.length, 2);
});
