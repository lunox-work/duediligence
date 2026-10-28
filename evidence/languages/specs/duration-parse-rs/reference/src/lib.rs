//! Duration strings such as `1h30m` or `250ms`, stored as whole milliseconds.

use std::fmt;

/// The largest value a duration may hold: 2^53 - 1 milliseconds.
const MAX_MS: u64 = 9007199254740991;

/// Units from largest to smallest, with their size in milliseconds.
const UNITS: [(&str, u64); 5] = [
    ("d", 86_400_000),
    ("h", 3_600_000),
    ("m", 60_000),
    ("s", 1_000),
    ("ms", 1),
];

/// Why `parse_duration` rejected its input; its Display text contains "duration".
#[derive(Debug, Clone, PartialEq)]
pub enum ParseDurationError {
    /// The text is not a duration, or its total exceeds 9007199254740991 ms.
    InvalidDuration,
}

impl fmt::Display for ParseDurationError {
    /// Describes the failure; the text contains "duration".
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ParseDurationError::InvalidDuration => write!(
                f,
                "invalid duration: expected components such as 1h30m, at most {} ms in total",
                MAX_MS
            ),
        }
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
        match self {
            FormatDurationError::MillisecondsOutOfRange => {
                write!(f, "milliseconds out of range: at most {} allowed", MAX_MS)
            }
        }
    }
}

/// Turns a duration string into milliseconds.
pub fn parse_duration(text: &str) -> Result<u64, ParseDurationError> {
    let invalid = ParseDurationError::InvalidDuration;
    let bytes = text.trim().as_bytes();
    if bytes.is_empty() {
        return Err(invalid);
    }

    let mut pos = 0;
    let mut total: u64 = 0;
    // Index into UNITS that the next component's unit must be at or after.
    let mut next_unit = 0;
    while pos < bytes.len() {
        // Count: ASCII digits, no leading zeros except `0` itself.
        let start = pos;
        while pos < bytes.len() && bytes[pos].is_ascii_digit() {
            pos += 1;
        }
        let digits = &bytes[start..pos];
        if digits.is_empty() || (digits.len() > 1 && digits[0] == b'0') {
            return Err(invalid);
        }
        let mut count: u64 = 0;
        for &d in digits {
            count = count
                .checked_mul(10)
                .and_then(|c| c.checked_add(u64::from(d - b'0')))
                .ok_or(invalid.clone())?;
        }

        // Unit: `ms` is tried before `m`.
        let rest = &bytes[pos..];
        let unit = if rest.starts_with(b"ms") {
            4
        } else {
            match rest.first() {
                Some(b'd') => 0,
                Some(b'h') => 1,
                Some(b'm') => 2,
                Some(b's') => 3,
                _ => return Err(invalid),
            }
        };
        if unit < next_unit {
            return Err(invalid);
        }
        next_unit = unit + 1;
        let (name, size) = UNITS[unit];
        pos += name.len();

        total = count
            .checked_mul(size)
            .and_then(|ms| ms.checked_add(total))
            .filter(|&t| t <= MAX_MS)
            .ok_or(invalid.clone())?;
    }
    Ok(total)
}

/// Turns milliseconds back into the shortest duration string that parses back.
pub fn format_duration(ms: u64) -> Result<String, FormatDurationError> {
    if ms > MAX_MS {
        return Err(FormatDurationError::MillisecondsOutOfRange);
    }
    if ms == 0 {
        return Ok("0ms".to_string());
    }
    let mut out = String::new();
    let mut rest = ms;
    for (name, size) in UNITS {
        let count = rest / size;
        rest %= size;
        if count > 0 {
            out.push_str(&count.to_string());
            out.push_str(name);
        }
    }
    Ok(out)
}
