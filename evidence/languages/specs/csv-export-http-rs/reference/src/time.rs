//! Creation times: "YYYY-MM-DDTHH:MM:SS", optional fractional seconds, then "Z" or "+HH:MM"/"-HH:MM".

use std::cmp::Ordering;

/// An instant: whole seconds since 1970-01-01T00:00:00Z and the digits of the fraction of a second,
/// without trailing zeros, so that comparing them as text compares their values.
#[derive(PartialEq, Eq)]
pub struct Instant {
    seconds: i64,
    fraction: String,
}

impl Ord for Instant {
    fn cmp(&self, other: &Self) -> Ordering {
        self.seconds.cmp(&other.seconds).then_with(|| self.fraction.cmp(&other.fraction))
    }
}

impl PartialOrd for Instant {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Instant {
    /// The UTC date, "YYYY-MM-DD".
    pub fn utc_date(&self) -> String {
        let (y, m, d) = civil_from_days(self.seconds.div_euclid(86_400));
        format!("{y:04}-{m:02}-{d:02}")
    }
}

fn number(bytes: &[u8]) -> Option<i64> {
    if bytes.is_empty() || !bytes.iter().all(u8::is_ascii_digit) {
        return None;
    }
    Some(bytes.iter().fold(0, |n, b| n * 10 + i64::from(b - b'0')))
}

fn is_leap(year: i64) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

fn days_in_month(year: i64, month: i64) -> i64 {
    match month {
        2 if is_leap(year) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

// Days since 1970-01-01 of a proleptic Gregorian date, and back (Howard Hinnant's algorithms).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { yoe + era * 400 + 1 } else { yoe + era * 400 }, m, d)
}

/// Parses a creation time, or says why it is not one.
pub fn parse(text: &str) -> Result<Instant, &'static str> {
    const FORMAT: &str = "createdAt is not written YYYY-MM-DDTHH:MM:SS with Z or an offset";
    let b = text.as_bytes();
    if b.len() < 20 || b[4] != b'-' || b[7] != b'-' || b[10] != b'T' || b[13] != b':' || b[16] != b':' {
        return Err(FORMAT);
    }
    let field = |range: std::ops::Range<usize>| number(&b[range]).ok_or(FORMAT);
    let (year, month, day) = (field(0..4)?, field(5..7)?, field(8..10)?);
    let (hour, minute, second) = (field(11..13)?, field(14..16)?, field(17..19)?);
    let mut rest = &b[19..];
    let mut fraction = "";
    if rest[0] == b'.' {
        let digits = rest[1..].iter().take_while(|c| c.is_ascii_digit()).count();
        if digits == 0 {
            return Err(FORMAT);
        }
        fraction = &text[20..20 + digits];
        rest = &rest[1 + digits..];
    }
    let offset_minutes = match rest {
        [b'Z'] => 0,
        [sign @ (b'+' | b'-'), h1, h2, b':', m1, m2] => {
            let (h, m) = (number(&[*h1, *h2]).ok_or(FORMAT)?, number(&[*m1, *m2]).ok_or(FORMAT)?);
            if h > 23 || m > 59 {
                return Err("createdAt has an offset that is no real offset");
            }
            if *sign == b'-' { -(h * 60 + m) } else { h * 60 + m }
        }
        _ => return Err(FORMAT),
    };
    if !(1..=12).contains(&month) || day < 1 || day > days_in_month(year, month) {
        return Err("createdAt names a date that does not exist");
    }
    if hour > 23 || minute > 59 || second > 59 {
        return Err("createdAt names a time of day that does not exist");
    }
    let local = days_from_civil(year, month, day) * 86_400 + hour * 3600 + minute * 60 + second;
    Ok(Instant { seconds: local - offset_minutes * 60, fraction: fraction.trim_end_matches('0').to_string() })
}
