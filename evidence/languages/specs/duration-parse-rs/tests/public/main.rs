#![allow(non_snake_case)]

use task::{format_duration, parse_duration};

const MAX_MS: u64 = 9007199254740991;

fn assert_parse_rejected(text: &str) {
    match parse_duration(text) {
        Ok(ms) => panic!("parse_duration({:?}) returned Ok({}), expected Err", text, ms),
        Err(err) => {
            let shown = err.to_string();
            assert!(
                shown.contains("duration"),
                "Display text {:?} for {:?} does not contain \"duration\"",
                shown,
                text
            );
        }
    }
}

fn assert_format_rejected(ms: u64) {
    match format_duration(ms) {
        Ok(text) => panic!("format_duration({}) returned Ok({:?}), expected Err", ms, text),
        Err(err) => {
            let shown = err.to_string();
            assert!(
                shown.contains("milliseconds"),
                "Display text {:?} for {} does not contain \"milliseconds\"",
                shown,
                ms
            );
        }
    }
}

// R1 @happy: Components add up

#[test]
fn happy_1__hours_and_minutes_add_up() {
    assert_eq!(parse_duration("1h30m"), Ok(5400000));
}

#[test]
fn happy_1__milliseconds_alone() {
    assert_eq!(parse_duration("250ms"), Ok(250));
}

#[test]
fn happy_1__days_alone() {
    assert_eq!(parse_duration("2d"), Ok(172800000));
}

#[test]
fn happy_1__single_zero_count_is_allowed() {
    assert_eq!(parse_duration("0s"), Ok(0));
}

#[test]
fn happy_1__all_five_units_with_zero_counts() {
    assert_eq!(parse_duration("1d0h0m0s0ms"), Ok(86400000));
}

// R1 @boundary: Surrounding whitespace is ignored

#[test]
fn boundary_1__surrounding_spaces_and_newline_are_trimmed() {
    assert_eq!(parse_duration("  45m\n"), Ok(2700000));
}

#[test]
fn boundary_1__tabs_and_carriage_return_are_trimmed() {
    assert_eq!(parse_duration("\t45m\r\n"), Ok(2700000));
}

// R1 @unhappy: Malformed durations are rejected

#[test]
fn unhappy_1__rejects_space_between_components() {
    assert_parse_rejected("1h 30m");
}

#[test]
fn unhappy_1__rejects_empty_string() {
    assert_parse_rejected("");
}

#[test]
fn unhappy_1__rejects_whitespace_only() {
    assert_parse_rejected("   ");
}

#[test]
fn unhappy_1__rejects_bare_number() {
    assert_parse_rejected("90");
}

#[test]
fn unhappy_1__rejects_decimal_point() {
    assert_parse_rejected("1.5h");
}

#[test]
fn unhappy_1__rejects_leading_zero() {
    assert_parse_rejected("05s");
}

#[test]
fn unhappy_1__rejects_minus_sign() {
    assert_parse_rejected("-3s");
}

#[test]
fn unhappy_1__rejects_plus_sign() {
    assert_parse_rejected("+3s");
}

#[test]
fn unhappy_1__rejects_comma_separator() {
    assert_parse_rejected("1h,30m");
}

#[test]
fn unhappy_1__rejects_unknown_unit() {
    assert_parse_rejected("3w");
}

#[test]
fn unhappy_1__rejects_uppercase_unit() {
    assert_parse_rejected("3S");
}

#[test]
fn unhappy_1__rejects_space_between_count_and_unit() {
    assert_parse_rejected("3 s");
}

#[test]
fn unhappy_1__rejects_unit_without_count() {
    assert_parse_rejected("ms");
}

#[test]
fn unhappy_1__rejects_non_ascii_digit() {
    assert_parse_rejected("３s");
}

// R2 @happy: A count may exceed the next unit

#[test]
fn happy_2__ninety_minutes_parses() {
    assert_eq!(parse_duration("90m"), Ok(5400000));
}

