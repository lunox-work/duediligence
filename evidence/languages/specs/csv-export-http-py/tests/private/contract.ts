// The types of src/server.ts in the TypeScript spec (evidence/seams/specs/csv-export-http/),
// moved here so the suites compile against a service in any language.
/** A requisition status: one of "open", "on_hold", "filled" or "cancelled". */
export type RequisitionStatus = "open" | "on_hold" | "filled" | "cancelled";

/**
 * A requisition, an item of the `POST /requisitions.csv` request body: an
 * object with "id" (a string), "title" (a string, or null or absent when
 * missing), "status", "openings", "filled" and "createdAt" ("YYYY-MM-DDTHH:MM:SSZ",
 * with optional fractional seconds after the seconds and an offset "+HH:MM"
 * or "-HH:MM" in place of "Z").
 */
export interface Requisition {
  id: string;
  title?: string | null;
  status: RequisitionStatus;
  openings: number;
  filled: number;
  createdAt: string;
}

/** The `POST /requisitions.csv` request body: an array of requisitions. */
export type RequisitionsCsvRequest = Requisition[];

/** The 422 body: a message and the id of the first bad requisition in the request's order. */
export interface UnprocessableRequisitionError {
  error: string;
  id: string;
}

/** The 400 body: a message. */
export interface BadRequestError {
  error: string;
}
