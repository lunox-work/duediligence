from decimal import Decimal
from fractions import Fraction

import pytest

from src.solution import format_duration, parse_duration


# @happy 3: Formatting


# extends test_happy_3__milliseconds_only
def test_happy_3__largest_milliseconds_only():
    assert format_duration(999) == "999ms"


def test_happy_3__two_milliseconds():
    assert format_duration(2) == "2ms"


# extends test_happy_3__one_second
def test_happy_3__one_minute():
    assert format_duration(60000) == "1m"


def test_happy_3__one_hour():
    assert format_duration(3600000) == "1h"


def test_happy_3__two_days():
    assert format_duration(172800000) == "2d"


def test_happy_3__whole_seconds_below_a_minute():
    assert format_duration(59000) == "59s"


# extends test_happy_3__minutes_and_seconds
def test_happy_3__seconds_and_milliseconds():
    assert format_duration(1500) == "1s500ms"


def test_happy_3__minutes_and_seconds_one_each():
    assert format_duration(61000) == "1m1s"


def test_happy_3__hours_and_minutes_one_each():
    assert format_duration(3660000) == "1h1m"


def test_happy_3__days_and_hours():
    assert format_duration(90000000) == "1d1h"


# extends test_happy_3__inner_zero_components_omitted
def test_happy_3__hours_and_milliseconds_omit_inner_zeros():
    assert format_duration(3600001) == "1h1ms"


def test_happy_3__minutes_and_milliseconds_omit_seconds():
    assert format_duration(60001) == "1m1ms"


def test_happy_3__days_and_seconds_omit_hours_and_minutes():
    assert format_duration(86401000) == "1d1s"


def test_happy_3__days_and_minutes_omit_hours_and_trailing_zeros():
    assert format_duration(86460000) == "1d1m"


def test_happy_3__seconds_and_milliseconds_one_each():
    assert format_duration(1001) == "1s1ms"


# extends test_happy_3__every_unit
def test_happy_3__every_unit_one_below_next_size():
    assert format_duration(86399999) == "23h59m59s999ms"


def test_happy_3__every_unit_with_two_days():
    assert format_duration(172799999) == "1d23h59m59s999ms"


def test_happy_3__minutes_seconds_milliseconds_below_an_hour():
    assert format_duration(3599999) == "59m59s999ms"


def test_happy_3__seconds_and_milliseconds_below_a_minute():
    assert format_duration(59999) == "59s999ms"


def test_happy_3__multi_digit_counts_in_every_unit():
    assert format_duration(987654321012) == "11431d4h25m21s12ms"


def test_happy_3__large_day_count():
    assert format_duration(10**15) == "11574074d1h46m40s"


def test_happy_3__two_to_the_52():
    assert format_duration(2**52) == "52124995d16h29m30s496ms"


# counts never reach the next unit's size in formatted output
def test_happy_3__ninety_minutes_formats_as_hours_and_minutes():
    assert format_duration(parse_duration("90m")) == "1h30m"


def test_happy_3__thousand_milliseconds_formats_as_one_second():
    assert format_duration(parse_duration("1000ms")) == "1s"


def test_happy_3__twenty_four_hours_formats_as_one_day():
    assert format_duration(parse_duration("24h")) == "1d"


def test_happy_3__result_is_str():
    assert type(format_duration(1)) is str


# @boundary 3: Formatting the largest value


# extends test_boundary_3__one_below_largest_value
def test_boundary_3__two_below_largest_value():
    assert format_duration(9007199254740989) == "104249991d8h59m989ms"


def test_boundary_3__largest_value_without_milliseconds():
    assert format_duration(9007199254740000) == "104249991d8h59m"


def test_boundary_3__largest_whole_days():
    assert format_duration(9007199222400000) == "104249991d"


def test_boundary_3__largest_value_with_one_second_less():
    assert format_duration(9007199254739991) == "104249991d8h58m59s991ms"


# @boundary 4: Formatting then parsing gives the number back


