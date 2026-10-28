#![allow(non_snake_case)]

use task::{format_duration, parse_duration, FormatDurationError, ParseDurationError};

const MAX_MS: u64 = 9007199254740991;

fn assert_parse_rejected(text: &str) {
    match parse_duration(text) {
        Ok(ms) => panic!("parse_duration({:?}) returned Ok({}), expected Err", text, ms),
        Err(err) => {
            assert_eq!(err, ParseDurationError::InvalidDuration);
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
            assert_eq!(err, FormatDurationError::MillisecondsOutOfRange);
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

// Spec example the public suite skips.
#[test]
fn happy_1__seconds_alone() {
    assert_eq!(parse_duration("90s"), Ok(90000));
}

// Extends happy_1__hours_and_minutes_add_up: every unit with non-zero counts.
#[test]
fn happy_1__all_five_units_with_nonzero_counts() {
    assert_eq!(parse_duration("3d4h5m6s7ms"), Ok(273906007));
}

// Extends happy_1__hours_and_minutes_add_up: `m` followed by `ms` is not read as `m` then `s`.
#[test]
fn happy_1__minutes_then_milliseconds() {
    assert_eq!(parse_duration("1m1ms"), Ok(60001));
}

// Extends happy_1__milliseconds_alone: `1ms` is one millisecond, not a minute and a second.
#[test]
fn happy_1__one_millisecond() {
    assert_eq!(parse_duration("1ms"), Ok(1));
}

// Extends happy_1__hours_and_minutes_add_up: non-adjacent units.
#[test]
fn happy_1__days_and_milliseconds_skip_middle_units() {
    assert_eq!(parse_duration("1d1ms"), Ok(86400001));
}

// Extends happy_1__hours_and_minutes_add_up: hours then seconds.
#[test]
fn happy_1__hours_then_seconds() {
    assert_eq!(parse_duration("2h15s"), Ok(7215000));
}

// Extends happy_1__days_alone: a multi-digit day count.
#[test]
fn happy_1__multi_digit_days() {
    assert_eq!(parse_duration("365d"), Ok(31536000000));
}

// Extends happy_1__single_zero_count_is_allowed: zero is allowed in other units.
#[test]
fn happy_1__zero_milliseconds() {
    assert_eq!(parse_duration("0ms"), Ok(0));
}

// Extends happy_1__single_zero_count_is_allowed: zero days.
#[test]
fn happy_1__zero_days() {
    assert_eq!(parse_duration("0d"), Ok(0));
}

// Extends happy_1__single_zero_count_is_allowed: zeros inside a count are not leading zeros.
#[test]
fn happy_1__count_with_inner_and_trailing_zeros() {
    assert_eq!(parse_duration("1000ms"), Ok(1000));
}

// Extends happy_1__single_zero_count_is_allowed: a count ending in zero in a later component.
#[test]
fn happy_1__later_component_count_ending_in_zero() {
    assert_eq!(parse_duration("1h10m"), Ok(4200000));
}

// Extends happy_1__all_five_units_with_zero_counts: zero counts on the larger units.
#[test]
fn happy_1__zero_larger_units_then_milliseconds() {
    assert_eq!(parse_duration("0d0h0m0s5ms"), Ok(5));
}

// Extends happy_1__all_five_units_with_zero_counts: every count zero.
#[test]
fn happy_1__all_five_units_all_zero() {
    assert_eq!(parse_duration("0d0h0m0s0ms"), Ok(0));
}

// R1 @boundary: Surrounding whitespace is ignored

// Extends boundary_1__surrounding_spaces_and_newline_are_trimmed: whitespace only before.
#[test]
fn boundary_1__leading_whitespace_only_is_trimmed() {
    assert_eq!(parse_duration("   1h30m"), Ok(5400000));
}

// Extends boundary_1__surrounding_spaces_and_newline_are_trimmed: whitespace only after.
#[test]
fn boundary_1__trailing_whitespace_only_is_trimmed() {
    assert_eq!(parse_duration("250ms \t\n"), Ok(250));
}

// Extends boundary_1__tabs_and_carriage_return_are_trimmed: str::trim also removes
// Unicode whitespace such as NO-BREAK SPACE and IDEOGRAPHIC SPACE.
#[test]
fn boundary_1__unicode_whitespace_is_trimmed() {
    assert_eq!(parse_duration("\u{00A0}45m\u{3000}"), Ok(2700000));
}

// Extends boundary_1__tabs_and_carriage_return_are_trimmed: vertical tab and form feed.
#[test]
fn boundary_1__vertical_tab_and_form_feed_are_trimmed() {
    assert_eq!(parse_duration("\u{000B}\u{000C}1d1h\u{000C}"), Ok(90000000));
}

// R1 @unhappy: Malformed durations are rejected

// Extends unhappy_1__rejects_bare_number: a trailing number after a valid component.
#[test]
fn unhappy_1__rejects_trailing_bare_number() {
    assert_parse_rejected("1h30");
}

// Extends unhappy_1__rejects_bare_number: a bare zero.
#[test]
fn unhappy_1__rejects_bare_zero() {
    assert_parse_rejected("0");
}

// Extends unhappy_1__rejects_decimal_point: decimal on milliseconds.
#[test]
fn unhappy_1__rejects_decimal_milliseconds() {
    assert_parse_rejected("0.5ms");
}

// Extends unhappy_1__rejects_decimal_point: decimal in a later component.
#[test]
fn unhappy_1__rejects_decimal_in_later_component() {
    assert_parse_rejected("1h1.5m");
}

// Extends unhappy_1__rejects_leading_zero: a double zero.
#[test]
fn unhappy_1__rejects_double_zero() {
    assert_parse_rejected("00s");
}

// Extends unhappy_1__rejects_leading_zero: a leading zero in a later component.
#[test]
fn unhappy_1__rejects_leading_zero_in_later_component() {
    assert_parse_rejected("1h05m");
}

// Extends unhappy_1__rejects_leading_zero: several leading zeros on milliseconds.
#[test]
fn unhappy_1__rejects_many_leading_zeros() {
    assert_parse_rejected("007ms");
}

// Extends unhappy_1__rejects_minus_sign: a negative zero.
#[test]
fn unhappy_1__rejects_negative_zero() {
    assert_parse_rejected("-0s");
}

// Extends unhappy_1__rejects_minus_sign: a sign in a later component.
#[test]
fn unhappy_1__rejects_minus_in_later_component() {
    assert_parse_rejected("1h-30m");
}

// Extends unhappy_1__rejects_plus_sign: a sign between components.
#[test]
fn unhappy_1__rejects_plus_between_components() {
    assert_parse_rejected("1h+30m");
}

// Extends unhappy_1__rejects_space_between_components: a tab between components.
#[test]
fn unhappy_1__rejects_tab_between_components() {
    assert_parse_rejected("1h\t30m");
}

// Extends unhappy_1__rejects_space_between_components: a newline between components.
#[test]
fn unhappy_1__rejects_newline_between_components() {
    assert_parse_rejected("1h\n30m");
}

// Extends unhappy_1__rejects_space_between_components: Unicode whitespace inside.
#[test]
fn unhappy_1__rejects_no_break_space_between_components() {
    assert_parse_rejected("1h\u{00A0}30m");
}

// Extends unhappy_1__rejects_space_between_count_and_unit: inside a later component.
#[test]
fn unhappy_1__rejects_space_inside_later_component() {
    assert_parse_rejected("1h30 m");
}

// Extends unhappy_1__rejects_space_between_count_and_unit: a space inside the digits.
#[test]
fn unhappy_1__rejects_space_inside_count() {
    assert_parse_rejected("1 0s");
}

// Extends unhappy_1__rejects_space_between_count_and_unit: a space splitting `ms`.
#[test]
fn unhappy_1__rejects_space_inside_ms_unit() {
    assert_parse_rejected("5m s");
}

// Extends unhappy_1__rejects_comma_separator: other separators.
#[test]
fn unhappy_1__rejects_colon_separator() {
    assert_parse_rejected("1h:30m");
}

// Extends unhappy_1__rejects_comma_separator: underscore digit separator.
#[test]
fn unhappy_1__rejects_underscore_in_count() {
    assert_parse_rejected("1_000ms");
}

// Extends unhappy_1__rejects_unknown_unit: year.
#[test]
fn unhappy_1__rejects_year_unit() {
    assert_parse_rejected("1y");
}

// Extends unhappy_1__rejects_unknown_unit: a unit spelled out.
#[test]
fn unhappy_1__rejects_spelled_out_unit() {
    assert_parse_rejected("3sec");
}

// Extends unhappy_1__rejects_unknown_unit: microseconds.
#[test]
fn unhappy_1__rejects_microsecond_unit() {
    assert_parse_rejected("3us");
}

// Extends unhappy_1__rejects_unknown_unit: a doubled unit letter.
#[test]
fn unhappy_1__rejects_doubled_unit_letter() {
    assert_parse_rejected("1hh");
}

// Extends unhappy_1__rejects_unknown_unit: trailing characters after a valid duration.
#[test]
fn unhappy_1__rejects_trailing_garbage() {
    assert_parse_rejected("1h30mx");
}

// Extends unhappy_1__rejects_unknown_unit: leading characters before a valid duration.
#[test]
fn unhappy_1__rejects_leading_garbage() {
    assert_parse_rejected("x1h30m");
}

// Extends unhappy_1__rejects_unknown_unit: `mss` is not `ms`.
#[test]
fn unhappy_1__rejects_ms_with_extra_s() {
    assert_parse_rejected("3mss");
}

// Extends unhappy_1__rejects_uppercase_unit: uppercase `MS`.
#[test]
fn unhappy_1__rejects_uppercase_ms() {
    assert_parse_rejected("3MS");
}

// Extends unhappy_1__rejects_uppercase_unit: mixed-case `Ms`.
#[test]
fn unhappy_1__rejects_mixed_case_ms() {
    assert_parse_rejected("3Ms");
}

// Extends unhappy_1__rejects_uppercase_unit: mixed-case `mS`.
#[test]
fn unhappy_1__rejects_mixed_case_ms_lower_first() {
    assert_parse_rejected("3mS");
}

// Extends unhappy_1__rejects_uppercase_unit: uppercase days and hours.
#[test]
fn unhappy_1__rejects_uppercase_days() {
    assert_parse_rejected("1D");
}

// Extends unhappy_1__rejects_uppercase_unit: an uppercase unit in a later component.
#[test]
fn unhappy_1__rejects_uppercase_in_later_component() {
    assert_parse_rejected("1h30M");
}

// Extends unhappy_1__rejects_unit_without_count: a bare `d`.
#[test]
fn unhappy_1__rejects_bare_day_unit() {
    assert_parse_rejected("d");
}

// Extends unhappy_1__rejects_unit_without_count: a later component without a count.
#[test]
fn unhappy_1__rejects_later_unit_without_count() {
    assert_parse_rejected("1hms");
}

// Extends unhappy_1__rejects_unit_without_count: a later `m` without a count.
#[test]
fn unhappy_1__rejects_later_minutes_without_count() {
    assert_parse_rejected("1hm");
}

// Extends unhappy_1__rejects_non_ascii_digit: Arabic-Indic digit.
#[test]
fn unhappy_1__rejects_arabic_indic_digit() {
    assert_parse_rejected("\u{0663}s");
}

// Extends unhappy_1__rejects_non_ascii_digit: a non-ASCII digit mixed with ASCII digits.
#[test]
fn unhappy_1__rejects_non_ascii_digit_after_ascii_digit() {
    assert_parse_rejected("1\u{FF13}s");
}

// Extends unhappy_1__rejects_non_ascii_digit: a fullwidth unit letter.
#[test]
fn unhappy_1__rejects_fullwidth_unit_letter() {
    assert_parse_rejected("3\u{FF53}");
}

// Extends unhappy_1__rejects_decimal_point: exponent notation.
#[test]
fn unhappy_1__rejects_exponent_notation() {
    assert_parse_rejected("1e3ms");
}

// Extends unhappy_1__rejects_empty_string: whitespace-only of Unicode kind.
#[test]
fn unhappy_1__rejects_unicode_whitespace_only() {
    assert_parse_rejected("\u{00A0}\u{3000}");
}

// R2 @happy: A count may exceed the next unit

// Extends happy_2__ninety_minutes_parses: hours above a day.
#[test]
fn happy_2__hours_exceed_a_day() {
    assert_eq!(parse_duration("25h"), Ok(90000000));
}

// Extends happy_2__ninety_minutes_parses: milliseconds above a second after seconds.
#[test]
fn happy_2__milliseconds_exceed_a_second_after_seconds() {
    assert_eq!(parse_duration("1s1500ms"), Ok(2500));
}

// Extends happy_2__count_equal_to_next_unit_size_parses: large counts in every unit.
#[test]
fn happy_2__every_count_exceeds_next_unit() {
    assert_eq!(parse_duration("1d48h120m90s2000ms"), Ok(266492000));
}

// Extends happy_2__ninety_minutes_parses: seconds well above a minute.
#[test]
fn happy_2__seconds_exceed_an_hour() {
    assert_eq!(parse_duration("3600s"), Ok(3600000));
}

// R2 @unhappy: Out-of-order or repeated units are rejected

// Extends unhappy_2__rejects_minutes_before_hours: seconds before minutes.
#[test]
fn unhappy_2__rejects_seconds_before_minutes() {
    assert_parse_rejected("1s1m");
}

// Extends unhappy_2__rejects_minutes_before_hours: hours before days.
#[test]
fn unhappy_2__rejects_hours_before_days() {
    assert_parse_rejected("1h1d");
}

// Extends unhappy_2__rejects_milliseconds_before_seconds: milliseconds before days.
#[test]
fn unhappy_2__rejects_milliseconds_before_days() {
    assert_parse_rejected("1ms1d");
}

// Extends unhappy_2__rejects_minutes_before_hours: reversed order of every unit.
#[test]
fn unhappy_2__rejects_fully_reversed_units() {
    assert_parse_rejected("1ms1s1m1h1d");
}

// Extends unhappy_2__rejects_minutes_before_hours: out of order with zero counts.
#[test]
fn unhappy_2__rejects_out_of_order_zero_counts() {
    assert_parse_rejected("0m0h");
}

// Extends unhappy_2__rejects_minutes_before_hours: out of order at the end of a longer run.
#[test]
fn unhappy_2__rejects_out_of_order_after_valid_prefix() {
    assert_parse_rejected("1d1h1m1s1m");
}

// Extends unhappy_2__rejects_repeated_unit: repeated days.
#[test]
fn unhappy_2__rejects_repeated_days() {
    assert_parse_rejected("1d1d");
}

// Extends unhappy_2__rejects_repeated_unit: repeated milliseconds.
#[test]
fn unhappy_2__rejects_repeated_milliseconds() {
    assert_parse_rejected("1ms1ms");
}

// Extends unhappy_2__rejects_repeated_unit: repeated minutes.
#[test]
fn unhappy_2__rejects_repeated_minutes() {
    assert_parse_rejected("1m2m");
}

// Extends unhappy_2__rejects_repeated_unit: repeated seconds with zero counts.
#[test]
fn unhappy_2__rejects_repeated_zero_seconds() {
    assert_parse_rejected("0s0s");
}

// Extends unhappy_2__rejects_unit_repeated_after_smaller_unit: days after hours after days.
#[test]
fn unhappy_2__rejects_days_repeated_after_hours() {
    assert_parse_rejected("1d2h3d");
}

// R3 @boundary: The largest duration parses

// Extends boundary_2__largest_duration_as_milliseconds_parses: seconds and milliseconds.
#[test]
fn boundary_2__largest_duration_as_seconds_and_milliseconds_parses() {
    assert_eq!(parse_duration("9007199254740s991ms"), Ok(MAX_MS));
}

// Extends boundary_2__largest_duration_parses: days and a large millisecond count.
#[test]
fn boundary_2__largest_duration_as_days_and_milliseconds_parses() {
    assert_eq!(parse_duration("104249991d32340991ms"), Ok(MAX_MS));
}

// Extends boundary_2__largest_duration_parses: one below the largest.
#[test]
fn boundary_2__one_below_largest_parses() {
    assert_eq!(parse_duration("104249991d8h59m990ms"), Ok(MAX_MS - 1));
}

// Extends boundary_2__largest_duration_parses: surrounded by whitespace.
#[test]
fn boundary_2__largest_duration_with_surrounding_whitespace_parses() {
    assert_eq!(parse_duration(" 104249991d8h59m991ms "), Ok(MAX_MS));
}

// R3 @unhappy: Totals above the largest are rejected

// Extends unhappy_3__rejects_single_count_one_above_largest: too many days alone.
#[test]
fn unhappy_3__rejects_days_above_largest() {
    assert_parse_rejected("104249992d");
}

// Extends unhappy_3__rejects_single_count_one_above_largest: seconds one second above.
#[test]
fn unhappy_3__rejects_seconds_above_largest() {
    assert_parse_rejected("9007199254741s");
}

// Extends unhappy_3__rejects_total_one_above_largest: seconds and milliseconds one above.
#[test]
fn unhappy_3__rejects_seconds_and_milliseconds_one_above_largest() {
    assert_parse_rejected("9007199254740s992ms");
}

// Extends unhappy_3__rejects_total_one_above_largest: each component in range, sum above.
#[test]
fn unhappy_3__rejects_sum_of_in_range_components_above_largest() {
    assert_parse_rejected("104249991d9h");
}

// Extends unhappy_3__rejects_count_too_large_for_u64: exactly u64::MAX milliseconds.
#[test]
fn unhappy_3__rejects_u64_max_milliseconds() {
    assert_parse_rejected("18446744073709551615ms");
}

// Extends unhappy_3__rejects_count_too_large_for_u64: one above u64::MAX, which wraps to 0.
#[test]
fn unhappy_3__rejects_count_wrapping_to_zero() {
    assert_parse_rejected("18446744073709551616ms");
}

// Extends unhappy_3__rejects_count_too_large_for_u64: a count that wraps to a small value.
#[test]
fn unhappy_3__rejects_count_wrapping_to_small_value() {
    assert_parse_rejected("18446744073709551621ms");
}

// Extends unhappy_3__rejects_count_too_large_for_u64: count fits a u64 but count times
// the unit overflows and would wrap to 34448384.
#[test]
fn unhappy_3__rejects_day_count_whose_product_overflows_u64() {
    assert_parse_rejected("213503982335d");
}

// Extends unhappy_3__rejects_count_too_large_for_u64: a sum that would wrap a u64.
#[test]
fn unhappy_3__rejects_sum_that_would_wrap_u64() {
    assert_parse_rejected("1d18446744073709551615ms");
}

// Extends unhappy_3__rejects_count_too_large_for_u64: a very long count.
#[test]
fn unhappy_3__rejects_very_long_count() {
    assert_parse_rejected(
        "1000000000000000000000000000000000000000000000000000000000000000000000000000000s",
    );
}

// R4 @happy: Formatting

#[test]
fn happy_3__formats_one_millisecond() {
    assert_eq!(format_duration(1), Ok("1ms".to_string()));
}

// Extends happy_3__formats_milliseconds_only: a count ending in zero.
#[test]
fn happy_3__formats_ten_milliseconds() {
    assert_eq!(format_duration(10), Ok("10ms".to_string()));
}

#[test]
fn happy_3__formats_largest_milliseconds_only() {
    assert_eq!(format_duration(999), Ok("999ms".to_string()));
}

// Extends happy_3__formats_minutes_and_seconds: one second exactly.
#[test]
fn happy_3__formats_one_second() {
    assert_eq!(format_duration(1000), Ok("1s".to_string()));
}

// Extends happy_3__formats_minutes_and_seconds: seconds and milliseconds.
#[test]
fn happy_3__formats_seconds_and_milliseconds() {
    assert_eq!(format_duration(1001), Ok("1s1ms".to_string()));
}

// Extends happy_3__formats_minutes_and_seconds: one minute exactly.
#[test]
fn happy_3__formats_one_minute() {
    assert_eq!(format_duration(60000), Ok("1m".to_string()));
}

// Extends happy_3__formats_hours_and_minutes: one hour exactly, not 60m.
#[test]
fn happy_3__formats_one_hour() {
    assert_eq!(format_duration(3600000), Ok("1h".to_string()));
}

// Extends happy_3__formats_hours_and_minutes: hours and seconds with zero minutes left out.
#[test]
fn happy_3__formats_hours_and_seconds() {
    assert_eq!(format_duration(3601000), Ok("1h1s".to_string()));
}

// Extends happy_3__omits_zero_components_of_whole_day: several days.
#[test]
fn happy_3__formats_two_days() {
    assert_eq!(format_duration(172800000), Ok("2d".to_string()));
}

// Extends happy_3__omits_zero_components_of_whole_day: days and milliseconds only.
#[test]
fn happy_3__formats_days_and_milliseconds() {
    assert_eq!(format_duration(86400001), Ok("1d1ms".to_string()));
}

// Extends happy_3__omits_zero_components_of_whole_day: many days, not hours.
#[test]
fn happy_3__formats_many_days() {
    assert_eq!(format_duration(864000000000), Ok("10000d".to_string()));
}

// Extends happy_3__formats_every_unit: just below a day.
#[test]
fn happy_3__formats_just_below_a_day() {
    assert_eq!(format_duration(86399999), Ok("23h59m59s999ms".to_string()));
}

// Extends happy_3__formats_every_unit: multi-digit counts in every unit.
#[test]
fn happy_3__formats_every_unit_with_multi_digit_counts() {
    assert_eq!(format_duration(123456789), Ok("1d10h17m36s789ms".to_string()));
}

// Extends happy_3__formats_every_unit: just below a minute.
#[test]
fn happy_3__formats_just_below_a_minute() {
    assert_eq!(format_duration(59999), Ok("59s999ms".to_string()));
}

// Extends happy_3__formats_hours_and_minutes: days and minutes with zero hours left out.
#[test]
fn happy_3__formats_days_and_minutes() {
    assert_eq!(format_duration(86460000), Ok("1d1m".to_string()));
}

// R4 @boundary: Formatting the largest value

// Extends boundary_3__formats_one_below_largest_value: the largest whole number of seconds.
#[test]
fn boundary_3__formats_largest_whole_seconds() {
    assert_eq!(
        format_duration(9007199254740000),
        Ok("104249991d8h59m".to_string())
    );
}

// Extends boundary_3__formats_one_below_largest_value: the largest whole number of days.
#[test]
fn boundary_3__formats_largest_whole_days() {
    assert_eq!(format_duration(9007199222400000), Ok("104249991d".to_string()));
}

// R4 @boundary: Formatting then parsing gives the number back

// Extends boundary_4__format_then_parse_round_trips: one millisecond.
#[test]
fn boundary_4__format_then_parse_round_trips_one() {
    let text = format_duration(1).expect("format_duration(1) is Ok");
    assert_eq!(parse_duration(&text), Ok(1));
}

// Extends boundary_4__format_then_parse_round_trips: just below a day.
#[test]
fn boundary_4__format_then_parse_round_trips_just_below_a_day() {
    let text = format_duration(86399999).expect("format_duration(86399999) is Ok");
    assert_eq!(parse_duration(&text), Ok(86399999));
}

// Extends boundary_4__format_then_parse_round_trips: minutes and milliseconds.
#[test]
fn boundary_4__format_then_parse_round_trips_minutes_and_milliseconds() {
    let text = format_duration(60001).expect("format_duration(60001) is Ok");
    assert_eq!(parse_duration(&text), Ok(60001));
}

// Extends boundary_4__format_then_parse_round_trips_largest: one below the largest.
#[test]
fn boundary_4__format_then_parse_round_trips_one_below_largest() {
    let text = format_duration(MAX_MS - 1).expect("format_duration(MAX_MS - 1) is Ok");
    assert_eq!(parse_duration(&text), Ok(MAX_MS - 1));
}

// Extends boundary_4__format_then_parse_round_trips: an arbitrary large value.
#[test]
fn boundary_4__format_then_parse_round_trips_large_value() {
    let text = format_duration(4503599627370497).expect("format_duration(4503599627370497) is Ok");
    assert_eq!(parse_duration(&text), Ok(4503599627370497));
}

// R4 @unhappy: Out-of-range values are rejected

// Extends unhappy_4__rejects_one_above_largest: two above the largest.
#[test]
fn unhappy_4__rejects_two_above_largest() {
    assert_format_rejected(MAX_MS + 2);
}

// Extends unhappy_4__rejects_u64_max: one below u64::MAX.
#[test]
fn unhappy_4__rejects_one_below_u64_max() {
    assert_format_rejected(u64::MAX - 1);
}

// Extends unhappy_4__rejects_one_above_largest: 2^60.
#[test]
fn unhappy_4__rejects_two_to_the_sixtieth() {
    assert_format_rejected(1u64 << 60);
}

// Extends unhappy_4__rejects_one_above_largest: 2^54.
#[test]
fn unhappy_4__rejects_two_to_the_fifty_fourth() {
    assert_format_rejected(1u64 << 54);
}
