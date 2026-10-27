# Encode and decode device frames

Field devices send their logs over a serial link in a framing format of
their own, "LF1". The gateway must turn a byte stream, with partial frames
and line noise in it, into frames and errors without ever losing a frame
that is intact.

```gherkin
Feature: Encode and decode LF1 frames

  Background:
    Given a frame is bytes: a start byte 0x7E, a type byte, two length bytes big-endian giving the payload's length before escaping, the payload, a check byte, and an end byte 0x7F
    And between the start and end bytes the bytes 0x7E, 0x7F and 0x7D are escaped as 0x7D followed by the byte XOR 0x20, so the start and end bytes never appear unescaped inside a frame
    And the check byte is the byte that makes the sum of the type, the two length bytes, the unescaped payload and the check byte itself a multiple of 256
    And escaping applies to the type, length, payload and check bytes alike, and the length counts unescaped payload bytes
    And types 0x00 to 0xFE are valid; 0xFF is reserved
    And a stream may hold several frames back to back, with any bytes between them
    And decoding takes bytes and returns the frames found, each a type and a payload, the errors found, each an offset into the given bytes and a code, and the bytes left over from an incomplete frame at the end

  Rule: Encoding

    @happy
    Scenario: A frame is encoded
      Given type 0x01 and payload bytes 0x10 0x20
      When it is encoded
      Then the bytes are 7E 01 00 02 10 20 CD 7F
      And an empty payload encodes as 7E 01 00 00 FF 7F

    @boundary
    Scenario: Reserved bytes are escaped wherever they occur
      Given type 0x7E and payload 0x7D 0x7F 0x00
      When it is encoded
      Then the type is sent as 7D 5E, the payload as 7D 5D 7D 5F 00, the length bytes as 00 03, and the check byte is computed on the unescaped bytes and escaped itself if it is 0x7E, 0x7F or 0x7D

    @unhappy
    Scenario: What cannot be encoded
      Given type 0xFF, a type outside 0 to 255, or a payload longer than 65535 bytes
      When it is encoded
      Then encoding fails with an error

  Rule: Decoding a well-formed stream

    @happy
    Scenario: Frames are found among other bytes
      Given a stream of some bytes, a frame, more bytes, a second frame
      When it is decoded
      Then both frames are returned in order with their types and unescaped payloads, there are no errors, and nothing is left over
      And the bytes between frames are not an error

    @boundary
    Scenario: A frame may be split across calls
      Given a frame's bytes cut at any point after its start byte
      When the first part is decoded
      Then no frame is returned and the left-over bytes are the first part, from its start byte
      And decoding the left-over bytes followed by the second part returns the frame
      And a stream ending with no start byte in progress leaves nothing over

    @boundary
    Scenario: The length decides where the payload ends
      Given a frame whose payload holds the byte 0x7D 0x5F, the escape of 0x7F
      When it is decoded
      Then the payload holds 0x7F and the frame ends at the end byte after the check byte, since the length counts unescaped bytes

  Rule: Decoding a damaged stream

    @unhappy
    Scenario: A wrong check byte
      Given a frame whose check byte does not make the sum a multiple of 256
      When it is decoded
      Then there is an error with code "check" at the offset of the frame's start byte
      And the frame is not returned, and decoding goes on from the byte after its end byte

    @unhappy
    Scenario: A start byte inside a frame
      Given a frame interrupted by an unescaped 0x7E before its end byte
      When it is decoded
      Then there is an error with code "truncated" at the offset of the interrupted frame's start byte
      And the new start byte begins a new frame, which is returned if it is intact

    @unhappy
    Scenario: A missing end byte
      Given a frame whose length, payload and check byte are followed by a byte other than 0x7F and other than 0x7E
      When it is decoded
      Then there is an error with code "framing" at the offset of the frame's start byte
      And decoding goes on from the byte after the frame's start byte, so a frame starting inside the damaged bytes is still found

    @unhappy
    Scenario: A bad escape
      Given an escape byte 0x7D followed by a byte other than 0x5E, 0x5F or 0x5D
      When it is decoded
      Then there is an error with code "escape" at the offset of the frame's start byte
      And decoding goes on from the byte after the frame's start byte

    @unhappy
    Scenario: A reserved type
      Given an otherwise intact frame whose type is 0xFF
      When it is decoded
      Then there is an error with code "type" at the offset of its start byte and the frame is not returned
      And decoding goes on from the byte after its end byte
```
