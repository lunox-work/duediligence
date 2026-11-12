import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import { signState, verifyState } from "../../src/jira/state.js";

const SECRET = "0123456789abcdef0123456789abcdef";
const OTHER_SECRET = "another-secret-another-secret-xx";
const BASE = {
  organizationId: "org_1",
  userId: "user_1",
  returnTo: "/settings/jira",
} as const;
const T = 1700000000000;
const STATE_KEYS = ["organizationId", "userId", "returnTo", "issuedAt", "nonce"];
const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const MALFORMED = { ok: false, reason: "malformed" } as const;
const BAD_SIGNATURE = { ok: false, reason: "bad-signature" } as const;
const EXPIRED = { ok: false, reason: "expired" } as const;
const WRONG_USER = { ok: false, reason: "wrong-user" } as const;

function b64url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

function hmac(secret: string, payload: string): string {
  return createHmac("sha256", Buffer.from(secret, "utf8")).update(payload, "ascii").digest("base64url");
}

/** A value whose payload segment is `payload`, correctly signed under `secret`. */
function signedSegment(payload: string, secret = SECRET): string {
  return `${payload}.${hmac(secret, payload)}`;
}

/** A value whose payload is `json`, correctly signed under SECRET. */
function signedJson(json: string): string {
  return signedSegment(b64url(json));
}

function split(value: string): [string, string] {
  const parts = value.split(".");
  assert.equal(parts.length, 2, value);
  return [parts[0]!, parts[1]!];
}

function standard(): string {
  return signState(SECRET, { ...BASE, issuedAt: T, nonce: "n1" });
}

/** JSON for a state with `issuedAt`, in the spec's key order. */
function stateJson(fields: Partial<Record<string, unknown>> = {}): string {
  return JSON.stringify({ ...BASE, issuedAt: T, nonce: "n1", ...fields });
}

// ---- happy-10 ---------------------------------------------------------------

// Extends "[happy-10] a freshly signed value verifies a second later": other
// states and other times inside the window.
test("[happy-10] other freshly signed states verify and decode to their five fields", () => {
  const states = [
    { organizationId: "org_2", userId: "user_2", returnTo: "/", issuedAt: 0, nonce: "x" },
    { organizationId: "org_ü", userId: "日本_user", returnTo: "/r?x=1", issuedAt: 1234, nonce: "-_" },
    { organizationId: "o", userId: "u", returnTo: "", issuedAt: T + 5, nonce: "AAAAAAAAAAAAAAAAAAAAAA" },
  ];
  for (const state of states) {
    const value = signState(SECRET, state);
    for (const now of [state.issuedAt, state.issuedAt + 1, state.issuedAt + 599999]) {
      assert.deepEqual(verifyState(SECRET, value, state.userId, now), { ok: true, state }, `${state.userId} at ${now}`);
    }
  }
});

// Extends "[happy-10] a freshly signed value verifies at the instant it was issued":
// a value signed under another secret verifies under that secret.
test("[happy-10] a value verifies under the secret it was signed with", () => {
  const value = signState(OTHER_SECRET, { ...BASE, issuedAt: T, nonce: "n1" });
  const result = verifyState(OTHER_SECRET, value, "user_1", T + 1000);
  assert.deepEqual(result, { ok: true, state: { ...BASE, issuedAt: T, nonce: "n1" } });
  assert.ok(result.ok);
  assert.equal(typeof result.state.issuedAt, "number");
});

// Extends "[happy-10] a freshly signed value verifies a second later": a value
// built from the wire format by hand, not by signState, verifies too.
test("[happy-10] a hand-built value in the wire format verifies", () => {
  const json = stateJson({ organizationId: "org_hand", userId: "user_hand", returnTo: "/h" });
  assert.deepEqual(verifyState(SECRET, signedJson(json), "user_hand", T + 1000), {
    ok: true,
    state: { organizationId: "org_hand", userId: "user_hand", returnTo: "/h", issuedAt: T, nonce: "n1" },
  });
});

// ---- happy-11 ---------------------------------------------------------------

