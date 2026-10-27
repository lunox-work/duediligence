/** Why a call was rejected. */
export type LedgerErrorCode =
  | "invalid_ledger"
  | "invalid_amount"
  | "insufficient_funds"
  | "closed"
  | "key_conflict";

/** Thrown by every rejected call; its `code` says why. A rejected call changes nothing. */
export class LedgerError extends Error {
  declare readonly code: LedgerErrorCode;
}

/** The status of a ledger, which follows its entries. */
export type LedgerStatus = "open" | "funded" | "partially released" | "closed";

/** The kind of an entry: a movement of money into or out of escrow. */
export type EntryKind = "fund" | "release" | "refund";

/** How a ledger is created: for one task, with a currency and a fee rate. */
export interface LedgerOptions {
  /** Three uppercase letters, e.g. "USD". */
  currency: string;
  /** A whole number of basis points from 0 to 10000. */
  feeRateBps: number;
}

/** A call that funds the escrow. */
export interface FundRequest {
  /** A whole number of minor units, at least 1 and at most Number.MAX_SAFE_INTEGER. */
  amount: number;
  /** The idempotency key; repeating it returns the original entry. */
  key: string;
}

/** A call that releases money to a contributor. */
export interface ReleaseRequest {
  /** A whole number of minor units, at least 1 and at most Number.MAX_SAFE_INTEGER. */
  amount: number;
  /** The contributor who is paid the amount less the platform fee. */
  contributor: string;
  /** The idempotency key; repeating it returns the original entry. */
  key: string;
}

/** A call that refunds money to the funder. */
export interface RefundRequest {
  /** A whole number of minor units, at least 1 and at most Number.MAX_SAFE_INTEGER. */
  amount: number;
  /** The idempotency key; repeating it returns the original entry. */
  key: string;
}

/** A fund entry in the append-only ledger. */
export interface FundEntry {
  kind: "fund";
  amount: number;
  key: string;
  /** Sequence number, starting at 1. */
  sequence: number;
}

/** A release entry: the amount paid to a contributor less the platform fee. */
export interface ReleaseEntry {
  kind: "release";
  amount: number;
  key: string;
  /** Sequence number, starting at 1. */
  sequence: number;
  contributor: string;
  /** The platform fee taken from the amount. */
  fee: number;
  /** The amount less the fee, paid to the contributor. */
  net: number;
}

/** A refund entry: money returned to the funder. */
export interface RefundEntry {
  kind: "refund";
  amount: number;
  key: string;
  /** Sequence number, starting at 1. */
  sequence: number;
}

/** Every movement of money is an entry in the ledger. */
export type Entry = FundEntry | ReleaseEntry | RefundEntry;

/** Balances derived from the entries; funded always equals held plus released plus refunded. */
export interface Balances {
  /** Total funded. */
  funded: number;
  /** Currently held in escrow. */
  held: number;
  /** Total released, before fees. */
  released: number;
  /** Total refunded to the funder. */
  refunded: number;
  /** Total taken by the platform in fees. */
  fees: number;
}

/**
 * The platform fee on a release of `amount` at `feeRateBps` basis points,
 * rounded half to even, exactly, at any size.
 */
export function releaseFee(amount: number, feeRateBps: number): number {
  throw new Error("not implemented");
}

/** One task's reward held in escrow, recorded as an append-only ledger of entries. */
export class Ledger {
  /**
   * Creates a ledger for one task with a currency and a fee rate.
   * Throws a LedgerError with code "invalid_ledger" if the currency is not
   * three uppercase letters or the fee rate is not a whole number from 0 to 10000.
   */
  constructor(options: LedgerOptions) {
    throw new Error("not implemented");
  }

  /**
   * Adds `amount` to the held balance and returns the new entry, or the
   * original entry if `key` was already used for the same call.
   * Throws a LedgerError with code "invalid_amount", "closed" or "key_conflict".
   */
  fund(request: FundRequest): FundEntry {
    throw new Error("not implemented");
  }

  /**
   * Releases `amount` from the held balance, paying the contributor the amount
   * less the platform fee, and returns the new entry, or the original entry if
   * `key` was already used for the same call.
   * Throws a LedgerError with code "invalid_amount", "insufficient_funds",
   * "closed" or "key_conflict".
   */
  release(request: ReleaseRequest): ReleaseEntry {
    throw new Error("not implemented");
  }

  /**
   * Returns `amount` from the held balance to the funder and returns the new
   * entry, or the original entry if `key` was already used for the same call.
   * Throws a LedgerError with code "invalid_amount", "insufficient_funds",
   * "closed" or "key_conflict".
   */
  refund(request: RefundRequest): RefundEntry {
    throw new Error("not implemented");
  }

  /** The ledger's status, which follows its entries. */
  status(): LedgerStatus {
    throw new Error("not implemented");
  }

  /** The balances derived from the entries. */
  balances(): Balances {
    throw new Error("not implemented");
  }

  /** The total net amount paid to `contributor`. */
  paidTo(contributor: string): number {
    throw new Error("not implemented");
  }

  /** The entries, in order. */
  entries(): Entry[] {
    throw new Error("not implemented");
  }
}
