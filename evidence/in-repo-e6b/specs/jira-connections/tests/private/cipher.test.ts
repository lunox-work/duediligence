/**
 * Hidden suite for `TokenCipher` and `sameKeyId`.
 *
 * Every key is fixed. Where the spec defines a value by an algorithm (the
 * default key id is a SHA-256 prefix, the ciphertext is AES-256-GCM with AAD
 * `v1:<keyId>`), the expected value is computed independently with
 * `node:crypto`, using fixed IVs so nothing here is random.
 */

import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { test } from "node:test";

import {
  createTokenCipher,
  sameKeyId,
  TokenCipherError,
} from "../../src/cipher.js";

/** Bytes 0..31; default key id "630dcd29". */
const K1 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
/** Bytes 32..63; default key id "72dbb733". */
const K2 = "ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8=";
/** 32 × 0xff: uses "/" in its standard-base64 form. */
const K_FF = "//////////////////////////////////////////8=";
/** 32 × 0xfb: uses both "+" and "/". */
const K_FB = "+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/s=";
/** Bytes 64..95. */
const K3 = "QEFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaW1xdXl8=";

const KEY_MESSAGE = "Token cipher key must be 32 bytes, base64-encoded.";
const KEY_ID_MESSAGE =
  'Token cipher key id must be 1-64 characters of A-Z, a-z, 0-9, "_" or "-".';
const FORMAT_MESSAGE = "Ciphertext is not in the v1 format.";
const AUTH_MESSAGE =
  "Ciphertext failed authentication: wrong key or tampered data.";

const BASE64URL = /^[A-Za-z0-9_-]*$/;

/** A fixed 12-byte IV, so `node:crypto`-built ciphertexts are deterministic. */
const IV = Buffer.from("0102030405060708090a0b0c", "hex");

/** The default key id the spec defines: SHA-256 of the key bytes, 8 hex chars. */
function defaultKeyId(key: string): string {
  return createHash("sha256")
    .update(Buffer.from(key.trim(), "base64"))
    .digest("hex")
    .slice(0, 8);
}

/** Asserts `run` throws a `TokenCipherError` with exactly `message`. */
function throwsCipherError(run: () => unknown, message: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof TokenCipherError, "not a TokenCipherError");
    assert.equal(error.name, "TokenCipherError");
    assert.equal(error.message, message);
    return true;
  });
}

function fieldsOf(ciphertext: string | null): string[] {
  assert.equal(typeof ciphertext, "string");
  return (ciphertext as string).split(":");
}

function withField(
  ciphertext: string | null,
  position: number,
  value: string,
): string {
  const fields = fieldsOf(ciphertext);
  fields[position - 1] = value;
  return fields.join(":");
}

function field(ciphertext: string | null, position: number): string {
  return fieldsOf(ciphertext)[position - 1] ?? "";
}

/** `text` with the character at `index` swapped for a different base64url one. */
function flipAt(text: string, index: number): string {
  const replacement = text[index] === "Q" ? "g" : "Q";
  return text.slice(0, index) + replacement + text.slice(index + 1);
}

/** A v1 ciphertext built with `node:crypto`, with a chosen IV and AAD. */
function seal(
  key: string,
  keyId: string,
  plaintext: string,
  options: { iv?: Buffer; aad?: string | null } = {},
): string {
  const iv = options.iv ?? IV;
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), iv);
  const aad = options.aad === undefined ? `v1:${keyId}` : options.aad;
  if (aad !== null) {
    cipher.setAAD(Buffer.from(aad, "utf8"));
  }
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    keyId,
    iv.toString("base64url"),
    tag.toString("base64url"),
    data.toString("base64url"),
  ].join(":");
}

