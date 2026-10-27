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

/**
 * Whether the digest is due: true during Monday in the organization's time zone.
 * Throws an error naming the time zone when it is unknown.
 */
export function isDigestDue(timeZone: string, now: Date): boolean {
  throw new Error("not implemented");
}

/**
 * Builds the weekly digest of open tasks; merged tasks are not listed.
 * Returns null when no task is open: there is no digest at all, rather than an empty one.
 * Throws an error naming the time zone when it is unknown.
 */
export function buildDigest(input: DigestInput): Digest | null {
  throw new Error("not implemented");
}
