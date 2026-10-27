/**
 * Whether git ignores the file at `path` under the rules of `gitignore`,
 * the text of one `.gitignore` file at the root of the repository.
 *
 * `path` is relative to the root, separated by `/`, with no leading or
 * trailing slash. Its last component is a file and every other component
 * is a directory.
 */
export function isIgnored(gitignore: string, path: string): boolean {
  throw new Error("not implemented");
}