/** Opens a v1 ciphertext with `node:crypto`, using AAD `v1:<field 2>`. */
function open(key: string, ciphertext: string | null): string {
  const [version, keyId, iv, tag, data] = fieldsOf(ciphertext) as [
    string,
    string,
    string,
    string,
    string,
  ];
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "base64"),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(Buffer.from(`${version}:${keyId}`, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

// ---- [happy-1] An accepted key yields its default key id --------------------

// Extends "[happy-1] a padded 32-byte key yields its default key id": keys
// other than K1/K2, so a table of known ids cannot pass.
test("[happy-1] keys beyond K1 and K2, using '+' and '/', yield the SHA-256 default key id", () => {
  for (const key of [K_FF, K_FB, K3]) {
    const keyId = createTokenCipher(key).keyId;
    assert.equal(keyId, defaultKeyId(key), key);
    assert.match(keyId, /^[0-9a-f]{8}$/);
  }
  assert.equal(createTokenCipher(K_FF).keyId, "af961376");
  assert.equal(createTokenCipher(K3).keyId, "ca2a4fe7");
});

// Extends "[happy-1] an unpadded or whitespace-wrapped key yields the same default key id".
test("[happy-1] unpadded keys wrapped in tabs, CRLF and spaces are accepted", () => {
  for (const key of [K_FB, K_FF, K2]) {
    const unpadded = key.slice(0, 43);
    const expected = defaultKeyId(key);
    assert.equal(createTokenCipher(unpadded).keyId, expected);
    assert.equal(createTokenCipher(`\t${unpadded}\r\n`).keyId, expected);
    assert.equal(createTokenCipher(` \n ${key} \t`).keyId, expected);
  }
});

// Extends "[happy-1] a padded 32-byte key ...": the default id follows the key bytes.
test("[happy-1] different keys get different default key ids", () => {
  const ids = [K1, K2, K3, K_FF, K_FB].map((key) => createTokenCipher(key).keyId);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids.slice(0, 2), ["630dcd29", "72dbb733"]);
});

// ---- [unhappy-1] A rejected key throws TokenCipherError --------------------

// Extends "[unhappy-1] an empty, base64url or hex key throws TokenCipherError":
// a lenient base64 decoder accepts a lone "-" or "_".
test("[unhappy-1] a key with a single base64url character in place of '+' or '/' is rejected", () => {
  for (const key of [
    K_FB.replace("+", "-"),
    K_FB.replace("/", "_"),
    K_FF.replace("/", "_"),
    K_FB.slice(0, 43).replaceAll("+", "-").replaceAll("/", "_"),
  ]) {
    throwsCipherError(() => createTokenCipher(key), KEY_MESSAGE);
  }
});

// Extends "[unhappy-1] a key of 31 or 33 bytes, or with extra padding, ...":
// shapes a lenient decoder would still turn into 32 bytes.
test("[unhappy-1] internal whitespace, misplaced padding or stray characters reject the key", () => {
  for (const key of [
    `${K1.slice(0, 20)} ${K1.slice(20)}`,
    `${K1.slice(0, 20)}\n${K1.slice(20)}`,
    `=${K1.slice(0, 43)}`,
    `${K1.slice(0, 20)}=${K1.slice(20, 43)}`,
    `${K1.slice(0, 43)}= =`,
    `${K1.slice(0, 43)}.`,
    `${K1.slice(0, 42)}.`,
    `${K1.slice(0, 43)}===`,
    "=",
    "\t\n",
  ]) {
    throwsCipherError(() => createTokenCipher(key), KEY_MESSAGE);
  }
});

// Extends "[unhappy-1] a key of 31 or 33 bytes ...": other lengths.
test("[unhappy-1] keys of 16, 24, 42 characters and 64 bytes are rejected", () => {
  const sixtyFour = Buffer.alloc(64, 7).toString("base64");
  for (const key of [
    Buffer.alloc(16, 7).toString("base64"),
    Buffer.alloc(24, 7).toString("base64"),
    K1.slice(0, 42),
    sixtyFour,
    sixtyFour.replace(/=+$/, ""),
    `${K1}${K1}`,
  ]) {
    throwsCipherError(() => createTokenCipher(key), KEY_MESSAGE);
  }
});

// ---- [happy-2] An explicit key id replaces the default ---------------------

// Extends "[happy-2] an explicit key id replaces the default".
test("[happy-2] explicit key ids on other keys replace the default and are recorded", () => {
  const cases: Array<[string, string]> = [
    [K2, "prod"],
    [K3, "A"],
    [K_FB, "rotation-2027_Q1"],
    [K1, "630dcd30"],
  ];
  for (const [key, keyId] of cases) {
    const cipher = createTokenCipher(key, { keyId });
    assert.equal(cipher.keyId, keyId);
    const ciphertext = cipher.encrypt("secret");
    assert.equal(field(ciphertext, 2), keyId);
    assert.equal(cipher.decrypt(ciphertext), "secret");
  }
});

// ---- [boundary-1] Key id length and alphabet limits ------------------------

// Extends "[boundary-1] key ids of 1 and 64 characters are accepted ...":
// the full alphabet, not only "k".
test("[boundary-1] 1-, 63- and 64-character key ids over the whole alphabet are accepted", () => {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  assert.equal(alphabet.length, 64);
  for (const keyId of ["-", "_", "Z", "9", alphabet.slice(1), alphabet]) {
    assert.equal(createTokenCipher(K2, { keyId }).keyId, keyId);
  }
});

// Extends "[boundary-1] key ids of 65 or 0 characters, or with ':' or ' ', throw".
test("[boundary-1] key ids with a newline, '.', '/', '=', '+' or non-ASCII letters are rejected", () => {
  for (const keyId of [
    "k\n",
    "\nk",
    "k.1",
    "k/1",
    "k=1",
    "k+1",
    "é",
    "kéy",
    "\t",
    " k",
    "k ",
  ]) {
    throwsCipherError(() => createTokenCipher(K1, { keyId }), KEY_ID_MESSAGE);
  }
});

// Extends "[boundary-1] key ids of 65 ... throw": 65 over the mixed alphabet, and far longer.
test("[boundary-1] mixed-alphabet key ids of 65 and 200 characters are rejected", () => {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  for (const keyId of [`${alphabet}a`, "a1_-".repeat(50)]) {
    throwsCipherError(() => createTokenCipher(K2, { keyId }), KEY_ID_MESSAGE);
  }
});

// Extends "[boundary-1] ... undefined means the default": on other keys.
test("[boundary-1] an undefined key id on other keys means their own default", () => {
  assert.equal(createTokenCipher(K2, { keyId: undefined }).keyId, "72dbb733");
  assert.equal(
    createTokenCipher(K_FF, { keyId: undefined }).keyId,
    defaultKeyId(K_FF),
  );
  assert.equal(createTokenCipher(K3, {}).keyId, defaultKeyId(K3));
});

// ---- [unhappy-2] The key is checked before the key id ----------------------

// Extends "[unhappy-2] a wrong-length key is reported before a malformed key id".
test("[unhappy-2] base64url, hex, padded and 33-byte keys are reported before a bad key id", () => {
  for (const key of [
    "___________________________________________8",
    "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8==",
    "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8g",
    "   ",
  ]) {
    for (const keyId of ["", "k".repeat(65), "k 1", "é"]) {
      throwsCipherError(() => createTokenCipher(key, { keyId }), KEY_MESSAGE);
    }
  }
});

// ---- [happy-3] Round trip --------------------------------------------------

// Extends "[happy-3] a token and a non-ASCII string round-trip".
test("[happy-3] plaintexts with ':', '=', newlines, NUL and ciphertext-like text round-trip", () => {
  const cipher = createTokenCipher(K1);
  const lookalike = cipher.encrypt("inner") as string;
  for (const plaintext of [
    "a:b:c:d:e:f",
    "v1:630dcd29:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:",
    lookalike,
    "padded==",
    "line1\nline2\r\n",
    "nul\u0000byte",
    "+/=-_",
    "𝔘𝔫𝔦𝔠𝔬𝔡𝔢 — 中文 — עברית",
    " ",
  ]) {
    assert.equal(cipher.decrypt(cipher.encrypt(plaintext)), plaintext);
  }
});

// Extends "[happy-3] the empty string and a 100000-character string round-trip":
// a longer, multi-byte input.
test("[happy-3] a 300000-character multi-byte plaintext round-trips", () => {
  const cipher = createTokenCipher(K2, { keyId: "big" });
  const plaintext = "é🔑x".repeat(75000);
  assert.equal(cipher.decrypt(cipher.encrypt(plaintext)), plaintext);
});

// Extends "[happy-3] a token and a non-ASCII string round-trip": other ciphers.
test("[happy-3] the round trip holds for K2, K_FB and explicit key ids", () => {
  for (const cipher of [
    createTokenCipher(K2),
    createTokenCipher(K_FB),
    createTokenCipher(K3, { keyId: "a" }),
    createTokenCipher(K1, { keyId: "k".repeat(64) }),
  ]) {
    for (const plaintext of ["eyJhbGciOiJIUzI1NiJ9.access", "tökén 🔑", ""]) {
      assert.equal(cipher.decrypt(cipher.encrypt(plaintext)), plaintext);
    }
  }
});

// ---- [happy-4] The ciphertext has the documented layout --------------------

// Extends "[happy-4] the ciphertext has the documented layout": the fields are
// a real AES-256-GCM encryption with AAD "v1:<keyId>", opened here independently.
test("[happy-4] node:crypto opens the ciphertext with the key, the iv, the tag and AAD v1:<keyId>", () => {
  const cases: Array<[string, string | undefined, string]> = [
    [K1, undefined, "secret"],
    [K2, "prod", "eyJhbGciOiJIUzI1NiJ9.refresh"],
    [K_FB, undefined, "tökén 🔑"],
  ];
  for (const [key, keyId, plaintext] of cases) {
    const cipher = createTokenCipher(
      key,
      keyId === undefined ? {} : { keyId },
    );
    const ciphertext = cipher.encrypt(plaintext);
    assert.equal(field(ciphertext, 1), "v1");
    assert.equal(field(ciphertext, 2), keyId ?? defaultKeyId(key));
    assert.equal(open(key, ciphertext), plaintext);
  }
});

// Extends "[happy-4] the data field holds as many bytes as the plaintext's UTF-8".
test("[happy-4] a long plaintext's fields keep the layout and do not leak it", () => {
  const plaintext = "refresh-token-".repeat(40);
  const ciphertext = createTokenCipher(K2).encrypt(plaintext) as string;
  const fields = fieldsOf(ciphertext);
  assert.equal(fields.length, 5);
  assert.equal(fields[1], "72dbb733");
  for (const part of fields.slice(2)) {
    assert.match(part, BASE64URL);
  }
  assert.equal(fields[2]?.length, 16);
  assert.equal(fields[3]?.length, 22);
  const data = fields[4] ?? "";
  assert.equal(data.length, Math.ceil((Buffer.byteLength(plaintext) * 4) / 3));
  assert.equal(Buffer.from(data, "base64url").length, Buffer.byteLength(plaintext));
  assert.equal(ciphertext.includes("refresh-token"), false);
  assert.equal(ciphertext.includes("="), false);
});

// ---- [boundary-2] The empty plaintext has an empty data field --------------

// Extends "[boundary-2] the empty plaintext still carries a full iv and tag":
// other ciphers, and the tag checked by node:crypto.
test("[boundary-2] the empty plaintext under other keys ends with ':' and opens to ''", () => {
  for (const [key, keyId] of [
    [K2, "prod"],
    [K_FF, undefined],
  ] as Array<[string, string | undefined]>) {
    const ciphertext = createTokenCipher(
      key,
      keyId === undefined ? {} : { keyId },
    ).encrypt("");
    assert.equal(typeof ciphertext, "string");
    assert.equal((ciphertext as string).endsWith(":"), true);
    assert.equal(field(ciphertext, 5), "");
    assert.equal(field(ciphertext, 2), keyId ?? defaultKeyId(key));
    assert.equal(open(key, ciphertext), "");
  }
});

// Extends "[boundary-2] the empty plaintext has an empty data field": decrypting
// an externally built empty ciphertext.
test("[boundary-2] an empty-data ciphertext built with node:crypto decrypts to ''", () => {
  const ciphertext = seal(K1, "630dcd29", "");
  assert.equal(ciphertext.endsWith(":"), true);
  assert.equal(createTokenCipher(K1).decrypt(ciphertext), "");
});

// ---- [happy-5] Encrypting the same plaintext twice gives different ciphertexts

// Extends "[happy-5] encrypting the same plaintext twice gives different ciphertexts":
// two ciphers from the same key must not share an IV sequence.
test("[happy-5] two ciphers from the same key give different ivs for the same plaintext", () => {
  const one = createTokenCipher(K1);
  const two = createTokenCipher(K1);
  const a = one.encrypt("secret");
  const b = two.encrypt("secret");
  assert.notEqual(a, b);
  assert.notEqual(field(a, 3), field(b, 3));
  assert.equal(two.decrypt(a), "secret");
  assert.equal(one.decrypt(b), "secret");
});

// Extends "[happy-5] encrypting the same plaintext twice ...": many calls.
test("[happy-5] forty encryptions of one plaintext all have distinct ivs and decrypt", () => {
  const cipher = createTokenCipher(K2, { keyId: "prod" });
  const ciphertexts = Array.from({ length: 40 }, () => cipher.encrypt("secret"));
  assert.equal(new Set(ciphertexts).size, 40);
  assert.equal(new Set(ciphertexts.map((c) => field(c, 3))).size, 40);
  for (const ciphertext of ciphertexts) {
    assert.equal(cipher.decrypt(ciphertext), "secret");
  }
});

// ---- [happy-6] A ciphertext is readable by another cipher built from the same key and key id

// Extends "[happy-6] another cipher built from the same key reads the ciphertext":
// the other party is node:crypto, following the spec's format.
test("[happy-6] a ciphertext sealed with node:crypto under the spec's format is readable", () => {
  assert.equal(
    createTokenCipher(K1).decrypt(seal(K1, "630dcd29", "secret")),
    "secret",
  );
  assert.equal(
    createTokenCipher(K2, { keyId: "prod" }).decrypt(
      seal(K2, "prod", "tökén 🔑", { iv: Buffer.alloc(12, 0xab) }),
    ),
    "tökén 🔑",
  );
});

// Extends "[happy-6] an explicit key id equal to the default reads a default-id ciphertext".
test("[happy-6] ciphers sharing a key and an explicit key id read each other's ciphertexts", () => {
  const a = createTokenCipher(K_FB, { keyId: "prod" });
  const b = createTokenCipher(`\t${K_FB.slice(0, 43)}\n`, { keyId: "prod" });
  assert.equal(b.decrypt(a.encrypt("secret")), "secret");
  assert.equal(a.decrypt(b.encrypt("other-secret")), "other-secret");
});

// ---- [boundary-3] null passes through both directions ----------------------

// Extends "[boundary-3] null passes through both directions": interleaved with
// other calls, and kept distinct from "".
test("[boundary-3] null stays null around other calls, while '' encrypts to a string", () => {
  const cipher = createTokenCipher(K_FF);
  const empty = cipher.encrypt("");
  assert.equal(cipher.encrypt(null), null);
  assert.equal(cipher.decrypt(cipher.encrypt("x")), "x");
  assert.equal(cipher.decrypt(null), null);
  assert.equal(cipher.decrypt(cipher.encrypt(null)), null);
  assert.equal(typeof empty, "string");
  assert.equal(cipher.decrypt(empty), "");
});

// ---- [unhappy-3] A malformed ciphertext ------------------------------------

// Extends "[unhappy-3] an empty, single-field, v2 or six-field ciphertext is not v1".
test("[unhappy-3] other field counts and version spellings are not v1", () => {
  const cipher = createTokenCipher(K1);
  const valid = cipher.encrypt("secret") as string;
  const fields = fieldsOf(valid);
  for (const ciphertext of [
    fields.slice(0, 4).join(":"),
    fields.slice(0, 2).join(":"),
    `${valid}:`,
    `${valid}::`,
    `:${valid}`,
    "::::",
    "v1::::",
    withField(valid, 1, "V1"),
    withField(valid, 1, "v10"),
    withField(valid, 1, " v1"),
    withField(valid, 1, ""),
    ` ${valid}`,
    `${valid}\n`,
    `${valid} `,
  ]) {
    throwsCipherError(() => cipher.decrypt(ciphertext), FORMAT_MESSAGE);
  }
});

// Extends "[unhappy-3] a bad key id, short iv, short tag, padded or standard-base64 data is not v1".
test("[unhappy-3] a key id outside the pattern is not v1", () => {
  const cipher = createTokenCipher(K1);
  const valid = cipher.encrypt("secret");
  for (const keyId of ["k".repeat(65), "k.1", "k 1", "é", "630dcd29\n"]) {
    throwsCipherError(
      () => cipher.decrypt(withField(valid, 2, keyId)),
      FORMAT_MESSAGE,
    );
  }
});

// Extends "[unhappy-3] a bad key id, short iv, short tag ...": iv and tag of the
// wrong decoded length, or using characters outside base64url while keeping length.
test("[unhappy-3] an iv or tag of the wrong size or alphabet is not v1", () => {
  const cipher = createTokenCipher(K1);
  const valid = cipher.encrypt("secret");
  const iv = field(valid, 3);
  const tag = field(valid, 4);
  for (const ciphertext of [
    withField(valid, 3, ""),
    withField(valid, 3, iv.slice(0, 8)),
    withField(valid, 3, Buffer.alloc(16, 1).toString("base64url")),
    withField(valid, 3, `+${iv.slice(1)}`),
    withField(valid, 3, `/${iv.slice(1)}`),
    withField(valid, 3, `${iv.slice(0, 15)}.`),
    withField(valid, 4, ""),
    withField(valid, 4, Buffer.alloc(12, 1).toString("base64url")),
    withField(valid, 4, Buffer.alloc(32, 1).toString("base64url")),
    withField(valid, 4, `${tag}==`),
    withField(valid, 4, `/${tag.slice(1)}`),
  ]) {
    throwsCipherError(() => cipher.decrypt(ciphertext), FORMAT_MESSAGE);
  }
});

// Extends "[unhappy-3] ... padded or standard-base64 data is not v1": "/" and other characters.
test("[unhappy-3] data with '/', '.', a space or a newline is not v1", () => {
  const cipher = createTokenCipher(K1);
  const valid = cipher.encrypt("secret-value");
  const data = field(valid, 5);
  for (const replaced of [
    `/${data.slice(1)}`,
    `${data.slice(0, 4)}.${data.slice(5)}`,
    `${data.slice(0, 4)} ${data.slice(5)}`,
    `${data}\n`,
    `${data}==`,
  ]) {
    throwsCipherError(
      () => cipher.decrypt(withField(valid, 5, replaced)),
      FORMAT_MESSAGE,
    );
  }
});

// ---- [unhappy-4] A ciphertext recorded under another key id ----------------

// Extends "[unhappy-4] a ciphertext recorded under another key id is refused":
// other ids, so the message is built from the actual ids.
test("[unhappy-4] the refusal names the recorded id and the cipher's own id", () => {
  const cases: Array<[string, string, string, string]> = [
    [K1, "staging", K1, "prod"],
    [K2, "72dbb733", K2, "rotated"],
    [K1, "prod", K1, "630dcd29"],
    [K3, "k".repeat(64), K3, "k".repeat(63)],
  ];
  for (const [writeKey, writeId, readKey, readId] of cases) {
    const writer = createTokenCipher(writeKey, { keyId: writeId });
    const reader = createTokenCipher(readKey, { keyId: readId });
    throwsCipherError(
      () => reader.decrypt(writer.encrypt("secret")),
      `Ciphertext was encrypted with key "${writeId}", not "${readId}".`,
    );
  }
});

// Extends "[unhappy-4] a ciphertext recorded under another key id is refused":
// the default-id reader names its computed default, and the message leaks nothing.
test("[unhappy-4] a default-id cipher over K3 names its default id and leaks no key", () => {
  const reader = createTokenCipher(K3);
  const writer = createTokenCipher(K1, { keyId: "prod" });
  const message = `Ciphertext was encrypted with key "prod", not "${defaultKeyId(K3)}".`;
  assert.throws(
    () => reader.decrypt(writer.encrypt("secret")),
    (error: unknown) => {
      assert.ok(error instanceof TokenCipherError);
      assert.equal(error.message, message);
      assert.equal(error.message.includes(K1), false);
      assert.equal(error.message.includes(K3), false);
      assert.equal(error.message.includes("secret"), false);
      return true;
    },
  );
});

// ---- [unhappy-5] The same key id over a different key fails authentication

// Extends "[unhappy-5] the same key id over a different key fails authentication":
// a reader that claims K1's default id over K2.
test("[unhappy-5] a K2 cipher claiming K1's default id fails authentication", () => {
  const impostor = createTokenCipher(K2, { keyId: "630dcd29" });
  throwsCipherError(
    () => impostor.decrypt(createTokenCipher(K1).encrypt("secret")),
    AUTH_MESSAGE,
  );
  throwsCipherError(
    () =>
      createTokenCipher(K1).decrypt(impostor.encrypt("x".repeat(5000))),
    AUTH_MESSAGE,
  );
});

// ---- [unhappy-6] Relabelling the key id is detected ------------------------

// Extends "[unhappy-6] relabelling the key id is detected": relabel to the
// reader's default id, and ciphertexts sealed under a different AAD.
test("[unhappy-6] a ciphertext relabelled to the reader's default id fails authentication", () => {
  const a = createTokenCipher(K1, { keyId: "old" });
  const b = createTokenCipher(K1);
  const c = withField(a.encrypt("secret"), 2, "630dcd29");
  throwsCipherError(() => b.decrypt(c), AUTH_MESSAGE);
});

// Extends "[unhappy-6] relabelling the key id is detected": the AAD must be
// exactly "v1:<keyId>".
test("[unhappy-6] ciphertexts sealed with AAD other than v1:<keyId> fail authentication", () => {
  const reader = createTokenCipher(K1, { keyId: "new" });
  for (const aad of [null, "v1:old", "new", "v1:new:", "V1:new", ""]) {
    throwsCipherError(
      () => reader.decrypt(seal(K1, "new", "secret", { aad })),
      AUTH_MESSAGE,
    );
  }
  assert.equal(reader.decrypt(seal(K1, "new", "secret")), "secret");
});

// ---- [unhappy-7] A tampered field fails authentication ---------------------

// Extends "[unhappy-7] a tampered iv, tag or data fails authentication without
// leaking": other positions than the first character.
test("[unhappy-7] tampering a middle character of iv, tag or data fails authentication", () => {
  const cipher = createTokenCipher(K1);
  const plaintext = "super-secret-refresh-token";
  const cases: Array<[number, number]> = [
    [3, 7],
    [3, 15],
    [4, 10],
    [4, 20],
    [5, 9],
    [5, 30],
  ];
  for (const [position, index] of cases) {
    const valid = cipher.encrypt(plaintext);
    const tampered = withField(
      valid,
      position,
      flipAt(field(valid, position), index),
    );
    assert.throws(
      () => cipher.decrypt(tampered),
      (error: unknown) => {
        assert.ok(error instanceof TokenCipherError);
        assert.equal(error.name, "TokenCipherError");
        assert.equal(error.message, AUTH_MESSAGE);
        assert.equal(error.message.includes(plaintext), false);
        assert.equal(error.message.includes("secret"), false);
        assert.equal(error.message.includes(K1), false);
        return true;
      },
      `field ${position} index ${index}`,
    );
  }
});

// Extends "[unhappy-7] tampering the data of a one-character plaintext fails
// authentication": spliced fields and changed data length.
test("[unhappy-7] a swapped tag, a swapped iv, or data cut or extended by a byte fails authentication", () => {
  const cipher = createTokenCipher(K1);
  const one = cipher.encrypt("secret");
  const two = cipher.encrypt("secret");
  const data = Buffer.from(field(one, 5), "base64url");
  for (const tampered of [
    withField(one, 4, field(two, 4)),
    withField(one, 3, field(two, 3)),
    withField(one, 5, data.subarray(0, data.length - 1).toString("base64url")),
    withField(
      one,
      5,
      Buffer.concat([data, Buffer.from([0])]).toString("base64url"),
    ),
    withField(one, 5, ""),
  ]) {
    throwsCipherError(() => cipher.decrypt(tampered), AUTH_MESSAGE);
  }
});

// ---- [unhappy-8] The format is checked before the key id, and the key id before authentication

// Extends "[unhappy-8] the format is checked before the key id": other format faults.
test("[unhappy-8] a foreign-key ciphertext with any format fault reports the format", () => {
  const cipher = createTokenCipher(K1);
  const valid = createTokenCipher(K2).encrypt("secret");
  for (const c of [
    withField(valid, 1, "v2"),
    `${valid}:x`,
    withField(valid, 3, field(valid, 3).slice(0, 15)),
    withField(valid, 5, `${field(valid, 5)}=`),
    withField(valid, 5, `+${field(valid, 5).slice(1)}`),
  ]) {
    throwsCipherError(() => cipher.decrypt(c), FORMAT_MESSAGE);
  }
});

// Extends "[unhappy-8] the key id is checked before authentication": other
// authentication faults on a foreign-key ciphertext.
test("[unhappy-8] a foreign-key ciphertext with a tampered iv or tag reports the key id", () => {
  const cipher = createTokenCipher(K1);
  const valid = createTokenCipher(K2).encrypt("secret");
  for (const c of [
    withField(valid, 3, flipAt(field(valid, 3), 0)),
    withField(valid, 4, flipAt(field(valid, 4), 5)),
    withField(valid, 5, ""),
  ]) {
    throwsCipherError(
      () => cipher.decrypt(c),
      'Ciphertext was encrypted with key "72dbb733", not "630dcd29".',
    );
  }
});

// ---- [happy-7] / [boundary-4] Comparing key ids ----------------------------

// Extends "[happy-7] sameKeyId is true for identical valid key ids".
test("[happy-7] sameKeyId is true for identical one-character and mixed-alphabet ids", () => {
  for (const id of [
    "a",
    "-",
    "_",
    "9",
    "72dbb733",
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-",
  ]) {
    assert.equal(sameKeyId(id, id), true, id);
    assert.equal(sameKeyId(id, id.slice(0)), true, id);
  }
});

// Extends "[boundary-4] sameKeyId is false for case, whitespace, different or
// invalid ids": one side valid, prefixes, length mismatches, a trailing newline.
test("[boundary-4] sameKeyId is false for prefixes, one-sided invalid ids and near-valid ids", () => {
  const cases: Array<[string, string]> = [
    ["prod", "k:1"],
    ["k:1", "prod"],
    ["prod", ""],
    ["", "prod"],
    ["prod", "prodx"],
    ["prodx", "prod"],
    ["a", "ab"],
    ["prod\n", "prod\n"],
    ["é", "é"],
    [" prod", " prod"],
    ["PROD", "prod"],
    ["k".repeat(64), "k".repeat(65)],
    ["k.1", "k.1"],
  ];
  for (const [left, right] of cases) {
    assert.equal(sameKeyId(left, right), false, JSON.stringify([left, right]));
  }
});
