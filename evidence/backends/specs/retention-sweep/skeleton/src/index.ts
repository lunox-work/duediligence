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
  throw new Error("not implemented");
}
