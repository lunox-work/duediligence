import { createHash } from "node:crypto";

// Order-independent fingerprint of a file set.
export function hashFiles(files) {
  const entries = Object.entries(files).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return createHash("sha1")
    .update(JSON.stringify(entries))
    .digest("hex")
    .slice(0, 16);
}
