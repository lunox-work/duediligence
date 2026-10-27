import { test } from "node:test";
import assert from "node:assert/strict";
import { encode } from "../../src/index.js";

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

function encoded(type: number, payload: Uint8Array): number[] {
  return Array.from(encode(type, payload));
}

function escaped(values: number[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (v === 0x7e || v === 0x7f || v === 0x7d) out.push(0x7d, v ^ 0x20);
    else out.push(v);
  }
  return out;
}

// The frame the spec defines, built independently of the code under test.
function reference(type: number, payload: number[]): number[] {
  const len = payload.length;
  let sum = type + (len >> 8) + (len & 0xff);
  for (const p of payload) sum += p;
  const check = (256 - (sum % 256)) % 256;
  return [0x7e, ...escaped([type, len >> 8, len & 0xff, ...payload, check]), 0x7f];
}

function fails(type: number, payload: Uint8Array): void {
  assert.throws(
    () => encode(type, payload),
    (error: unknown) => error instanceof Error && error.message !== "not implemented",
    `type ${type}, payload of ${payload.length} bytes`,
  );
}

// Extends "[happy-1] type 0x01 with payload 10 20 encodes as 7E 01 00 02 10 20 CD 7F".
test("[happy-1] type 0x00 with payload 01 02 03 encodes as 7E 00 00 03 01 02 03 F7 7F", () => {
  assert.deepEqual(encoded(0x00, bytes(0x01, 0x02, 0x03)), [0x7e, 0x00, 0x00, 0x03, 0x01, 0x02, 0x03, 0xf7, 0x7f]);
});

// Extends "[happy-1] type 0x01 with payload 10 20 encodes as 7E 01 00 02 10 20 CD 7F".
test("[happy-1] a sum already a multiple of 256 gives check byte 0x00", () => {
  // 0x10 + 0x02 + 0xF0 + 0xFE = 512.
  assert.deepEqual(encoded(0x10, bytes(0xf0, 0xfe)), [0x7e, 0x10, 0x00, 0x02, 0xf0, 0xfe, 0x00, 0x7f]);
});

// Extends "[happy-1] type 0x01 with payload 10 20 encodes as 7E 01 00 02 10 20 CD 7F".
test("[happy-1] a sum wrapping several times past 256 gives the right check byte", () => {
  // 0xFE + 0x04 + 4 * 0xFF = 1278, 1278 + 0x02 = 1280.
  assert.deepEqual(encoded(0xfe, bytes(0xff, 0xff, 0xff, 0xff)), [
    0x7e, 0xfe, 0x00, 0x04, 0xff, 0xff, 0xff, 0xff, 0x02, 0x7f,
  ]);
});

// Extends "[happy-1] an empty payload encodes as 7E 01 00 00 FF 7F".
test("[happy-1] empty payloads of types 0x00 and 0xFE encode with check bytes 00 and 02", () => {
  assert.deepEqual(encoded(0x00, bytes()), [0x7e, 0x00, 0x00, 0x00, 0x00, 0x7f]);
  assert.deepEqual(encoded(0xfe, bytes()), [0x7e, 0xfe, 0x00, 0x00, 0x02, 0x7f]);
});

// Extends "[happy-1] type 0x01 with payload 10 20 encodes as 7E 01 00 02 10 20 CD 7F": a length above 255.
test("[happy-1] a 300-byte payload has length bytes 01 2C big-endian, both counted in the check byte", () => {
  // 0x02 + 0x01 + 0x2C + 300 * 0x01 = 347, 347 + 0xA5 = 512.
  const payload = new Array<number>(300).fill(0x01);
  assert.deepEqual(encoded(0x02, Uint8Array.from(payload)), [0x7e, 0x02, 0x01, 0x2c, ...payload, 0xa5, 0x7f]);
});

