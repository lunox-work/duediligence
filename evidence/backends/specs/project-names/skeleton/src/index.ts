/**
 * An organization's registry of anonymised public project names, created
 * with a secret key. A task's name is "project-" followed by the start of
 * its digest (HMAC-SHA256 of the task id under the key, as lowercase hex).
 */
export class NameRegistry {
  /**
   * Creates a registry with the given secret key.
   * Throws an error if the key is empty.
   */
  constructor(key: string) {
    throw new Error("not implemented");
  }

  /**
   * Names a task's public project. The name is "project-" and the first four
   * digest characters; the same task always gets the same name, and the task
   * named first keeps its name. If that name is taken in this registry, the
   * suffix grows two characters at a time until the name is free.
   * Throws an error if the task id is empty.
   */
  name(taskId: string): string {
    throw new Error("not implemented");
  }
}