// Extends "[happy-11] verifyState with no now uses Date.now()": the window is
// applied against the mocked clock at both of its edges.
test("[happy-11] with no now, the window is measured against Date.now()", (t) => {
  let clock = T;
  t.mock.method(Date, "now", () => clock);
  const value = standard();
  for (const [at, result] of [
    [T + 600000, { ok: true, state: { ...BASE, issuedAt: T, nonce: "n1" } }],
    [T - 60000, { ok: true, state: { ...BASE, issuedAt: T, nonce: "n1" } }],
    [T - 60001, EXPIRED],
    [T + 600001, EXPIRED],
  ] as const) {
    clock = at;
    assert.deepEqual(verifyState(SECRET, value, "user_1"), result, `clock = T + ${at - T}`);
  }
});

// Extends "[happy-11] verifyState with no now reads the clock at call time":
// an explicit undefined now also means the current time.
test("[happy-11] an undefined now defaults to Date.now()", (t) => {
  let clock = T;
  t.mock.method(Date, "now", () => clock);
  const value = standard();
  assert.equal(verifyState(SECRET, value, "user_1", undefined).ok, true);
  clock = T + 86400000;
  assert.deepEqual(verifyState(SECRET, value, "user_1", undefined), EXPIRED);
});

// ---- boundary-9 -------------------------------------------------------------

// Extends "[boundary-9] the same value verifies twice with deep-equal results":
// many times, with failed verifications in between.
test("[boundary-9] a value verifies again and again, also after failed attempts", () => {
  const value = standard();
  const ok = { ok: true, state: { ...BASE, issuedAt: T, nonce: "n1" } };
  for (let i = 0; i < 10; i += 1) {
    assert.deepEqual(verifyState(SECRET, value, "user_1", T + i), ok);
    assert.deepEqual(verifyState(SECRET, value, "user_2", T + i), WRONG_USER);
    assert.deepEqual(verifyState(SECRET, value, "user_1", T + 600001), EXPIRED);
    assert.deepEqual(verifyState(OTHER_SECRET, value, "user_1", T + i), BAD_SIGNATURE);
  }
  assert.deepEqual(verifyState(SECRET, value, "user_1", T + 600000), ok);
});

// Extends "[boundary-9] a value verified once still verifies at the end of its window":
// two values sharing a nonce both verify, each more than once.
test("[boundary-9] values that share a nonce all verify, repeatedly", () => {
  const a = signState(SECRET, { ...BASE, issuedAt: T, nonce: "shared" });
  const b = signState(SECRET, { ...BASE, organizationId: "org_2", issuedAt: T, nonce: "shared" });
  const c = signState(SECRET, { ...BASE, userId: "user_3", issuedAt: T + 1, nonce: "shared" });
  for (let i = 0; i < 3; i += 1) {
    assert.equal(verifyState(SECRET, a, "user_1", T).ok, true);
    assert.equal(verifyState(SECRET, b, "user_1", T).ok, true);
    assert.equal(verifyState(SECRET, c, "user_3", T).ok, true);
  }
});

// ---- boundary-10 ------------------------------------------------------------

// Extends "[boundary-10] a value is valid from 60000 ms before to 600000 ms after issuedAt":
// the same edges for other issuedAt values.
test("[boundary-10] the window edges hold for other issuedAt values", () => {
  for (const issuedAt of [0, 1, 1234567, T + 99999]) {
    const value = signState(SECRET, { ...BASE, issuedAt, nonce: "n1" });
    for (const now of [issuedAt, issuedAt + 600000, issuedAt - 60000, issuedAt + 300000, issuedAt - 1]) {
      assert.equal(verifyState(SECRET, value, "user_1", now).ok, true, `${issuedAt} at ${now}`);
    }
    for (const now of [issuedAt + 600001, issuedAt - 60001, issuedAt + 10 ** 9, issuedAt - 10 ** 9]) {
      assert.deepEqual(verifyState(SECRET, value, "user_1", now), EXPIRED, `${issuedAt} at ${now}`);
    }
  }
});

