/**
 * The store the caller supplies to a registry: async "get" and "set" whose
 * calls may take any time to resolve. `get` resolves to `undefined` for a
 * key that was never set; the values are whatever the registry stored.
 */
export interface Store {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

/** The clock the caller supplies: returns the current time. */
export type Clock = () => Date;

/**
 * The source of random integers the caller supplies: returns an integer
 * from 0 up to but not including `bound`.
 */
export type RandomInt = (bound: number) => number;

/** What a registry is built over. */
export interface RegistryOptions {
  store: Store;
  now: Clock;
  randomInt: RandomInt;
}

/** A code's state as the company sees it. */
export type CodeState = "unused" | "used" | "expired" | "revoked";

/** A code as listed for the company: its code, when it was made, when it expires, and its state. */
export interface InviteCode {
  code: string;
  taskId: string;
  createdAt: Date;
  expiresAt: Date;
  state: CodeState;
  /** Who used the code; present only when it was used. */
  usedBy?: string;
  /** When the code was used; present only when it was used. */
  usedAt?: Date;
}

/** Why a redemption failed. */
export type RedeemFailureReason =
  | "unknown"
  | "used"
  | "expired"
  | "revoked"
  | "already has access";

/** The outcome of redeeming a code: access to its task, or a failure with a reason. */
export type RedeemResult =
  | { ok: true; taskId: string }
  | { ok: false; reason: RedeemFailureReason };

/** A registry of invite codes that grant contributors access to invite-only tasks. */
export class InviteRegistry {
  constructor(options: RegistryOptions) {
    throw new Error("not implemented");
  }

  /**
   * Creates a code for a task at the clock's current time. The new code is
   * unused and expires 14 days later; a code that would repeat one already
   * in the registry is drawn again.
   */
  create(taskId: string): Promise<InviteCode> {
    throw new Error("not implemented");
  }

  /**
   * Redeems a code for a contributor at the clock's current time, granting
   * access to the code's task. The code is read however it is typed:
   * lowercase, with spaces, or with a "-" in it.
   */
  redeem(code: string, contributorId: string): Promise<RedeemResult> {
    throw new Error("not implemented");
  }

  /** Revokes a code. Throws if the code has been used. */
  revoke(code: string): Promise<void> {
    throw new Error("not implemented");
  }

  /** Whether a contributor has access to a task. */
  hasAccess(contributorId: string, taskId: string): Promise<boolean> {
    throw new Error("not implemented");
  }

  /** The tasks a contributor has access to. */
  tasksFor(contributorId: string): Promise<string[]> {
    throw new Error("not implemented");
  }

  /** Lists a task's codes with their state at the clock's current time. */
  list(taskId: string): Promise<InviteCode[]> {
    throw new Error("not implemented");
  }
}
