/**
 * `TokenCipher`: key decoding, default and explicit key ids, the `v1:`
 * ciphertext layout, and the ordered checks `decrypt` runs. Also
 * `sameKeyId`.
 *
 * The keys are fixed (K1 is bytes 0..31, K2 bytes 32..63). The only
 * non-determinism is the IV the cipher draws per call, which the assertions
 * never depend on.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createTokenCipher,
  sameKeyId,
  TokenCipherError,
} from "../src/cipher.js";

const K1 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
const K2 = "ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8=";
const K1_ID = "0ebcb5deb52c";
const K2_ID = "e32ee159945f";

const UNRECOGNISED = "Unrecognised token encoding; expected v1.";
const TRUNCATED = "Encrypted token is truncated.";
const UNAUTHENTICATED =
  "Encrypted token could not be authenticated; the key may have changed.";

/** Asserts `fn` throws a `TokenCipherError` with exactly `message`. */
function throwsCipherError(fn: () => unknown, message: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof TokenCipherError, "not a TokenCipherError");
    assert.equal(error.name, "TokenCipherError");
    assert.equal(error.message, message);
    return true;
  });
}

function keyLengthMessage(n: number): string {
  return `TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded; got ${n}.`;
}

/** Encrypts a non-null plaintext, failing the test on a `null` result. */
function encrypt(
  cipher: ReturnType<typeof createTokenCipher>,
  plaintext: string,
): string {
  const ciphertext = cipher.encrypt(plaintext);
  assert.equal(typeof ciphertext, "string");
  return ciphertext as string;
}

/** The decoded bytes after `v1:`. */
function bodyBytes(ciphertext: string): Buffer {
  assert.ok(ciphertext.startsWith("v1:"));
  return Buffer.from(ciphertext.slice(3), "base64");
}

// ---- createTokenCipher: keys --------------------------------------------

const acceptedKeys: Array<[string, string, string]> = [
  ["padded standard base64", K1, K1_ID],
  ["padding missing", "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8", K1_ID],
  [
    "surrounding whitespace",
    "  AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=\n",
    K1_ID,
  ],
  [
    "padding doubled",
    "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8==",
    K1_ID,
  ],
  ["another key", K2, K2_ID],
  ["base64url alphabet", "_".repeat(43), "c7c96dffcd9c"],
];

for (const [why, key, keyId] of acceptedKeys) {
  test(`[happy-1] an accepted key yields its default key id: ${why}`, () => {
    const cipher = createTokenCipher(key);
    assert.equal(cipher.keyId, keyId);
  });
}

test("[happy-1] the default key id is 12 lowercase hex characters, fixed per key", () => {
  const first = createTokenCipher(K1).keyId;
  const second = createTokenCipher(K1).keyId;
  assert.match(first, /^[0-9a-f]{12}$/);
  assert.equal(first, second);
  assert.notEqual(createTokenCipher(K2).keyId, first);
});

const rejectedKeys: Array<[string, string, number]> = [
  ["empty", "", 0],
  ["whitespace only", "   ", 0],
  ["31 bytes", "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHg==", 31],
  ["33 bytes", "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8g", 33],
  ["33 bytes in base64url", "___________________________________________8", 33],
  [
    "hex",
    "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    48,
  ],
];

for (const [why, key, n] of rejectedKeys) {
  test(`[unhappy-1] a key of the wrong decoded length throws TokenCipherError: ${why}`, () => {
    throwsCipherError(() => createTokenCipher(key), keyLengthMessage(n));
  });
}

test("[unhappy-1] the key-length message does not contain the key", () => {
  const key = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHg==";
  assert.throws(
    () => createTokenCipher(key),
    (error: unknown) => {
      assert.ok(error instanceof TokenCipherError);
      assert.equal(error.message.includes(key), false);
      return true;
    },
  );
});

// ---- createTokenCipher: key ids -----------------------------------------

test("[happy-2] an explicit key id replaces the default", () => {
  const cipher = createTokenCipher(K1, { keyId: "2026-11_a" });
  assert.equal(cipher.keyId, "2026-11_a");
});

