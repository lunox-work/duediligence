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
  const run = dayNumber(runDate);
  const byId = new Map<string, RetentionRecord>();
  for (const r of records) byId.set(r.id, r);

  for (const r of records) {
    const created = dayNumber(r.created);
    if (created > run) {
      throw new Error(`record ${r.id} was created after the run date`);
    }
    if (r.lastAccessed != null) {
      const accessed = dayNumber(r.lastAccessed);
      if (accessed < created) {
        throw new Error(`record ${r.id} was last accessed before it was created`);
      }
      if (accessed > run) {
        throw new Error(`record ${r.id} was last accessed after the run date`);
      }
    }
    if (r.parentId != null && !byId.has(r.parentId)) {
      throw new Error(`record ${r.id} has parent ${r.parentId}, which is not among the records`);
    }
  }

  const decided = new Map<string, RecordDecision>();
  const visiting = new Set<string>();

  function decide(r: RetentionRecord): RecordDecision {
    const known = decided.get(r.id);
    if (known) return known;
    if (visiting.has(r.id)) {
      throw new Error(`record ${r.id} is its own ancestor`);
    }
    visiting.add(r.id);
    const result = decideOwn(r);
    visiting.delete(r.id);
    decided.set(r.id, result);
    return result;
  }

  function decideOwn(r: RetentionRecord): RecordDecision {
    const id = r.id;
    if (r.holds.length > 0) {
      const first = [...r.holds].sort()[0];
      return { id, decision: "keep", reason: `hold:${first}` };
    }
    const category = Object.hasOwn(policy.categories, r.category)
      ? policy.categories[r.category]
      : undefined;
    if (!category) return { id, decision: "keep", reason: "no policy" };
    if (r.parentId != null) {
      const parent = decide(byId.get(r.parentId)!);
      if (parent.decision === "keep") {
        return { id, decision: "keep", reason: `parent:${r.parentId}` };
      }
    }

    const from =
      category.fromLastAccess && r.lastAccessed != null ? r.lastAccessed : r.created;
    const age = run - dayNumber(from);
    let period = category.periodDays;
    for (const m of policy.regions) {
      if (m.region === r.region && m.minimumDays > period) period = m.minimumDays;
    }
    if (age < period) return { id, decision: "keep", reason: "within period" };
    if (age < period + policy.graceDays) {
      return { id, decision: "flag", reason: "expired" };
    }
    return { id, decision: "delete", reason: "expired" };
  }

  return records.map(decide);
}

/** Whole days from 1970-01-01 to a "YYYY-MM-DD" date. */
function dayNumber(date: IsoDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}
