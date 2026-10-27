import { test } from "node:test";
import assert from "node:assert/strict";
import { decode } from "../../src/index.js";

interface Plain {
  frames: { type: number; payload: number[] }[];
  errors: { offset: number; code: string }[];
  leftover: number[];
}

function decoded(values: number[]): Plain {
  const result = decode(Uint8Array.from(values));
  return {
    frames: result.frames.map((f) => ({ type: f.type, payload: Array.from(f.payload) })),
    errors: result.errors.map((e) => ({ offset: e.offset, code: e.code })),
    leftover: Array.from(result.leftover),
  };
}

// Type 0x02, payload 41 42: 0x02 + 0x02 + 0x41 + 0x42 = 135, 135 + 0x79 = 256.
const FRAME_A = [0x7e, 0x02, 0x00, 0x02, 0x41, 0x42, 0x79, 0x7f];
const DECODED_A = { type: 0x02, payload: [0x41, 0x42] };

// Type 0x03, payload 7E: 0x03 + 0x01 + 0x7E = 130, 130 + 0x7E = 256; payload and check escaped.
const FRAME_B = [0x7e, 0x03, 0x00, 0x01, 0x7d, 0x5e, 0x7d, 0x5e, 0x7f];
const DECODED_B = { type: 0x03, payload: [0x7e] };

test("[unhappy-2] a wrong check byte is a check error at the frame's start, and the next frame is found", () => {
  const damaged = [0x7e, 0x02, 0x00, 0x02, 0x41, 0x42, 0x78, 0x7f];
  assert.deepEqual(decoded([0x41, ...damaged, ...FRAME_B]), {
    frames: [DECODED_B],
    errors: [{ offset: 1, code: "check" }],
    leftover: [],
  });
});

test("[unhappy-2] a check byte computed on the escaped payload instead of the unescaped one is a check error", () => {
  // Escaped: 0x01 + 0x01 + 0x7D + 0x5E + 0x23 = 256; unescaped: 0x01 + 0x01 + 0x7E + 0x23 = 163.
  const damaged = [0x7e, 0x01, 0x00, 0x01, 0x7d, 0x5e, 0x23, 0x7f];
  assert.deepEqual(decoded([...damaged, ...FRAME_A]), {
    frames: [DECODED_A],
    errors: [{ offset: 0, code: "check" }],
    leftover: [],
  });
});

test("[unhappy-3] a start byte inside a frame is a truncated error at the interrupted frame's start, and the new frame is returned", () => {
  const interrupted = [0x7e, 0x02, 0x00, 0x02, 0x41];
  assert.deepEqual(decoded([0x41, ...interrupted, ...FRAME_B]), {
    frames: [DECODED_B],
    errors: [{ offset: 1, code: "truncated" }],
    leftover: [],
  });
});

test("[unhappy-3] a start byte where the end byte belongs is a truncated error, and begins the next frame", () => {
  const interrupted = FRAME_A.slice(0, FRAME_A.length - 1);
  assert.deepEqual(decoded([...interrupted, ...FRAME_B]), {
    frames: [DECODED_B],
    errors: [{ offset: 0, code: "truncated" }],
    leftover: [],
  });
});

test("[unhappy-3] a start byte right after a start byte truncates the first frame", () => {
  assert.deepEqual(decoded([0x7e, ...FRAME_A]), {
    frames: [DECODED_A],
    errors: [{ offset: 0, code: "truncated" }],
    leftover: [],
  });
});

test("[unhappy-3] the new frame begun by the interrupting start byte is left over if incomplete", () => {
  assert.deepEqual(decoded([0x7e, 0x02, 0x00, 0x7e, 0x03, 0x00]), {
    frames: [],
    errors: [{ offset: 0, code: "truncated" }],
    leftover: [0x7e, 0x03, 0x00],
  });
});

test("[unhappy-4] a byte other than the end byte after the check byte is a framing error, and the next frame is found", () => {
  const damaged = [0x7e, 0x02, 0x00, 0x02, 0x41, 0x42, 0x79, 0x00];
  assert.deepEqual(decoded([0x41, ...damaged, 0x42, ...FRAME_B]), {
    frames: [DECODED_B],
    errors: [{ offset: 1, code: "framing" }],
    leftover: [],
  });
});

test("[unhappy-4] a frame starting right after the byte in place of the end byte is found", () => {
  const damaged = [0x7e, 0x02, 0x00, 0x02, 0x41, 0x42, 0x79, 0x41];
  assert.deepEqual(decoded([...damaged, ...FRAME_B]), {
    frames: [DECODED_B],
    errors: [{ offset: 0, code: "framing" }],
    leftover: [],
  });
});

test("[unhappy-4] an escape byte in place of the end byte is a framing error and does not swallow the next start byte", () => {
  const damaged = [0x7e, 0x02, 0x00, 0x02, 0x41, 0x42, 0x79, 0x7d];
  assert.deepEqual(decoded([...damaged, ...FRAME_B]), {
    frames: [DECODED_B],
    errors: [{ offset: 0, code: "framing" }],
    leftover: [],
  });
});

test("[unhappy-5] an escape byte followed by an unescapable byte is an escape error at the frame's start, and the next frame is found", () => {
  const damaged = [0x7e, 0x01, 0x00, 0x01, 0x7d, 0x41, 0x00, 0x7f];
  assert.deepEqual(decoded([0x00, ...damaged, ...FRAME_A]), {
    frames: [DECODED_A],
    errors: [{ offset: 1, code: "escape" }],
    leftover: [],
  });
});

test("[unhappy-5] an escape of a byte that needs none, in the check byte, is an escape error", () => {
  // 7D DF would unescape to 0xFF, the right check byte for type 0x01 and an empty payload.
  const damaged = [0x7e, 0x01, 0x00, 0x00, 0x7d, 0xdf, 0x7f];
  assert.deepEqual(decoded([...damaged, ...FRAME_A]), {
    frames: [DECODED_A],
    errors: [{ offset: 0, code: "escape" }],
    leftover: [],
  });
});

test("[unhappy-6] an intact frame of type 0xFF is a type error at its start and is not returned", () => {
  // 0xFF + 0x01 + 0x41 = 321, 321 + 0xBF = 512.
  const reserved = [0x7e, 0xff, 0x00, 0x01, 0x41, 0xbf, 0x7f];
  assert.deepEqual(decoded([0x42, ...reserved, ...FRAME_A]), {
    frames: [DECODED_A],
    errors: [{ offset: 1, code: "type" }],
    leftover: [],
  });
});

test("[unhappy-6] type 0xFE is returned while 0xFF right after it is a type error", () => {
  // 0xFE + 0x02 = 256; 0xFF + 0x01 = 256.
  const valid = [0x7e, 0xfe, 0x00, 0x00, 0x02, 0x7f];
  const reserved = [0x7e, 0xff, 0x00, 0x00, 0x01, 0x7f];
  assert.deepEqual(decoded([...valid, ...reserved]), {
    frames: [{ type: 0xfe, payload: [] }],
    errors: [{ offset: 6, code: "type" }],
    leftover: [],
  });
});