# extends test_boundary_4__round_trip: other values across every unit boundary
def test_boundary_4__round_trip_one():
    assert parse_duration(format_duration(1)) == 1


def test_boundary_4__round_trip_999():
    assert parse_duration(format_duration(999)) == 999


def test_boundary_4__round_trip_one_second():
    assert parse_duration(format_duration(1000)) == 1000


def test_boundary_4__round_trip_just_below_a_minute():
    assert parse_duration(format_duration(59999)) == 59999


def test_boundary_4__round_trip_just_below_an_hour():
    assert parse_duration(format_duration(3599999)) == 3599999


def test_boundary_4__round_trip_just_below_a_day():
    assert parse_duration(format_duration(86399999)) == 86399999


def test_boundary_4__round_trip_one_day_one_millisecond():
    assert parse_duration(format_duration(86400001)) == 86400001


def test_boundary_4__round_trip_large_value():
    assert parse_duration(format_duration(987654321012)) == 987654321012


def test_boundary_4__round_trip_two_to_the_52_plus_one():
    assert parse_duration(format_duration(2**52 + 1)) == 2**52 + 1


def test_boundary_4__round_trip_one_below_largest_value():
    assert parse_duration(format_duration(9007199254740990)) == 9007199254740990


def test_boundary_4__round_trip_many_values():
    for ms in range(0, 200000, 997):
        assert parse_duration(format_duration(ms)) == ms


def test_boundary_4__round_trip_result_is_int():
    assert type(parse_duration(format_duration(123456789))) is int


# @unhappy 5: Out-of-range ints are rejected


# extends test_unhappy_5__rejects_minus_one
def test_unhappy_5__rejects_minus_two():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(-2)


def test_unhappy_5__rejects_minus_one_thousand():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(-1000)


# extends test_unhappy_5__rejects_one_over_limit
def test_unhappy_5__rejects_two_over_limit():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(9007199254740993)


# extends test_unhappy_5__rejects_far_over_limit
def test_unhappy_5__rejects_two_to_the_63():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(2**63)


def test_unhappy_5__rejects_two_to_the_64():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(2**64)


# extends test_unhappy_5__rejects_large_negative
def test_unhappy_5__rejects_far_below_zero():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(-(10**30))


def test_unhappy_5__rejects_negative_largest_plus_one():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(-9007199254740992)


# @unhappy 6: Values that are not ints are rejected


# extends test_unhappy_6__rejects_fractional_float
def test_unhappy_6__rejects_negative_fractional_float():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration(-1.5)


def test_unhappy_6__rejects_small_fractional_float():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration(0.5)


# extends test_unhappy_6__rejects_whole_float: a float is a TypeError even
# where an int of that value would be out of range
def test_unhappy_6__rejects_negative_whole_float():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration(-1.0)


def test_unhappy_6__rejects_whole_float_above_limit():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration(1e20)


def test_unhappy_6__rejects_whole_float_at_limit_neighbour():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration(9007199254740990.0)


def test_unhappy_6__rejects_large_whole_float_in_range():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration(86400000.0)


# extends test_unhappy_6__rejects_whole_float_zero
def test_unhappy_6__rejects_negative_float_zero():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration(-0.0)


# extends test_unhappy_6__rejects_infinity
def test_unhappy_6__rejects_negative_infinity():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration(float("-inf"))


# extends test_unhappy_6__rejects_numeric_string
def test_unhappy_6__rejects_zero_string():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration("0")


def test_unhappy_6__rejects_duration_string():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration("250ms")


def test_unhappy_6__rejects_bytes():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration(b"250")


# extends test_unhappy_6__rejects_none: other non-int numbers and containers
def test_unhappy_6__rejects_whole_decimal():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration(Decimal("5"))


def test_unhappy_6__rejects_whole_fraction():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration(Fraction(5, 1))


def test_unhappy_6__rejects_complex():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration(complex(5, 0))


def test_unhappy_6__rejects_list_of_int():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration([250])