// Extends "[happy-1] type 0x01 with payload 10 20 encodes as 7E 01 00 02 10 20 CD 7F".
test("[happy-1] a payload given as a view into a larger buffer encodes only the view's bytes", () => {
  const view = bytes(0xaa, 0xbb, 0x10, 0x20, 0xcc).subarray(2, 4);
  const out = encode(0x01, view);
  assert.ok(out instanceof Uint8Array);
  assert.deepEqual(Array.from(out), [0x7e, 0x01, 0x00, 0x02, 0x10, 0x20, 0xcd, 0x7f]);
});

// Extends "[boundary-1] reserved bytes in the type and payload are escaped, the length counts unescaped bytes".
test("[boundary-1] types 0x7D and 0x7F are escaped as 7D 5D and 7D 5F", () => {
  // 0x7D + 0x83 = 256.
  assert.deepEqual(encoded(0x7d, bytes()), [0x7e, 0x7d, 0x5d, 0x00, 0x00, 0x83, 0x7f]);
  // 0x7F + 0x01 + 0x7E = 254, 254 + 0x02 = 256.
  assert.deepEqual(encoded(0x7f, bytes(0x7e)), [0x7e, 0x7d, 0x5f, 0x00, 0x01, 0x7d, 0x5e, 0x02, 0x7f]);
});

// Extends "[boundary-1] a check byte of 0x7E is computed on unescaped bytes and escaped itself".
test("[boundary-1] check bytes of 0x7F and 0x7D are computed on unescaped bytes and escaped themselves", () => {
  // 0x01 + 0x01 + 0x7F = 129, 129 + 0x7F = 256.
  assert.deepEqual(encoded(0x01, bytes(0x7f)), [0x7e, 0x01, 0x00, 0x01, 0x7d, 0x5f, 0x7d, 0x5f, 0x7f]);
  // 0x01 + 0x01 + 0x81 = 131, 131 + 0x7D = 256.
  assert.deepEqual(encoded(0x01, bytes(0x81)), [0x7e, 0x01, 0x00, 0x01, 0x81, 0x7d, 0x5d, 0x7f]);
});

// Extends "[boundary-1] a length byte of 0x7D is escaped".
test("[boundary-1] low length bytes of 0x7E and 0x7F are escaped", () => {
  // 126 zero bytes: 0x7E + 0x82 = 256.
  assert.deepEqual(encoded(0x00, new Uint8Array(0x7e)), [
    0x7e, 0x00, 0x00, 0x7d, 0x5e, ...new Array<number>(0x7e).fill(0), 0x82, 0x7f,
  ]);
  // 127 zero bytes: 0x7F + 0x81 = 256.
  assert.deepEqual(encoded(0x00, new Uint8Array(0x7f)), [
    0x7e, 0x00, 0x00, 0x7d, 0x5f, ...new Array<number>(0x7f).fill(0), 0x81, 0x7f,
  ]);
});

// Extends "[boundary-1] a length byte of 0x7D is escaped": the high length byte.
test("[boundary-1] a high length byte of 0x7E is escaped", () => {
  // 0x7E00 zero bytes: 0x7E + 0x00 + 0x82 = 256.
  assert.deepEqual(encoded(0x00, new Uint8Array(0x7e00)), [
    0x7e, 0x00, 0x7d, 0x5e, 0x00, ...new Array<number>(0x7e00).fill(0), 0x82, 0x7f,
  ]);
});

// Extends "[boundary-1] reserved bytes in the type and payload are escaped, the length counts unescaped bytes".
test("[boundary-1] the type and both length bytes are escaped together, length 0x7D7F", () => {
  // 0x7E + 0x7D + 0x7F = 378, 378 + 0x86 = 512.
  assert.deepEqual(encoded(0x7e, new Uint8Array(0x7d7f)), [
    0x7e, 0x7d, 0x5e, 0x7d, 0x5d, 0x7d, 0x5f, ...new Array<number>(0x7d7f).fill(0), 0x86, 0x7f,
  ]);
});

