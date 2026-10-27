/** A decoded LF1 frame: a type and its unescaped payload. */
export interface Frame {
  /** The type byte, 0x00 to 0xFE. */
  type: number;
  /** The payload, unescaped. */
  payload: Uint8Array;
}

/** The code of an error found while decoding. */
export type FrameErrorCode = "check" | "truncated" | "framing" | "escape" | "type";

/** An error found while decoding: an offset into the given bytes and a code. */
export interface FrameError {
  /** Offset into the given bytes of the damaged frame's start byte. */
  offset: number;
  code: FrameErrorCode;
}

/** What decoding returns: the frames found, the errors found, and the bytes left over from an incomplete frame at the end. */
export interface DecodeResult {
  /** The frames found, in order. */
  frames: Frame[];
  /** The errors found, in order. */
  errors: FrameError[];
  /** The bytes left over from an incomplete frame at the end, from its start byte; empty if no start byte is in progress. */
  leftover: Uint8Array;
}

/**
 * Encodes a type and payload as an LF1 frame: start byte 0x7E, type, two
 * length bytes big-endian, payload, check byte, end byte 0x7F, with 0x7E,
 * 0x7F and 0x7D escaped between the start and end bytes.
 *
 * Throws if the type is 0xFF or outside 0 to 255, or the payload is longer
 * than 65535 bytes.
 */
export function encode(type: number, payload: Uint8Array): Uint8Array {
  if (!Number.isInteger(type) || type < 0 || type > 0xff) {
    throw new RangeError(`type ${type} is outside 0 to 255`);
  }
  if (type === 0xff) throw new RangeError("type 0xFF is reserved");
  if (payload.length > 0xffff) {
    throw new RangeError(`payload of ${payload.length} bytes is longer than 65535 bytes`);
  }
  const length = payload.length;
  let sum = type + (length >> 8) + (length & 0xff);
  for (const byte of payload) sum += byte;
  const check = (256 - (sum & 0xff)) & 0xff;

  // At most every byte between the start and end bytes is escaped.
  const out = new Uint8Array(2 + 2 * (4 + length));
  let at = 0;
  const put = (byte: number): void => {
    if (byte === START || byte === END || byte === ESCAPE) {
      out[at++] = ESCAPE;
      out[at++] = byte ^ 0x20;
    } else {
      out[at++] = byte;
    }
  };
  out[at++] = START;
  put(type);
  put(length >> 8);
  put(length & 0xff);
  for (const byte of payload) put(byte);
  put(check);
  out[at++] = END;
  return out.slice(0, at);
}

/**
 * Decodes a byte stream that may hold several frames back to back, with any
 * bytes between them, into the frames found, the errors found, and the bytes
 * left over from an incomplete frame at the end. To continue a frame split
 * across calls, decode the left-over bytes followed by the next part.
 */
export function decode(bytes: Uint8Array): DecodeResult {
  const frames: Frame[] = [];
  const errors: FrameError[] = [];
  const n = bytes.length;
  let pos = 0;

  for (;;) {
    while (pos < n && bytes[pos] !== START) pos++;
    if (pos >= n) return { frames, errors, leftover: new Uint8Array(0) };

    const result = readFrame(bytes, pos);
    switch (result.kind) {
      case "incomplete":
        return { frames, errors, leftover: bytes.slice(pos) };
      case "frame":
        frames.push(result.frame);
        pos = result.next;
        break;
      case "error":
        errors.push({ offset: pos, code: result.code });
        pos = result.next;
        break;
    }
  }
}

const START = 0x7e;
const END = 0x7f;
const ESCAPE = 0x7d;

type ReadResult =
  | { kind: "incomplete" }
  | { kind: "frame"; frame: Frame; next: number }
  | { kind: "error"; code: FrameErrorCode; next: number };

/** Signals that a frame cannot be read further, with how to go on. */
class Stop {
  constructor(readonly result: ReadResult) {}
}

/** Reads the frame whose start byte is at `start`, returning where decoding goes on. */
function readFrame(bytes: Uint8Array, start: number): ReadResult {
  const n = bytes.length;
  let at = start + 1;

  // Reads one unescaped byte between the start and end bytes.
  const next = (): number => {
    if (at >= n) throw new Stop({ kind: "incomplete" });
    const byte = bytes[at]!;
    if (byte === START) throw new Stop({ kind: "error", code: "truncated", next: at });
    if (byte === END) throw new Stop({ kind: "error", code: "framing", next: start + 1 });
    if (byte !== ESCAPE) {
      at++;
      return byte;
    }
    if (at + 1 >= n) throw new Stop({ kind: "incomplete" });
    const escaped = bytes[at + 1]!;
    if (escaped === START) throw new Stop({ kind: "error", code: "truncated", next: at + 1 });
    if (escaped !== 0x5e && escaped !== 0x5f && escaped !== 0x5d) {
      throw new Stop({ kind: "error", code: "escape", next: start + 1 });
    }
    at += 2;
    return escaped ^ 0x20;
  };

  try {
    const type = next();
    const high = next();
    const low = next();
    const length = (high << 8) | low;
    let sum = type + high + low;
    const payload = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      payload[i] = next();
      sum += payload[i]!;
    }
    sum += next();

    if (at >= n) return { kind: "incomplete" };
    const end = bytes[at]!;
    if (end === START) return { kind: "error", code: "truncated", next: at };
    if (end !== END) return { kind: "error", code: "framing", next: start + 1 };

    if ((sum & 0xff) !== 0) return { kind: "error", code: "check", next: at + 1 };
    if (type === 0xff) return { kind: "error", code: "type", next: at + 1 };
    return { kind: "frame", frame: { type, payload }, next: at + 1 };
  } catch (error) {
    if (error instanceof Stop) return error.result;
    throw error;
  }
}
