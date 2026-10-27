const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const CODE_LENGTH = 8;
const LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;

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

/** A code as the registry keeps it in the store; times are milliseconds since the epoch. */
interface CodeRecord {
  code: string;
  taskId: string;
  createdAt: number;
  revoked: boolean;
  usedBy?: string;
  usedAt?: number;
}

const codeKey = (code: string) => `code:${code}`;
const taskKey = (taskId: string) => `task:${taskId}`;
const accessKey = (contributorId: string) => `access:${contributorId}`;

/** Reads a code however it is typed: lowercase, with spaces, or with dashes. */
function normalize(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

function stateOf(record: CodeRecord, now: number): CodeState {
  if (record.usedBy !== undefined) return "used";
  if (record.revoked) return "revoked";
  if (now >= record.createdAt + LIFETIME_MS) return "expired";
  return "unused";
}

function toInviteCode(record: CodeRecord, now: number): InviteCode {
  const listed: InviteCode = {
    code: record.code,
    taskId: record.taskId,
    createdAt: new Date(record.createdAt),
    expiresAt: new Date(record.createdAt + LIFETIME_MS),
    state: stateOf(record, now),
  };
  if (record.usedBy !== undefined && record.usedAt !== undefined) {
    listed.usedBy = record.usedBy;
    listed.usedAt = new Date(record.usedAt);
  }
  return listed;
}

/** A registry of invite codes that grant contributors access to invite-only tasks. */
export class InviteRegistry {
  private readonly store: Store;
  private readonly now: Clock;
  private readonly randomInt: RandomInt;
  /** The tail of the queue every operation runs in, so no two interleave over the store. */
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
    return this.exclusive(async () => {
      let code: string;
      do {
        code = this.draw();
      } while ((await this.store.get(codeKey(code))) !== undefined);

      const now = this.now().getTime();
      const record: CodeRecord = { code, taskId, createdAt: now, revoked: false };
      await this.store.set(codeKey(code), record);
      const codes = await this.strings(taskKey(taskId));
      await this.store.set(taskKey(taskId), [...codes, code]);
      return toInviteCode(record, now);
    });
  }

  /**
   * Redeems a code for a contributor at the clock's current time, granting
   * access to the code's task. The code is read however it is typed:
   * lowercase, with spaces, or with a "-" in it.
   */
  redeem(code: string, contributorId: string): Promise<RedeemResult> {
    return this.exclusive(async (): Promise<RedeemResult> => {
      const record = await this.record(normalize(code));
      if (record === undefined) return { ok: false, reason: "unknown" };
      if (record.usedBy !== undefined) {
        return record.usedBy === contributorId
          ? { ok: true, taskId: record.taskId }
          : { ok: false, reason: "used" };
      }
      const state = stateOf(record, this.now().getTime());
      if (state === "revoked" || state === "expired") return { ok: false, reason: state };

      const tasks = await this.strings(accessKey(contributorId));
      if (tasks.includes(record.taskId)) return { ok: false, reason: "already has access" };

      const used: CodeRecord = { ...record, usedBy: contributorId, usedAt: this.now().getTime() };
      await this.store.set(codeKey(record.code), used);
      await this.store.set(accessKey(contributorId), [...tasks, record.taskId]);
      return { ok: true, taskId: record.taskId };
    });
  }

  /** Revokes a code. Throws if the code has been used. */
  revoke(code: string): Promise<void> {
    return this.exclusive(async () => {
      const record = await this.record(normalize(code));
      if (record === undefined) throw new Error(`unknown code: ${code}`);
      if (record.usedBy !== undefined) throw new Error(`code ${record.code} has been used`);
      await this.store.set(codeKey(record.code), { ...record, revoked: true });
    });
  }

  /** Whether a contributor has access to a task. */
  hasAccess(contributorId: string, taskId: string): Promise<boolean> {
    return this.exclusive(async () => (await this.strings(accessKey(contributorId))).includes(taskId));
  }

  /** The tasks a contributor has access to. */
  tasksFor(contributorId: string): Promise<string[]> {
    return this.exclusive(async () => [...(await this.strings(accessKey(contributorId)))]);
  }

  /** Lists a task's codes with their state at the clock's current time. */
  list(taskId: string): Promise<InviteCode[]> {
    return this.exclusive(async () => {
      const now = this.now().getTime();
      const listed: InviteCode[] = [];
      for (const code of await this.strings(taskKey(taskId))) {
        const record = await this.record(code);
        if (record !== undefined) listed.push(toInviteCode(record, now));
      }
      return listed;
    });
  }

  /** Runs an operation once every operation queued before it has finished. */
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private draw(): string {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[this.randomInt(ALPHABET.length)];
    return code;
  }

  private async record(code: string): Promise<CodeRecord | undefined> {
    return (await this.store.get(codeKey(code))) as CodeRecord | undefined;
  }

  private async strings(key: string): Promise<string[]> {
    return ((await this.store.get(key)) as string[] | undefined) ?? [];
  }
}
