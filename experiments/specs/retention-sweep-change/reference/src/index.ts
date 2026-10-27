/** A date as "YYYY-MM-DD". */
export type IsoDate = string;

/** A record the sweep considers for deletion. */
export interface RetentionRecord {
  id: string;
  category: string;
  created: IsoDate;
  /** The last-accessed date; absent or null when the record was never accessed. */
  lastAccessed?: IsoDate | null;
  /** Names of the holds on the record; an empty list is no hold. */
  holds: string[];
  region: string;
  /** The id of the parent record; absent or null when the record has no parent. */
  parentId?: string | null;
}

/** A category's retention period in days and whether it is counted from last access. */
export interface CategoryPolicy {
  periodDays: number;
  fromLastAccess: boolean;
}

/** A region with a minimum period in days. */
export interface RegionMinimum {
  region: string;
  minimumDays: number;
}

/** The retention policy: per-category periods, regional minimums, and a grace period. */
export interface RetentionPolicy {
  /** Keyed by category name. */
  categories: Record<string, CategoryPolicy>;
  regions: RegionMinimum[];
  graceDays: number;
}

/** What the sweep decides for a record. */
export type Decision = "keep" | "flag" | "delete";

/** Why the sweep decided as it did. */
export type Reason =
  | "within period"
  | "expired"
  | "no policy"
  | `hold:${string}`
  | `parent:${string}`;

/** The sweep's decision for one record, with a reason. */
export interface RecordDecision {
  id: string;
  decision: Decision;
  reason: Reason;
}

/**
 * Decides, for each record in input order, whether it is kept, flagged or
 * deleted on the run date under the policy.
 *
 * Throws an Error naming the record's id when a record was created after the
 * run date, last accessed before it was created or after the run date, or
 * has a parent id that is not among the records.
 */
export function sweep(
  records: RetentionRecord[],
  policy: RetentionPolicy,
  runDate: IsoDate,
): RecordDecision[] {
  const run = dayNumber(runDate, "run date");
  const byId = new Map<string, RetentionRecord>();
  for (const rec of records) byId.set(rec.id, rec);

  for (const rec of records) {
    const created = dayNumber(rec.created, `record ${rec.id}`);
    if (created > run) {
      throw new Error(`record ${rec.id} was created after the run date`);
    }
    if (rec.lastAccessed != null) {
      const accessed = dayNumber(rec.lastAccessed, `record ${rec.id}`);
      if (accessed < created) {
        throw new Error(`record ${rec.id} was last accessed before it was created`);
      }
      if (accessed > run) {
        throw new Error(`record ${rec.id} was last accessed after the run date`);
      }
    }
    if (rec.parentId != null && !byId.has(rec.parentId)) {
      throw new Error(`record ${rec.id} has parent ${rec.parentId}, which is not among the records`);
    }
  }

  const own = records.map((rec) => ownDecision(rec, policy, run));

  // Records kept on their own account pass keeping down to every descendant.
  const children = new Map<string, number[]>();
  records.forEach((rec, i) => {
    if (rec.parentId == null) return;
    const list = children.get(rec.parentId) ?? [];
    list.push(i);
    children.set(rec.parentId, list);
  });
  const result = own.slice();
  const overridable = (d: RecordDecision) =>
    !d.reason.startsWith("hold:") && d.reason !== "no policy";
  const queue: string[] = [];
  const queued = new Set<string>();
  records.forEach((rec, i) => {
    if (own[i].decision === "keep" && !queued.has(rec.id)) {
      queued.add(rec.id);
      queue.push(rec.id);
    }
  });
  for (let q = 0; q < queue.length; q++) {
    const parentId = queue[q];
    for (const i of children.get(parentId) ?? []) {
      const child = records[i];
      if (overridable(result[i])) {
        result[i] = { id: child.id, decision: "keep", reason: `parent:${parentId}` };
      }
      if (!queued.has(child.id)) {
        queued.add(child.id);
        queue.push(child.id);
      }
    }
  }
  return result;
}

/** The decision for a record on its own holds, policy and age, ignoring its parent. */
function ownDecision(
  rec: RetentionRecord,
  policy: RetentionPolicy,
  run: number,
): RecordDecision {
  if (rec.holds.length > 0) {
    const first = [...rec.holds].sort()[0];
    return { id: rec.id, decision: "keep", reason: `hold:${first}` };
  }
  if (!Object.hasOwn(policy.categories, rec.category)) {
    return { id: rec.id, decision: "keep", reason: "no policy" };
  }
  const category = policy.categories[rec.category];
  const created = dayNumber(rec.created, `record ${rec.id}`);
  const counted =
    category.fromLastAccess && rec.lastAccessed != null
      ? dayNumber(rec.lastAccessed, `record ${rec.id}`)
      : created;
  let expiry = counted + category.periodDays;
  for (const region of policy.regions) {
    if (region.region === rec.region) {
      expiry = Math.max(expiry, created + region.minimumDays);
    }
  }
  if (run < expiry) return { id: rec.id, decision: "keep", reason: "within period" };
  if (run < expiry + policy.graceDays) {
    return { id: rec.id, decision: "flag", reason: "expired" };
  }
  return { id: rec.id, decision: "delete", reason: "expired" };
}

const MS_PER_DAY = 86_400_000;

/** Whole days since 1970-01-01 for a "YYYY-MM-DD" date. */
function dayNumber(date: IsoDate, what: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const d = new Date(0);
    d.setUTCFullYear(year, month - 1, day);
    if (d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day) {
      return Math.round(d.getTime() / MS_PER_DAY);
    }
  }
  throw new Error(`${what} has an invalid date: ${JSON.stringify(date)}`);
}