test("[happy-2] an explicit key id does not depend on the key", () => {
  const cipher = createTokenCipher(K2, { keyId: "2026-11_a" });
  assert.equal(cipher.keyId, "2026-11_a");
});

const keyIdsAsGiven: Array<[string, string | undefined, string]> = [
  ["one character", "a", "a"],
  ["65 characters", "k".repeat(65), "k".repeat(65)],
  ["empty", "", ""],
  ["with a colon", "k:1", "k:1"],
  ["with a space", "k 1", "k 1"],
  ["undefined", undefined, K1_ID],
];

for (const [why, keyId, result] of keyIdsAsGiven) {
  test(`[boundary-1] the key id is used as given: ${why}`, () => {
    const cipher = createTokenCipher(K1, { keyId });
    assert.equal(cipher.keyId, result);
  });
}

test("[unhappy-2] only the key is checked", () => {
  throwsCipherError(
    () => createTokenCipher("", { keyId: "" }),
    keyLengthMessage(0),
  );
});

test("[unhappy-2] a well-formed key id does not rescue a short key", () => {
  throwsCipherError(
    () =>
      createTokenCipher("AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHg==", {
        keyId: "prod",
      }),
    keyLengthMessage(31),
  );
});

// ---- encrypt / decrypt ---------------------------------------------------

const plaintexts: Array<[string, string]> = [
  ["a JWT-like token", "eyJhbGciOiJIUzI1NiJ9.access"],
  ["non-ASCII", "tökén 🔑"],
  ["empty", ""],
  ["100000 characters", "x".repeat(100000)],
];

for (const [why, plaintext] of plaintexts) {
  test(`[happy-3] round trip: ${why}`, () => {
    const cipher = createTokenCipher(K1);
    assert.equal(cipher.decrypt(cipher.encrypt(plaintext)), plaintext);
  });
}

test("[happy-4] the ciphertext has the documented layout", () => {
  const cipher = createTokenCipher(K1);
  const ciphertext = encrypt(cipher, "secret");

  assert.ok(ciphertext.startsWith("v1:"));
  assert.equal(ciphertext.length, 51);

  const body = ciphertext.slice(3);
  assert.equal(body.length, 48);
  assert.match(body, /^[A-Za-z0-9+/]*={0,2}$/);
  const bytes = Buffer.from(body, "base64");
  assert.equal(bytes.length, 34);
  // Padded standard base64 is canonical: re-encoding gives the same text.
  assert.equal(bytes.toString("base64"), body);

  assert.equal(ciphertext.includes("secret"), false);
  assert.equal(ciphertext.includes(K1_ID), false);
});

test("[happy-4] data is as long as the plaintext's UTF-8 bytes, not its characters", () => {
  const cipher = createTokenCipher(K1);
  const plaintext = "tökén 🔑";
  const bytes = bodyBytes(encrypt(cipher, plaintext));
  assert.equal(bytes.length, 12 + 16 + Buffer.byteLength(plaintext, "utf8"));
});

test("[happy-4] an explicit key id is not part of the ciphertext", () => {
  const cipher = createTokenCipher(K1, { keyId: "prod-key-2026" });
  const ciphertext = encrypt(cipher, "secret");
  assert.equal(ciphertext.includes("prod-key-2026"), false);
  assert.equal(ciphertext.length, 51);
});

test("[boundary-2] the empty plaintext has no data bytes", () => {
  const cipher = createTokenCipher(K1);
  const ciphertext = encrypt(cipher, "");
  const body = ciphertext.slice(3);
  assert.ok(ciphertext.startsWith("v1:"));
  assert.equal(body.length, 40);
  assert.equal(Buffer.from(body, "base64").length, 28);
});

test("[happy-5] encrypting the same plaintext twice gives different ciphertexts", () => {
  const cipher = createTokenCipher(K1);
  const first = encrypt(cipher, "secret");
  const second = encrypt(cipher, "secret");
  assert.notEqual(first, second);
  assert.equal(cipher.decrypt(first), "secret");
  assert.equal(cipher.decrypt(second), "secret");
});

