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

test("[happy-2] two frames among other bytes are returned in order with no errors and nothing left over", () => {
  const stream = [0x00, 0x41, ...FRAME_A, 0x42, 0x43, 0x44, ...FRAME_B];
  assert.deepEqual(decoded(stream), { frames: [DECODED_A, DECODED_B], errors: [], leftover: [] });
});

test("[happy-2] frames back to back, and stray 0x7F and 0x7D bytes between frames, are not errors", () => {
  const stream = [...FRAME_A, ...FRAME_B, 0x7f, 0x7d, 0x41, ...FRAME_A, 0x7f];
  assert.deepEqual(decoded(stream), {
    frames: [DECODED_A, DECODED_B, DECODED_A],
    errors: [],
    leftover: [],
  });
});

test("[boundary-2] a frame cut mid-way leaves the first part over from its start byte, and completes with the second part", () => {
  const first = [0x41, 0x42, ...FRAME_B.slice(0, 5)];
  const second = FRAME_B.slice(5);
  const part1 = decoded(first);
  assert.deepEqual(part1, { frames: [], errors: [], leftover: FRAME_B.slice(0, 5) });
  const part2 = decoded([...part1.leftover, ...second]);
  assert.deepEqual(part2, { frames: [DECODED_B], errors: [], leftover: [] });
});

test("[boundary-2] a frame cut at every point after its start byte, including inside an escape, is completed by the next call", () => {
  for (let cut = 1; cut < FRAME_B.length; cut++) {
    const first = [...FRAME_A, ...FRAME_B.slice(0, cut)];
    const part1 = decoded(first);
    assert.deepEqual(
      part1,
      { frames: [DECODED_A], errors: [], leftover: FRAME_B.slice(0, cut) },
      `first part, cut at ${cut}`,
    );
    const part2 = decoded([...part1.leftover, ...FRAME_B.slice(cut)]);
    assert.deepEqual(part2, { frames: [DECODED_B], errors: [], leftover: [] }, `second part, cut at ${cut}`);
  }
});

test("[boundary-2] a stream ending with no start byte in progress leaves nothing over", () => {
  assert.deepEqual(decoded([...FRAME_A, 0x41, 0x7f, 0x00]), { frames: [DECODED_A], errors: [], leftover: [] });
  assert.deepEqual(decoded([0x41, 0x42]), { frames: [], errors: [], leftover: [] });
  assert.deepEqual(decoded([]), { frames: [], errors: [], leftover: [] });
});

test("[boundary-3] an escaped 0x7F in the payload counts as one byte of the length", () => {
  // Type 0x01, payload 7F 41: 0x01 + 0x02 + 0x7F + 0x41 = 195, 195 + 0x3D = 256.
  const frame = [0x7e, 0x01, 0x00, 0x02, 0x7d, 0x5f, 0x41, 0x3d, 0x7f];
  assert.deepEqual(decoded(frame), {
    frames: [{ type: 0x01, payload: [0x7f, 0x41] }],
    errors: [],
    leftover: [],
  });
});

test("[boundary-3] a payload and check byte made only of escapes end at the end byte, and the next frame follows", () => {
  // Type 0x01, payload 7F 7F 7F: 0x01 + 0x03 + 3 * 0x7F = 385, 385 + 0x7F = 512.
  const frame = [0x7e, 0x01, 0x00, 0x03, 0x7d, 0x5f, 0x7d, 0x5f, 0x7d, 0x5f, 0x7d, 0x5f, 0x7f];
  assert.deepEqual(decoded([...frame, ...FRAME_A]), {
    frames: [{ type: 0x01, payload: [0x7f, 0x7f, 0x7f] }, DECODED_A],
    errors: [],
    leftover: [],
  });
});
