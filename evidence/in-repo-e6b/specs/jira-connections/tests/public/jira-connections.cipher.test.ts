/**
 * `TokenCipher` and `sameKeyId`: the key and key-id rules, the v1 ciphertext
 * layout, and the order in which `decrypt` refuses a ciphertext.
 *
 * Keys are fixed (bytes 0..31 and 32..63), so the default key ids are known.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createTokenCipher,
  sameKeyId,
  TokenCipherError,
} from "../src/cipher.js";

/** Bytes 0..31; default key id "630dcd29". */
const K1 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
/** Bytes 32..63; default key id "72dbb733". */
const K2 = "ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8=";

const KEY_MESSAGE = "Token cipher key must be 32 bytes, base64-encoded.";
const KEY_ID_MESSAGE =
  'Token cipher key id must be 1-64 characters of A-Z, a-z, 0-9, "_" or "-".';
const FORMAT_MESSAGE = "Ciphertext is not in the v1 format.";
const AUTH_MESSAGE =
  "Ciphertext failed authentication: wrong key or tampered data.";

const BASE64URL = /^[A-Za-z0-9_-]*$/;

/** Asserts `run` throws a `TokenCipherError` with exactly `message`. */
function throwsCipherError(run: () => unknown, message: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof TokenCipherError, `not a TokenCipherError`);
    assert.equal(error.name, "TokenCipherError");
    assert.equal(error.message, message);
    return true;
  });
}

/** The ciphertext's five fields; fails the test if it is null. */
function fieldsOf(ciphertext: string | null): string[] {
  assert.equal(typeof ciphertext, "string");
  return (ciphertext as string).split(":");
}

/** `ciphertext` with field `position` (1-based) replaced by `value`. */
function withField(
  ciphertext: string | null,
  position: number,
  value: string,
): string {
  const fields = fieldsOf(ciphertext);
  fields[position - 1] = value;
  return fields.join(":");
}

/** Field `position` (1-based) of `ciphertext`. */
function field(ciphertext: string | null, position: number): string {
  return fieldsOf(ciphertext)[position - 1] ?? "";
}

/** `text` with its first character swapped for a different base64url one. */
function flipFirst(text: string): string {
  const first = text[0] === "A" ? "B" : "A";
  return first + text.slice(1);
}

// ---- createTokenCipher: key ------------------------------------------------

test("[happy-1] a padded 32-byte key yields its default key id", () => {
  assert.equal(createTokenCipher(K1).keyId, "630dcd29");
  assert.equal(createTokenCipher(K2).keyId, "72dbb733");
});

test("[happy-1] an unpadded or whitespace-wrapped key yields the same default key id", () => {
  assert.equal(
    createTokenCipher("AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8").keyId,
    "630dcd29",
  );
  assert.equal(
    createTokenCipher("  AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=\n")
      .keyId,
    "630dcd29",
  );
});

