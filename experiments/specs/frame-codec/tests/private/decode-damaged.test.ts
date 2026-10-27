import { test } from "node:test";
import assert from "node:assert/strict";
import { decode } from "../../src/index.js";

interface Plain {
  frames: { type: number; payload: number[] }[];
  errors: { offset: number; code: string }[];
  leftover: number[];
}

function plain(result: ReturnType<typeof decode>): Plain {
  return {
    frames: result.frames.map((f) => ({ type: f.type, payload: Array.from(f.payload) })),
    errors: result.errors.map((e) => ({ offset: e.offset, code: e.code })),
    leftover: Array.from(result.leftover),
  };
}

function decoded(values: number[]): Plain {
  return plain(decode(Uint8Array.from(values)));
}

function escaped(values: number[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (v === 0x7e || v === 0x7f || v === 0x7d) out.push(0x7d, v ^ 0x20);
    else out.push(v);
  }
  return out;
}

function checkOf(type: number, payload: number[]): number {
  const len = payload.length;
  let sum = type + (len >> 8) + (len & 0xff);
  for (const p of payload) sum += p;
  return (256 - (sum % 256)) % 256;
}

// A frame as the spec defines it, with the right check byte unless one is given.
function frame(type: number, payload: number[], check: number = checkOf(type, payload)): number[] {
  const len = payload.length;
  return [0x7e, ...escaped([type, len >> 8, len & 0xff, ...payload, check]), 0x7f];
}

// Type 0x02, payload 41 42: 0x02 + 0x02 + 0x41 + 0x42 = 135, 135 + 0x79 = 256.
const FRAME_A = [0x7e, 0x02, 0x00, 0x02, 0x41, 0x42, 0x79, 0x7f];
const DECODED_A = { type: 0x02, payload: [0x41, 0x42] };

// Type 0x03, payload 7E: 0x03 + 0x01 + 0x7E = 130, 130 + 0x7E = 256; payload and check escaped.
const FRAME_B = [0x7e, 0x03, 0x00, 0x01, 0x7d, 0x5e, 0x7d, 0x5e, 0x7f];
const DECODED_B = { type: 0x03, payload: [0x7e] };

// Extends "[unhappy-2] a wrong check byte is a check error at the frame's start, and the next frame is found".
test("[unhappy-2] a check error after a frame with escapes is at the raw offset of its start byte", () => {
  const damaged = frame(0x02, [0x41, 0x42], 0x7a);
  assert.deepEqual(decoded([...FRAME_B, ...damaged, ...FRAME_A]), {
    frames: [DECODED_B, DECODED_A],
    errors: [{ offset: 9, code: "check" }],
    leftover: [],
  });
});

// Extends "[unhappy-2] a wrong check byte is a check error at the frame's start, and the next frame is found".
test("[unhappy-2] a check byte that leaves out the high length byte is a check error", () => {
  // 0x02 + 0x01 + 0x2C + 300 * 0x01 = 347: the right check byte is 0xA5; 0xA6 leaves out the 0x01.
  const payload = new Array<number>(300).fill(0x01);
  assert.deepEqual(decoded([...frame(0x02, payload, 0xa6), ...frame(0x02, payload, 0xa5)]), {
    frames: [{ type: 0x02, payload }],
    errors: [{ offset: 0, code: "check" }],
    leftover: [],
  });
});

// Extends "[unhappy-2] a wrong check byte is a check error at the frame's start, and the next frame is found".
test("[unhappy-2] a wrong check byte on an empty payload is a check error", () => {
  assert.deepEqual(decoded([0x7e, 0x01, 0x00, 0x00, 0xfe, 0x7f, ...FRAME_A]), {
    frames: [DECODED_A],
    errors: [{ offset: 0, code: "check" }],
    leftover: [],
  });
});

// Extends "[unhappy-2] a wrong check byte is a check error at the frame's start, and the next frame is found".
test("[unhappy-2] a wrong check byte that is itself escaped is a check error", () => {
  // The right check byte for type 0x01 and payload 80 is 0x7E; 0x7D is sent as 7D 5D.
  const damaged = [0x7e, 0x01, 0x00, 0x01, 0x80, 0x7d, 0x5d, 0x7f];
  assert.deepEqual(decoded([...damaged, ...FRAME_B]), {
    frames: [DECODED_B],
    errors: [{ offset: 0, code: "check" }],
    leftover: [],
  });
});

// Extends "[unhappy-2] a wrong check byte is a check error at the frame's start, and the next frame is found".
test("[unhappy-2] several check errors are each reported in order at their own start bytes", () => {
  const d1 = frame(0x01, [0x10], 0x00);
  const d2 = frame(0x7e, [0x7f, 0x7d], 0x01);
  const d3 = frame(0x00, [], 0x01);
  const stream = [...d1, ...d2, 0x41, ...d3, ...FRAME_A];
  assert.deepEqual(decoded(stream), {
    frames: [DECODED_A],
    errors: [
      { offset: 0, code: "check" },
      { offset: d1.length, code: "check" },
      { offset: d1.length + d2.length + 1, code: "check" },
    ],
    leftover: [],
  });
});

