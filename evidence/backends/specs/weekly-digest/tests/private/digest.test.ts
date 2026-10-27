import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest, type Digest, type Task } from "../../src/index.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-06T12:00:00Z");

function ago(duration: number, now = NOW): Date {
  return new Date(now - duration);
}

function task(id: string, overrides: Partial<Omit<Task, "id">> = {}): Task {
  return {
    id, title: `Title ${id}`, status: "open", postedAt: ago(DAY), submissions: [],
    ...overrides,
  };
}

function digestFor(tasks: Task[], now = NOW, timeZone = "Asia/Singapore"): Digest {
  const digest = buildDigest({ timeZone, tasks, now: new Date(now) });
  assert.notEqual(digest, null, "An open task produces a digest");
  return digest!;
}

// Extends public "an open task retains its identity and reports age, count and maximum gate".
test("[happy-2] several distinct tasks retain long titles and calculate their own state", () => {
  const title = "Review 東京 🛠 — " + "details ".repeat(100);
  const digest = digestFor([
    task("single-gate", {
      title, postedAt: ago(123 * DAY + 12 * 3_600_000),
      submissions: [{ at: ago(3 * DAY), gate: 1 }],
    }),
    task("high-gate", {
      title: "Different title", postedAt: ago(45 * DAY),
      submissions: [
        { at: ago(15 * DAY), gate: 1 }, { at: ago(16 * DAY), gate: 3 },
        { at: ago(17 * DAY), gate: 2 }, { at: ago(18 * DAY), gate: 1 },
      ],
    }),
    task("middle-gate", {
      postedAt: ago(7 * DAY), submissions: [{ at: ago(2 * DAY), gate: 2 }],
    }),
  ]);
  assert.equal(digest.tasks.length, 3);
  const entries = new Map(digest.tasks.map((entry) => [entry.id, entry]));
  assert.deepEqual(entries.get("single-gate"), {
    id: "single-gate", title, ageDays: 123, submissions: 1, furthestGate: 1, stalled: false,
  });
  assert.deepEqual(entries.get("high-gate"), {
    id: "high-gate", title: "Different title", ageDays: 45, submissions: 4, furthestGate: 3, stalled: true,
  });
  assert.deepEqual(entries.get("middle-gate"), {
    id: "middle-gate", title: "Title middle-gate", ageDays: 7, submissions: 1, furthestGate: 2, stalled: false,
  });
});

// Extends public "an unsubmitted open task has gate zero and merged tasks are omitted".
test("[happy-2] interleaved merged tasks cannot leak counts or gates into unsubmitted open tasks", () => {
  const tasks: Task[] = [];
  for (let index = 0; index < 20; index++) {
    tasks.push(task(`merged-${index}`, {
      status: "merged", postedAt: ago(200 * DAY),
      submissions: [{ at: ago(DAY), gate: 3 }],
    }));
    tasks.push(task(`open-${index}`, { postedAt: ago((index + 1) * DAY) }));
  }
  const digest = digestFor(tasks);
  assert.equal(digest.tasks.length, 20);
  assert.deepEqual(new Set(digest.tasks.map((entry) => entry.id)),
    new Set(Array.from({ length: 20 }, (_, index) => `open-${index}`)));
  for (const entry of digest.tasks) {
    assert.equal(entry.submissions, 0);
    assert.equal(entry.furthestGate, 0);
  }
});

// Extends public "gate three is retained and submissions sharing a time are all counted".
test("[happy-2] hundreds of equal-time submissions count separately with the maximum buried inside", () => {
  const submissions: Task["submissions"] = Array.from({ length: 257 }, (_, index) => ({
    at: ago(2 * DAY), gate: index === 137 ? 3 : 1,
  }));
  const digest = digestFor([
    task("many", { postedAt: ago(11 * DAY), submissions }),
    task("twos", {
      postedAt: ago(8 * DAY),
      submissions: Array.from({ length: 17 }, () => ({ at: ago(DAY), gate: 2 })),
    }),
  ]);
  const entries = new Map(digest.tasks.map((entry) => [entry.id, entry]));
  assert.equal(entries.get("many")!.submissions, 257);
  assert.equal(entries.get("many")!.furthestGate, 3);
  assert.equal(entries.get("twos")!.submissions, 17);
  assert.equal(entries.get("twos")!.furthestGate, 2);
});