// Extends "[boundary-10] a value outside the window, or at a NaN now, is expired":
// fractional and infinite now, compared exactly, not rounded.
test("[boundary-10] fractional and infinite now values are compared exactly", () => {
  const value = standard();
  for (const now of [T + 600000.5, T - 60000.5, Infinity, -Infinity, NaN]) {
    assert.deepEqual(verifyState(SECRET, value, "user_1", now), EXPIRED, String(now));
  }
  for (const now of [T + 599999.5, T - 59999.5, T + 0.25]) {
    assert.equal(verifyState(SECRET, value, "user_1", now).ok, true, String(now));
  }
});

// Extends "[boundary-10] a value outside the window, or at a NaN now, is expired":
// an issuedAt ahead of now (hand-signed, as a clock-skewed signer would make).
test("[boundary-10] an issuedAt up to 60000 ms ahead is valid, further ahead is expired", () => {
  const ahead = (ms: number) => signedJson(stateJson({ issuedAt: T + ms }));
  assert.equal(verifyState(SECRET, ahead(60000), "user_1", T).ok, true);
  assert.equal(verifyState(SECRET, ahead(59999), "user_1", T).ok, true);
  assert.deepEqual(verifyState(SECRET, ahead(60001), "user_1", T), EXPIRED);
  assert.deepEqual(verifyState(SECRET, ahead(3600000), "user_1", T), EXPIRED);
  assert.deepEqual(verifyState(SECRET, signedJson(stateJson({ issuedAt: 0 })), "user_1", NaN), EXPIRED);
});

// ---- unhappy-3 --------------------------------------------------------------

// Extends "[unhappy-3] values not in the wire format are malformed": other
// shapes, segment counts and characters, around a valid value.
test("[unhappy-3] other values not in the wire format are malformed", () => {
  const valid = standard();
  const [payload, signature] = split(valid);
  for (const value of [
    "..",
    "a..b",
    "a.b.",
    ".a.",
    "a.b.c.d",
    valid + ".",
    "." + valid,
    `${payload}..${signature}`,
    `${payload}.${signature}.${signature}`,
    valid + "=",
    valid + "==",
    `${payload}=.${signature}`,
    "=" + valid,
    `${payload}:${signature}`,
    `${payload}\t.${signature}`,
    `${payload}. ${signature}`,
    "a/b.c",
    "ä.b",
    "a.b\u0000",
    "a.b\r",
    "a。b",
    valid.toString() + " ",
  ]) {
    assert.deepEqual(verifyState(SECRET, value, "user_1", T), MALFORMED, JSON.stringify(value));
  }
});

// Extends "[unhappy-3] a correctly signed 4096-char value with one more char is malformed":
// a 4097-char value of allowed characters is malformed before any signature
// check, whatever its split.
test("[unhappy-3] any 4097-char value is malformed, and longer ones too", () => {
  for (const value of [
    "a".repeat(2048) + "." + "b".repeat(2048),
    "a".repeat(4053) + "." + "b".repeat(43),
    "a".repeat(1) + "." + "b".repeat(4095),
    "a".repeat(10000) + "." + "b".repeat(43),
  ]) {
    assert.ok(value.length >= 4097);
    assert.deepEqual(verifyState(SECRET, value, "user_1", T), MALFORMED, String(value.length));
  }
});

// Extends "[unhappy-3] values not in the wire format are malformed": a payload
// in standard base64 ("+" or "/") is malformed even when the HMAC over that
// segment is correct, because shape is checked before the signature.
test("[unhappy-3] a standard-base64 payload with a correct HMAC is malformed", () => {
  let found: string | undefined;
  for (let i = 0; i < 2000 && found === undefined; i += 1) {
    const standardB64 = Buffer.from(stateJson({ returnTo: `/?>?~${i}` }), "utf8").toString("base64").replace(/=+$/, "");
    if (/[+/]/.test(standardB64)) found = standardB64;
  }
  assert.ok(found !== undefined);
  assert.deepEqual(verifyState(SECRET, signedSegment(found), "user_1", T), MALFORMED);
});