// Extends "[boundary-1] reserved bytes in the type and payload are escaped, the length counts unescaped bytes".
test("[boundary-1] bytes next to the reserved ones, and the escaped forms themselves, are not escaped", () => {
  // 0x01 + 0x07 + 0x5D + 0x5E + 0x5F + 0x7C + 0x80 + 0xFF + 0x20 = 829, 829 + 0xC3 = 1024.
  assert.deepEqual(encoded(0x01, bytes(0x5d, 0x5e, 0x5f, 0x7c, 0x80, 0xff, 0x20)), [
    0x7e, 0x01, 0x00, 0x07, 0x5d, 0x5e, 0x5f, 0x7c, 0x80, 0xff, 0x20, 0xc3, 0x7f,
  ]);
});

// Extends "[boundary-1] reserved bytes in the type and payload are escaped, the length counts unescaped bytes".
test("[boundary-1] a payload of every byte value escapes exactly the reserved ones", () => {
  const payload = Array.from({ length: 256 }, (_, i) => i);
  assert.deepEqual(encoded(0x7e, Uint8Array.from(payload)), reference(0x7e, payload));
});

// Extends "[boundary-1] reserved bytes in the type and payload are escaped, the length counts unescaped bytes".
test("[boundary-1] a long payload made only of reserved bytes escapes each and counts each once in the length", () => {
  const payload = Array.from({ length: 1000 }, (_, i) => [0x7d, 0x7e, 0x7f][i % 3]!);
  const out = encoded(0x7f, Uint8Array.from(payload));
  assert.deepEqual(out, reference(0x7f, payload));
  assert.deepEqual(out.slice(0, 5), [0x7e, 0x7d, 0x5f, 0x03, 0xe8]);
});

// Extends "[unhappy-1] the reserved type 0xFF cannot be encoded".
test("[unhappy-1] the reserved type 0xFF fails with an empty payload and with a long one", () => {
  fails(0xff, bytes());
  fails(0xff, new Uint8Array(1000));
});

// Extends "[unhappy-1] types outside 0 to 255 cannot be encoded": values a mask to 8 bits would turn valid.
test("[unhappy-1] types that are a valid type modulo 256 still fail", () => {
  for (const type of [0x101, 0x17e, 0x1fe, 0x1ff, 0x200, -255, -256, -0x102, 2 ** 32, 2 ** 32 + 1]) {
    fails(type, bytes(0x01));
  }
});

// Extends "[unhappy-1] types outside 0 to 255 cannot be encoded".
test("[unhappy-1] types far outside 0 to 255 fail", () => {
  for (const type of [1000, 65536, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, Infinity, -Infinity]) {
    fails(type, bytes());
  }
});

// Extends "[unhappy-1] a payload of 65536 bytes cannot be encoded".
test("[unhappy-1] payloads of 65537 and 131072 bytes fail, whatever the type", () => {
  fails(0x01, new Uint8Array(65537));
  fails(0x00, new Uint8Array(131072));
  fails(0xfe, new Uint8Array(65536 + 0x10));
});

// Extends "[unhappy-1] a payload of 65535 bytes and type 0xFE are still encodable".
test("[unhappy-1] a payload of 65535 reserved bytes and type 0x00 are still encodable, each byte escaped", () => {
  const payload = new Array<number>(65535).fill(0x7d);
  const out = encoded(0x00, Uint8Array.from(payload));
  // 0xFF + 0xFF + 65535 * 0x7D = 8192385 = 129 modulo 256, so the check byte is 0x7F.
  assert.equal(out.length, 1 + 1 + 2 + 2 * 65535 + 2 + 1);
  assert.deepEqual(out.slice(0, 6), [0x7e, 0x00, 0xff, 0xff, 0x7d, 0x5d]);
  assert.deepEqual(out.slice(out.length - 3), [0x7d, 0x5f, 0x7f]);
  assert.deepEqual(out, reference(0x00, payload));
});