// Extends public "age floors nine days and twenty-three hours but includes ten whole days".
test("[boundary-2] ages floor milliseconds at several thresholds including very old tasks", () => {
  const cases = [
    [0, 0], [1, 0], [DAY - 1, 0], [DAY, 1], [DAY + 1, 1],
    [7 * DAY - 1, 6], [7 * DAY, 7], [7 * DAY + 1, 7],
    [366 * DAY - 1, 365], [366 * DAY, 366], [1000 * DAY + DAY - 1, 1000],
  ];
  const digest = digestFor(cases.map(([elapsed], index) => task(`age-${index}`, {
    postedAt: ago(elapsed!),
  })));
  const ages = new Map(digest.tasks.map((entry) => [entry.id, entry.ageDays]));
  cases.forEach(([, expected], index) => assert.equal(ages.get(`age-${index}`), expected));
});

// Extends public "age crosses a whole-day threshold by elapsed time across daylight saving".
test("[boundary-2] matching local clock times across short and long DST days use elapsed hours", () => {
  for (const [nowText, postedText, expected] of [
    ["2026-03-09T04:30:00Z", "2026-03-08T05:30:00Z", 0],
    ["2026-11-02T05:30:00Z", "2026-11-01T04:30:00Z", 1],
  ] as const) {
    const digest = digestFor([task("local-midnight", { postedAt: new Date(postedText) })],
      Date.parse(nowText), "America/New_York");
    assert.equal(digest.tasks[0]!.ageDays, expected);
  }
});

// Extends public "age crosses a whole-day threshold by elapsed time across daylight saving".
test("[boundary-2] changing the organization zone cannot change whole-period ages", () => {
  for (const zone of ["UTC", "America/New_York", "Europe/London", "Asia/Kathmandu"]) {
    const digest = digestFor([
      task("partial", { postedAt: ago(37 * DAY + 23 * 3_600_000) }),
      task("exact", { postedAt: ago(38 * DAY) }),
    ], NOW, zone);
    const ages = new Map(digest.tasks.map((entry) => [entry.id, entry.ageDays]));
    assert.equal(ages.get("partial"), 37);
    assert.equal(ages.get("exact"), 38);
  }
});

// Extends public "exactly fourteen days stalls both unsubmitted and submitted tasks".
test("[boundary-3] inactivity beyond fourteen days remains stalled for both activity sources", () => {
  for (const inactivity of [14 * DAY + 1, 15 * DAY, 365 * DAY]) {
    const digest = digestFor([
      task("posting", { postedAt: ago(inactivity) }),
      task("submission", {
        postedAt: ago(1000 * DAY), submissions: [{ at: ago(inactivity), gate: 3 }],
      }),
    ]);
    assert.equal(digest.tasks.length, 2);
    for (const entry of digest.tasks) assert.equal(entry.stalled, true, entry.id);
  }
});

// Extends public "less than fourteen days of inactivity does not stall a task".
test("[boundary-3] fresh activity and a just-under-threshold submission override very old postings", () => {
  const tasks: Task[] = [task("just-posted", { postedAt: new Date(NOW) })];
  for (const [index, elapsed] of [0, 1, 7 * DAY, 14 * DAY - 1].entries()) {
    tasks.push(task(`fresh-${index}`, {
      postedAt: ago(500 * DAY), submissions: [{ at: ago(elapsed), gate: 1 }],
    }));
  }
  const digest = digestFor(tasks);
  assert.equal(digest.tasks.length, 5);
  for (const entry of digest.tasks) assert.equal(entry.stalled, false, entry.id);
});

// Extends public "the latest submission refreshes an old task regardless of array order or gate".
test("[boundary-3] all permutations use the latest timestamp even when its gate is lowest", () => {
  const submissions: Task["submissions"] = [
    { at: ago(40 * DAY), gate: 3 },
    { at: ago(DAY), gate: 1 },
    { at: ago(20 * DAY), gate: 2 },
  ];
  const permutations = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const digest = digestFor(permutations.map((order, index) => task(`permutation-${index}`, {
    postedAt: ago(80 * DAY), submissions: order.map((position) => submissions[position]!),
  })));
  assert.equal(digest.tasks.length, 6);
  for (const entry of digest.tasks) {
    assert.equal(entry.stalled, false);
    assert.equal(entry.furthestGate, 3);
    assert.equal(entry.submissions, 3);
  }
});

