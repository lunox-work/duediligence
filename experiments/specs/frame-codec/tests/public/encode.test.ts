import { test } from "node:test";
import assert from "node:assert/strict";
import { encode } from "../../src/index.js";

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

function encoded(type: number, payload: Uint8Array): number[] {
  return Array.from(encode(type, payload));
}

test("[happy-1] type 0x01 with payload 10 20 encodes as 7E 01 00 02 10 20 CD 7F", () => {
  assert.deepEqual(encoded(0x01, bytes(0x10, 0x20)), [0x7e, 0x01, 0x00, 0x02, 0x10, 0x20, 0xcd, 0x7f]);
});

test("[happy-1] an empty payload encodes as 7E 01 00 00 FF 7F", () => {
  assert.deepEqual(encoded(0x01, bytes()), [0x7e, 0x01, 0x00, 0x00, 0xff, 0x7f]);
});

test("[boundary-1] reserved bytes in the type and payload are escaped, the length counts unescaped bytes", () => {
  // Check byte: 0x7E + 0x00 + 0x03 + 0x7D + 0x7F + 0x00 = 381, 381 + 0x83 = 512.
  assert.deepEqual(encoded(0x7e, bytes(0x7d, 0x7f, 0x00)), [
    0x7e,
    0x7d, 0x5e,
    0x00, 0x03,
    0x7d, 0x5d, 0x7d, 0x5f, 0x00,
    0x83,
    0x7f,
  ]);
});

test("[boundary-1] a check byte of 0x7E is computed on unescaped bytes and escaped itself", () => {
  // 0x01 + 0x00 + 0x01 + 0x80 = 130, 130 + 0x7E = 256.
  assert.deepEqual(encoded(0x01, bytes(0x80)), [0x7e, 0x01, 0x00, 0x01, 0x80, 0x7d, 0x5e, 0x7f]);
});

test("[boundary-1] a length byte of 0x7D is escaped", () => {
  // 125 zero bytes: length 00 7D; 0x7D + 0x83 = 256.
  const payload = new Uint8Array(0x7d);
  const expected = [0x7e, 0x00, 0x00, 0x7d, 0x5d, ...new Array<number>(0x7d).fill(0), 0x83, 0x7f];
  assert.deepEqual(encoded(0x00, payload), expected);
});

test("[unhappy-1] the reserved type 0xFF cannot be encoded", () => {
  assert.throws(() => encode(0xff, bytes(0x01)));
});

test("[unhappy-1] types outside 0 to 255 cannot be encoded", () => {
  assert.throws(() => encode(0x100, bytes(0x01)));
  assert.throws(() => encode(-1, bytes(0x01)));
});

test("[unhappy-1] a payload of 65536 bytes cannot be encoded", () => {
  assert.throws(() => encode(0x01, new Uint8Array(65536)));
});

test("[unhappy-1] a payload of 65535 bytes and type 0xFE are still encodable", () => {
  // 0xFE + 0xFF + 0xFF = 764, 764 + 0x04 = 768.
  const out = encode(0xfe, new Uint8Array(65535));
  assert.equal(out.length, 1 + 1 + 2 + 65535 + 1 + 1);
  assert.deepEqual(Array.from(out.subarray(0, 4)), [0x7e, 0xfe, 0xff, 0xff]);
  assert.deepEqual(Array.from(out.subarray(out.length - 2)), [0x04, 0x7f]);
});