// Extends "[unhappy-2] a wrong check byte is a check error at the frame's start, and the next frame is found".
test("[unhappy-2] in the call completing a split frame, a check error's offset is into the bytes given to that call", () => {
  const part1 = decoded([...FRAME_A, ...FRAME_B.slice(0, 4)]);
  assert.deepEqual(part1, { frames: [DECODED_A], errors: [], leftover: FRAME_B.slice(0, 4) });
  const damaged = frame(0x02, [0x41, 0x42], 0x78);
  const part2 = decoded([...part1.leftover, ...FRAME_B.slice(4), 0x00, ...damaged]);
  assert.deepEqual(part2, {
    frames: [DECODED_B],
    errors: [{ offset: FRAME_B.length + 1, code: "check" }],
    leftover: [],
  });
});

// Extends "[unhappy-2] a wrong check byte is a check error at the frame's start, and the next frame is found".
test("[unhappy-2] decoding a view into a larger buffer gives check offsets into the view", () => {
  const damaged = frame(0x02, [0x41, 0x42], 0x78);
  const whole = Uint8Array.from([...FRAME_A, 0x41, ...damaged, ...FRAME_B]);
  assert.deepEqual(plain(decode(whole.subarray(FRAME_A.length))), {
    frames: [DECODED_B],
    errors: [{ offset: 1, code: "check" }],
    leftover: [],
  });
});

// Extends "[unhappy-3] a start byte inside a frame is a truncated error at the interrupted frame's start, and the new frame is returned".
test("[unhappy-3] a start byte in the length bytes is a truncated error", () => {
  assert.deepEqual(decoded([0x41, 0x42, 0x7e, 0x01, 0x00, ...FRAME_A]), {
    frames: [DECODED_A],
    errors: [{ offset: 2, code: "truncated" }],
    leftover: [],
  });
});

// Extends "[unhappy-3] a start byte where the end byte belongs is a truncated error, and begins the next frame".
test("[unhappy-3] a start byte where the check byte belongs is a truncated error", () => {
  assert.deepEqual(decoded([0x7e, 0x02, 0x00, 0x02, 0x41, 0x42, ...FRAME_B]), {
    frames: [DECODED_B],
    errors: [{ offset: 0, code: "truncated" }],
    leftover: [],
  });
});

// Extends "[unhappy-3] a start byte right after a start byte truncates the first frame".
test("[unhappy-3] a chain of interrupted frames gives a truncated error at each start byte", () => {
  assert.deepEqual(decoded([0x7e, 0x01, 0x7e, 0x02, 0x7e, ...FRAME_A]), {
    frames: [DECODED_A],
    errors: [
      { offset: 0, code: "truncated" },
      { offset: 2, code: "truncated" },
      { offset: 4, code: "truncated" },
    ],
    leftover: [],
  });
});

// Extends "[unhappy-3] a start byte inside a frame is a truncated error at the interrupted frame's start, and the new frame is returned".
test("[unhappy-3] a start byte inside a payload announced as 65535 bytes is a truncated error, not payload", () => {
  assert.deepEqual(decoded([0x7e, 0x01, 0xff, 0xff, 0x41, 0x42, 0x43, ...FRAME_A, ...FRAME_B]), {
    frames: [DECODED_A, DECODED_B],
    errors: [{ offset: 0, code: "truncated" }],
    leftover: [],
  });
});

// Extends "[unhappy-3] the new frame begun by the interrupting start byte is left over if incomplete".
test("[unhappy-3] a truncated frame with escapes after other frames is at its raw offset, and the incomplete new frame is left over", () => {
  // Type 0x7E, length 3, then one escaped 0x7D before the interrupting start byte.
  const interrupted = [0x7e, 0x7d, 0x5e, 0x00, 0x03, 0x7d, 0x5d];
  assert.deepEqual(decoded([...FRAME_B, 0x00, ...interrupted, ...FRAME_A.slice(0, 4)]), {
    frames: [DECODED_B],
    errors: [{ offset: 10, code: "truncated" }],
    leftover: FRAME_A.slice(0, 4),
  });
});

// Extends "[unhappy-3] a start byte inside a frame is a truncated error at the interrupted frame's start, and the new frame is returned".
test("[unhappy-3] the new frame begun by the interrupting start byte is checked like any other", () => {
  const damaged = frame(0x02, [0x41, 0x42], 0x78);
  assert.deepEqual(decoded([0x7e, 0x01, 0x00, 0x05, 0x41, ...damaged, ...FRAME_B]), {
    frames: [DECODED_B],
    errors: [
      { offset: 0, code: "truncated" },
      { offset: 5, code: "check" },
    ],
    leftover: [],
  });
});

