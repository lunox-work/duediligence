import pytest

from src.solution import parse_duration


# @happy 1: Components add up


# extends test_happy_1__milliseconds_component
def test_happy_1__single_millisecond():
    assert parse_duration("1ms") == 1


# extends test_happy_1__milliseconds_component: "5ms" is 5 ms, not 5m plus a stray "s"
def test_happy_1__five_ms_is_milliseconds_not_minutes():
    assert parse_duration("5ms") == 5


def test_happy_1__count_with_inner_zero_digit():
    assert parse_duration("100ms") == 100


def test_happy_1__count_ending_in_zero():
    assert parse_duration("10s") == 10000


# extends test_happy_1__seconds_component
def test_happy_1__one_second():
    assert parse_duration("1s") == 1000


def test_happy_1__one_minute():
    assert parse_duration("1m") == 60000


def test_happy_1__one_hour():
    assert parse_duration("1h") == 3600000


# extends test_happy_1__days_component
def test_happy_1__one_day():
    assert parse_duration("1d") == 86400000


def test_happy_1__one_week_of_days():
    assert parse_duration("7d") == 604800000


def test_happy_1__hundred_days():
    assert parse_duration("100d") == 8640000000


# extends test_happy_1__hours_and_minutes_add_up: other values and units
def test_happy_1__minutes_and_seconds_add_up():
    assert parse_duration("1m5s") == 65000


def test_happy_1__days_and_hours_add_up():
    assert parse_duration("3d4h") == 3 * 86400000 + 4 * 3600000


def test_happy_1__hours_and_seconds_skipping_minutes():
    assert parse_duration("1h1s") == 3601000


def test_happy_1__days_and_milliseconds_skipping_middle_units():
    assert parse_duration("1d1ms") == 86400001


def test_happy_1__seconds_and_milliseconds():
    assert parse_duration("1s500ms") == 1500


def test_happy_1__multi_digit_counts_in_every_unit():
    assert parse_duration("12d34h56m78s910ms") == (
        12 * 86400000 + 34 * 3600000 + 56 * 60000 + 78 * 1000 + 910
    )


def test_happy_1__every_unit_largest_counts_below_next_size():
    assert parse_duration("1d23h59m59s999ms") == 172799999


# extends test_happy_1__zero_seconds
def test_happy_1__zero_days():
    assert parse_duration("0d") == 0


def test_happy_1__zero_hours():
    assert parse_duration("0h") == 0


def test_happy_1__zero_minutes():
    assert parse_duration("0m") == 0


# extends test_happy_1__all_units_with_zero_counts
def test_happy_1__all_units_zero():
    assert parse_duration("0d0h0m0s0ms") == 0


def test_happy_1__zero_components_around_nonzero_one():
    assert parse_duration("0d0h5m0s0ms") == 300000


def test_happy_1__trailing_milliseconds_after_zero_components():
    assert parse_duration("0h0m0s7ms") == 7


# extends test_happy_1__result_is_int
def test_happy_1__zero_result_is_int_not_bool():
    result = parse_duration("0ms")
    assert type(result) is int
    assert result == 0


def test_happy_1__multi_component_result_is_int():
    assert type(parse_duration("1d1h1m1s1ms")) is int


def test_happy_1__millisecond_result_is_int_not_bool():
    assert type(parse_duration("1ms")) is int


# @happy 2: A count may exceed the next unit


# extends test_happy_2__ninety_minutes
def test_happy_2__sixty_minutes():
    assert parse_duration("60m") == 3600000


def test_happy_2__hundred_twenty_seconds():
    assert parse_duration("120s") == 120000


def test_happy_2__milliseconds_over_one_second():
    assert parse_duration("1500ms") == 1500


def test_happy_2__forty_eight_hours():
    assert parse_duration("48h") == 172800000


def test_happy_2__large_count_combined_with_larger_unit():
    assert parse_duration("1h90m") == 9000000


def test_happy_2__every_count_at_next_unit_size():
    assert parse_duration("1d24h60m60s1000ms") == 86400000 + 86400000 + 3600000 + 60000 + 1000


def test_happy_2__one_day_in_milliseconds():
    assert parse_duration("86400000ms") == 86400000


# @boundary 1: Surrounding whitespace is ignored