// Extends "[unhappy-3] values not in the wire format are malformed": the
// correct signature written in standard base64 or with padding is malformed.
test("[unhappy-3] a correct signature in standard base64 or padded is malformed", () => {
  let found: { payload: string; signature: string } | undefined;
  for (let i = 0; i < 2000 && found === undefined; i += 1) {
    const [payload, signature] = split(signState(SECRET, { ...BASE, issuedAt: T, nonce: `n${i}` }));
    if (/[-_]/.test(signature)) found = { payload, signature };
  }
  assert.ok(found !== undefined);
  const standardSig = found.signature.replace(/-/g, "+").replace(/_/g, "/");
  assert.deepEqual(verifyState(SECRET, `${found.payload}.${standardSig}`, "user_1", T), MALFORMED);
  assert.deepEqual(verifyState(SECRET, `${found.payload}.${found.signature}=`, "user_1", T), MALFORMED);
});

// Extends "[unhappy-3] values not in the wire format are malformed": shape is
// reported before expiry and user, whatever now and the expected user are.
test("[unhappy-3] a malformed shape is reported at any now and for any user", () => {
  const valid = standard();
  for (const value of [undefined, "", "abc", valid + "\n"]) {
    for (const [user, now] of [["user_2", T + 86400000], ["", NaN], ["user_1", T - 60001]] as const) {
      assert.deepEqual(verifyState(SECRET, value, user, now), MALFORMED, `${JSON.stringify(value)} ${user} ${now}`);
    }
  }
});

// ---- unhappy-4 --------------------------------------------------------------

// Extends "[unhappy-4] a correctly signed payload that is not a valid state is malformed":
// other non-objects, each field missing in turn, and other wrong types.
test("[unhappy-4] other correctly signed non-states are malformed", () => {
  const json: string[] = [
    "true",
    "42",
    "[]",
    `[${stateJson()}]`,
    '""',
    "{",
    `${stateJson()} trailing`,
    `${stateJson()}}`,
  ];
  for (const key of STATE_KEYS) {
    const fields: Record<string, unknown> = { ...BASE, issuedAt: T, nonce: "n1" };
    delete fields[key];
    json.push(JSON.stringify(fields));
  }
  for (const [key, bad] of [
    ["organizationId", 1],
    ["organizationId", null],
    ["organizationId", ["org_1"]],
    ["userId", null],
    ["userId", ["user_1"]],
    ["userId", { id: "user_1" }],
    ["returnTo", 5],
    ["returnTo", {}],
    ["returnTo", false],
    ["issuedAt", null],
    ["issuedAt", true],
    ["issuedAt", [T]],
    ["issuedAt", { at: T }],
    ["issuedAt", -1700000000000],
    ["issuedAt", T + 0.5],
    ["nonce", 1],
    ["nonce", null],
    ["nonce", ["n1"]],
  ] as const) {
    json.push(stateJson({ [key]: bad }));
  }
  for (const text of json) {
    assert.deepEqual(verifyState(SECRET, signedJson(text), "user_1", T), MALFORMED, text);
  }
});

// Extends "[unhappy-4] a correctly signed empty object is malformed": a
// payload whose bytes are not valid UTF-8 does not decode as UTF-8 JSON.
test("[unhappy-4] a correctly signed payload of invalid UTF-8 is malformed", () => {
  const bytes = Buffer.concat([
    Buffer.from('{"organizationId":"org_', "utf8"),
    Buffer.from([0xff, 0xfe]),
    Buffer.from('","userId":"user_1","returnTo":"/","issuedAt":1700000000000,"nonce":"n1"}', "utf8"),
  ]);
  const payload = bytes.toString("base64url");
  assert.deepEqual(verifyState(SECRET, signedSegment(payload), "user_1", T), MALFORMED);
});