// Extends public "the latest submission refreshes an old task regardless of array order or gate".
test("[boundary-3] a latest submission at the threshold is stalled despite multiple older submissions", () => {
  const digest = digestFor([
    task("threshold", {
      postedAt: ago(100 * DAY), submissions: [
        { at: ago(20 * DAY), gate: 3 }, { at: ago(14 * DAY), gate: 1 },
        { at: ago(30 * DAY), gate: 2 },
      ],
    }),
    task("recent-neighbor", {
      postedAt: ago(100 * DAY), submissions: [{ at: ago(1), gate: 3 }],
    }),
    task("no-activity", { postedAt: ago(100 * DAY) }),
  ]);
  const stalled = new Map(digest.tasks.map((entry) => [entry.id, entry.stalled]));
  assert.equal(stalled.get("threshold"), true);
  assert.equal(stalled.get("recent-neighbor"), false);
  assert.equal(stalled.get("no-activity"), true);
});

// Extends public "exactly fourteen days stalls both unsubmitted and submitted tasks"
// and "less than fourteen days of inactivity does not stall a task".
test("[boundary-3] DST transitions do not alter the fourteen elapsed-day cutoff", () => {
  for (const nowText of ["2026-03-09T04:30:00Z", "2026-11-02T05:30:00Z"]) {
    const now = Date.parse(nowText);
    const tasks: Task[] = [];
    for (const offset of [-1, 0, 1]) {
      const last = ago(14 * DAY + offset, now);
      tasks.push(task(`posting-${offset}`, { postedAt: last }));
      tasks.push(task(`submission-${offset}`, {
        postedAt: ago(60 * DAY, now), submissions: [{ at: last, gate: 2 }],
      }));
    }
    const digest = digestFor(tasks, now, "America/New_York");
    const entries = new Map(digest.tasks.map((entry) => [entry.id, entry.stalled]));
    for (const offset of [-1, 0, 1]) {
      assert.equal(entries.get(`posting-${offset}`), offset >= 0);
      assert.equal(entries.get(`submission-${offset}`), offset >= 0);
    }
  }
});

// Extends public "stalled tasks precede active tasks and each group sorts older tasks first".
test("[happy-3] larger reversed and rotated inputs sort by group and posting age rather than inactivity", () => {
  const tasks: Task[] = [];
  const expected: string[] = [];
  for (const stalled of [true, false]) {
    for (const age of [90, 70, 50, 30, 20, 14]) {
      const id = `${stalled ? "stalled" : "active"}-${age}`;
      expected.push(id);
      tasks.push(task(id, {
        postedAt: ago(age * DAY),
        submissions: [{ at: ago((stalled ? 14 : 1) * DAY), gate: 1 }],
      }));
    }
  }
  const reversed = [...tasks].reverse();
  const rotated = [...tasks.slice(5), ...tasks.slice(0, 5)];
  for (const input of [reversed, rotated]) {
    assert.deepEqual(digestFor(input).tasks.map((entry) => entry.id), expected);
  }
});

// Extends public "equal-age tasks sort by id within both stalled and active groups".
test("[happy-3] id ordering resolves larger exact-age ties independently in both groups", () => {
  const ids = ["echo", "alpha", "foxtrot", "delta", "bravo", "charlie"];
  const tasks = ids.flatMap((id) => [
    task(`active-${id}`, {
      postedAt: ago(40 * DAY), submissions: [{ at: ago(DAY), gate: 1 }],
    }),
    task(`stalled-${id}`, { postedAt: ago(40 * DAY) }),
  ]);
  assert.deepEqual(digestFor(tasks).tasks.map((entry) => entry.id), [
    "stalled-alpha", "stalled-bravo", "stalled-charlie", "stalled-delta", "stalled-echo", "stalled-foxtrot",
    "active-alpha", "active-bravo", "active-charlie", "active-delta", "active-echo", "active-foxtrot",
  ]);
});

