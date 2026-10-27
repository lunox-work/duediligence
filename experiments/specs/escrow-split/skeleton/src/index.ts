/** The kinds of gate event delivered for a task. */
export type EscrowEventKind =
  | "hidden-tests-passed"
  | "hidden-tests-failed"
  | "uat-approved";

/** An event for the task, delivered by the payment worker at least once. */
export interface EscrowEvent {
  id: string;
  kind: EscrowEventKind;
}

/** A task whose bounty is locked in escrow when it is posted. */
export interface EscrowTask {
  /** The bounty in whole minor units, at least 0. */
  bounty: number;
  /** The hidden-test share in basis points, from 0 to 10000; by default 7500. */
  hiddenTestShareBps?: number;
}

/** Where the task's escrow stands. */
export type EscrowStatus =
  | "locked"
  | "partially released"
  | "fully released"
  | "pro bono";

/** Which gate a release was for: the hidden-test share or the rest, with UAT. */
export type ReleaseKind = "hidden-tests" | "uat";

/** A recorded release of money to the contributor. */
export interface Release {
  kind: ReleaseKind;
  /** The amount released, in whole minor units. */
  amount: number;
}

/** The task's escrow as recorded in the store. */
export interface EscrowState {
  status: EscrowStatus;
  /** Every release recorded so far, in the order recorded. */
  releases: Release[];
}

/**
 * The store the caller supplies. `get` resolves to `undefined` when nothing
 * has been saved yet.
 */
export interface EscrowStore {
  get(): Promise<EscrowState | undefined>;
  set(state: EscrowState): Promise<void>;
}

/** The two amounts a bounty is released in; they always add up to the bounty. */
export interface BountySplit {
  /** The hidden-test release, rounded down. */
  hiddenTests: number;
  /** The UAT release: the rest of the bounty. */
  uat: number;
}

/** Handles gate events for one task over the caller's store. */
export interface EscrowHandler {
  /**
   * Handles one event and resolves to the task's escrow afterwards. Money
   * moves once: a repeated event, or the same event delivered twice at the
   * same time, records nothing more.
   *
   * Rejects with an error saying the hidden tests have not passed when
   * "uat-approved" is handled before the hidden-test share was released.
   * Rejects with the store's error when the store rejects; nothing is
   * recorded and the same event can be handled again.
   */
  handle(event: EscrowEvent): Promise<EscrowState>;
}

/**
 * Splits a bounty into the hidden-test release (the share, rounded down) and
 * the UAT release (the rest), exact for any bounty up to
 * Number.MAX_SAFE_INTEGER.
 */
export function splitBounty(bounty: number, hiddenTestShareBps: number): BountySplit {
  throw new Error("not implemented");
}

/** Creates the event handler that releases the task's escrow on gate events. */
export function createEscrowHandler(task: EscrowTask, store: EscrowStore): EscrowHandler {
  throw new Error("not implemented");
}
