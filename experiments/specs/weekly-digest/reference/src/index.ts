/** A task's status: "open" or "merged". */
export type TaskStatus = "open" | "merged";

/** A gate a submission can reach: 1, 2 or 3. */
export type Gate = 1 | 2 | 3;

/** The furthest gate reached across a task's submissions; 0 when it has none. */
export type FurthestGate = 0 | Gate;

/** A submission to a task: its time and the furthest gate it reached. */
export interface Submission {
  at: Date;
  gate: Gate;
}

/** A posted task with its id, title, status, posting time and submissions. */
export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  postedAt: Date;
  submissions: Submission[];
}

/** What the digest is built from: the organization's time zone, its tasks, and "now" as given by the caller. */
export interface DigestInput {
  /** An IANA time zone name such as "Asia/Singapore" or "America/New_York". */
  timeZone: string;
  tasks: Task[];
  now: Date;
}

/** An open task as listed in the digest, with its state. */
export interface DigestEntry {
  id: string;
  title: string;
  /** Age in whole 24-hour periods since the task was posted. */
  ageDays: number;
  /** Number of submissions. */
  submissions: number;
  furthestGate: FurthestGate;
  /** True when the latest submission, or the posting if there is none, is 14 days or more before now. */
  stalled: boolean;
}

/** The weekly digest of open tasks. */
export interface Digest {
  /** For example "Weekly digest: 5 open tasks, 2 stalled". */
  subject: string;
  /** Stalled tasks first, then the others; within each group, older tasks first, then by id. */
  tasks: DigestEntry[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const STALL_DAYS = 14;

/** Returns a formatter giving the weekday in the time zone; throws an error naming the zone when it is unknown. */
function weekdayFormatter(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" });
  } catch {
    throw new RangeError(`Unknown time zone: ${timeZone}`);
  }
}

/**
 * Whether the digest is due: true during Monday in the organization's time zone.
 * Throws an error naming the time zone when it is unknown.
 */
export function isDigestDue(timeZone: string, now: Date): boolean {
  return weekdayFormatter(timeZone).format(now) === "Mon";
}

function toEntry(task: Task, now: number): DigestEntry {
  let latest = task.postedAt.getTime();
  let furthestGate: FurthestGate = 0;
  if (task.submissions.length > 0) {
    latest = -Infinity;
    for (const s of task.submissions) {
      latest = Math.max(latest, s.at.getTime());
      if (s.gate > furthestGate) furthestGate = s.gate;
    }
  }
  return {
    id: task.id,
    title: task.title,
    ageDays: Math.floor((now - task.postedAt.getTime()) / DAY_MS),
    submissions: task.submissions.length,
    furthestGate,
    stalled: now - latest >= STALL_DAYS * DAY_MS,
  };
}

/**
 * Builds the weekly digest of open tasks; merged tasks are not listed.
 * Returns null when no task is open: there is no digest at all, rather than an empty one.
 * Throws an error naming the time zone when it is unknown.
 */
export function buildDigest(input: DigestInput): Digest | null {
  weekdayFormatter(input.timeZone);
  const now = input.now.getTime();
  const open = input.tasks.filter((t) => t.status === "open");
  if (open.length === 0) return null;

  const entries = open
    .map((task) => ({ posted: task.postedAt.getTime(), entry: toEntry(task, now) }))
    .sort(
      (a, b) =>
        Number(b.entry.stalled) - Number(a.entry.stalled) ||
        a.posted - b.posted ||
        (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0),
    )
    .map(({ entry }) => entry);

  const stalled = entries.filter((e) => e.stalled).length;
  const noun = entries.length === 1 ? "task" : "tasks";
  return {
    subject: `Weekly digest: ${entries.length} open ${noun}, ${stalled} stalled`,
    tasks: entries,
  };
}