// Extends "[unhappy-4] a correctly signed payload that is not a valid state is malformed":
// the payload check comes before expiry and the user check.
test("[unhappy-4] an invalid payload is malformed even when it is also expired and for another user", () => {
  for (const text of [
    JSON.stringify({ organizationId: "org_1", userId: "user_2", returnTo: "/", issuedAt: 0 }),
    JSON.stringify({ organizationId: "", userId: "user_2", returnTo: "/", issuedAt: 0, nonce: "n1" }),
    "not json",
  ]) {
    assert.deepEqual(verifyState(SECRET, signedJson(text), "user_1", T + 86400000), MALFORMED, text);
    assert.deepEqual(verifyState(SECRET, signedJson(text), "user_1", NaN), MALFORMED, text);
  }
});

// ---- boundary-11 ------------------------------------------------------------

// Extends "[boundary-11] extra keys in a correctly signed payload are dropped":
// extras before the five fields, many of them, and a "__proto__" key.
test("[boundary-11] extra keys anywhere in a signed payload are dropped", () => {
  const value = signedJson(
    '{"__proto__":{"admin":true},"role":"owner","organizationId":"org_1","userId":"user_1","extra":null,"returnTo":"/","issuedAt":1700000000000,"nonce":"n1","admin":true,"n":[1,{"x":2}]}',
  );
  const result = verifyState(SECRET, value, "user_1", T);
  assert.deepEqual(result, {
    ok: true,
    state: { organizationId: "org_1", userId: "user_1", returnTo: "/", issuedAt: T, nonce: "n1" },
  });
  assert.ok(result.ok);
  assert.deepEqual(Object.keys(result.state).sort(), [...STATE_KEYS].sort());
  assert.equal((result.state as unknown as Record<string, unknown>).admin, undefined);
});

// Extends "[boundary-11] a nested extra key is dropped and the five fields are decoded":
// a signed payload in another key order and with whitespace is decoded, not
// re-serialised; the signature covers the segment as sent.
test("[boundary-11] a signed payload with other key order, whitespace and an extra key verifies", () => {
  const value = signedJson(
    '{ "nonce" : "n9", "issuedAt" : 1700000000000, "extra": 1, "returnTo":"/r", "userId":"user_1",\n "organizationId":"org_9" }',
  );
  assert.deepEqual(verifyState(SECRET, value, "user_1", T), {
    ok: true,
    state: { organizationId: "org_9", userId: "user_1", returnTo: "/r", issuedAt: T, nonce: "n9" },
  });
});

// ---- unhappy-5 --------------------------------------------------------------

// Extends "[unhappy-5] a value signed under another secret is a bad signature":
// other secret pairs, either way round.
test("[unhappy-5] values signed under other secrets are bad signatures", () => {
  const state = { ...BASE, issuedAt: T, nonce: "n1" };
  for (const [signer, verifier] of [
    [SECRET, OTHER_SECRET],
    [SECRET + "x", SECRET],
    [SECRET.slice(0, -1), SECRET],
    [SECRET.toUpperCase(), SECRET],
    ["k", "K"],
    ["sécret", "secret"],
  ] as const) {
    assert.deepEqual(
      verifyState(verifier, signState(signer, state), "user_1", T),
      BAD_SIGNATURE,
      `${signer} -> ${verifier}`,
    );
  }
});

// ---- unhappy-6 --------------------------------------------------------------

// Extends "[unhappy-6] a payload rewritten to user_2 with the old signature is a bad signature":
// the other fields rewritten, including an issuedAt moved forward to extend
// the lifetime.
test("[unhappy-6] any rewritten field with the old signature is a bad signature", () => {
  const [, signature] = split(standard());
  for (const [fields, now] of [
    [{ organizationId: "org_2" }, T],
    [{ returnTo: "/admin" }, T],
    [{ nonce: "n2" }, T],
    [{ issuedAt: T + 3600000 }, T + 3600000],
    [{ issuedAt: T + 1 }, T],
  ] as const) {
    const rewritten = b64url(stateJson(fields));
    assert.deepEqual(verifyState(SECRET, `${rewritten}.${signature}`, "user_1", now), BAD_SIGNATURE, JSON.stringify(fields));
  }
});

