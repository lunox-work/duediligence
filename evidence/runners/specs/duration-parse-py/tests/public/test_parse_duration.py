import pytest

from src.solution import parse_duration


# @happy 1: Components add up


def test_happy_1__milliseconds_component():
    assert parse_duration("250ms") == 250


def test_happy_1__seconds_component():
    assert parse_duration("90s") == 90000


def test_happy_1__hours_and_minutes_add_up():
    assert parse_duration("1h30m") == 5400000


def test_happy_1__days_component():
    assert parse_duration("2d") == 172800000


def test_happy_1__zero_seconds():
    assert parse_duration("0s") == 0


def test_happy_1__all_units_with_zero_counts():
    assert parse_duration("1d0h0m0s0ms") == 86400000


def test_happy_1__every_unit_once():
    assert parse_duration("1d1h1m1s1ms") == 90061001


def test_happy_1__minutes_followed_by_milliseconds():
    assert parse_duration("1m1ms") == 60001


def test_happy_1__zero_milliseconds():
    assert parse_duration("0ms") == 0


def test_happy_1__result_is_int():
    assert type(parse_duration("1h")) is int


# @boundary 1: Surrounding whitespace is ignored


def test_boundary_1__spaces_and_newline_trimmed():
    assert parse_duration("  45m\n") == 2700000


def test_boundary_1__tabs_and_mixed_whitespace_trimmed():
    assert parse_duration("\t\r\n 1h30m \t") == 5400000


# @unhappy 1: Malformed durations are rejected


def test_unhappy_1__rejects_empty_string():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("")


def test_unhappy_1__rejects_bare_number():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("90")


def test_unhappy_1__rejects_decimal_point():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1.5h")


def test_unhappy_1__rejects_leading_zero():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("05s")


def test_unhappy_1__rejects_minus_sign():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("-3s")


def test_unhappy_1__rejects_plus_sign():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("+3s")


def test_unhappy_1__rejects_space_between_components():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h 30m")


def test_unhappy_1__rejects_comma_between_components():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h,30m")


def test_unhappy_1__rejects_unknown_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("3w")


def test_unhappy_1__rejects_uppercase_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("3S")


def test_unhappy_1__rejects_space_between_count_and_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("3 s")


def test_unhappy_1__rejects_unit_without_count():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("ms")


def test_unhappy_1__rejects_non_ascii_digit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("３s")


def test_unhappy_1__rejects_whitespace_only():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("   ")


def test_unhappy_1__rejects_double_zero():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("00ms")


def test_unhappy_1__rejects_trailing_count_without_unit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h30")


def test_unhappy_1__rejects_mixed_case_milliseconds():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("3Ms")


# @unhappy 2: A value that is not a string is rejected


def test_unhappy_2__rejects_int():
    with pytest.raises(TypeError, match="duration"):
        parse_duration(90)


def test_unhappy_2__rejects_bytes():
    with pytest.raises(TypeError, match="duration"):
        parse_duration(b"90s")


def test_unhappy_2__rejects_none():
    with pytest.raises(TypeError, match="duration"):
        parse_duration(None)


# @happy 2: A count may exceed the next unit


def test_happy_2__ninety_minutes():
    assert parse_duration("90m") == 5400000


def test_happy_2__count_equal_to_next_unit_size():
    assert parse_duration("1000ms") == 1000


def test_happy_2__hours_exceeding_a_day():
    assert parse_duration("25h") == 90000000


# @unhappy 3: Out-of-order or repeated units are rejected


def test_unhappy_3__rejects_minutes_before_hours():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("30m1h")


def test_unhappy_3__rejects_repeated_hours():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1h1h")


def test_unhappy_3__rejects_seconds_repeated_around_milliseconds():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1s500ms2s")


def test_unhappy_3__rejects_milliseconds_before_seconds():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("5ms1s")


def test_unhappy_3__rejects_repeated_zero_components():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("0h0h")


def test_unhappy_3__rejects_milliseconds_before_minutes():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("1ms1m")


# @boundary 2: The largest duration parses


def test_boundary_2__largest_duration_parses():
    assert parse_duration("104249991d8h59m991ms") == 9007199254740991


def test_boundary_2__largest_duration_as_milliseconds_only():
    assert parse_duration("9007199254740991ms") == 9007199254740991


# @unhappy 4: One millisecond more is rejected


def test_unhappy_4__rejects_one_millisecond_over_limit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("104249991d8h59m992ms")


def test_unhappy_4__rejects_one_over_limit_in_milliseconds_only():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("9007199254740992ms")


def test_unhappy_4__rejects_far_over_limit():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("99999999999999999999d")
