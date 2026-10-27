import { createHmac } from "node:crypto";

/**
 * An organization's registry of anonymised public project names, created
 * with a secret key. A task's name is "project-" followed by the start of
 * its digest (HMAC-SHA256 of the task id under the key, as lowercase hex).
 */
export class NameRegistry {
  readonly #key: string;
  readonly #namesByTask = new Map<string, string>();
  readonly #takenNames = new Set<string>();

  /**
   * Creates a registry with the given secret key.
   * Throws an error if the key is empty.
   */
  constructor(key: string) {
    if (typeof key !== "string" || key.length === 0) {
      throw new Error("a registry needs a non-empty key");
    }
    this.#key = key;
  }

  /**
   * Names a task's public project. The name is "project-" and the first four
   * digest characters; the same task always gets the same name, and the task
   * named first keeps its name. If that name is taken in this registry, the
   * suffix grows two characters at a time until the name is free.
   * Throws an error if the task id is empty.
   */
  name(taskId: string): string {
    if (typeof taskId !== "string" || taskId.length === 0) {
      throw new Error("a task needs a non-empty id");
    }
    const existing = this.#namesByTask.get(taskId);
    if (existing !== undefined) return existing;

    const digest: string = createHmac("sha256", this.#key)
      .update(taskId)
      .digest("hex");
    for (let length = 4; length <= digest.length; length += 2) {
      const candidate = "project-" + digest.slice(0, length);
      if (!this.#takenNames.has(candidate)) {
        this.#takenNames.add(candidate);
        this.#namesByTask.set(taskId, candidate);
        return candidate;
      }
    }
    throw new Error(`no free name for task ${taskId}`);
  }
}