// Extends public "stalled tasks precede active tasks and each group sorts older tasks first"
// and "equal-age tasks sort by id within both stalled and active groups".
test("[happy-3] mixed age tiers and id ties obey all three ordering priorities together", () => {
  const digest = digestFor([
    task("a-active-young", { postedAt: ago(DAY) }),
    task("z-stalled-young", { postedAt: ago(14 * DAY) }),
    task("b-active-old", { postedAt: ago(90 * DAY), submissions: [{ at: ago(DAY), gate: 1 }] }),
    task("b-stalled-old", { postedAt: ago(40 * DAY) }),
    task("a-active-old", { postedAt: ago(90 * DAY), submissions: [{ at: ago(2 * DAY), gate: 3 }] }),
    task("a-stalled-old", { postedAt: ago(40 * DAY) }),
    task("merged-oldest", { postedAt: ago(500 * DAY), status: "merged" }),
  ]);
  assert.deepEqual(digest.tasks.map((entry) => entry.id), [
    "a-stalled-old", "b-stalled-old", "z-stalled-young",
    "a-active-old", "b-active-old", "a-active-young",
  ]);
});

// Extends public "the subject counts five open tasks and two stalled tasks".
test("[happy-4] subject counts multi-digit open and stalled totals while excluding merged tasks", () => {
  const tasks = Array.from({ length: 37 }, (_, index) => task(`count-${index}`, {
    postedAt: ago((index < 12 ? 20 : 2) * DAY),
  }));
  tasks.push(...Array.from({ length: 15 }, (_, index) => task(`merged-${index}`, {
    status: "merged", postedAt: ago(100 * DAY),
  })));
  assert.equal(digestFor(tasks).subject, "Weekly digest: 37 open tasks, 12 stalled");
});

// Extends public "the subject uses singular task and includes zero or one stalled".
test("[happy-4] plural subjects cover zero one and all stalled tasks", () => {
  for (const stalledCount of [0, 1, 2]) {
    const digest = digestFor(Array.from({ length: 2 }, (_, index) => task(`pair-${index}`, {
      postedAt: ago((index < stalledCount ? 14 : 1) * DAY),
    })));
    assert.equal(digest.subject, `Weekly digest: 2 open tasks, ${stalledCount} stalled`);
  }
});

// Extends public "the subject uses singular task and includes zero or one stalled".
test("[happy-4] singular subject depends on filtered open count and refreshed activity", () => {
  const merged = Array.from({ length: 9 }, (_, index) => task(`merged-${index}`, {
    status: "merged", postedAt: ago(100 * DAY),
  }));
  const active = task("only-open", {
    postedAt: ago(80 * DAY), submissions: [{ at: ago(DAY), gate: 1 }],
  });
  assert.equal(digestFor([...merged, active]).subject, "Weekly digest: 1 open task, 0 stalled");
  assert.equal(digestFor([task("only-open", { postedAt: ago(80 * DAY) }), ...merged]).subject,
    "Weekly digest: 1 open task, 1 stalled");
});

// Extends public "the subject counts five open tasks and two stalled tasks".
test("[happy-4] subject totals use computed activity rather than only posting age", () => {
  const digest = digestFor([
    task("refreshed-a", { postedAt: ago(90 * DAY), submissions: [{ at: ago(DAY), gate: 1 }] }),
    task("refreshed-b", { postedAt: ago(80 * DAY), submissions: [{ at: ago(2 * DAY), gate: 2 }] }),
    task("idle", { postedAt: ago(60 * DAY), submissions: [{ at: ago(30 * DAY), gate: 3 }] }),
    task("new", { postedAt: ago(DAY) }),
  ]);
  assert.equal(digest.subject, "Weekly digest: 4 open tasks, 1 stalled");
});

// Extends public "an empty task list produces no digest".
test("[unhappy-1] empty task lists produce null in several valid organization zones", () => {
  for (const zone of ["UTC", "America/New_York", "Asia/Kathmandu", "Europe/London"]) {
    assert.equal(buildDigest({ timeZone: zone, now: new Date("2026-11-02T12:00:00Z"), tasks: [] }), null);
  }
});

// Extends public "tasks that are all merged produce no digest".
test("[unhappy-1] many merged tasks spanning activity states still produce null", () => {
  const tasks = Array.from({ length: 64 }, (_, index) => task(`merged-${index}`, {
    status: "merged", postedAt: ago((index + 1) * DAY),
    submissions: index % 3 === 0 ? [] : [
      { at: ago((index + 0.5) * DAY), gate: 3 },
      { at: ago(index % 2 === 0 ? 1 : 3_600_000), gate: 1 },
    ],
  }));
  assert.equal(buildDigest({ timeZone: "America/New_York", now: new Date(NOW), tasks }), null);
});