// Extends "[unhappy-4] a byte other than the end byte after the check byte is a framing error, and the next frame is found".
test("[unhappy-4] a length shorter than the bytes sent puts a non-end byte after the check byte: a framing error", () => {
  // Read with length 1: payload 41, check BC (0x02 + 0x01 + 0x41 + 0xBC = 256), then 0x42 where 0x7F belongs.
  const damaged = [0x7e, 0x02, 0x00, 0x01, 0x41, 0xbc, 0x42, 0x79, 0x7f];
  assert.deepEqual(decoded([...damaged, ...FRAME_A]), {
    frames: [DECODED_A],
    errors: [{ offset: 0, code: "framing" }],
    leftover: [],
  });
});

// Extends "[unhappy-4] a byte other than the end byte after the check byte is a framing error, and the next frame is found".
test("[unhappy-4] a length longer than the bytes sent puts a non-end byte after the check byte: a framing error", () => {
  // Read with length 3: payload 41 42 79, check FF (0x02 + 0x03 + 0x41 + 0x42 + 0x79 + 0xFF = 512), then 0x00.
  const damaged = [0x7e, 0x02, 0x00, 0x03, 0x41, 0x42, 0x79, 0xff, 0x00];
  assert.deepEqual(decoded([...damaged, ...FRAME_B]), {
    frames: [DECODED_B],
    errors: [{ offset: 0, code: "framing" }],
    leftover: [],
  });
});

// Extends "[unhappy-4] a frame starting right after the byte in place of the end byte is found".
test("[unhappy-4] a framing error after a frame with escapes is at the raw offset of its start byte", () => {
  // Type 0x7E, payload 7D: 0x7E + 0x01 + 0x7D = 252, 252 + 0x04 = 256; 0x5F in place of the end byte.
  const damaged = [0x7e, 0x7d, 0x5e, 0x00, 0x01, 0x7d, 0x5d, 0x04, 0x5f];
  assert.deepEqual(decoded([...FRAME_B, 0x7f, ...damaged, ...FRAME_A]), {
    frames: [DECODED_B, DECODED_A],
    errors: [{ offset: 10, code: "framing" }],
    leftover: [],
  });
});

// Extends "[unhappy-4] a byte other than the end byte after the check byte is a framing error, and the next frame is found".
test("[unhappy-4] each byte other than 0x7F and 0x7E after the check byte is a framing error", () => {
  for (const end of [0x00, 0x20, 0x5d, 0x5e, 0x5f, 0x7c, 0x80, 0xfe, 0xff]) {
    assert.deepEqual(
      decoded([0x7e, 0x01, 0x00, 0x00, 0xff, end, ...FRAME_A]),
      { frames: [DECODED_A], errors: [{ offset: 0, code: "framing" }], leftover: [] },
      `0x${end.toString(16)} in place of the end byte`,
    );
  }
});

// Extends "[unhappy-4] a byte other than the end byte after the check byte is a framing error, and the next frame is found".
test("[unhappy-4] a framing error at the end of the stream leaves nothing over", () => {
  assert.deepEqual(decoded([...FRAME_A, 0x7e, 0x01, 0x00, 0x00, 0xff, 0x41]), {
    frames: [DECODED_A],
    errors: [{ offset: 8, code: "framing" }],
    leftover: [],
  });
});

// Extends "[unhappy-4] an escape byte in place of the end byte is a framing error and does not swallow the next start byte".
test("[unhappy-4] two framing errors in a row are both reported, and the frame after them is found", () => {
  const d1 = [0x7e, 0x01, 0x00, 0x00, 0xff, 0x00];
  const d2 = [0x7e, 0x01, 0x00, 0x00, 0xff, 0x7d];
  assert.deepEqual(decoded([...d1, ...d2, ...FRAME_B]), {
    frames: [DECODED_B],
    errors: [
      { offset: 0, code: "framing" },
      { offset: 6, code: "framing" },
    ],
    leftover: [],
  });
});

// Extends "[unhappy-5] an escape byte followed by an unescapable byte is an escape error at the frame's start, and the next frame is found".
test("[unhappy-5] a bad escape in the type is an escape error", () => {
  assert.deepEqual(decoded([0x41, 0x7e, 0x7d, 0x41, 0x00, 0x00, 0xff, 0x7f, ...FRAME_A]), {
    frames: [DECODED_A],
    errors: [{ offset: 1, code: "escape" }],
    leftover: [],
  });
});