test("[happy-5] each call draws a fresh IV, even for the empty plaintext", () => {
  const cipher = createTokenCipher(K1);
  const first = bodyBytes(encrypt(cipher, ""));
  const second = bodyBytes(encrypt(cipher, ""));
  assert.notDeepEqual(first.subarray(0, 12), second.subarray(0, 12));
  assert.equal(cipher.decrypt(`v1:${first.toString("base64")}`), "");
  assert.equal(cipher.decrypt(`v1:${second.toString("base64")}`), "");
});

test("[happy-6] a ciphertext is readable by another cipher built from the same key", () => {
  const cipher = createTokenCipher(K1);
  const other = createTokenCipher(
    " AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8 ",
  );
  assert.equal(other.decrypt(cipher.encrypt("secret")), "secret");
});

test("[happy-6] a cipher from the doubly padded key reads it too, in both directions", () => {
  const cipher = createTokenCipher(K1);
  const other = createTokenCipher(
    "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8==",
  );
  assert.equal(other.decrypt(cipher.encrypt("secret")), "secret");
  assert.equal(cipher.decrypt(other.encrypt("secret")), "secret");
});

test("[happy-7] the key id does not affect decryption", () => {
  const a = createTokenCipher(K1, { keyId: "old" });
  const b = createTokenCipher(K1, { keyId: "new" });
  assert.equal(b.decrypt(a.encrypt("secret")), "secret");
});