// Extends "[unhappy-6] a payload with a rewritten returnTo and the old signature is a bad signature":
// a payload segment re-encoded to the same JSON (other spacing, or a final
// character that decodes to the same bytes) is not the signed segment.
test("[unhappy-6] a payload segment that decodes the same but differs keeps no signature", () => {
  // Pick a nonce whose payload length leaves spare bits in the last character.
  let state: { organizationId: string; userId: string; returnTo: string; issuedAt: number; nonce: string } | undefined;
  for (const nonce of ["n1", "n12", "n123"]) {
    const candidate = { ...BASE, issuedAt: T, nonce };
    if (Buffer.byteLength(JSON.stringify(candidate), "utf8") % 3 !== 0) {
      state = candidate;
      break;
    }
  }
  assert.ok(state !== undefined);
  const [payload, signature] = split(signState(SECRET, state));
  const last = payload[payload.length - 1]!;
  const sameBytes = ALPHABET.split("")
    .map((c) => payload.slice(0, -1) + c)
    .filter((p) => p !== payload && Buffer.from(p, "base64url").equals(Buffer.from(payload, "base64url")));
  assert.ok(sameBytes.length > 0, last);
  for (const p of sameBytes) {
    assert.deepEqual(verifyState(SECRET, `${p}.${signature}`, "user_1", T), BAD_SIGNATURE, p);
  }
  const spaced = b64url(JSON.stringify(state, null, 1));
  assert.deepEqual(verifyState(SECRET, `${spaced}.${signature}`, "user_1", T), BAD_SIGNATURE);
});

// ---- unhappy-7 --------------------------------------------------------------

// Extends "[unhappy-7] a damaged signature is a bad signature": every other
// last character, including those that only change the unused low bits.
test("[unhappy-7] the signature with its last character changed to any other is a bad signature", () => {
  const [payload, signature] = split(standard());
  const last = signature[signature.length - 1]!;
  for (const c of ALPHABET) {
    if (c === last) continue;
    assert.deepEqual(
      verifyState(SECRET, `${payload}.${signature.slice(0, -1)}${c}`, "user_1", T),
      BAD_SIGNATURE,
      c,
    );
  }
});

// Extends "[unhappy-7] a damaged signature is a bad signature": damage at the
// start and in the middle, case flips, and other lengths.
test("[unhappy-7] signatures damaged elsewhere or of other lengths are bad signatures", () => {
  const [payload, signature] = split(standard());
  const swap = (s: string, i: number) => {
    const c = s[i]!;
    const replacement = ALPHABET[(ALPHABET.indexOf(c) + 1) % 64]!;
    return s.slice(0, i) + replacement + s.slice(i + 1);
  };
  const flipCase = (() => {
    const i = signature.search(/[A-Za-z]/);
    const c = signature[i]!;
    const flipped = c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase();
    return signature.slice(0, i) + flipped + signature.slice(i + 1);
  })();
  for (const damaged of [
    swap(signature, 0),
    swap(signature, 21),
    flipCase,
    signature.slice(1),
    signature.slice(0, 42),
    signature.slice(0, 32),
    "A".repeat(43),
    signature + signature.slice(0, 1),
    signature + "AAAAAAAA",
    hmac(SECRET, payload + "A"),
    hmac(OTHER_SECRET, payload),
    "-",
    "_",
  ]) {
    assert.deepEqual(verifyState(SECRET, `${payload}.${damaged}`, "user_1", T), BAD_SIGNATURE, damaged);
  }
});

// Extends "[unhappy-7] a damaged signature is a bad signature": a 4096-char
// value of allowed characters passes the shape check and fails on the
// signature.
test("[unhappy-7] an unsigned value of exactly 4096 allowed characters is a bad signature", () => {
  for (const value of [
    "a".repeat(4000) + "." + "b".repeat(95),
    "a".repeat(4052) + "." + "b".repeat(43),
  ]) {
    assert.equal(value.length, 4096);
    assert.deepEqual(verifyState(SECRET, value, "user_1", T), BAD_SIGNATURE);
  }
});

