import { test } from "node:test";
import assert from "node:assert/strict";
import { encode } from "../../src/index.js";

// A wire-format oracle, independent of both exported functions. Never use
// encode/decode round trips as the only evidence for correct wire bytes.
function wire(type: number, payload: Uint8Array): Uint8Array {
  const fields = [type, payload.length >>> 8, payload.length & 255, ...payload];
  const check = (-fields.reduce((sum, byte) => sum + byte, 0)) & 255;
  const out = [0x7e];
  for (const byte of [...fields, check]) {
    if (byte === 0x7d || byte === 0x7e || byte === 0x7f) out.push(0x7d, byte ^ 0x20);
    else out.push(byte);
  }
  out.push(0x7f);
  return Uint8Array.from(out);
}

// Extends "encodes the specified type and payload with their check byte".
test("[happy-1] uses new exact vectors including a zero check and repeated sum overflow", () => {
  assert.deepEqual(encode(0x31, Uint8Array.of(0, 1, 2, 250)),
    Uint8Array.of(0x7e, 0x31, 0, 4, 0, 1, 2, 250, 0xce, 0x7f));
  assert.deepEqual(encode(0xfc, Uint8Array.of(1, 1)),
    Uint8Array.of(0x7e, 0xfc, 0, 2, 1, 1, 0, 0x7f));
  const payload = Uint8Array.from({ length: 1025 }, (_, i) => (i * 73 + 19) & 255);
  assert.deepEqual(encode(0x91, payload), wire(0x91, payload));
});

// Extends "encodes an empty payload" and "accepts both endpoints of the valid type range".
test("[happy-1] encodes every valid type with both empty and nonempty payloads", () => {
  for (let type = 0; type <= 0xfe; type++) {
    for (const payload of [new Uint8Array(), Uint8Array.of(type, 255, 0, type ^ 0xa5)]) {
      assert.deepEqual(encode(type, payload), wire(type, payload), `type ${type}, length ${payload.length}`);
    }
  }
});

// Extends "encodes the specified type and payload with their check byte":
// a Uint8Array's bytes need not occupy its entire backing buffer.
test("[happy-1] encodes precisely a payload view with a nonzero byte offset", () => {
  const backing = Uint8Array.of(0x7f, 0xff, 0x10, 0x7d, 0, 0x7e, 0xff, 0x7f);
  const payload = backing.subarray(2, 6);
  assert.deepEqual(encode(0x43, payload), wire(0x43, Uint8Array.of(0x10, 0x7d, 0, 0x7e)));
});

// Extends "escapes the specified type and payload using an unescaped checksum"
// and "escapes each reserved byte when used as the type".
test("[boundary-1] escapes reserved types together with long alternating reserved payloads", () => {
  for (const type of [0x7f, 0x7d, 0x7e]) {
    const payload = Uint8Array.from({ length: 513 }, (_, i) => [0x7f, 0x7d, 0x7e, 0x5d, 0x5f][i % 5]);
    assert.deepEqual(encode(type, payload), wire(type, payload));
  }
});

// Extends "escapes all three reserved payload values".
test("[boundary-1] escapes repeated reserved bytes but leaves escape suffix values literal", () => {
  const payload = Uint8Array.from({ length: 768 }, (_, i) =>
    [0x7d, 0x7d, 0x7f, 0x7e, 0x5d, 0x5e, 0x5f, 0x20][i % 8]);
  assert.deepEqual(encode(0xa3, payload), wire(0xa3, payload));
});

// Extends "escapes each reserved check byte". Force each check while the
// type, low length byte and many payload bytes also need escaping.
test("[boundary-1] escapes all reserved check values when other fields also expand", () => {
  for (const type of [0x7d, 0x7e, 0x7f]) {
    for (const check of [0x7d, 0x7e, 0x7f]) {
      const payload = new Uint8Array(0x17f).fill(0x7e);
      const sum = type + 1 + 0x7f + 0x7e * (payload.length - 1);
      payload[payload.length - 1] = (-sum - check) & 255;
      const expected = wire(type, payload);
      assert.deepEqual(expected.slice(-3), Uint8Array.of(0x7d, check ^ 0x20, 0x7f));
      assert.deepEqual(encode(type, payload), expected);
    }
  }
});

// Extends "escapes either length byte without changing the payload length".
test("[boundary-1] escapes both length bytes simultaneously for all reserved combinations", () => {
  for (const hi of [0x7d, 0x7e, 0x7f]) {
    for (const lo of [0x7d, 0x7e, 0x7f]) {
      const payload = Uint8Array.from({ length: hi * 256 + lo }, (_, i) => (i * 29 + 7) & 255);
      assert.deepEqual(encode(0x7f, payload), wire(0x7f, payload));
    }
  }
});

// Extends "accepts the maximum payload length of 65535 bytes".
test("[unhappy-1] accepts a maximum payload even when its escaped wire length exceeds 65535", () => {
  const payload = Uint8Array.from({ length: 65535 }, (_, i) => [0x7d, 0x7f, 0x7e][i % 3]);
  assert.deepEqual(encode(0xfe, payload), wire(0xfe, payload));
});

// Extends "encodes the specified type and payload with their check byte".
test("[happy-1] carries the low length byte at several boundaries and includes both bytes in the sum", () => {
  for (const length of [254, 255, 256, 257, 511, 512, 65534]) {
    const payload = Uint8Array.from({ length }, (_, i) => (i + 201) & 255);
    assert.deepEqual(encode(0x22, payload), wire(0x22, payload));
  }
});

// Extends "rejects the reserved type and types just outside the byte range".
// The spec only names a generic error, not a particular message/subclass.
// A successful valid call in each rejection test also makes it fail against
// the unimplemented interface, whose generic Error cannot prove rejection.
test("[unhappy-1] rejects far out of range types instead of wrapping or clamping them", () => {
  assert.deepEqual(encode(0x52, Uint8Array.of(0xaa)), wire(0x52, Uint8Array.of(0xaa)));
  for (const type of [-Infinity, -2, -256, -65536, 257, 511, 65536, Infinity]) {
    assert.throws(() => encode(type, Uint8Array.of(0x7d, 0xff)), Error);
  }
});

// Extends "rejects the reserved type and types just outside the byte range".
test("[unhappy-1] rejects reserved type with populated payloads including escape-heavy data", () => {
  const payload = Uint8Array.from({ length: 300 }, (_, i) => (i % 2 ? 0x7f : 0x7d));
  assert.deepEqual(encode(0xfe, payload), wire(0xfe, payload));
  assert.throws(() => encode(0xff, payload), Error);
});

// Extends "rejects a payload one byte longer than the maximum".
test("[unhappy-1] rejects multiple oversized lengths instead of truncating to sixteen bits", () => {
  const valid = Uint8Array.of(0x88, 0x99);
  assert.deepEqual(encode(0x24, valid), wire(0x24, valid));
  for (const length of [65537, 65791, 131072]) {
    assert.throws(() => encode(0x24, new Uint8Array(length)), Error);
  }
});
