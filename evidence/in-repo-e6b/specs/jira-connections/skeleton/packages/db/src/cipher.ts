/**
 * `TokenCipher`: AES-256-GCM encryption for the OAuth tokens stored in
 * `jira_connection`. The tokens are bearer credentials, so they are never
 * stored in plaintext: they are encrypted on the way in and decrypted on the
 * way out.
 *
 * Ciphertext format: `v1:<keyId>:<iv>:<tag>:<data>`, with `iv`, `tag` and
 * `data` in base64url without padding.
 */

/** The only error type `cipher.ts` throws. Its `name` is `"TokenCipherError"`. */
export class TokenCipherError extends Error {
  constructor(message: string) {
    super(message);
    throw new Error("not implemented");
  }
}

/** Encrypts tokens on the way in and decrypts them on the way out. Keeps no mutable state. */
export interface TokenCipher {
  /**
   * The `v1:<keyId>:<iv>:<tag>:<data>` ciphertext of `plaintext`, with a fresh
   * random IV on every call. `null` returns `null`; `""` is a valid plaintext.
   */
  encrypt(plaintext: string | null): string | null;
  /**
   * The plaintext of a v1 ciphertext. `null` returns `null`.
   *
   * Throws `TokenCipherError` when the ciphertext is not in the v1 format, was
   * recorded under another key id, or fails GCM authentication — checked in
   * that order.
   */
  decrypt(ciphertext: string | null): string | null;
  /** The key id recorded in every ciphertext this cipher writes. */
  readonly keyId: string;
}

/**
 * Builds a cipher from a 32-byte standard-base64 key (whitespace trimmed,
 * trailing `=` optional). `keyId` defaults to the first 8 lowercase hex
 * characters of the SHA-256 of the key bytes.
 *
 * Throws `TokenCipherError` for any other key, then for a key id that does not
 * match `^[A-Za-z0-9_-]{1,64}$`.
 */
export function createTokenCipher(
  _key: string,
  _options: { keyId?: string } = {},
): TokenCipher {
  throw new Error("not implemented");
}

/**
 * `true` exactly when both strings are valid key ids and identical,
 * compared case-sensitively.
 */
export function sameKeyId(_left: string, _right: string): boolean {
  throw new Error("not implemented");
}