// ---- unhappy-8 --------------------------------------------------------------

// Extends "[unhappy-8] a bad signature is reported before a user mismatch inside the window":
// a bad signature is reported before an invalid payload too, and at a NaN now.
test("[unhappy-8] a bad signature is reported before an invalid payload, expiry and the user", () => {
  for (const payload of [
    b64url("not json"),
    b64url("{}"),
    b64url(JSON.stringify({ organizationId: "", userId: 7 })),
    "abc",
    b64url(stateJson({ userId: "user_2", issuedAt: 0 })),
  ]) {
    for (const [user, now] of [["user_2", T + 86400000], ["user_1", NaN], ["", T]] as const) {
      assert.deepEqual(
        verifyState(SECRET, `${payload}.${hmac(OTHER_SECRET, payload)}`, user, now),
        BAD_SIGNATURE,
        `${payload} ${user} ${now}`,
      );
    }
  }
});

// ---- unhappy-9 --------------------------------------------------------------

// Extends "[unhappy-9] verifyState with an empty secret throws a TypeError":
// any other value, user and now.
test("[unhappy-9] an empty secret throws a TypeError for any value", () => {
  const valid = standard();
  for (const value of ["", "abc", "a.b", valid + "\n", signState(OTHER_SECRET, { ...BASE, issuedAt: T, nonce: "n1" }), valid]) {
    for (const [user, now] of [["user_1", T], ["user_2", NaN], ["", T + 86400000]] as const) {
      assert.throws(() => verifyState("", value, user, now), TypeError, `${value} ${user} ${now}`);
    }
  }
});

// ---- unhappy-10 -------------------------------------------------------------

// Extends "[unhappy-10] another user, or the same id in other case or with a space, is wrong-user":
// prefixes, extensions, lookalikes and other fields' values.
test("[unhappy-10] near-miss expected user ids are wrong-user", () => {
  const value = standard();
  for (const expected of [
    "user_10",
    "user_",
    "user",
    " user_1",
    "\tuser_1",
    "user_1\u0000",
    "User_1",
    "uѕer_1",
    "user＿1",
    "org_1",
    "n1",
    "/settings/jira",
  ]) {
    assert.deepEqual(verifyState(SECRET, value, expected, T), WRONG_USER, JSON.stringify(expected));
  }
});

// Extends "[unhappy-10] an empty expected user id is wrong-user": a state
// whose userId differs only in case from the expected one.
test("[unhappy-10] a signed upper-case user id does not match its lower-case form", () => {
  const value = signState(SECRET, { ...BASE, userId: "USER_1", issuedAt: T, nonce: "n1" });
  assert.deepEqual(verifyState(SECRET, value, "user_1", T), WRONG_USER);
  assert.deepEqual(verifyState(SECRET, value, "USER_1", T), {
    ok: true,
    state: { ...BASE, userId: "USER_1", issuedAt: T, nonce: "n1" },
  });
});

// ---- unhappy-11 -------------------------------------------------------------

// Extends "[unhappy-11] an expired value for another user is expired": the
// skew side, a NaN now and an empty expected user.
test("[unhappy-11] expiry is reported before the user on both sides of the window", () => {
  const value = standard();
  for (const [user, now] of [
    ["user_2", T - 60001],
    ["user_2", NaN],
    ["", T + 86400000],
    ["USER_1", T + 600000.5],
  ] as const) {
    assert.deepEqual(verifyState(SECRET, value, user, now), EXPIRED, `${user} ${now}`);
  }
});

// Extends "[unhappy-11] at the last valid instant another user is wrong-user, not expired":
// the earliest valid instant too.
test("[unhappy-11] at the earliest valid instant another user is wrong-user, one ms earlier expired", () => {
  const value = standard();
  assert.deepEqual(verifyState(SECRET, value, "user_2", T - 60000), WRONG_USER);
  assert.deepEqual(verifyState(SECRET, value, "user_2", T - 60001), EXPIRED);
});