test("[happy-7] an empty key id decrypts what the default key id wrote", () => {
  const a = createTokenCipher(K1);
  const b = createTokenCipher(K1, { keyId: "" });
  assert.equal(b.decrypt(a.encrypt("secret")), "secret");
  assert.equal(a.decrypt(b.encrypt("secret")), "secret");
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

// ---- decrypt rejections --------------------------------------------------

const unrecognised: Array<[string, () => string]> = [
  ["empty string, not null", () => ""],
  ["no colon", () => "plaintext-token"],
  ["v1 with no colon", () => "v1"],
  [
    "unknown version",
    () => `v2${encrypt(createTokenCipher(K1), "secret").slice(2)}`,
  ],
  [
    "scheme is case-sensitive",
    () => `V1${encrypt(createTokenCipher(K1), "secret").slice(2)}`,
  ],
  [
    "scheme is not trimmed",
    () => ` ${encrypt(createTokenCipher(K1), "secret")}`,
  ],
];

for (const [why, ciphertext] of unrecognised) {
  test(`[unhappy-3] an unrecognised encoding: ${why}`, () => {
    const cipher = createTokenCipher(K1);
    const value = ciphertext();
    throwsCipherError(() => cipher.decrypt(value), UNRECOGNISED);
  });
}

const truncated: Array<[string, string]> = [
  ["no bytes", "v1:"],
  ["one byte too few", `v1:${Buffer.alloc(27).toString("base64")}`],
];

for (const [why, ciphertext] of truncated) {
  test(`[unhappy-4] a truncated ciphertext: ${why}`, () => {
    const cipher = createTokenCipher(K1);
    throwsCipherError(() => cipher.decrypt(ciphertext), TRUNCATED);
  });
}

test("[unhappy-5] a ciphertext under another key fails authentication", () => {
  const cipher = createTokenCipher(K1);
  const k2 = createTokenCipher(K2);
  const ciphertext = encrypt(k2, "secret");
  throwsCipherError(() => cipher.decrypt(ciphertext), UNAUTHENTICATED);
});

test("[unhappy-5] an empty plaintext under another key fails authentication", () => {
  const cipher = createTokenCipher(K1);
  const ciphertext = encrypt(createTokenCipher(K2), "");
  throwsCipherError(() => cipher.decrypt(ciphertext), UNAUTHENTICATED);
});

test("[unhappy-6] the same key id over a different key fails authentication", () => {
  const a = createTokenCipher(K1, { keyId: "prod" });
  const b = createTokenCipher(K2, { keyId: "prod" });
  const ciphertext = encrypt(a, "secret");
  throwsCipherError(() => b.decrypt(ciphertext), UNAUTHENTICATED);
});

test("[unhappy-6] a matching key id is not compared before authenticating", () => {
  // K2's default id over K1 still decrypts under K1 and fails under K2.
  const a = createTokenCipher(K1, { keyId: K2_ID });
  const b = createTokenCipher(K2);
  const ciphertext = encrypt(a, "secret");
  assert.equal(createTokenCipher(K1).decrypt(ciphertext), "secret");
  throwsCipherError(() => b.decrypt(ciphertext), UNAUTHENTICATED);
});

test("[boundary-4] 28 bytes that are not a ciphertext fail authentication", () => {
  const cipher = createTokenCipher(K1);
  throwsCipherError(
    () => cipher.decrypt(`v1:${Buffer.alloc(28).toString("base64")}`),
    UNAUTHENTICATED,
  );
});

test("[boundary-4] 28 zero bytes in unpadded base64 also reach authentication", () => {
  const cipher = createTokenCipher(K1);
  const body = Buffer.alloc(28).toString("base64").replace(/=+$/, "");
  throwsCipherError(() => cipher.decrypt(`v1:${body}`), UNAUTHENTICATED);
});

const tamperOffsets: Array<[number, string]> = [
  [0, "iv"],
  [12, "tag"],
  [28, "data"],
];

for (const [offset, part] of tamperOffsets) {
  test(`[unhappy-7] a tampered byte fails authentication: byte ${offset} (${part})`, () => {
    const cipher = createTokenCipher(K1);
    const bytes = bodyBytes(encrypt(cipher, "secret"));
    bytes[offset] = (bytes[offset] ?? 0) ^ 0x01;
    const tampered = `v1:${bytes.toString("base64")}`;

    assert.throws(
      () => cipher.decrypt(tampered),
      (error: unknown) => {
        assert.ok(error instanceof TokenCipherError);
        assert.equal(error.name, "TokenCipherError");
        assert.equal(error.message, UNAUTHENTICATED);
        assert.equal(error.message.includes("secret"), false);
        assert.equal(error.message.includes(K1), false);
        return true;
      },
    );
  });
}

test("[unhappy-8] the scheme is checked before the length, and the length before authentication", () => {
  const cipher = createTokenCipher(K1);
  const k2 = createTokenCipher(K2);
  const foreign = encrypt(k2, "secret");

  throwsCipherError(
    () => cipher.decrypt(`v2:${foreign.slice(3)}`),
    UNRECOGNISED,
  );

  const first27 = bodyBytes(foreign).subarray(0, 27).toString("base64");
  throwsCipherError(() => cipher.decrypt(`v1:${first27}`), TRUNCATED);
});

test("[unhappy-8] a wrong scheme over a too-short body reports the scheme", () => {
  const cipher = createTokenCipher(K1);
  throwsCipherError(() => cipher.decrypt("v2:"), UNRECOGNISED);
});

// ---- sameKeyId -------------------------------------------------------------

const sameKeyIdHappy: Array<[string, string, boolean]> = [
  ["0ebcb5deb52c", "0ebcb5deb52c", true],
  ["prod", "prod", true],
  ["prod", "staging", false],
];

for (const [left, right, result] of sameKeyIdHappy) {
  test(`[happy-8] comparing key ids: ${JSON.stringify(left)} and ${JSON.stringify(right)}`, () => {
    assert.equal(sameKeyId(left, right), result);
  });
}

const sameKeyIdBoundary: Array<[string, string, boolean]> = [
  ["prod", "Prod", false],
  ["prod", "prod ", false],
  ["", "", true],
  ["k:1", "k:1", true],
  ["k".repeat(65), "k".repeat(65), true],
  ["é", "e", false],
];

for (const [left, right, result] of sameKeyIdBoundary) {
  test(`[boundary-5] comparing key ids: ${JSON.stringify(left.length > 10 ? `${left.length} chars` : left)} and ${JSON.stringify(right.length > 10 ? `${right.length} chars` : right)}`, () => {
    assert.equal(sameKeyId(left, right), result);
  });
}
