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

const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const CODE_LENGTH = 8;
const LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;

/** A code as kept in the store. */
interface CodeRecord {
  code: string;
  taskId: string;
  createdAt: number;
  revoked: boolean;
  usedBy?: string;
  usedAt?: number;
}

/** For each task a contributor has access to, the code that granted it. */
type Grants = Record<string, string>;

const codeKey = (code: string) => `code:${code}`;
const taskKey = (taskId: string) => `task:${taskId}`;
const grantsKey = (contributorId: string) => `grants:${contributorId}`;

/** Reads a code however it is typed: any case, with spaces or dashes in it. */
function normalize(typed: string): string {
  return typed.replace(/[\s-]/g, "").toUpperCase();
}

/** A registry of invite codes that grant contributors access to invite-only tasks. */
export class InviteRegistry {
  private readonly store: Store;
  private readonly now: Clock;
  private readonly randomInt: RandomInt;
  /** Every operation runs after the one before it, so none sees another half done. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: RegistryOptions) {
    this.store = options.store;
    this.now = options.now;
    this.randomInt = options.randomInt;
  }

  /**
   * Creates a code for a task at the clock's current time. The new code is
   * unused and expires 14 days later; a code that would repeat one already
   * in the registry is drawn again.
   */
  create(taskId: string): Promise<InviteCode> {
    return this.serial(async () => {
      let code: string;
      do code = this.draw();
      while ((await this.getCode(code)) !== undefined);
      const record: CodeRecord = { code, taskId, createdAt: this.now().getTime(), revoked: false };
      await this.store.set(codeKey(code), record);
      const codes = await this.getTaskCodes(taskId);
      await this.store.set(taskKey(taskId), [...codes, code]);
      return this.view(record, record.createdAt);
    });
  }

  /**
   * Redeems a code for a contributor at the clock's current time, granting
   * access to the code's task. The code is read however it is typed:
   * lowercase, with spaces, or with a "-" in it.
   */
  redeem(code: string, contributorId: string): Promise<RedeemResult> {
    return this.serial(async (): Promise<RedeemResult> => {
      const at = this.now().getTime();
      const record = await this.getCode(normalize(code));
      if (record === undefined) return { ok: false, reason: "unknown" };
      if (record.revoked) return { ok: false, reason: "revoked" };
      if (record.usedBy !== undefined) {
        return record.usedBy === contributorId
          ? { ok: true, taskId: record.taskId }
          : { ok: false, reason: "used" };
      }
      if (at >= record.createdAt + LIFETIME_MS) return { ok: false, reason: "expired" };
      const grants = await this.getGrants(contributorId);
      if (grants[record.taskId] !== undefined) return { ok: false, reason: "already has access" };
      await this.store.set(codeKey(record.code), { ...record, usedBy: contributorId, usedAt: at });
      await this.store.set(grantsKey(contributorId), { ...grants, [record.taskId]: record.code });
      return { ok: true, taskId: record.taskId };
    });
  }

  /**
   * Revokes a code. Revoking a used code withdraws the access it granted;
   * revoking a code that is already revoked changes nothing. Throws if the
   * code was never made.
   */
  revoke(code: string): Promise<void> {
    return this.serial(async () => {
      const record = await this.getCode(normalize(code));
      if (record === undefined) throw new Error(`unknown invite code: ${code}`);
      if (record.revoked) return;
      await this.store.set(codeKey(record.code), { ...record, revoked: true });
      if (record.usedBy === undefined) return;
      const grants = await this.getGrants(record.usedBy);
      if (grants[record.taskId] !== record.code) return;
      const { [record.taskId]: _, ...rest } = grants;
      await this.store.set(grantsKey(record.usedBy), rest);
    });
  }

  /** Whether a contributor has access to a task. */
  hasAccess(contributorId: string, taskId: string): Promise<boolean> {
    return this.serial(async () => (await this.getGrants(contributorId))[taskId] !== undefined);
  }

  /** The tasks a contributor has access to. */
  tasksFor(contributorId: string): Promise<string[]> {
    return this.serial(async () => Object.keys(await this.getGrants(contributorId)));
  }

  /** Lists a task's codes with their state at the clock's current time. */
  list(taskId: string): Promise<InviteCode[]> {
    return this.serial(async () => {
      const at = this.now().getTime();
      const listed: InviteCode[] = [];
      for (const code of await this.getTaskCodes(taskId)) {
        const record = await this.getCode(code);
        if (record !== undefined) listed.push(this.view(record, at));
      }
      return listed;
    });
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private draw(): string {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[this.randomInt(ALPHABET.length)];
    return code;
  }

  private view(record: CodeRecord, at: number): InviteCode {
    const expiresAt = record.createdAt + LIFETIME_MS;
    const state: CodeState = record.revoked
      ? "revoked"
      : record.usedBy !== undefined
        ? "used"
        : at >= expiresAt
          ? "expired"
          : "unused";
    const shown: InviteCode = {
      code: record.code,
      taskId: record.taskId,
      createdAt: new Date(record.createdAt),
      expiresAt: new Date(expiresAt),
      state,
    };
    if (record.usedBy !== undefined) shown.usedBy = record.usedBy;
    if (record.usedAt !== undefined) shown.usedAt = new Date(record.usedAt);
    return shown;
  }

  private async getCode(code: string): Promise<CodeRecord | undefined> {
    return (await this.store.get(codeKey(code))) as CodeRecord | undefined;
  }

  private async getTaskCodes(taskId: string): Promise<string[]> {
    return ((await this.store.get(taskKey(taskId))) as string[] | undefined) ?? [];
  }

  private async getGrants(contributorId: string): Promise<Grants> {
    return ((await this.store.get(grantsKey(contributorId))) as Grants | undefined) ?? {};
  }
}