#[test]
fn happy_2__count_equal_to_next_unit_size_parses() {
    assert_eq!(parse_duration("60s"), Ok(60000));
}

// R2 @unhappy: Out-of-order or repeated units are rejected

#[test]
fn unhappy_2__rejects_minutes_before_hours() {
    assert_parse_rejected("30m1h");
}

#[test]
fn unhappy_2__rejects_repeated_unit() {
    assert_parse_rejected("1h1h");
}

#[test]
fn unhappy_2__rejects_unit_repeated_after_smaller_unit() {
    assert_parse_rejected("1s500ms2s");
}

#[test]
fn unhappy_2__rejects_milliseconds_before_seconds() {
    assert_parse_rejected("5ms1s");
}

// R3 @boundary: The largest duration parses

#[test]
fn boundary_2__largest_duration_parses() {
    assert_eq!(parse_duration("104249991d8h59m991ms"), Ok(MAX_MS));
}

#[test]
fn boundary_2__largest_duration_as_milliseconds_parses() {
    assert_eq!(parse_duration("9007199254740991ms"), Ok(MAX_MS));
}

// R3 @unhappy: Totals above the largest are rejected

#[test]
fn unhappy_3__rejects_total_one_above_largest() {
    assert_parse_rejected("104249991d8h59m992ms");
}

#[test]
fn unhappy_3__rejects_single_count_one_above_largest() {
    assert_parse_rejected("9007199254740992ms");
}

#[test]
fn unhappy_3__rejects_count_too_large_for_u64() {
    assert_parse_rejected("99999999999999999999ms");
}

// R4 @happy: Formatting

#[test]
fn happy_3__formats_hours_and_minutes() {
    assert_eq!(format_duration(5400000), Ok("1h30m".to_string()));
}

#[test]
fn happy_3__formats_milliseconds_only() {
    assert_eq!(format_duration(250), Ok("250ms".to_string()));
}

#[test]
fn happy_3__formats_minutes_and_seconds() {
    assert_eq!(format_duration(90000), Ok("1m30s".to_string()));
}

#[test]
fn happy_3__omits_zero_components_of_whole_day() {
    assert_eq!(format_duration(86400000), Ok("1d".to_string()));
}

#[test]
fn happy_3__formats_every_unit() {
    assert_eq!(format_duration(90061001), Ok("1d1h1m1s1ms".to_string()));
}

#[test]
fn happy_3__formats_zero_as_zero_milliseconds() {
    assert_eq!(format_duration(0), Ok("0ms".to_string()));
}

// R4 @boundary: Formatting the largest value

#[test]
fn boundary_3__formats_largest_value() {
    assert_eq!(format_duration(MAX_MS), Ok("104249991d8h59m991ms".to_string()));
}

#[test]
fn boundary_3__formats_one_below_largest_value() {
    assert_eq!(
        format_duration(MAX_MS - 1),
        Ok("104249991d8h59m990ms".to_string())
    );
}

// R4 @boundary: Formatting then parsing gives the number back

#[test]
fn boundary_4__format_then_parse_round_trips() {
    let text = format_duration(123456789).expect("format_duration(123456789) is Ok");
    assert_eq!(parse_duration(&text), Ok(123456789));
}

#[test]
fn boundary_4__format_then_parse_round_trips_zero() {
    let text = format_duration(0).expect("format_duration(0) is Ok");
    assert_eq!(parse_duration(&text), Ok(0));
}

#[test]
fn boundary_4__format_then_parse_round_trips_largest() {
    let text = format_duration(MAX_MS).expect("format_duration(MAX_MS) is Ok");
    assert_eq!(parse_duration(&text), Ok(MAX_MS));
}

// R4 @unhappy: Out-of-range values are rejected

#[test]
fn unhappy_4__rejects_u64_max() {
    assert_format_rejected(u64::MAX);
}

#[test]
fn unhappy_4__rejects_one_above_largest() {
    assert_format_rejected(MAX_MS + 1);
}
