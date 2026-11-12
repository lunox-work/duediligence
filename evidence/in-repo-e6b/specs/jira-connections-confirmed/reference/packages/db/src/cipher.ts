/**
 * Encryption for the Jira OAuth tokens at rest.
 *
 * The tokens are bearer credentials, so they are never stored in plaintext: a
 * `TokenCipher` (AES-256-GCM) encrypts them on the way into `jira_connection`
 * and decrypts them on the way out. The ciphertext is `v1:<body>`, where
 * `<body>` is standard, padded base64 of `iv ‖ tag ‖ data`; the key id is not
 * part of it, and is stored in the `key_id` column instead.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const SCHEME = "v1";
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = IV_BYTES + TAG_BYTES;

/**
 * Lenient base64: Node's decoder accepts both the standard and the URL-safe
 * alphabet, and does not insist on padding. Whitespace is trimmed first.
 */
function decodeBase64(text: string): Buffer {
  return Buffer.from(text.trim(), "base64");
}

/**
 * The default key id: a key check value, the first 6 bytes of AES-256-GCM
 * over zero bytes with an all-zero IV, in hex. Fixed per key, reveals nothing
 * about it, and is never used as a nonce for real data.
 */
function fingerprint(key: Buffer): string {
  const cipher = createCipheriv(ALGORITHM, key, Buffer.alloc(IV_BYTES));
  return Buffer.concat([
    cipher.update(Buffer.alloc(6)),
    cipher.final(),
  ]).toString("hex");
}

/**
 * The only error this module throws: a key of the wrong length, or a
 * ciphertext that is unrecognised, truncated or fails authentication. Sets
 * `name` to `"TokenCipherError"` and keeps the message it is given.
 */
export class TokenCipherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenCipherError";
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
  key: string,
  options: {
    keyId?: string;
  } = {},
): TokenCipher {
  const keyBytes = decodeBase64(key);
  if (keyBytes.length !== KEY_BYTES) {
    throw new TokenCipherError(
      `TOKEN_ENCRYPTION_KEY must be ${KEY_BYTES} bytes, base64 encoded; got ${keyBytes.length}.`,
    );
  }
  const keyId = options.keyId ?? fingerprint(keyBytes);

  return {
    keyId,

    encrypt(plaintext) {
      if (plaintext === null) {
        return null;
      }
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, keyBytes, iv);
      const data = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();
      return `${SCHEME}:${Buffer.concat([iv, tag, data]).toString("base64")}`;
    },

    decrypt(ciphertext) {
      if (ciphertext === null) {
        return null;
      }
      const separator = ciphertext.indexOf(":");
      if (separator === -1 || ciphertext.slice(0, separator) !== SCHEME) {
        throw new TokenCipherError("Unrecognised token encoding; expected v1.");
      }
      const body = decodeBase64(ciphertext.slice(separator + 1));
      if (body.length < HEADER_BYTES) {
        throw new TokenCipherError("Encrypted token is truncated.");
      }
      const iv = body.subarray(0, IV_BYTES);
      const tag = body.subarray(IV_BYTES, HEADER_BYTES);
      const data = body.subarray(HEADER_BYTES);
      try {
        const decipher = createDecipheriv(ALGORITHM, keyBytes, iv, {
          authTagLength: TAG_BYTES,
        });
        decipher.setAuthTag(tag);
        return Buffer.concat([
          decipher.update(data),
          decipher.final(),
        ]).toString("utf8");
      } catch {
        throw new TokenCipherError(
          "Encrypted token could not be authenticated; the key may have changed.",
        );
      }
    },
  };
}

/** Whether two key ids are identical, compared case-sensitively. */
export function sameKeyId(left: string, right: string): boolean {
  return left === right;
}