# extends test_boundary_1__spaces_and_newline_trimmed
def test_boundary_1__leading_space_only():
    assert parse_duration(" 250ms") == 250


def test_boundary_1__trailing_space_only():
    assert parse_duration("250ms ") == 250


def test_boundary_1__trailing_newlines_only():
    assert parse_duration("2d\n\n") == 172800000


def test_boundary_1__leading_newline_only():
    assert parse_duration("\n0s") == 0


def test_boundary_1__tabs_around_every_unit():
    assert parse_duration("\t1d1h1m1s1ms\t") == 90061001


def test_boundary_1__many_surrounding_spaces():
    assert parse_duration(" " * 50 + "90m" + " " * 50) == 5400000


# @boundary 2: The largest duration parses


# extends test_boundary_2__largest_duration_as_milliseconds_only
def test_boundary_2__largest_duration_as_seconds_and_milliseconds():
    assert parse_duration("9007199254740s991ms") == 9007199254740991


def test_boundary_2__largest_duration_as_minutes_and_milliseconds():
    assert parse_duration("150119987579m991ms") == 9007199254740991


def test_boundary_2__largest_duration_as_hours_minutes_milliseconds():
    assert parse_duration("2501999792h59m991ms") == 9007199254740991


def test_boundary_2__largest_duration_with_explicit_zero_seconds():
    assert parse_duration("104249991d8h59m0s991ms") == 9007199254740991


def test_boundary_2__largest_duration_with_count_exceeding_next_unit():
    assert parse_duration("104249991d8h58m60s991ms") == 9007199254740991


def test_boundary_2__largest_duration_is_int():
    assert type(parse_duration("104249991d8h59m991ms")) is int


def test_boundary_2__largest_whole_days():
    assert parse_duration("104249991d") == 9007199222400000


def test_boundary_2__largest_duration_with_surrounding_whitespace():
    assert parse_duration(" 104249991d8h59m991ms\n") == 9007199254740991


# @unhappy 1: Malformed durations are rejected


# extends test_unhappy_1__rejects_bare_number
def test_unhappy_1__rejects_bare_zero():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("0")


def test_unhappy_1__rejects_bare_large_number():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("250000")


def test_unhappy_1__rejects_bare_number_with_whitespace():
    with pytest.raises(ValueError, match="duration"):
        parse_duration(" 90 ")


# extends test_unhappy_1__rejects_decimal_point
def test_unhappy_1__rejects_decimal_point_in_milliseconds():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1.0ms")


def test_unhappy_1__rejects_leading_decimal_point():
    with pytest.raises(ValueError, match="duration"):
        parse_duration(".5s")


def test_unhappy_1__rejects_decimal_point_in_later_component():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h1.5m")


def test_unhappy_1__rejects_exponent_notation():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1e3ms")


def test_unhappy_1__rejects_underscore_digit_separator():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1_000ms")


def test_unhappy_1__rejects_hex_count():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("0x10s")


# extends test_unhappy_1__rejects_leading_zero
def test_unhappy_1__rejects_leading_zero_in_later_component():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h05m")


def test_unhappy_1__rejects_double_zero_in_later_component():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h00m")


def test_unhappy_1__rejects_leading_zero_in_last_milliseconds():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1s050ms")


def test_unhappy_1__rejects_many_leading_zeros():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("0001d")


def test_unhappy_1__rejects_triple_zero():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("000s")


def test_unhappy_1__rejects_leading_zero_after_zero_component():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("0h01m")


# extends test_unhappy_1__rejects_minus_sign
def test_unhappy_1__rejects_minus_sign_in_later_component():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h-30m")


def test_unhappy_1__rejects_negative_zero():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("-0s")


# extends test_unhappy_1__rejects_plus_sign
def test_unhappy_1__rejects_plus_sign_between_components():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h+30m")


# extends test_unhappy_1__rejects_space_between_components
def test_unhappy_1__rejects_tab_between_components():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h\t30m")


def test_unhappy_1__rejects_newline_between_components():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h\n30m")


def test_unhappy_1__rejects_no_break_space_between_components():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h 30m")


def test_unhappy_1__rejects_space_between_components_with_surrounding_whitespace():
    with pytest.raises(ValueError, match="duration"):
        parse_duration(" 1d 1h ")


