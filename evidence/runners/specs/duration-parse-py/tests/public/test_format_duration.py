import pytest

from src.solution import format_duration, parse_duration


# @happy 3: Formatting


def test_happy_3__zero_is_0ms():
    assert format_duration(0) == "0ms"


def test_happy_3__milliseconds_only():
    assert format_duration(250) == "250ms"


def test_happy_3__minutes_and_seconds():
    assert format_duration(90000) == "1m30s"


def test_happy_3__hours_and_minutes():
    assert format_duration(5400000) == "1h30m"


def test_happy_3__one_day():
    assert format_duration(86400000) == "1d"


def test_happy_3__every_unit():
    assert format_duration(90061001) == "1d1h1m1s1ms"


def test_happy_3__one_millisecond():
    assert format_duration(1) == "1ms"


def test_happy_3__one_second():
    assert format_duration(1000) == "1s"


def test_happy_3__inner_zero_components_omitted():
    assert format_duration(86400001) == "1d1ms"


# @boundary 3: Formatting the largest value


def test_boundary_3__largest_value():
    assert format_duration(9007199254740991) == "104249991d8h59m991ms"


def test_boundary_3__one_below_largest_value():
    assert format_duration(9007199254740990) == "104249991d8h59m990ms"


# @boundary 4: Formatting then parsing gives the number back


def test_boundary_4__round_trip():
    assert parse_duration(format_duration(123456789)) == 123456789


def test_boundary_4__formatted_text_of_round_trip_value():
    assert format_duration(123456789) == "1d10h17m36s789ms"


def test_boundary_4__round_trip_zero():
    assert parse_duration(format_duration(0)) == 0


def test_boundary_4__round_trip_largest_value():
    assert parse_duration(format_duration(9007199254740991)) == 9007199254740991


# @unhappy 5: Out-of-range ints are rejected


def test_unhappy_5__rejects_minus_one():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(-1)


def test_unhappy_5__rejects_one_over_limit():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(9007199254740992)


def test_unhappy_5__rejects_far_over_limit():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(10**30)


def test_unhappy_5__rejects_large_negative():
    with pytest.raises(ValueError, match="milliseconds"):
        format_duration(-9007199254740991)


# @unhappy 6: Values that are not ints are rejected


def test_unhappy_6__rejects_fractional_float():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration(1.5)


def test_unhappy_6__rejects_whole_float():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration(5.0)


def test_unhappy_6__rejects_true():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration(True)


def test_unhappy_6__rejects_nan():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration(float("nan"))


def test_unhappy_6__rejects_infinity():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration(float("inf"))


def test_unhappy_6__rejects_numeric_string():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration("250")


def test_unhappy_6__rejects_false():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration(False)


def test_unhappy_6__rejects_none():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration(None)


def test_unhappy_6__rejects_whole_float_zero():
    with pytest.raises(TypeError, match="milliseconds"):
        format_duration(0.0)
