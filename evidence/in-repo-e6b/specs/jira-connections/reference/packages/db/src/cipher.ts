/**
 * `TokenCipher`: AES-256-GCM encryption for the OAuth tokens stored in
 * `jira_connection`. The tokens are bearer credentials, so they are never
 * stored in plaintext: they are encrypted on the way in and decrypted on the
 * way out.
 *
 * Ciphertext format: `v1:<keyId>:<iv>:<tag>:<data>`, with `iv`, `tag` and
 * `data` in base64url without padding.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** 32 bytes of standard base64: 43 characters, then an optional `=`. */
const KEY_PATTERN = /^[A-Za-z0-9+/]{43}=?$/;
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;

const KEY_MESSAGE = "Token cipher key must be 32 bytes, base64-encoded.";
const KEY_ID_MESSAGE =
  'Token cipher key id must be 1-64 characters of A-Z, a-z, 0-9, "_" or "-".';
const FORMAT_MESSAGE = "Ciphertext is not in the v1 format.";
const AUTH_MESSAGE =
  "Ciphertext failed authentication: wrong key or tampered data.";

/** The only error type `cipher.ts` throws. Its `name` is `"TokenCipherError"`. */
export class TokenCipherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenCipherError";
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
  key: string,
  options: { keyId?: string } = {},
): TokenCipher {
  const keyBytes = decodeKey(key);

  const keyId =
    options.keyId === undefined
      ? createHash("sha256").update(keyBytes).digest("hex").slice(0, 8)
      : options.keyId;
  if (!KEY_ID_PATTERN.test(keyId)) {
    throw new TokenCipherError(KEY_ID_MESSAGE);
  }

  // The recorded key id is authenticated, so relabelling it is detected.
  const aad = Buffer.from(`${VERSION}:${keyId}`, "utf8");

  return Object.freeze({
    keyId,

    encrypt(plaintext: string | null): string | null {
      if (plaintext === null) return null;
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, keyBytes, iv, {
        authTagLength: TAG_BYTES,
      });
      cipher.setAAD(aad);
      const data = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();
      return [
        VERSION,
        keyId,
        iv.toString("base64url"),
        tag.toString("base64url"),
        data.toString("base64url"),
      ].join(":");
    },

    decrypt(ciphertext: string | null): string | null {
      if (ciphertext === null) return null;
      const { recordedKeyId, iv, tag, data } = parseCiphertext(ciphertext);

      if (!sameKeyId(recordedKeyId, keyId)) {
        throw new TokenCipherError(
          `Ciphertext was encrypted with key "${recordedKeyId}", not "${keyId}".`,
        );
      }

      try {
        const decipher = createDecipheriv(ALGORITHM, keyBytes, iv, {
          authTagLength: TAG_BYTES,
        });
        decipher.setAAD(aad);
        decipher.setAuthTag(tag);
        return Buffer.concat([
          decipher.update(data),
          decipher.final(),
        ]).toString("utf8");
      } catch {
        throw new TokenCipherError(AUTH_MESSAGE);
      }
    },
  });
}

/**
 * `true` exactly when both strings are valid key ids and identical,
 * compared case-sensitively.
 */
export function sameKeyId(left: string, right: string): boolean {
  return KEY_ID_PATTERN.test(left) && KEY_ID_PATTERN.test(right) && left === right;
}

/** The 32 key bytes, or `TokenCipherError` for anything but standard base64 of 32 bytes. */
function decodeKey(key: string): Buffer {
  const trimmed = key.trim();
  if (!KEY_PATTERN.test(trimmed)) {
    throw new TokenCipherError(KEY_MESSAGE);
  }
  // 43 base64 characters always decode to exactly 32 bytes.
  return Buffer.from(trimmed, "base64");
}

/** Splits and decodes a v1 ciphertext, or throws the format error. */
function parseCiphertext(ciphertext: string): {
  recordedKeyId: string;
  iv: Buffer;
  tag: Buffer;
  data: Buffer;
} {
  const fields = ciphertext.split(":");
  if (fields.length !== 5) throw new TokenCipherError(FORMAT_MESSAGE);
  const [version, recordedKeyId, iv, tag, data] = fields as [
    string,
    string,
    string,
    string,
    string,
  ];
  if (
    version !== VERSION ||
    !KEY_ID_PATTERN.test(recordedKeyId) ||
    !BASE64URL_PATTERN.test(iv) ||
    !BASE64URL_PATTERN.test(tag) ||
    !BASE64URL_PATTERN.test(data)
  ) {
    throw new TokenCipherError(FORMAT_MESSAGE);
  }
  const ivBytes = Buffer.from(iv, "base64url");
  const tagBytes = Buffer.from(tag, "base64url");
  if (ivBytes.length !== IV_BYTES || tagBytes.length !== TAG_BYTES) {
    throw new TokenCipherError(FORMAT_MESSAGE);
  }
  return {
    recordedKeyId,
    iv: ivBytes,
    tag: tagBytes,
    data: Buffer.from(data, "base64url"),
  };
}