# extends test_unhappy_1__rejects_comma_between_components
def test_unhappy_1__rejects_semicolon_between_components():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h;30m")


def test_unhappy_1__rejects_colon_between_components():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h:30m")


def test_unhappy_1__rejects_underscore_between_components():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h_30m")


def test_unhappy_1__rejects_word_between_components():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1hand30m")


def test_unhappy_1__rejects_trailing_garbage():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h30mx")


def test_unhappy_1__rejects_leading_garbage():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("x1h30m")


def test_unhappy_1__rejects_trailing_punctuation():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("30s.")


# extends test_unhappy_1__rejects_unknown_unit
def test_unhappy_1__rejects_year_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1y")


def test_unhappy_1__rejects_microsecond_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("3us")


def test_unhappy_1__rejects_nanosecond_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("3ns")


def test_unhappy_1__rejects_spelled_out_seconds_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("3sec")


def test_unhappy_1__rejects_spelled_out_minutes_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("3min")


def test_unhappy_1__rejects_hr_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("3hr")


def test_unhappy_1__rejects_weeks_after_valid_component():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1d3w")


def test_unhappy_1__rejects_doubled_unit_letter():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1hh")


def test_unhappy_1__rejects_unit_letters_reversed():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("3sm")


# extends test_unhappy_1__rejects_uppercase_unit
def test_unhappy_1__rejects_uppercase_day():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("3D")


def test_unhappy_1__rejects_uppercase_hour():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("3H")


def test_unhappy_1__rejects_uppercase_minute():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("3M")


def test_unhappy_1__rejects_uppercase_milliseconds():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("3MS")


def test_unhappy_1__rejects_uppercase_units_in_combination():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1H30M")


def test_unhappy_1__rejects_uppercase_unit_after_lowercase_one():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h30M")


# extends test_unhappy_1__rejects_mixed_case_milliseconds
def test_unhappy_1__rejects_milliseconds_with_uppercase_s():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("3mS")


# extends test_unhappy_1__rejects_space_between_count_and_unit
def test_unhappy_1__rejects_space_inside_later_component():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h30 m")


def test_unhappy_1__rejects_space_inside_milliseconds_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("3m s")


def test_unhappy_1__rejects_space_inside_count():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1 0s")


# extends test_unhappy_1__rejects_unit_without_count
def test_unhappy_1__rejects_bare_day_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("d")


def test_unhappy_1__rejects_bare_second_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("s")


def test_unhappy_1__rejects_bare_minute_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("m")


def test_unhappy_1__rejects_later_unit_without_count():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1hm")


def test_unhappy_1__rejects_trailing_unit_without_count():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1hms")


# extends test_unhappy_1__rejects_non_ascii_digit
def test_unhappy_1__rejects_arabic_indic_digit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("٣s")


def test_unhappy_1__rejects_devanagari_digit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("३m")


def test_unhappy_1__rejects_superscript_digit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("²s")


def test_unhappy_1__rejects_non_ascii_digit_mixed_with_ascii():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1٠s")


def test_unhappy_1__rejects_fullwidth_digit_in_later_component():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h３0m")


def test_unhappy_1__rejects_fullwidth_unit_letter():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("3ｓ")


# extends test_unhappy_1__rejects_whitespace_only
def test_unhappy_1__rejects_newline_only():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("\n")


def test_unhappy_1__rejects_mixed_whitespace_only():
    with pytest.raises(ValueError, match="duration"):
        parse_duration(" \t\r\n ")


# extends test_unhappy_1__rejects_trailing_count_without_unit
def test_unhappy_1__rejects_trailing_count_after_milliseconds():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("5ms3")


def test_unhappy_1__rejects_trailing_count_after_days():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1d5")


def test_unhappy_1__rejects_trailing_zero_count_without_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h0")


# trimmed text is still validated in full
def test_unhappy_1__rejects_leading_zero_inside_surrounding_whitespace():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("  05s  ")


def test_unhappy_1__rejects_unknown_unit_inside_surrounding_whitespace():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("\t3w\n")


# @unhappy 2: A value that is not a string is rejected


# extends test_unhappy_2__rejects_int
def test_unhappy_2__rejects_zero_int():
    with pytest.raises(TypeError, match="duration"):
        parse_duration(0)


