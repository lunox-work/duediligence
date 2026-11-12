/**
 * Encryption for the Jira OAuth tokens at rest.
 *
 * The tokens are bearer credentials, so they are never stored in plaintext: a
 * `TokenCipher` (AES-256-GCM) encrypts them on the way into `jira_connection`
 * and decrypts them on the way out. The ciphertext is `v1:<body>`, where
 * `<body>` is standard, padded base64 of `iv ‖ tag ‖ data`; the key id is not
 * part of it, and is stored in the `key_id` column instead.
 */

/**
 * The only error this module throws: a key of the wrong length, or a
 * ciphertext that is unrecognised, truncated or fails authentication. Sets
 * `name` to `"TokenCipherError"` and keeps the message it is given.
 */
export class TokenCipherError extends Error {
  constructor(message: string) {
    super(message);
    throw new Error("not implemented");
  }
}

/** Encrypts and decrypts tokens with one key. Keeps no mutable state. */
export interface TokenCipher {
  /**
   * The `v1:` ciphertext of the UTF-8 plaintext, under a fresh random 12-byte
   * IV on every call. `null` returns `null`; `""` is a valid plaintext.
   */
  encrypt(plaintext: string | null): string | null;
  /**
   * The plaintext of a `v1:` ciphertext. `null` returns `null`. Does not look
   * at the key id.
   *
   * @throws {TokenCipherError} "Unrecognised token encoding; expected v1."
   *   when the text before the first `:` is not exactly `v1`, or there is no
   *   `:`; then "Encrypted token is truncated." when the body decodes to fewer
   *   than 28 bytes; then "Encrypted token could not be authenticated; the key
   *   may have changed." when GCM verification fails.
   */
  decrypt(ciphertext: string | null): string | null;
  /**
   * Recorded in `key_id` beside the tokens this cipher writes. Defaults to a
   * 12-character lowercase hex fingerprint fixed for the key.
   */
  readonly keyId: string;
}

/**
 * A cipher over `key`, 32 bytes in base64 (what `openssl rand -base64 32`
 * prints). Decoding is lenient: standard or URL-safe alphabet, padding missing
 * or doubled, surrounding whitespace ignored. `options.keyId` is used as given;
 * omitted or `undefined`, it defaults to the key's fingerprint.
 *
 * @throws {TokenCipherError} "TOKEN_ENCRYPTION_KEY must be 32 bytes, base64
 *   encoded; got <n>." when the key decodes to <n> bytes, with <n> not 32.
 */
export function createTokenCipher(
  _key: string,
  _options: {
    keyId?: string;
  } = {},
): TokenCipher {
  throw new Error("not implemented");
}

/** Whether two key ids are identical, compared case-sensitively. */
export function sameKeyId(_left: string, _right: string): boolean {
  throw new Error("not implemented");
}
