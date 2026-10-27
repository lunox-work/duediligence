"""Hidden cases derived from the four validity rules in the docstring."""

import unittest

from src.solution import valid_date


class TestValidDatePrivate(unittest.TestCase):
    # Rule 1 explicitly excludes the empty string.
    def test_empty_string(self):
        self.assertEqual(valid_date(""), False)

    # 13 is immediately above the inclusive upper month bound 12.
    def test_month_thirteen(self):
        self.assertEqual(valid_date("13-01-2031"), False)

    # A four-digit year with leading zeros satisfies yyyy; January admits 31.
    def test_year_with_leading_zeros(self):
        self.assertEqual(valid_date("01-31-0001"), True)

    # A four-digit year satisfies yyyy; no narrower year range is specified.
    def test_large_four_digit_year(self):
        self.assertEqual(valid_date("12-31-9999"), True)

    # Extends public test_example_march_date.
    # March admits day 7; the year is different from the examples.
    def test_ordinary_march_date(self):
        self.assertEqual(valid_date("03-07-1986"), True)

    # Extends public test_example_month_fifteen.
    # 99 exceeds the maximum month 12, even though day 1 is valid.
    def test_large_month(self):
        self.assertEqual(valid_date("99-01-2011"), False)

    # Extends public test_example_zero_day.
    # Day 0 is below 1 even when it has two digits.
    def test_padded_zero_day_in_october(self):
        self.assertEqual(valid_date("10-00-2037"), False)

    # Extends public test_example_june_date.
    # June admits day 23; swapping month and day would incorrectly reject it.
    def test_june_day_greater_than_twelve(self):
        self.assertEqual(valid_date("06-23-1998"), True)

    # Extends public test_example_slash_separators.
    # Slashes do not satisfy the required hyphen separators.
    def test_slashes_with_other_fields(self):
        self.assertEqual(valid_date("12/21/1998"), False)

    # Extends public test_empty_string.
    # A nonempty space still lacks all three required date fields.
    def test_space_is_not_a_date(self):
        self.assertEqual(valid_date(" "), False)

    # Extends public test_january_last_day.
    # january has an inclusive maximum of 31; the year does not change it.
    def test_january_last_day_other_year(self):
        self.assertEqual(valid_date("01-31-1981"), True)

    # Extends public test_march_last_day.
    # march has an inclusive maximum of 31; the year does not change it.
    def test_march_last_day_other_year(self):
        self.assertEqual(valid_date("03-31-1983"), True)

    # Extends public test_may_last_day.
    # may has an inclusive maximum of 31; the year does not change it.
    def test_may_last_day_other_year(self):
        self.assertEqual(valid_date("05-31-1985"), True)

    # Extends public test_july_last_day.
    # july has an inclusive maximum of 31; the year does not change it.
    def test_july_last_day_other_year(self):
        self.assertEqual(valid_date("07-31-1987"), True)

    # Extends public test_august_last_day.
    # august has an inclusive maximum of 31; the year does not change it.
    def test_august_last_day_other_year(self):
        self.assertEqual(valid_date("08-31-1988"), True)

    # Extends public test_october_last_day.
    # october has an inclusive maximum of 31; the year does not change it.
    def test_october_last_day_other_year(self):
        self.assertEqual(valid_date("10-31-1990"), True)

    # Extends public test_december_last_day.
    # december has an inclusive maximum of 31; the year does not change it.
    def test_december_last_day_other_year(self):
        self.assertEqual(valid_date("12-31-1992"), True)

    # Extends public test_january_day_above_maximum.
    # Day 99 exceeds 31; rejecting only day 32 would miss this.
    def test_january_day_ninety_nine(self):
        self.assertEqual(valid_date("01-99-2031"), False)

    # Extends public test_march_day_above_maximum.
    # Day 99 exceeds 31; rejecting only day 32 would miss this.
    def test_march_day_ninety_nine(self):
        self.assertEqual(valid_date("03-99-2033"), False)

    # Extends public test_may_day_above_maximum.
    # Day 99 exceeds 31; rejecting only day 32 would miss this.
    def test_may_day_ninety_nine(self):
        self.assertEqual(valid_date("05-99-2035"), False)

    # Extends public test_july_day_above_maximum.
    # Day 99 exceeds 31; rejecting only day 32 would miss this.
    def test_july_day_ninety_nine(self):
        self.assertEqual(valid_date("07-99-2037"), False)

    # Extends public test_august_day_above_maximum.
    # Day 99 exceeds 31; rejecting only day 32 would miss this.
    def test_august_day_ninety_nine(self):
        self.assertEqual(valid_date("08-99-2038"), False)

    # Extends public test_october_day_above_maximum.
    # Day 99 exceeds 31; rejecting only day 32 would miss this.
    def test_october_day_ninety_nine(self):
        self.assertEqual(valid_date("10-99-2040"), False)

    # Extends public test_december_day_above_maximum.
    # Day 99 exceeds 31; rejecting only day 32 would miss this.
    def test_december_day_ninety_nine(self):
        self.assertEqual(valid_date("12-99-2042"), False)

    # Extends public test_april_last_day.
    # april has an inclusive maximum of 30; the year does not change it.
    def test_april_last_day_other_year(self):
        self.assertEqual(valid_date("04-30-1994"), True)

    # Extends public test_june_last_day.
    # june has an inclusive maximum of 30; the year does not change it.
    def test_june_last_day_other_year(self):
        self.assertEqual(valid_date("06-30-1996"), True)

    # Extends public test_september_last_day.
    # september has an inclusive maximum of 30; the year does not change it.
    def test_september_last_day_other_year(self):
        self.assertEqual(valid_date("09-30-1999"), True)

    # Extends public test_november_last_day.
    # november has an inclusive maximum of 30; the year does not change it.
    def test_november_last_day_other_year(self):
        self.assertEqual(valid_date("11-30-2001"), True)

    # Extends public test_april_day_above_maximum.
    # Day 99 exceeds 30; rejecting only day 31 would miss this.
    def test_april_day_ninety_nine(self):
        self.assertEqual(valid_date("04-99-2034"), False)

    # Extends public test_june_day_above_maximum.
    # Day 99 exceeds 30; rejecting only day 31 would miss this.
    def test_june_day_ninety_nine(self):
        self.assertEqual(valid_date("06-99-2036"), False)

    # Extends public test_september_day_above_maximum.
    # Day 99 exceeds 30; rejecting only day 31 would miss this.
    def test_september_day_ninety_nine(self):
        self.assertEqual(valid_date("09-99-2039"), False)

    # Extends public test_november_day_above_maximum.
    # Day 99 exceeds 30; rejecting only day 31 would miss this.
    def test_november_day_ninety_nine(self):
        self.assertEqual(valid_date("11-99-2041"), False)

    # Extends public test_february_typical_day.
    # 28 lies within February's inclusive range 1 through 29.
    def test_february_day_twenty_eight(self):
        self.assertEqual(valid_date("02-28-2007"), True)

    # Extends public test_february_last_day.
    # 29 is the inclusive February maximum.
    def test_february_twenty_nine_other_year(self):
        self.assertEqual(valid_date("02-29-2004"), True)

    # Extends public test_february_last_day_in_non_leap_year.
    # The rule gives February 29 days without a leap-year condition, including 1900.
    def test_february_twenty_nine_in_1900(self):
        self.assertEqual(valid_date("02-29-1900"), True)

    # Extends public test_february_day_above_maximum.
    # 31 exceeds February's maximum 29; rejecting only 30 would miss this.
    def test_february_day_thirty_one(self):
        self.assertEqual(valid_date("02-31-2004"), False)

    # Extends public test_first_day_of_thirty_one_day_month.
    # December also has the inclusive lower day bound 1.
    def test_december_first_day(self):
        self.assertEqual(valid_date("12-01-1998"), True)

    # Extends public test_zero_day_of_thirty_one_day_month.
    # July also excludes day 0.
    def test_july_zero_day(self):
        self.assertEqual(valid_date("07-00-2011"), False)

    # Extends public test_first_day_of_thirty_day_month.
    # November also has the inclusive lower day bound 1.
    def test_november_first_day(self):
        self.assertEqual(valid_date("11-01-2017"), True)

    # Extends public test_zero_day_of_thirty_day_month.
    # September also excludes day 0.
    def test_september_zero_day(self):
        self.assertEqual(valid_date("09-00-1998"), False)

    # Extends public test_first_day_of_february.
    # February's lower bound remains 1 in another year.
    def test_february_first_day_other_year(self):
        self.assertEqual(valid_date("02-01-1987"), True)

    # Extends public test_zero_day_of_february.
    # February's lower bound excludes 0 in another year.
    def test_february_zero_day_other_year(self):
        self.assertEqual(valid_date("02-00-2024"), False)

    # Extends public test_month_below_minimum.
    # Month 0 is invalid even with a day valid in a 31-day month.
    def test_zero_month_with_day_thirty_one(self):
        self.assertEqual(valid_date("00-31-2014"), False)

    # Extends public test_month_above_maximum.
    # Month 14 exceeds 12; rejecting only 13 or 15 would miss this.
    def test_month_fourteen(self):
        self.assertEqual(valid_date("14-01-2014"), False)

    # Extends public test_year_first_format.
    # A four-digit year in the first field is not mm-dd-yyyy.
    def test_year_first_other_values(self):
        self.assertEqual(valid_date("1998-12-21"), False)

    # Extends public test_missing_year.
    # An empty third field is still a missing yyyy field.
    def test_empty_year_field(self):
        self.assertEqual(valid_date("12-21-"), False)

    # Extends public test_extra_date_field.
    # Six fields violate the required three-field format.
    def test_two_dates_concatenated(self):
        self.assertEqual(valid_date("12-21-1998-12-21-1998"), False)

    # Every month admits day 1, the inclusive lower bound.
    def test_january_first_day(self):
        self.assertEqual(valid_date("01-01-2031"), True)

    # Every month excludes day 0, which is below the lower bound 1.
    def test_january_zero_day(self):
        self.assertEqual(valid_date("01-00-2031"), False)

    # The inclusive maximum for january is 31; 32 is one too high.
    def test_january_immediately_above_limit(self):
        self.assertEqual(valid_date("01-32-2031"), False)

    # The inclusive maximum for february is 29; 30 is one too high.
    def test_february_immediately_above_limit(self):
        self.assertEqual(valid_date("02-30-2031"), False)

    # Every month admits day 1, the inclusive lower bound.
    def test_march_first_day(self):
        self.assertEqual(valid_date("03-01-2031"), True)

    # Every month excludes day 0, which is below the lower bound 1.
    def test_march_zero_day(self):
        self.assertEqual(valid_date("03-00-2031"), False)

    # The inclusive maximum for march is 31; 32 is one too high.
    def test_march_immediately_above_limit(self):
        self.assertEqual(valid_date("03-32-2031"), False)

    # Every month admits day 1, the inclusive lower bound.
    def test_april_first_day(self):
        self.assertEqual(valid_date("04-01-2031"), True)

    # Every month excludes day 0, which is below the lower bound 1.
    def test_april_zero_day(self):
        self.assertEqual(valid_date("04-00-2031"), False)

    # The inclusive maximum for april is 30; 31 is one too high.
    def test_april_immediately_above_limit(self):
        self.assertEqual(valid_date("04-31-2031"), False)

    # Every month admits day 1, the inclusive lower bound.
    def test_may_first_day(self):
        self.assertEqual(valid_date("05-01-2031"), True)

    # Every month excludes day 0, which is below the lower bound 1.
    def test_may_zero_day(self):
        self.assertEqual(valid_date("05-00-2031"), False)

    # The inclusive maximum for may is 31; 32 is one too high.
    def test_may_immediately_above_limit(self):
        self.assertEqual(valid_date("05-32-2031"), False)

    # Every month admits day 1, the inclusive lower bound.
    def test_june_first_day(self):
        self.assertEqual(valid_date("06-01-2031"), True)

    # Every month excludes day 0, which is below the lower bound 1.
    def test_june_zero_day(self):
        self.assertEqual(valid_date("06-00-2031"), False)

    # The inclusive maximum for june is 30; 31 is one too high.
    def test_june_immediately_above_limit(self):
        self.assertEqual(valid_date("06-31-2031"), False)

    # Every month admits day 1, the inclusive lower bound.
    def test_july_first_day(self):
        self.assertEqual(valid_date("07-01-2031"), True)

    # The inclusive maximum for july is 31; 32 is one too high.
    def test_july_immediately_above_limit(self):
        self.assertEqual(valid_date("07-32-2031"), False)

    # Every month admits day 1, the inclusive lower bound.
    def test_august_first_day(self):
        self.assertEqual(valid_date("08-01-2031"), True)

    # Every month excludes day 0, which is below the lower bound 1.
    def test_august_zero_day(self):
        self.assertEqual(valid_date("08-00-2031"), False)

    # The inclusive maximum for august is 31; 32 is one too high.
    def test_august_immediately_above_limit(self):
        self.assertEqual(valid_date("08-32-2031"), False)

    # Every month admits day 1, the inclusive lower bound.
    def test_september_first_day(self):
        self.assertEqual(valid_date("09-01-2031"), True)

    # The inclusive maximum for september is 30; 31 is one too high.
    def test_september_immediately_above_limit(self):
        self.assertEqual(valid_date("09-31-2031"), False)

    # Every month admits day 1, the inclusive lower bound.
    def test_october_first_day(self):
        self.assertEqual(valid_date("10-01-2031"), True)

    # The inclusive maximum for october is 31; 32 is one too high.
    def test_october_immediately_above_limit(self):
        self.assertEqual(valid_date("10-32-2031"), False)

    # Every month excludes day 0, which is below the lower bound 1.
    def test_november_zero_day(self):
        self.assertEqual(valid_date("11-00-2031"), False)

    # The inclusive maximum for november is 30; 31 is one too high.
    def test_november_immediately_above_limit(self):
        self.assertEqual(valid_date("11-31-2031"), False)

    # Every month excludes day 0, which is below the lower bound 1.
    def test_december_zero_day(self):
        self.assertEqual(valid_date("12-00-2031"), False)

    # The inclusive maximum for december is 31; 32 is one too high.
    def test_december_immediately_above_limit(self):
        self.assertEqual(valid_date("12-32-2031"), False)

    # August admits 30 as well as 31; its rule is a range, not just endpoints.
    def test_thirty_one_day_month_penultimate(self):
        self.assertEqual(valid_date("08-30-2013"), True)

    # September admits 29 as well as 30; its rule is a range, not just endpoints.
    def test_thirty_day_month_penultimate(self):
        self.assertEqual(valid_date("09-29-2013"), True)

    # Day 2 lies strictly between February's bounds 1 and 29.
    def test_february_small_interior_day(self):
        self.assertEqual(valid_date("02-02-2013"), True)

    # Repeated numeric fields are permitted: month 11 and day 11 satisfy the rules.
    def test_same_month_and_day(self):
        self.assertEqual(valid_date("11-11-2011"), True)

    # Month 12 is inclusive, and December admits day 2.
    def test_upper_month_with_small_day(self):
        self.assertEqual(valid_date("12-02-2002"), True)

    # A negative month is below 1 and also violates mm-dd-yyyy.
    def test_negative_month(self):
        self.assertEqual(valid_date("-1-15-2023"), False)

    # A negative day is below 1 and also violates mm-dd-yyyy.
    def test_negative_day(self):
        self.assertEqual(valid_date("05--1-2023"), False)

    # Month 21 exceeds 12; interpreting this as day-month-year would be wrong.
    def test_month_twenty_one_day_twelve(self):
        self.assertEqual(valid_date("21-12-1998"), False)

    # One separator contains none of the three required numeric fields.
    def test_only_separator(self):
        self.assertEqual(valid_date("-"), False)

    # A single digit cannot supply mm-dd-yyyy.
    def test_only_one_digit(self):
        self.assertEqual(valid_date("7"), False)

    # A year alone lacks the month, day, and separators.
    def test_only_year(self):
        self.assertEqual(valid_date("2023"), False)

    # Three empty fields do not supply a date.
    def test_only_separators(self):
        self.assertEqual(valid_date("--"), False)

    # The required mm field is empty.
    def test_empty_month(self):
        self.assertEqual(valid_date("-15-2023"), False)

    # The required dd field is empty.
    def test_empty_day(self):
        self.assertEqual(valid_date("05--2023"), False)

    # Two fields cannot supply mm-dd-yyyy.
    def test_missing_month_and_separator(self):
        self.assertEqual(valid_date("15-2023"), False)

    # Dots do not match the specified hyphens.
    def test_dotted_separators(self):
        self.assertEqual(valid_date("05.15.2023"), False)

    # Both separators must be hyphens.
    def test_mixed_separators(self):
        self.assertEqual(valid_date("05-15/2023"), False)

    # The required two hyphens are absent.
    def test_no_separators(self):
        self.assertEqual(valid_date("05152023"), False)

    # A letter is not part of a numeric month.
    def test_letter_in_month(self):
        self.assertEqual(valid_date("0a-15-2023"), False)

    # A letter is not part of a numeric day.
    def test_letter_in_day(self):
        self.assertEqual(valid_date("05-1a-2023"), False)

    # The yyyy field must contain year digits.
    def test_letter_in_year(self):
        self.assertEqual(valid_date("05-15-20a3"), False)

    # The mm field requires two digits.
    def test_one_digit_month(self):
        self.assertEqual(valid_date("5-15-2023"), False)

    # The dd field requires two digits.
    def test_one_digit_day(self):
        self.assertEqual(valid_date("05-5-2023"), False)

    # A three-digit month does not match mm.
    def test_three_digit_month(self):
        self.assertEqual(valid_date("005-15-2023"), False)

    # A three-digit day does not match dd.
    def test_three_digit_day(self):
        self.assertEqual(valid_date("05-015-2023"), False)

    # A two-digit year does not match yyyy.
    def test_two_digit_year(self):
        self.assertEqual(valid_date("05-15-23"), False)

    # A five-digit year does not match yyyy.
    def test_five_digit_year(self):
        self.assertEqual(valid_date("05-15-20230"), False)

    # A leading space lies outside the required date format.
    def test_leading_space(self):
        self.assertEqual(valid_date(" 05-15-2023"), False)

    # A trailing space lies outside the required date format.
    def test_trailing_space(self):
        self.assertEqual(valid_date("05-15-2023 "), False)

    # A trailing newline lies outside the required date format.
    def test_trailing_newline(self):
        self.assertEqual(valid_date("05-15-2023\n"), False)

    # The required format ends after yyyy and contains no time.
    def test_time_suffix(self):
        self.assertEqual(valid_date("05-15-2023T00:00:00"), False)

    # A trailing hyphen introduces an extra field outside mm-dd-yyyy.
    def test_empty_fourth_field(self):
        self.assertEqual(valid_date("05-15-2023-"), False)

    # A leading hyphen introduces an extra field outside mm-dd-yyyy.
    def test_extra_leading_hyphen(self):
        self.assertEqual(valid_date("-05-15-2023"), False)

    # One hundred fields cannot match the required three-field format.
    def test_many_extra_fields(self):
        self.assertEqual(valid_date("05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05-05"), False)