// Extends "[unhappy-5] an escape byte followed by an unescapable byte is an escape error at the frame's start, and the next frame is found".
test("[unhappy-5] a bad escape in the length bytes is an escape error", () => {
  assert.deepEqual(decoded([0x7e, 0x01, 0x00, 0x7d, 0x00, 0x01, 0xff, 0x7f, ...FRAME_B]), {
    frames: [DECODED_B],
    errors: [{ offset: 0, code: "escape" }],
    leftover: [],
  });
});

// Extends "[unhappy-5] an escape byte followed by an unescapable byte is an escape error at the frame's start, and the next frame is found".
test("[unhappy-5] 0x7D followed by each byte other than 5E, 5F, 5D and the start byte is an escape error", () => {
  for (const after of [0x00, 0x1e, 0x20, 0x3d, 0x3e, 0x3f, 0x5c, 0x60, 0x7d, 0x9d, 0xfd, 0xff]) {
    assert.deepEqual(
      decoded([0x7e, 0x01, 0x00, 0x01, 0x7d, after, 0x00, 0x7f, ...FRAME_A]),
      { frames: [DECODED_A], errors: [{ offset: 0, code: "escape" }], leftover: [] },
      `7D ${after.toString(16)}`,
    );
  }
});

// Extends "[unhappy-5] an escape byte followed by an unescapable byte is an escape error at the frame's start, and the next frame is found".
test("[unhappy-5] 0x7D followed by an unescaped 0x7F is an escape error", () => {
  assert.deepEqual(decoded([0x7e, 0x01, 0x00, 0x01, 0x7d, 0x7f, ...FRAME_A]), {
    frames: [DECODED_A],
    errors: [{ offset: 0, code: "escape" }],
    leftover: [],
  });
});

// Extends "[unhappy-5] an escape of a byte that needs none, in the check byte, is an escape error".
test("[unhappy-5] a bad escape in a payload announced as 256 bytes does not swallow the frames after it", () => {
  assert.deepEqual(decoded([0x7e, 0x01, 0x01, 0x00, 0x7d, 0x41, ...FRAME_A, ...FRAME_B]), {
    frames: [DECODED_A, DECODED_B],
    errors: [{ offset: 0, code: "escape" }],
    leftover: [],
  });
});

// Extends "[unhappy-5] an escape byte followed by an unescapable byte is an escape error at the frame's start, and the next frame is found".
test("[unhappy-5] an escape error after a frame and stray 7D 5E bytes is at the raw offset of its start byte", () => {
  const damaged = [0x7e, 0x01, 0x00, 0x02, 0x7d, 0x5f, 0x7d, 0x20, 0x00, 0x7f];
  assert.deepEqual(decoded([...FRAME_B, 0x7d, 0x5e, ...damaged, ...FRAME_A]), {
    frames: [DECODED_B, DECODED_A],
    errors: [{ offset: 11, code: "escape" }],
    leftover: [],
  });
});

// Extends "[unhappy-6] an intact frame of type 0xFF is a type error at its start and is not returned".
test("[unhappy-6] a type 0xFF frame with a long escaped payload is a type error, and the next frame is found", () => {
  const payload = Array.from({ length: 300 }, (_, i) => i & 0xff);
  assert.deepEqual(decoded([0x7d, 0x41, ...frame(0xff, payload), ...FRAME_B]), {
    frames: [DECODED_B],
    errors: [{ offset: 2, code: "type" }],
    leftover: [],
  });
});

// Extends "[unhappy-6] type 0xFE is returned while 0xFF right after it is a type error".
test("[unhappy-6] two type 0xFF frames in a row are two type errors, and the valid frames after them are returned", () => {
  const r1 = frame(0xff, [0x7e]);
  const r2 = frame(0xff, []);
  const stream = [...r1, ...r2, ...frame(0xfe, [0x7e]), ...frame(0x00, [])];
  assert.deepEqual(decoded(stream), {
    frames: [
      { type: 0xfe, payload: [0x7e] },
      { type: 0x00, payload: [] },
    ],
    errors: [
      { offset: 0, code: "type" },
      { offset: r1.length, code: "type" },
    ],
    leftover: [],
  });
});

// Extends "[unhappy-6] an intact frame of type 0xFF is a type error at its start and is not returned".
test("[unhappy-6] a type 0xFF frame with escaped length bytes is a type error, and decoding goes on after its end byte", () => {
  const reserved = frame(0xff, new Array<number>(0x7e).fill(0));
  assert.deepEqual(reserved.slice(0, 5), [0x7e, 0xff, 0x00, 0x7d, 0x5e]);
  assert.deepEqual(decoded([...reserved, ...FRAME_A, ...FRAME_B.slice(0, 5)]), {
    frames: [DECODED_A],
    errors: [{ offset: 0, code: "type" }],
    leftover: FRAME_B.slice(0, 5),
  });
});