test("[unhappy-1] an empty, base64url or hex key throws TokenCipherError", () => {
  for (const key of [
    "",
    "   ",
    "___________________________________________8",
    "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  ]) {
    throwsCipherError(() => createTokenCipher(key), KEY_MESSAGE);
  }
});

test("[unhappy-1] a key of 31 or 33 bytes, or with extra padding, throws TokenCipherError", () => {
  for (const key of [
    "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHg==",
    "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8g",
    "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8==",
  ]) {
    throwsCipherError(() => createTokenCipher(key), KEY_MESSAGE);
  }
});

// ---- createTokenCipher: key id ---------------------------------------------

test("[happy-2] an explicit key id replaces the default", () => {
  assert.equal(createTokenCipher(K1, { keyId: "2026-11_a" }).keyId, "2026-11_a");
});

test("[happy-2] an explicit key id is the one recorded in the ciphertext", () => {
  const cipher = createTokenCipher(K1, { keyId: "2026-11_a" });
  const ciphertext = cipher.encrypt("secret");
  assert.equal(field(ciphertext, 2), "2026-11_a");
  assert.equal(cipher.decrypt(ciphertext), "secret");
});

test("[boundary-1] key ids of 1 and 64 characters are accepted, and undefined means the default", () => {
  assert.equal(createTokenCipher(K1, { keyId: "a" }).keyId, "a");
  const longest = "k".repeat(64);
  assert.equal(createTokenCipher(K1, { keyId: longest }).keyId, longest);
  assert.equal(createTokenCipher(K1, { keyId: undefined }).keyId, "630dcd29");
});

test("[boundary-1] key ids of 65 or 0 characters, or with ':' or ' ', throw TokenCipherError", () => {
  for (const keyId of ["k".repeat(65), "", "k:1", "k 1"]) {
    throwsCipherError(() => createTokenCipher(K1, { keyId }), KEY_ID_MESSAGE);
  }
});

test("[unhappy-2] the key is checked before the key id", () => {
  throwsCipherError(() => createTokenCipher("", { keyId: "" }), KEY_MESSAGE);
});

test("[unhappy-2] a wrong-length key is reported before a malformed key id", () => {
  throwsCipherError(
    () =>
      createTokenCipher("AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHg==", {
        keyId: "k:1",
      }),
    KEY_MESSAGE,
  );
});

// ---- encrypt / decrypt round trip ------------------------------------------

test("[happy-3] a token and a non-ASCII string round-trip", () => {
  const cipher = createTokenCipher(K1);
  for (const plaintext of ["eyJhbGciOiJIUzI1NiJ9.access", "tökén 🔑"]) {
    assert.equal(cipher.decrypt(cipher.encrypt(plaintext)), plaintext);
  }
});

test("[happy-3] the empty string and a 100000-character string round-trip", () => {
  const cipher = createTokenCipher(K1);
  for (const plaintext of ["", "x".repeat(100000)]) {
    assert.equal(cipher.decrypt(cipher.encrypt(plaintext)), plaintext);
  }
});

test("[happy-4] the ciphertext has the documented layout", () => {
  const ciphertext = createTokenCipher(K1).encrypt("secret");
  const fields = fieldsOf(ciphertext);
  assert.equal(fields.length, 5);
  const [version, keyId, iv, tag, data] = fields as [
    string,
    string,
    string,
    string,
    string,
  ];
  assert.equal(version, "v1");
  assert.equal(keyId, "630dcd29");
  assert.equal(iv.length, 16);
  assert.match(iv, BASE64URL);
  assert.equal(Buffer.from(iv, "base64url").length, 12);
  assert.equal(tag.length, 22);
  assert.match(tag, BASE64URL);
  assert.equal(Buffer.from(tag, "base64url").length, 16);
  assert.notEqual(data, "");
  assert.match(data, BASE64URL);
  assert.equal(data.includes("="), false);
  assert.equal((ciphertext as string).includes("secret"), false);
});

test("[happy-4] the data field holds as many bytes as the plaintext's UTF-8", () => {
  // GCM is a stream mode: the encrypted data is as long as its input.
  const plaintext = "tökén 🔑";
  const data = field(createTokenCipher(K1).encrypt(plaintext), 5);
  assert.match(data, BASE64URL);
  assert.equal(
    Buffer.from(data, "base64url").length,
    Buffer.byteLength(plaintext, "utf8"),
  );
});

test("[boundary-2] the empty plaintext has an empty data field", () => {
  const ciphertext = createTokenCipher(K1).encrypt("");
  assert.equal(typeof ciphertext, "string");
  assert.equal((ciphertext as string).endsWith(":"), true);
  assert.equal(field(ciphertext, 5), "");
});

test("[boundary-2] the empty plaintext still carries a full iv and tag", () => {
  const cipher = createTokenCipher(K1);
  const ciphertext = cipher.encrypt("");
  const fields = fieldsOf(ciphertext);
  assert.equal(fields.length, 5);
  assert.equal(fields[0], "v1");
  assert.equal(fields[1], "630dcd29");
  assert.equal(fields[2]?.length, 16);
  assert.equal(fields[3]?.length, 22);
  assert.equal(cipher.decrypt(ciphertext), "");
});

test("[happy-5] encrypting the same plaintext twice gives different ciphertexts", () => {
  const cipher = createTokenCipher(K1);
  const first = cipher.encrypt("secret");
  const second = cipher.encrypt("secret");
  assert.notEqual(first, second);
  assert.equal(cipher.decrypt(first), "secret");
  assert.equal(cipher.decrypt(second), "secret");
});

test("[happy-5] encrypting the empty plaintext twice gives different ivs", () => {
  const cipher = createTokenCipher(K1);
  const first = cipher.encrypt("");
  const second = cipher.encrypt("");
  assert.notEqual(field(first, 3), field(second, 3));
  assert.equal(cipher.decrypt(first), "");
  assert.equal(cipher.decrypt(second), "");
});

test("[happy-6] another cipher built from the same key reads the ciphertext", () => {
  const cipher = createTokenCipher(K1);
  const other = createTokenCipher(
    " AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8 ",
  );
  assert.equal(other.decrypt(cipher.encrypt("secret")), "secret");
});

test("[happy-6] an explicit key id equal to the default reads a default-id ciphertext", () => {
  const cipher = createTokenCipher(K1);
  const other = createTokenCipher(K1, { keyId: "630dcd29" });
  assert.equal(other.decrypt(cipher.encrypt("secret")), "secret");
  assert.equal(cipher.decrypt(other.encrypt("secret")), "secret");
});

test("[boundary-3] null passes through both directions", () => {
  const cipher = createTokenCipher(K1);
  assert.equal(cipher.encrypt(null), null);
  assert.equal(cipher.decrypt(null), null);
});

test("[boundary-3] null passes through a cipher with an explicit key id", () => {
  const cipher = createTokenCipher(K2, { keyId: "prod" });
  assert.equal(cipher.encrypt(null), null);
  assert.equal(cipher.decrypt(null), null);
});

// ---- decrypt refusals ------------------------------------------------------

test("[unhappy-3] an empty, single-field, v2 or six-field ciphertext is not v1", () => {
  const cipher = createTokenCipher(K1);
  const valid = cipher.encrypt("secret");
  for (const ciphertext of [
    "",
    "plaintext-token",
    withField(valid, 1, "v2"),
    `${valid}:x`,
  ]) {
    throwsCipherError(() => cipher.decrypt(ciphertext), FORMAT_MESSAGE);
  }
});

test("[unhappy-3] a bad key id, short iv, short tag, padded or standard-base64 data is not v1", () => {
  const cipher = createTokenCipher(K1);
  const valid = cipher.encrypt("secret");
  const data = field(valid, 5);
  for (const ciphertext of [
    withField(valid, 2, ""),
    withField(valid, 3, field(valid, 3).slice(0, 15)),
    withField(valid, 4, field(valid, 4).slice(0, 21)),
    withField(valid, 5, `${data}=`),
    withField(valid, 5, `+${data.slice(1)}`),
  ]) {
    throwsCipherError(() => cipher.decrypt(ciphertext), FORMAT_MESSAGE);
  }
});

test("[unhappy-4] a ciphertext recorded under another key id is refused", () => {
  const cipher = createTokenCipher(K1);
  const k2 = createTokenCipher(K2);
  throwsCipherError(
    () => cipher.decrypt(k2.encrypt("secret")),
    'Ciphertext was encrypted with key "72dbb733", not "630dcd29".',
  );
});

test("[unhappy-4] key ids differing only in case are different key ids", () => {
  const lower = createTokenCipher(K1, { keyId: "prod" });
  const upper = createTokenCipher(K1, { keyId: "Prod" });
  throwsCipherError(
    () => upper.decrypt(lower.encrypt("secret")),
    'Ciphertext was encrypted with key "prod", not "Prod".',
  );
});

test("[unhappy-5] the same key id over a different key fails authentication", () => {
  const a = createTokenCipher(K1, { keyId: "prod" });
  const b = createTokenCipher(K2, { keyId: "prod" });
  throwsCipherError(() => b.decrypt(a.encrypt("secret")), AUTH_MESSAGE);
});

test("[unhappy-5] the empty plaintext under a different key also fails authentication", () => {
  const a = createTokenCipher(K1, { keyId: "prod" });
  const b = createTokenCipher(K2, { keyId: "prod" });
  throwsCipherError(() => a.decrypt(b.encrypt("")), AUTH_MESSAGE);
});

test("[unhappy-6] relabelling the key id is detected", () => {
  const a = createTokenCipher(K1, { keyId: "old" });
  const b = createTokenCipher(K1, { keyId: "new" });
  const c = withField(a.encrypt("secret"), 2, "new");
  throwsCipherError(() => b.decrypt(c), AUTH_MESSAGE);
});

test("[unhappy-6] relabelling the key id to a case variant is detected", () => {
  const a = createTokenCipher(K1, { keyId: "old" });
  const b = createTokenCipher(K1, { keyId: "OLD" });
  const c = withField(a.encrypt("secret"), 2, "OLD");
  throwsCipherError(() => b.decrypt(c), AUTH_MESSAGE);
});

test("[unhappy-7] a tampered iv, tag or data fails authentication without leaking", () => {
  const cipher = createTokenCipher(K1);
  for (const position of [3, 4, 5]) {
    const valid = cipher.encrypt("secret");
    const tampered = withField(
      valid,
      position,
      flipFirst(field(valid, position)),
    );
    assert.throws(
      () => cipher.decrypt(tampered),
      (error: unknown) => {
        assert.ok(error instanceof TokenCipherError);
        assert.equal(error.message, AUTH_MESSAGE);
        assert.equal(error.message.includes("secret"), false);
        assert.equal(error.message.includes(K1), false);
        return true;
      },
      `field ${position}`,
    );
  }
});

test("[unhappy-7] tampering the data of a one-character plaintext fails authentication", () => {
  const cipher = createTokenCipher(K1);
  const valid = cipher.encrypt("s");
  const tampered = withField(valid, 5, flipFirst(field(valid, 5)));
  throwsCipherError(() => cipher.decrypt(tampered), AUTH_MESSAGE);
});

test("[unhappy-8] the format is checked before the key id", () => {
  const cipher = createTokenCipher(K1);
  const k2 = createTokenCipher(K2);
  const valid = k2.encrypt("secret");
  const c = withField(valid, 4, field(valid, 4).slice(0, 21));
  throwsCipherError(() => cipher.decrypt(c), FORMAT_MESSAGE);
});

test("[unhappy-8] the key id is checked before authentication", () => {
  const cipher = createTokenCipher(K1);
  const k2 = createTokenCipher(K2);
  const valid = k2.encrypt("secret");
  const c = withField(valid, 5, flipFirst(field(valid, 5)));
  throwsCipherError(
    () => cipher.decrypt(c),
    'Ciphertext was encrypted with key "72dbb733", not "630dcd29".',
  );
});

// ---- sameKeyId -------------------------------------------------------------

test("[happy-7] sameKeyId is true for identical valid key ids", () => {
  assert.equal(sameKeyId("630dcd29", "630dcd29"), true);
  assert.equal(sameKeyId("prod", "prod"), true);
  assert.equal(sameKeyId("k".repeat(64), "k".repeat(64)), true);
});

test("[boundary-4] sameKeyId is false for case, whitespace, different or invalid ids", () => {
  assert.equal(sameKeyId("prod", "Prod"), false);
  assert.equal(sameKeyId("prod", "prod "), false);
  assert.equal(sameKeyId("prod", "staging"), false);
  assert.equal(sameKeyId("", ""), false);
  assert.equal(sameKeyId("k:1", "k:1"), false);
  assert.equal(sameKeyId("k".repeat(65), "k".repeat(65)), false);
});
