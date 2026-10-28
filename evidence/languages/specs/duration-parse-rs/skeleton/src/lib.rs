//! Duration strings such as `1h30m` or `250ms`, stored as whole milliseconds.

use std::fmt;

/// Why `parse_duration` rejected its input; its Display text contains "duration".
#[derive(Debug, Clone, PartialEq)]
pub enum ParseDurationError {
    /// The text is not a duration, or its total exceeds 9007199254740991 ms.
    InvalidDuration,
}

impl fmt::Display for ParseDurationError {
    /// Describes the failure; the text contains "duration".
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        unimplemented!("not implemented")
    }
}

/// Why `format_duration` rejected its input; its Display text contains "milliseconds".
#[derive(Debug, Clone, PartialEq)]
pub enum FormatDurationError {
    /// The value is larger than 9007199254740991 milliseconds.
    MillisecondsOutOfRange,
}

impl fmt::Display for FormatDurationError {
    /// Describes the failure; the text contains "milliseconds".
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        unimplemented!("not implemented")
    }
}

/// Turns a duration string into milliseconds.
pub fn parse_duration(text: &str) -> Result<u64, ParseDurationError> {
    unimplemented!("not implemented")
}

/// Turns milliseconds back into the shortest duration string that parses back.
pub fn format_duration(ms: u64) -> Result<String, FormatDurationError> {
    unimplemented!("not implemented")
}
