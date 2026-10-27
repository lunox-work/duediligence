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
  throw new Error("not implemented");
}

/**
 * Decodes a byte stream that may hold several frames back to back, with any
 * bytes between them, into the frames found, the errors found, and the bytes
 * left over from an incomplete frame at the end. To continue a frame split
 * across calls, decode the left-over bytes followed by the next part.
 */
export function decode(bytes: Uint8Array): DecodeResult {
  throw new Error("not implemented");
}