def test_unhappy_2__rejects_float():
    with pytest.raises(TypeError, match="duration"):
        parse_duration(5.0)


def test_unhappy_2__rejects_bool():
    with pytest.raises(TypeError, match="duration"):
        parse_duration(True)


# extends test_unhappy_2__rejects_bytes
def test_unhappy_2__rejects_bytearray():
    with pytest.raises(TypeError, match="duration"):
        parse_duration(bytearray(b"90s"))


def test_unhappy_2__rejects_list_of_string():
    with pytest.raises(TypeError, match="duration"):
        parse_duration(["1h"])


def test_unhappy_2__rejects_tuple_of_strings():
    with pytest.raises(TypeError, match="duration"):
        parse_duration(("1h", "30m"))


def test_unhappy_2__rejects_dict():
    with pytest.raises(TypeError, match="duration"):
        parse_duration({"h": 1})


# @unhappy 3: Out-of-order or repeated units are rejected


# extends test_unhappy_3__rejects_minutes_before_hours
def test_unhappy_3__rejects_hours_before_days():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h1d")


def test_unhappy_3__rejects_seconds_before_minutes():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1s1m")


def test_unhappy_3__rejects_milliseconds_before_days():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1ms1d")


def test_unhappy_3__rejects_fully_reversed_units():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1ms1s1m1h1d")


def test_unhappy_3__rejects_one_swapped_pair_in_long_duration():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1d1m1h1s1ms")


def test_unhappy_3__rejects_out_of_order_with_zero_counts():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("0s0m")


def test_unhappy_3__rejects_out_of_order_inside_surrounding_whitespace():
    with pytest.raises(ValueError, match="duration"):
        parse_duration(" 30m1h ")


# extends test_unhappy_3__rejects_repeated_hours
def test_unhappy_3__rejects_repeated_days():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1d1d")


def test_unhappy_3__rejects_repeated_minutes():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1m2m")


def test_unhappy_3__rejects_repeated_seconds():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("2s2s")


def test_unhappy_3__rejects_repeated_milliseconds():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1ms1ms")


def test_unhappy_3__rejects_doubled_milliseconds_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1msms")


# extends test_unhappy_3__rejects_seconds_repeated_around_milliseconds
def test_unhappy_3__rejects_hours_repeated_around_minutes():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h1m1h")


def test_unhappy_3__rejects_days_repeated_at_end_of_full_duration():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1d1h1m1s1ms1d")


def test_unhappy_3__rejects_repeated_last_unit_of_full_duration():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1d2h3m4s5ms5ms")


def test_unhappy_3__rejects_earlier_unit_after_gap():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1d1s1h")


# extends test_unhappy_3__rejects_milliseconds_before_seconds
def test_unhappy_3__rejects_minutes_before_hours_after_days():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1d5m2h")


# @unhappy 4: One millisecond more is rejected


# extends test_unhappy_4__rejects_one_over_limit_in_milliseconds_only
def test_unhappy_4__rejects_one_over_limit_as_seconds_and_milliseconds():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("9007199254740s992ms")


def test_unhappy_4__rejects_one_over_limit_as_minutes_and_milliseconds():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("150119987579m992ms")


def test_unhappy_4__rejects_one_over_limit_with_count_exceeding_next_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("104249991d8h58m60s992ms")


def test_unhappy_4__rejects_one_over_limit_with_surrounding_whitespace():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("  104249991d8h59m992ms\n")


# components each within the limit whose sum exceeds it
def test_unhappy_4__rejects_sum_over_limit_from_extra_hour():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("104249991d9h")


def test_unhappy_4__rejects_sum_over_limit_from_extra_second():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("104249991d8h59m1s")


def test_unhappy_4__rejects_limit_plus_one_millisecond_component():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1s9007199254739992ms")


def test_unhappy_4__rejects_one_day_over_largest_whole_days():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("104249992d")


def test_unhappy_4__rejects_hours_over_limit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("2501999793h")


# extends test_unhappy_4__rejects_far_over_limit
def test_unhappy_4__rejects_hundred_digit_count():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1" + "0" * 100 + "ms")


def test_unhappy_4__rejects_two_to_the_64_milliseconds():
    with pytest.raises(ValueError, match="duration"):
        parse_duration(str(2**64) + "ms")
