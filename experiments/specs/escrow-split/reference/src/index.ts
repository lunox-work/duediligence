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
  checkBounty(bounty);
  checkShare(hiddenTestShareBps);
  // Integer arithmetic: bounty * bps exceeds Number.MAX_SAFE_INTEGER for large bounties.
  const hiddenTests = (BigInt(bounty) * BigInt(hiddenTestShareBps)) / BigInt(BPS_WHOLE);
  return { hiddenTests: Number(hiddenTests), uat: Number(BigInt(bounty) - hiddenTests) };
}

/** Creates the event handler that releases the task's escrow on gate events. */
export function createEscrowHandler(task: EscrowTask, store: EscrowStore): EscrowHandler {
  const split = splitBounty(task.bounty, task.hiddenTestShareBps ?? DEFAULT_SHARE_BPS);
  const initial = (): EscrowState => ({ status: task.bounty === 0 ? "pro bono" : "locked", releases: [] });

  async function apply(event: EscrowEvent): Promise<EscrowState> {
    const saved = await store.get();
    // Copy what the store hands out so nothing it holds changes without a save.
    const current: EscrowState =
      saved === undefined
        ? initial()
        : { status: saved.status, releases: saved.releases.map((release) => ({ ...release })) };
    const released = (kind: ReleaseKind) => current.releases.some((release) => release.kind === kind);

    let next: EscrowState | undefined;
    switch (event.kind) {
      case "hidden-tests-failed":
        break;
      case "hidden-tests-passed":
        if (current.status !== "pro bono" && !released("hidden-tests")) {
          next = {
            status: "partially released",
            releases: [...current.releases, { kind: "hidden-tests", amount: split.hiddenTests }],
          };
        }
        break;
      case "uat-approved":
        if (current.status === "pro bono" || released("uat")) break;
        if (!released("hidden-tests")) {
          throw new Error("UAT approval refused: the hidden tests have not passed");
        }
        next = {
          status: "fully released",
          releases: [...current.releases, { kind: "uat", amount: split.uat }],
        };
        break;
      default:
        throw new Error(`unknown escrow event kind: ${String((event as EscrowEvent).kind)}`);
    }

    if (next === undefined) return current;
    await store.set(next);
    return { status: next.status, releases: next.releases.map((release) => ({ ...release })) };
  }

  return {
    handle(event: EscrowEvent): Promise<EscrowState> {
      // One event at a time per store: each reads the state the previous one saved.
      const previous = queues.get(store) ?? Promise.resolve();
      const result = previous.then(() => apply(event));
      queues.set(
        store,
        result.then(
          () => undefined,
          () => undefined,
        ),
      );
      return result;
    },
  };
}

const BPS_WHOLE = 10000;
const DEFAULT_SHARE_BPS = 7500;

/** The tail of the events queued for each store, shared by every handler over it. */
const queues = new WeakMap<EscrowStore, Promise<void>>();

function checkBounty(bounty: number): void {
  if (!Number.isSafeInteger(bounty) || bounty < 0) {
    throw new RangeError(`bounty must be a whole number of minor units from 0 to Number.MAX_SAFE_INTEGER, got ${bounty}`);
  }
}

function checkShare(bps: number): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > BPS_WHOLE) {
    throw new RangeError(`hidden-test share must be whole basis points from 0 to ${BPS_WHOLE}, got ${bps}`);
  }
}
